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

import {
  FEATURE_FLAGS,
  type FeatureFlag,
  type SupportedLanguage,
  type TimeFormat,
  type UserTheme,
} from '../../core/api/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { NotificationService } from '../../core/ui/notification.service';
import { UsersService } from './users.service';
import type {
  AdminSession,
  BotConnection,
  UserChangeLog,
  UserDataExport,
  UserResponse,
} from './users.models';

const TIME_FORMATS: readonly TimeFormat[] = ['24h', '12h'];
const THEMES: readonly UserTheme[] = ['system', 'light', 'dark'];
const LANGUAGES: readonly SupportedLanguage[] = ['default', 'en', 'vi', 'ru'];

/** One rendered row for a history entry's field-level diff. */
interface ChangeEntry {
  readonly field: string;
  readonly display: string;
}

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

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
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

          <!-- Properties editor -->
          <div class="card" style="padding: 20px">
            <p class="section-title">Properties</p>
            <p class="muted">Edit the user's locale and display preferences.</p>
            <div class="form-grid" style="margin-top: 12px">
              <label class="field">
                <span class="field__label">Timezone</span>
                <input
                  class="input"
                  placeholder="e.g. Asia/Ho_Chi_Minh"
                  [ngModel]="propTimezone()"
                  (ngModelChange)="propTimezone.set($event)"
                />
              </label>
              <label class="field">
                <span class="field__label">Time format</span>
                <select
                  class="input"
                  [ngModel]="propTimeFormat()"
                  (ngModelChange)="propTimeFormat.set($event)"
                >
                  @for (f of timeFormats; track f) {
                    <option [value]="f">{{ f }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span class="field__label">Theme</span>
                <select
                  class="input"
                  [ngModel]="propTheme()"
                  (ngModelChange)="propTheme.set($event)"
                >
                  @for (t of themes; track t) {
                    <option [value]="t">{{ humanize(t) }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span class="field__label">Language</span>
                <select
                  class="input"
                  [ngModel]="propLanguage()"
                  (ngModelChange)="propLanguage.set($event)"
                >
                  @for (l of languages; track l) {
                    <option [value]="l">{{ humanize(l) }}</option>
                  }
                </select>
              </label>
            </div>
            <div class="form-actions" style="margin-top: 16px">
              <button
                class="btn btn--primary btn--sm"
                type="button"
                [disabled]="savingProperties()"
                (click)="saveProperties(u)"
              >
                {{ savingProperties() ? 'Saving…' : 'Save properties' }}
              </button>
            </div>
          </div>

          <!-- Sessions -->
          <div class="card" style="padding: 20px">
            <div class="page__head" style="margin-bottom: 4px">
              <p class="section-title" style="margin: 0">Sessions</p>
              <button
                class="btn btn--danger btn--sm"
                type="button"
                [disabled]="revokingAll() || sessions().length === 0"
                (click)="revokeAllSessions(u)"
              >
                Sign out everywhere
              </button>
            </div>
            @if (sessionsLoading()) {
              <div class="state"><span class="spinner"></span></div>
            } @else if (sessionsError(); as message) {
              <div class="state state--col">
                <p class="state__error">{{ message }}</p>
                <button class="btn btn--primary btn--sm" type="button" (click)="loadSessions(u.id)">
                  Retry
                </button>
              </div>
            } @else if (sessions().length === 0) {
              <p class="state__empty">No active sessions.</p>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>IP</th>
                      <th>Created</th>
                      <th>Last used</th>
                      <th></th>
                      <th class="table__actions-col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of sessions(); track s.id) {
                      <tr>
                        <td>
                          <div class="table__name">{{ s.deviceId || '—' }}</div>
                          @if (s.userAgent) {
                            <div class="table__sub">{{ s.userAgent }}</div>
                          }
                        </td>
                        <td>{{ s.ip || '—' }}</td>
                        <td>{{ formatDate(s.createdAt) }}</td>
                        <td>{{ formatDate(s.lastUsedAt) }}</td>
                        <td>
                          @if (s.isReused) {
                            <span class="badge badge--muted" style="color: var(--danger)"
                              >Reused</span
                            >
                          }
                        </td>
                        <td class="table__actions-col">
                          <button
                            class="btn btn--sm btn--ghost"
                            type="button"
                            [disabled]="revokingSessionId() === s.id"
                            (click)="revokeSession(u, s)"
                          >
                            {{ revokingSessionId() === s.id ? 'Revoking…' : 'Revoke' }}
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <!-- Telegram bot -->
          <div class="card" style="padding: 20px">
            <p class="section-title">Telegram bot</p>
            @if (telegramLoading()) {
              <div class="state"><span class="spinner"></span></div>
            } @else if (telegramError(); as message) {
              <div class="state state--col">
                <p class="state__error">{{ message }}</p>
                <button
                  class="btn btn--primary btn--sm"
                  type="button"
                  (click)="loadTelegramConnection(u.id)"
                >
                  Retry
                </button>
              </div>
            } @else {
              @if (telegramConnection(); as conn) {
                @if (conn.connected) {
                  <dl class="kv">
                    <div>
                      <dt class="kv__key">Chat</dt>
                      <dd class="kv__val">{{ conn.chatIdMasked || '—' }}</dd>
                    </div>
                    <div>
                      <dt class="kv__key">Display name</dt>
                      <dd class="kv__val">{{ conn.displayName || '—' }}</dd>
                    </div>
                    <div>
                      <dt class="kv__key">Connected</dt>
                      <dd class="kv__val">{{ formatDate(conn.connectedAt) }}</dd>
                    </div>
                    <div>
                      <dt class="kv__key">Last seen</dt>
                      <dd class="kv__val">{{ formatDate(conn.lastSeenAt) }}</dd>
                    </div>
                  </dl>
                  <div class="form-actions" style="margin-top: 16px">
                    <button
                      class="btn btn--danger btn--sm"
                      type="button"
                      [disabled]="disconnectingTelegram()"
                      (click)="disconnectTelegram(u)"
                    >
                      {{ disconnectingTelegram() ? 'Disconnecting…' : 'Disconnect' }}
                    </button>
                  </div>
                } @else {
                  <p class="state__empty">Not connected.</p>
                }
              }
            }
          </div>

          <!-- Zalo bot -->
          <div class="card" style="padding: 20px">
            <p class="section-title">Zalo bot</p>
            @if (zaloLoading()) {
              <div class="state"><span class="spinner"></span></div>
            } @else if (zaloError(); as message) {
              <div class="state state--col">
                <p class="state__error">{{ message }}</p>
                <button
                  class="btn btn--primary btn--sm"
                  type="button"
                  (click)="loadZaloConnection(u.id)"
                >
                  Retry
                </button>
              </div>
            } @else if (zaloConnection(); as conn) {
              @if (conn.connected) {
                <dl class="kv">
                  <div>
                    <dt class="kv__key">Chat</dt>
                    <dd class="kv__val">{{ conn.chatIdMasked || '—' }}</dd>
                  </div>
                  <div>
                    <dt class="kv__key">Display name</dt>
                    <dd class="kv__val">{{ conn.displayName || '—' }}</dd>
                  </div>
                  <div>
                    <dt class="kv__key">Connected</dt>
                    <dd class="kv__val">{{ formatDate(conn.connectedAt) }}</dd>
                  </div>
                  <div>
                    <dt class="kv__key">Last seen</dt>
                    <dd class="kv__val">{{ formatDate(conn.lastSeenAt) }}</dd>
                  </div>
                </dl>
                <div class="form-actions" style="margin-top: 16px">
                  <button
                    class="btn btn--danger btn--sm"
                    type="button"
                    [disabled]="disconnectingZalo()"
                    (click)="disconnectZalo(u)"
                  >
                    {{ disconnectingZalo() ? 'Disconnecting…' : 'Disconnect' }}
                  </button>
                </div>
              } @else {
                <p class="state__empty">Not connected.</p>
              }
            }
          </div>

          <!-- Privacy -->
          <div class="card" style="padding: 20px">
            <p class="section-title">Privacy</p>
            <p class="muted">
              Deactivating blocks sign-in and preserves all data for later reactivation. The
              <strong>Delete</strong> action in Status above is a permanent hard delete and cannot
              be undone. Note: hard delete does not fully purge personally-identifiable data from
              every table — a complete purge still requires the server-side
              <code>scripts/delete-user.ts</code> follow-up. Prefer deactivation.
            </p>
            <div class="form-actions" style="margin-top: 12px; justify-content: flex-start">
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                [disabled]="generatingExport()"
                (click)="generateExport(u)"
              >
                {{ generatingExport() ? 'Generating…' : 'Generate data export' }}
              </button>
            </div>
            @if (exportError(); as message) {
              <p class="field__error" style="margin-top: 8px">{{ message }}</p>
            }
            @if (exportResult(); as result) {
              <p style="margin: 12px 0 0">
                <a
                  class="btn btn--sm btn--ghost"
                  [href]="result.url"
                  target="_blank"
                  rel="noopener"
                >
                  Download {{ result.filename }}
                </a>
                <span class="muted" style="margin-left: 8px">
                  Expires {{ formatDate(result.expiresAt) }}
                </span>
              </p>
            }
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
                      <th>Changes</th>
                      <th>Actor</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of history(); track entry.id) {
                      <tr>
                        <td>{{ humanize(entry.action) }}</td>
                        <td>
                          @for (c of changeEntries(entry); track c.field) {
                            <div class="table__sub">{{ humanize(c.field) }}: {{ c.display }}</div>
                          } @empty {
                            —
                          }
                        </td>
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
  protected readonly timeFormats = TIME_FORMATS;
  protected readonly themes = THEMES;
  protected readonly languages = LANGUAGES;

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

  // Properties editor
  protected readonly propTimezone = signal<string>('');
  protected readonly propTimeFormat = signal<TimeFormat>('24h');
  protected readonly propTheme = signal<UserTheme>('system');
  protected readonly propLanguage = signal<SupportedLanguage>('default');
  protected readonly savingProperties = signal<boolean>(false);

  // Sessions
  protected readonly sessions = signal<AdminSession[]>([]);
  protected readonly sessionsLoading = signal<boolean>(false);
  protected readonly sessionsError = signal<string | null>(null);
  protected readonly revokingSessionId = signal<string | null>(null);
  protected readonly revokingAll = signal<boolean>(false);

  // Bot connections
  protected readonly telegramConnection = signal<BotConnection | null>(null);
  protected readonly telegramLoading = signal<boolean>(false);
  protected readonly telegramError = signal<string | null>(null);
  protected readonly disconnectingTelegram = signal<boolean>(false);

  protected readonly zaloConnection = signal<BotConnection | null>(null);
  protected readonly zaloLoading = signal<boolean>(false);
  protected readonly zaloError = signal<string | null>(null);
  protected readonly disconnectingZalo = signal<boolean>(false);

  // Privacy / data export
  protected readonly generatingExport = signal<boolean>(false);
  protected readonly exportResult = signal<UserDataExport | null>(null);
  protected readonly exportError = signal<string | null>(null);

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

  /** Flattens a history entry's `changes` payload into renderable `from → to` rows. */
  protected changeEntries(entry: UserChangeLog): ChangeEntry[] {
    return Object.entries(entry.changes).map(([field, value]) => {
      if (
        value !== null &&
        typeof value === 'object' &&
        'from' in (value as Record<string, unknown>) &&
        'to' in (value as Record<string, unknown>)
      ) {
        const { from, to } = value as { from: unknown; to: unknown };
        return { field, display: `${formatValue(from)} → ${formatValue(to)}` };
      }
      return { field, display: formatValue(value) };
    });
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
        this.loadSessions(user.id);
        this.loadTelegramConnection(user.id);
        this.loadZaloConnection(user.id);
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
    const phrase = user.username || user.displayName || user.id;
    const confirmed = await this._confirm.ask({
      title: 'Delete user',
      message: 'This permanently deletes the user and cannot be undone.',
      consequence:
        'All of the user’s data — projects, tasks, notes, and history — is permanently erased. This cannot be reversed.',
      confirmLabel: 'Delete',
      danger: true,
      requirePhrase: phrase,
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

  protected saveProperties(user: UserResponse): void {
    if (this.savingProperties()) {
      return;
    }
    this.savingProperties.set(true);
    this._users
      .updateProperties(user.id, {
        timezone: this.propTimezone().trim(),
        timeFormat: this.propTimeFormat(),
        theme: this.propTheme(),
        language: this.propLanguage(),
      })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this.savingProperties.set(false);
          this._applyUser(updated);
          this._notify.success('Properties updated.');
          this.loadHistory(user.id);
        },
        error: () => {
          this.savingProperties.set(false);
          this._notify.error('Could not update properties.');
        },
      });
  }

  protected loadSessions(id: string): void {
    this.sessionsLoading.set(true);
    this.sessionsError.set(null);
    this._users
      .getSessions(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((sessions) => {
        this.sessionsLoading.set(false);
        if (sessions === null) {
          this.sessionsError.set('Could not load sessions.');
          return;
        }
        this.sessions.set(sessions);
      });
  }

  protected async revokeSession(user: UserResponse, session: AdminSession): Promise<void> {
    if (this.revokingSessionId()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Revoke session',
      message: `End this session${session.userAgent ? ` (${session.userAgent})` : ''}? The user will be signed out on that device.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.revokingSessionId.set(session.id);
    this._users
      .revokeSession(user.id, session.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.revokingSessionId.set(null);
          this.sessions.update((list) => list.filter((s) => s.id !== session.id));
          this._notify.success('Session revoked.');
        },
        error: () => {
          this.revokingSessionId.set(null);
          this._notify.error('Could not revoke the session.');
        },
      });
  }

  protected async revokeAllSessions(user: UserResponse): Promise<void> {
    if (this.revokingAll()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Sign out everywhere',
      message: 'This immediately revokes every active session for this user, on every device.',
      consequence:
        'The user (and any signed-in admin console session of theirs) is signed out immediately and must sign in again.',
      confirmLabel: 'Sign out everywhere',
      danger: true,
      requirePhrase: 'SIGN OUT',
    });
    if (!confirmed) {
      return;
    }
    this.revokingAll.set(true);
    this._users
      .revokeAllSessions(user.id, 'admin_console_revoke_all')
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.revokingAll.set(false);
          this.sessions.set([]);
          this._notify.success('All sessions revoked.');
        },
        error: () => {
          this.revokingAll.set(false);
          this._notify.error('Could not revoke all sessions.');
        },
      });
  }

  protected loadTelegramConnection(id: string): void {
    this.telegramLoading.set(true);
    this.telegramError.set(null);
    this._users
      .getTelegramBotConnection(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((conn) => {
        this.telegramLoading.set(false);
        if (conn === null) {
          this.telegramError.set('Could not load the Telegram connection.');
          return;
        }
        this.telegramConnection.set(conn);
      });
  }

  protected async disconnectTelegram(user: UserResponse): Promise<void> {
    if (this.disconnectingTelegram()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Disconnect Telegram',
      message: "This clears the user's Telegram bot chat binding. They can reconnect later.",
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.disconnectingTelegram.set(true);
    this._users
      .disconnectTelegramBot(user.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.disconnectingTelegram.set(false);
          this._notify.success('Telegram disconnected.');
          this.loadTelegramConnection(user.id);
        },
        error: () => {
          this.disconnectingTelegram.set(false);
          this._notify.error('Could not disconnect Telegram.');
        },
      });
  }

  protected loadZaloConnection(id: string): void {
    this.zaloLoading.set(true);
    this.zaloError.set(null);
    this._users
      .getZaloBotConnection(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((conn) => {
        this.zaloLoading.set(false);
        if (conn === null) {
          this.zaloError.set('Could not load the Zalo connection.');
          return;
        }
        this.zaloConnection.set(conn);
      });
  }

  protected async disconnectZalo(user: UserResponse): Promise<void> {
    if (this.disconnectingZalo()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Disconnect Zalo',
      message: "This clears the user's Zalo bot chat binding. They can reconnect later.",
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.disconnectingZalo.set(true);
    this._users
      .disconnectZaloBot(user.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.disconnectingZalo.set(false);
          this._notify.success('Zalo disconnected.');
          this.loadZaloConnection(user.id);
        },
        error: () => {
          this.disconnectingZalo.set(false);
          this._notify.error('Could not disconnect Zalo.');
        },
      });
  }

  protected generateExport(user: UserResponse): void {
    if (this.generatingExport()) {
      return;
    }
    this.generatingExport.set(true);
    this.exportError.set(null);
    this._users
      .generateDataExport(user.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (result) => {
          this.generatingExport.set(false);
          this.exportResult.set(result);
          this._notify.success('Data export generated.');
        },
        error: () => {
          this.generatingExport.set(false);
          this.exportError.set('Could not generate the data export.');
          this._notify.error('Could not generate the data export.');
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
    this.propTimezone.set(user.timezone);
    this.propTimeFormat.set(user.timeFormat);
    this.propTheme.set(user.theme);
    this.propLanguage.set(user.language);
  }
}
