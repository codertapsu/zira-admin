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
import { RouterLink } from '@angular/router';

import { catchError, forkJoin, of } from 'rxjs';

import { type ChartPoint, MiniChartComponent } from '../../core/ui/mini-chart.component';
import type { CampaignResponse } from '../campaigns/campaigns.models';
import type { NotificationMetrics } from '../insights/insights.models';
import type { SubscriptionPurchaseRequestResponse } from '../subscriptions/subscriptions.models';
import type { HealthCheckResult, VersionResponse } from './overview.models';
import { type CampaignsByStatus, OverviewService } from './overview.service';

interface MetricEntry {
  key: string;
  value: number;
}

interface IndicatorEntry {
  key: string;
  status: string;
}

interface GatewayStatus {
  health: HealthCheckResult | null;
  ready: HealthCheckResult | null;
  version: VersionResponse | null;
}

function fmtDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Last 14 days: `fromDate` inclusive, `toDate` exclusive (matches InsightsService's contract). */
function dauFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return fmtDate(d);
}

function dauToDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fmtDate(d);
}

/**
 * Home dashboard: one card per vertical, each independently loaded so a
 * single slow/failed upstream never blocks the rest of the page. Every card
 * deep-links to the vertical that owns its full detail view.
 */
@Component({
  selector: 'app-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MiniChartComponent],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Overview</h1>
      </header>

      <!-- Pending purchase requests -->
      <div class="card" style="padding: 20px; display: grid; gap: 12px">
        <div class="toolbar">
          <p class="section-title">Pending purchase requests</p>
          <span class="toolbar__spacer"></span>
          <a class="btn btn--ghost btn--sm" routerLink="/subscriptions/requests">View all</a>
        </div>

        @if (requestsLoading()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (requestsError(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="loadRequests()">
              Retry
            </button>
          </div>
        } @else {
          <div class="stat-grid">
            <div class="stat">
              <span class="stat__label">Pending</span>
              <span class="stat__value">{{ requestsCountLabel() }}</span>
            </div>
          </div>
          @if (requests().length === 0) {
            <p class="state__empty">No pending requests.</p>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Requester</th>
                    <th>Plan</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (req of requests(); track req.id) {
                    <tr>
                      <td>{{ req.requester.displayName }}</td>
                      <td>{{ req.plan.displayName }}</td>
                      <td>
                        {{ req.requestedAmount.toLocaleString() }} {{ req.requestedCurrency }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </div>

      <!-- New / open feedback -->
      <div class="card" style="padding: 20px; display: grid; gap: 12px">
        <div class="toolbar">
          <p class="section-title">New / open feedback</p>
          <span class="toolbar__spacer"></span>
          <a class="btn btn--ghost btn--sm" routerLink="/feedback">View all</a>
        </div>

        @if (feedbackLoading()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (feedbackError(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="loadFeedback()">
              Retry
            </button>
          </div>
        } @else {
          <div class="stat-grid">
            <div class="stat">
              <span class="stat__label">New / open</span>
              <span class="stat__value">{{ feedbackCountLabel() }}</span>
            </div>
          </div>
        }
      </div>

      <!-- Live + upcoming campaigns -->
      <div class="card" style="padding: 20px; display: grid; gap: 12px">
        <div class="toolbar">
          <p class="section-title">Live &amp; upcoming campaigns</p>
          <span class="toolbar__spacer"></span>
          <a class="btn btn--ghost btn--sm" routerLink="/campaigns">View all</a>
        </div>

        @if (campaignsLoading()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (campaignsError(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="loadCampaigns()">
              Retry
            </button>
          </div>
        } @else {
          <div class="stat-grid">
            <div class="stat">
              <span class="stat__label">Live</span>
              <span class="stat__value">{{ activeCampaigns().length }}</span>
            </div>
            <div class="stat">
              <span class="stat__label">Scheduled</span>
              <span class="stat__value">{{ scheduledCampaigns().length }}</span>
            </div>
          </div>
          @if (activeCampaigns().length === 0 && scheduledCampaigns().length === 0) {
            <p class="state__empty">No live or scheduled campaigns.</p>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Window</th>
                  </tr>
                </thead>
                <tbody>
                  @for (campaign of previewCampaigns(); track campaign.id) {
                    <tr>
                      <td>{{ campaignTitle(campaign) }}</td>
                      <td>
                        <span
                          class="badge badge--{{ campaign.status === 'active' ? 'ok' : 'muted' }}"
                        >
                          {{ humanize(campaign.status) }}
                        </span>
                      </td>
                      <td>
                        {{ formatDate(campaign.startsAt) }} – {{ formatDate(campaign.endsAt) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </div>

      <!-- Notification gauges -->
      <div class="card" style="padding: 20px; display: grid; gap: 12px">
        <div class="toolbar">
          <p class="section-title">Notification metrics</p>
          <span class="toolbar__spacer"></span>
          <a class="btn btn--ghost btn--sm" routerLink="/insights">View all</a>
        </div>

        @if (notifLoading()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (notifError(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="loadNotifications()">
              Retry
            </button>
          </div>
        } @else if (notifMetrics(); as metrics) {
          <span class="muted">Snapshot taken {{ formatDateTime(metrics.takenAt) }}</span>
          <div class="form-grid">
            <div>
              <p class="section-title">Counters</p>
              @if (counterEntries().length === 0) {
                <p class="muted">No counters reported.</p>
              } @else {
                <div class="kv">
                  @for (entry of counterEntries(); track entry.key) {
                    <span class="kv__key">{{ humanize(entry.key) }}</span>
                    <span class="kv__val">{{ entry.value }}</span>
                  }
                </div>
              }
            </div>
            <div>
              <p class="section-title">Gauges</p>
              @if (gaugeEntries().length === 0) {
                <p class="muted">No gauges reported.</p>
              } @else {
                <div class="kv">
                  @for (entry of gaugeEntries(); track entry.key) {
                    <span class="kv__key">{{ humanize(entry.key) }}</span>
                    <span class="kv__val">{{ entry.value }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Gateway status -->
      <div class="card" style="padding: 20px; display: grid; gap: 12px">
        <div class="toolbar">
          <p class="section-title">Gateway status</p>
          <span class="toolbar__spacer"></span>
          <button class="btn btn--ghost btn--sm" type="button" (click)="loadGateway()">
            Refresh
          </button>
        </div>

        @if (gatewayLoading()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (gatewayError(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="loadGateway()">
              Retry
            </button>
          </div>
        } @else {
          <div class="stat-grid">
            <div class="stat">
              <span class="stat__label">Liveness</span>
              <span class="stat__value">
                @if (gateway().health; as h) {
                  <span class="badge badge--{{ h.status === 'ok' ? 'ok' : 'muted' }}">{{
                    humanize(h.status)
                  }}</span>
                } @else {
                  <span class="muted">Unavailable</span>
                }
              </span>
            </div>
            <div class="stat">
              <span class="stat__label">Readiness</span>
              <span class="stat__value">
                @if (gateway().ready; as r) {
                  <span class="badge badge--{{ r.status === 'ok' ? 'ok' : 'muted' }}">{{
                    humanize(r.status)
                  }}</span>
                } @else {
                  <span class="muted">Unavailable</span>
                }
              </span>
            </div>
          </div>

          @if (readinessIndicators().length > 0) {
            <div class="kv">
              @for (entry of readinessIndicators(); track entry.key) {
                <span class="kv__key">{{ humanize(entry.key) }}</span>
                <span class="kv__val">{{ humanize(entry.status) }}</span>
              }
            </div>
          }

          @if (gateway().version; as v) {
            <div class="kv">
              <span class="kv__key">Server build</span>
              <span class="kv__val">{{ v.serverVersion }}</span>
              <span class="kv__key">Min client version</span>
              <span class="kv__val">{{ v.minClientVersion }}</span>
              <span class="kv__key">Min hard client version</span>
              <span class="kv__val">{{ v.minHardClientVersion }}</span>
              <span class="kv__key">Hard gate armed</span>
              <span class="kv__val">{{ v.blockBelowMin ? 'Yes' : 'No' }}</span>
            </div>
          } @else {
            <p class="muted">Version metadata unavailable.</p>
          }
        }
      </div>

      <!-- DAU sparkline -->
      <div class="card" style="padding: 20px; display: grid; gap: 12px">
        <div class="toolbar">
          <p class="section-title">Daily active users (app opens, last 14 days)</p>
          <span class="toolbar__spacer"></span>
          <a class="btn btn--ghost btn--sm" routerLink="/insights">View all</a>
        </div>

        @if (dauLoading()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (dauError(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="loadDau()">
              Retry
            </button>
          </div>
        } @else {
          <app-mini-chart
            [points]="dauPoints()"
            type="line"
            [height]="40"
            ariaLabel="App opens per day, last 14 days"
          />
        }
      </div>
    </section>
  `,
})
export class OverviewComponent implements OnInit {
  private readonly _overview = inject(OverviewService);
  private readonly _destroyRef = inject(DestroyRef);

  // Pending purchase requests
  protected readonly requestsLoading = signal<boolean>(false);
  protected readonly requestsError = signal<string | null>(null);
  protected readonly requests = signal<SubscriptionPurchaseRequestResponse[]>([]);
  protected readonly requestsHasMore = signal<boolean>(false);
  protected readonly requestsCountLabel = computed<string>(() =>
    this.requestsHasMore() ? `${this.requests().length}+` : `${this.requests().length}`,
  );

  // New / open feedback
  protected readonly feedbackLoading = signal<boolean>(false);
  protected readonly feedbackError = signal<string | null>(null);
  private readonly _feedbackCount = signal<number>(0);
  private readonly _feedbackHasMore = signal<boolean>(false);
  protected readonly feedbackCountLabel = computed<string>(() =>
    this._feedbackHasMore() ? `${this._feedbackCount()}+` : `${this._feedbackCount()}`,
  );

  // Live + upcoming campaigns
  protected readonly campaignsLoading = signal<boolean>(false);
  protected readonly campaignsError = signal<string | null>(null);
  protected readonly activeCampaigns = signal<CampaignResponse[]>([]);
  protected readonly scheduledCampaigns = signal<CampaignResponse[]>([]);
  protected readonly previewCampaigns = computed<CampaignResponse[]>(() =>
    [...this.activeCampaigns(), ...this.scheduledCampaigns()].slice(0, 5),
  );

  // Notification metrics
  protected readonly notifLoading = signal<boolean>(false);
  protected readonly notifError = signal<string | null>(null);
  protected readonly notifMetrics = signal<NotificationMetrics | null>(null);
  protected readonly counterEntries = computed<MetricEntry[]>(() =>
    this._toEntries(this.notifMetrics()?.counters),
  );
  protected readonly gaugeEntries = computed<MetricEntry[]>(() =>
    this._toEntries(this.notifMetrics()?.gauges),
  );

  // Gateway status (health + readiness + version) — degrades per-probe rather
  // than failing the whole tile when only one of the three is unreachable.
  protected readonly gatewayLoading = signal<boolean>(false);
  protected readonly gatewayError = signal<string | null>(null);
  protected readonly gateway = signal<GatewayStatus>({ health: null, ready: null, version: null });
  protected readonly readinessIndicators = computed<IndicatorEntry[]>(() => {
    const details = this.gateway().ready?.details;
    if (!details) {
      return [];
    }
    return Object.keys(details).map((key) => ({ key, status: details[key].status }));
  });

  // DAU sparkline
  protected readonly dauLoading = signal<boolean>(false);
  protected readonly dauError = signal<string | null>(null);
  protected readonly dauPoints = signal<ChartPoint[]>([]);

  public ngOnInit(): void {
    this.loadRequests();
    this.loadFeedback();
    this.loadCampaigns();
    this.loadNotifications();
    this.loadGateway();
    this.loadDau();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }

  protected formatDateTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }

  protected campaignTitle(campaign: CampaignResponse): string {
    return campaign.content?.vi?.title || campaign.content?.en?.title || '—';
  }

  protected loadRequests(): void {
    if (this.requestsLoading()) {
      return;
    }
    this.requestsLoading.set(true);
    this.requestsError.set(null);
    this._overview
      .pendingPurchaseRequests(5)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.requestsLoading.set(false);
        if (!page) {
          this.requestsError.set('Could not load pending purchase requests.');
          return;
        }
        this.requests.set(page.items);
        this.requestsHasMore.set(page.hasMore);
      });
  }

  protected loadFeedback(): void {
    if (this.feedbackLoading()) {
      return;
    }
    this.feedbackLoading.set(true);
    this.feedbackError.set(null);
    this._overview
      .newOrOpenFeedback()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.feedbackLoading.set(false);
        if (!page) {
          this.feedbackError.set('Could not load feedback.');
          return;
        }
        this._feedbackCount.set(page.items.length);
        this._feedbackHasMore.set(page.hasMore);
      });
  }

  protected loadCampaigns(): void {
    if (this.campaignsLoading()) {
      return;
    }
    this.campaignsLoading.set(true);
    this.campaignsError.set(null);
    this._overview
      .campaignsByStatus()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((result: CampaignsByStatus | null) => {
        this.campaignsLoading.set(false);
        if (!result) {
          this.campaignsError.set('Could not load campaigns.');
          return;
        }
        this.activeCampaigns.set(result.active);
        this.scheduledCampaigns.set(result.scheduled);
      });
  }

  protected loadNotifications(): void {
    if (this.notifLoading()) {
      return;
    }
    this.notifLoading.set(true);
    this.notifError.set(null);
    this._overview
      .notificationMetrics()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.notifLoading.set(false);
        if (!data) {
          this.notifError.set('Could not load notification metrics.');
          return;
        }
        this.notifMetrics.set(data);
      });
  }

  protected loadGateway(): void {
    if (this.gatewayLoading()) {
      return;
    }
    this.gatewayLoading.set(true);
    this.gatewayError.set(null);
    forkJoin({
      health: this._overview.health().pipe(catchError(() => of(null))),
      ready: this._overview.readiness().pipe(catchError(() => of(null))),
      version: this._overview.version().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((result) => {
        this.gatewayLoading.set(false);
        if (!result.health && !result.ready && !result.version) {
          this.gatewayError.set('Could not reach the gateway.');
          return;
        }
        this.gateway.set(result);
      });
  }

  protected loadDau(): void {
    if (this.dauLoading()) {
      return;
    }
    this.dauLoading.set(true);
    this.dauError.set(null);
    this._overview
      .dauTrend(dauFromDate(), dauToDate())
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((trend) => {
        this.dauLoading.set(false);
        if (!trend) {
          this.dauError.set('Could not load the DAU trend.');
          return;
        }
        const points = [...trend.series]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((point) => ({
            label: point.date.slice(5).replace('-', '/'),
            value: point.count,
          }));
        this.dauPoints.set(points);
      });
  }

  private _toEntries(rec: Record<string, number> | undefined): MetricEntry[] {
    if (!rec) {
      return [];
    }
    return Object.keys(rec)
      .sort()
      .map((key) => ({ key, value: rec[key] ?? 0 }));
  }
}
