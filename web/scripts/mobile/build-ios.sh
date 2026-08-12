#!/usr/bin/env bash
#
# Build the iOS app (Capacitor shell around the Vite build). macOS only.
#
#   npm run ios:build                     # debug build for the simulator
#   npm run ios:release                   # release .xcarchive + .ipa export
#   npm run ios:open                      # open the project in Xcode
#   npm run ios:run                       # build + install + launch on a device
#
#   bash scripts/mobile/build-ios.sh --help
#
# Requirements: macOS with Xcode 16+ (and its command line tools) and
# CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`).

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MODE=build # build | archive | ipa | open | run
CONFIG=Debug
SKIP_WEB=0
CLEAN=0
TARGET=""

usage() {
  print_header "${BASH_SOURCE[0]}"
  cat <<'EOF'

Options:
  --release          Release configuration (implied by --archive/--ipa)
  --simulator        Debug build for the iOS Simulator (default)
  --device           Build for a physical device (needs signing)
  --archive          Produce a release .xcarchive
  --ipa              Produce a release .xcarchive and export an .ipa
  --open             Open the project in Xcode instead of building
  --run              Build, install and launch on a device/simulator
  --target <id>      Device/simulator id for --run (see: npx cap run ios --list)
  --skip-web         Reuse the existing dist/ instead of rebuilding the web app
  --clean            Clean the Xcode build folder first
  -h, --help         Show this help

Signing / export (only needed for --device, --archive and --ipa):
  IOS_DEVELOPMENT_TEAM     Apple Developer team id (10 chars), e.g. AB12CD34EF
  IOS_EXPORT_METHOD        export method for --ipa: development (default),
                           app-store-connect, ad-hoc, enterprise
  IOS_EXPORT_OPTIONS_PLIST path to your own ExportOptions.plist; overrides
                           IOS_EXPORT_METHOD and the generated plist

Artifacts are copied to web/dist-mobile/ios/.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --release) CONFIG=Release ;;
    --simulator)
      MODE=build
      DEVICE_BUILD=0
      ;;
    --device)
      MODE=build
      DEVICE_BUILD=1
      ;;
    --archive)
      MODE=archive
      CONFIG=Release
      ;;
    --ipa)
      MODE=ipa
      CONFIG=Release
      ;;
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
DEVICE_BUILD="${DEVICE_BUILD:-0}"

require_deps

[ "$(uname -s)" = "Darwin" ] ||
  die "iOS apps can only be built on macOS. On Linux/Windows use scripts/mobile/build-android.sh."
have xcodebuild || die "xcodebuild not found. Install Xcode, then: sudo xcode-select --switch /Applications/Xcode.app"
have pod || warn "CocoaPods (pod) not found — 'cap sync ios' will fail. Install it with: brew install cocoapods"

[ "$SKIP_WEB" = 1 ] || build_web
ensure_platform ios
sync_platform ios

if [ "$MODE" = open ]; then
  log "Opening Xcode"
  (cd "$WEB_DIR" && npx --no-install cap open ios)
  exit 0
fi

if [ "$MODE" = run ]; then
  log "Installing and launching on device/simulator"
  if [ -n "$TARGET" ]; then
    (cd "$WEB_DIR" && npx --no-install cap run ios --no-sync --target "$TARGET")
  else
    (cd "$WEB_DIR" && npx --no-install cap run ios --no-sync)
  fi
  exit 0
fi

APP_DIR="$WEB_DIR/ios/App"
# CocoaPods projects build through the workspace; an SPM-only project (Capacitor
# can scaffold either) has no workspace and builds through the .xcodeproj.
if [ -d "$APP_DIR/App.xcworkspace" ]; then
  PROJECT_ARGS=(-workspace "$APP_DIR/App.xcworkspace")
else
  PROJECT_ARGS=(-project "$APP_DIR/App.xcodeproj")
fi
PROJECT_ARGS+=(-scheme App -configuration "$CONFIG")

# Version from package.json, same as the Android build — ios/ is regenerated
# output, so nothing version-related is worth editing in the Xcode project.
VERSION_NAME="$(app_version)"
BUILD_NUMBER="$(app_build_number)"
info "version $VERSION_NAME (build $BUILD_NUMBER)"
PROJECT_ARGS+=("MARKETING_VERSION=$VERSION_NAME" "CURRENT_PROJECT_VERSION=$BUILD_NUMBER")

