#!/bin/bash

# Clean Script for Kiddie Chess
# Removes all build artifacts, caches, and temporary files

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Kiddie Chess - Project Cleanup${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

CLEANED=0

# ──────────────────────────────────────────────
# Flutter build artifacts
# ──────────────────────────────────────────────
echo -e "${YELLOW}[1/7] Flutter build artifacts...${NC}"

if [ -d "$PROJECT_ROOT/client/build" ]; then
    SIZE=$(du -sh "$PROJECT_ROOT/client/build" | cut -f1)
    rm -rf "$PROJECT_ROOT/client/build"
    echo -e "${GREEN}  ✓ Removed client/build/ (${SIZE})${NC}"
    CLEANED=$((CLEANED + 1))
else
    echo "  — client/build/ not found, skipping"
fi

# ──────────────────────────────────────────────
# Dart tooling cache
# ──────────────────────────────────────────────
echo -e "${YELLOW}[2/7] Dart tooling cache...${NC}"

if [ -d "$PROJECT_ROOT/client/.dart_tool" ]; then
    SIZE=$(du -sh "$PROJECT_ROOT/client/.dart_tool" | cut -f1)
    rm -rf "$PROJECT_ROOT/client/.dart_tool"
    echo -e "${GREEN}  ✓ Removed client/.dart_tool/ (${SIZE})${NC}"
    CLEANED=$((CLEANED + 1))
else
    echo "  — client/.dart_tool/ not found, skipping"
fi

# ──────────────────────────────────────────────
# Flutter plugin metadata
# ──────────────────────────────────────────────
echo -e "${YELLOW}[3/7] Flutter plugin metadata...${NC}"

PLUGIN_CLEANED=0
if [ -f "$PROJECT_ROOT/client/.flutter-plugins" ]; then
    rm -f "$PROJECT_ROOT/client/.flutter-plugins"
    PLUGIN_CLEANED=$((PLUGIN_CLEANED + 1))
fi
if [ -f "$PROJECT_ROOT/client/.flutter-plugins-dependencies" ]; then
    rm -f "$PROJECT_ROOT/client/.flutter-plugins-dependencies"
    PLUGIN_CLEANED=$((PLUGIN_CLEANED + 1))
fi

if [ $PLUGIN_CLEANED -gt 0 ]; then
    echo -e "${GREEN}  ✓ Removed ${PLUGIN_CLEANED} Flutter plugin file(s)${NC}"
    CLEANED=$((CLEANED + 1))
else
    echo "  — No Flutter plugin files found, skipping"
fi

# ──────────────────────────────────────────────
# Go server binaries
# ──────────────────────────────────────────────
echo -e "${YELLOW}[4/7] Go server binaries...${NC}"

if [ -d "$PROJECT_ROOT/server/bin" ]; then
    SIZE=$(du -sh "$PROJECT_ROOT/server/bin" | cut -f1)
    rm -rf "$PROJECT_ROOT/server/bin"
    echo -e "${GREEN}  ✓ Removed server/bin/ (${SIZE})${NC}"
    CLEANED=$((CLEANED + 1))
else
    echo "  — server/bin/ not found, skipping"
fi

# ──────────────────────────────────────────────
# Go air tmp directory
# ──────────────────────────────────────────────
echo -e "${YELLOW}[5/7] Go air tmp directory...${NC}"

if [ -d "$PROJECT_ROOT/server/tmp" ]; then
    SIZE=$(du -sh "$PROJECT_ROOT/server/tmp" | cut -f1)
    rm -rf "$PROJECT_ROOT/server/tmp"
    echo -e "${GREEN}  ✓ Removed server/tmp/ (${SIZE})${NC}"
    CLEANED=$((CLEANED + 1))
else
    echo "  — server/tmp/ not found, skipping"
fi

# ──────────────────────────────────────────────
# Python caches
# ──────────────────────────────────────────────
echo -e "${YELLOW}[6/7] Python caches...${NC}"

PYCACHE_COUNT=$(find "$PROJECT_ROOT" -type d -name "__pycache__" 2>/dev/null | wc -l | tr -d ' ')
PYTEST_CLEANED=0

if [ "$PYCACHE_COUNT" -gt 0 ]; then
    find "$PROJECT_ROOT" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    echo -e "${GREEN}  ✓ Removed ${PYCACHE_COUNT} __pycache__/ directories${NC}"
    CLEANED=$((CLEANED + 1))
fi

if [ -d "$PROJECT_ROOT/templates/sim/.pytest_cache" ]; then
    rm -rf "$PROJECT_ROOT/templates/sim/.pytest_cache"
    echo -e "${GREEN}  ✓ Removed templates/sim/.pytest_cache/${NC}"
    PYTEST_CLEANED=1
    CLEANED=$((CLEANED + 1))
fi

if [ "$PYCACHE_COUNT" -eq 0 ] && [ "$PYTEST_CLEANED" -eq 0 ]; then
    echo "  — No Python caches found, skipping"
fi

# ──────────────────────────────────────────────
# OS junk and log files
# ──────────────────────────────────────────────
echo -e "${YELLOW}[7/7] OS junk and log files...${NC}"

DS_COUNT=$(find "$PROJECT_ROOT" -name ".DS_Store" 2>/dev/null | wc -l | tr -d ' ')
LOG_COUNT=$(find "$PROJECT_ROOT" -name "*.log" 2>/dev/null | wc -l | tr -d ' ')

if [ "$DS_COUNT" -gt 0 ]; then
    find "$PROJECT_ROOT" -name ".DS_Store" -delete 2>/dev/null || true
    echo -e "${GREEN}  ✓ Removed ${DS_COUNT} .DS_Store files${NC}"
    CLEANED=$((CLEANED + 1))
fi

if [ "$LOG_COUNT" -gt 0 ]; then
    find "$PROJECT_ROOT" -name "*.log" -delete 2>/dev/null || true
    echo -e "${GREEN}  ✓ Removed ${LOG_COUNT} .log files${NC}"
    CLEANED=$((CLEANED + 1))
fi

if [ "$DS_COUNT" -eq 0 ] && [ "$LOG_COUNT" -eq 0 ]; then
    echo "  — No .DS_Store or .log files found, skipping"
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}================================================${NC}"
if [ $CLEANED -gt 0 ]; then
    echo -e "${GREEN}  Cleanup complete! (${CLEANED} categories cleaned)${NC}"
else
    echo -e "${GREEN}  Already clean — nothing to remove.${NC}"
fi
echo -e "${BLUE}================================================${NC}"
