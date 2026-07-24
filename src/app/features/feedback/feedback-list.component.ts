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
import { Router, RouterLink } from '@angular/router';

import { catchError, of } from 'rxjs';

import { type CsvColumn, downloadCsv } from '../../core/ui/csv.util';
import { NotificationService } from '../../core/ui/notification.service';
import { FeedbackService } from './feedback.service';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  type FeedbackResponse,
  type FeedbackSearchDto,
  type FeedbackSource,
  type FeedbackStatus,
  type FeedbackType,
} from './feedback.models';

const SOURCE_CHIPS: readonly FeedbackSource[] = ['web', 'zalo', 'telegram'];

const FEEDBACK_CSV_COLUMNS: readonly CsvColumn<FeedbackResponse>[] = [
  { key: 'title', label: 'Title', value: (r) => r.title ?? '' },
  { key: 'type', label: 'Type', value: (r) => r.type },
  { key: 'status', label: 'Status', value: (r) => r.status },
  { key: 'source', label: 'Source', value: (r) => r.source },
  { key: 'reporter', label: 'Reporter', value: (r) => r.createdBy?.displayName ?? '' },
  { key: 'reporterEmail', label: 'Reporter email', value: (r) => r.createdBy?.email ?? '' },
  { key: 'replyCount', label: 'Replies', value: (r) => r.replyCount ?? 0 },
  { key: 'createdAt', label: 'Created at', value: (r) => r.createdAt },
  { key: 'updatedAt', label: 'Updated at', value: (r) => r.updatedAt },
  { key: 'message', label: 'Message', value: (r) => r.message },
];

