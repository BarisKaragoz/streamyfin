# hideIfEmpty on InfiniteScrollingCollectionList

**Date**: 2026-05-12
**Category**: home
**Key files**: `components/home/InfiniteScrollingCollectionList.tsx`

## Detail

`components/home/InfiniteScrollingCollectionList.tsx` returns `null` when `hideIfEmpty === true && allItems.length === 0 && !isLoading`. If a home section unexpectedly doesn't render, first check whether its query returns an empty array — the section will be silently hidden, not show an empty state.
