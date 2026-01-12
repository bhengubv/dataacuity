#!/bin/bash
# =============================================================================
# OSRM Setup Script for South Africa
# Downloads and processes OSM data for routing with rate limiting
# =============================================================================

set -e

OSRM_DATA_DIR="/home/geektrading/maps/osrm-data"
OSM_FILE="south-africa-latest.osm.pbf"
DOWNLOAD_URL="https://download.geofabrik.de/africa/${OSM_FILE}"

# Rate limiting settings
RATE_LIMIT="500k"  # Limit download speed to 500KB/s to avoid being blocked
RETRY_WAIT="30"    # Wait 30 seconds between retries
MAX_RETRIES="5"    # Maximum number of retries

# Processing settings (for batched processing)
THREADS="${OSRM_THREADS:-4}"  # Number of threads for processing

echo "=============================================="
echo "OSRM Setup for South Africa"
echo "=============================================="
echo "Rate limit: ${RATE_LIMIT}/s"
echo "Processing threads: ${THREADS}"
echo ""

mkdir -p "$OSRM_DATA_DIR"
cd "$OSRM_DATA_DIR"

# Download OSM data if not exists (with rate limiting)
if [ ! -f "$OSM_FILE" ]; then
    echo "Downloading South Africa OSM data (~180MB) with rate limiting..."
    echo "This may take longer but prevents getting blocked."
    echo ""

    wget \
        --limit-rate="$RATE_LIMIT" \
        --tries="$MAX_RETRIES" \
        --waitretry="$RETRY_WAIT" \
        --retry-connrefused \
        --continue \
        --progress=dot:giga \
        --user-agent="DataAcuity Maps Service (maps@dataacuity.co.za)" \
        "$DOWNLOAD_URL"
else
    echo "OSM file already exists, skipping download"
fi

# Check if already processed
if [ -f "south-africa-latest.osrm" ]; then
    echo "OSRM data already processed"
    echo "To reprocess, delete south-africa-latest.osrm* files"
    exit 0
fi

echo ""
echo "Processing OSM data for routing..."
echo "This takes 10-20 minutes depending on CPU."
echo ""

# Extract - parse OSM data (with thread limiting)
echo "[1/3] Extracting..."
docker run --rm \
    --memory="2g" \
    --cpus="$THREADS" \
    -v "$OSRM_DATA_DIR:/data" \
    osrm/osrm-backend:latest \
    osrm-extract -p /opt/car.lua /data/$OSM_FILE

# Small delay between processing steps to avoid resource spikes
sleep 5

# Partition - prepare for MLD algorithm
echo "[2/3] Partitioning..."
docker run --rm \
    --memory="2g" \
    --cpus="$THREADS" \
    -v "$OSRM_DATA_DIR:/data" \
    osrm/osrm-backend:latest \
    osrm-partition /data/south-africa-latest.osrm

sleep 5

# Customize - finalize routing data
echo "[3/3] Customizing..."
docker run --rm \
    --memory="2g" \
    --cpus="$THREADS" \
    -v "$OSRM_DATA_DIR:/data" \
    osrm/osrm-backend:latest \
    osrm-customize /data/south-africa-latest.osrm

echo ""
echo "=============================================="
echo "OSRM setup complete!"
echo "Start the routing service with:"
echo "  cd /home/geektrading/maps"
echo "  docker compose --profile routing up -d"
echo "=============================================="
