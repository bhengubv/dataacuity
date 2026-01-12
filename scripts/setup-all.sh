#!/bin/bash
# =============================================================================
# Complete Maps Setup - Downloads and configures all navigation services
# Runs overnight with rate limiting to avoid being blocked
# =============================================================================

LOG_DIR="/tmp/maps-setup-logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MAIN_LOG="$LOG_DIR/setup-all-$TIMESTAMP.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$MAIN_LOG"
}

log "=============================================="
log "Starting Complete Maps Setup"
log "=============================================="
log "This will download and configure:"
log "  - OSRM routing data (12 priority countries)"
log "  - Nominatim geocoding (South Africa first)"
log ""
log "Using rate limiting to avoid being blocked."
log "This process will take several hours."
log ""

cd /home/geektrading/maps

# =============================================================================
# Step 1: OSRM Global Setup
# =============================================================================
log "[STEP 1/4] Starting OSRM global data download..."

if [ -f /tmp/osrm-global-setup.log ]; then
    log "OSRM setup already in progress, checking status..."
    # Check if still running
    if pgrep -f "setup-osrm-global.sh" > /dev/null; then
        log "OSRM download still running..."
    else
        log "Previous OSRM run completed or failed, checking results..."
    fi
else
    log "Starting fresh OSRM download..."
    /home/geektrading/maps/scripts/setup-osrm-global.sh priority >> "$LOG_DIR/osrm-$TIMESTAMP.log" 2>&1 &
    OSRM_PID=$!
    log "OSRM download started with PID: $OSRM_PID"
fi

# Wait for OSRM to complete (checking every 5 minutes)
log "Waiting for OSRM downloads to complete..."
while pgrep -f "setup-osrm-global.sh" > /dev/null || pgrep -f "wget.*geofabrik" > /dev/null; do
    # Get current download status
    CURRENT_FILE=$(ls -t /home/geektrading/maps/osrm-data/*.osm.pbf 2>/dev/null | head -1)
    if [ -n "$CURRENT_FILE" ]; then
        SIZE=$(du -h "$CURRENT_FILE" 2>/dev/null | cut -f1)
        log "  Currently downloading: $(basename $CURRENT_FILE) - Size: $SIZE"
    fi
    sleep 300  # Check every 5 minutes
done

log "[STEP 1/4] OSRM downloads completed!"
log "Downloaded files:"
ls -lh /home/geektrading/maps/osrm-data/*.osm.pbf 2>/dev/null | tee -a "$MAIN_LOG"

# =============================================================================
# Step 2: Start OSRM Services
# =============================================================================
log ""
log "[STEP 2/4] Starting OSRM routing services..."

# Start OSRM with the first available region (South Africa priority)
OSRM_FILE=$(ls /home/geektrading/maps/osrm-data/*.osrm 2>/dev/null | head -1)
if [ -n "$OSRM_FILE" ]; then
    log "Starting OSRM with: $OSRM_FILE"
    docker compose --profile routing up -d maps_osrm
    log "OSRM service started"
else
    log "No processed OSRM files found yet. Will start after processing completes."
fi

# =============================================================================
# Step 3: Nominatim Setup (South Africa first for quick start)
# =============================================================================
log ""
log "[STEP 3/4] Setting up Nominatim geocoding..."

# Download South Africa for Nominatim (smaller, faster start)
SA_PBF="/home/geektrading/maps/nominatim-data/south-africa.osm.pbf"
if [ ! -f "$SA_PBF" ]; then
    log "Downloading South Africa data for geocoding..."
    mkdir -p /home/geektrading/maps/nominatim-data
    wget \
        --limit-rate=500k \
        --tries=5 \
        --waitretry=60 \
        --continue \
        --progress=dot:giga \
        --user-agent="DataAcuity Maps Service" \
        -O "$SA_PBF" \
        "https://download.geofabrik.de/africa/south-africa-latest.osm.pbf" \
        >> "$LOG_DIR/nominatim-download-$TIMESTAMP.log" 2>&1
    log "South Africa geocoding data downloaded"
else
    log "South Africa geocoding data already exists"
fi

# =============================================================================
# Step 4: Start Nominatim Service
# =============================================================================
log ""
log "[STEP 4/4] Starting Nominatim geocoding service..."

# Update docker-compose to use downloaded file
export PBF_PATH="$SA_PBF"
docker compose --profile geocoding up -d maps_nominatim
log "Nominatim service starting (import takes 1-2 hours)"

# =============================================================================
# Summary
# =============================================================================
log ""
log "=============================================="
log "Setup Complete!"
log "=============================================="
log ""
log "Services Status:"
docker ps --filter "name=maps" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | tee -a "$MAIN_LOG"
log ""
log "Logs saved to: $LOG_DIR"
log ""
log "To check OSRM status:  curl http://localhost:5024/health"
log "To check Nominatim:    curl http://localhost:5025/status"
log "To check Maps API:     curl http://localhost:5020/api/navigation/status"
log ""
log "=============================================="
