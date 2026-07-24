import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { catchError, forkJoin, of } from 'rxjs';

import type { CursorPage } from '../../core/api/models';
import { type CsvColumn, downloadCsv } from '../../core/ui/csv.util';
import { SubscriptionsService } from './subscriptions.service';
import type { SubscriptionPurchaseRequestResponse } from './subscriptions.models';

const PAGE_LIMIT = 20;

const EMPTY_PAGE: CursorPage<SubscriptionPurchaseRequestResponse> = {
  items: [],
  nextCursor: null,
  hasMore: false,
};

const CSV_COLUMNS: readonly CsvColumn<SubscriptionPurchaseRequestResponse>[] = [
  { key: 'requester', label: 'Requester', value: (r) => r.requester.displayName },
  { key: 'plan', label: 'Plan', value: (r) => r.plan.displayName },
  { key: 'status', label: 'Status', value: (r) => r.status },
  { key: 'requestedAmount', label: 'Requested amount', value: (r) => r.requestedAmount },
  { key: 'amountReceived', label: 'Amount received', value: (r) => r.amountReceived ?? '' },
  {
    key: 'providerReference',
    label: 'Provider reference',
    value: (r) => r.providerReference ?? '',
  },
  { key: 'decider', label: 'Decided by', value: (r) => r.decider?.displayName ?? '' },
  { key: 'decidedAt', label: 'Decided at', value: (r) => r.decidedAt ?? '' },
];

/**
 * Combined accepted+rejected view. The admin list endpoint only accepts a
 * single `status` value, so this merges two independently cursor-paginated
 * streams (one per status) and re-sorts the accumulated set by `decidedAt`
 * on every fetch — simplest way to get one time-ordered "decisions" table
 * without a new backend status-array param.
 */
@Component({
  selector: 'app-decisions-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="toolbar">
        <button class="btn btn--sm" type="button" (click)="fetch()">Refresh</button>
        <div class="toolbar__spacer"></div>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="decisions().length === 0"
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
      } @else if (decisions().length === 0) {
        <div class="state state--col"><p class="state__empty">No decided requests yet.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Requester</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Requested / received</th>
                <th>Provider reference</th>
                <th>Decided by</th>
                <th>Decided at</th>
              </tr>
            </thead>
            <tbody>
              @for (req of decisions(); track req.id) {
                <tr>
                  <td>
                    <a class="table__link" [routerLink]="['/users', req.requester.id]">
                      {{ req.requester.displayName }}
                    </a>
                  </td>
                  <td>{{ req.plan.displayName }}</td>
                  <td>
                    <span class="badge badge--{{ req.status === 'accepted' ? 'ok' : 'muted' }}">
                      {{ humanize(req.status) }}
                    </span>
                  </td>
                  <td>
                    {{ req.requestedAmount.toLocaleString() }}
                    /
                    @if (isAmountMismatch(req)) {
                      <span class="badge badge--warn">{{
                        req.amountReceived?.toLocaleString()
                      }}</span>
                    } @else {
                      {{ req.amountReceived !== null ? req.amountReceived.toLocaleString() : '—' }}
                    }
                  </td>
                  <td class="mono">{{ req.providerReference || '—' }}</td>
                  <td>{{ req.decider?.displayName || '—' }}</td>
                  <td>{{ formatDate(req.decidedAt) }}</td>
                </tr>
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
export class DecisionsListComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly decisions = signal<SubscriptionPurchaseRequestResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);

  private _acceptedCursor: string | undefined = undefined;
  private _acceptedHasMore = true;
  private _rejectedCursor: string | undefined = undefined;
  private _rejectedHasMore = true;

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

  protected isAmountMismatch(req: SubscriptionPurchaseRequestResponse): boolean {
    return req.amountReceived !== null && req.amountReceived !== req.requestedAmount;
  }

  protected exportCsv(): void {
    downloadCsv('subscription-decisions.csv', CSV_COLUMNS, this.decisions());
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._acceptedCursor = undefined;
    this._rejectedCursor = undefined;
    this._acceptedHasMore = true;
    this._rejectedHasMore = true;
    this._loadNextBatch([]);
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }
    this.loadingMore.set(true);
    this._loadNextBatch(this.decisions());
  }

  private _loadNextBatch(existing: SubscriptionPurchaseRequestResponse[]): void {
    forkJoin({
      accepted: this._acceptedHasMore
        ? this._service.listRequests({
            status: 'accepted',
            limit: PAGE_LIMIT,
            cursor: this._acceptedCursor,
          })
        : of(EMPTY_PAGE),
      rejected: this._rejectedHasMore
        ? this._service.listRequests({
            status: 'rejected',
            limit: PAGE_LIMIT,
            cursor: this._rejectedCursor,
          })
        : of(EMPTY_PAGE),
    })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (result === null) {
          this.error.set('Could not load decided requests.');
          return;
        }
        this._acceptedCursor = result.accepted.nextCursor ?? undefined;
        this._acceptedHasMore = result.accepted.hasMore;
        this._rejectedCursor = result.rejected.nextCursor ?? undefined;
        this._rejectedHasMore = result.rejected.hasMore;

        const merged = [...existing, ...result.accepted.items, ...result.rejected.items].sort(
          (a, b) => this._decidedAtMs(b) - this._decidedAtMs(a),
        );
        this.decisions.set(merged);
        this.hasMore.set(this._acceptedHasMore || this._rejectedHasMore);
      });
  }

  private _decidedAtMs(req: SubscriptionPurchaseRequestResponse): number {
    return req.decidedAt ? new Date(req.decidedAt).getTime() : 0;
  }
}
