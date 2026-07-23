import { computed, Injectable, signal } from '@angular/core';

const ACCESS_KEY = 'zira.admin.accessToken';
const REFRESH_KEY = 'zira.admin.refreshToken';

/**
 * Holds the admin bearer session. zira-admin is a separate origin from the
 * gateway, so cookies can't be used — the access + refresh tokens live in
 * memory (signals) and mirror to localStorage so a reload keeps the session.
 * All storage access is fail-soft.
 */
@Injectable({ providedIn: 'root' })
export class TokenStoreService {
  private readonly _access = signal<string | null>(this._read(ACCESS_KEY));
  private readonly _refresh = signal<string | null>(this._read(REFRESH_KEY));

  public readonly accessToken = this._access.asReadonly();
  public readonly refreshToken = this._refresh.asReadonly();
  public readonly isAuthenticated = computed(() => this._access() !== null);

  public setTokens(accessToken: string, refreshToken: string): void {
    this._access.set(accessToken);
    this._refresh.set(refreshToken);
    this._write(ACCESS_KEY, accessToken);
    this._write(REFRESH_KEY, refreshToken);
  }

  public clear(): void {
    this._access.set(null);
    this._refresh.set(null);
    this._remove(ACCESS_KEY);
    this._remove(REFRESH_KEY);
  }

  private _read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private _write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — session stays in memory only */
    }
  }

  private _remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable — nothing to clear */
    }
  }
}
