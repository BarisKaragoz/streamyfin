#!/usr/bin/env bash
# Signed Release build for a physical iPhone, installed via devicectl.
#
# Exists because `expo run:ios` invokes xcodebuild without
# -allowProvisioningUpdates, so CLI device builds fail with "No profiles for
# <bundle id> were found" after every prebuild. This script passes the flag,
# letting xcodebuild fetch/create the managed profile itself (uses the Apple ID
# you are signed into Xcode with).
#
# Usage: build-device.sh <scheme>          (Streamyfin | Creation)
#   DEVICE_UDID=<udid> to target a specific device; defaults to the first
#   connected iPhone reported by `xcrun devicectl list devices`.
set -euo pipefail

SCHEME="${1:?usage: build-device.sh <scheme> (e.g. Streamyfin or Creation)}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS_DIR="$ROOT/ios"
WORKSPACE="$IOS_DIR/$SCHEME.xcworkspace"
DERIVED="$IOS_DIR/build"

if [[ ! -d "$WORKSPACE" ]]; then
  echo "error: $WORKSPACE not found — run the matching prebuild first" >&2
  echo "  (bun run prebuild → Streamyfin, bun run prebuild:creation → Creation)" >&2
  exit 1
fi

echo "› Building $SCHEME (Release, device)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  build

APP="$DERIVED/Build/Products/Release-iphoneos/$SCHEME.app"
if [[ ! -d "$APP" ]]; then
  echo "error: built app not found at $APP" >&2
  exit 1
fi
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"

if [[ -z "${DEVICE_UDID:-}" ]]; then
  JSON="$(mktemp)"
  trap 'rm -f "$JSON"' EXIT
  xcrun devicectl list devices --json-output "$JSON" >/dev/null
  DEVICE_UDID="$(python3 - "$JSON" <<'PY'
import json, sys

devices = json.load(open(sys.argv[1]))["result"]["devices"]

def connected(d):
    return d.get("connectionProperties", {}).get("tunnelState") == "connected"

picked = next((d for d in devices if connected(d)), None)
if picked is None and devices:
    picked = devices[0]
if picked:
    print(picked["identifier"])
PY
)"
fi

if [[ -z "$DEVICE_UDID" ]]; then
  echo "error: no iPhone found — connect and unlock your device, or set DEVICE_UDID" >&2
  exit 1
fi

echo "› Installing $BUNDLE_ID on device $DEVICE_UDID"
xcrun devicectl device install app --device "$DEVICE_UDID" "$APP"

echo "› Launching"
xcrun devicectl device process launch --terminate-existing \
  --device "$DEVICE_UDID" "$BUNDLE_ID" ||
  echo "⚠ launch failed (device locked?) — app is installed, open it manually"

echo "✓ $SCHEME installed"
