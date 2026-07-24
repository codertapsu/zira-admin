import {
  ChangeDetectionStrategy,
  Component,
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
import { ExportsService } from './exports.service';
import type { ExportAuditLogResponse } from './exports.models';

/** Render `scopeParams` as a compact `key: value, key: value` summary for the table + CSV. */
function summarizeScope(scope: Record<string, unknown> | null): string {
  if (!scope) {
    return '';
  }
  const entries = Object.entries(scope);
  if (entries.length === 0) {
    return '';
  }
  return entries.map(([key, value]) => `${key}: ${formatScopeValue(value)}`).join(', ');
}

function formatScopeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

const EXPORT_AUDIT_CSV_COLUMNS: readonly CsvColumn<ExportAuditLogResponse>[] = [
  { key: 'createdAt', label: 'Created at', value: (r) => r.createdAt },
  { key: 'userId', label: 'Actor user ID', value: (r) => r.userId },
  { key: 'exportType', label: 'Export type', value: (r) => r.exportType },
  { key: 'scope', label: 'Scope', value: (r) => summarizeScope(r.scopeParams) },
  { key: 'fileId', label: 'File ID', value: (r) => r.fileId ?? '' },
  { key: 'fileUrl', label: 'File URL', value: (r) => r.fileUrl ?? '' },
  { key: 'ip', label: 'IP', value: (r) => r.ip ?? '' },
];

/**
 * Data-egress audit: a read-only, filterable trail of every report export and
 * admin-initiated user data export (`GET /admin/export-audit`).
 */
@Component({
  selector: 'app-exports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Exports</h1>
      </header>

      <div class="toolbar">
        <label class="field" style="max-width: 260px">
          <span class="field__label">Actor user ID</span>
          <input
            class="input"
            placeholder="Filter by actor UUID"
            [ngModel]="userId()"
            (ngModelChange)="userId.set($event)"
            (keyup.enter)="search()"
          />
        </label>
        <label class="field" style="max-width: 180px">
          <span class="field__label">From (inclusive)</span>
          <input
            class="input"
            type="date"
            [ngModel]="fromDate()"
            (ngModelChange)="fromDate.set($event)"
          />
        </label>
        <label class="field" style="max-width: 180px">
          <span class="field__label">To (inclusive)</span>
          <input
            class="input"
            type="date"
            [ngModel]="toDate()"
            (ngModelChange)="toDate.set($event)"
          />
        </label>
        <button class="btn btn--primary btn--sm" type="button" (click)="search()">Search</button>
        @if (hasFilters()) {
          <button class="btn btn--ghost btn--sm" type="button" (click)="clearFilters()">
            Clear
          </button>
        }
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="items().length === 0"
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
          <button class="btn btn--primary btn--sm" type="button" (click)="search()">Retry</button>
        </div>
      } @else if (items().length === 0) {
        <div class="state state--col"><p class="state__empty">No export events found.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Export type</th>
                <th>Scope</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.id) {
                <tr>
                  <td style="white-space: nowrap">{{ formatDate(row.createdAt) }}</td>
                  <td>
                    <a
                      class="table__link"
                      [routerLink]="['/users', row.userId]"
                      [title]="row.userId"
                    >
                      {{ shortId(row.userId) }}
                    </a>
                  </td>
                  <td>{{ humanize(row.exportType) }}</td>
                  <td>
                    <div
                      style="
                        max-width: 320px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                      "
                      [attr.title]="scopeSummary(row) || null"
                    >
                      {{ scopeSummary(row) || '—' }}
                    </div>
                  </td>
                  <td>
                    @if (row.fileUrl) {
                      <a class="table__link" [href]="row.fileUrl" target="_blank" rel="noopener">
                        Download
                      </a>
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
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
              [disabled]="loadingMore()"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class ExportsComponent implements OnInit {
  private readonly _exports = inject(ExportsService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly userId = signal<string>('');
  protected readonly fromDate = signal<string>('');
  protected readonly toDate = signal<string>('');

  protected readonly items = signal<ExportAuditLogResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);

  public ngOnInit(): void {
    this._fetch();
  }

  protected humanize(value: string): string {
    return value.replace(/-|_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected shortId(id: string): string {
    return id.length > 12 ? `${id.slice(0, 8)}…` : id;
  }

  protected scopeSummary(row: ExportAuditLogResponse): string {
    return summarizeScope(row.scopeParams);
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }

  protected hasFilters(): boolean {
    return (
      this.userId().trim().length > 0 || this.fromDate().length > 0 || this.toDate().length > 0
    );
  }

  protected clearFilters(): void {
    this.userId.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.search();
  }

  protected search(): void {
    this._fetch();
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore()) {
      return;
    }
    this._fetch(cursor);
  }

  protected exportCsv(): void {
    downloadCsv('export-audit.csv', EXPORT_AUDIT_CSV_COLUMNS, this.items());
  }

  private _fetch(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    this.error.set(null);

    const userId = this.userId().trim();
    this._exports
      .list(
        {
          userId: userId.length > 0 ? userId : undefined,
          from: this._isoBound(this.fromDate(), 'start'),
          to: this._isoBound(this.toDate(), 'end'),
        },
        cursor,
        50,
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (res === null) {
          this.error.set('Could not load export events. Please try again.');
          return;
        }
        this.items.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.nextCursor.set(res.nextCursor);
        this.hasMore.set(res.hasMore);
      });
  }

  /** A bare `YYYY-MM-DD` date-input value is midnight UTC — push `to` to the end of that day so the filter is truly inclusive. */
  private _isoBound(dateStr: string, edge: 'start' | 'end'): string | undefined {
    if (!dateStr) {
      return undefined;
    }
    return edge === 'start' ? `${dateStr}T00:00:00.000Z` : `${dateStr}T23:59:59.999Z`;
  }
}
