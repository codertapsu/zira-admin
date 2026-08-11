/**
 * Coarse duration, because the exact second never matters on an ops screen.
 *
 * Shared because three surfaces render the same window: the overview's gateway
 * uptime, and the notification-metrics snapshots on Overview / Deliveries /
 * Insights. Those counters live in the gateway process and zero on every deploy
 * and every OOM restart, so the accumulation window is what makes a zero
 * legible — and it must read identically wherever it appears.
 */
export function durationLabel(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return 'Unknown';
  }
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${Math.floor(totalSeconds)}s`;
}

/**
 * The counting window for an in-memory metrics snapshot. `undefined` means the
 * field was absent, which must not render as "0s" — that would assert a fresh
 * restart we cannot see.
 */
export function metricsWindowLabel(uptimeSeconds: number | undefined): string {
  return uptimeSeconds === undefined ? 'an unknown window' : durationLabel(uptimeSeconds);
}
