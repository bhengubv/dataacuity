#!/bin/bash
# =============================================================================
# OSRM Global Setup Script
# Downloads and processes worldwide OSM data for routing
# Uses rate limiting and batched processing to avoid being blocked
# =============================================================================

set -e

OSRM_DATA_DIR="/home/geektrading/maps/osrm-data"
DOWNLOAD_BASE="https://download.geofabrik.de"

# Rate limiting settings
RATE_LIMIT="500k"           # Limit download speed to 500KB/s
DELAY_BETWEEN_FILES="120"   # 2 minutes between continent downloads
RETRY_WAIT="60"             # Wait 60 seconds between retries
MAX_RETRIES="5"             # Maximum retries per file

# Processing settings
THREADS="${OSRM_THREADS:-4}"
MEMORY="4g"

# Geofabrik continent/region files
# Using continents for manageable file sizes
declare -A REGIONS=(
    # Africa (~1.8GB)
    ["africa"]="africa-latest.osm.pbf"
    # Asia (~10GB - large!)
    ["asia"]="asia-latest.osm.pbf"
    # Australia/Oceania (~800MB)
    ["australia-oceania"]="australia-oceania-latest.osm.pbf"
    # Central America (~400MB)
    ["central-america"]="central-america-latest.osm.pbf"
    # Europe (~25GB - very large!)
    ["europe"]="europe-latest.osm.pbf"
    # North America (~12GB)
    ["north-america"]="north-america-latest.osm.pbf"
    # South America (~2GB)
    ["south-america"]="south-america-latest.osm.pbf"
)

# Smaller alternative: Download by country/subregion
# This takes longer but uses less disk space per file
declare -A PRIORITY_COUNTRIES=(
    # High priority - likely user base
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
    ["china"]="asia/china-latest.osm.pbf"
)

# Function to download with rate limiting
download_region() {
    local name="$1"
    local path="$2"
    local url="${DOWNLOAD_BASE}/${path}"
    local output="${OSRM_DATA_DIR}/${name}.osm.pbf"

    if [ -f "$output" ]; then
        echo "  [SKIP] Already downloaded: $name"
        return 0
    fi

    echo "  [DOWNLOAD] $name from $url"
    echo "  Rate limit: ${RATE_LIMIT}/s"

    wget \
        --limit-rate="$RATE_LIMIT" \
        --tries="$MAX_RETRIES" \
        --waitretry="$RETRY_WAIT" \
        --retry-connrefused \
        --continue \
        --progress=bar:force \
        --user-agent="DataAcuity Maps Service (maps@dataacuity.co.za)" \
        --output-document="$output" \
        "$url" || {
            echo "  [ERROR] Failed to download $name"
            rm -f "$output"  # Remove partial file
            return 1
        }

    echo "  [DONE] Downloaded $name"
}

# Function to process a region for OSRM
process_region() {
    local name="$1"
    local input="${OSRM_DATA_DIR}/${name}.osm.pbf"
    local output="${OSRM_DATA_DIR}/${name}.osrm"

    if [ -f "$output" ]; then
        echo "  [SKIP] Already processed: $name"
        return 0
    fi

    if [ ! -f "$input" ]; then
        echo "  [ERROR] Input file not found: $input"
        return 1
    fi

    echo "  [PROCESS] Extracting $name..."
    docker run --rm \
        --memory="$MEMORY" \
        --cpus="$THREADS" \
        -v "$OSRM_DATA_DIR:/data" \
        osrm/osrm-backend:latest \
        osrm-extract -p /opt/car.lua /data/${name}.osm.pbf

    sleep 5

    echo "  [PROCESS] Partitioning $name..."
    docker run --rm \
        --memory="$MEMORY" \
        --cpus="$THREADS" \
        -v "$OSRM_DATA_DIR:/data" \
        osrm/osrm-backend:latest \
        osrm-partition /data/${name}.osrm

    sleep 5

    echo "  [PROCESS] Customizing $name..."
    docker run --rm \
        --memory="$MEMORY" \
        --cpus="$THREADS" \
        -v "$OSRM_DATA_DIR:/data" \
        osrm/osrm-backend:latest \
        osrm-customize /data/${name}.osrm

    echo "  [DONE] Processed $name"
}

