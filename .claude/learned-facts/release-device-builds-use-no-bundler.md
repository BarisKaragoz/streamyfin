# Release Device Builds: Use --no-bundler

**Date**: 2026-07-18
**Category**: build-ios
**Key files**: `package.json` (ios/ios:creation scripts)

## Detail

For standalone installs to a physical phone, use `bun run ios --configuration Release --device --no-bundler` (same for `ios:creation`). Release builds embed the JS bundle, so the Metro/log session `expo run:ios` starts afterwards is useless — and its device log streamer often swallows Ctrl+C, leaving the CLI hung ("Logs for your project will appear below" that won't exit). With `--no-bundler` the CLI builds, installs, launches, and returns to the prompt. If the hang happens anyway: repeat Ctrl+C, close the terminal, or `pkill -f "expo run:ios"` — harmless, the app is already installed.

Debug builds open the expo-dev-client launcher screen and need a dev server; Release boots straight into the app.
