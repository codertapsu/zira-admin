import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService, type QueryParams } from '../../core/api/api.service';
import type { CursorPage, FeatureFlag, UserSummary } from '../../core/api/models';
import type {
  AdminUpdateUserProperties,
  AdminUserFilter,
  AdminUserSearchOptions,
  UserChangeLog,
  UserResponse,
} from './users.models';

/** Client for the admin user-management endpoints (`/admin/users`). */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly _api = inject(ApiService);

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
}
