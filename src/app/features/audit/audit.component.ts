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

import { AuditService } from './audit.service';
import { AUDIT_RESOURCE_TYPES, type AdminAuditEvent } from './audit.models';

/** Route commands for the vertical that owns a given `resourceType`, if any. */
function resourceRoute(
  resourceType: string | null,
  resourceId: string | null,
): (string | number)[] | null {
  if (!resourceId) {
    return null;
  }
  switch (resourceType) {
    case 'users':
      return ['/users', resourceId];
    case 'campaigns':
      return ['/campaigns', resourceId, 'edit'];
    case 'feedback':
      return ['/feedback', resourceId];
    case 'subscription-plans':
      return ['/subscriptions', 'plans', resourceId, 'edit'];
    case 'subscription-promo-codes':
      return ['/subscriptions', 'promo-codes', resourceId, 'edit'];
    default:
      return null;
  }
}

@Component({
  selector: 'app-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Audit log</h1>
      </header>

      <div class="toolbar">
        <label class="field" style="max-width: 260px">
          <span class="field__label">Actor user ID</span>
          <input
            class="input"
            placeholder="Filter by actor UUID"
            [ngModel]="actorUserId()"
            (ngModelChange)="actorUserId.set($event)"
            (keyup.enter)="search()"
          />
        </label>
        <label class="field" style="max-width: 220px">
          <span class="field__label">Resource type</span>
          <select
            class="input"
            [ngModel]="resourceType()"
            (ngModelChange)="resourceType.set($event); search()"
          >
            <option value="">All resource types</option>
            @for (rt of resourceTypes; track rt) {
              <option [value]="rt">{{ humanize(rt) }}</option>
            }
          </select>
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
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="search()">Retry</button>
        </div>
      } @else if (events().length === 0) {
        <div class="state state--col"><p class="state__empty">No audit events found.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Status</th>
                <th>IP</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              @for (event of events(); track event.id) {
                <tr>
                  <td>
                    <button
                      class="table__link"
                      type="button"
                      [title]="event.actorUserId"
                      (click)="goToActor(event)"
                    >
                      {{ shortId(event.actorUserId) }}
                    </button>
                  </td>
                  <td>
                    <span style="font-family: var(--mono, monospace); font-size: 13px">{{
                      event.action
                    }}</span>
                  </td>
                  <td>
                    @if (event.resourceType) {
                      <div class="table__name">{{ humanize(event.resourceType) }}</div>
                    } @else {
                      <div class="table__name">—</div>
                    }
                    @if (event.resourceId) {
                      @if (resourceLink(event); as link) {
                        <button
                          class="table__link table__sub"
                          type="button"
                          [title]="event.resourceId"
                          (click)="goToResource(link)"
                        >
                          {{ shortId(event.resourceId) }}
                        </button>
                      } @else {
                        <div class="table__sub" [title]="event.resourceId">
                          {{ shortId(event.resourceId) }}
                        </div>
                      }
                    }
                  </td>
                  <td>
                    <span class="badge badge--{{ statusBadgeClass(event.statusCode) }}">
                      {{ event.statusCode }}
                    </span>
                  </td>
                  <td>{{ event.ip || '—' }}</td>
                  <td>{{ formatDate(event.createdAt) }}</td>
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
export class AuditComponent implements OnInit {
  private readonly _audit = inject(AuditService);
  private readonly _router = inject(Router);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly resourceTypes = AUDIT_RESOURCE_TYPES;

  protected readonly actorUserId = signal<string>('');
  protected readonly resourceType = signal<string>('');
  protected readonly fromDate = signal<string>('');
  protected readonly toDate = signal<string>('');

  protected readonly events = signal<AdminAuditEvent[]>([]);
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

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }

  protected statusBadgeClass(code: number): string {
    if (code >= 200 && code < 300) {
      return 'ok';
    }
    if (code >= 400) {
      return 'danger';
    }
    return 'muted';
  }

  protected resourceLink(event: AdminAuditEvent): (string | number)[] | null {
    return resourceRoute(event.resourceType, event.resourceId);
  }

  protected goToActor(event: AdminAuditEvent): void {
    void this._router.navigate(['/users', event.actorUserId]);
  }

  protected goToResource(link: (string | number)[]): void {
    void this._router.navigate(link);
  }

  protected hasFilters(): boolean {
    return (
      this.actorUserId().trim().length > 0 ||
      this.resourceType().length > 0 ||
      this.fromDate().length > 0 ||
      this.toDate().length > 0
    );
  }

  protected clearFilters(): void {
    this.actorUserId.set('');
    this.resourceType.set('');
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

  private _fetch(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    this.error.set(null);

    const actorUserId = this.actorUserId().trim();
    const resourceType = this.resourceType();
    this._audit
      .list(
        {
          actorUserId: actorUserId.length > 0 ? actorUserId : undefined,
          resourceType: resourceType.length > 0 ? resourceType : undefined,
          from: this._isoBound(this.fromDate(), 'start'),
          to: this._isoBound(this.toDate(), 'end'),
        },
        { cursor, limit: 50 },
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (res === null) {
          this.error.set('Could not load the audit log. Please try again.');
          return;
        }
        this.events.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
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
