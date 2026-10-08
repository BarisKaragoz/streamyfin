import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { Home } from "./Home";

let mockUser: { Id: string; Configuration: object } | null = null;
let mockSettingsRefresh: Promise<void> = Promise.resolve();
let mockLatestMedia: BaseItemDto[] = [];
let mockSuggestionCalls = 0;

const mockGetLatestMedia = jest.fn(async () => ({ data: mockLatestMedia }));
const mockGetSuggestions = jest.fn(async () => ({
  data: { Items: [{ Id: "pick", Name: `Pick ${++mockSuggestionCalls}` }] },
}));
const mockEmptyItems = jest.fn(async () => ({ data: { Items: [] } }));

jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getUserViewsApi: () => ({
    getUserViews: async () => ({
      data: { Items: [{ Id: "movies", Name: "Movies" }] },
    }),
  }),
  getUserLibraryApi: () => ({ getLatestMedia: mockGetLatestMedia }),
  getSuggestionsApi: () => ({ getSuggestions: mockGetSuggestions }),
  getItemsApi: () => ({
    getItems: mockEmptyItems,
    getResumeItems: mockEmptyItems,
  }),
  getTvShowsApi: () => ({ getNextUp: mockEmptyItems }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server", accessToken: "token" }),
    userAtom: atom(() => mockUser),
    pendingAccountSaveAtom: atom(false),
  };
});
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: {},
    refreshStreamyfinPluginSettings: () => mockSettingsRefresh,
  }),
}));
// Pull to refresh invalidates every ["home"] query, which is the part of the
// real hook this screen depends on.
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => {
    const { useQueryClient } = jest.requireActual("@tanstack/react-query");
    const client = useQueryClient();
    return () => client.invalidateQueries({ queryKey: ["home"] });
  },
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
jest.mock("expo-router", () => {
  const navigation = { setOptions: () => {} };
  return { useNavigation: () => navigation, useSegments: () => [] };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { libraryName?: string }) =>
      options?.libraryName ? `${key} ${options.libraryName}` : key,
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    downloadedItems: [],
    cleanCacheDirectory: async () => {},
  }),
}));
jest.mock("@/providers/IntroSheetProvider", () => ({
  useIntroSheet: () => ({ showIntro: () => {} }),
}));
// Not what is under test: a row shows up as its title and its item names.
jest.mock("@/components/cards/CardRow", () => ({
  CardRow: ({ title, items }: { title: string; items: BaseItemDto[] }) => {
    const { Text: RowText } = jest.requireActual("react-native");
    return (
      <RowText>{`${title}: ${items.map((item) => item.Name).join(", ")}`}</RowText>
    );
  },
}));
jest.mock("@/components/home/HomeHeroCarousel", () => ({
  HomeHeroCarousel: () => null,
}));
jest.mock("@/components/home/StreamystatsRecommendations", () => ({
  StreamystatsRecommendations: () => null,
}));
jest.mock("@/components/home/StreamystatsPromotedWatchlists", () => ({
  StreamystatsPromotedWatchlists: () => null,
}));
jest.mock("@/components/medialists/MediaListSection", () => ({
  MediaListSection: () => null,
}));
jest.mock("@/components/common/HeaderButton", () => ({
  HeaderButton: () => null,
}));
jest.mock("@/components/common/HeaderIcon", () => ({
  HeaderIcon: () => null,
}));
jest.mock("@/components/Button", () => ({ Button: () => null }));

const RECENTLY_ADDED = "home.recently_added_in Movies";
const SUGGESTED_MOVIES = "home.suggested_movies";

const movie = (name: string): BaseItemDto => ({ Id: name, Name: name });

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

// The suggested rows get one cold start refresh per user per JS session, so
// every test signs in as a user of its own.
let userCount = 0;

beforeEach(() => {
  mockUser = { Id: `user-${++userCount}`, Configuration: {} };
  mockSettingsRefresh = Promise.resolve();
  mockLatestMedia = [movie("Alien")];
  mockSuggestionCalls = 0;
  mockGetSuggestions.mockClear();
});

const renderHome = async () => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const view = await render(
    <JotaiProvider store={createStore()}>
      <QueryClientProvider client={client}>
        <Home />
      </QueryClientProvider>
    </JotaiProvider>,
  );
  await screen.findByText(`${RECENTLY_ADDED}: Alien`);
  return view;
};

/**
 * Pulls Home down. The plugin settings request is held open first, so the
 * screen renders the start of the pull before the rows are invalidated, as it
 * does on a real network.
 */
const pullToRefresh = async (view: Awaited<ReturnType<typeof render>>) => {
  const settingsRefresh = deferred();
  mockSettingsRefresh = settingsRefresh.promise;
  let pull: Promise<void> = Promise.resolve();
  await act(async () => {
    pull = view.root?.props.refreshControl.props.onRefresh();
  });
  await act(async () => {
    settingsRefresh.resolve();
    await pull;
  });
};

describe("Home pull to refresh", () => {
  // Regression: a pull switched the rows below Continue Watching and Next Up
  // off for the rest of the session before invalidating them, so Recently
  // Added never refreshed on a pull, nor on any refresh after one.
  test("shows what was added to the library since", async () => {
    const view = await renderHome();
    mockLatestMedia = [movie("Brazil"), movie("Alien")];

    await pullToRefresh(view);

    expect(
      await screen.findByText(`${RECENTLY_ADDED}: Brazil, Alien`),
    ).toBeTruthy();
  });

  test("keeps working after the first pull", async () => {
    const view = await renderHome();
    await pullToRefresh(view);

    mockLatestMedia = [movie("Casablanca"), movie("Alien")];
    await pullToRefresh(view);

    expect(
      await screen.findByText(`${RECENTLY_ADDED}: Casablanca, Alien`),
    ).toBeTruthy();
  });

  test("brings new suggested picks", async () => {
    const view = await renderHome();
    // The row's own first fetch and the cold start refresh; which of the two
    // lands last is not what is under test, so let both settle.
    await waitFor(() => expect(mockGetSuggestions).toHaveBeenCalledTimes(2));
    await act(async () => {});

    await pullToRefresh(view);

    expect(await screen.findByText(`${SUGGESTED_MOVIES}: Pick 3`)).toBeTruthy();
  });
});
