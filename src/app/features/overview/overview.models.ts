/**
 * Contracts owned by the overview dashboard itself: the two public
 * release-metadata/health probes (`GET /health`, `GET /health/ready`,
 * `GET /version`) plus the admin-only `GET /health/deployed-state`. Every other
 * tile's shape belongs to its own vertical
 * (campaigns/feedback/subscriptions/insights) — see overview.service.ts.
 */

/** `GET /version` — public release-compatibility handshake (`VersionController`). */
export interface VersionResponse {
  serverVersion: string;
  minClientVersion: string;
  minHardClientVersion: string;
  blockBelowMin: boolean;
}

/**
 * `GET /health/deployed-state` — Admin/Staff only (`DeployedStateController`).
 *
 * The runtime counterpart to `docs/deployment/PENDING.md`: the ledger says what
 * SHOULD be deployed, this says what IS. Every field that can fail to load is
 * `null` and must render as "Unknown" — never as a zero or a blank, which would
 * read as a fact.
 */
export interface DeployedStateResponse {
  serverVersion: string;
  nodeEnv: string;
  startedAt: string;
  uptimeSeconds: number;
  /** `null` when the table is empty OR unreadable — `appliedMigrationCount` tells them apart. */
  latestMigration: AppliedMigrationInfo | null;
  /** `0` = genuinely none applied. `null` = the query failed. */
  appliedMigrationCount: number | null;
  /** `[]` = readable and empty. `null` = unreadable. */
  schedulerHeartbeats: SchedulerHeartbeatInfo[] | null;
}

/**
 * One applied migration. There is no apply time on purpose: `typeorm_migrations`
 * stores none, and `timestamp` is the migration's authoring stamp.
 */
export interface AppliedMigrationInfo {
  name: string;
  timestamp: string;
}

/** One advisory-locked scheduler's durable liveness row. */
export interface SchedulerHeartbeatInfo {
  job: string;
  lastStartedAt: string;
  lastSuccessAt: string | null;
  lastOutcome: string;
  lastError: string | null;
  consecutiveFailures: number;
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
