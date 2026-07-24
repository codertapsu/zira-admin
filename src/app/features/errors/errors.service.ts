import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { CursorPage, ItemsList } from '../../core/api/models';
import type {
  ClientErrorFilter,
  ClientErrorResponse,
  ClientErrorTopFilter,
  ClientErrorTopItem,
} from './errors.models';

/** Client for the admin client-error telemetry endpoints (`/admin/telemetry/client-errors`). */
@Injectable({ providedIn: 'root' })
export class ErrorsService {
  private readonly _api = inject(ApiService);

  public list(
    filter: ClientErrorFilter,
    cursor?: string,
    limit = 50,
  ): Observable<CursorPage<ClientErrorResponse>> {
    return this._api.get<CursorPage<ClientErrorResponse>>('/admin/telemetry/client-errors', {
      environment: filter.environment,
      appVersion: filter.appVersion,
      route: filter.route,
      userId: filter.userId,
      from: filter.from,
      to: filter.to,
      cursor,
      limit,
    });
  }

  public top(filter: ClientErrorTopFilter): Observable<ItemsList<ClientErrorTopItem>> {
    return this._api.get<ItemsList<ClientErrorTopItem>>('/admin/telemetry/client-errors/top', {
      from: filter.from,
      to: filter.to,
      environment: filter.environment,
      appVersion: filter.appVersion,
      groupBy: filter.groupBy,
      limit: filter.limit,
    });
  }
}
