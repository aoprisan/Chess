#!/bin/bash
set -e

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

echo "=== Building Kiddie Chess ==="

# Build frontend (web)
if [ -n "$FLUTTER_CMD" ]; then
    echo ""
    echo "--- Building Flutter frontend (web) ---"
    echo "Using: $FLUTTER_CMD"
    cd "$PROJECT_ROOT/client"

    # Enable web platform if not configured
    if [ ! -d "web" ]; then
        echo "Configuring web platform..."
        "$FLUTTER_CMD" create . --platforms web
    fi

    "$FLUTTER_CMD" pub get
    "$FLUTTER_CMD" build web
    echo "Frontend built: client/build/web"
else
    echo ""
    echo "--- Skipping Flutter build (flutter not found) ---"
    echo "Searched: PATH and common install locations"
    echo "To build frontend, install Flutter: https://flutter.dev/docs/get-started/install"
fi

# Ensure Go bin is in PATH
export PATH="$PATH:$(go env GOPATH)/bin"

# Install air if not present
if ! command -v air &> /dev/null; then
    echo ""
    echo "--- Installing air for hot reload ---"
    go install github.com/air-verse/air@latest
fi

# Start server with hot reload
echo ""
echo "=== Starting server with hot reload on :8080 ==="
cd "$PROJECT_ROOT/server"
go mod tidy
air
