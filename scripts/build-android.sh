#!/bin/bash

# Build Script for Kiddie Chess - Android
# dev  → debug APK (arm64-only, for emulator)
# prod → debug APK (for emulator) + release APK + release AAB (for Play Store)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Find Flutter in common locations
find_flutter() {
    if command -v flutter &> /dev/null; then
        echo "flutter"
        return
    fi

    FLUTTER_PATHS=(
        "$HOME/opt/flutter/bin/flutter"
        "$HOME/flutter/bin/flutter"
        "$HOME/development/flutter/bin/flutter"
        "$HOME/.flutter/bin/flutter"
        "$HOME/fvm/default/bin/flutter"
        "$HOME/.fvm/default/bin/flutter"
        "/opt/flutter/bin/flutter"
        "/opt/homebrew/bin/flutter"
        "/usr/local/flutter/bin/flutter"
    )

    for path in "${FLUTTER_PATHS[@]}"; do
        if [ -x "$path" ]; then
            echo "$path"
            return
        fi
    done
}

FLUTTER_CMD=$(find_flutter)

if [ -z "$FLUTTER_CMD" ]; then
    echo -e "${RED}Flutter not found!${NC}"
    echo "Searched: PATH and common install locations"
    echo "To install Flutter: https://flutter.dev/docs/get-started/install"
    exit 1
fi

# Parse environment argument
ENV="${1:-dev}"

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo -e "${RED}Usage: $0 [dev|prod]${NC}"
    echo "  dev  - Build debug APK for emulator (arm64-only)"
    echo "  prod - Build debug APK + release APK + release AAB (all ABIs)"
    exit 1
fi

# Set server URL based on environment
# 10.0.2.2 is the Android emulator alias for host machine's localhost
if [ "$ENV" = "prod" ]; then
    SERVER_URL="http://35.156.232.123:9090"
else
    SERVER_URL="http://10.0.2.2:9090"
