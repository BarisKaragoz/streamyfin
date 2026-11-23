import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSuggestionsApi } from "@jellyfin/sdk/lib/utils/api";
import { SUGGESTED_ROWS_PAGE_SIZE } from "@/constants/Home";

/**
 * One page of the "Suggested Movies" home row, shared by the mobile and TV
 * homes so both show the same picks.
 */
export const fetchSuggestedMoviesPage = async (
  api: Api,
  userId: string,
  startIndex: number,
): Promise<BaseItemDto[]> =>
  (
    await getSuggestionsApi(api).getSuggestions({
      userId,
      startIndex,
      limit: SUGGESTED_ROWS_PAGE_SIZE,
      mediaType: ["Video"],
      type: ["Movie"],
    })
  ).data.Items || [];

/**
 * One page of the "Suggested Shows" home row. Not the Suggestions endpoint:
 * it returns nothing for Series on typical servers, so this asks for favorite
 * or liked series first, the rest at random, the way Jellyfin Web does.
 */
export const fetchSuggestedShowsPage = async (
  api: Api,
  userId: string,
  startIndex: number,
): Promise<BaseItemDto[]> =>
  (
    await getItemsApi(api).getItems({
      userId,
      startIndex,
      limit: SUGGESTED_ROWS_PAGE_SIZE,
      recursive: true,
      includeItemTypes: ["Series"],
      sortBy: ["IsFavoriteOrLiked", "Random"],
      imageTypeLimit: 1,
      enableImageTypes: ["Primary", "Backdrop", "Thumb"],
    })
  ).data.Items || [];
