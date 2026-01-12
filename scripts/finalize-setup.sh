#!/bin/bash
# =============================================================================
# Finalize Maps Setup
# Waits for all processes to complete then starts services
# =============================================================================

echo "=============================================="
echo "Finalizing Maps Setup"
echo "=============================================="

# Wait for OSRM extraction to complete
echo "Waiting for OSRM extraction to complete..."
while docker ps | grep -q "osrm-extract"; do
    echo "  OSRM still extracting... $(date)"
    sleep 60
done
echo "OSRM extraction complete!"

# Check if extraction was successful
if [ ! -f /home/geektrading/maps/osrm-data/south-africa.osrm.ebg ]; then
    echo "ERROR: OSRM extraction failed - missing .ebg file"
    exit 1
fi

# Run partition
echo ""
echo "[2/3] Partitioning..."
docker run --rm -v "/home/geektrading/maps/osrm-data:/data" osrm/osrm-backend:latest \
    osrm-partition /data/south-africa.osrm

# Run customize
echo ""
echo "[3/3] Customizing..."
docker run --rm -v "/home/geektrading/maps/osrm-data:/data" osrm/osrm-backend:latest \
    osrm-customize /data/south-africa.osrm

# Start OSRM service
echo ""
echo "Starting OSRM routing service..."
cd /home/geektrading/maps
docker compose --profile routing up -d maps_osrm

# Start Nominatim if not already running
echo ""
echo "Starting Nominatim geocoding service..."
docker compose --profile geocoding up -d maps_nominatim

# Final status
echo ""
echo "=============================================="
echo "Setup Complete!"
echo "=============================================="
docker ps --filter "name=maps" --format "table {{.Names}}\t{{.Status}}"
echo ""
echo "Test routing: curl http://localhost:5024/route/v1/driving/-26.2041,28.0473;-33.9249,18.4241"
echo "Test geocode: curl http://localhost:5025/search?q=Johannesburg"
echo "=============================================="