fi

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Kiddie Chess - Android Build (${ENV})${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Using Flutter: ${GREEN}$FLUTTER_CMD${NC}"
echo -e "Server URL:    ${GREEN}$SERVER_URL${NC}"
echo ""

cd "$PROJECT_ROOT/client"

# Auto-detect ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
    if [ -d "$HOME/Library/Android/sdk" ]; then
        ANDROID_HOME="$HOME/Library/Android/sdk"
    elif [ -d "$HOME/Android/Sdk" ]; then
        ANDROID_HOME="$HOME/Android/Sdk"
    fi
fi

# ──────────────────────────────────────────────
# Step 1: Ensure Android platform exists
# ──────────────────────────────────────────────
if [ "$ENV" = "dev" ]; then
    TOTAL_STEPS=3
else
    TOTAL_STEPS=5
fi

echo -e "${YELLOW}[1/${TOTAL_STEPS}] Checking Android platform...${NC}"

if [ ! -d "android" ]; then
    echo "  → Android platform not found, creating..."
    "$FLUTTER_CMD" create . --platforms android
    echo -e "${GREEN}  ✓ Android platform created${NC}"
else
    echo -e "${GREEN}  ✓ Android platform exists${NC}"
fi

# Install cmdline-tools if missing (needed for NDK debug symbol stripping)
if [ -n "$ANDROID_HOME" ] && [ ! -d "$ANDROID_HOME/cmdline-tools" ]; then
    echo "  → cmdline-tools missing, downloading..."
    curl -sL -o /tmp/cmdline-tools.zip \
        "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools-tmp
    mkdir -p "$ANDROID_HOME/cmdline-tools/latest"
    mv /tmp/cmdline-tools-tmp/cmdline-tools/* "$ANDROID_HOME/cmdline-tools/latest/"
    rm -rf /tmp/cmdline-tools-tmp /tmp/cmdline-tools.zip
    echo -e "${GREEN}  ✓ cmdline-tools installed${NC}"
fi

echo ""

# ──────────────────────────────────────────────
# Step 2: Get dependencies
# ──────────────────────────────────────────────
echo -e "${YELLOW}[2/${TOTAL_STEPS}] Getting dependencies...${NC}"
"$FLUTTER_CMD" pub get
echo -e "${GREEN}✓ Dependencies ready${NC}"
echo ""

# ──────────────────────────────────────────────
# Step 3: Build
# ──────────────────────────────────────────────
if [ "$ENV" = "dev" ]; then
    # Dev: debug APK, arm64-only (skips armeabi-v7a, x86_64, x86)
    echo -e "${YELLOW}[3/${TOTAL_STEPS}] Building debug APK (arm64-only)...${NC}"
    "$FLUTTER_CMD" build apk --debug \
        --target-platform android-arm64 \
        --dart-define=SERVER_URL="$SERVER_URL"

    APK_PATH="build/app/outputs/flutter-apk/app-debug.apk"
    if [ -f "$APK_PATH" ]; then
        APK_SIZE=$(du -sh "$APK_PATH" | cut -f1)
        echo -e "${GREEN}✓ Debug APK built (${APK_SIZE})${NC}"
    else
        echo -e "${RED}✗ Debug APK build failed${NC}"
        exit 1
    fi
    echo ""

    # ──────────────────────────────────────────────
    # Summary (dev)
    # ──────────────────────────────────────────────
    echo -e "${BLUE}================================================${NC}"
    echo -e "${GREEN}  Android Dev Build Complete!${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    echo -e "Environment: ${GREEN}${ENV}${NC}"
    echo -e "Server URL:  ${GREEN}${SERVER_URL}${NC}"
    echo ""
    echo -e "Output:"
    echo -e "  Debug APK: ${GREEN}${APK_PATH}${NC} (${APK_SIZE})"
    echo ""
    echo -e "${BLUE}To install debug APK on emulator:${NC}"
    echo -e "  ./scripts/install-android.sh"

else
    # Prod: debug APK (for emulator) + release AAB (for Play Store)
    echo -e "${YELLOW}[3/${TOTAL_STEPS}] Building debug APK (for emulator)...${NC}"
    "$FLUTTER_CMD" build apk --debug --dart-define=SERVER_URL="$SERVER_URL"

    APK_PATH="build/app/outputs/flutter-apk/app-debug.apk"
    if [ -f "$APK_PATH" ]; then
        APK_SIZE=$(du -sh "$APK_PATH" | cut -f1)
        echo -e "${GREEN}✓ Debug APK built (${APK_SIZE})${NC}"
    else
        echo -e "${RED}✗ Debug APK build failed${NC}"
        exit 1
    fi
    echo ""

    echo -e "${YELLOW}[4/${TOTAL_STEPS}] Building release APK...${NC}"
    "$FLUTTER_CMD" build apk --release --dart-define=SERVER_URL="$SERVER_URL"

    RELEASE_APK_PATH="build/app/outputs/flutter-apk/app-release.apk"
    if [ -f "$RELEASE_APK_PATH" ]; then
        RELEASE_APK_SIZE=$(du -sh "$RELEASE_APK_PATH" | cut -f1)
        echo -e "${GREEN}✓ Release APK built (${RELEASE_APK_SIZE})${NC}"
    else
        echo -e "${RED}✗ Release APK build failed${NC}"
        exit 1
    fi
    echo ""

    echo -e "${YELLOW}[5/${TOTAL_STEPS}] Building release AAB...${NC}"
    "$FLUTTER_CMD" build appbundle --dart-define=SERVER_URL="$SERVER_URL"

    AAB_PATH="build/app/outputs/bundle/release/app-release.aab"
    if [ -f "$AAB_PATH" ]; then
        AAB_SIZE=$(du -sh "$AAB_PATH" | cut -f1)
        echo -e "${GREEN}✓ Release AAB built (${AAB_SIZE})${NC}"
    else
        echo -e "${RED}✗ Release AAB build failed${NC}"
        exit 1
    fi
    echo ""

    # ──────────────────────────────────────────────
    # Summary (prod)
    # ──────────────────────────────────────────────
    echo -e "${BLUE}================================================${NC}"
    echo -e "${GREEN}  Android Prod Build Complete!${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    echo -e "Environment: ${GREEN}${ENV}${NC}"
    echo -e "Server URL:  ${GREEN}${SERVER_URL}${NC}"
    echo ""
    echo -e "Outputs:"
    echo -e "  Debug APK:   ${GREEN}${APK_PATH}${NC} (${APK_SIZE})"
    echo -e "  Release APK: ${GREEN}${RELEASE_APK_PATH}${NC} (${RELEASE_APK_SIZE})"
    echo -e "  Release AAB: ${GREEN}${AAB_PATH}${NC} (${AAB_SIZE})"
    echo ""
    echo -e "${BLUE}To install debug APK on emulator:${NC}"
    echo -e "  ./scripts/install-android.sh"
    echo ""
    echo -e "${BLUE}To upload AAB to Play Store:${NC}"
    echo -e "  Upload ${AAB_PATH} via Google Play Console"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
