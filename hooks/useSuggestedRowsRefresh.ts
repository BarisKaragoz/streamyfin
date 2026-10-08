import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

type FetchPage = (pageParam: number) => Promise<BaseItemDto[]>;

export const suggestedMoviesQueryKey = (userId?: string | null) => [
  "home",
  "suggestedMovies",
  userId,
];

export const suggestedShowsQueryKey = (userId?: string | null) => [
  "home",
  "suggestedShows",
  userId,
];

// Users whose suggested rows had their cold start refresh. Module level, so it
// empties on a JS reload (a cold start) and survives Home mounting again within
// the session. Per user, so an account switched to mid session gets one
// refresh of its own persisted picks too.
const refreshedThisSession = new Set<string>();

interface Options {
  userId?: string | null;
  /** Wait for the high priority rows, so the suggestions do not compete with them. */
  ready: boolean;
  /** Omitted when the row is not shown (StreamyStats or custom sections replace it). */
  fetchMovies?: FetchPage;
  fetchShows?: FetchPage;
}

/**
 * Refreshes the random "Suggested Movies" and "Suggested Shows" home rows once
 * per cold start, and again each time the returned function runs (pull to
 * refresh). Those are their only refreshes: SUGGESTED_ROWS_STALE_TIME keeps
 * React Query from refetching them, so coming back from a movie does not
 * reshuffle what the user was browsing.
 *
 * Both rows swap in the same render: the fetches run in parallel and neither
 * cache is written until both resolved, though the Suggestions endpoint is
 * slower than the Items one. When either fetch fails both rows keep their
 * picks and the returned promise rejects.
 */
export function useSuggestedRowsRefresh({
  userId,
  ready,
  fetchMovies,
  fetchShows,
}: Options): () => Promise<void> {
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [moviesPage, showsPage] = await Promise.all([
      fetchMovies?.(0),
      fetchShows?.(0),
    ]);
    // Written in the same tick, so React batches both rows into one render.
    if (moviesPage) {
      queryClient.setQueryData(suggestedMoviesQueryKey(userId), {
        pages: [moviesPage],
        pageParams: [0],
      });
    }
    if (showsPage) {
      queryClient.setQueryData(suggestedShowsQueryKey(userId), {
        pages: [showsPage],
        pageParams: [0],
      });
    }
  }, [queryClient, userId, fetchMovies, fetchShows]);

  useEffect(() => {
    if (!ready || !userId || refreshedThisSession.has(userId)) return;
    if (!fetchMovies && !fetchShows) return;

    refreshedThisSession.add(userId);
    refresh().catch(() => {
      // Let the next render that changes an input try again.
      refreshedThisSession.delete(userId);
    });
  }, [ready, userId, fetchMovies, fetchShows, refresh]);

  return refresh;
}
