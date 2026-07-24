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

import { catchError, forkJoin, of } from 'rxjs';

import { InsightsService } from './insights.service';
import type { ActivationCohortRow, RetentionCohortRow, UserFacts } from './insights.models';

interface FactEntry {
  key: string;
  value: string;
}

@Component({
  selector: 'app-cohorts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="card" style="margin-top: 16px; padding: 20px; display: grid; gap: 16px">
      <div class="form-grid">
        <label class="field" style="max-width: 200px">
          <span class="field__label">Weeks (1–26)</span>
          <input
            class="input"
            type="number"
            min="1"
            max="26"
            [ngModel]="weeks()"
            (ngModelChange)="weeks.set($event)"
          />
          <span class="field__hint">Weekly signup cohorts to look back.</span>
        </label>
        <label class="field" style="max-width: 200px">
          <span class="field__label">Activation window (1–90 days)</span>
          <input
            class="input"
            type="number"
            min="1"
            max="90"
            [ngModel]="withinDays()"
            (ngModelChange)="withinDays.set($event)"
          />
          <span class="field__hint">Days allowed to reach a milestone.</span>
        </label>
      </div>
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
    } @else if (cohorts(); as rows) {
      @if (rows.length === 0) {
        <div class="state state--col">
          <p class="state__empty">No signup cohorts in this window.</p>
        </div>
      } @else {
        <div class="table-wrap card" style="margin-top: 16px">
          <table class="table">
            <thead>
              <tr>
                <th>Cohort week</th>
                <th>Signups</th>
                <th>Reached first task</th>
                <th>Reached first project</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.cohortWeek) {
                <tr>
                  <td>{{ row.cohortWeek }}</td>
                  <td>{{ row.signups }}</td>
                  <td>
                    {{ row.reachedFirstTask }}
                    <span class="badge badge--ok" style="margin-left: 6px">{{
                      pct(row.firstTaskRate)
                    }}</span>
                  </td>
                  <td>
                    {{ row.reachedFirstProject }}
                    <span class="badge badge--ok" style="margin-left: 6px">{{
                      pct(row.firstProjectRate)
                    }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="table-wrap card" style="margin-top: 16px">
          <table class="table">
            <thead>
              <tr>
                <th>Cohort week</th>
                <th>Size</th>
                @for (offset of weekOffsets(); track offset) {
                  <th>W{{ offset }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of retention(); track row.cohortWeek) {
                <tr>
                  <td>{{ row.cohortWeek }}</td>
                  <td>{{ row.cohortSize }}</td>
                  @for (offset of weekOffsets(); track offset) {
                    <td [style.background]="cellBg(rateAt(row, offset))">
                      @if (rateAt(row, offset) === null) {
                        <span class="muted">—</span>
                      } @else {
                        {{ pct(rateAt(row, offset)!) }}
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <div class="state state--col">
        <p class="state__empty">Choose a window and Run to load cohorts and retention.</p>
      </div>
    }

    <div class="card" style="margin-top: 16px; padding: 20px; display: grid; gap: 16px">
      <p class="section-title">User lookup</p>
      <div class="toolbar">
        <label class="field" style="max-width: 320px; margin: 0">
          <span class="field__label">User ID</span>
          <input
            class="input"
            placeholder="UUID"
            [ngModel]="lookupUserId()"
            (ngModelChange)="lookupUserId.set($event)"
            (keyup.enter)="lookupUser()"
          />
        </label>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="lookupLoading() || !lookupUserId().trim()"
          (click)="lookupUser()"
        >
          {{ lookupLoading() ? 'Looking up…' : 'Look up' }}
        </button>
      </div>

      @if (lookupError(); as message) {
        <p class="state__error">{{ message }}</p>
      } @else if (lookupResult(); as facts) {
        <dl class="kv">
          <div>
            <dt class="kv__key">First seen</dt>
            <dd class="kv__val">{{ formatDate(facts.firstSeenAt) }}</dd>
          </div>
          <div>
            <dt class="kv__key">Last seen</dt>
            <dd class="kv__val">{{ formatDate(facts.lastSeenAt) }}</dd>
          </div>
          <div>
            <dt class="kv__key">Activated</dt>
            <dd class="kv__val">
              @if (facts.activatedAt) {
                <span class="badge badge--ok">{{ formatDate(facts.activatedAt) }}</span>
              } @else {
                <span class="badge badge--muted">Not yet</span>
              }
            </dd>
          </div>
          <div>
            <dt class="kv__key">First project</dt>
            <dd class="kv__val">{{ formatDate(facts.firstProjectCreatedAt) }}</dd>
          </div>
          <div>
            <dt class="kv__key">First task</dt>
            <dd class="kv__val">{{ formatDate(facts.firstTaskCreatedAt) }}</dd>
          </div>
          <div>
            <dt class="kv__key">First calendar event</dt>
            <dd class="kv__val">{{ formatDate(facts.firstCalendarEventCreatedAt) }}</dd>
          </div>
          <div>
            <dt class="kv__key">First note</dt>
            <dd class="kv__val">{{ formatDate(facts.firstNoteCreatedAt) }}</dd>
          </div>
          @for (entry of factsEntries(); track entry.key) {
            <div>
              <dt class="kv__key">{{ humanize(entry.key) }}</dt>
              <dd class="kv__val">{{ entry.value }}</dd>
            </div>
          }
        </dl>
      }
    </div>
  `,
})
export class CohortsComponent implements OnInit {
  private readonly _service = inject(InsightsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly weeks = signal<number>(12);
  protected readonly withinDays = signal<number>(7);

  protected readonly cohorts = signal<ActivationCohortRow[] | null>(null);
  protected readonly retention = signal<RetentionCohortRow[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly weekOffsets = computed<number[]>(() => {
    const max = this.retention().reduce(
      (acc, row) => Math.max(acc, ...row.cells.map((c) => c.weekOffset), 0),
      0,
    );
    return Array.from({ length: max + 1 }, (_, i) => i);
  });

  protected readonly lookupUserId = signal<string>('');
  protected readonly lookupResult = signal<UserFacts | null>(null);
  protected readonly lookupLoading = signal<boolean>(false);
  protected readonly lookupError = signal<string | null>(null);
  protected readonly factsEntries = computed<FactEntry[]>(() => {
    const facts = this.lookupResult()?.facts;
    if (!facts) {
      return [];
    }
    return Object.entries(facts).map(([key, value]) => ({
      key,
      value: value === null ? '—' : String(value),
    }));
  });

  public ngOnInit(): void {
    this.run();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected pct(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  protected rateAt(row: RetentionCohortRow, offset: number): number | null {
    const cell = row.cells.find((c) => c.weekOffset === offset);
    return cell ? cell.rate : null;
  }

  /** Heatmap intensity for a retention cell; capped at 85% opacity so text stays legible. */
  protected cellBg(rate: number | null): string {
    if (rate === null) {
      return 'transparent';
    }
    const pct = Math.max(0, Math.min(1, rate)) * 85;
    return `color-mix(in srgb, var(--primary) ${pct.toFixed(0)}%, transparent)`;
  }

  protected run(): void {
    if (this.loading()) {
      return;
    }
    const weeksNum = Number(this.weeks());
    const withinDaysNum = Number(this.withinDays());
    const safeWeeks = Number.isFinite(weeksNum) && weeksNum > 0 ? weeksNum : undefined;
    const safeWithin =
      Number.isFinite(withinDaysNum) && withinDaysNum > 0 ? withinDaysNum : undefined;

    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      cohorts: this._service.activationCohorts(safeWeeks, safeWithin),
      retention: this._service.retention(safeWeeks),
    })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (!res) {
          this.error.set('Could not load cohorts and retention.');
          return;
        }
        this.cohorts.set(res.cohorts.cohorts);
        this.retention.set(res.retention.cohorts);
      });
  }

  protected lookupUser(): void {
    const id = this.lookupUserId().trim();
    if (!id || this.lookupLoading()) {
      return;
    }
    this.lookupLoading.set(true);
    this.lookupError.set(null);
    this.lookupResult.set(null);
    this._service
      .userFacts(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((facts) => {
        this.lookupLoading.set(false);
        if (!facts) {
          this.lookupError.set('No activation record found for this user ID.');
          return;
        }
        this.lookupResult.set(facts);
      });
  }
}