TEAM_ARGS=()
if [ -n "${IOS_DEVELOPMENT_TEAM:-}" ]; then
  TEAM_ARGS+=("DEVELOPMENT_TEAM=$IOS_DEVELOPMENT_TEAM" -allowProvisioningUpdates)
fi

OUT="$DIST_MOBILE/ios"
mkdir -p "$OUT"
DERIVED="$WEB_DIR/ios/build"

if [ "$CLEAN" = 1 ]; then
  log "Cleaning the Xcode build folder"
  run xcodebuild "${PROJECT_ARGS[@]}" -derivedDataPath "$DERIVED" clean
fi

case "$MODE" in
  build)
    if [ "$DEVICE_BUILD" = 1 ]; then
      [ -n "${IOS_DEVELOPMENT_TEAM:-}" ] ||
        warn "IOS_DEVELOPMENT_TEAM is not set — a device build needs a signing team."
      log "Building App.app for a physical device ($CONFIG)"
      run xcodebuild "${PROJECT_ARGS[@]}" \
        -destination 'generic/platform=iOS' \
        -derivedDataPath "$DERIVED" \
        ${TEAM_ARGS[@]+"${TEAM_ARGS[@]}"} \
        build
    else
      log "Building App.app for the iOS Simulator ($CONFIG)"
      # Simulator builds never need a signing identity, so skip it outright —
      # that keeps the script usable without an Apple Developer account.
      run xcodebuild "${PROJECT_ARGS[@]}" \
        -destination 'generic/platform=iOS Simulator' \
        -derivedDataPath "$DERIVED" \
        CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
        build
    fi
    APP="$(find "$DERIVED/Build/Products" -maxdepth 2 -name 'App.app' -print -quit)"
    [ -n "$APP" ] || die "build succeeded but App.app was not found under $DERIVED"
    rm -rf "$OUT/App.app"
    cp -R "$APP" "$OUT/"
    printf '%s  %s%s\n' "$BOLD" "$OUT/App.app" "$RESET"
    [ "$DEVICE_BUILD" = 1 ] ||
      info "run it with: xcrun simctl install booted $OUT/App.app && xcrun simctl launch booted com.neoncity.bugbusters"
    ;;

  archive | ipa)
    ARCHIVE="$OUT/App.xcarchive"
    log "Archiving ($CONFIG)"
    rm -rf "$ARCHIVE"
    run xcodebuild "${PROJECT_ARGS[@]}" \
      -destination 'generic/platform=iOS' \
      -archivePath "$ARCHIVE" \
      ${TEAM_ARGS[@]+"${TEAM_ARGS[@]}"} \
      archive
    printf '%s  %s%s\n' "$BOLD" "$ARCHIVE" "$RESET"

    if [ "$MODE" = ipa ]; then
      PLIST="${IOS_EXPORT_OPTIONS_PLIST:-}"
      if [ -z "$PLIST" ]; then
        PLIST="$OUT/ExportOptions.plist"
        METHOD="${IOS_EXPORT_METHOD:-development}"
        log "Writing $PLIST (method: $METHOD)"
        {
          echo '<?xml version="1.0" encoding="UTF-8"?>'
          echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
          echo '<plist version="1.0"><dict>'
          echo "  <key>method</key><string>$METHOD</string>"
          if [ -n "${IOS_DEVELOPMENT_TEAM:-}" ]; then
            echo "  <key>teamID</key><string>$IOS_DEVELOPMENT_TEAM</string>"
          fi
          echo '  <key>signingStyle</key><string>automatic</string>'
          echo '  <key>uploadSymbols</key><true/>'
          echo '  <key>compileBitcode</key><false/>'
          echo '</dict></plist>'
        } >"$PLIST"
      fi
      [ -f "$PLIST" ] || die "export options plist not found: $PLIST"
      log "Exporting .ipa"
      run xcodebuild -exportArchive \
        -archivePath "$ARCHIVE" \
        -exportOptionsPlist "$PLIST" \
        -exportPath "$OUT" \
        ${TEAM_ARGS[@]+"${TEAM_ARGS[@]}"}
      IPA="$(find "$OUT" -maxdepth 1 -name '*.ipa' -print -quit)"
      [ -n "$IPA" ] || die "export finished but no .ipa was produced in $OUT"
      printf '%s  %s%s\n' "$BOLD" "$IPA" "$RESET"
    fi
    ;;
esac
