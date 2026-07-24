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

import { SecurityService } from './security.service';
import type { AdminLoginCodeAudit, TokenReuseEvent } from './security.models';

type SecurityTab = 'theft' | 'codes';

/**
 * Security audit console: refresh-token reuse (theft) feed + admin-console
 * login-code redemption audit. Both endpoints already return a safe DTO
 * (never a token/code hash) — see `zira-server` `AdminSecurityController`.
 */
@Component({
  selector: 'app-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Security</h1>
      </header>

      <div class="card" style="padding: 14px 20px; margin-bottom: 16px">
        <p class="muted" style="margin: 0">
          Admin-console login is gated by the
          <span style="font-family: var(--mono, monospace)">admin_login.enabled</span> kill-switch.
          <button class="btn btn--ghost btn--sm" type="button" (click)="goToSystemSettings()">
            Manage in System settings
          </button>
        </p>
      </div>

      <nav class="tabs" aria-label="Security sections">
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'theft'"
          (click)="tab.set('theft')"
        >
          Theft events
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'codes'"
          (click)="selectCodes()"
        >
          Console access
        </button>
      </nav>

      @switch (tab()) {
        @case ('theft') {
          @if (theftLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (theftError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="loadTheftEvents()">
                Retry
              </button>
            </div>
          } @else if (theftEvents().length === 0) {
            <div class="state state--col">
              <p class="state__empty">No token-reuse events recorded.</p>
            </div>
          } @else {
            <div class="table-wrap card" style="margin-top: 16px">
              <table class="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Device</th>
                    <th>IP</th>
                    <th>User agent</th>
                    <th>Family</th>
                    <th>Revoked at</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  @for (event of theftEvents(); track event.id) {
                    <tr>
                      <td>
                        <button
                          class="btn btn--ghost btn--sm"
                          type="button"
                          style="font-family: var(--mono, monospace)"
                          (click)="viewUser(event.userId)"
                        >
                          {{ event.userId }}
                        </button>
                      </td>
                      <td>{{ event.deviceId || '—' }}</td>
                      <td>{{ event.ip || '—' }}</td>
                      <td class="table__sub" style="max-width: 260px">
                        {{ truncate(event.userAgent) }}
                      </td>
                      <td style="font-family: var(--mono, monospace)">{{ event.familyId }}</td>
                      <td>{{ formatDate(event.revokedAt) }}</td>
                      <td><span class="badge badge--danger">Token reuse</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (theftHasMore()) {
              <div class="page__more">
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  [disabled]="theftLoadingMore()"
                  (click)="loadMoreTheft()"
                >
                  {{ theftLoadingMore() ? 'Loading…' : 'Load more' }}
                </button>
              </div>
            }
          }
        }

        @case ('codes') {
          <div class="toolbar" style="margin-top: 16px">
            <input
              class="input"
              type="text"
              aria-label="Filter by user ID"
              placeholder="Filter by user ID (UUID)…"
              style="max-width: 320px"
              [ngModel]="codeUserId()"
              (ngModelChange)="codeUserId.set($event)"
              (keyup.enter)="loadCodes()"
            />
            <button class="btn btn--primary btn--sm" type="button" (click)="loadCodes()">
              Search
            </button>
          </div>

          @if (codesLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (codesError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="loadCodes()">
                Retry
              </button>
            </div>
          } @else if (codes().length === 0) {
            <div class="state state--col">
              <p class="state__empty">No admin-login codes recorded.</p>
            </div>
          } @else {
            <div class="table-wrap card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Minted by</th>
                    <th>Minted at</th>
                    <th>Minted IP</th>
                    <th>Redeemed?</th>
                    <th>Redeemed at</th>
                    <th>Redeemed IP</th>
                    <th>Expired unredeemed</th>
                  </tr>
                </thead>
                <tbody>
                  @for (code of codes(); track code.id) {
                    <tr>
                      <td>
                        <button
                          class="btn btn--ghost btn--sm"
                          type="button"
                          style="font-family: var(--mono, monospace)"
                          (click)="viewUser(code.userId)"
                        >
                          {{ code.userId }}
                        </button>
                      </td>
                      <td>{{ formatDate(code.createdAt) }}</td>
                      <td>{{ code.createdIp || '—' }}</td>
                      <td>
                        @if (code.redeemed) {
                          <span class="badge badge--ok">Redeemed</span>
                        } @else {
                          <span class="badge badge--muted">Not redeemed</span>
                        }
                      </td>
                      <td>{{ formatDate(code.consumedAt) }}</td>
                      <td>{{ code.consumedIp || '—' }}</td>
                      <td>
                        @if (isExpiredUnredeemed(code)) {
                          <span class="badge badge--danger">Expired</span>
                        } @else {
                          —
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (codesHasMore()) {
              <div class="page__more">
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  [disabled]="codesLoadingMore()"
                  (click)="loadMoreCodes()"
                >
                  {{ codesLoadingMore() ? 'Loading…' : 'Load more' }}
                </button>
              </div>
            }
          }
        }
      }
    </section>
  `,
})
export class SecurityComponent implements OnInit {
  private readonly _security = inject(SecurityService);
  private readonly _router = inject(Router);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly tab = signal<SecurityTab>('theft');

  // Theft (token-reuse) feed.
  protected readonly theftEvents = signal<TokenReuseEvent[]>([]);
  protected readonly theftLoading = signal<boolean>(false);
  protected readonly theftLoadingMore = signal<boolean>(false);
  protected readonly theftError = signal<string | null>(null);
  protected readonly theftCursor = signal<string | null>(null);
  protected readonly theftHasMore = signal<boolean>(false);

  // Console-access (admin-login-code) audit.
  protected readonly codeUserId = signal<string>('');
  protected readonly codes = signal<AdminLoginCodeAudit[]>([]);
  protected readonly codesLoading = signal<boolean>(false);
  protected readonly codesLoadingMore = signal<boolean>(false);
  protected readonly codesError = signal<string | null>(null);
  protected readonly codesCursor = signal<string | null>(null);
  protected readonly codesHasMore = signal<boolean>(false);

  private _codesLoaded = false;

  public ngOnInit(): void {
    this.loadTheftEvents();
  }

  protected goToSystemSettings(): void {
    void this._router.navigate(['/system-settings']);
  }

  protected viewUser(userId: string): void {
    void this._router.navigate(['/users', userId]);
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  protected truncate(value: string | null, max = 60): string {
    if (!value) {
      return '—';
    }
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }

  protected isExpiredUnredeemed(code: AdminLoginCodeAudit): boolean {
    if (code.redeemed) {
      return false;
    }
    const expiry = new Date(code.expiresAt).getTime();
    return !Number.isNaN(expiry) && expiry < Date.now();
  }

  protected selectCodes(): void {
    this.tab.set('codes');
    if (!this._codesLoaded) {
      this.loadCodes();
    }
  }

  protected loadTheftEvents(): void {
    this._fetchTheft();
  }

  protected loadMoreTheft(): void {
    const cursor = this.theftCursor();
    if (cursor === null || this.theftLoadingMore()) {
      return;
    }
    this._fetchTheft(cursor);
  }

  protected loadCodes(): void {
    this._fetchCodes();
  }

  protected loadMoreCodes(): void {
    const cursor = this.codesCursor();
    if (cursor === null || this.codesLoadingMore()) {
      return;
    }
    this._fetchCodes(cursor);
  }

  private _fetchTheft(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.theftLoading.set(true);
    } else {
      this.theftLoadingMore.set(true);
    }
    this.theftError.set(null);

    this._security
      .tokenReuseEvents({ cursor, limit: 50 })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.theftLoading.set(false);
        this.theftLoadingMore.set(false);
        if (res === null) {
          this.theftError.set('Could not load token-reuse events.');
          return;
        }
        this.theftEvents.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.theftCursor.set(res.nextCursor);
        this.theftHasMore.set(res.hasMore);
      });
  }

  private _fetchCodes(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.codesLoading.set(true);
    } else {
      this.codesLoadingMore.set(true);
    }
    this.codesError.set(null);

    const userId = this.codeUserId().trim();
    this._security
      .adminLoginCodes({
        cursor,
        limit: 50,
        userId: userId.length > 0 ? userId : undefined,
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this._codesLoaded = true;
        this.codesLoading.set(false);
        this.codesLoadingMore.set(false);
        if (res === null) {
          this.codesError.set('Could not load admin login codes.');
          return;
        }
        this.codes.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.codesCursor.set(res.nextCursor);
        this.codesHasMore.set(res.hasMore);
      });
  }
}
