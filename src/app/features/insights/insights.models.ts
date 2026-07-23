/** Product-insights + notification-metrics contracts (all GET /insights/* + /notifications/admin/metrics). */

/** One point in the productivity trend: a count for an event on a given day. */
export interface ProductivityPoint {
  date: string;
  eventName: string;
  count: number;
}

export interface ProductivityTrend {
  series: ProductivityPoint[];
}

/** One row of feature adoption: how many times an event fired and on how many distinct days. */
export interface FeatureAdoptionItem {
  eventName: string;
  totalCount: number;
  daysActive: number;
}

export interface FeatureAdoption {
  items: FeatureAdoptionItem[];
}

/** One ordered step of the activation funnel. `conversionFromPrev` is null for the first step. */
export interface FunnelStep {
  index: number;
  eventName: string;
  users: number;
  conversionFromPrev: number | null;
}

export interface ActivationFunnel {
  steps: FunnelStep[];
}

/** Point-in-time notification-delivery metrics. */
export interface NotificationMetrics {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  takenAt: string;
}
