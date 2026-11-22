#!/usr/bin/env bash
# Standalone Android TV build: a Release APK with the JS bundle embedded,
# installed and launched on the device adb is connected to.
#
# Exists because `bun run android:tv` makes a debug build that loads its JS from
# Metro on this Mac, so the app stops working whenever the Mac sleeps or Metro
# is not running. This builds the Release variant instead, for the connected
# TV's ABI only, which is much faster than building all of them.
#
# Usage: build-tv-device.sh [--prebuild] [--abi <abis>] [--no-install]
#   --prebuild    regenerate android/ even when it already is a TV project
#   --abi <abis>  comma separated ABIs to build (e.g. armeabi-v7a); defaults to
#                 the TV's own ABI, or arm64-v8a,armeabi-v7a when building
#                 with --no-install and no device attached
#   --no-install  only build the APK
#   ANDROID_SERIAL=<serial> picks the device when several are attached; adb
#   reads it natively.
set -euo pipefail

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ANDROID_DIR="$ROOT/android"
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
# Matches the CI TV artifact: many cheap TV boxes and sticks are still 32-bit.
FALLBACK_ABIS="arm64-v8a,armeabi-v7a"

PREBUILD=0
INSTALL=1
ABIS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prebuild) PREBUILD=1 ;;
    --no-install) INSTALL=0 ;;
    --abi)
      ABIS="${2:?--abi needs a value, e.g. armeabi-v7a}"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option $1 (see --help)" >&2
      exit 1
      ;;
  esac
  shift
done

# Metro resolves .tv.* files only under EXPO_TV=1, and the Release build bundles
# the JS, so the variable has to reach Gradle and not only prebuild.
export EXPO_TV=1
# Same environment as build:android:local, which CI uses for its APKs.
export NODE_ENV=production

if ! command -v adb >/dev/null 2>&1 && [[ -x "${ANDROID_HOME:-}/platform-tools/adb" ]]; then
  PATH="$ANDROID_HOME/platform-tools:$PATH"
fi

# A device is only needed to install, or to learn which ABI to build.
HAVE_DEVICE=0
if [[ "$INSTALL" == 1 || -z "$ABIS" ]] && command -v adb >/dev/null 2>&1; then
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    [[ "$(adb get-state 2>/dev/null)" == device ]] && HAVE_DEVICE=1
  else
    # adb separates the name from the state with a tab, and a name can hold
    # spaces: wireless debugging names a second registration "<name> (2)...".
    SERIALS=()
    while IFS=$'\t' read -r serial state; do
      [[ "$state" == device ]] && SERIALS+=("$serial")
    done < <(adb devices | tail -n +2)

    if [[ ${#SERIALS[@]} -gt 1 ]]; then
      # That second registration is the same TV, so it reports the same
      # hardware serial. Only different devices need the user to choose.
      # adb shell reads stdin, so it gets none: it would swallow the caller's.
      hardware_serial() { adb -s "$1" shell getprop ro.serialno </dev/null | tr -d '\r'; }
      FIRST="$(hardware_serial "${SERIALS[0]}")"
      for serial in "${SERIALS[@]:1}"; do
        if [[ -z "$FIRST" || "$(hardware_serial "$serial")" != "$FIRST" ]]; then
          echo "error: several devices attached, pick one with ANDROID_SERIAL=<serial>" >&2
          adb devices -l >&2
          exit 1
        fi
      done
    fi

    if [[ ${#SERIALS[@]} -gt 0 ]]; then
      # Every adb call below goes to this one, even while adb lists two.
      export ANDROID_SERIAL="${SERIALS[0]}"
      HAVE_DEVICE=1
    fi
  fi
fi

if [[ "$INSTALL" == 1 && "$HAVE_DEVICE" == 0 ]]; then
  echo "error: adb sees no authorised device" >&2
  echo "  connect the TV (adb pair / adb connect) and accept the debugging prompt on it," >&2
  echo "  or pass --no-install to only build the APK" >&2
  exit 1
fi

if [[ -z "$ABIS" ]]; then
  if [[ "$HAVE_DEVICE" == 1 ]]; then
    ABIS="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
  else
    ABIS="$FALLBACK_ABIS"
  fi
fi

# config-tv adds the LEANBACK_LAUNCHER category only under EXPO_TV=1, so its
# absence means android/ came from a phone prebuild. Only android/ is
# regenerated, leaving ios/ as the last iOS prebuild made it.
if [[ "$PREBUILD" == 1 ]] || ! grep -q 'android.intent.category.LEANBACK_LAUNCHER' "$MANIFEST" 2>/dev/null; then
  echo "› Generating the Android TV project"
  (cd "$ROOT" && echo y | "$ROOT/node_modules/.bin/expo" prebuild --clean --platform android)
fi

echo "› Building the Release APK for $ABIS"
rm -f "$APK"
(cd "$ANDROID_DIR" && ./gradlew assembleRelease -PreactNativeArchitectures="$ABIS")

if [[ ! -f "$APK" ]]; then
  echo "error: built APK not found at $APK" >&2
  exit 1
fi

if [[ "$INSTALL" == 0 ]]; then
  echo "✓ APK ready: $APK"
  exit 0
fi

PACKAGE="$(sed -nE "s/.*applicationId ['\"]([^'\"]+)['\"].*/\1/p" "$ANDROID_DIR/app/build.gradle" | head -1)"
MODEL="$(adb shell getprop ro.product.model | tr -d '\r')"

echo "› Installing $PACKAGE on $MODEL"
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT
if ! adb install -r "$APK" 2>&1 | tee "$LOG"; then
  # Uninstalling wipes the app's data, so that stays the user's call.
  if grep -q INSTALL_FAILED_UPDATE_INCOMPATIBLE "$LOG"; then
    echo "  a copy signed with another key is installed, remove it first: adb uninstall $PACKAGE" >&2
  fi
  exit 1
fi

echo "› Launching"
adb shell monkey -p "$PACKAGE" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 ||
  echo "⚠ launch failed, the app is installed: open it from the TV's app list"

echo "✓ $PACKAGE installed on $MODEL ($ABIS)"
