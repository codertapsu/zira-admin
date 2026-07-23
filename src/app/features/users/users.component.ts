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

import { catchError, of } from 'rxjs';

import type { UserSummary } from '../../core/api/models';
import { UsersService } from './users.service';

@Component({
  selector: 'app-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Users</h1>
        <div class="page__search">
          <input
            class="input"
            type="search"
            aria-label="Search users"
            placeholder="Search name, username, email…"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            (keyup.enter)="search()"
          />
          <button class="btn btn--primary btn--sm" type="button" (click)="search()">Search</button>
        </div>
      </header>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="search()">Retry</button>
        </div>
      } @else if (users().length === 0) {
        <div class="state state--col"><p class="state__empty">No users found.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th class="table__actions-col">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td>
                    <div class="table__name">{{ user.displayName || '—' }}</div>
                    @if (user.username) {
                      <div class="table__sub">{{ '@' + user.username }}</div>
                    }
                  </td>
                  <td>{{ user.email || '—' }}</td>
                  <td>
                    @if (user.isActive) {
                      <span class="badge badge--ok">Active</span>
                    } @else {
                      <span class="badge badge--muted">Deactivated</span>
                    }
                  </td>
                  <td class="table__actions-col">
                    <button
                      class="btn btn--sm"
                      [class.btn--danger]="user.isActive"
                      [class.btn--ghost]="!user.isActive"
                      type="button"
                      [disabled]="deactivatingId() === user.id"
                      (click)="toggleActive(user)"
                    >
                      {{ user.isActive ? 'Deactivate' : 'Reactivate' }}
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
    </section>
  `,
})
export class UsersComponent implements OnInit {
  private readonly _users = inject(UsersService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly query = signal<string>('');
  protected readonly users = signal<UserSummary[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deactivatingId = signal<string | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);

  public ngOnInit(): void {
    this._fetch();
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

  protected toggleActive(user: UserSummary): void {
    if (this.deactivatingId() !== null) {
      return;
    }
    this.deactivatingId.set(user.id);
    const op = user.isActive ? this._users.deactivate(user.id) : this._users.reactivate(user.id);
    op.pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.users.update((list) =>
          list.map((item) => (item.id === user.id ? { ...item, isActive: !item.isActive } : item)),
        );
        this.deactivatingId.set(null);
      },
      error: () => {
        this.deactivatingId.set(null);
        this.error.set('Could not update the user. Please try again.');
      },
    });
  }

  private _fetch(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    this.error.set(null);

    const q = this.query().trim();
    this._users
      .searchSummaries(
        { q: q.length > 0 ? q : undefined },
        { cursor, limit: 50, sortBy: 'createdAt', sortDir: 'desc' },
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (res === null) {
          this.error.set('Could not load users. Please try again.');

          return;
        }
        this.users.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.nextCursor.set(res.nextCursor);
        this.hasMore.set(res.hasMore);
      });
  }
}
