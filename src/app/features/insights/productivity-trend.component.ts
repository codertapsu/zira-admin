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
import { InsightsSavedViewsService } from './insights-saved-views.service';
import { InsightsService } from './insights.service';
import type { ProductivityPoint } from './insights.models';

interface EventSeries {
  readonly eventName: string;
  readonly total: number;
  readonly peak: number;
  readonly chartPoints: ChartPoint[];
}

const MAX_EVENT_NAMES = 10;

@Component({
  selector: 'app-productivity-trend',
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

    <div class="toolbar" style="margin-top: 12px">
      <label class="field" style="max-width: 220px; margin: 0">
        <span class="field__label">Saved views</span>
        <select class="input" [ngModel]="selectedViewId()" (ngModelChange)="applySavedView($event)">
          <option value="">— choose —</option>
          @for (view of savedViews(); track view.id) {
            <option [value]="view.id">{{ view.name }}</option>
          }
        </select>
      </label>
      <label class="field" style="max-width: 220px; margin: 0">
        <span class="field__label">Save current as</span>
        <input
          class="input"
          placeholder="View name"
          [ngModel]="newViewName()"
          (ngModelChange)="newViewName.set($event)"
        />
      </label>
      <button
        class="btn btn--ghost btn--sm"
        type="button"
        [disabled]="!newViewName().trim() || eventNames().length === 0"
        (click)="saveCurrentView()"
      >
        Save view
      </button>
      @if (selectedViewId()) {
        <button class="btn btn--danger btn--sm" type="button" (click)="deleteSelectedView()">
          Delete view
        </button>
      }
    </div>

    <div class="card" style="margin-top: 16px; padding: 20px; display: grid; gap: 16px">
      <fieldset class="field" style="border: 0; padding: 0; margin: 0">
        <span class="field__label">Event names (1–{{ maxEventNames }})</span>
        <div class="chips" style="margin-bottom: 8px">
          @for (name of eventNames(); track name) {
            <span class="chip">
              {{ humanize(name) }}
              <button
                class="chip__remove"
                type="button"
                [attr.aria-label]="'Remove ' + humanize(name)"
                (click)="removeEventName(name)"
              >
                ×
              </button>
            </span>
          } @empty {
            <span class="muted">No event names selected yet.</span>
          }
        </div>
        <div style="display: flex; gap: 8px">
          <input
            class="input"
            list="prodEventCatalog"
            placeholder="e.g. task_created"
            [ngModel]="eventDraft()"
            (ngModelChange)="eventDraft.set($event)"
            (keyup.enter)="addEventName()"
          />
          <datalist id="prodEventCatalog">
            @for (name of eventCatalog(); track name) {
              <option [value]="name"></option>
            }
          </datalist>
          <button class="btn btn--ghost btn--sm" type="button" (click)="addEventName()">Add</button>
        </div>
        <span class="field__hint">
          Suggestions are seeded from feature adoption over the last 90 days.
        </span>
      </fieldset>
      <label class="field" style="max-width: 320px">
        <span class="field__label">User ID (optional)</span>
        <input
          class="input"
          placeholder="Filter to a single user"
          [ngModel]="userId()"
          (ngModelChange)="userId.set($event)"
        />
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
    } @else if (eventSeries(); as series) {
      @if (series.length === 0) {
        <div class="state state--col">
          <p class="state__empty">No activity in this range.</p>
        </div>
      } @else {
        @for (s of series; track s.eventName) {
          <div class="card" style="padding: 20px; display: grid; gap: 8px; margin-top: 12px">
            <div class="toolbar">
              <p class="section-title" style="margin: 0">{{ humanize(s.eventName) }}</p>
              <span class="toolbar__spacer"></span>
              <span class="muted">Total {{ s.total }} · Peak {{ s.peak }}</span>
            </div>
            <app-mini-chart
              [points]="s.chartPoints"
              type="line"
              [height]="40"
              [ariaLabel]="humanize(s.eventName) + ' daily trend'"
            />
          </div>
        }
      }
    } @else {
      <div class="state state--col">
        <p class="state__empty">Enter event names and a date range, then Run.</p>
      </div>
    }
  `,
})
export class ProductivityTrendComponent implements OnInit {
  private readonly _service = inject(InsightsService);
  private readonly _savedViews = inject(InsightsSavedViewsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly maxEventNames = MAX_EVENT_NAMES;

  protected readonly fromDate = signal<string>(defaultFrom());
  protected readonly toDate = signal<string>(defaultTo());
  protected readonly eventNames = signal<string[]>([]);
  protected readonly eventDraft = signal<string>('');
  protected readonly userId = signal<string>('');
  protected readonly eventCatalog = signal<string[]>([]);

  protected readonly data = signal<ProductivityPoint[] | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly savedViews = computed(() => this._savedViews.forKind('productivity'));
  protected readonly selectedViewId = signal<string>('');
  protected readonly newViewName = signal<string>('');

  protected readonly eventSeries = computed<EventSeries[]>(() => {
    const rows = this.data();
    if (!rows || rows.length === 0) {
      return [];
    }
    const byEvent = new Map<string, ProductivityPoint[]>();
    for (const row of rows) {
      const list = byEvent.get(row.eventName) ?? [];
      list.push(row);
      byEvent.set(row.eventName, list);
    }
    return [...byEvent.entries()].map(([eventName, points]) => {
      const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
      const total = sorted.reduce((sum, p) => sum + p.count, 0);
      const peak = sorted.reduce((max, p) => Math.max(max, p.count), 0);
      return {
        eventName,
        total,
        peak,
        chartPoints: sorted.map((p) => ({ label: this.shortDate(p.date), value: p.count })),
      };
    });
  });

  public ngOnInit(): void {
    this._loadCatalog();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected shortDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }

  protected applyPreset(days: 7 | 30 | 90 | 180): void {
    this.fromDate.set(defaultFrom(days));
    this.toDate.set(defaultTo());
  }

  protected addEventName(): void {
    const raw = this.eventDraft().trim();
    if (!raw) {
      return;
    }
    if (this.eventNames().includes(raw)) {
      this.eventDraft.set('');
      return;
    }
    if (this.eventNames().length >= MAX_EVENT_NAMES) {
      this.error.set(`You can track up to ${MAX_EVENT_NAMES} event names.`);
      return;
    }
    this.eventNames.update((list) => [...list, raw]);
    this.eventDraft.set('');
  }

  protected removeEventName(name: string): void {
    this.eventNames.update((list) => list.filter((n) => n !== name));
  }

  protected applySavedView(id: string): void {
    this.selectedViewId.set(id);
    if (!id) {
      return;
    }
    const view = this._savedViews.find(id);
    if (!view) {
      return;
    }
    this.fromDate.set(view.fromDate);
    this.toDate.set(view.toDate);
    this.eventNames.set(view.eventNames ? [...view.eventNames] : []);
    this.userId.set(view.userId ?? '');
    this.run();
  }

  protected saveCurrentView(): void {
    const name = this.newViewName().trim();
    if (!name || this.eventNames().length === 0) {
      return;
    }
    const saved = this._savedViews.save({
      name,
      kind: 'productivity',
      fromDate: this.fromDate(),
      toDate: this.toDate(),
      eventNames: [...this.eventNames()],
      userId: this.userId().trim() || undefined,
    });
    this.newViewName.set('');
    this.selectedViewId.set(saved.id);
  }

  protected deleteSelectedView(): void {
    const id = this.selectedViewId();
    if (!id) {
      return;
    }
    this._savedViews.remove(id);
    this.selectedViewId.set('');
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
    const names = this.eventNames();
    if (names.length < 1 || names.length > MAX_EVENT_NAMES) {
      this.error.set(`Enter between 1 and ${MAX_EVENT_NAMES} event names.`);
      this.data.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this._service
      .productivityTrend(this.fromDate(), this.toDate(), names, this.userId().trim() || undefined)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (!res) {
          this.error.set('Could not load the productivity trend.');
          return;
        }
        this.data.set(res.series);
      });
  }

  private _loadCatalog(): void {
    this._service
      .featureAdoption(defaultFrom(90), defaultTo(), 100)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        if (res) {
          this.eventCatalog.set(res.items.map((item) => item.eventName).sort());
        }
      });
  }
}
