/**
 * A single recorded admin/staff mutation (`GET /admin/audit-events`). Written
 * by a global interceptor on the server for every non-GET request under
 * `/admin/` — see `AdminAuditEventResponse` on the gateway.
 */
export interface AdminAuditEvent {
  id: string;
  /** The admin/staff user who performed the mutation. */
  actorUserId: string;
  /** Method + normalized route, e.g. `PATCH /admin/campaigns/:id`. */
  action: string;
  /** Resource collection segment after `/admin/`, if resolvable. */
  resourceType: string | null;
  /** The `:id` route param, when the request targeted one. */
  resourceId: string | null;
  /** HTTP status observed for the response. */
  statusCode: number;
  /** Trust-proxy-derived client IP. */
  ip: string | null;
  /** ISO 8601 with offset. */
  createdAt: string;
}

export interface AdminAuditEventFilter {
  actorUserId?: string;
  resourceType?: string;
  /** Inclusive lower bound on `createdAt` (ISO 8601). */
  from?: string;
  /** Inclusive upper bound on `createdAt` (ISO 8601). */
  to?: string;
}

export interface AdminAuditEventSearchOptions {
  cursor?: string;
  limit?: number;
}

/**
 * `resourceType` values seen in practice — the collection segment right after
 * `/admin/` for every admin controller in the gateway. The server accepts any
 * string here (it's just a filter), so this list is a curated convenience for
 * the dropdown, not an exhaustive contract.
 */
export const AUDIT_RESOURCE_TYPES: readonly string[] = [
  'users',
  'campaigns',
  'feedback',
  'notifications',
  'export-audit',
  'subscription-plans',
  'subscription-promo-codes',
  'subscription-purchase-requests',
  'user-subscriptions',
  'support',
  'system-settings',
  'bot-bindings',
  'telemetry',
];
