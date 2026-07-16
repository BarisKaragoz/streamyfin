# StreamyStats Gates Default Jellyfin Recommendation Rows

**Date**: 2026-05-12
**Category**: home
**Key files**: `components/home/Home.tsx`, `utils/atoms/settings.ts`

## Detail

When `settings.streamyStatsMovieRecommendations` is enabled, the default "Suggested Movies" row is suppressed (StreamyStats' "Recommended Movies" takes its place). Same pattern for `streamyStatsSeriesRecommendations` and "Suggested Shows". Also, if `settings.home.sections` is configured, ALL default sections are replaced by the custom list — defaults won't appear at all.
