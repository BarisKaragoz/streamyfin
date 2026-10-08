import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { SUGGESTED_ROWS_STALE_TIME } from "@/constants/Home";
import { InfiniteScrollingCollectionList } from "./InfiniteScrollingCollectionList";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
// The cards are not what is under test; a row shows up as its item names.
jest.mock("@/components/cards/CardRow", () => ({
  CardRow: ({ items }: { items: BaseItemDto[] }) => {
    const { Text: RowText } = jest.requireActual("react-native");
    return <RowText>{items.map((item) => item.Name).join(", ")}</RowText>;
  },
}));

const QUERY_KEY = ["home", "suggestedMovies", "user-1"];
// Older than the one minute every other home row stays fresh for.
const TEN_MINUTES_AGO = () => Date.now() - 10 * 60 * 1000;

const movie = (name: string): BaseItemDto => ({ Id: name, Name: name });

const newClient = () =>
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

const seed = (client: QueryClient, items: BaseItemDto[]) =>
  client.setQueryData(
    QUERY_KEY,
    { pages: [items], pageParams: [0] },
    { updatedAt: TEN_MINUTES_AGO() },
  );

const renderRow = (
  client: QueryClient,
  queryFn: jest.Mock,
  staleTime?: typeof SUGGESTED_ROWS_STALE_TIME,
) =>
  render(
    <QueryClientProvider client={client}>
      <InfiniteScrollingCollectionList
        title='Suggested Movies'
        queryKey={QUERY_KEY}
        queryFn={queryFn}
        staleTime={staleTime}
      />
    </QueryClientProvider>,
  );

describe("InfiniteScrollingCollectionList with the suggested rows' freshness", () => {
  // Regression: opening a movie and going back to Home reshuffled Suggested
  // Movies and Suggested Shows, because the focus refresh invalidates every
  // ["home"] query and the rows sat under that prefix.
  test("keeps the picks when Home regains focus", async () => {
    const client = newClient();
    seed(client, [movie("Alien")]);
    const queryFn = jest.fn(async () => [movie("Brazil")]);
    await renderRow(client, queryFn, SUGGESTED_ROWS_STALE_TIME);

    await act(() => client.invalidateQueries({ queryKey: ["home"] }));

    expect(queryFn).not.toHaveBeenCalled();
    expect(screen.getByText("Alien")).toBeTruthy();
  });

  test("keeps the picks when the server becomes reachable again", async () => {
    const client = newClient();
    seed(client, [movie("Alien")]);
    const queryFn = jest.fn(async () => [movie("Brazil")]);
    await renderRow(client, queryFn, SUGGESTED_ROWS_STALE_TIME);

    // What NetworkStatusProvider runs once the server answers again.
    await act(() => client.refetchQueries({ type: "active" }));

    expect(queryFn).not.toHaveBeenCalled();
    expect(screen.getByText("Alien")).toBeTruthy();
  });

  test("keeps the picks when the row mounts again", async () => {
    const client = newClient();
    seed(client, [movie("Alien")]);
    const queryFn = jest.fn(async () => [movie("Brazil")]);
    const view = await renderRow(client, queryFn, SUGGESTED_ROWS_STALE_TIME);
    // Invalidated while off screen, as a focus refresh behind the player does.
    await view.unmount();
    await act(() => client.invalidateQueries({ queryKey: ["home"] }));

    await renderRow(client, queryFn, SUGGESTED_ROWS_STALE_TIME);

    expect(queryFn).not.toHaveBeenCalled();
    expect(screen.getByText("Alien")).toBeTruthy();
  });

  test("shows the picks the cold start refresh writes", async () => {
    const client = newClient();
    seed(client, [movie("Alien")]);
    const queryFn = jest.fn(async () => [movie("Brazil")]);
    await renderRow(client, queryFn, SUGGESTED_ROWS_STALE_TIME);

    await act(async () => {
      client.setQueryData(QUERY_KEY, {
        pages: [[movie("Casablanca")]],
        pageParams: [0],
      });
    });

    expect(await screen.findByText("Casablanca")).toBeTruthy();
    expect(queryFn).not.toHaveBeenCalled();
  });

  test("fetches the first picks when nothing is cached", async () => {
    const queryFn = jest.fn(async () => [movie("Brazil")]);
    await renderRow(newClient(), queryFn, SUGGESTED_ROWS_STALE_TIME);

    await waitFor(() => expect(screen.getByText("Brazil")).toBeTruthy());
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  // The other home rows (Continue Watching, Recently Added) must keep
  // following the focus refresh.
  test("a row with the default freshness still refetches on focus", async () => {
    const client = newClient();
    seed(client, [movie("Alien")]);
    const queryFn = jest.fn(async () => [movie("Brazil")]);
    await renderRow(client, queryFn);
    await waitFor(() => expect(screen.getByText("Brazil")).toBeTruthy());
    queryFn.mockClear();

    await act(() => client.invalidateQueries({ queryKey: ["home"] }));

    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
