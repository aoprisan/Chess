#!/usr/bin/env bash
#
# Build the Android app (Capacitor shell around the Vite build).
#
#   npm run android:build                 # debug APK
#   npm run android:release               # signed/unsigned release AAB
#   npm run android:open                  # open the project in Android Studio
#   npm run android:run                   # build + install + launch on a device
#
#   bash scripts/mobile/build-android.sh --help
#
# Requirements: Node 20+, JDK 21, and the Android SDK (Android Studio, or
# cmdline-tools + platform-tools) with ANDROID_HOME/ANDROID_SDK_ROOT exported.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MODE=apk        # apk | bundle | open | run
BUILD_TYPE=debug # debug | release
SKIP_WEB=0
CLEAN=0
TARGET=""

usage() {
  print_header "${BASH_SOURCE[0]}"
  cat <<'EOF'

Options:
  --release          Release build type (default: debug)
  --apk              Emit an APK (default)
  --bundle, --aab    Emit an Android App Bundle (what Play Store uploads want)
  --open             Open the project in Android Studio instead of building
  --run              Build, install and launch on a connected device/emulator
  --target <id>      Device/emulator id for --run (see: npx cap run android --list)
  --skip-web         Reuse the existing dist/ instead of rebuilding the web app
  --clean            gradlew clean before building
  -h, --help         Show this help

Release signing (optional — set all four, otherwise the release build is
unsigned and must be signed before upload):
  ANDROID_KEYSTORE_PATH      path to the .jks/.keystore file
  ANDROID_KEYSTORE_PASSWORD  keystore password
  ANDROID_KEY_ALIAS          key alias inside the keystore
  ANDROID_KEY_PASSWORD       key password

Artifacts are copied to web/dist-mobile/android/.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --release) BUILD_TYPE=release ;;
    --debug) BUILD_TYPE=debug ;;
    --apk) MODE=apk ;;
    --bundle | --aab) MODE=bundle ;;
    --open) MODE=open ;;
    --run) MODE=run ;;
    --target)
      shift
      TARGET="${1:-}"
      [ -n "$TARGET" ] || die "--target needs a device id"
      ;;
    --skip-web) SKIP_WEB=1 ;;
    --clean) CLEAN=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

require_deps

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK_ROOT" ]; then
  warn "ANDROID_HOME/ANDROID_SDK_ROOT is not set — Gradle will fail unless the SDK is discoverable."
  info "Typical values: ~/Library/Android/sdk (macOS), ~/Android/Sdk (Linux)"
elif [ ! -d "$SDK_ROOT" ]; then
  die "ANDROID_HOME points at a missing directory: $SDK_ROOT"
fi

if ! have java && [ "$MODE" != open ]; then
  die "java is not on PATH. Install JDK 21 (e.g. Temurin 21) or export JAVA_HOME."
fi

[ "$SKIP_WEB" = 1 ] || build_web
ensure_platform android
sync_platform android

if [ "$MODE" = open ]; then
  log "Opening Android Studio"
  (cd "$WEB_DIR" && npx --no-install cap open android)
  exit 0
fi

if [ "$MODE" = run ]; then
  log "Installing and launching on device"
  if [ -n "$TARGET" ]; then
    (cd "$WEB_DIR" && npx --no-install cap run android --no-sync --target "$TARGET")
  else
    (cd "$WEB_DIR" && npx --no-install cap run android --no-sync)
  fi
  exit 0
fi

cd "$WEB_DIR/android"
[ -x ./gradlew ] || chmod +x ./gradlew

# AGP honours these injected properties (the same ones Android Studio passes),
# so the version and the signing config need no edits to the generated
# build.gradle — which matters because android/ is regenerated output.
VERSION_NAME="$(app_version)"
VERSION_CODE="$(app_build_number)"
GRADLE_ARGS=(
  "-Pandroid.injected.version.name=$VERSION_NAME"
  "-Pandroid.injected.version.code=$VERSION_CODE"
)
info "version $VERSION_NAME (code $VERSION_CODE)"

if [ "$BUILD_TYPE" = release ]; then
  if [ -n "${ANDROID_KEYSTORE_PATH:-}" ]; then
    [ -f "$ANDROID_KEYSTORE_PATH" ] || die "ANDROID_KEYSTORE_PATH not found: $ANDROID_KEYSTORE_PATH"
    : "${ANDROID_KEYSTORE_PASSWORD:?ANDROID_KEYSTORE_PASSWORD is required when ANDROID_KEYSTORE_PATH is set}"
    : "${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS is required when ANDROID_KEYSTORE_PATH is set}"
    : "${ANDROID_KEY_PASSWORD:?ANDROID_KEY_PASSWORD is required when ANDROID_KEYSTORE_PATH is set}"
    # Gradle resolves a relative store file against the android/ project dir.
    KEYSTORE_ABS="$(cd "$(dirname "$ANDROID_KEYSTORE_PATH")" && pwd)/$(basename "$ANDROID_KEYSTORE_PATH")"
    GRADLE_ARGS+=(
      "-Pandroid.injected.signing.store.file=$KEYSTORE_ABS"
      "-Pandroid.injected.signing.store.password=$ANDROID_KEYSTORE_PASSWORD"
      "-Pandroid.injected.signing.key.alias=$ANDROID_KEY_ALIAS"
      "-Pandroid.injected.signing.key.password=$ANDROID_KEY_PASSWORD"
    )
    info "release build will be signed with $(basename "$KEYSTORE_ABS")"
  else
    warn "no ANDROID_KEYSTORE_PATH — the release artifact will be UNSIGNED and cannot be installed or uploaded as-is."
  fi
fi

[ "$CLEAN" = 0 ] || run ./gradlew clean

# Gradle task names capitalise the build type (assembleDebug, bundleRelease).
# Spelled out rather than ${VAR^} so the script still runs on the bash 3.2 that
# ships with macOS.
case "$BUILD_TYPE" in
  debug) TYPE_CAP=Debug ;;
  release) TYPE_CAP=Release ;;
esac
if [ "$MODE" = bundle ]; then
  TASK="bundle$TYPE_CAP"
else
  TASK="assemble$TYPE_CAP"
fi

log "Gradle: $TASK"
# Echo the command with the keystore passwords masked — this output ends up in
# terminal scrollback and CI logs.
info "\$ ./gradlew $TASK $(printf '%s ' ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"} |
  sed 's/\(signing\.[a-z.]*password\)=[^ ]*/\1=***/g')"
./gradlew "$TASK" ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"}

OUT="$DIST_MOBILE/android"
log "Collecting artifacts"
if [ "$MODE" = bundle ]; then
  collect "app/build/outputs/bundle/$BUILD_TYPE/app-$BUILD_TYPE.aab" "$OUT"
else
  APK="app/build/outputs/apk/$BUILD_TYPE/app-$BUILD_TYPE.apk"
  [ -f "$APK" ] || APK="app/build/outputs/apk/$BUILD_TYPE/app-$BUILD_TYPE-unsigned.apk"
  collect "$APK" "$OUT"
  if [ "$BUILD_TYPE" = debug ]; then
    info "install with: adb install -r $OUT/$(basename "$APK")"
  fi
fi
