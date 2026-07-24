import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type {
  DeliveryMetricsSnapshot,
  EventAlertDeliveryFilter,
  EventAlertDeliveryRow,
  NotificationOk,
  OutboxFilter,
  OutboxRow,
} from './deliveries.models';

/**
 * Client for the admin notification-delivery triage endpoints
 * (`/admin/notifications/*` + the shared `/notifications/admin/metrics`
 * snapshot). Read + best-effort requeue/cancel/regenerate; no destructive
 * deletes on the server side.
 */
@Injectable({ providedIn: 'root' })
export class DeliveriesService {
  private readonly _api = inject(ApiService);

  public listOutbox(
    filter: OutboxFilter,
    cursor?: string,
    limit = 20,
  ): Observable<CursorPage<OutboxRow>> {
    return this._api.get<CursorPage<OutboxRow>>('/admin/notifications/outbox', {
      status: filter.status,
      channel: filter.channel,
      recipientUserId: filter.recipientUserId,
      cursor,
      limit,
    });
  }

  public requeueOutbox(id: string): Observable<OutboxRow | NotificationOk> {
    return this._api.post<OutboxRow | NotificationOk>(`/admin/notifications/outbox/${id}/requeue`);
  }

  public cancelOutbox(id: string): Observable<OutboxRow | NotificationOk> {
    return this._api.post<OutboxRow | NotificationOk>(`/admin/notifications/outbox/${id}/cancel`);
  }

  public listEventAlertDeliveries(
    filter: EventAlertDeliveryFilter,
    cursor?: string,
    limit = 20,
  ): Observable<CursorPage<EventAlertDeliveryRow>> {
    return this._api.get<CursorPage<EventAlertDeliveryRow>>(
      '/admin/notifications/event-alert-deliveries',
      {
        recipientUserId: filter.recipientUserId,
        eventId: filter.eventId,
        status: filter.status,
        cursor,
        limit,
      },
    );
  }

  public regenerateEventAlerts(eventId: string): Observable<NotificationOk> {
    return this._api.post<NotificationOk>(
      `/admin/notifications/events/${eventId}/regenerate-alerts`,
    );
  }

  /** Same snapshot InsightsService reads for the full metrics dashboard. */
  public metrics(): Observable<DeliveryMetricsSnapshot> {
    return this._api.get<DeliveryMetricsSnapshot>('/notifications/admin/metrics');
  }
}
