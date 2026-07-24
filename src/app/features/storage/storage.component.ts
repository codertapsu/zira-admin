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

import { type CsvColumn, downloadCsv } from '../../core/ui/csv.util';
import { type ChartPoint, MiniChartComponent } from '../../core/ui/mini-chart.component';
import { NotificationService } from '../../core/ui/notification.service';
import { StorageService } from './storage.service';
import {
  type AdminFileResponse,
  FILE_STATUSES,
  type FileStatus,
  type FilesOverviewResponse,
} from './storage.models';

type StorageTab = 'overview' | 'byUser';

const STORAGE_FILE_CSV_COLUMNS: readonly CsvColumn<AdminFileResponse>[] = [
  { key: 'originalName', label: 'Name', value: (r) => r.originalName },
  { key: 'contentType', label: 'Type', value: (r) => r.contentType },
  { key: 'size', label: 'Size (bytes)', value: (r) => r.size },
  { key: 'status', label: 'Status', value: (r) => r.status },
  { key: 'driver', label: 'Driver', value: (r) => r.driver },
  { key: 'createdAt', label: 'Created at', value: (r) => r.createdAt },
];

/** Base-1024 byte humanizer for the overview stats and per-file table. */
function humanizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[exponent]}`;
}

/** File-storage overview (aggregate counts/sizes) plus a per-user file browser. */
@Component({
  selector: 'app-storage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MiniChartComponent],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Storage</h1>
      </header>

      <nav class="tabs" aria-label="Storage sections">
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'overview'"
          (click)="tab.set('overview')"
        >
          Overview
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'byUser'"
          (click)="tab.set('byUser')"
        >
          By user
        </button>
      </nav>

      @switch (tab()) {
        @case ('overview') {
          @if (overviewLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (overviewError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="loadOverview()">
                Retry
              </button>
            </div>
          } @else if (overview(); as data) {
            <div class="stat-grid" style="margin-top: 16px">
              <div class="stat">
                <span class="stat__label">Total files</span>
                <span class="stat__value">{{ data.totalCount.toLocaleString() }}</span>
              </div>
              <div class="stat">
                <span class="stat__label">Total size</span>
                <span class="stat__value">{{ humanizeBytes(data.totalSize) }}</span>
              </div>
            </div>

            <div class="card" style="padding: 20px; margin-top: 16px">
              <p class="section-title" style="margin-bottom: 8px">Size by status</p>
              <app-mini-chart
                [points]="statusChartPoints()"
                type="bar"
                [height]="40"
                ariaLabel="Total file size by status"
              />
            </div>

            <div class="form-grid" style="margin-top: 16px">
              <div>
                <p class="section-title">By status</p>
                @if (data.byStatus.length === 0) {
                  <p class="state__empty">No files.</p>
                } @else {
                  <div class="table-wrap card" style="margin-top: 8px">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Count</th>
                          <th>Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (bucket of data.byStatus; track bucket.label) {
                          <tr>
                            <td>
                              <span class="badge badge--{{ statusBadge(bucket.label) }}">{{
                                humanize(bucket.label)
                              }}</span>
                            </td>
                            <td>{{ bucket.count.toLocaleString() }}</td>
                            <td>{{ humanizeBytes(bucket.totalSize) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </div>
              <div>
                <p class="section-title">By driver</p>
                @if (data.byDriver.length === 0) {
                  <p class="state__empty">No files.</p>
                } @else {
                  <div class="table-wrap card" style="margin-top: 8px">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Driver</th>
                          <th>Count</th>
                          <th>Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (bucket of data.byDriver; track bucket.label) {
                          <tr>
                            <td>{{ humanize(bucket.label) }}</td>
                            <td>{{ bucket.count.toLocaleString() }}</td>
                            <td>{{ humanizeBytes(bucket.totalSize) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            </div>
          }
        }

        @case ('byUser') {
          <div class="toolbar" style="margin-top: 16px">
            <input
              class="input"
              type="text"
              aria-label="User ID"
              placeholder="Paste a user ID…"
              style="max-width: 320px"
              [ngModel]="userId()"
              (ngModelChange)="userId.set($event)"
              (keyup.enter)="searchByUser()"
            />
            <select
              class="input"
              aria-label="Filter by status"
              style="max-width: 160px"
              [ngModel]="statusFilter()"
              (ngModelChange)="statusFilter.set($event); searchByUser()"
            >
              <option value="">All statuses</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ humanize(s) }}</option>
              }
            </select>
            <button
              class="btn btn--primary btn--sm"
              type="button"
              [disabled]="!userId().trim()"
              (click)="searchByUser()"
            >
              Search
            </button>
            <div class="toolbar__spacer"></div>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              [disabled]="files().length === 0"
              (click)="exportCsv()"
            >
              Export CSV
            </button>
          </div>

          @if (!hasSearched()) {
            <div class="state state--col">
              <p class="state__empty">Paste a user ID and search to list their files.</p>
            </div>
          } @else if (byUserLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (byUserError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="searchByUser()">
                Retry
              </button>
            </div>
          } @else if (files().length === 0) {
            <div class="state state--col"><p class="state__empty">No files found.</p></div>
          } @else {
            <div class="table-wrap card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th class="table__actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (file of files(); track file.id) {
                    <tr>
                      <td
                        class="table__name"
                        style="
                          max-width: 320px;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          white-space: nowrap;
                        "
                        [attr.title]="file.originalName"
                      >
                        {{ file.originalName || '—' }}
                      </td>
                      <td>{{ file.contentType || '—' }}</td>
                      <td>{{ humanizeBytes(file.size) }}</td>
                      <td>
                        <span class="badge badge--{{ statusBadge(file.status) }}">{{
                          humanize(file.status)
                        }}</span>
                      </td>
                      <td>{{ formatDate(file.createdAt) }}</td>
                      <td class="table__actions-col">
                        <button
                          class="btn btn--sm btn--ghost"
                          type="button"
                          [disabled]="isDownloading(file.id)"
                          (click)="download(file)"
                        >
                          {{ isDownloading(file.id) ? 'Opening…' : 'Download' }}
                        </button>
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
        }
      }
    </section>
  `,
})
export class StorageComponent implements OnInit {
  private readonly _storage = inject(StorageService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = FILE_STATUSES;
  protected readonly tab = signal<StorageTab>('overview');
  protected readonly humanizeBytes = humanizeBytes;

  // Overview
  protected readonly overview = signal<FilesOverviewResponse | null>(null);
  protected readonly overviewLoading = signal<boolean>(false);
  protected readonly overviewError = signal<string | null>(null);
  protected readonly statusChartPoints = computed<ChartPoint[]>(() =>
    (this.overview()?.byStatus ?? []).map((bucket) => ({
      label: this.humanize(bucket.label),
      value: bucket.totalSize,
    })),
  );

  // By user
  protected readonly userId = signal<string>('');
  protected readonly statusFilter = signal<FileStatus | ''>('');
  protected readonly files = signal<AdminFileResponse[]>([]);
  protected readonly byUserLoading = signal<boolean>(false);
  protected readonly byUserError = signal<string | null>(null);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly hasMore = signal<boolean>(false);
  protected readonly hasSearched = signal<boolean>(false);
  protected readonly downloadingIds = signal<ReadonlySet<string>>(new Set());
  private readonly _nextCursor = signal<string | null>(null);

  public ngOnInit(): void {
    this.loadOverview();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected statusBadge(status: string): 'ok' | 'muted' | 'danger' {
    if (status === 'active') {
      return 'ok';
    }
    if (status === 'deleted') {
      return 'danger';
    }
    return 'muted';
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  protected isDownloading(id: string): boolean {
    return this.downloadingIds().has(id);
  }

  protected loadOverview(): void {
    if (this.overviewLoading()) {
      return;
    }
    this.overviewLoading.set(true);
    this.overviewError.set(null);
    this._storage
      .overview()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.overviewLoading.set(false);
        if (data === null) {
          this.overviewError.set('Could not load the storage overview. Please try again.');
          return;
        }
        this.overview.set(data);
      });
  }

  protected searchByUser(): void {
    const id = this.userId().trim();
    if (!id) {
      return;
    }
    this._fetchFiles(id);
  }

  protected loadMore(): void {
    const id = this.userId().trim();
    const cursor = this._nextCursor();
    if (!id || cursor === null || this.loadingMore()) {
      return;
    }
    this._fetchFiles(id, cursor);
  }

  protected exportCsv(): void {
    downloadCsv('files.csv', STORAGE_FILE_CSV_COLUMNS, this.files());
  }

  protected download(file: AdminFileResponse): void {
    if (this.isDownloading(file.id)) {
      return;
    }
    this._setDownloading(file.id, true);
    this._storage
      .downloadUrl(file.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (url) => {
          this._setDownloading(file.id, false);
          window.open(url, '_blank', 'noopener');
        },
        error: () => {
          this._setDownloading(file.id, false);
          this._notify.error('Could not resolve a download link for this file.');
        },
      });
  }

  private _fetchFiles(userId: string, cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.byUserLoading.set(true);
      this.hasSearched.set(true);
    } else {
      this.loadingMore.set(true);
    }
    this.byUserError.set(null);

    this._storage
      .listForUser(userId, { status: this.statusFilter() || undefined }, cursor, 50)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.byUserLoading.set(false);
        this.loadingMore.set(false);
        if (page === null) {
          this.byUserError.set('Could not load files for this user. Please try again.');
          return;
        }
        this.files.update((prev) => (isInitial ? page.items : [...prev, ...page.items]));
        this._nextCursor.set(page.nextCursor);
        this.hasMore.set(page.hasMore);
      });
  }

  private _setDownloading(id: string, downloading: boolean): void {
    this.downloadingIds.update((current) => {
      const next = new Set(current);
      if (downloading) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}
