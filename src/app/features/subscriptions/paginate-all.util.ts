import { defer, EMPTY, expand, reduce, type Observable } from 'rxjs';

import type { CursorPage } from '../../core/api/models';

/**
 * The drained rows, plus whether the page cap cut the drain short. `truncated`
 * exists so a caller can distinguish "this is all of it" from "this is the
 * first N", which a bare array cannot express.
 */
export interface FetchAllPagesResult<T> {
  items: T[];
  truncated: boolean;
}

/**
 * Fully drains a cursor-paginated list endpoint by repeatedly following
 * `nextCursor` until `hasMore` is false or `maxPages` is reached. The page
 * cap is a safety net so a client-side aggregate (per-plan tiles, revenue
 * charts, promo-code stats) can't turn into an unbounded fetch loop against
 * a very large table — callers should treat the result as "the most recent
 * `maxPages * pageSize` rows", not literally everything.
 */
export function fetchAllPages<T>(
  fetchPage: (cursor: string | undefined) => Observable<CursorPage<T>>,
  maxPages = 20,
): Observable<FetchAllPagesResult<T>> {
  // `defer` so the counter is created per SUBSCRIPTION, not per call. It used
  // to live in the enclosing closure, which made the returned observable
  // single-use: a `retry()`, a second subscriber, or the same observable reused
  // in two places would resume from the previous count and stop after one page.
  // Every caller happens to construct it fresh today, so nothing was broken —
  // but the shape advertises reusability it did not have.
  return defer(() => {
    let pagesFetched = 0;

    return fetchPage(undefined).pipe(
      expand((page) => {
        pagesFetched += 1;
        if (!page.hasMore || page.nextCursor === null || pagesFetched >= maxPages) {
          return EMPTY;
        }

        return fetchPage(page.nextCursor);
      }),
      reduce<CursorPage<T>, FetchAllPagesResult<T>>(
        (acc, page) => ({
          items: [...acc.items, ...page.items],
          // True when the cap stopped us rather than the data running out, so a
          // caller can say "1000+" instead of presenting a truncated count as a
          // fact. The pending-requests badge did exactly that: it read 1000 and
          // stopped moving, and an operator working the queue had no way to
          // tell that from genuinely making no progress.
          truncated: page.hasMore && page.nextCursor !== null,
        }),
        { items: [], truncated: false },
      ),
    );
  });
}
