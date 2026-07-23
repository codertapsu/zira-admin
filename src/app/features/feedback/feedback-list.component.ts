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
import { Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { FeedbackService } from './feedback.service';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  type FeedbackResponse,
  type FeedbackSearchDto,
  type FeedbackStatus,
  type FeedbackType,
} from './feedback.models';

@Component({
  selector: 'app-feedback-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
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
        <button class="btn btn--sm" type="button" (click)="fetch()">Search</button>
      </div>

      <div class="chips" style="margin-bottom: 16px">
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

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (items().length === 0) {
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
              @for (item of items(); track item.id) {
                <tr>
                  <td>
                    <div class="table__name">{{ item.title || '—' }}</div>
                    <div class="table__sub">{{ preview(item.message) }}</div>
                  </td>
                  <td>{{ humanize(item.type) }}</td>
                  <td>
                    <span class="badge badge--{{ badgeClass(item.status) }}">
                      {{ humanize(item.status) }}
                    </span>
                  </td>
                  <td>{{ humanize(item.source) }}</td>
                  <td>{{ reporter(item) }}</td>
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
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = FEEDBACK_STATUSES;
  protected readonly types = FEEDBACK_TYPES;

  protected readonly query = signal<string>('');
  protected readonly type = signal<FeedbackType | ''>('');
  protected readonly selectedStatuses = signal<FeedbackStatus[]>([]);

  protected readonly items = signal<FeedbackResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);

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

  protected badgeClass(status: FeedbackStatus): string {
    if (status === 'resolved' || status === 'closed') {
      return 'ok';
    }
    return 'muted';
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

  protected open(item: FeedbackResponse): void {
    void this._router.navigate(['/feedback', item.id]);
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

  private _buildQuery(cursor?: string): FeedbackSearchDto {
    const q = this.query().trim();
    const type = this.type();
    const statuses = this.selectedStatuses();
    return {
      filter: {
        ...(q ? { q } : {}),
        ...(type ? { types: [type] } : {}),
        ...(statuses.length > 0 ? { statuses } : {}),
      },
      options: {
        sortBy: 'createdAt',
        sortDir: 'desc',
        limit: 20,
        ...(cursor ? { cursor } : {}),
      },
    };
  }
}
