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

import { catchError, of } from 'rxjs';

import { InsightsService } from './insights.service';
import type { NotificationMetrics } from './insights.models';

interface MetricEntry {
  key: string;
  value: number;
}

@Component({
  selector: 'app-notification-metrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="margin-top: 16px">
      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="run()">Retry</button>
        </div>
      } @else if (data(); as metrics) {
        <div class="toolbar" style="margin-bottom: 16px">
          <span class="muted">Snapshot taken {{ formatDate(metrics.takenAt) }}</span>
          <span class="toolbar__spacer"></span>
          <button class="btn btn--ghost btn--sm" type="button" (click)="run()">Refresh</button>
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
  `,
})
export class NotificationMetricsComponent implements OnInit {
  private readonly _service = inject(InsightsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly data = signal<NotificationMetrics | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly counterEntries = computed<MetricEntry[]>(() =>
    this._toEntries(this.data()?.counters),
  );
  protected readonly gaugeEntries = computed<MetricEntry[]>(() =>
    this._toEntries(this.data()?.gauges),
  );

  public ngOnInit(): void {
    this.run();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  protected run(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this._service
      .notificationMetrics()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (!data) {
          this.error.set('Could not load notification metrics.');
          return;
        }
        this.data.set(data);
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
