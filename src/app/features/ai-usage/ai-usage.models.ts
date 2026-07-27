/**
 * AI spend contracts, mirrored from the gateway's `admin/ai-usage` surface:
 * - `GET /admin/ai-usage/summary` — spend rolled up by feature + model.
 * - `GET /admin/ai-usage` — the raw rows behind the rollup, newest first.
 *
 * Cost is NOT stored per row on the server; it is priced at read time from a
 * versioned rate table. `estimatedCostUsd` is therefore `null` — never 0 —
 * when the model is missing from that table, which is how a newly shipped
 * model surfaces as "unpriced" instead of silently reporting free.
 */

/** One `(feature, model)` bucket of `GET /admin/ai-usage/summary`. */
export interface AiUsageSummaryRow {
  feature: string;
  model: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  audioMs: number;
  inputChars: number;
  /** `null` when the model has no entry in the server's rate table. */
  estimatedCostUsd: number | null;
}

/** `GET /admin/ai-usage/summary` response. */
export interface AiUsageSummaryResponse {
  rows: AiUsageSummaryRow[];
  /** `null` when NO row could be priced — distinct from a genuine $0.00. */
  totalEstimatedCostUsd: number | null;
  /** Which revision of the server's rate table produced these figures. */
  pricingRevision: string;
  from: string;
  to: string;
}

/** One row of `GET /admin/ai-usage`. */
export interface AiUsageRow {
  id: string;
  userId: string | null;
  feature: string;
  operation: string;
  provider: string;
  model: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  audioMs: number | null;
  inputChars: number | null;
  latencyMs: number;
  errorCode: string | null;
  estimatedCostUsd: number | null;
  createdAt: string;
}

/** `GET /admin/ai-usage` response — offset-paged, not cursor-paged. */
export interface AiUsageListResponse {
  rows: AiUsageRow[];
  total: number;
}

/** Filters shared by both endpoints. */
export interface AiUsageFilter {
  from?: string;
  to?: string;
  userId?: string;
  feature?: string;
}
