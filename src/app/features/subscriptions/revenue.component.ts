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

import { catchError, of } from 'rxjs';

import { type ChartPoint, MiniChartComponent } from '../../core/ui/mini-chart.component';
import { fetchAllPages } from './paginate-all.util';
import { SubscriptionsService } from './subscriptions.service';
import {
  SUBSCRIPTION_PURCHASE_REQUEST_STATUSES,
  type SubscriptionPurchaseRequestResponse,
} from './subscriptions.models';

const MAX_PAGES = 20;
const PAGE_LIMIT = 100;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

interface FunnelStat {
  readonly status: string;
  readonly count: number;
}

interface AgingBucket {
  readonly label: string;
  readonly count: number;
}

@Component({
  selector: 'app-revenue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MiniChartComponent],
  template: `
    <div class="page">
      <div class="toolbar">
        <label class="field" style="max-width: 160px">
          <span class="field__label">From</span>
          <input
            class="input"
            type="date"
            [ngModel]="fromDate()"
            (ngModelChange)="fromDate.set($event)"
          />
        </label>
        <label class="field" style="max-width: 160px">
          <span class="field__label">To</span>
          <input
            class="input"
            type="date"
            [ngModel]="toDate()"
            (ngModelChange)="toDate.set($event)"
          />
        </label>
        <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Apply</button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else {
        <p class="muted">
          Aggregates run over the most recent up to {{ maxRows }} purchase requests
          (createdAt/decidedAt filtered to the selected range where noted).
        </p>

        <div class="stat-grid">
          <div class="stat">
            <div class="stat__label">Accepted revenue (in range)</div>
            <div class="stat__value">{{ totalRevenue().toLocaleString() }}</div>
            <div class="stat__sub">sum of amountReceived</div>
          </div>
          <div class="stat">
            <div class="stat__label">Median time-to-decision</div>
            <div class="stat__value">{{ medianDecisionLabel() }}</div>
            <div class="stat__sub">accepted + rejected, decided in range</div>
          </div>
          <div class="stat">
            <div class="stat__label">Pending right now</div>
            <div class="stat__value">{{ pendingTotal() }}</div>
            <div class="stat__sub">not restricted to date range</div>
          </div>
        </div>

        <div class="card" style="padding: 16px">
          <p class="section-title">Monthly accepted revenue</p>
          <app-mini-chart
            [points]="revenuePoints()"
            type="bar"
            [height]="40"
            ariaLabel="Monthly accepted revenue"
          />
        </div>

        <div>
          <p class="section-title">Status funnel (created in range)</p>
          <div class="stat-grid">
            @for (f of funnel(); track f.status) {
              <div class="stat">
                <div class="stat__label">{{ humanize(f.status) }}</div>
                <div class="stat__value">{{ f.count }}</div>
              </div>
            }
          </div>
        </div>

        <div>
          <p class="section-title">Pending-aging buckets</p>
          <div class="stat-grid">
            @for (bucket of agingBuckets(); track bucket.label) {
              <div class="stat">
                <div class="stat__label">{{ bucket.label }}</div>
                <div class="stat__value">{{ bucket.count }}</div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class RevenueComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly maxRows = MAX_PAGES * PAGE_LIMIT;

  protected readonly fromDate = signal<string>(this._isoDate(Date.now() - 90 * DAY_MS));
  protected readonly toDate = signal<string>(this._isoDate(Date.now()));

  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly requests = signal<SubscriptionPurchaseRequestResponse[]>([]);

  protected readonly funnel = computed<FunnelStat[]>(() => {
    const counts = new Map<string, number>();
    for (const status of SUBSCRIPTION_PURCHASE_REQUEST_STATUSES) {
      counts.set(status, 0);
    }
    for (const r of this.requests()) {
      if (this._inRange(r.createdAt)) {
        counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count }));
  });

  protected readonly revenuePoints = computed<ChartPoint[]>(() => {
    const byMonth = new Map<string, number>();
    for (const r of this.requests()) {
      if (r.status !== 'accepted' || r.decidedAt === null || !this._inRange(r.decidedAt)) {
        continue;
      }
      const decided = new Date(r.decidedAt);
      const key = `${decided.getFullYear()}-${String(decided.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + (r.amountReceived ?? 0));
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => ({ label: this._monthLabel(key), value }));
  });

  protected readonly totalRevenue = computed<number>(() =>
    this.revenuePoints().reduce((sum, p) => sum + p.value, 0),
  );

  protected readonly medianDecisionHours = computed<number | null>(() => {
    const hours = this.requests()
      .filter(
        (r) =>
          (r.status === 'accepted' || r.status === 'rejected') &&
          r.decidedAt !== null &&
          this._inRange(r.decidedAt),
      )
      .map(
        (r) =>
          (new Date(r.decidedAt as string).getTime() - new Date(r.createdAt).getTime()) / HOUR_MS,
      )
      .sort((a, b) => a - b);
    if (hours.length === 0) {
      return null;
    }
    const mid = Math.floor(hours.length / 2);
    return hours.length % 2 === 0 ? (hours[mid - 1] + hours[mid]) / 2 : hours[mid];
  });

  protected readonly medianDecisionLabel = computed<string>(() => {
    const hours = this.medianDecisionHours();
    if (hours === null) {
      return '—';
    }
    if (hours < 48) {
      return `${hours.toFixed(1)} h`;
    }
    return `${(hours / 24).toFixed(1)} d`;
  });

  protected readonly pendingTotal = computed<number>(
    () => this.requests().filter((r) => r.status === 'pending').length,
  );

  protected readonly agingBuckets = computed<AgingBucket[]>(() => {
    const now = Date.now();
    const buckets: { label: string; maxHours: number }[] = [
      { label: '< 24h', maxHours: 24 },
      { label: '1–3 days', maxHours: 72 },
      { label: '3–7 days', maxHours: 168 },
      { label: '> 7 days', maxHours: Infinity },
    ];
    const counts = buckets.map(() => 0);
    for (const r of this.requests()) {
      if (r.status !== 'pending') {
        continue;
      }
      const ageHours = (now - new Date(r.createdAt).getTime()) / HOUR_MS;
      const idx = buckets.findIndex((b) => ageHours < b.maxHours);
      counts[idx === -1 ? buckets.length - 1 : idx] += 1;
    }
    return buckets.map((b, i) => ({ label: b.label, count: counts[i] }));
  });

  public ngOnInit(): void {
    this.fetch();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    fetchAllPages<SubscriptionPurchaseRequestResponse>(
      (cursor) => this._service.listRequests({ limit: PAGE_LIMIT, cursor }),
      MAX_PAGES,
    )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((items) => {
        this.loading.set(false);
        if (items === null) {
          this.error.set('Could not load purchase requests for the revenue report.');
          return;
        }
        this.requests.set(items);
      });
  }

  private _inRange(iso: string): boolean {
    const time = new Date(iso).getTime();
    const from = this.fromDate();
    const to = this.toDate();
    if (from && time < new Date(`${from}T00:00:00`).getTime()) {
      return false;
    }
    if (to && time > new Date(`${to}T23:59:59.999`).getTime()) {
      return false;
    }
    return true;
  }

  private _monthLabel(key: string): string {
    const [year, month] = key.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }

  private _isoDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
