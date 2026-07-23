import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { ConfirmService } from '../../core/ui/confirm.service';
import { NotificationService } from '../../core/ui/notification.service';
import { SubscriptionsService } from './subscriptions.service';
import { PLAN_STATUS_FILTERS, type PromoCodeResponse } from './subscriptions.models';

@Component({
  selector: 'app-promo-codes-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search promo codes"
          placeholder="Search promo codes…"
          style="max-width: 240px"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          (keyup.enter)="fetch()"
        />
        <select
          class="input"
          aria-label="Filter by status"
          style="max-width: 180px"
          [ngModel]="status()"
          (ngModelChange)="status.set($event); fetch()"
        >
          <option value="">All statuses</option>
          @for (s of statusFilters; track s) {
            <option [value]="s">{{ humanize(s) }}</option>
          }
        </select>
        <button class="btn btn--sm" type="button" (click)="fetch()">Search</button>
        <div class="toolbar__spacer"></div>
        <button class="btn btn--primary" type="button" (click)="create()">New promo code</button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (codes().length === 0) {
        <div class="state state--col"><p class="state__empty">No promo codes yet.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Valid from</th>
                <th>Valid until</th>
                <th>Status</th>
                <th class="table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (code of codes(); track code.id) {
                <tr>
                  <td>
                    <div class="table__name">{{ code.code }}</div>
                    <div class="table__sub">{{ code.name }}</div>
                  </td>
                  <td>{{ formatDate(code.validFrom) }}</td>
                  <td>{{ formatDate(code.validUntil) }}</td>
                  <td>
                    <span class="badge badge--{{ code.isActive ? 'ok' : 'muted' }}">
                      {{ code.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="table__actions-col">
                    <button class="btn btn--sm btn--ghost" type="button" (click)="edit(code)">
                      Edit
                    </button>
                    <button
                      class="btn btn--sm btn--danger"
                      type="button"
                      [disabled]="deletingId() === code.id"
                      (click)="remove(code)"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class PromoCodesListComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statusFilters = PLAN_STATUS_FILTERS;
  protected readonly search = signal<string>('');
  protected readonly status = signal<string>('');
  protected readonly codes = signal<PromoCodeResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  public ngOnInit(): void {
    this.fetch();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    return new Date(iso).toLocaleString();
  }

  protected create(): void {
    void this._router.navigate(['promo-codes', 'new'], { relativeTo: this._route.parent });
  }

  protected edit(code: PromoCodeResponse): void {
    void this._router.navigate(['promo-codes', code.id, 'edit'], {
      relativeTo: this._route.parent,
    });
  }

  protected async remove(code: PromoCodeResponse): Promise<void> {
    if (this.deletingId() !== null) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Delete promo code',
      message: `Delete “${code.code}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.deletingId.set(code.id);
    this._service
      .removePromoCode(code.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.codes.update((list) => list.filter((c) => c.id !== code.id));
          this.deletingId.set(null);
          this._notify.success('Promo code deleted.');
        },
        error: () => {
          this.deletingId.set(null);
          this._notify.error('Could not delete the promo code.');
        },
      });
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._service
      .listPromoCodes(this.status() || undefined, this.search().trim() || undefined)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (data === null) {
          this.error.set('Could not load promo codes.');
          return;
        }
        this.codes.set(data);
      });
  }
}