@Component({
  selector: 'app-feedback-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Feedback</h1>
      </header>

      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search feedback"
          placeholder="Search title or message…"
          style="max-width: 260px"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          (keyup.enter)="fetch()"
        />
        <select
          class="input"
          aria-label="Filter by type"
          style="max-width: 180px"
          [ngModel]="type()"
          (ngModelChange)="type.set($event); fetch()"
        >
          <option value="">All types</option>
          @for (t of types; track t) {
            <option [value]="t">{{ humanize(t) }}</option>
          }
        </select>
        <input
          class="input"
          type="date"
          aria-label="Created from"
          style="max-width: 160px"
          [ngModel]="createdFrom()"
          (ngModelChange)="createdFrom.set($event); fetch()"
        />
        <input
          class="input"
          type="date"
          aria-label="Created to"
          style="max-width: 160px"
          [ngModel]="createdTo()"
          (ngModelChange)="createdTo.set($event); fetch()"
        />
        <button class="btn btn--sm" type="button" (click)="fetch()">Search</button>
        <div class="toolbar__spacer"></div>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="visibleItems().length === 0"
          (click)="exportCsv()"
        >
          Export CSV
        </button>
      </div>

      <div class="chips" style="margin-bottom: 8px">
        @for (s of statuses; track s) {
          <button
            type="button"
            class="chip"
            [class.is-active]="isStatusSelected(s)"
            style="cursor: pointer"
            (click)="toggleStatus(s)"
          >
            {{ humanize(s) }}
          </button>
        }
      </div>

      <div class="chips" style="margin-bottom: 16px">
        @for (s of sourceChips; track s) {
          <button
            type="button"
            class="chip"
            [class.is-active]="isSourceSelected(s)"
            style="cursor: pointer"
            (click)="toggleSource(s)"
          >
            {{ humanize(s) }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (visibleItems().length === 0) {
        <div class="state state--col"><p class="state__empty">No feedback found.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Source</th>
                <th>Reporter</th>
                <th>Replies</th>
                <th>Created</th>
                <th class="table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (item of visibleItems(); track item.id) {
                <tr>
                  <td>
                    <div class="table__name">{{ item.title || '—' }}</div>
                    <div class="table__sub">{{ preview(item.message) }}</div>
                  </td>
                  <td>{{ humanize(item.type) }}</td>
                  <td>
                    <select
                      class="input"
                      style="max-width: 150px"
                      [attr.aria-label]="'Change status for ' + (item.title || 'this feedback')"
                      [disabled]="isRowSaving(item.id)"
                      [ngModel]="item.status"
                      (ngModelChange)="changeRowStatus(item, $event)"
                    >
                      @for (s of statuses; track s) {
                        <option [value]="s">{{ humanize(s) }}</option>
                      }
                    </select>
                  </td>
                  <td>{{ humanize(item.source) }}</td>
                  <td>
                    @if (item.createdBy?.id) {
                      <a class="table__link" [routerLink]="['/users', item.createdBy!.id]">{{
                        reporter(item)
                      }}</a>
                    } @else {
                      {{ reporter(item) }}
                    }
                  </td>
                  <td>{{ item.replyCount ?? 0 }}</td>
                  <td>{{ formatDate(item.createdAt) }}</td>
                  <td class="table__actions-col">
                    <button class="btn btn--sm btn--ghost" type="button" (click)="open(item)">
                      View
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (hasMore()) {
          <div class="form-actions">
            <button
              class="btn btn--ghost"
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
export class FeedbackListComponent implements OnInit {
  private readonly _service = inject(FeedbackService);
  private readonly _router = inject(Router);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = FEEDBACK_STATUSES;
  protected readonly types = FEEDBACK_TYPES;
  protected readonly sourceChips = SOURCE_CHIPS;

  protected readonly query = signal<string>('');
  protected readonly type = signal<FeedbackType | ''>('');
  protected readonly selectedStatuses = signal<FeedbackStatus[]>([]);
  protected readonly createdFrom = signal<string>('');
  protected readonly createdTo = signal<string>('');

  /** Client-side quick filter over the currently loaded page — the search
   * endpoint's filter DTO has no `source` field, so this never hits the wire. */
  protected readonly sourceFilter = signal<FeedbackSource | ''>('');

  protected readonly items = signal<FeedbackResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);
  protected readonly savingRowIds = signal<ReadonlySet<string>>(new Set());

  protected readonly visibleItems = computed<FeedbackResponse[]>(() => {
    const source = this.sourceFilter();
    const items = this.items();
    return source ? items.filter((item) => item.source === source) : items;
  });

  private readonly _cursor = signal<string | null>(null);

  public ngOnInit(): void {
    this.fetch();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected preview(message: string): string {
    const trimmed = message.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }

  protected reporter(item: FeedbackResponse): string {
    return item.createdBy?.displayName || '—';
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    return new Date(iso).toLocaleString();
  }

  protected isStatusSelected(status: FeedbackStatus): boolean {
    return this.selectedStatuses().includes(status);
  }

  protected toggleStatus(status: FeedbackStatus): void {
    this.selectedStatuses.update((list) =>
      list.includes(status) ? list.filter((s) => s !== status) : [...list, status],
    );
    this.fetch();
  }

  protected isSourceSelected(source: FeedbackSource): boolean {
    return this.sourceFilter() === source;
  }

  protected toggleSource(source: FeedbackSource): void {
    this.sourceFilter.update((current) => (current === source ? '' : source));
  }

  protected isRowSaving(id: string): boolean {
    return this.savingRowIds().has(id);
  }

  protected open(item: FeedbackResponse): void {
    void this._router.navigate(['/feedback', item.id]);
  }

  protected exportCsv(): void {
    downloadCsv('feedback.csv', FEEDBACK_CSV_COLUMNS, this.visibleItems());
  }

  protected changeRowStatus(item: FeedbackResponse, next: FeedbackStatus): void {
    if (next === item.status || this.isRowSaving(item.id)) {
      return;
    }
    const previous = item.status;
    this._patchItemStatus(item.id, next);
    this._setRowSaving(item.id, true);
    this._service
      .setStatus(item.id, next)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this._setRowSaving(item.id, false);
          this._patchItemStatus(item.id, updated.status);
          this._notify.success('Status updated.');
        },
        error: () => {
          this._setRowSaving(item.id, false);
          this._patchItemStatus(item.id, previous);
          this._notify.error('Could not update the status.');
        },
      });
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._cursor.set(null);
    this._service
      .search(this._buildQuery())
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.loading.set(false);
        if (page === null) {
          this.error.set('Could not load feedback.');
          return;
        }
        this.items.set(page.items);
        this._cursor.set(page.nextCursor);
        this.hasMore.set(page.hasMore);
      });
  }

  protected loadMore(): void {
    const cursor = this._cursor();
    if (!cursor || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this._service
      .search(this._buildQuery(cursor))
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.loadingMore.set(false);
        if (page === null) {
          return;
        }
        this.items.update((list) => [...list, ...page.items]);
        this._cursor.set(page.nextCursor);
        this.hasMore.set(page.hasMore);
      });
  }

  private _patchItemStatus(id: string, status: FeedbackStatus): void {
    this.items.update((list) => list.map((it) => (it.id === id ? { ...it, status } : it)));
  }

  private _setRowSaving(id: string, saving: boolean): void {
    this.savingRowIds.update((current) => {
      const next = new Set(current);
      if (saving) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  private _buildQuery(cursor?: string): FeedbackSearchDto {
    const q = this.query().trim();
    const type = this.type();
    const statuses = this.selectedStatuses();
    const createdAtFrom = this._toIso(this.createdFrom());
    const createdAtTo = this._toIso(this.createdTo(), true);
    return {
      filter: {
        ...(q ? { q } : {}),
        ...(type ? { types: [type] } : {}),
        ...(statuses.length > 0 ? { statuses } : {}),
        ...(createdAtFrom ? { createdAtFrom } : {}),
        ...(createdAtTo ? { createdAtTo } : {}),
      },
      options: {
        sortBy: 'createdAt',
        sortDir: 'desc',
        limit: 20,
        ...(cursor ? { cursor } : {}),
      },
    };
  }

  private _toIso(dateInput: string, endOfDay = false): string | undefined {
    if (!dateInput) {
      return undefined;
    }
    return new Date(`${dateInput}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).toISOString();
  }
}
