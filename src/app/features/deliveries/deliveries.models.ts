/** Mirrors `NotificationOutboxStatus` (apps/api-gateway .../entities/notification-outbox.entity.ts). */
export type OutboxStatus = 'pending' | 'sent' | 'failed';
export const OUTBOX_STATUSES: readonly OutboxStatus[] = ['pending', 'sent', 'failed'];

/**
 * Admin triage view of a single `notification_outbox` row
 * (dtos/admin-outbox-row.response.ts `OutboxRowResponse`). Deliberately omits
 * the context/target payload jsonb — triage keys off status/attempts/lastError.
 */
export interface OutboxRow {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  channel: string;
  eventType: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  dedupeKey: string | null;
  deliverAfter: string;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboxFilter {
  status?: OutboxStatus;
  channel?: string;
  recipientUserId?: string;
}

/** Mirrors `EventAlertDeliveryStatus` (entities/event-alert-delivery.entity.ts). */
export type EventAlertDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export const EVENT_ALERT_DELIVERY_STATUSES: readonly EventAlertDeliveryStatus[] = [
  'pending',
  'sent',
  'failed',
  'skipped',
];

/** Admin triage view of a single `event_alert_deliveries` row. */
export interface EventAlertDeliveryRow {
  id: string;
  eventAlertId: string;
  eventId: string;
  recipientUserId: string;
  occurrenceStartAt: string;
  scheduledAt: string;
  alertType: string;
  status: EventAlertDeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventAlertDeliveryFilter {
  recipientUserId?: string;
  eventId?: string;
  status?: EventAlertDeliveryStatus;
}

/**
 * Best-effort acknowledgement returned by the admin mutation endpoints when
 * there is no updated row to echo back (`NotificationOkResponse`).
 */
export interface NotificationOk {
  ok: true;
}

/**
 * Snapshot from `GET /notifications/admin/metrics` — same shape
 * InsightsService already reads for the full counters/gauges dashboard.
 * Counter/gauge keys are flat metric names (optionally with a `{label="x"}`
 * suffix); unlabeled metrics key off the bare name.
 */
export interface DeliveryMetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  takenAt: string;
}
