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
import { Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { ConfirmService } from '../../core/ui/confirm.service';
import { NotificationService } from '../../core/ui/notification.service';
import { CampaignsService } from './campaigns.service';
import { CAMPAIGN_STATUSES, type CampaignResponse } from './campaigns.models';

@Component({
  selector: 'app-campaigns-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Campaigns</h1>
        <button class="btn btn--primary" type="button" (click)="create()">New campaign</button>
      </header>

      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search campaigns"
          placeholder="Search title…"
          style="max-width: 260px"
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
          @for (s of statuses; track s) {
            <option [value]="s">{{ humanize(s) }}</option>
          }
        </select>
        <button class="btn btn--sm" type="button" (click)="fetch()">Search</button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (campaigns().length === 0) {
        <div class="state state--col"><p class="state__empty">No campaigns yet.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Audience</th>
                <th class="table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (campaign of campaigns(); track campaign.id) {
                <tr>
                  <td>
                    <div class="table__name">{{ title(campaign) }}</div>
                    <div class="table__sub">Priority {{ campaign.priority }}</div>
                  </td>
                  <td>{{ humanize(campaign.kind) }}</td>
                  <td>
                    <span class="badge badge--{{ badgeClass(campaign.status) }}">
                      {{ humanize(campaign.status) }}
                    </span>
                  </td>
                  <td>{{ humanize(campaign.audience) }}</td>
                  <td class="table__actions-col">
                    <button class="btn btn--sm btn--ghost" type="button" (click)="edit(campaign)">
                      Edit
                    </button>
                    <button
                      class="btn btn--sm btn--ghost"
                      type="button"
                      (click)="engagement(campaign)"
                    >
                      Stats
                    </button>
                    <button
                      class="btn btn--sm btn--danger"
                      type="button"
                      [disabled]="deletingId() === campaign.id"
                      (click)="remove(campaign)"
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
    </section>
  `,
})
export class CampaignsListComponent implements OnInit {
  private readonly _service = inject(CampaignsService);
  private readonly _router = inject(Router);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = CAMPAIGN_STATUSES;
  protected readonly search = signal<string>('');
  protected readonly status = signal<string>('');
  protected readonly campaigns = signal<CampaignResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  public ngOnInit(): void {
    this.fetch();
  }

  protected title(campaign: CampaignResponse): string {
    return campaign.content?.vi?.title || campaign.content?.en?.title || '—';
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected badgeClass(status: string): string {
    if (status === 'active') {
      return 'ok';
    }
    return 'muted';
  }

  protected create(): void {
    void this._router.navigate(['/campaigns/new']);
  }

  protected edit(campaign: CampaignResponse): void {
    void this._router.navigate(['/campaigns', campaign.id, 'edit']);
  }

  protected engagement(campaign: CampaignResponse): void {
    void this._router.navigate(['/campaigns', campaign.id, 'engagement']);
  }

  protected async remove(campaign: CampaignResponse): Promise<void> {
    if (this.deletingId() !== null) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Delete campaign',
      message: 'Are you sure? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.deletingId.set(campaign.id);
    this._service
      .remove(campaign.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.campaigns.update((list) => list.filter((c) => c.id !== campaign.id));
          this.deletingId.set(null);
          this._notify.success('Campaign deleted.');
        },
        error: () => {
          this.deletingId.set(null);
          this._notify.error('Could not delete the campaign.');
        },
      });
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._service
      .list(this.status() || undefined, this.search().trim() || undefined)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (data === null) {
          this.error.set('Could not load campaigns.');
          return;
        }
        this.campaigns.set(data);
      });
  }
}
