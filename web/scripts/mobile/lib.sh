#!/usr/bin/env bash
# Shared helpers for the Capacitor build scripts (build-android.sh,
# build-ios.sh). Sourced, never executed directly.

set -euo pipefail

# web/ is two levels up from scripts/mobile/.
WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_MOBILE="$WEB_DIR/dist-mobile"

BOLD=$'\033[1m'
DIM=$'\033[2m'
RED=$'\033[31m'
YELLOW=$'\033[33m'
CYAN=$'\033[36m'
RESET=$'\033[0m'
if [ ! -t 1 ]; then
  BOLD='' DIM='' RED='' YELLOW='' CYAN='' RESET=''
fi

log() { printf '%s==>%s %s\n' "$CYAN$BOLD" "$RESET$BOLD" "$*$RESET"; }
info() { printf '%s    %s%s\n' "$DIM" "$*" "$RESET"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW$BOLD" "$RESET" "$*" >&2; }
die() {
  printf '%serror:%s %s\n' "$RED$BOLD" "$RESET" "$*" >&2
  exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }

# Echo a script's leading comment block (everything between the shebang and the
# first non-comment line) as its usage summary — one source of truth.
print_header() {
  awk 'NR==1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$1"
}

run() {
  info "\$ $*"
  "$@"
}

# Bail early with an actionable message instead of a wall of npm/gradle output.
require_deps() {
  have node || die "node is not installed (Node 20+ required)."
  have npm || die "npm is not installed."
  [ -d "$WEB_DIR/node_modules/@capacitor/cli" ] ||
    die "Capacitor is not installed. Run: (cd $WEB_DIR && npm install)"
}

# Build the web bundle for a WebView: origin-root base path, no service worker.
# BASE_PATH stays overridable for odd hosting setups; CAPACITOR=1 is what
# vite.config.ts keys off.
build_web() {
  log "Building the web bundle for the native shell"
  (cd "$WEB_DIR" && CAPACITOR=1 BASE_PATH="${BASE_PATH:-/}" npm run build)
  [ -f "$WEB_DIR/dist/index.html" ] || die "build produced no dist/index.html"
}

# `npx cap add` scaffolds the native project the first time. The platform
# folders are generated output (gitignored) — regenerating them is the
# supported way to pick up Capacitor upgrades.
ensure_platform() {
  local platform="$1"
  if [ -d "$WEB_DIR/$platform" ]; then
    return 0
  fi
  log "Scaffolding the $platform project (first run)"
  (cd "$WEB_DIR" && npx --no-install cap add "$platform")
}

sync_platform() {
  local platform="$1"
  log "Syncing web assets and plugins into $platform"
  (cd "$WEB_DIR" && npx --no-install cap sync "$platform")
}

# The app version comes from web/package.json, so the two native projects never
# drift from the web app (their generated build files aren't in git at all).
app_version() {
  node -p "require('$WEB_DIR/package.json').version"
}

# Monotonic integer build number derived from the semver, e.g. 1.4.2 -> 10402.
# Override with MOBILE_BUILD_NUMBER when a store rejects a duplicate upload.
app_build_number() {
  if [ -n "${MOBILE_BUILD_NUMBER:-}" ]; then
    printf '%s' "$MOBILE_BUILD_NUMBER"
    return
  fi
  app_version | awk -F. '{ printf "%d", ($1 * 10000) + ($2 * 100) + $3 }'
}

# Copy a build artifact into dist-mobile/ so both platforms drop their output
# in one predictable place.
collect() {
  local src="$1" destdir="$2"
  [ -f "$src" ] || die "expected build output not found: $src"
  mkdir -p "$destdir"
  cp -f "$src" "$destdir/"
  printf '%s  %s%s\n' "$BOLD" "$destdir/$(basename "$src")" "$RESET"
}
