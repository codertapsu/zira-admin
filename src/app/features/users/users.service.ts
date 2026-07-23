import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  AdminUserFilter,
  AdminUserSearchOptions,
  AdminUserSummarySearchResponse,
  ApiEnvelope,
} from '../../core/api/models';

/** Client for the admin user-management endpoints (`/admin/users`). */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly _http = inject(HttpClient);
  private readonly _base = `${environment.apiBaseUrl}/admin/users`;

  public searchSummaries(
    filter: AdminUserFilter,
    options?: AdminUserSearchOptions,
  ): Observable<AdminUserSummarySearchResponse> {
    return this._http
      .post<ApiEnvelope<AdminUserSummarySearchResponse>>(`${this._base}/search-summaries`, {
        filter,
        options,
      })
      .pipe(map((res) => res.data));
  }

  public deactivate(id: string): Observable<void> {
    return this._http
      .post<ApiEnvelope<unknown>>(`${this._base}/${id}/deactivate`, {})
      .pipe(map(() => undefined));
  }

  public reactivate(id: string): Observable<void> {
    return this._http
      .post<ApiEnvelope<unknown>>(`${this._base}/${id}/reactivate`, {})
      .pipe(map(() => undefined));
  }
}
