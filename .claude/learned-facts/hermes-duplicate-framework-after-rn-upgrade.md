# Duplicate Hermes Framework After React Native Upgrade

**Date**: 2026-07-18
**Category**: build-ios
**Key files**: `ios/` (generated), DerivedData Build/Products

## Detail

React Native 0.82+ ships Hermes as `hermesvm.framework` (inside the ReactNativeDependencies prebuilt); older versions embedded it as `hermes.framework`. After upgrading across that boundary (e.g. the SDK 54 → 56 merge), an incremental Xcode build copies the new `hermesvm.framework` into the `.app` but leaves the stale `hermes.framework` from the previous build in place. The simulator then refuses to install with `MIInstallerErrorDomain Code=57 DuplicateIdentifier` — both frameworks claim `dev.hermesengine.iphonesimulator`.

Fix: Product → Clean Build Folder (or `rm -rf ~/Library/Developer/Xcode/DerivedData/Streamyfin-*`), optionally `xcrun simctl uninstall booted <bundle-id>`, then rebuild. Not a config problem — purely stale build products.
