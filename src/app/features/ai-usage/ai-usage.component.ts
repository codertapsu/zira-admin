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

import { downloadCsv, type CsvColumn } from '../../core/ui/csv.util';
import { defaultFrom, defaultTo, validateRange } from '../insights/insights-dates.util';
import { AiUsageService } from './ai-usage.service';
import type {
  AiUsageListResponse,
  AiUsageRow,
  AiUsageSummaryResponse,
  AiUsageSummaryRow,
} from './ai-usage.models';

type AiUsageTab = 'summary' | 'rows';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-ai-usage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">AI usage</h1>
      </header>

      <p class="muted" style="margin-bottom: 16px">
        Provider calls billed to Zira — tokens, audio minutes and characters. Costs are
        <strong>estimates</strong> priced at read time; the provider's own invoice is authoritative.
        No prompt or response content is recorded.
      </p>

      <!-- Window -->
      <div class="card" style="padding: 20px; margin-bottom: 16px">
        <div class="toolbar">
          <label class="field" style="max-width: 190px">
            <span class="field__label">From</span>
            <input
              class="input"
              type="date"
              [ngModel]="fromDate()"
              (ngModelChange)="fromDate.set($event)"
            />
          </label>
          <label class="field" style="max-width: 190px">
            <span class="field__label">To</span>
            <input
              class="input"
              type="date"
              [ngModel]="toDate()"
              (ngModelChange)="toDate.set($event)"
            />
          </label>
          <span class="toolbar__spacer"></span>
          <button class="btn btn--ghost btn--sm" type="button" (click)="preset(7)">7d</button>
          <button class="btn btn--ghost btn--sm" type="button" (click)="preset(30)">30d</button>
          <button class="btn btn--ghost btn--sm" type="button" (click)="preset(90)">90d</button>
          <button class="btn btn--primary btn--sm" type="button" (click)="reload()">Apply</button>
        </div>
        @if (rangeError(); as message) {
          <p class="state__error" style="margin-top: 10px">{{ message }}</p>
        }
      </div>

      <nav class="tabs" aria-label="AI usage sections">
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'summary'"
          (click)="setTab('summary')"
        >
          Summary
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'rows'"
          (click)="setTab('rows')"
        >
          Calls
        </button>
      </nav>

      @switch (tab()) {
        @case ('summary') {
          @if (summaryLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (summaryError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="loadSummary()">
                Retry
              </button>
            </div>
          } @else if (summary(); as data) {
            <div class="stat-grid" style="margin-top: 16px">
              <div class="stat">
                <span class="stat__value">{{ money(data.totalEstimatedCostUsd) }}</span>
                <span class="stat__label">Estimated spend</span>
              </div>
              <div class="stat">
                <span class="stat__value">{{ totalCalls() }}</span>
                <span class="stat__label">Calls</span>
              </div>
              <div class="stat">
                <span class="stat__value">{{ totalErrors() }}</span>
                <span class="stat__label">Failed calls</span>
              </div>
              <div class="stat">
                <span class="stat__value">{{ unpricedCount() }}</span>
                <span class="stat__label">Unpriced models</span>
              </div>
            </div>

            @if (unpricedCount() > 0) {
              <p class="muted" style="margin-top: 12px">
                {{ unpricedCount() }} model(s) have no entry in the server rate table, so their
                spend is excluded from the total. Add them to <code>ai-pricing.ts</code> to price
                them.
              </p>
            }

            <div class="toolbar" style="margin-top: 16px">
              <span class="muted">
                Rate table {{ data.pricingRevision }} · {{ formatDate(data.from) }} →
                {{ formatDate(data.to) }}
              </span>
              <span class="toolbar__spacer"></span>
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                [disabled]="data.rows.length === 0"
                (click)="exportSummary()"
              >
                Export CSV
              </button>
            </div>

            @if (data.rows.length === 0) {
              <div class="state state--col">
                <p class="state__empty">No AI calls in this window.</p>
              </div>
            } @else {
              <div class="table-wrap card">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Model</th>
                      <th>Calls</th>
                      <th>Errors</th>
                      <th>Input tokens</th>
                      <th>Output tokens</th>
                      <th>Audio</th>
                      <th>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of data.rows; track row.feature + '|' + row.model) {
                      <tr>
                        <td>{{ humanize(row.feature) }}</td>
                        <td class="mono">{{ row.model }}</td>
                        <td>{{ row.calls }}</td>
                        <td>
                          @if (row.errors > 0) {
                            <span class="badge badge--muted">{{ row.errors }}</span>
                          } @else {
                            0
                          }
                        </td>
                        <td>{{ row.inputTokens || '—' }}</td>
                        <td>{{ row.outputTokens || '—' }}</td>
                        <td>{{ row.audioMs ? minutes(row.audioMs) : '—' }}</td>
                        <td>{{ money(row.estimatedCostUsd) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }

        @case ('rows') {
          <div class="toolbar" style="margin-top: 16px">
            <label class="field" style="max-width: 220px">
              <span class="field__label">Feature</span>
              <input
                class="input"
                placeholder="e.g. voice_capture"
                [ngModel]="featureFilter()"
                (ngModelChange)="featureFilter.set($event)"
              />
            </label>
            <label class="field" style="max-width: 320px">
              <span class="field__label">User ID</span>
              <input
                class="input"
                placeholder="UUID"
                [ngModel]="userFilter()"
                (ngModelChange)="userFilter.set($event)"
              />
            </label>
            <span class="toolbar__spacer"></span>
            <button class="btn btn--primary btn--sm" type="button" (click)="searchRows()">
              Search
            </button>
          </div>

          @if (rowsLoading() && rows().length === 0) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (rowsError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="searchRows()">
                Retry
              </button>
            </div>
          } @else if (rows().length === 0) {
            <div class="state state--col"><p class="state__empty">No AI calls found.</p></div>
          } @else {
            <div class="toolbar" style="margin-top: 12px">
              <span class="muted">Showing {{ rows().length }} of {{ rowsTotal() }}</span>
              <span class="toolbar__spacer"></span>
              <button class="btn btn--ghost btn--sm" type="button" (click)="exportRows()">
                Export CSV
              </button>
            </div>
            <div class="table-wrap card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Feature</th>
                    <th>Operation</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Tokens (in/out)</th>
                    <th>Latency</th>
                    <th>Est. cost</th>
                    <th>User</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id) {
                    <tr>
                      <td style="white-space: nowrap">{{ formatDate(row.createdAt) }}</td>
                      <td>{{ humanize(row.feature) }}</td>
                      <td>{{ humanize(row.operation) }}</td>
                      <td class="mono">{{ row.model }}</td>
                      <td>
                        @if (row.status === 'ok') {
                          <span class="badge badge--ok">ok</span>
                        } @else {
                          <span class="badge badge--muted" [attr.title]="row.errorCode || ''">{{
                            row.errorCode || 'error'
                          }}</span>
                        }
                      </td>
                      <td>{{ tokenPair(row) }}</td>
                      <td>{{ row.latencyMs }} ms</td>
                      <td>{{ money(row.estimatedCostUsd) }}</td>
                      <td class="mono">{{ row.userId || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (hasMore()) {
              <div class="page__more">
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  [disabled]="rowsLoading()"
                  (click)="loadMore()"
                >
                  {{ rowsLoading() ? 'Loading…' : 'Load more' }}
                </button>
              </div>
            }
          }
        }
      }
    </section>
  `,
})
export class AiUsageComponent implements OnInit {
  private readonly _service = inject(AiUsageService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly tab = signal<AiUsageTab>('summary');
  protected readonly fromDate = signal<string>(defaultFrom(30));
  protected readonly toDate = signal<string>(defaultTo());
  protected readonly rangeError = signal<string | null>(null);

  protected readonly summary = signal<AiUsageSummaryResponse | null>(null);
  protected readonly summaryLoading = signal<boolean>(false);
  protected readonly summaryError = signal<string | null>(null);

  protected readonly rows = signal<AiUsageRow[]>([]);
  protected readonly rowsTotal = signal<number>(0);
  protected readonly rowsLoading = signal<boolean>(false);
  protected readonly rowsError = signal<string | null>(null);
  protected readonly featureFilter = signal<string>('');
  protected readonly userFilter = signal<string>('');

  protected readonly totalCalls = computed(() =>
    (this.summary()?.rows ?? []).reduce((sum, row) => sum + row.calls, 0),
  );
  protected readonly totalErrors = computed(() =>
    (this.summary()?.rows ?? []).reduce((sum, row) => sum + row.errors, 0),
  );
  protected readonly unpricedCount = computed(
    () => (this.summary()?.rows ?? []).filter((row) => row.estimatedCostUsd === null).length,
  );
  protected readonly hasMore = computed(() => this.rows().length < this.rowsTotal());

  public ngOnInit(): void {
    this.loadSummary();
  }

  protected setTab(next: AiUsageTab): void {
    this.tab.set(next);
    if (next === 'rows' && this.rows().length === 0 && !this.rowsError()) {
      this.searchRows();
    }
  }

  protected preset(daysBack: number): void {
    this.fromDate.set(defaultFrom(daysBack));
    this.toDate.set(defaultTo());
    this.reload();
  }

  /** Re-runs whichever tab is open, so Apply always does something visible. */
  protected reload(): void {
    if (this.tab() === 'rows') {
      this.searchRows();
      return;
    }
    this.loadSummary();
  }

  protected loadSummary(): void {
    if (this.summaryLoading() || !this._validate()) {
      return;
    }
    this.summaryLoading.set(true);
    this.summaryError.set(null);
    this._service
      .summary({ from: this.fromDate(), to: this.toDate() })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.summaryLoading.set(false);
        if (!data) {
          this.summaryError.set('Could not load AI usage summary.');
          return;
        }
        this.summary.set(data);
      });
  }

  protected searchRows(): void {
    this.rows.set([]);
    this.rowsTotal.set(0);
    this._fetchRows(0);
  }

  protected loadMore(): void {
    this._fetchRows(this.rows().length);
  }

  protected exportSummary(): void {
    const columns: CsvColumn<AiUsageSummaryRow>[] = [
      { key: 'feature', label: 'Feature', value: (r) => r.feature },
      { key: 'model', label: 'Model', value: (r) => r.model },
      { key: 'calls', label: 'Calls', value: (r) => r.calls },
      { key: 'errors', label: 'Errors', value: (r) => r.errors },
      { key: 'inputTokens', label: 'Input tokens', value: (r) => r.inputTokens },
      { key: 'outputTokens', label: 'Output tokens', value: (r) => r.outputTokens },
      { key: 'audioMs', label: 'Audio ms', value: (r) => r.audioMs },
      { key: 'inputChars', label: 'Input chars', value: (r) => r.inputChars },
      // Empty, not 0, when unpriced — a spreadsheet SUM must not count it as free.
      {
        key: 'estimatedCostUsd',
        label: 'Estimated cost USD',
        value: (r) => r.estimatedCostUsd,
      },
    ];
    downloadCsv(`ai-usage-summary-${this.fromDate()}_${this.toDate()}.csv`, columns, [
      ...(this.summary()?.rows ?? []),
    ]);
  }

  protected exportRows(): void {
    const columns: CsvColumn<AiUsageRow>[] = [
      { key: 'createdAt', label: 'Time', value: (r) => r.createdAt },
      { key: 'feature', label: 'Feature', value: (r) => r.feature },
      { key: 'operation', label: 'Operation', value: (r) => r.operation },
      { key: 'provider', label: 'Provider', value: (r) => r.provider },
      { key: 'model', label: 'Model', value: (r) => r.model },
      { key: 'status', label: 'Status', value: (r) => r.status },
      { key: 'errorCode', label: 'Error code', value: (r) => r.errorCode },
      { key: 'inputTokens', label: 'Input tokens', value: (r) => r.inputTokens },
      { key: 'outputTokens', label: 'Output tokens', value: (r) => r.outputTokens },
      { key: 'audioMs', label: 'Audio ms', value: (r) => r.audioMs },
      { key: 'inputChars', label: 'Input chars', value: (r) => r.inputChars },
      { key: 'latencyMs', label: 'Latency ms', value: (r) => r.latencyMs },
      {
        key: 'estimatedCostUsd',
        label: 'Estimated cost USD',
        value: (r) => r.estimatedCostUsd,
      },
      { key: 'userId', label: 'User ID', value: (r) => r.userId },
    ];
    downloadCsv(`ai-usage-calls-${this.fromDate()}_${this.toDate()}.csv`, columns, this.rows());
  }

  /**
   * `null` means the model is missing from the server's rate table. Rendering
   * it as "$0.00" would read as free; it has to read as unknown.
   */
  protected money(value: number | null): string {
    if (value === null || value === undefined) {
      return 'Unpriced';
    }
    // Sub-cent totals are normal for a single call — show enough precision to
    // avoid a table full of "$0.00".
    const digits = value > 0 && value < 0.01 ? 4 : 2;
    return `$${value.toFixed(digits)}`;
  }

  protected minutes(ms: number): string {
    return `${(ms / 60_000).toFixed(1)} min`;
  }

  protected tokenPair(row: AiUsageRow): string {
    if (row.inputTokens === null && row.outputTokens === null) {
      return '—';
    }
    return `${row.inputTokens ?? 0} / ${row.outputTokens ?? 0}`;
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

  private _fetchRows(offset: number): void {
    if (this.rowsLoading() || !this._validate()) {
      return;
    }
    this.rowsLoading.set(true);
    this.rowsError.set(null);
    this._service
      .list(
        {
          from: this.fromDate(),
          to: this.toDate(),
          feature: this.featureFilter().trim() || undefined,
          userId: this.userFilter().trim() || undefined,
        },
        offset,
        PAGE_SIZE,
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data: AiUsageListResponse | null) => {
        this.rowsLoading.set(false);
        if (!data) {
          this.rowsError.set('Could not load AI usage rows.');
          return;
        }
        this.rows.update((current) => (offset === 0 ? data.rows : [...current, ...data.rows]));
        this.rowsTotal.set(data.total);
      });
  }

  /** Pre-validates the window client-side; the server 400s past 180 days. */
  private _validate(): boolean {
    const message = validateRange(this.fromDate(), this.toDate());
    this.rangeError.set(message);
    return message === null;
  }
}
