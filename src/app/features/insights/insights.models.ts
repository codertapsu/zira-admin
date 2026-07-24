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

/** One weekly signup cohort's activation rates (GET /insights/activation-cohorts). */
export interface ActivationCohortRow {
  cohortWeek: string;
  signups: number;
  reachedFirstTask: number;
  reachedFirstProject: number;
  firstTaskRate: number;
  firstProjectRate: number;
}

export interface ActivationCohorts {
  weeks: number;
  withinDays: number;
  cohorts: ActivationCohortRow[];
}

/** One cell of a retention curve: users/rate still active `weekOffset` weeks after signup. */
export interface RetentionCell {
  weekOffset: number;
  users: number;
  rate: number;
}

export interface RetentionCohortRow {
  cohortWeek: string;
  cohortSize: number;
  cells: RetentionCell[];
}

export interface RetentionMatrix {
  weeks: number;
  cohorts: RetentionCohortRow[];
}

/** Single-user activation record (GET /insights/user-facts/:userId). */
export interface UserFacts {
  userId: string | null;
  anonymousId: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  activatedAt: string | null;
  firstProjectCreatedAt: string | null;
  firstTaskCreatedAt: string | null;
  firstCalendarEventCreatedAt: string | null;
  firstNoteCreatedAt: string | null;
  facts: Record<string, string | number | boolean | null>;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A saved productivity/funnel query, persisted client-side (see InsightsSavedViewsService). */
export type InsightsViewKind = 'productivity' | 'funnel';

export interface InsightsSavedView {
  readonly id: string;
  readonly name: string;
  readonly kind: InsightsViewKind;
  readonly createdAt: string;
  readonly fromDate: string;
  readonly toDate: string;
  /** productivity views only */
  readonly eventNames?: string[];
  readonly userId?: string;
  /** funnel views only */
  readonly steps?: string[];
}
