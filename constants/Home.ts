/**
 * Freshness of the random "Suggested Movies" and "Suggested Shows" home rows.
 *
 * "static" stops React Query from ever refetching them by itself: not on the
 * ["home"] invalidation that runs when Home regains focus, when playback ends
 * or when the server reports a library change, not on reconnect and not when
 * the row mounts again. Coming back from a movie used to reshuffle the picks
 * the user was browsing. They now change on a cold start and on pull to
 * refresh, when useSuggestedRowsRefresh replaces them through setQueryData,
 * which a static query still accepts. On TV, which has no pull to refresh,
 * only on a cold start.
 *
 * Polling ignores staleTime, "static" included, so the TV rows, which poll
 * every minute, turn polling off for a static row.
 */
export const SUGGESTED_ROWS_STALE_TIME = "static" as const;

/**
 * How many items a suggested row asks for at a time. The row's pageSize has to
 * match the request's limit: a page shorter than pageSize reads as the end of
 * the list and stops the infinite scroll.
 */
export const SUGGESTED_ROWS_PAGE_SIZE = 10;
