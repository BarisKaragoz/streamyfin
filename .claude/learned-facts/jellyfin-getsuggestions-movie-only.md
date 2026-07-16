# Jellyfin getSuggestions Is Movie-Only in Practice

**Date**: 2026-05-12
**Category**: api
**Key files**: `components/home/Home.tsx`

## Detail

`getSuggestionsApi.getSuggestions` with `type: ["Series"]` returns an empty array against typical Jellyfin servers — the suggestion engine is geared toward Movies. Combined with `hideIfEmpty` on `InfiniteScrollingCollectionList`, this silently hides the row. For show suggestions use `getItemsApi.getItems` with `recursive: true`, `includeItemTypes: ["Series"]`, and `sortBy: ["IsFavoriteOrLiked", "Random"]` (the pattern Jellyfin Web uses).
