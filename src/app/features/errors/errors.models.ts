/**
 * Client-error telemetry contracts, mirrored from
 * `zira-server/apps/api-gateway/src/modules/telemetry`:
 * - `AdminClientErrorResponse` / `AdminClientErrorListResponse`
 * - `AdminClientErrorQueryDto`
 * - `AdminClientErrorTopQueryDto` / `AdminClientErrorTopResponse`
 *
 * Both endpoints are read-only admin/staff surfaces over the
 * `telemetry_events` Mongo collection, scoped to `kind = 'client_error'`.
 */

/** Kind-specific payload set by the intake path (`ClientErrorReportDto`); arbitrary extra `metadata` keys may also appear. */
export interface ClientErrorPayload {
  type?: string | null;
  name?: string | null;
  message?: string | null;
  stack?: string | null;
  httpStatus?: number | null;
  httpMethod?: string | null;
  httpUrl?: string | null;
  [key: string]: unknown;
}

/** One `client_error` telemetry row (`GET /admin/telemetry/client-errors`). */
export interface ClientErrorResponse {
  id: string;
  kind: string;
  receivedAt: string;
  clientTimestamp: string | null;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  appVersion: string | null;
  environment: string | null;
  url: string | null;
  route: string | null;
  payload: ClientErrorPayload;
}

/** Filters for the feed list. `from`/`to` are ISO 8601 and both inclusive. */
export interface ClientErrorFilter {
  environment?: string;
  appVersion?: string;
  route?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export const CLIENT_ERROR_GROUP_FIELDS = ['message', 'name'] as const;
export type ClientErrorGroupField = (typeof CLIENT_ERROR_GROUP_FIELDS)[number];

/** Filters for the "top offenders" aggregation. */
export interface ClientErrorTopFilter {
  from?: string;
  to?: string;
  environment?: string;
  appVersion?: string;
  groupBy?: ClientErrorGroupField;
  limit?: number;
}

/** One grouped bucket (`payload.message` or `payload.name`) with its event count. */
export interface ClientErrorTopItem {
  key: string | null;
  count: number;
}
