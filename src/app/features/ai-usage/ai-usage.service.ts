import { inject, Injectable } from '@angular/core';

import type { Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { AiUsageFilter, AiUsageListResponse, AiUsageSummaryResponse } from './ai-usage.models';

/** Client for the admin AI-spend endpoints (`/admin/ai-usage`). Read-only. */
@Injectable({ providedIn: 'root' })
export class AiUsageService {
  private readonly _api = inject(ApiService);

  public summary(filter: AiUsageFilter): Observable<AiUsageSummaryResponse> {
    return this._api.get<AiUsageSummaryResponse>('/admin/ai-usage/summary', {
      from: filter.from,
      to: filter.to,
    });
  }

  public list(filter: AiUsageFilter, offset = 0, limit = 50): Observable<AiUsageListResponse> {
    return this._api.get<AiUsageListResponse>('/admin/ai-usage', {
      from: filter.from,
      to: filter.to,
      userId: filter.userId,
      feature: filter.feature,
      offset,
      limit,
    });
  }
}
