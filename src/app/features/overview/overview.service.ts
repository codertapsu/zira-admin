import { inject, Injectable } from '@angular/core';

import { forkJoin, type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type { CampaignResponse } from '../campaigns/campaigns.models';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { FeedbackResponse, FeedbackSearchDto } from '../feedback/feedback.models';
import { FeedbackService } from '../feedback/feedback.service';
import type { NotificationMetrics, ProductivityTrend } from '../insights/insights.models';
import { InsightsService } from '../insights/insights.service';
import type { SubscriptionPurchaseRequestResponse } from '../subscriptions/subscriptions.models';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { HealthCheckResult, VersionResponse } from './overview.models';

/** Live + upcoming campaigns, fetched by their two respective statuses. */
export interface CampaignsByStatus {
  active: CampaignResponse[];
  scheduled: CampaignResponse[];
}

const NEW_OR_OPEN_FEEDBACK_SEARCH: FeedbackSearchDto = {
  filter: { statuses: ['new', 'open'] },
  options: { limit: 1 },
};

/**
 * Composition layer for the home dashboard. Every tile's data already belongs
 * to an existing vertical — this service delegates to each vertical's own
 * service rather than re-declaring their endpoint contracts, and owns only
 * the public health/version probes that no feature vertical claims.
 */
@Injectable({ providedIn: 'root' })
export class OverviewService {
  private readonly _api = inject(ApiService);
  private readonly _campaigns = inject(CampaignsService);
  private readonly _feedback = inject(FeedbackService);
  private readonly _insights = inject(InsightsService);
  private readonly _subscriptions = inject(SubscriptionsService);

  /** First page of pending subscription purchase requests. */
  public pendingPurchaseRequests(
    limit = 5,
  ): Observable<CursorPage<SubscriptionPurchaseRequestResponse>> {
    return this._subscriptions.listRequests({ status: 'pending', limit });
  }

  /** `limit: 1` is enough — the tile only needs `items.length` + `hasMore` as a presence gauge. */
  public newOrOpenFeedback(): Observable<CursorPage<FeedbackResponse>> {
    return this._feedback.search(NEW_OR_OPEN_FEEDBACK_SEARCH);
  }

  public campaignsByStatus(): Observable<CampaignsByStatus> {
    return forkJoin({
      active: this._campaigns.list('active'),
      scheduled: this._campaigns.list('scheduled'),
    });
  }

  public notificationMetrics(): Observable<NotificationMetrics> {
    return this._insights.notificationMetrics();
  }

  /** DAU proxy: `app_opened` counts per day over the given inclusive-from/exclusive-to range. */
  public dauTrend(fromDate: string, toDate: string): Observable<ProductivityTrend> {
    return this._insights.productivityTrend(fromDate, toDate, ['app_opened']);
  }

  /** Liveness probe — public, no external deps checked. */
  public health(): Observable<HealthCheckResult> {
    return this._api.get<HealthCheckResult>('/health');
  }

  /** Readiness probe — public, verifies DB + Redis. */
  public readiness(): Observable<HealthCheckResult> {
    return this._api.get<HealthCheckResult>('/health/ready');
  }

  /** Public release-metadata handshake (server build + supported client versions). */
  public version(): Observable<VersionResponse> {
    return this._api.get<VersionResponse>('/version');
  }
}
