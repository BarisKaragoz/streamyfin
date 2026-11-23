import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import {
  suggestedMoviesQueryKey,
  suggestedShowsQueryKey,
} from "@/hooks/useSuggestedRowsRefresh";
import { Home } from "./Home.tv";

let mockUser: { Id: string; Configuration: object } | null = null;
let mockSettings: Record<string, unknown> = {};
let mockMoviePicks = 0;
let mockShowPicks = 0;

const mockGetSuggestions = jest.fn(async () => ({
  data: { Items: [{ Id: "movie-pick", Name: `Movie ${++mockMoviePicks}` }] },
}));
const mockGetItems = jest.fn(async () => ({
  data: { Items: [{ Id: "show-pick", Name: `Show ${++mockShowPicks}` }] },
}));
const mockEmptyItems = jest.fn(async () => ({ data: { Items: [] } }));

jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getUserViewsApi: () => ({
    getUserViews: async () => ({
      data: {
        Items: [{ Id: "movies", Name: "Movies", CollectionType: "movies" }],
      },
    }),
  }),
  getUserLibraryApi: () => ({
    getLatestMedia: async () => ({ data: [{ Id: "alien", Name: "Alien" }] }),
  }),
  getSuggestionsApi: () => ({ getSuggestions: mockGetSuggestions }),
  getItemsApi: () => ({
    getItems: mockGetItems,
    getResumeItems: mockEmptyItems,
  }),
  getTvShowsApi: () => ({ getNextUp: mockEmptyItems }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server", accessToken: "token" }),
    userAtom: atom(() => mockUser),
    cacheVersionAtom: atom(0),
  };
});
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
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
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => async () => {},
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isConnected: true,
    serverConnected: true,
    loading: false,
    retryCheck: () => {},
  }),
}));
jest.mock("@/hooks/useRefreshLibraryOnFocus", () => ({
  useRefreshLibraryOnFocus: () => {},
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: () => {} }),
}));
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: () => {} }),
}));
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { libraryName?: string }) =>
      options?.libraryName ? `${key} ${options.libraryName}` : key,
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/utils/tvDiscovery/sync", () => ({ updateTVDiscovery: () => {} }));
jest.mock("@/components/common/ServerImage", () => ({
  Image: () => null,
  prefetchServerImage: async () => {},
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => ({}),
}));
jest.mock("@/components/home/TVHeroCarousel", () => ({
  TVHeroCarousel: () => null,
}));
// Not what is under test: the StreamyStats rows show up as their titles.
jest.mock("@/components/home/StreamystatsRecommendations.tv", () => ({
  StreamystatsRecommendations: ({ title }: { title: string }) => {
    const { Text: RowText } = jest.requireActual("react-native");
    return <RowText>{title}</RowText>;
  },
}));
jest.mock("@/components/home/StreamystatsPromotedWatchlists.tv", () => ({
  StreamystatsPromotedWatchlists: () => {
    const { Text: RowText } = jest.requireActual("react-native");
    return <RowText>promoted_watchlists</RowText>;
  },
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
jest.mock("@/components/Button", () => ({ Button: () => null }));

const RECENTLY_ADDED = "home.recently_added_in Movies";
const SUGGESTED_MOVIES = "home.suggested_movies";
const SUGGESTED_SHOWS = "home.suggested_shows";
const RECOMMENDED_SERIES =
  "home.settings.plugins.streamystats.recommended_series";
const PROMOTED_WATCHLISTS = "promoted_watchlists";

// The suggested rows get one cold start refresh per user per JS session, so
// every test signs in as a user of its own.
let userCount = 0;

const resetMocks = () => {
  mockUser = { Id: `user-${++userCount}`, Configuration: {} };
  mockSettings = {};
  mockMoviePicks = 0;
  mockShowPicks = 0;
  mockGetSuggestions.mockClear();
  mockGetItems.mockClear();
};

beforeEach(resetMocks);

const newClient = () =>
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

const renderHome = async ({
  client = newClient(),
  timeout,
}: {
  client?: QueryClient;
  timeout?: number;
} = {}) => {
  const view = await render(
    <JotaiProvider store={createStore()}>
      <QueryClientProvider client={client}>
        <Home />
      </QueryClientProvider>
    </JotaiProvider>,
  );
  await screen.findByText("Alien", {}, { timeout });
  return view;
};

/** The section titles on screen, top to bottom. */
const rowTitles = () =>
  screen
    .getAllByText(/^(home\.|promoted_watchlists$)/)
    .map((node) => node.props.children);

// React Native requires each component the first time something renders it,
// and on a cold Jest cache Babel compiles it right then: see Home.test.tsx.
// One render here pays for it before any test starts its clock.
beforeAll(async () => {
  resetMocks();
  const view = await renderHome({ timeout: 15_000 });
  await view.unmount();
}, 30_000);

describe("TV Home suggested rows", () => {
  test("shows Suggested Movies and Suggested Shows below Recently Added", async () => {
    await renderHome();

    await screen.findByText(/^Show \d$/);
    await screen.findByText(/^Movie \d$/);
    expect(rowTitles()).toEqual([
      RECENTLY_ADDED,
      SUGGESTED_MOVIES,
      SUGGESTED_SHOWS,
    ]);
  });

  test("leaves Suggested Shows to StreamyStats when it recommends series", async () => {
    mockSettings = { streamyStatsSeriesRecommendations: true };
    await renderHome();

    await screen.findByText(/^Movie \d$/);
    expect(rowTitles()).toEqual([
      RECENTLY_ADDED,
      RECOMMENDED_SERIES,
      SUGGESTED_MOVIES,
    ]);
    expect(mockGetItems).not.toHaveBeenCalled();
  });

  // Placing the StreamyStats rows used to count Suggested Movies only, which
  // would have wedged them between the two suggested rows.
  test("puts the StreamyStats rows above both suggested rows", async () => {
    mockSettings = { streamyStatsPromotedWatchlists: true };
    await renderHome();

    await screen.findByText(/^Show \d$/);
    expect(rowTitles()).toEqual([
      RECENTLY_ADDED,
      PROMOTED_WATCHLISTS,
      SUGGESTED_MOVIES,
      SUGGESTED_SHOWS,
    ]);
  });

  // The rows never refetch by themselves, so without this a TV would show the
  // picks persisted from its previous session forever.
  test("replaces the previous session's picks on a cold start", async () => {
    const client = newClient();
    const userId = mockUser?.Id;
    client.setQueryData(suggestedMoviesQueryKey(userId), {
      pages: [[{ Id: "old-movie", Name: "Old movie" }]],
      pageParams: [0],
    });
    client.setQueryData(suggestedShowsQueryKey(userId), {
      pages: [[{ Id: "old-show", Name: "Old show" }]],
      pageParams: [0],
    });

    await renderHome({ client });

    expect(await screen.findByText("Movie 1")).toBeTruthy();
    expect(await screen.findByText("Show 1")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Old show")).toBeNull());
    expect(screen.queryByText("Old movie")).toBeNull();
  });
});
