import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type {
  ActivationCohorts,
  ActivationFunnel,
  FeatureAdoption,
  NotificationMetrics,
  ProductivityTrend,
  RetentionMatrix,
  UserFacts,
} from './insights.models';

/**
 * Read-only insights surface. Array query params (eventNames, steps) are sent
 * comma-joined because ApiService only serializes primitive params. Dates are
 * plain 'YYYY-MM-DD' strings — fromDate inclusive, toDate exclusive.
 */
@Injectable({ providedIn: 'root' })
export class InsightsService {
  private readonly _api = inject(ApiService);

  public productivityTrend(
    fromDate: string,
    toDate: string,
    eventNames: string[],
    userId?: string,
  ): Observable<ProductivityTrend> {
    return this._api.get<ProductivityTrend>('/insights/productivity-trend', {
      fromDate,
      toDate,
      eventNames: eventNames.join(','),
      userId: userId || undefined,
    });
  }

  public featureAdoption(
    fromDate: string,
    toDate: string,
    limit?: number,
  ): Observable<FeatureAdoption> {
    return this._api.get<FeatureAdoption>('/insights/feature-adoption', {
      fromDate,
      toDate,
      limit,
    });
  }

  public activationFunnel(
    fromDate: string,
    toDate: string,
    steps: string[],
  ): Observable<ActivationFunnel> {
    return this._api.get<ActivationFunnel>('/insights/activation-funnel', {
      fromDate,
      toDate,
      steps: steps.join(','),
    });
  }

  public notificationMetrics(): Observable<NotificationMetrics> {
    return this._api.get<NotificationMetrics>('/notifications/admin/metrics');
  }

  public activationCohorts(weeks?: number, withinDays?: number): Observable<ActivationCohorts> {
    return this._api.get<ActivationCohorts>('/insights/activation-cohorts', { weeks, withinDays });
  }

  public retention(weeks?: number): Observable<RetentionMatrix> {
    return this._api.get<RetentionMatrix>('/insights/retention', { weeks });
  }

  public userFacts(userId: string): Observable<UserFacts> {
    return this._api.get<UserFacts>(`/insights/user-facts/${userId}`);
  }
}
