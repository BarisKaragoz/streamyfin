# Xcode Builds Must Use the Workspace, Not the Project

**Date**: 2026-07-18
**Category**: build-ios
**Key files**: `ios/Streamyfin.xcworkspace`, `ios/Streamyfin.xcodeproj`

## Detail

Building `ios/Streamyfin.xcodeproj` in Xcode compiles the app target but never builds the CocoaPods targets, producing confusing errors like `module map file '.../Expo/Expo.modulemap' not found` and `ExpoModulesCore.modulemap not found` during `SwiftGeneratePch`. Always open `ios/Streamyfin.xcworkspace`.

Diagnosis trick: check DerivedData's `Info.plist` (`~/Library/Developer/Xcode/DerivedData/Streamyfin-*/Info.plist`) — its `WorkspacePath` reveals whether the project or the workspace was opened. If Build/Products contains only `Streamyfin.app` and no pod outputs, the project (not workspace) was built.
