import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiService, type QueryParams } from '../../core/api/api.service';
import type { CursorPage, FeatureFlag, UserSummary } from '../../core/api/models';
import type {
  AdminSession,
  AdminUpdateUserProperties,
  AdminUserFilter,
  AdminUserSearchOptions,
  BotConnection,
  UserChangeLog,
  UserDataExport,
  UserResponse,
} from './users.models';

/** Client for the admin user-management endpoints (`/admin/users`). */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly _api = inject(ApiService);
  /** Gateway origin (apiBaseUrl minus the `/api/vN` prefix) — mirrors UploadService. */
  private readonly _origin = environment.apiBaseUrl.replace(/\/api\/v\d+\/?$/, '');

  public searchSummaries(
    filter: AdminUserFilter,
    options?: AdminUserSearchOptions,
  ): Observable<CursorPage<UserSummary>> {
    return this._api.post<CursorPage<UserSummary>>('/admin/users/search-summaries', {
      filter,
      options,
    });
  }

  public getById(id: string): Observable<UserResponse> {
    return this._api.get<UserResponse>(`/admin/users/${id}`);
  }

  public updateProperties(
    id: string,
    payload: AdminUpdateUserProperties,
  ): Observable<UserResponse> {
    return this._api.patch<UserResponse>(`/admin/users/${id}/properties`, payload);
  }

  public updateFeatureFlags(id: string, flags: FeatureFlag[]): Observable<UserResponse> {
    return this._api.patch<UserResponse>(`/admin/users/${id}/feature-flags`, {
      enabledFeatureFlags: flags,
    });
  }

  public assignStaff(id: string): Observable<UserResponse> {
    return this._api.post<UserResponse>(`/admin/users/${id}/roles`, { role: 'staff' });
  }

  /** Returns a body, but our `delete()` is void — re-fetch the user afterwards. */
  public revokeStaff(id: string): Observable<void> {
    return this._api.delete(`/admin/users/${id}/roles/staff`);
  }

  public deactivate(id: string): Observable<UserResponse> {
    return this._api.post<UserResponse>(`/admin/users/${id}/deactivate`);
  }

  public reactivate(id: string): Observable<UserResponse> {
    return this._api.post<UserResponse>(`/admin/users/${id}/reactivate`);
  }

  /** Hard delete; the `{ success: true }` body is ignored by `delete()`. */
  public remove(id: string): Observable<void> {
    return this._api.delete(`/admin/users/${id}`);
  }

  public history(
    id: string,
    options?: AdminUserSearchOptions,
  ): Observable<CursorPage<UserChangeLog>> {
    return this._api.get<CursorPage<UserChangeLog>>(
      `/admin/users/${id}/history`,
      options as QueryParams | undefined,
    );
  }

  public getSessions(id: string): Observable<AdminSession[]> {
    return this._api.get<AdminSession[]>(`/admin/users/${id}/sessions`);
  }

  /** DELETE returns 204 — our `delete()` is void, drop the row from the list client-side. */
  public revokeSession(id: string, tokenId: string): Observable<void> {
    return this._api.delete(`/admin/users/${id}/sessions/${tokenId}`);
  }

  public revokeAllSessions(id: string, reason?: string): Observable<{ success: boolean }> {
    return this._api.post<{ success: boolean }>(
      `/admin/users/${id}/sessions/revoke-all`,
      reason ? { reason } : undefined,
    );
  }

  public getTelegramBotConnection(id: string): Observable<BotConnection> {
    return this._api.get<BotConnection>(`/admin/users/${id}/telegram-bot/connection`);
  }

  /** Returns `{ success }`, but our `delete()` is void — re-fetch the connection afterwards. */
  public disconnectTelegramBot(id: string): Observable<void> {
    return this._api.delete(`/admin/users/${id}/telegram-bot/connection`);
  }

  public getZaloBotConnection(id: string): Observable<BotConnection> {
    return this._api.get<BotConnection>(`/admin/users/${id}/zalo-bot/connection`);
  }

  /** Returns `{ success }`, but our `delete()` is void — re-fetch the connection afterwards. */
  public disconnectZaloBot(id: string): Observable<void> {
    return this._api.delete(`/admin/users/${id}/zalo-bot/connection`);
  }

  /**
   * Runs the GDPR/PDPD data export and returns a one-time download link. `url`
   * comes back gateway-relative (e.g. `/api/v1/files/dl/…`) — rewritten to an
   * absolute URL here so it resolves correctly from the Firebase-hosted origin.
   */
  public generateDataExport(id: string): Observable<UserDataExport> {
    return this._api
      .post<UserDataExport>(`/admin/users/${id}/data-export`)
      .pipe(map((res) => ({ ...res, url: `${this._origin}${res.url}` })));
  }
}
