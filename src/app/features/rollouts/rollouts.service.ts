import { inject, Injectable } from '@angular/core';

import type { Observable } from 'rxjs';

import type { FeatureAdoption, ProductivityTrend } from '../insights/insights.models';
import { InsightsService } from '../insights/insights.service';
import type { SystemSettingResponse } from '../system-settings/system-settings.models';
import { SystemSettingsService } from '../system-settings/system-settings.service';

/**
 * Composition layer for the rollout console. Delegates to the system-settings
 * and insights verticals' own services rather than re-declaring their
 * endpoint contracts — this feature only joins their data client-side.
 */
@Injectable({ providedIn: 'root' })
export class RolloutsService {
  private readonly _settings = inject(SystemSettingsService);
  private readonly _insights = inject(InsightsService);

  public settings(): Observable<SystemSettingResponse[]> {
    return this._settings.list();
  }

  /** Flips a gating setting's value. PATCH `/admin/system-settings/:key`. */
  public updateGate(key: string, value: unknown): Observable<SystemSettingResponse> {
    return this._settings.update(key, value);
  }

  public adoption(fromDate: string, toDate: string): Observable<FeatureAdoption> {
    return this._insights.featureAdoption(fromDate, toDate);
  }

  public trend(
    fromDate: string,
    toDate: string,
    eventNames: string[],
  ): Observable<ProductivityTrend> {
    return this._insights.productivityTrend(fromDate, toDate, eventNames);
  }
}
