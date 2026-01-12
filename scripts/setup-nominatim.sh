#!/bin/bash
# =============================================================================
# Nominatim Setup Script for South Africa
# Downloads and imports OSM data for geocoding with rate limiting
# =============================================================================

set -e

NOMINATIM_DATA_DIR="/home/geektrading/maps/nominatim-data"
OSM_FILE="south-africa-latest.osm.pbf"
DOWNLOAD_URL="https://download.geofabrik.de/africa/${OSM_FILE}"

# Rate limiting settings
RATE_LIMIT="500k"  # Limit download speed to 500KB/s to avoid being blocked
RETRY_WAIT="30"    # Wait 30 seconds between retries
MAX_RETRIES="5"    # Maximum number of retries

echo "=============================================="
echo "Nominatim Setup for South Africa"
echo "=============================================="
echo "Rate limit: ${RATE_LIMIT}/s"
echo ""

mkdir -p "$NOMINATIM_DATA_DIR"
cd "$NOMINATIM_DATA_DIR"

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

echo ""
echo "=============================================="
echo "Starting Nominatim import..."
echo "This will take 1-2 hours for South Africa data."
echo "=============================================="
echo ""

# Start Nominatim with the geocoding profile
cd /home/geektrading/maps
docker compose --profile geocoding up -d maps_nominatim

echo ""
echo "Nominatim container started."
echo "Monitor import progress with:"
echo "  docker logs -f maps_nominatim"
echo ""
echo "Once import is complete, geocoding will be available at:"
echo "  http://localhost:5025/search?q=Sandton"
echo "=============================================="
