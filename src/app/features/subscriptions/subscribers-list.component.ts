import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { fetchAllPages } from './paginate-all.util';
import { SubscriptionsService } from './subscriptions.service';
import {
  type AdminUserSubscriptionResponse,
  type SubscriptionPlanResponse,
  type UserSubscriptionListQuery,
  USER_SUBSCRIPTION_STATUSES,
} from './subscriptions.models';

const PAGE_LIMIT = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

interface PlanStat {
  readonly planCode: string;
  readonly displayName: string;
  readonly count: number;
}

const CSV_COLUMNS: readonly CsvColumn<AdminUserSubscriptionResponse>[] = [
  { key: 'user', label: 'User', value: (r) => r.user.displayName },
  { key: 'email', label: 'Email', value: (r) => r.user.email ?? '' },
  { key: 'username', label: 'Username', value: (r) => r.user.username ?? '' },
  { key: 'planCode', label: 'Plan code', value: (r) => r.planCode },
  { key: 'status', label: 'Status', value: (r) => r.status },
  { key: 'startedAt', label: 'Started at', value: (r) => r.startedAt },
  { key: 'endedAt', label: 'Expires at', value: (r) => r.endedAt ?? '' },
];

@Component({
  selector: 'app-subscribers-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page">
      @if (planStatsError(); as message) {
        <p class="state__error">{{ message }}</p>
      } @else if (planStats().length > 0 || planStatsLoading()) {
        <div class="stat-grid">
          @for (tile of planStats(); track tile.planCode) {
            <div class="stat">
              <div class="stat__label">{{ tile.displayName }}</div>
              <div class="stat__value">{{ tile.count }}</div>
              <div class="stat__sub">active</div>
            </div>
          }
          @if (planStatsLoading()) {
            <div class="stat"><span class="spinner"></span></div>
          }
        </div>
      }

      <div class="form-grid">
        <div class="card" style="padding: 16px">
          <p class="section-title">Expiring within 14 days</p>
          @if (expiringLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (expiringSoon().length === 0) {
            <p class="muted">Nothing expiring this soon.</p>
          } @else {
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px">
              @for (row of expiringSoon(); track row.id) {
                <div style="display: flex; justify-content: space-between; gap: 12px">
                  <a class="table__link" [routerLink]="['/users', row.user.id]">
                    {{ row.user.displayName }}
                  </a>
                  <span class="badge badge--warn">{{ formatDate(row.endedAt) }}</span>
                </div>
              }
            </div>
          }
        </div>

        <div class="card" style="padding: 16px">
          <p class="section-title">Expiring in 15–30 days</p>
          @if (expiringLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (expiringLater().length === 0) {
            <p class="muted">Nothing in this window.</p>
          } @else {
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px">
              @for (row of expiringLater(); track row.id) {
                <div style="display: flex; justify-content: space-between; gap: 12px">
                  <a class="table__link" [routerLink]="['/users', row.user.id]">
                    {{ row.user.displayName }}
                  </a>
                  <span class="muted">{{ formatDate(row.endedAt) }}</span>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search subscribers"
          placeholder="Search user…"
          style="max-width: 220px"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          (keyup.enter)="fetch()"
        />
        <select
          class="input"
          aria-label="Filter by status"
          style="max-width: 160px"
          [ngModel]="status()"
          (ngModelChange)="status.set($event); fetch()"
        >
          <option value="">All statuses</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ humanize(s) }}</option>
          }
        </select>
        <select
          class="input"
          aria-label="Filter by plan"
          style="max-width: 200px"
          [ngModel]="planCode()"
          (ngModelChange)="planCode.set($event); fetch()"
        >
          <option value="">All plans</option>
          @for (plan of plans(); track plan.planCode) {
            <option [value]="plan.planCode">{{ plan.displayName }}</option>
          }
        </select>
        <input
          class="input"
          type="date"
          aria-label="Expires from"
          style="max-width: 160px"
          [ngModel]="expiresFrom()"
          (ngModelChange)="expiresFrom.set($event); fetch()"
        />
        <input
          class="input"
          type="date"
          aria-label="Expires to"
          style="max-width: 160px"
          [ngModel]="expiresTo()"
          (ngModelChange)="expiresTo.set($event); fetch()"
        />
        <button class="btn btn--sm" type="button" (click)="fetch()">Search</button>
        <div class="toolbar__spacer"></div>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="rows().length === 0"
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
      } @else if (rows().length === 0) {
        <div class="state state--col"><p class="state__empty">No subscribers found.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Started</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr>
                  <td>
                    <a class="table__link table__name" [routerLink]="['/users', row.user.id]">
                      {{ row.user.displayName }}
                    </a>
                    <div class="table__sub">{{ row.user.email || row.user.username || '—' }}</div>
                  </td>
                  <td>{{ row.plan?.displayName || row.planCode }}</td>
                  <td>
                    <span class="badge badge--{{ row.status === 'active' ? 'ok' : 'muted' }}">
                      {{ humanize(row.status) }}
                    </span>
                  </td>
                  <td>{{ formatDate(row.startedAt) }}</td>
                  <td>{{ row.endedAt ? formatDate(row.endedAt) : '—' }}</td>
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
export class SubscribersListComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = USER_SUBSCRIPTION_STATUSES;
  protected readonly plans = signal<SubscriptionPlanResponse[]>([]);

  protected readonly search = signal<string>('');
  protected readonly status = signal<string>('');
  protected readonly planCode = signal<string>('');
  protected readonly expiresFrom = signal<string>('');
  protected readonly expiresTo = signal<string>('');

  protected readonly rows = signal<AdminUserSubscriptionResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);
  private readonly _cursor = signal<string | null>(null);

  private readonly _planCounts = signal<Map<string, number>>(new Map());
  protected readonly planStatsLoading = signal<boolean>(false);
  protected readonly planStatsError = signal<string | null>(null);
  protected readonly planStats = computed<PlanStat[]>(() => {
    const counts = this._planCounts();
    const plans = this.plans();
    return [...counts.entries()]
      .map(([planCode, count]) => ({
        planCode,
        displayName: plans.find((p) => p.planCode === planCode)?.displayName ?? planCode,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  });

  protected readonly expiringLoading = signal<boolean>(false);
  protected readonly expiringSoon = signal<AdminUserSubscriptionResponse[]>([]);
  protected readonly expiringLater = signal<AdminUserSubscriptionResponse[]>([]);

  public ngOnInit(): void {
    this._loadPlans();
    this.fetch();
    this._loadActivePerPlan();
    this._loadExpiring();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    return new Date(iso).toLocaleDateString();
  }

  protected exportCsv(): void {
    downloadCsv('subscribers.csv', CSV_COLUMNS, this.rows());
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._cursor.set(null);
    this._service
      .listUserSubscriptions(this._buildQuery(undefined))
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.loading.set(false);
        if (page === null) {
          this.error.set('Could not load subscribers.');
          return;
        }
        this.rows.set(page.items);
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
      .listUserSubscriptions(this._buildQuery(cursor))
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.loadingMore.set(false);
        if (page === null) {
          this.error.set('Could not load more subscribers.');
          return;
        }
        this.rows.update((list) => [...list, ...page.items]);
        this._cursor.set(page.nextCursor);
        this.hasMore.set(page.hasMore);
      });
  }

  private _buildQuery(cursor: string | undefined): UserSubscriptionListQuery {
    return {
      status: this.status() || undefined,
      planCode: this.planCode() || undefined,
      search: this.search().trim() || undefined,
      expiresAfter: this._toIso(this.expiresFrom()),
      expiresBefore: this._toIso(this.expiresTo(), true),
      limit: PAGE_LIMIT,
      cursor,
    };
  }

  private _toIso(dateInput: string, endOfDay = false): string | undefined {
    if (!dateInput) {
      return undefined;
    }
    return new Date(`${dateInput}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).toISOString();
  }

  private _loadPlans(): void {
    this._service
      .listPlans()
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((plans) => this.plans.set(plans));
  }

  private _loadActivePerPlan(): void {
    this.planStatsLoading.set(true);
    this.planStatsError.set(null);
    fetchAllPages<AdminUserSubscriptionResponse>((cursor) =>
      this._service.listUserSubscriptions({ status: 'active', limit: 100, cursor }),
    )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((rows) => {
        this.planStatsLoading.set(false);
        if (rows === null) {
          this.planStatsError.set('Could not load active-subscriber counts.');
          return;
        }
        const counts = new Map<string, number>();
        for (const row of rows) {
          counts.set(row.planCode, (counts.get(row.planCode) ?? 0) + 1);
        }
        this._planCounts.set(counts);
      });
  }

  private _loadExpiring(): void {
    this.expiringLoading.set(true);
    const now = Date.now();
    this._service
      .listUserSubscriptions({
        status: 'active',
        expiresAfter: new Date(now).toISOString(),
        expiresBefore: new Date(now + 30 * DAY_MS).toISOString(),
        limit: 100,
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.expiringLoading.set(false);
        if (page === null) {
          return;
        }
        const cutoff = now + 14 * DAY_MS;
        const soon: AdminUserSubscriptionResponse[] = [];
        const later: AdminUserSubscriptionResponse[] = [];
        for (const row of page.items) {
          if (!row.endedAt) {
            continue;
          }
          if (new Date(row.endedAt).getTime() <= cutoff) {
            soon.push(row);
          } else {
            later.push(row);
          }
        }
        this.expiringSoon.set(soon);
        this.expiringLater.set(later);
      });
  }
}
