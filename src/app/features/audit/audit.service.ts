import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type {
  AdminAuditEvent,
  AdminAuditEventFilter,
  AdminAuditEventSearchOptions,
} from './audit.models';

/** Client for the admin audit trail (`/admin/audit-events`, admin-only). */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly _api = inject(ApiService);

  public list(
    filter: AdminAuditEventFilter,
    options?: AdminAuditEventSearchOptions,
  ): Observable<CursorPage<AdminAuditEvent>> {
    return this._api.get<CursorPage<AdminAuditEvent>>('/admin/audit-events', {
      actorUserId: filter.actorUserId,
      resourceType: filter.resourceType,
      from: filter.from,
      to: filter.to,
      cursor: options?.cursor,
      limit: options?.limit,
    });
  }
}
