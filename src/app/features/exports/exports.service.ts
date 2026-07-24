import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type { ExportAuditFilter, ExportAuditLogResponse } from './exports.models';

/** Client for the admin data-egress audit endpoint (`/admin/export-audit`). */
@Injectable({ providedIn: 'root' })
export class ExportsService {
  private readonly _api = inject(ApiService);
  /** Gateway origin (apiBaseUrl minus the `/api/vN` prefix) — mirrors UsersService, to resolve the root-relative `fileUrl`. */
  private readonly _origin = environment.apiBaseUrl.replace(/\/api\/v\d+\/?$/, '');

  public list(
    filter: ExportAuditFilter,
    cursor?: string,
    limit = 50,
  ): Observable<CursorPage<ExportAuditLogResponse>> {
    return this._api
      .get<CursorPage<ExportAuditLogResponse>>('/admin/export-audit', {
        userId: filter.userId,
        from: filter.from,
        to: filter.to,
        cursor,
        limit,
      })
      .pipe(
        map((page) => ({
          ...page,
          items: page.items.map((item) => ({
            ...item,
            fileUrl: item.fileUrl ? `${this._origin}${item.fileUrl}` : null,
          })),
        })),
      );
  }
}
