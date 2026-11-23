import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react-native";
import { SUGGESTED_ROWS_STALE_TIME } from "@/constants/Home";
import { InfiniteScrollingCollectionList } from "./InfiniteScrollingCollectionList.tv";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
  TVTypographyScale: {
    Small: "small",
    Default: "default",
    Large: "large",
    ExtraLarge: "extraLarge",
  },
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: () => {} }),
}));
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: () => {} }),
}));
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => ({}),
}));
jest.mock("@/components/tv/TVFocusablePoster", () => ({
  TVFocusablePoster: () => null,
}));
// The cards are not what is under test; a card shows up as its item's name.
jest.mock("@/components/tv/TVPosterCard", () => ({
  TVPosterCard: ({ item }: { item: BaseItemDto }) => {
    const { Text: CardText } = jest.requireActual("react-native");
    return <CardText>{item.Name}</CardText>;
  },
}));

const ONE_MINUTE = 60 * 1000;

const newClient = () =>
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

/** Every fetch returns a pick of its own: "Pick 1", then "Pick 2". */
const newPicks = () => {
  let calls = 0;
  return jest.fn(async () => {
    calls += 1;
    return [{ Id: `pick-${calls}`, Name: `Pick ${calls}` }];
  });
};

const renderRow = (
  queryFn: ReturnType<typeof newPicks>,
  staleTime?: typeof SUGGESTED_ROWS_STALE_TIME,
) =>
  render(
    <QueryClientProvider client={newClient()}>
      <InfiniteScrollingCollectionList
        title='Suggested Movies'
        queryKey={["home", "suggestedMovies", "user-1"]}
        queryFn={queryFn}
        staleTime={staleTime}
      />
    </QueryClientProvider>,
  );

// React Native requires FlatList the first time something renders it, and on a
// cold Jest cache Babel compiles it right then: see Home.test.tsx. One render
// here pays for it before any test starts its clock.
beforeAll(async () => {
  const view = await renderRow(newPicks());
  await screen.findByText("Pick 1", {}, { timeout: 15_000 });
  await view.unmount();
}, 30_000);

beforeEach(() => {
  jest.useFakeTimers();
});

/**
 * Moves the clock on and lets whatever it set off land on screen: the async
 * variant runs the promises each timer starts before the next one fires.
 */
const advance = async (ms: number) => {
  await act(() => jest.advanceTimersByTimeAsync(ms));
  // React Query hands its results to React on a zero delay timer.
  await act(() => jest.advanceTimersByTimeAsync(1));
};

afterEach(() => {
  jest.useRealTimers();
});

describe("TV InfiniteScrollingCollectionList", () => {
  // Regression: TV rows poll every minute, and polling refetches a query
  // whatever its staleTime, so Suggested Movies reshuffled under the user
  // every minute while they browsed it.
  test("keeps a static row's picks while it stays on screen", async () => {
    await renderRow(newPicks(), SUGGESTED_ROWS_STALE_TIME);
    await screen.findByText("Pick 1");

    await advance(10 * ONE_MINUTE);

    expect(screen.getByText("Pick 1")).toBeTruthy();
    expect(screen.queryByText("Pick 2")).toBeNull();
  });

  test("still refreshes every other row each minute", async () => {
    await renderRow(newPicks());
    await screen.findByText("Pick 1");

    await advance(ONE_MINUTE);

    // Read right away, no waiting: what proves the static row above would
    // have shown a refetch had there been one.
    expect(screen.getByText("Pick 2")).toBeTruthy();
  });
});
