# Moved ios/ Folder Carries Stale Machine-Local State

**Date**: 2026-07-19
**Category**: build-ios
**Key files**: `ios/.xcode.env.local`, `ios/.xcode.env`, `ios/build/`, `ios/*.xcworkspace/xcuserdata/`

## Detail

Copying the generated `ios/` folder from another machine (instead of regenerating via `bun run prebuild`) drags along machine-local state that breaks Xcode builds on the new machine:

1. **`ios/.xcode.env.local`** (git-ignored) overrides the versioned `ios/.xcode.env` and hardcodes an absolute `NODE_BINARY` path — e.g. `/Users/<old-username>/.nvm/versions/node/vX/bin/node`. On the new machine this produces `Could not find "node" executable while running an Xcode build script`. Fix: rewrite the path for the new machine, or delete the `.local` file so the versioned `$(command -v node)` fallback applies. (Confirmed fix 2026-07-19 after moving from `/Users/bariskaragoz` to `/Users/baris`.)
2. **`ios/build/`** and **`xcuserdata/`** inside the `.xcworkspace`/`.xcodeproj` also come along — stale schemes/user state can carry the old machine's build configuration (e.g. Release selected for simulator runs). Safe to delete; Xcode regenerates them.
3. DerivedData on the new machine is separate and not the culprit, but the moved folder still needs a clean first build.

Preferred approach: don't move `ios/` between machines at all — it's fully generated; run the matching prebuild on the new machine instead.
