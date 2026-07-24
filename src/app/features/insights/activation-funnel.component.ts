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

import { defaultFrom, defaultTo, validateRange } from './insights-dates.util';
import { InsightsSavedViewsService } from './insights-saved-views.service';
import { InsightsService } from './insights.service';
import type { FunnelStep } from './insights.models';

const ACTIVATION_PRESET_STEPS = ['app_opened', 'quick_create_opened', 'first_task_created'];

@Component({
  selector: 'app-activation-funnel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
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
        [disabled]="!newViewName().trim()"
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
      <div class="toolbar">
        <span class="muted">Presets:</span>
        <button class="btn btn--ghost btn--sm" type="button" (click)="applyActivationPreset()">
          Activation funnel
        </button>
        <button class="btn btn--ghost btn--sm" type="button" (click)="funnelSteps.set('')">
          Clear
        </button>
      </div>
      <label class="field">
        <span class="field__label">Ordered steps (2–8)</span>
        <textarea
          class="input"
          placeholder="One event per line, in order — e.g.&#10;app_opened&#10;quick_create_opened&#10;first_task_created"
          [ngModel]="funnelSteps()"
          (ngModelChange)="funnelSteps.set($event)"
        ></textarea>
        <span class="field__hint">Between 2 and 8 steps; order matters.</span>
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
    } @else if (data(); as steps) {
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
                      <span class="badge badge--muted">{{ pct(step.conversionFromPrev) }}</span>
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
  `,
})
export class ActivationFunnelComponent implements OnInit {
  private readonly _service = inject(InsightsService);
  private readonly _savedViews = inject(InsightsSavedViewsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly fromDate = signal<string>(defaultFrom());
  protected readonly toDate = signal<string>(defaultTo());
  protected readonly funnelSteps = signal<string>('');

  protected readonly data = signal<FunnelStep[] | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly savedViews = computed(() => this._savedViews.forKind('funnel'));
  protected readonly selectedViewId = signal<string>('');
  protected readonly newViewName = signal<string>('');

  public ngOnInit(): void {
    // Free-text steps — stays button-driven; nothing to auto-load.
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected pct(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  protected applyPreset(days: 7 | 30 | 90 | 180): void {
    this.fromDate.set(defaultFrom(days));
    this.toDate.set(defaultTo());
  }

  protected applyActivationPreset(): void {
    this.funnelSteps.set(ACTIVATION_PRESET_STEPS.join('\n'));
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
    this.funnelSteps.set((view.steps ?? []).join('\n'));
    this.run();
  }

  protected saveCurrentView(): void {
    const name = this.newViewName().trim();
    const steps = this._parseSteps();
    if (!name || steps.length === 0) {
      return;
    }
    const saved = this._savedViews.save({
      name,
      kind: 'funnel',
      fromDate: this.fromDate(),
      toDate: this.toDate(),
      steps,
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
    const steps = this._parseSteps();
    if (steps.length < 2 || steps.length > 8) {
      this.error.set('Enter between 2 and 8 ordered steps.');
      this.data.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this._service
      .activationFunnel(this.fromDate(), this.toDate(), steps)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (!res) {
          this.error.set('Could not load the activation funnel.');
          return;
        }
        this.data.set(res.steps);
      });
  }

  private _parseSteps(): string[] {
    return this.funnelSteps()
      .split(/[\n,]/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }
}
