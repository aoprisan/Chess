#!/bin/bash

# Install Script for Kiddie Chess - Android Emulator
# Deploys debug APK to a running or auto-started emulator

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Auto-detect ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
    if [ -d "$HOME/Library/Android/sdk" ]; then
        ANDROID_HOME="$HOME/Library/Android/sdk"
    elif [ -d "$HOME/Android/Sdk" ]; then
        ANDROID_HOME="$HOME/Android/Sdk"
    else
        echo -e "${RED}ANDROID_HOME not set and Android SDK not found in default locations${NC}"
        echo "Set ANDROID_HOME or install Android SDK"
        exit 1
    fi
fi

ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"

if [ ! -x "$ADB" ]; then
    echo -e "${RED}adb not found at $ADB${NC}"
    echo "Install Android platform-tools"
    exit 1
fi

APK_PATH="$PROJECT_ROOT/client/build/app/outputs/flutter-apk/app-debug.apk"

if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}Debug APK not found at:${NC}"
    echo "  $APK_PATH"
    echo ""
    echo "Build it first with:"
    echo "  ./scripts/build-android.sh dev"
    exit 1
fi

APK_SIZE=$(du -sh "$APK_PATH" | cut -f1)

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Kiddie Chess - Install on Android Emulator${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "APK:          ${GREEN}${APK_PATH}${NC} (${APK_SIZE})"
echo -e "ANDROID_HOME: ${GREEN}${ANDROID_HOME}${NC}"
echo ""

# ──────────────────────────────────────────────
# Step 1: Check for running emulator or start one
# ──────────────────────────────────────────────
echo -e "${YELLOW}[1/2] Checking for emulator...${NC}"

DEVICES=$("$ADB" devices | grep -c "emulator" || true)

if [ "$DEVICES" -eq 0 ]; then
    echo "  → No emulator running, starting one..."

    if [ ! -x "$EMULATOR" ]; then
        echo -e "${RED}Emulator not found at $EMULATOR${NC}"
        echo "Install Android Emulator via SDK Manager"
        exit 1
    fi

    # Pick the first available AVD
    AVD=$("$EMULATOR" -list-avds | head -1)

    if [ -z "$AVD" ]; then
        echo -e "${RED}No AVDs found. Create one in Android Studio:${NC}"
        echo "  Tools → Device Manager → Create Device"
        exit 1
    fi

    echo "  → Starting AVD: $AVD"
    "$EMULATOR" -avd "$AVD" -no-snapshot-load &
    EMULATOR_PID=$!

    echo "  → Waiting for emulator to boot..."
    "$ADB" wait-for-device

    # Wait for boot animation to finish
    while [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
        sleep 2
    done

    echo -e "${GREEN}  ✓ Emulator ready${NC}"
else
    echo -e "${GREEN}  ✓ Emulator already running${NC}"
fi
echo ""

# ──────────────────────────────────────────────
# Step 2: Install APK
# ──────────────────────────────────────────────
echo -e "${YELLOW}[2/2] Installing APK...${NC}"
"$ADB" install -r "$APK_PATH"
echo -e "${GREEN}✓ APK installed${NC}"
echo ""

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  Install Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "The app should now be available on the emulator."
echo -e "Look for ${GREEN}Kiddie Chess${NC} in the app drawer."
echo ""
echo -e "${BLUE}================================================${NC}"
