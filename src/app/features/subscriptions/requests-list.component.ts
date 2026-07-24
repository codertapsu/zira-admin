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
import { RouterLink } from '@angular/router';

import { catchError, of } from 'rxjs';

import { type CsvColumn, downloadCsv } from '../../core/ui/csv.util';
import { ConfirmService } from '../../core/ui/confirm.service';
import { NotificationService } from '../../core/ui/notification.service';
import { fetchAllPages } from './paginate-all.util';
import { SubscriptionsService } from './subscriptions.service';
import {
  SUBSCRIPTION_PURCHASE_REQUEST_STATUSES,
  type SubscriptionPurchaseRequestResponse,
} from './subscriptions.models';

const PAGE_LIMIT = 20;
const PENDING_COUNT_CAP_PAGES = 10;

const CSV_COLUMNS: readonly CsvColumn<SubscriptionPurchaseRequestResponse>[] = [
  { key: 'requester', label: 'Requester', value: (r) => r.requester.displayName },
  { key: 'plan', label: 'Plan', value: (r) => r.plan.displayName },
  { key: 'purchaseCode', label: 'Purchase code', value: (r) => r.purchaseCode },
  { key: 'status', label: 'Status', value: (r) => r.status },
  { key: 'requestedAmount', label: 'Requested amount', value: (r) => r.requestedAmount },
  { key: 'amountReceived', label: 'Amount received', value: (r) => r.amountReceived ?? '' },
  {
    key: 'providerReference',
    label: 'Provider reference',
    value: (r) => r.providerReference ?? '',
  },
  { key: 'createdAt', label: 'Created at', value: (r) => r.createdAt },
];

