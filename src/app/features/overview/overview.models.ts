/**
 * Contracts owned by the overview dashboard itself: the two public
 * release-metadata/health probes (`GET /health`, `GET /health/ready`,
 * `GET /version`). Every other tile's shape belongs to its own vertical
 * (campaigns/feedback/subscriptions/insights) — see overview.service.ts.
 */

/** `GET /version` — public release-compatibility handshake (`VersionController`). */
export interface VersionResponse {
  serverVersion: string;
  minClientVersion: string;
  minHardClientVersion: string;
  blockBelowMin: boolean;
}

/** One Terminus health indicator's result, keyed by indicator name (e.g. `database`, `redis`). */
export interface HealthIndicatorResult {
  [indicator: string]: { status: string; [detail: string]: unknown };
}

/** Terminus `HealthCheckResult` shape returned by both `GET /health` and `GET /health/ready`. */
export interface HealthCheckResult {
  status: 'ok' | 'error' | 'shutting_down';
  info?: HealthIndicatorResult;
  error?: HealthIndicatorResult;
  details: HealthIndicatorResult;
}
