import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { finalize, map, type Observable, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { ApiEnvelope, TokenPair } from '../api/models';
import { TokenStoreService } from './token-store.service';

/**
 * Owns the admin bearer session lifecycle: redeem a one-time login code
 * (minted in zira-client) for tokens, rotate them via /auth/refresh, and
 * tear the session down. Tokens are persisted through `TokenStoreService`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _http = inject(HttpClient);
  private readonly _tokens = inject(TokenStoreService);
  private readonly _router = inject(Router);
  private readonly _base = environment.apiBaseUrl;

  /** In-flight token rotation shared across concurrent 401s (see `refresh`). */
  private _refreshInFlight: Observable<void> | null = null;

  /** Redeem an admin login code for a bearer session. */
  public exchangeCode(code: string): Observable<void> {
    return this._http
      .post<ApiEnvelope<TokenPair>>(`${this._base}/auth/admin-login/codes/exchange`, {
        code,
      })
      .pipe(
        tap((res) => this._tokens.setTokens(res.data.accessToken, res.data.refreshToken)),
        map(() => undefined),
      );
  }

  /**
   * Rotate the token pair. The refresh token travels in `x-refresh-token`
   * (zira-admin can't send the gateway cookie). The server rotates the whole
   * family, so both tokens are replaced.
   *
   * Concurrent 401s share ONE in-flight rotation. Without this, two requests
   * would each POST /auth/refresh with the same refresh token; the second one
   * carries a token the first already rotated away, trips server reuse
   * detection, and the whole family is revoked — force-logging the admin out.
   */
  public refresh(): Observable<void> {
    if (!this._refreshInFlight) {
      const refreshToken = this._tokens.refreshToken();

      this._refreshInFlight = this._http
        .post<ApiEnvelope<TokenPair>>(
          `${this._base}/auth/refresh`,
          {},
          { headers: refreshToken ? { 'x-refresh-token': refreshToken } : {} },
        )
        .pipe(
          tap((res) => this._tokens.setTokens(res.data.accessToken, res.data.refreshToken)),
          map(() => undefined),
          finalize(() => {
            this._refreshInFlight = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }

    return this._refreshInFlight;
  }

  /**
   * Ends the session on the server, then locally.
   *
   * Clearing local state alone left the refresh-token family redeemable for
   * its full 30-day TTL, so anything that had captured the stored token could
   * still mint admin access tokens long after the operator signed out — on a
   * shared machine, that is the whole point of signing out. This console
   * renders the token-reuse feed on its own Security page, which made the
   * omission particularly odd.
   *
   * Fire-and-forget: the local session is cleared whatever the server says, so
   * a network failure can never strand the operator in a signed-in shell.
   */
  public logout(): void {
    const refreshToken = this._tokens.refreshToken();

    if (refreshToken) {
      this._http
        .post<unknown>(
          `${this._base}/auth/logout`,
          {},
          { headers: { 'x-refresh-token': refreshToken } },
        )
        .subscribe({ next: () => undefined, error: () => undefined });
    }

    this._tokens.clear();
    void this._router.navigate(['/connect']);
  }
}
