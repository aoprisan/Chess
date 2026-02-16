#!/bin/bash

# Build Script for Kiddie Chess - iOS
# Builds debug simulator app and release archive

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
    echo "  dev  - Build for simulator (default)"
    echo "  prod - Build for production"
    exit 1
fi

# Set server URL based on environment
if [ "$ENV" = "prod" ]; then
    SERVER_URL="http://35.156.232.123:8080"
else
    SERVER_URL="http://localhost:8080"
fi

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Kiddie Chess - iOS Build (${ENV})${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Using Flutter: ${GREEN}$FLUTTER_CMD${NC}"
echo -e "Server URL:    ${GREEN}$SERVER_URL${NC}"
echo ""

cd "$PROJECT_ROOT/client"

# ──────────────────────────────────────────────
# Step 1: Ensure iOS platform exists
# ──────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Checking iOS platform...${NC}"

if [ ! -d "ios" ]; then
    echo "  → iOS platform not found, creating..."
    "$FLUTTER_CMD" create . --platforms ios
    echo -e "${GREEN}  ✓ iOS platform created${NC}"
else
    echo -e "${GREEN}  ✓ iOS platform exists${NC}"
fi
echo ""

# ──────────────────────────────────────────────
# Step 2: Get dependencies
# ──────────────────────────────────────────────
echo -e "${YELLOW}[2/4] Getting dependencies...${NC}"
"$FLUTTER_CMD" pub get
echo -e "${GREEN}✓ Dependencies ready${NC}"
echo ""

# ──────────────────────────────────────────────
# Step 3: Build debug for simulator
# ──────────────────────────────────────────────
echo -e "${YELLOW}[3/4] Building debug app for simulator...${NC}"
"$FLUTTER_CMD" build ios --debug --simulator --dart-define=SERVER_URL="$SERVER_URL"

SIM_APP_PATH="build/ios/iphonesimulator/Runner.app"
if [ -d "$SIM_APP_PATH" ]; then
    SIM_SIZE=$(du -sh "$SIM_APP_PATH" | cut -f1)
    echo -e "${GREEN}✓ Simulator build complete (${SIM_SIZE})${NC}"
else
    echo -e "${RED}✗ Simulator build failed${NC}"
    exit 1
fi
echo ""

# ──────────────────────────────────────────────
# Step 4: Build release
# ──────────────────────────────────────────────
echo -e "${YELLOW}[4/4] Building release...${NC}"
"$FLUTTER_CMD" build ios --release --dart-define=SERVER_URL="$SERVER_URL"

RELEASE_PATH="build/ios/iphoneos/Runner.app"
if [ -d "$RELEASE_PATH" ]; then
    RELEASE_SIZE=$(du -sh "$RELEASE_PATH" | cut -f1)
    echo -e "${GREEN}✓ Release build complete (${RELEASE_SIZE})${NC}"
else
    echo -e "${RED}✗ Release build failed${NC}"
    exit 1
fi
echo ""

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  iOS Build Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Environment: ${GREEN}${ENV}${NC}"
echo -e "Server URL:  ${GREEN}${SERVER_URL}${NC}"
echo ""
echo -e "Outputs:"
echo -e "  Simulator: ${GREEN}${SIM_APP_PATH}${NC} (${SIM_SIZE})"
echo -e "  Release:   ${GREEN}${RELEASE_PATH}${NC} (${RELEASE_SIZE})"
echo ""
echo -e "${BLUE}To run on simulator:${NC}"
echo -e "  open -a Simulator"
echo -e "  xcrun simctl install booted ${SIM_APP_PATH}"
echo -e "  xcrun simctl launch booted com.example.client"
echo ""
echo -e "${BLUE}To archive for App Store:${NC}"
echo -e "  Open ios/Runner.xcworkspace in Xcode"
echo -e "  Product → Archive → Distribute App"
echo ""
echo -e "${BLUE}================================================${NC}"
