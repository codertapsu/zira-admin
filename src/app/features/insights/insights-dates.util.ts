/**
 * Shared date-range helpers for the insights range-based endpoints
 * (`[fromDate, toDate)`, half-open). `MAX_RANGE_DAYS` mirrors
 * `MAX_WINDOW_DAYS` in the server's `product-insights.service.ts` — every
 * range endpoint 400s past 180 days, so we pre-validate client-side to
 * avoid a wasted round trip.
 */

export const MAX_RANGE_DAYS = 180;

export function fmtDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `toDate` defaults to tomorrow so "today" is included in the half-open window. */
export function defaultTo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fmtDate(d);
}

export function defaultFrom(daysBack = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return fmtDate(d);
}

export function rangePreset(daysBack: number): { fromDate: string; toDate: string } {
  return { fromDate: defaultFrom(daysBack), toDate: defaultTo() };
}

/** Whole-day span, mirroring the server's `Math.ceil` span math. */
export function rangeSpanDays(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/** Shared From/To validation used by every range-based insights tab. */
export function validateRange(fromDate: string, toDate: string): string | null {
  if (!fromDate || !toDate) {
    return 'Choose both a From and a To date.';
  }
  if (fromDate >= toDate) {
    return 'From date must be before To date.';
  }
  if (rangeSpanDays(fromDate, toDate) > MAX_RANGE_DAYS) {
    return `Range exceeds ${MAX_RANGE_DAYS} days — narrow the dates.`;
  }
  return null;
}
