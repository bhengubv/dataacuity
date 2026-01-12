#!/bin/bash
# =============================================================================
# DataAcuity Maps - South Africa Tiles Update Script
# Run monthly to get latest OpenStreetMap data
# =============================================================================

set -e

TILES_DIR="/home/geektrading/maps/tiles"
PMTILES_CLI="$TILES_DIR/pmtiles"
PROTOMAPS_BASE="https://build.protomaps.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }

# South Africa bounding box
SA_BBOX="16.3,-35.0,33.0,-22.0"

log "Starting South Africa tiles update..."

# Check for pmtiles CLI
if [ ! -f "$PMTILES_CLI" ]; then
    error "pmtiles CLI not found at $PMTILES_CLI"
    error "Download from: https://github.com/protomaps/go-pmtiles/releases"
    exit 1
fi

# Find latest Protomaps build
log "Finding latest Protomaps build..."
LATEST_DATE=$(date +%Y%m%d)
PMTILES_URL="${PROTOMAPS_BASE}/${LATEST_DATE}.pmtiles"

# Try today, then yesterday, then day before
for i in 0 1 2 3; do
    CHECK_DATE=$(date -d "-$i days" +%Y%m%d 2>/dev/null || date -v-${i}d +%Y%m%d)
    CHECK_URL="${PROTOMAPS_BASE}/${CHECK_DATE}.pmtiles"

    if curl -sI "$CHECK_URL" | grep -q "200 OK"; then
        PMTILES_URL="$CHECK_URL"
        LATEST_DATE="$CHECK_DATE"
        break
    fi
done

log "Using Protomaps build: $LATEST_DATE"

# Create backup of current tiles
if [ -f "$TILES_DIR/south-africa.pmtiles" ]; then
    log "Backing up current tiles..."
    cp "$TILES_DIR/south-africa.pmtiles" "$TILES_DIR/south-africa.pmtiles.bak"
fi

# Extract South Africa region
log "Extracting South Africa region (this may take a few minutes)..."
"$PMTILES_CLI" extract "$PMTILES_URL" "$TILES_DIR/south-africa-new.pmtiles" --bbox="$SA_BBOX"

# Verify new file
if [ -f "$TILES_DIR/south-africa-new.pmtiles" ]; then
    NEW_SIZE=$(du -h "$TILES_DIR/south-africa-new.pmtiles" | cut -f1)
    log "New tiles extracted: $NEW_SIZE"

    # Get tile count
    TILE_COUNT=$("$PMTILES_CLI" show "$TILES_DIR/south-africa-new.pmtiles" 2>/dev/null | grep "tile entries" | awk '{print $3}' || echo "unknown")
    log "Tile count: $TILE_COUNT"

    # Replace old with new
    mv "$TILES_DIR/south-africa-new.pmtiles" "$TILES_DIR/south-africa.pmtiles"

    # Restart tile server to pick up new tiles
    log "Restarting tile server..."
    docker restart maps_tiles 2>/dev/null || warn "Could not restart maps_tiles container"

    # Clean up backup after successful update
    rm -f "$TILES_DIR/south-africa.pmtiles.bak"

    log "Update complete!"
    log "  Build date: $LATEST_DATE"
    log "  File size: $NEW_SIZE"
    log "  Tiles: $TILE_COUNT"
else
    error "Failed to extract tiles"

    # Restore backup if exists
    if [ -f "$TILES_DIR/south-africa.pmtiles.bak" ]; then
        warn "Restoring backup..."
        mv "$TILES_DIR/south-africa.pmtiles.bak" "$TILES_DIR/south-africa.pmtiles"
    fi

    exit 1
fi