@Component({
  selector: 'app-requests-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search purchase requests"
          placeholder="Search user or code…"
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
          @for (s of statuses; track s) {
            <option [value]="s">{{ humanize(s) }}</option>
          }
        </select>
        <button class="btn btn--sm" type="button" (click)="fetch()">Search</button>
        @if (pendingCount(); as count) {
          <span class="badge badge--warn">{{ count }} pending</span>
        }
        <div class="toolbar__spacer"></div>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="requests().length === 0"
          (click)="exportCsv()"
        >
          Export CSV
        </button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (requests().length === 0) {
        <div class="state state--col"><p class="state__empty">No purchase requests.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Requester</th>
                <th>Plan</th>
                <th>Code</th>
                <th>Amount</th>
                <th>Status</th>
                <th class="table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (req of requests(); track req.id) {
                <tr>
                  <td>
                    <a class="table__link table__name" [routerLink]="['/users', req.requester.id]">
                      {{ req.requester.displayName }}
                    </a>
                    <div class="table__sub">
                      {{ req.requester.email || req.requester.username || req.requester.id }}
                    </div>
                  </td>
                  <td>{{ req.plan.displayName }}</td>
                  <td class="mono">
                    {{ req.purchaseCode }}
                    <button
                      class="btn btn--ghost btn--sm"
                      type="button"
                      style="min-height: 24px; padding: 0 8px"
                      (click)="copy(req.purchaseCode)"
                    >
                      Copy
                    </button>
                  </td>
                  <td>{{ req.requestedAmount.toLocaleString() }} {{ req.requestedCurrency }}</td>
                  <td>
                    <span class="badge badge--{{ badgeClass(req.status) }}">
                      {{ humanize(req.status) }}
                    </span>
                  </td>
                  <td class="table__actions-col">
                    <button class="btn btn--sm btn--ghost" type="button" (click)="toggle(req)">
                      {{ expandedId() === req.id ? 'Hide' : 'View' }}
                    </button>
                    <button
                      class="btn btn--sm btn--danger"
                      type="button"
                      [disabled]="deletingId() === req.id"
                      (click)="remove(req)"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                @if (expandedId() === req.id) {
                  <tr>
                    <td colspan="6" style="background: var(--surface-2)">
                      <div class="detail" style="max-width: none">
                        <div class="kv">
                          <span class="kv__key">Requested duration</span>
                          <span class="kv__val">
                            {{ req.requestedDurationMonths ?? '—' }}
                          </span>
                          <span class="kv__key">Accepted duration</span>
                          <span class="kv__val">{{ req.acceptedDurationMonths ?? '—' }}</span>
                          <span class="kv__key">Provider</span>
                          <span class="kv__val">{{ req.provider }}</span>
                          <span class="kv__key">Provider reference</span>
                          <span class="kv__val">
                            {{ req.providerReference || '—' }}
                            @if (req.providerReference) {
                              <button
                                class="btn btn--ghost btn--sm"
                                type="button"
                                style="min-height: 24px; padding: 0 8px"
                                (click)="copy(req.providerReference!)"
                              >
                                Copy
                              </button>
                            }
                          </span>
                          <span class="kv__key">Amount received</span>
                          <span class="kv__val">
                            @if (isAmountMismatch(req)) {
                              <span class="badge badge--warn">
                                {{ req.amountReceived?.toLocaleString() }} (requested
                                {{ req.requestedAmount.toLocaleString() }})
                              </span>
                            } @else {
                              {{
                                req.amountReceived !== null
                                  ? req.amountReceived.toLocaleString()
                                  : '—'
                              }}
                            }
                          </span>
                          <span class="kv__key">Promo code</span>
                          <span class="kv__val">{{ req.promoCode || '—' }}</span>
                          <span class="kv__key">Requester note</span>
                          <span class="kv__val">{{ req.note || '—' }}</span>
                          <span class="kv__key">Decision note</span>
                          <span class="kv__val">{{ req.decisionNote || '—' }}</span>
                          <span class="kv__key">Decided by</span>
                          <span class="kv__val">{{ req.decider?.displayName || '—' }}</span>
                          <span class="kv__key">Decided at</span>
                          <span class="kv__val">{{ formatDate(req.decidedAt) }}</span>
                          <span class="kv__key">Created</span>
                          <span class="kv__val">{{ formatDate(req.createdAt) }}</span>
                        </div>

                        @if (req.status === 'pending') {
                          <div class="form-grid">
                            <div
                              class="card"
                              style="padding: 16px; display: flex; flex-direction: column; gap: 12px"
                            >
                              <p class="section-title">Accept</p>
                              <label class="field">
                                <span class="field__label">Duration months (1–120)</span>
                                <input
                                  class="input"
                                  type="number"
                                  min="1"
                                  max="120"
                                  placeholder="Defaults to plan duration"
                                  [ngModel]="acceptDuration()"
                                  (ngModelChange)="acceptDuration.set($event)"
                                />
                              </label>
                              <label class="field">
                                <span class="field__label">Amount received</span>
                                <input
                                  class="input"
                                  type="number"
                                  min="0"
                                  [ngModel]="acceptAmount()"
                                  (ngModelChange)="acceptAmount.set($event)"
                                />
                              </label>
                              <label class="field">
                                <span class="field__label">Provider reference</span>
                                <input
                                  class="input"
                                  [ngModel]="acceptReference()"
                                  (ngModelChange)="acceptReference.set($event)"
                                />
                              </label>
                              <label class="field">
                                <span class="field__label">Decision note</span>
                                <textarea
                                  class="input"
                                  [ngModel]="acceptNote()"
                                  (ngModelChange)="acceptNote.set($event)"
                                ></textarea>
                              </label>
                              <button
                                class="btn btn--primary btn--sm"
                                type="button"
                                [disabled]="deciding()"
                                (click)="accept(req)"
                              >
                                {{ deciding() ? 'Working…' : 'Accept request' }}
                              </button>
                            </div>

                            <div
                              class="card"
                              style="padding: 16px; display: flex; flex-direction: column; gap: 12px"
                            >
                              <p class="section-title">Reject</p>
                              <label class="field">
                                <span class="field__label">Decision note</span>
                                <textarea
                                  class="input"
                                  [ngModel]="rejectNote()"
                                  (ngModelChange)="rejectNote.set($event)"
                                ></textarea>
                              </label>
                              <button
                                class="btn btn--danger btn--sm"
                                type="button"
                                [disabled]="deciding()"
                                (click)="reject(req)"
                              >
                                {{ deciding() ? 'Working…' : 'Reject request' }}
                              </button>
                            </div>
                          </div>
                        } @else {
                          <p class="muted">
                            This request is {{ humanize(req.status) }} and can no longer be decided.
                          </p>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (hasMore()) {
          <div class="page__more">
            <button
              class="btn btn--sm"
              type="button"
              [disabled]="loadingMore()"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class RequestsListComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = SUBSCRIPTION_PURCHASE_REQUEST_STATUSES;
  protected readonly search = signal<string>('');
  protected readonly status = signal<string>('');
  protected readonly requests = signal<SubscriptionPurchaseRequestResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);
  protected readonly deletingId = signal<string | null>(null);

  private readonly _cursor = signal<string | null>(null);
  protected readonly expandedId = signal<string | null>(null);
  protected readonly deciding = signal<boolean>(false);

  protected readonly acceptDuration = signal<number | null>(null);
  protected readonly acceptAmount = signal<number | null>(null);
  protected readonly acceptReference = signal<string>('');
  protected readonly acceptNote = signal<string>('');
  protected readonly rejectNote = signal<string>('');

  protected readonly pendingCount = signal<number | null>(null);

  public ngOnInit(): void {
    this.fetch();
    this._refreshPendingCount();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected badgeClass(status: string): string {
    if (status === 'accepted') {
      return 'ok';
    }
    return 'muted';
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    return new Date(iso).toLocaleString();
  }

  protected isAmountMismatch(req: SubscriptionPurchaseRequestResponse): boolean {
    return req.amountReceived !== null && req.amountReceived !== req.requestedAmount;
  }

  protected exportCsv(): void {
    downloadCsv('purchase-requests.csv', CSV_COLUMNS, this.requests());
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this._notify.success('Copied to clipboard.');
    } catch {
      this._notify.error('Could not copy to clipboard.');
    }
  }

  protected toggle(req: SubscriptionPurchaseRequestResponse): void {
    if (this.expandedId() === req.id) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(req.id);
    this.acceptDuration.set(null);
    this.acceptAmount.set(null);
    this.acceptReference.set('');
    this.acceptNote.set('');
    this.rejectNote.set('');
  }

  protected accept(req: SubscriptionPurchaseRequestResponse): void {
    if (this.deciding()) {
      return;
    }
    const duration = this.acceptDuration();
    if (
      duration !== null &&
      (!Number.isInteger(Number(duration)) || duration < 1 || duration > 120)
    ) {
      this._notify.error('Duration months must be between 1 and 120.');
      return;
    }
    const amount = this.acceptAmount();
    this.deciding.set(true);
    this._service
      .acceptRequest(req.id, {
        durationMonths: duration === null ? undefined : Number(duration),
        amountReceived: amount === null ? undefined : Number(amount),
        providerReference: this.acceptReference().trim() || undefined,
        decisionNote: this.acceptNote().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this.deciding.set(false);
          this._replace(updated);
          this._notify.success('Request accepted.');
          this._refreshPendingCount();
        },
        error: () => {
          this.deciding.set(false);
          this._notify.error('Could not accept the request.');
        },
      });
  }

  protected reject(req: SubscriptionPurchaseRequestResponse): void {
    if (this.deciding()) {
      return;
    }
    this.deciding.set(true);
    this._service
      .rejectRequest(req.id, { decisionNote: this.rejectNote().trim() || undefined })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this.deciding.set(false);
          this._replace(updated);
          this._notify.success('Request rejected.');
          this._refreshPendingCount();
        },
        error: () => {
          this.deciding.set(false);
          this._notify.error('Could not reject the request.');
        },
      });
  }

  protected async remove(req: SubscriptionPurchaseRequestResponse): Promise<void> {
    if (this.deletingId() !== null) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Delete request',
      message: `Delete purchase request ${req.purchaseCode}?`,
      confirmLabel: 'Delete',
      danger: true,
      consequence:
        'This permanently deletes the payment record; the issued subscription is NOT reverted.',
      requirePhrase: req.purchaseCode,
    });
    if (!confirmed) {
      return;
    }
    this.deletingId.set(req.id);
    this._service
      .removeRequest(req.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.requests.update((list) => list.filter((r) => r.id !== req.id));
          if (this.expandedId() === req.id) {
            this.expandedId.set(null);
          }
          this.deletingId.set(null);
          this._notify.success('Request deleted.');
          this._refreshPendingCount();
        },
        error: () => {
          this.deletingId.set(null);
          this._notify.error('Could not delete the request.');
        },
      });
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.expandedId.set(null);
    this._cursor.set(null);
    this._service
      .listRequests({
        status: this.status() || undefined,
        search: this.search().trim() || undefined,
        limit: PAGE_LIMIT,
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.loading.set(false);
        if (page === null) {
          this.error.set('Could not load purchase requests.');
          return;
        }
        this.requests.set(page.items);
        this._cursor.set(page.nextCursor);
        this.hasMore.set(page.hasMore);
      });
  }

  protected loadMore(): void {
    const cursor = this._cursor();
    if (!cursor || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this._service
      .listRequests({
        status: this.status() || undefined,
        search: this.search().trim() || undefined,
        limit: PAGE_LIMIT,
        cursor,
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.loadingMore.set(false);
        if (page === null) {
          this._notify.error('Could not load more requests.');
          return;
        }
        this.requests.update((list) => [...list, ...page.items]);
        this._cursor.set(page.nextCursor);
        this.hasMore.set(page.hasMore);
      });
  }

  private _refreshPendingCount(): void {
    fetchAllPages<SubscriptionPurchaseRequestResponse>(
      (cursor) => this._service.listRequests({ status: 'pending', limit: 100, cursor }),
      PENDING_COUNT_CAP_PAGES,
    )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((items) => {
        if (items !== null) {
          this.pendingCount.set(items.length);
        }
      });
  }

  private _replace(updated: SubscriptionPurchaseRequestResponse): void {
    this.requests.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
  }
}
