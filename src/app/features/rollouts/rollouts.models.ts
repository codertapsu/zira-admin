import type { FeatureFlag } from '../../core/api/models';
import type { ChartPoint } from '../../core/ui/mini-chart.component';
import type { SystemSettingResponse } from '../system-settings/system-settings.models';

/**
 * Best-effort client-side prefix map from a feature flag to the
 * product-tracking event-name family that approximates its usage — mirrors
 * the taxonomy in zira-client's `core/product-tracking/tracking-events.ts`.
 *
 * Matching is by PREFIX against the real event catalog returned by
 * `GET /insights/feature-adoption`, never a literal event name sent to the
 * server — so a prefix with zero current matches is harmless and just means
 * "not tracked yet" rather than a guess that could typo an exact name.
 *
 * `zalo_bot_notifications` / `telegram_bot_notifications` are deliberately
 * `[]`: both channels fire the same `bot_connected` event with a `{ channel }`
 * property, so an eventName-only join can't attribute it to one flag over
 * the other. Fixing that needs a server-side per-channel event name, not a
 * client-side guess.
 */
export const FLAG_EVENT_PREFIXES: Readonly<Record<FeatureFlag, readonly string[]>> = {
  quick_create: ['quick_create_'],
  ai_assistant: ['assistant_', 'ai_assistant_'],
  team_summary: ['team_summary_'],
  voice_capture: ['voice_capture_'],
  approvals: ['approval_'],
  project_chatbot: ['project_chatbot_'],
  drawings: ['drawing_'],
  web_qr_login: ['web_qr_login_'],
  smart_notifications: ['smart_notification_'],
  zalo_bot_notifications: [],
  telegram_bot_notifications: [],
};

/**
 * One row of the rollout console: a feature flag joined to its (optional)
 * gating system setting plus a 30-day usage snapshot assembled from the
 * insights endpoints. `setting` is `null` when no system setting declares
 * `gatesFeatureFlag` for this flag — the flag exists but isn't wired to a
 * global gate yet.
 */
export interface RolloutRow {
  readonly flag: FeatureFlag;
  readonly setting: SystemSettingResponse | null;
  /** Whether `FLAG_EVENT_PREFIXES` has any prefix for this flag at all. */
  readonly hasMapping: boolean;
  readonly matchedEventNames: readonly string[];
  readonly totalEvents: number;
  readonly activeDays: number;
  /** Mutable array — `MiniChartComponent.points` takes `ChartPoint[]`, not `readonly ChartPoint[]`. */
  readonly sparkline: ChartPoint[];
}
