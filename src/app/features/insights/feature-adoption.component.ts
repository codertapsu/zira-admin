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
import { defaultFrom, defaultTo, validateRange } from './insights-dates.util';
import { InsightsService } from './insights.service';
import type { FeatureAdoptionItem } from './insights.models';

@Component({
  selector: 'app-feature-adoption',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MiniChartComponent],
  template: `
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
      <button class="btn btn--ghost btn--sm" type="button" (click)="applyPreset(7)">7d</button>
      <button class="btn btn--ghost btn--sm" type="button" (click)="applyPreset(30)">30d</button>
      <button class="btn btn--ghost btn--sm" type="button" (click)="applyPreset(90)">90d</button>
      <button class="btn btn--ghost btn--sm" type="button" (click)="applyPreset(180)">180d</button>
    </div>

    <div class="card" style="margin-top: 16px; padding: 20px; display: grid; gap: 16px">
      <label class="field" style="max-width: 200px">
        <span class="field__label">Limit</span>
        <input
          class="input"
          type="number"
          min="1"
          max="100"
          [ngModel]="limit()"
          (ngModelChange)="limit.set($event)"
        />
        <span class="field__hint">Top N events by total count.</span>
      </label>
      <div class="form-actions" style="justify-content: flex-start">
        <button
          class="btn btn--primary btn--sm"
          type="button"
          [disabled]="loading()"
          (click)="run()"
        >
          {{ loading() ? 'Loading…' : 'Run' }}
        </button>
      </div>
    </div>

    @if (loading()) {
      <div class="state"><span class="spinner"></span></div>
    } @else if (error(); as message) {
      <div class="state state--col">
        <p class="state__error">{{ message }}</p>
        <button class="btn btn--primary btn--sm" type="button" (click)="run()">Retry</button>
      </div>
    } @else if (data(); as rows) {
      @if (rows.length === 0) {
        <div class="state state--col">
          <p class="state__empty">No adoption data in this range.</p>
        </div>
      } @else {
        <div class="card" style="padding: 20px; margin-top: 16px; display: grid; gap: 16px">
          <app-mini-chart
            [points]="chartPoints()"
            type="bar"
            [height]="60"
            ariaLabel="Feature adoption by total event count"
          />
          <dl class="kv">
            @for (row of rows; track row.eventName; let i = $index) {
              <div>
                <dt class="kv__key">{{ i + 1 }}. {{ humanize(row.eventName) }}</dt>
                <dd class="kv__val">
                  {{ row.totalCount }} <span class="muted">· {{ row.daysActive }}d active</span>
                </dd>
              </div>
            }
          </dl>
        </div>
      }
    } @else {
      <div class="state state--col">
        <p class="state__empty">Set a limit and date range, then Run.</p>
      </div>
    }
  `,
})
export class FeatureAdoptionComponent implements OnInit {
  private readonly _service = inject(InsightsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly fromDate = signal<string>(defaultFrom());
  protected readonly toDate = signal<string>(defaultTo());
  protected readonly limit = signal<number>(20);

  protected readonly data = signal<FeatureAdoptionItem[] | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly chartPoints = computed<ChartPoint[]>(() => {
    const rows = this.data();
    if (!rows) {
      return [];
    }
    return rows.map((row) => ({ label: row.eventName, value: row.totalCount }));
  });

  public ngOnInit(): void {
    // Numeric-only inputs with sane defaults — button-driven, like the other range tabs.
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected applyPreset(days: 7 | 30 | 90 | 180): void {
    this.fromDate.set(defaultFrom(days));
    this.toDate.set(defaultTo());
  }

  protected run(): void {
    if (this.loading()) {
      return;
    }
    const rangeError = validateRange(this.fromDate(), this.toDate());
    if (rangeError) {
      this.error.set(rangeError);
      this.data.set(null);
      return;
    }
    const limitNum = Number(this.limit());
    const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined;
    this.loading.set(true);
    this.error.set(null);
    this._service
      .featureAdoption(this.fromDate(), this.toDate(), safeLimit)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (!res) {
          this.error.set('Could not load feature adoption.');
          return;
        }
        this.data.set(res.items);
      });
  }
}
