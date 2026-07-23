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
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { FEATURE_FLAGS, type FeatureFlag } from '../../core/api/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { NotificationService } from '../../core/ui/notification.service';
import { UsersService } from './users.service';
import type { UserChangeLog, UserResponse } from './users.models';

/**
 * Reads the current admin's roles from the bearer JWT so the admin-only role
 * controls can be hidden for staff. On any decode failure we show the controls
 * and let the server enforce the 403.
 */
function currentAdminCanManageRoles(): boolean {
  try {
    const token = localStorage.getItem('zira.admin.accessToken');
    if (!token) {
      return true;
    }
    const parts = token.split('.');
    if (parts.length < 2) {
      return true;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as Record<string, unknown>;
    const roles = payload['roles'];
    if (Array.isArray(roles)) {
      return roles.includes('admin');
    }
    return true;
  } catch {
    return true;
  }
}

@Component({
  selector: 'app-user-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">User detail</h1>
        <button class="btn btn--ghost btn--sm" type="button" (click)="back()">Back</button>
      </header>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="reload()">Retry</button>
        </div>
      } @else if (user(); as u) {
        <div class="detail">
          <!-- Identity -->
          <div class="card" style="padding: 20px">
            <p class="section-title">{{ u.displayName || '—' }}</p>
            <dl class="kv">
              <div>
                <dt class="kv__key">Username</dt>
                <dd class="kv__val">{{ u.username || '—' }}</dd>
              </div>
              <div>
                <dt class="kv__key">Email</dt>
                <dd class="kv__val">{{ u.email || '—' }}</dd>
              </div>
              <div>
                <dt class="kv__key">Social</dt>
                <dd class="kv__val">
                  {{ u.socialProvider ? humanize(u.socialProvider) : '—' }}
                  @if (u.socialId) {
                    <span class="muted">({{ u.socialId }})</span>
                  }
                </dd>
              </div>
              <div>
                <dt class="kv__key">Roles</dt>
                <dd class="kv__val">
                  @for (r of u.roles; track r) {
                    <span class="badge badge--muted" style="margin-right: 6px">{{
                      humanize(r)
                    }}</span>
                  } @empty {
                    —
                  }
                </dd>
              </div>
              <div>
                <dt class="kv__key">Language</dt>
                <dd class="kv__val">{{ humanize(u.language) }}</dd>
              </div>
              <div>
                <dt class="kv__key">Timezone</dt>
                <dd class="kv__val">{{ u.timezone || '—' }}</dd>
              </div>
              <div>
                <dt class="kv__key">Time format</dt>
                <dd class="kv__val">{{ u.timeFormat }}</dd>
              </div>
              <div>
                <dt class="kv__key">Theme</dt>
                <dd class="kv__val">{{ humanize(u.theme) }}</dd>
              </div>
              <div>
                <dt class="kv__key">Created</dt>
                <dd class="kv__val">{{ formatDate(u.createdAt) }}</dd>
              </div>
              <div>
                <dt class="kv__key">Updated</dt>
                <dd class="kv__val">{{ formatDate(u.updatedAt) }}</dd>
              </div>
              <div>
                <dt class="kv__key">Last login</dt>
                <dd class="kv__val">{{ formatDate(u.lastLoginAt) }}</dd>
              </div>
            </dl>
          </div>

          <!-- Status -->
          <div class="card" style="padding: 20px">
            <p class="section-title">Status</p>
            <dl class="kv">
              <div>
                <dt class="kv__key">Active</dt>
                <dd class="kv__val">
                  @if (u.isActive) {
                    <span class="badge badge--ok">Active</span>
                  } @else {
                    <span class="badge badge--muted">Deactivated</span>
                  }
                </dd>
              </div>
              @if (u.deactivatedAt) {
                <div>
                  <dt class="kv__key">Deactivated at</dt>
                  <dd class="kv__val">{{ formatDate(u.deactivatedAt) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Deactivated by</dt>
                  <dd class="kv__val">{{ u.deactivatedById || '—' }}</dd>
                </div>
              }
            </dl>
            <div class="form-actions" style="margin-top: 16px">
              @if (u.isActive) {
                <button
                  class="btn btn--danger btn--sm"
                  type="button"
                  [disabled]="busy()"
                  (click)="toggleActive(u)"
                >
                  Deactivate
                </button>
              } @else {
                <button
                  class="btn btn--primary btn--sm"
                  type="button"
                  [disabled]="busy()"
                  (click)="toggleActive(u)"
                >
                  Reactivate
                </button>
              }
              <button
                class="btn btn--danger btn--sm"
                type="button"
                [disabled]="busy()"
                (click)="remove(u)"
              >
                Delete
              </button>
            </div>
          </div>

          <!-- Roles (admin only) -->
          @if (canManageRoles) {
            <div class="card" style="padding: 20px">
              <p class="section-title">Role management</p>
              <p class="muted">Only the <strong>staff</strong> role can be assigned or revoked.</p>
              <div class="form-actions" style="margin-top: 16px">
                @if (isStaff(u)) {
                  <button
                    class="btn btn--ghost btn--sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="revokeStaff(u)"
                  >
                    Revoke staff
                  </button>
                } @else {
                  <button
                    class="btn btn--primary btn--sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="assignStaff(u)"
                  >
                    Assign staff
                  </button>
                }
              </div>
            </div>
          }

          <!-- Subscription -->
          @if (u.subscription; as sub) {
            <div class="card" style="padding: 20px">
              <p class="section-title">Subscription</p>
              <dl class="kv">
                <div>
                  <dt class="kv__key">Plan</dt>
                  <dd class="kv__val">{{ sub.planCode || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Plan features</dt>
                  <dd class="kv__val">
                    @for (f of sub.planFeatureKeys; track f) {
                      <span class="badge badge--muted" style="margin-right: 6px">{{
                        humanize(f)
                      }}</span>
                    } @empty {
                      —
                    }
                  </dd>
                </div>
                <div>
                  <dt class="kv__key">Effective features</dt>
                  <dd class="kv__val">
                    @for (f of sub.effectiveFeatureKeys; track f) {
                      <span class="badge badge--ok" style="margin-right: 6px">{{
                        humanize(f)
                      }}</span>
                    } @empty {
                      —
                    }
                  </dd>
                </div>
              </dl>
            </div>
          }

          <!-- Quiet hours -->
          <div class="card" style="padding: 20px">
            <p class="section-title">Quiet hours</p>
            <dl class="kv">
              <div>
                <dt class="kv__key">Enabled</dt>
                <dd class="kv__val">{{ u.quietHoursEnabled ? 'Yes' : 'No' }}</dd>
              </div>
              <div>
                <dt class="kv__key">Start</dt>
                <dd class="kv__val">{{ u.quietHoursStart === null ? '—' : u.quietHoursStart }}</dd>
              </div>
              <div>
                <dt class="kv__key">End</dt>
                <dd class="kv__val">{{ u.quietHoursEnd === null ? '—' : u.quietHoursEnd }}</dd>
              </div>
            </dl>
          </div>

          <!-- Feature flags -->
          <div class="card" style="padding: 20px">
            <p class="section-title">Feature flags</p>
            <p class="muted">Saving replaces the full list of enabled flags.</p>
            <div class="chips" style="margin-top: 12px">
              @for (flag of allFlags; track flag) {
                <label class="chip" style="cursor: pointer">
                  <input
                    type="checkbox"
                    [checked]="hasFlag(flag)"
                    (change)="toggleFlag(flag, $any($event.target).checked)"
                  />
                  {{ humanize(flag) }}
                </label>
              }
            </div>
            <div class="form-actions" style="margin-top: 16px">
              <button
                class="btn btn--primary btn--sm"
                type="button"
                [disabled]="savingFlags()"
                (click)="saveFlags(u)"
              >
                {{ savingFlags() ? 'Saving…' : 'Save flags' }}
              </button>
            </div>
          </div>

          <!-- History -->
          <div class="card" style="padding: 20px">
            <p class="section-title">History</p>
            @if (historyLoading()) {
              <div class="state"><span class="spinner"></span></div>
            } @else if (historyError(); as message) {
              <div class="state state--col">
                <p class="state__error">{{ message }}</p>
                <button class="btn btn--primary btn--sm" type="button" (click)="loadHistory(u.id)">
                  Retry
                </button>
              </div>
            } @else if (history().length === 0) {
              <p class="state__empty">No history entries.</p>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of history(); track entry.id) {
                      <tr>
                        <td>{{ humanize(entry.action) }}</td>
                        <td>{{ actorName(entry) }}</td>
                        <td>{{ formatDate(entry.createdAt) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class UserDetailComponent implements OnInit {
  private readonly _users = inject(UsersService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly allFlags = FEATURE_FLAGS;
  protected readonly canManageRoles = currentAdminCanManageRoles();

  private _id = '';
  protected readonly user = signal<UserResponse | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<boolean>(false);

  protected readonly flags = signal<FeatureFlag[]>([]);
  protected readonly savingFlags = signal<boolean>(false);

  protected readonly history = signal<UserChangeLog[]>([]);
  protected readonly historyLoading = signal<boolean>(false);
  protected readonly historyError = signal<string | null>(null);

  public ngOnInit(): void {
    this._id = this._route.snapshot.paramMap.get('id') ?? '';
    this.reload();
  }

  protected back(): void {
    void this._router.navigate(['/users']);
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

  protected isStaff(user: UserResponse): boolean {
    return user.roles.includes('staff');
  }

  protected actorName(entry: UserChangeLog): string {
    if (entry.actor) {
      return entry.actor.displayName || entry.actor.username || entry.actor.id;
    }
    return entry.actorId ?? 'System';
  }

  protected hasFlag(flag: FeatureFlag): boolean {
    return this.flags().includes(flag);
  }

  protected toggleFlag(flag: FeatureFlag, checked: boolean): void {
    this.flags.update((list) =>
      checked ? [...new Set([...list, flag])] : list.filter((f) => f !== flag),
    );
  }

  protected reload(): void {
    if (!this._id) {
      this.error.set('Missing user id.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this._users
      .getById(this._id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((user) => {
        this.loading.set(false);
        if (!user) {
          this.error.set('Could not load the user.');
          return;
        }
        this._applyUser(user);
        this.loadHistory(user.id);
      });
  }

  protected loadHistory(id: string): void {
    this.historyLoading.set(true);
    this.historyError.set(null);
    this._users
      .history(id, { limit: 50, sortDir: 'desc' })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((page) => {
        this.historyLoading.set(false);
        if (page === null) {
          this.historyError.set('Could not load history.');
          return;
        }
        this.history.set(page.items);
      });
  }

  protected async toggleActive(user: UserResponse): Promise<void> {
    if (this.busy()) {
      return;
    }
    const deactivating = user.isActive;
    const confirmed = await this._confirm.ask({
      title: deactivating ? 'Deactivate user' : 'Reactivate user',
      message: deactivating
        ? 'The user will be blocked from signing in until reactivated.'
        : 'The user will be able to sign in again.',
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
      danger: deactivating,
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    const op = deactivating ? this._users.deactivate(user.id) : this._users.reactivate(user.id);
    op.pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this._applyUser(updated);
        this._notify.success(deactivating ? 'User deactivated.' : 'User reactivated.');
        this.loadHistory(user.id);
      },
      error: () => {
        this.busy.set(false);
        this._notify.error('Could not update the user.');
      },
    });
  }

  protected async remove(user: UserResponse): Promise<void> {
    if (this.busy()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Delete user',
      message: 'This permanently deletes the user and cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    this._users
      .remove(user.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this._notify.success('User deleted.');
          void this._router.navigate(['/users']);
        },
        error: () => {
          this.busy.set(false);
          this._notify.error('Could not delete the user.');
        },
      });
  }

  protected assignStaff(user: UserResponse): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this._users
      .assignStaff(user.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this._applyUser(updated);
          this._notify.success('Staff role assigned.');
          this.loadHistory(user.id);
        },
        error: () => {
          this.busy.set(false);
          this._notify.error('Could not assign the staff role.');
        },
      });
  }

  protected revokeStaff(user: UserResponse): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    // DELETE returns a body, but our delete() is void — re-fetch to refresh state.
    this._users
      .revokeStaff(user.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this._notify.success('Staff role revoked.');
          this._refetch(user.id);
          this.loadHistory(user.id);
        },
        error: () => {
          this.busy.set(false);
          this._notify.error('Could not revoke the staff role.');
        },
      });
  }

  protected saveFlags(user: UserResponse): void {
    if (this.savingFlags()) {
      return;
    }
    this.savingFlags.set(true);
    this._users
      .updateFeatureFlags(user.id, this.flags())
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this.savingFlags.set(false);
          this._applyUser(updated);
          this._notify.success('Feature flags updated.');
        },
        error: () => {
          this.savingFlags.set(false);
          this._notify.error('Could not update feature flags.');
        },
      });
  }

  private _refetch(id: string): void {
    this._users
      .getById(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((user) => {
        this.busy.set(false);
        if (user) {
          this._applyUser(user);
        }
      });
  }

  private _applyUser(user: UserResponse): void {
    this.user.set(user);
    this.flags.set([...user.enabledFeatureFlags]);
  }
}
