#!/bin/bash

# Script to archive manifest files after deployment

set -e

# Parse arguments
PROFILE="${1:-mainnet}"
MANIFEST_FILE="manifest_${PROFILE}.json"

# Check if manifest file exists
if [ ! -f "$MANIFEST_FILE" ]; then
    echo "Error: Manifest file $MANIFEST_FILE not found"
    echo "Usage: $0 [profile]"
    echo "Profile can be: mainnet, sepolia, dev (default: mainnet)"
    exit 1
fi

# Create timestamp
TIMESTAMP=$(date -u +%Y-%m-%d_%H%M%S)

# Create archive directory if it doesn't exist
ARCHIVE_DIR="../manifests/${PROFILE}"
mkdir -p "$ARCHIVE_DIR"

# Archive filename
ARCHIVE_FILE="${ARCHIVE_DIR}/manifest_${PROFILE}_${TIMESTAMP}.json"

# Copy manifest to archive
cp "$MANIFEST_FILE" "$ARCHIVE_FILE"

echo "✅ Manifest archived to: $ARCHIVE_FILE"

# Also create a 'latest' symlink for convenience
LATEST_LINK="${ARCHIVE_DIR}/manifest_${PROFILE}_latest.json"
ln -sf "manifest_${PROFILE}_${TIMESTAMP}.json" "$LATEST_LINK"

echo "✅ Latest symlink updated: $LATEST_LINK"

# Print manifest summary
if command -v jq &> /dev/null; then
    WORLD_ADDRESS=$(jq -r '.world.address' "$MANIFEST_FILE")
    echo ""
    echo "📋 Deployment Summary:"
    echo "   Profile: $PROFILE"
    echo "   World Address: $WORLD_ADDRESS"
    echo "   Timestamp: $TIMESTAMP"
fi