# Main script
echo "=============================================="
echo "OSRM Global Setup"
echo "=============================================="
echo ""
echo "This script downloads and processes worldwide"
echo "OpenStreetMap data for routing."
echo ""
echo "Settings:"
echo "  Rate limit: ${RATE_LIMIT}/s"
echo "  Delay between downloads: ${DELAY_BETWEEN_FILES}s"
echo "  Processing threads: ${THREADS}"
echo "  Memory limit: ${MEMORY}"
echo ""

mkdir -p "$OSRM_DATA_DIR"

# Check mode
MODE="${1:-priority}"

case "$MODE" in
    "priority")
        echo "Mode: Priority countries (smaller, faster)"
        echo "=============================================="
        echo ""

        total=${#PRIORITY_COUNTRIES[@]}
        count=0

        for name in "${!PRIORITY_COUNTRIES[@]}"; do
            count=$((count + 1))
            path="${PRIORITY_COUNTRIES[$name]}"

            echo ""
            echo "[$count/$total] Region: $name"
            echo "----------------------------------------------"

            # Download
            download_region "$name" "$path"

            # Process
            process_region "$name"

            # Delay before next (except last)
            if [ $count -lt $total ]; then
                echo ""
                echo "Waiting ${DELAY_BETWEEN_FILES}s before next region..."
                sleep "$DELAY_BETWEEN_FILES"
            fi
        done
        ;;

    "continents")
        echo "Mode: Full continents (larger, complete)"
        echo "WARNING: This requires ~50GB+ disk space!"
        echo "=============================================="
        echo ""

        total=${#REGIONS[@]}
        count=0

        for name in "${!REGIONS[@]}"; do
            count=$((count + 1))
            file="${REGIONS[$name]}"

            echo ""
            echo "[$count/$total] Continent: $name"
            echo "----------------------------------------------"

            # Download
            download_region "$name" "$file"

            # Process
            process_region "$name"

            # Delay before next
            if [ $count -lt $total ]; then
                echo ""
                echo "Waiting ${DELAY_BETWEEN_FILES}s before next continent..."
                sleep "$DELAY_BETWEEN_FILES"
            fi
        done
        ;;

    "single")
        # Download and process a single region
        # Usage: ./setup-osrm-global.sh single south-africa africa/south-africa-latest.osm.pbf
        name="$2"
        path="$3"

        if [ -z "$name" ] || [ -z "$path" ]; then
            echo "Usage: $0 single <name> <geofabrik-path>"
            echo "Example: $0 single south-africa africa/south-africa-latest.osm.pbf"
            exit 1
        fi

        echo "Mode: Single region ($name)"
        echo "=============================================="

        download_region "$name" "$path"
        process_region "$name"
        ;;

    *)
        echo "Usage: $0 [priority|continents|single <name> <path>]"
        echo ""
        echo "Modes:"
        echo "  priority   - Download priority countries (default)"
        echo "  continents - Download full continents"
        echo "  single     - Download a single region"
        exit 1
        ;;
esac

echo ""
echo "=============================================="
echo "OSRM setup complete!"
echo ""
echo "Available regions:"
ls -lh "$OSRM_DATA_DIR"/*.osrm 2>/dev/null || echo "(none yet)"
echo ""
echo "To start OSRM for a specific region:"
echo "  docker run -d --name osrm_<region> \\"
echo "    -p 5024:5000 \\"
echo "    -v $OSRM_DATA_DIR:/data \\"
echo "    osrm/osrm-backend:latest \\"
echo "    osrm-routed --algorithm mld /data/<region>.osrm"
echo "=============================================="
