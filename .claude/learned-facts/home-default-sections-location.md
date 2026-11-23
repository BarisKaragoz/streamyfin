# Home Default Sections Location

**Date**: 2026-07-16
**Category**: home
**Key files**: `components/home/Home.tsx`, `components/home/Home.tv.tsx`

## Detail

Default home sections (Continue Watching, Suggested Movies, Suggested Shows, etc.) for mobile are defined in the `HomeMobile` component inside `components/home/Home.tsx`. The TV home is a separate implementation in `components/home/Home.tv.tsx` with its own section list. The old `components/home/HomeWithCarousel.tsx` mobile variant (and its `showLargeHomeCarousel` setting) was removed upstream in v0.54.x — the carousel concept is now TV-only (`TVHeroCarousel` in `Home.tv.tsx`). When adding/changing default home sections on mobile, only `Home.tsx` needs updating; keep the section `useMemo` deps in sync.

The Suggested Movies and Suggested Shows rows are the exception: both homes show them, from shared pieces. The fetchers are in `utils/jellyfin/suggestedRows.ts`, the query keys and the cold start refresh in `hooks/useSuggestedRowsRefresh.ts`, the freshness and page size in `constants/Home.ts`. A change to those rows belongs in `Home.tsx` and `Home.tv.tsx` alike, StreamyStats gating and placement included.
