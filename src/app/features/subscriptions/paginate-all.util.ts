import { EMPTY, expand, reduce, type Observable } from 'rxjs';

import type { CursorPage } from '../../core/api/models';

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
): Observable<T[]> {
  let pagesFetched = 0;

  return fetchPage(undefined).pipe(
    expand((page) => {
      pagesFetched += 1;
      if (!page.hasMore || page.nextCursor === null || pagesFetched >= maxPages) {
        return EMPTY;
      }
      return fetchPage(page.nextCursor);
    }),
    reduce<CursorPage<T>, T[]>((acc, page) => [...acc, ...page.items], []),
  );
}
