#!/bin/bash
# =============================================================================
# Nominatim Global Setup Script
# Downloads planet data for worldwide geocoding
# Uses rate limiting to avoid being blocked
# =============================================================================

set -e

NOMINATIM_DATA_DIR="/home/geektrading/maps/nominatim-data"

# Rate limiting settings
RATE_LIMIT="1M"              # 1MB/s - Nominatim planet file is huge
DELAY_BETWEEN_FILES="300"    # 5 minutes between region downloads
RETRY_WAIT="120"             # 2 minutes between retries
MAX_RETRIES="10"             # More retries for large files

# Options:
# 1. Full planet (~70GB) - Complete worldwide coverage
# 2. Priority countries - Smaller, faster setup

# Geofabrik download URLs for priority countries
DOWNLOAD_BASE="https://download.geofabrik.de"

declare -A PRIORITY_REGIONS=(
    ["south-africa"]="africa/south-africa-latest.osm.pbf"
    ["united-kingdom"]="europe/great-britain-latest.osm.pbf"
    ["united-states"]="north-america/us-latest.osm.pbf"
    ["germany"]="europe/germany-latest.osm.pbf"
    ["france"]="europe/france-latest.osm.pbf"
    ["netherlands"]="europe/netherlands-latest.osm.pbf"
    ["australia"]="australia-oceania/australia-latest.osm.pbf"
    ["canada"]="north-america/canada-latest.osm.pbf"
    ["brazil"]="south-america/brazil-latest.osm.pbf"
    ["india"]="asia/india-latest.osm.pbf"
    ["japan"]="asia/japan-latest.osm.pbf"
)

download_with_rate_limit() {
    local url="$1"
    local output="$2"

    echo "Downloading: $url"
    echo "Rate limit: ${RATE_LIMIT}/s"

    wget \
        --limit-rate="$RATE_LIMIT" \
        --tries="$MAX_RETRIES" \
        --waitretry="$RETRY_WAIT" \
        --retry-connrefused \
        --continue \
        --progress=bar:force \
        --user-agent="DataAcuity Maps Service (maps@dataacuity.co.za)" \
        --output-document="$output" \
        "$url"
}

echo "=============================================="
echo "Nominatim Global Setup"
echo "=============================================="
echo ""
echo "Options:"
echo "  1. priority  - Priority countries (~15GB total)"
echo "  2. planet    - Full planet file (~70GB)"
echo ""

MODE="${1:-priority}"
mkdir -p "$NOMINATIM_DATA_DIR"

case "$MODE" in
    "priority")
        echo "Mode: Priority countries"
        echo "=============================================="
        echo ""
        echo "This will download OSM data for priority countries"
        echo "and import them into Nominatim one by one."
        echo ""

        # Create a merged PBF file from priority countries
        MERGED_FILE="$NOMINATIM_DATA_DIR/priority-merged.osm.pbf"

        if [ -f "$MERGED_FILE" ]; then
            echo "Merged file already exists, skipping downloads"
        else
            # Download each region
            count=0
            total=${#PRIORITY_REGIONS[@]}

            for region in "${!PRIORITY_REGIONS[@]}"; do
                count=$((count + 1))
                path="${PRIORITY_REGIONS[$region]}"
                output="$NOMINATIM_DATA_DIR/${region}.osm.pbf"

                echo ""
                echo "[$count/$total] Downloading: $region"
                echo "----------------------------------------------"

                if [ -f "$output" ]; then
                    echo "Already downloaded, skipping"
                else
                    download_with_rate_limit "${DOWNLOAD_BASE}/${path}" "$output"

                    if [ $count -lt $total ]; then
                        echo "Waiting ${DELAY_BETWEEN_FILES}s before next..."
                        sleep "$DELAY_BETWEEN_FILES"
                    fi
                fi
            done

            echo ""
            echo "Merging PBF files..."
            echo "=============================================="

            # Use osmium to merge files (if available)
            if command -v osmium &> /dev/null; then
                osmium merge "$NOMINATIM_DATA_DIR"/*.osm.pbf -o "$MERGED_FILE"
            else
                # Use osmconvert via Docker
                docker run --rm \
                    -v "$NOMINATIM_DATA_DIR:/data" \
                    stefda/osmconvert \
                    osmconvert /data/*.osm.pbf -o=/data/priority-merged.osm.pbf
            fi
        fi

        echo ""
        echo "Starting Nominatim import..."
        echo "This will take several hours."
        echo "=============================================="

        # Update docker-compose to use merged file
        export NOMINATIM_PBF_PATH="$MERGED_FILE"
        ;;

    "planet")
        echo "Mode: Full planet"
        echo "=============================================="
        echo ""
        echo "WARNING: This downloads ~70GB and requires"
        echo "~500GB disk space for the database!"
        echo ""

        PLANET_URL="https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf"
        PLANET_FILE="$NOMINATIM_DATA_DIR/planet-latest.osm.pbf"

        if [ -f "$PLANET_FILE" ]; then
            echo "Planet file already exists"
        else
            echo "Downloading planet file (~70GB)..."
            echo "This will take many hours at rate-limited speed."

            download_with_rate_limit "$PLANET_URL" "$PLANET_FILE"
        fi

        export NOMINATIM_PBF_PATH="$PLANET_FILE"
        ;;

    *)
        echo "Usage: $0 [priority|planet]"
        exit 1
        ;;
esac

echo ""
echo "=============================================="
echo "Starting Nominatim container..."
echo "=============================================="

# Start Nominatim with the downloaded data
cd /home/geektrading/maps

# Create custom Nominatim config for imported data
cat > /home/geektrading/maps/nominatim-import.env << EOF
# Nominatim import configuration
PBF_PATH=/nominatim/data/$(basename "$NOMINATIM_PBF_PATH")
REPLICATION_URL=https://planet.openstreetmap.org/replication/day
IMPORT_STYLE=full
THREADS=4
EOF

echo ""
echo "Nominatim setup prepared!"
echo ""
echo "To start the import, run:"
echo "  cd /home/geektrading/maps"
echo "  docker compose --profile geocoding up -d"
echo ""
echo "Monitor progress with:"
echo "  docker logs -f maps_nominatim"
echo "=============================================="
