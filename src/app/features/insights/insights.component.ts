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

import { InsightsService } from './insights.service';
import type {
  FeatureAdoptionItem,
  FunnelStep,
  NotificationMetrics,
  ProductivityPoint,
} from './insights.models';

type InsightsTab = 'productivity' | 'adoption' | 'funnel' | 'notifications';

interface MetricEntry {
  key: string;
  value: number;
}

function fmtDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return fmtDate(d);
}

function defaultTo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fmtDate(d);
}

@Component({
  selector: 'app-insights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Insights</h1>
      </header>

      <nav class="tabs" aria-label="Insights sections">
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'productivity'"
          (click)="tab.set('productivity')"
        >
          Productivity
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'adoption'"
          (click)="tab.set('adoption')"
        >
          Adoption
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'funnel'"
          (click)="tab.set('funnel')"
        >
          Funnel
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'notifications'"
          (click)="selectNotifications()"
        >
          Notifications
        </button>
      </nav>

      @if (tab() !== 'notifications') {
        <div class="toolbar" style="margin-top: 16px">
          <label class="field" style="max-width: 200px">
            <span class="field__label">From (inclusive)</span>
            <input
              class="input"
              type="date"
              [ngModel]="fromDate()"
              (ngModelChange)="fromDate.set($event)"
            />
          </label>
          <label class="field" style="max-width: 200px">
            <span class="field__label">To (exclusive)</span>
            <input
              class="input"
              type="date"
              [ngModel]="toDate()"
              (ngModelChange)="toDate.set($event)"
            />
          </label>
        </div>
      }

      @switch (tab()) {
        @case ('productivity') {
          <div class="card" style="margin-top: 16px; padding: 20px; display: grid; gap: 16px">
            <label class="field">
              <span class="field__label">Event names (1–10)</span>
              <textarea
                class="input"
                placeholder="One per line, or comma-separated — e.g. task_created, note_created"
                [ngModel]="prodEventNames()"
                (ngModelChange)="prodEventNames.set($event)"
              ></textarea>
              <span class="field__hint">Between 1 and 10 event names.</span>
            </label>
            <label class="field" style="max-width: 320px">
              <span class="field__label">User ID (optional)</span>
              <input
                class="input"
                placeholder="Filter to a single user"
                [ngModel]="prodUserId()"
                (ngModelChange)="prodUserId.set($event)"
              />
            </label>
            <div class="form-actions" style="justify-content: flex-start">
              <button
                class="btn btn--primary btn--sm"
                type="button"
                [disabled]="prodLoading()"
                (click)="runProductivity()"
              >
                {{ prodLoading() ? 'Loading…' : 'Run' }}
              </button>
            </div>
          </div>

          @if (prodLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (prodError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="runProductivity()">
                Retry
              </button>
            </div>
          } @else if (prodData(); as rows) {
            @if (rows.length === 0) {
              <div class="state state--col">
                <p class="state__empty">No activity in this range.</p>
              </div>
            } @else {
              <div class="table-wrap card">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Event</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows; track $index) {
                      <tr>
                        <td>{{ shortDate(row.date) }}</td>
                        <td>{{ humanize(row.eventName) }}</td>
                        <td>{{ row.count }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          } @else {
            <div class="state state--col">
              <p class="state__empty">Enter event names and a date range, then Run.</p>
            </div>
          }
        }

        @case ('adoption') {
          <div class="card" style="margin-top: 16px; padding: 20px; display: grid; gap: 16px">
            <label class="field" style="max-width: 200px">
              <span class="field__label">Limit</span>
              <input
                class="input"
                type="number"
                min="1"
                max="100"
                [ngModel]="adoptLimit()"
                (ngModelChange)="adoptLimit.set($event)"
              />
              <span class="field__hint">Top N events by total count.</span>
            </label>
            <div class="form-actions" style="justify-content: flex-start">
              <button
                class="btn btn--primary btn--sm"
                type="button"
                [disabled]="adoptLoading()"
                (click)="runAdoption()"
              >
                {{ adoptLoading() ? 'Loading…' : 'Run' }}
              </button>
            </div>
          </div>

          @if (adoptLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (adoptError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="runAdoption()">
                Retry
              </button>
            </div>
          } @else if (adoptData(); as rows) {
            @if (rows.length === 0) {
              <div class="state state--col">
                <p class="state__empty">No adoption data in this range.</p>
              </div>
            } @else {
              <div class="table-wrap card">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th style="width: 45%">Total count</th>
                      <th>Days active</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows; track row.eventName) {
                      <tr>
                        <td>{{ humanize(row.eventName) }}</td>
                        <td>
                          <div style="display: flex; align-items: center; gap: 10px">
                            <span
                              style="
                                display: inline-block;
                                height: 8px;
                                border-radius: 999px;
                                background: var(--primary);
                                min-width: 2px;
                              "
                              [style.width.%]="barPct(row)"
                            ></span>
                            <span>{{ row.totalCount }}</span>
                          </div>
                        </td>
                        <td>{{ row.daysActive }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          } @else {
            <div class="state state--col">
              <p class="state__empty">Set a limit and date range, then Run.</p>
            </div>
          }
        }

        @case ('funnel') {
          <div class="card" style="margin-top: 16px; padding: 20px; display: grid; gap: 16px">
            <label class="field">
              <span class="field__label">Ordered steps (2–8)</span>
              <textarea
                class="input"
                placeholder="One event per line, in order — e.g.&#10;app_open&#10;project_created&#10;task_created"
                [ngModel]="funnelSteps()"
                (ngModelChange)="funnelSteps.set($event)"
              ></textarea>
              <span class="field__hint">Between 2 and 8 steps; order matters.</span>
            </label>
            <div class="form-actions" style="justify-content: flex-start">
              <button
                class="btn btn--primary btn--sm"
                type="button"
                [disabled]="funnelLoading()"
                (click)="runFunnel()"
              >
                {{ funnelLoading() ? 'Loading…' : 'Run' }}
              </button>
            </div>
          </div>

          @if (funnelLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (funnelError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="runFunnel()">
                Retry
              </button>
            </div>
          } @else if (funnelData(); as steps) {
            @if (steps.length === 0) {
              <div class="state state--col">
                <p class="state__empty">No funnel data in this range.</p>
              </div>
            } @else {
              <div class="table-wrap card">
                <table class="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Step</th>
                      <th>Users</th>
                      <th>Conversion from previous</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (step of steps; track step.index) {
                      <tr>
                        <td>{{ step.index + 1 }}</td>
                        <td>{{ humanize(step.eventName) }}</td>
                        <td>{{ step.users }}</td>
                        <td>
                          @if (step.conversionFromPrev === null) {
                            <span class="muted">—</span>
                          } @else {
                            <span class="badge badge--muted">{{
                              pct(step.conversionFromPrev)
                            }}</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          } @else {
            <div class="state state--col">
              <p class="state__empty">Enter ordered steps and a date range, then Run.</p>
            </div>
          }
        }

        @case ('notifications') {
          <div style="margin-top: 16px">
            @if (notifLoading()) {
              <div class="state"><span class="spinner"></span></div>
            } @else if (notifError(); as message) {
              <div class="state state--col">
                <p class="state__error">{{ message }}</p>
                <button class="btn btn--primary btn--sm" type="button" (click)="runNotifications()">
                  Retry
                </button>
              </div>
            } @else if (notifData(); as metrics) {
              <div class="toolbar" style="margin-bottom: 16px">
                <span class="muted">Snapshot taken {{ formatDate(metrics.takenAt) }}</span>
                <span class="toolbar__spacer"></span>
                <button class="btn btn--ghost btn--sm" type="button" (click)="runNotifications()">
                  Refresh
                </button>
              </div>
              <div class="form-grid">
                <div class="card" style="padding: 20px; display: grid; gap: 12px">
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
                <div class="card" style="padding: 20px; display: grid; gap: 12px">
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
        }
      }
    </section>
  `,
})
export class InsightsComponent implements OnInit {
  private readonly _service = inject(InsightsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly tab = signal<InsightsTab>('productivity');

  protected readonly fromDate = signal<string>(defaultFrom());
  protected readonly toDate = signal<string>(defaultTo());

  // Productivity
  protected readonly prodEventNames = signal<string>('');
  protected readonly prodUserId = signal<string>('');
  protected readonly prodData = signal<ProductivityPoint[] | null>(null);
  protected readonly prodLoading = signal<boolean>(false);
  protected readonly prodError = signal<string | null>(null);

  // Adoption
  protected readonly adoptLimit = signal<number>(20);
  protected readonly adoptData = signal<FeatureAdoptionItem[] | null>(null);
  protected readonly adoptLoading = signal<boolean>(false);
  protected readonly adoptError = signal<string | null>(null);
  private readonly _adoptMax = computed<number>(() => {
    const rows = this.adoptData();
    if (!rows || rows.length === 0) {
      return 0;
    }
    return rows.reduce((max, row) => Math.max(max, row.totalCount), 0);
  });

  // Funnel
  protected readonly funnelSteps = signal<string>('');
  protected readonly funnelData = signal<FunnelStep[] | null>(null);
  protected readonly funnelLoading = signal<boolean>(false);
  protected readonly funnelError = signal<string | null>(null);

  // Notifications
  protected readonly notifData = signal<NotificationMetrics | null>(null);
  protected readonly notifLoading = signal<boolean>(false);
  protected readonly notifError = signal<string | null>(null);
  private _notifLoaded = false;
  protected readonly counterEntries = computed<MetricEntry[]>(() =>
    this._toEntries(this.notifData()?.counters),
  );
  protected readonly gaugeEntries = computed<MetricEntry[]>(() =>
    this._toEntries(this.notifData()?.gauges),
  );

  public ngOnInit(): void {
    // Sections that need free-text inputs stay button-driven; nothing to auto-load.
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected shortDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  protected pct(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  protected barPct(row: FeatureAdoptionItem): number {
    const max = this._adoptMax();
    if (max <= 0) {
      return 0;
    }
    return (row.totalCount / max) * 100;
  }

  protected selectNotifications(): void {
    this.tab.set('notifications');
    if (!this._notifLoaded) {
      this.runNotifications();
    }
  }

  protected runProductivity(): void {
    if (this.prodLoading()) {
      return;
    }
    const range = this._range();
    if (range) {
      this.prodError.set(range);
      this.prodData.set(null);
      return;
    }
    const names = this._parseTokens(this.prodEventNames());
    if (names.length < 1 || names.length > 10) {
      this.prodError.set('Enter between 1 and 10 event names.');
      this.prodData.set(null);
      return;
    }
    this.prodLoading.set(true);
    this.prodError.set(null);
    this._service
      .productivityTrend(
        this.fromDate(),
        this.toDate(),
        names,
        this.prodUserId().trim() || undefined,
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.prodLoading.set(false);
        if (!data) {
          this.prodError.set('Could not load the productivity trend.');
          return;
        }
        this.prodData.set(data.series);
      });
  }

  protected runAdoption(): void {
    if (this.adoptLoading()) {
      return;
    }
    const range = this._range();
    if (range) {
      this.adoptError.set(range);
      this.adoptData.set(null);
      return;
    }
    const limit = Number(this.adoptLimit());
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : undefined;
    this.adoptLoading.set(true);
    this.adoptError.set(null);
    this._service
      .featureAdoption(this.fromDate(), this.toDate(), safeLimit)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.adoptLoading.set(false);
        if (!data) {
          this.adoptError.set('Could not load feature adoption.');
          return;
        }
        this.adoptData.set(data.items);
      });
  }

  protected runFunnel(): void {
    if (this.funnelLoading()) {
      return;
    }
    const range = this._range();
    if (range) {
      this.funnelError.set(range);
      this.funnelData.set(null);
      return;
    }
    const steps = this._parseTokens(this.funnelSteps());
    if (steps.length < 2 || steps.length > 8) {
      this.funnelError.set('Enter between 2 and 8 ordered steps.');
      this.funnelData.set(null);
      return;
    }
    this.funnelLoading.set(true);
    this.funnelError.set(null);
    this._service
      .activationFunnel(this.fromDate(), this.toDate(), steps)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.funnelLoading.set(false);
        if (!data) {
          this.funnelError.set('Could not load the activation funnel.');
          return;
        }
        this.funnelData.set(data.steps);
      });
  }

  protected runNotifications(): void {
    if (this.notifLoading()) {
      return;
    }
    this._notifLoaded = true;
    this.notifLoading.set(true);
    this.notifError.set(null);
    this._service
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
        this.notifData.set(data);
      });
  }

  private _range(): string | null {
    if (!this.fromDate() || !this.toDate()) {
      return 'Choose both a From and a To date.';
    }
    if (this.fromDate() >= this.toDate()) {
      return 'From date must be before To date.';
    }
    return null;
  }

  private _parseTokens(text: string): string[] {
    return text
      .split(/[\n,]/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
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
