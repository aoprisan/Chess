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

if [ -z "$FLUTTER_CMD" ]; then
    echo "Flutter not found!"
    echo "Searched: PATH and common install locations"
    echo "To install Flutter: https://flutter.dev/docs/get-started/install"
    exit 1
fi

echo "=== Starting Flutter Client ==="
echo "Using: $FLUTTER_CMD"
cd "$PROJECT_ROOT/client"

# Enable web platform if not configured
if [ ! -d "web" ]; then
    echo "Configuring web platform..."
    "$FLUTTER_CMD" create . --platforms web
fi

"$FLUTTER_CMD" pub get
"$FLUTTER_CMD" run -d chrome
