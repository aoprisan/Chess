#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Ensure Go bin is in PATH
export PATH="$PATH:$(go env GOPATH)/bin"

# Install air if not present
if ! command -v air &> /dev/null; then
    echo ""
    echo "--- Installing air for hot reload ---"
    go install github.com/air-verse/air@latest
fi

echo "=== Starting Go Server with hot reload on :8080 ==="
cd "$PROJECT_ROOT/server"
go mod tidy
air
