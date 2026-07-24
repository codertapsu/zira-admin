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
import { PLAN_STATUS_FILTERS, type SubscriptionPlanResponse } from './subscriptions.models';

@Component({
  selector: 'app-plans-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search plans"
          placeholder="Search plans…"
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
        <button class="btn btn--primary" type="button" (click)="create()">New plan</button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (plans().length === 0) {
        <div class="state state--col"><p class="state__empty">No plans yet.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Duration</th>
                <th>Status</th>
                <th class="table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (plan of plans(); track plan.id) {
                <tr>
                  <td>
                    <div class="table__name">{{ plan.displayName }}</div>
                    <div class="table__sub">{{ plan.planCode }} · sort {{ plan.sortOrder }}</div>
                  </td>
                  <td>{{ formatPrice(plan) }}</td>
                  <td>{{ formatDuration(plan.defaultDurationMonths) }}</td>
                  <td>
                    <span class="badge badge--{{ plan.isActive ? 'ok' : 'muted' }}">
                      {{ plan.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="table__actions-col">
                    <button class="btn btn--sm btn--ghost" type="button" (click)="edit(plan)">
                      Edit
                    </button>
                    <button
                      class="btn btn--sm btn--danger"
                      type="button"
                      [disabled]="deletingId() === plan.id"
                      (click)="remove(plan)"
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
export class PlansListComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statusFilters = PLAN_STATUS_FILTERS;
  protected readonly search = signal<string>('');
  protected readonly status = signal<string>('');
  protected readonly plans = signal<SubscriptionPlanResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  public ngOnInit(): void {
    this.fetch();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatPrice(plan: SubscriptionPlanResponse): string {
    return `${plan.priceAmount.toLocaleString()} ${plan.priceCurrency}`;
  }

  protected formatDuration(months: number | null): string {
    if (months === null) {
      return '—';
    }
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  protected create(): void {
    void this._router.navigate(['plans', 'new'], { relativeTo: this._route.parent });
  }

  protected edit(plan: SubscriptionPlanResponse): void {
    void this._router.navigate(['plans', plan.id, 'edit'], { relativeTo: this._route.parent });
  }

  protected async remove(plan: SubscriptionPlanResponse): Promise<void> {
    if (this.deletingId() !== null) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Delete plan',
      message: `Delete “${plan.displayName}”?`,
      confirmLabel: 'Delete',
      danger: true,
      consequence:
        'Subscribers already on this plan keep the stale plan code; new purchases can no longer select it.',
      requirePhrase: plan.planCode,
    });
    if (!confirmed) {
      return;
    }
    this.deletingId.set(plan.id);
    this._service
      .removePlan(plan.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.plans.update((list) => list.filter((p) => p.id !== plan.id));
          this.deletingId.set(null);
          this._notify.success('Plan deleted.');
        },
        error: () => {
          this.deletingId.set(null);
          this._notify.error('Could not delete the plan. It may be in use by a subscription.');
        },
      });
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._service
      .listPlans(this.status() || undefined, this.search().trim() || undefined)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (data === null) {
          this.error.set('Could not load plans.');
          return;
        }
        this.plans.set(data);
      });
  }
}
