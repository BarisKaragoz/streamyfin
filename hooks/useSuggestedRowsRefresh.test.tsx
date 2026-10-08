import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  suggestedMoviesQueryKey,
  suggestedShowsQueryKey,
  useSuggestedRowsRefresh,
} from "./useSuggestedRowsRefresh";

// The hook remembers per user which rows had their cold start refresh, for the
// whole JS session. Every test signs in as a user of its own so none of them
// starts out already refreshed.
let userCount = 0;
const nextUser = () => `user-${++userCount}`;

const movie = (name: string): BaseItemDto => ({ Id: name, Name: name });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const newClient = () =>
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

const picks = (client: QueryClient, queryKey: unknown[]) =>
  client
    .getQueryData<{ pages: BaseItemDto[][] }>(queryKey)
    ?.pages.flat()
    .map((item) => item.Name);

/** A client holding yesterday's persisted picks for both rows. */
const persistedClient = (userId: string) => {
  const client = newClient();
  client.setQueryData(suggestedMoviesQueryKey(userId), {
    pages: [[movie("Alien")]],
    pageParams: [0],
  });
  client.setQueryData(suggestedShowsQueryKey(userId), {
    pages: [[movie("Lost")]],
    pageParams: [0],
  });
  return client;
};

type Props = Parameters<typeof useSuggestedRowsRefresh>[0];

const renderRefresh = (client: QueryClient, props: Props) =>
  renderHook((p: Props) => useSuggestedRowsRefresh(p), {
    initialProps: props,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

describe("useSuggestedRowsRefresh", () => {
  test("refreshes both rows on a cold start once Home is ready", async () => {
    const userId = nextUser();
    const client = persistedClient(userId);
    const fetchMovies = jest.fn(async () => [movie("Brazil")]);
    const fetchShows = jest.fn(async () => [movie("Fargo")]);
    const props = { userId, ready: false, fetchMovies, fetchShows };
    const view = await renderRefresh(client, props);
    expect(fetchMovies).not.toHaveBeenCalled();

    await view.rerender({ ...props, ready: true });

    await waitFor(() =>
      expect(picks(client, suggestedMoviesQueryKey(userId))).toEqual([
        "Brazil",
      ]),
    );
    expect(picks(client, suggestedShowsQueryKey(userId))).toEqual(["Fargo"]);
  });

  test("does not refresh again when Home mounts again in the same session", async () => {
    const userId = nextUser();
    const client = persistedClient(userId);
    const fetchMovies = jest.fn(async () => [movie("Brazil")]);
    const props = { userId, ready: true, fetchMovies };
    const first = await renderRefresh(client, props);
    await waitFor(() => expect(fetchMovies).toHaveBeenCalledTimes(1));
    await first.unmount();

    await renderRefresh(client, props);

    expect(fetchMovies).toHaveBeenCalledTimes(1);
  });

  test("refreshes both rows again on pull to refresh", async () => {
    const userId = nextUser();
    const client = persistedClient(userId);
    const fetchMovies = jest
      .fn()
      .mockResolvedValueOnce([movie("Brazil")])
      .mockResolvedValueOnce([movie("Casablanca")]);
    const fetchShows = jest
      .fn()
      .mockResolvedValueOnce([movie("Fargo")])
      .mockResolvedValueOnce([movie("Dark")]);
    const { result } = await renderRefresh(client, {
      userId,
      ready: true,
      fetchMovies,
      fetchShows,
    });
    await waitFor(() => expect(fetchShows).toHaveBeenCalledTimes(1));

    await act(() => result.current());

    expect(picks(client, suggestedMoviesQueryKey(userId))).toEqual([
      "Casablanca",
    ]);
    expect(picks(client, suggestedShowsQueryKey(userId))).toEqual(["Dark"]);
  });

  test("swaps the rows together, not as each fetch lands", async () => {
    const userId = nextUser();
    const client = persistedClient(userId);
    const shows = deferred<BaseItemDto[]>();
    const fetchMovies = jest.fn(async () => [movie("Brazil")]);
    const fetchShows = jest.fn(() => shows.promise);
    await renderRefresh(client, {
      userId,
      ready: true,
      fetchMovies,
      fetchShows,
    });
    await waitFor(() => expect(fetchShows).toHaveBeenCalled());

    // Movies came back first; its row must wait for the shows row.
    expect(picks(client, suggestedMoviesQueryKey(userId))).toEqual(["Alien"]);

    await act(async () => shows.resolve([movie("Fargo")]));

    expect(picks(client, suggestedMoviesQueryKey(userId))).toEqual(["Brazil"]);
    expect(picks(client, suggestedShowsQueryKey(userId))).toEqual(["Fargo"]);
  });

  test("keeps both rows' picks when a pull to refresh fails", async () => {
    const userId = nextUser();
    const client = persistedClient(userId);
    const fetchMovies = jest.fn(async () => [movie("Brazil")]);
    const fetchShows = jest.fn(async () => [movie("Fargo")]);
    const { result } = await renderRefresh(client, {
      userId,
      ready: true,
      fetchMovies,
      fetchShows,
    });
    await waitFor(() =>
      expect(picks(client, suggestedShowsQueryKey(userId))).toEqual(["Fargo"]),
    );
    fetchMovies.mockResolvedValueOnce([movie("Casablanca")]);
    fetchShows.mockRejectedValueOnce(new Error("server down"));

    await expect(act(() => result.current())).rejects.toThrow("server down");

    expect(picks(client, suggestedMoviesQueryKey(userId))).toEqual(["Brazil"]);
    expect(picks(client, suggestedShowsQueryKey(userId))).toEqual(["Fargo"]);
  });

  test("leaves a row StreamyStats replaces alone", async () => {
    const userId = nextUser();
    const client = persistedClient(userId);
    const fetchMovies = jest.fn(async () => [movie("Brazil")]);
    const { result } = await renderRefresh(client, {
      userId,
      ready: true,
      fetchMovies,
    });
    await waitFor(() => expect(fetchMovies).toHaveBeenCalledTimes(1));

    await act(() => result.current());

    expect(picks(client, suggestedShowsQueryKey(userId))).toEqual(["Lost"]);
  });
});
