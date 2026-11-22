#!/usr/bin/env bash
# Signed Release build for a physical iPhone, installed via devicectl.
#
# Exists because `expo run:ios` invokes xcodebuild without
# -allowProvisioningUpdates, so CLI device builds fail with "No profiles for
# <bundle id> were found" after every prebuild. This script passes the flag,
# letting xcodebuild fetch/create the managed profile itself (uses the Apple ID
# you are signed into Xcode with).
#
# Usage: build-device.sh <scheme>          (Streamyfin | Creation | Sports)
#   DEVICE_UDID=<udid> to target a specific device; defaults to the first
#   connected iPhone reported by `xcrun devicectl list devices`.
set -euo pipefail

SCHEME="${1:?usage: build-device.sh <scheme> (Streamyfin, Creation or Sports)}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS_DIR="$ROOT/ios"
WORKSPACE="$IOS_DIR/$SCHEME.xcworkspace"
DERIVED="$IOS_DIR/build"

case "$SCHEME" in
  Creation) PREBUILD="bun run prebuild:creation" ;;
  Sports) PREBUILD="bun run prebuild:sports" ;;
  *) PREBUILD="bun run prebuild" ;;
esac

if [[ ! -d "$WORKSPACE" ]]; then
  echo "error: $WORKSPACE not found, run the matching prebuild first:" >&2
  echo "  $PREBUILD" >&2
  exit 1
fi

# prebuild:tv writes an Apple TV project into the same ios/ folder, under the
# same name. xcodebuild then rejects the iPhone destination with a list of every
# simulator on the Mac, without saying that the project is the problem.
if grep -q 'SDKROOT = appletvos;' "$IOS_DIR/$SCHEME.xcodeproj/project.pbxproj" 2>/dev/null; then
  echo "error: ios/ holds the Apple TV project the last bun run prebuild:tv made" >&2
  echo "  regenerate it for iPhone first:" >&2
  echo "  $PREBUILD" >&2
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

def tunnel(d):
    return d.get("connectionProperties", {}).get("tunnelState")

def iphone(d):
    hardware = d.get("hardwareProperties", {})
    return hardware.get("reality") == "physical" and hardware.get("platform") == "iOS"

# devicectl lists the simulators on this Mac too, and those cannot install a
# device build. An iPhone it can reach shows "disconnected" until something
# opens its tunnel, the install included; one out of reach shows "unavailable".
# No apostrophes in here: bash 3.2 matches quotes inside a heredoc within $().
reachable = [d for d in devices if iphone(d) and tunnel(d) != "unavailable"]
picked = next((d for d in reachable if tunnel(d) == "connected"), None)
if picked is None and reachable:
    picked = reachable[0]
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
