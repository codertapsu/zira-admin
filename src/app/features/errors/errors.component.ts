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
import { Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { type ChartPoint, MiniChartComponent } from '../../core/ui/mini-chart.component';
import { ErrorsService } from './errors.service';
import {
  CLIENT_ERROR_GROUP_FIELDS,
  type ClientErrorGroupField,
  type ClientErrorResponse,
  type ClientErrorTopItem,
} from './errors.models';

type ErrorsTab = 'feed' | 'top';

function toIsoStart(date: string): string | undefined {
  return date ? `${date}T00:00:00.000Z` : undefined;
}

function toIsoEnd(date: string): string | undefined {
  return date ? `${date}T23:59:59.999Z` : undefined;
}

/** Client-error triage: a filterable feed of individual reports plus a top-offenders rollup. */
@Component({
  selector: 'app-errors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MiniChartComponent],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Client errors</h1>
      </header>

      <nav class="tabs" aria-label="Client error sections">
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'feed'"
          (click)="tab.set('feed')"
        >
          Feed
        </button>
        <button class="tab" type="button" [class.is-active]="tab() === 'top'" (click)="selectTop()">
          Top offenders
        </button>
      </nav>

      @switch (tab()) {
        @case ('feed') {
          <div class="toolbar" style="margin-top: 16px">
            <input
              class="input"
              type="text"
              aria-label="Filter by environment"
              placeholder="Environment"
              style="max-width: 150px"
              [ngModel]="feedEnvironment()"
              (ngModelChange)="feedEnvironment.set($event)"
              (keyup.enter)="searchFeed()"
            />
            <input
              class="input"
              type="text"
              aria-label="Filter by app version"
              placeholder="App version"
              style="max-width: 150px"
              [ngModel]="feedAppVersion()"
              (ngModelChange)="feedAppVersion.set($event)"
              (keyup.enter)="searchFeed()"
            />
            <input
              class="input"
              type="text"
              aria-label="Filter by route"
              placeholder="Route"
              style="max-width: 180px"
              [ngModel]="feedRoute()"
              (ngModelChange)="feedRoute.set($event)"
              (keyup.enter)="searchFeed()"
            />
            <input
              class="input"
              type="text"
              aria-label="Filter by user id"
              placeholder="User ID"
              style="max-width: 180px"
              [ngModel]="feedUserId()"
              (ngModelChange)="feedUserId.set($event)"
              (keyup.enter)="searchFeed()"
            />
            <label class="field" style="max-width: 150px">
              <span class="field__label">From</span>
              <input
                class="input"
                type="date"
                [ngModel]="feedFromDate()"
                (ngModelChange)="feedFromDate.set($event)"
              />
            </label>
            <label class="field" style="max-width: 150px">
              <span class="field__label">To</span>
              <input
                class="input"
                type="date"
                [ngModel]="feedToDate()"
                (ngModelChange)="feedToDate.set($event)"
              />
            </label>
            <button class="btn btn--primary btn--sm" type="button" (click)="searchFeed()">
              Search
            </button>
          </div>

          @if (loading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (error(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="searchFeed()">
                Retry
              </button>
            </div>
          } @else if (items().length === 0) {
            <div class="state state--col"><p class="state__empty">No client errors found.</p></div>
          } @else {
            <div class="table-wrap card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Message</th>
                    <th>Route</th>
                    <th>App version</th>
                    <th>Environment</th>
                    <th>User</th>
                    <th class="table__actions-col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of items(); track row.id) {
                    <tr>
                      <td style="white-space: nowrap">{{ formatDate(row.receivedAt) }}</td>
                      <td>
                        <div
                          class="table__name"
                          style="
                            max-width: 320px;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                          "
                          [attr.title]="row.payload.message || ''"
                        >
                          {{ row.payload.message || '—' }}
                        </div>
                      </td>
                      <td>{{ row.route || '—' }}</td>
                      <td>{{ row.appVersion || '—' }}</td>
                      <td>{{ row.environment || '—' }}</td>
                      <td>
                        @if (row.userId) {
                          <button
                            class="btn btn--sm btn--ghost"
                            type="button"
                            (click)="viewUser(row.userId)"
                          >
                            View user
                          </button>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="table__actions-col">
                        <button
                          class="btn btn--sm btn--ghost"
                          type="button"
                          (click)="toggleRow(row)"
                        >
                          {{ expandedId() === row.id ? 'Hide' : 'View' }}
                        </button>
                      </td>
                    </tr>
                    @if (expandedId() === row.id) {
                      <tr>
                        <td colspan="7" style="background: var(--surface-2)">
                          <div class="detail" style="max-width: none">
                            <div class="kv">
                              <span class="kv__key">Type</span>
                              <span class="kv__val">{{
                                row.payload.type ? humanize(row.payload.type) : '—'
                              }}</span>
                              <span class="kv__key">HTTP status</span>
                              <span class="kv__val">{{ row.payload.httpStatus ?? '—' }}</span>
                              <span class="kv__key">HTTP method</span>
                              <span class="kv__val">{{ row.payload.httpMethod || '—' }}</span>
                              <span class="kv__key">HTTP URL</span>
                              <span class="kv__val" style="word-break: break-all">{{
                                row.payload.httpUrl || '—'
                              }}</span>
                              <span class="kv__key">Page URL</span>
                              <span class="kv__val" style="word-break: break-all">{{
                                row.url || '—'
                              }}</span>
                              <span class="kv__key">User agent</span>
                              <span class="kv__val">{{ row.userAgent || '—' }}</span>
                            </div>
                            <div>
                              <p class="section-title">Message</p>
                              <p
                                style="white-space: pre-wrap; word-break: break-word; margin-top: 6px"
                              >
                                {{ row.payload.message || '—' }}
                              </p>
                            </div>
                            @if (row.payload.stack) {
                              <div>
                                <p class="section-title">Stack trace</p>
                                <pre
                                  style="
                                    white-space: pre-wrap;
                                    word-break: break-word;
                                    font-family: var(--mono);
                                    font-size: 12px;
                                    margin-top: 6px;
                                    max-height: 320px;
                                    overflow: auto;
                                    padding: 12px;
                                    background: var(--surface);
                                    border: 1px solid var(--border);
                                    border-radius: var(--radius-sm);
                                  "
                                  [textContent]="row.payload.stack"
                                ></pre>
                              </div>
                            }
                          </div>
                        </td>
                      </tr>
                    }
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
                  (click)="loadMoreFeed()"
                >
                  {{ loadingMore() ? 'Loading…' : 'Load more' }}
                </button>
              </div>
            }
          }
        }

        @case ('top') {
          <div class="toolbar" style="margin-top: 16px">
            <input
              class="input"
              type="text"
              aria-label="Filter by environment"
              placeholder="Environment"
              style="max-width: 150px"
              [ngModel]="topEnvironment()"
              (ngModelChange)="topEnvironment.set($event)"
              (keyup.enter)="runTop()"
            />
            <input
              class="input"
              type="text"
              aria-label="Filter by app version"
              placeholder="App version"
              style="max-width: 150px"
              [ngModel]="topAppVersion()"
              (ngModelChange)="topAppVersion.set($event)"
              (keyup.enter)="runTop()"
            />
            <select
              class="input"
              aria-label="Group by"
              style="max-width: 140px"
              [ngModel]="topGroupBy()"
              (ngModelChange)="topGroupBy.set($event)"
            >
              @for (field of groupByFields; track field) {
                <option [value]="field">{{ humanize(field) }}</option>
              }
            </select>
            <label class="field" style="max-width: 150px">
              <span class="field__label">From</span>
              <input
                class="input"
                type="date"
                [ngModel]="topFromDate()"
                (ngModelChange)="topFromDate.set($event)"
              />
            </label>
            <label class="field" style="max-width: 150px">
              <span class="field__label">To</span>
              <input
                class="input"
                type="date"
                [ngModel]="topToDate()"
                (ngModelChange)="topToDate.set($event)"
              />
            </label>
            <label class="field" style="max-width: 100px">
              <span class="field__label">Limit</span>
              <input
                class="input"
                type="number"
                min="1"
                max="100"
                [ngModel]="topLimit()"
                (ngModelChange)="topLimit.set($event)"
              />
            </label>
            <button class="btn btn--primary btn--sm" type="button" (click)="runTop()">
              {{ topLoading() ? 'Loading…' : 'Run' }}
            </button>
          </div>

          @if (topLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (topError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="runTop()">
                Retry
              </button>
            </div>
          } @else if (topItems(); as rows) {
            @if (rows.length === 0) {
              <div class="state state--col">
                <p class="state__empty">No client errors in this range.</p>
              </div>
            } @else {
              <div class="card" style="padding: 20px; margin-top: 16px">
                <app-mini-chart
                  [points]="chartPoints()"
                  type="bar"
                  [height]="40"
                  ariaLabel="Top client errors by count"
                />
              </div>

              <div class="table-wrap card" style="margin-top: 16px">
                <table class="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{{ humanize(topGroupBy()) }}</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of rows; track $index) {
                      <tr>
                        <td>{{ $index + 1 }}</td>
                        <td
                          style="
                            max-width: 480px;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                          "
                          [attr.title]="item.key || ''"
                        >
                          {{ item.key || '—' }}
                        </td>
                        <td>{{ item.count }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          } @else {
            <div class="state state--col">
              <p class="state__empty">Set filters and Run to load top offenders.</p>
            </div>
          }
        }
      }
    </section>
  `,
})
export class ErrorsComponent implements OnInit {
  private readonly _errors = inject(ErrorsService);
  private readonly _router = inject(Router);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly groupByFields = CLIENT_ERROR_GROUP_FIELDS;
  protected readonly tab = signal<ErrorsTab>('feed');

  // Feed
  protected readonly feedEnvironment = signal<string>('');
  protected readonly feedAppVersion = signal<string>('');
  protected readonly feedRoute = signal<string>('');
  protected readonly feedUserId = signal<string>('');
  protected readonly feedFromDate = signal<string>('');
  protected readonly feedToDate = signal<string>('');
  protected readonly items = signal<ClientErrorResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);
  protected readonly expandedId = signal<string | null>(null);

  // Top offenders
  protected readonly topEnvironment = signal<string>('');
  protected readonly topAppVersion = signal<string>('');
  protected readonly topGroupBy = signal<ClientErrorGroupField>('message');
  protected readonly topFromDate = signal<string>('');
  protected readonly topToDate = signal<string>('');
  protected readonly topLimit = signal<number>(20);
  protected readonly topItems = signal<ClientErrorTopItem[] | null>(null);
  protected readonly topLoading = signal<boolean>(false);
  protected readonly topError = signal<string | null>(null);
  private _topLoaded = false;

  protected readonly chartPoints = computed<ChartPoint[]>(() =>
    (this.topItems() ?? []).map((item) => ({ label: item.key ?? '(none)', value: item.count })),
  );

  public ngOnInit(): void {
    this._fetchFeed();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  protected viewUser(userId: string): void {
    void this._router.navigate(['/users', userId]);
  }

  protected toggleRow(row: ClientErrorResponse): void {
    this.expandedId.update((id) => (id === row.id ? null : row.id));
  }

  protected searchFeed(): void {
    this._fetchFeed();
  }

  protected loadMoreFeed(): void {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore()) {
      return;
    }
    this._fetchFeed(cursor);
  }

  protected selectTop(): void {
    this.tab.set('top');
    if (!this._topLoaded) {
      this.runTop();
    }
  }

  protected runTop(): void {
    if (this.topLoading()) {
      return;
    }
    this._topLoaded = true;
    this.topLoading.set(true);
    this.topError.set(null);

    const limit = Number(this.topLimit());
    this._errors
      .top({
        environment: this.topEnvironment().trim() || undefined,
        appVersion: this.topAppVersion().trim() || undefined,
        groupBy: this.topGroupBy(),
        from: toIsoStart(this.topFromDate()),
        to: toIsoEnd(this.topToDate()),
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.topLoading.set(false);
        if (res === null) {
          this.topError.set('Could not load top client errors. Please try again.');
          return;
        }
        this.topItems.set(res.items);
      });
  }

  private _fetchFeed(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    this.error.set(null);

    this._errors
      .list(
        {
          environment: this.feedEnvironment().trim() || undefined,
          appVersion: this.feedAppVersion().trim() || undefined,
          route: this.feedRoute().trim() || undefined,
          userId: this.feedUserId().trim() || undefined,
          from: toIsoStart(this.feedFromDate()),
          to: toIsoEnd(this.feedToDate()),
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
          this.error.set('Could not load client errors. Please try again.');
          return;
        }
        this.items.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.nextCursor.set(res.nextCursor);
        this.hasMore.set(res.hasMore);
        if (isInitial) {
          this.expandedId.set(null);
        }
      });
  }
}
