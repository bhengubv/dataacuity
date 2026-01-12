#!/bin/bash
# =============================================================================
# Check Maps Setup Status
# Run this to see progress of downloads and services
# =============================================================================

echo "=============================================="
echo "Maps Setup Status - $(date)"
echo "=============================================="
echo ""

# Check OSRM downloads
echo "📥 OSRM Downloads:"
echo "-------------------"
if pgrep -f "wget.*geofabrik.*osrm" > /dev/null || pgrep -f "setup-osrm-global" > /dev/null; then
    echo "Status: DOWNLOADING"
    tail -3 /tmp/osrm-global-setup.log 2>/dev/null | grep -E "^\[|eta|%"
else
    echo "Status: Completed or not started"
fi
echo ""
echo "Downloaded OSRM files:"
ls -lh /home/geektrading/maps/osrm-data/*.osm.pbf 2>/dev/null || echo "  (none yet)"
echo ""
echo "Processed OSRM files (ready for routing):"
ls -lh /home/geektrading/maps/osrm-data/*.osrm 2>/dev/null || echo "  (none yet)"
echo ""

# Check Nominatim downloads
echo "📥 Nominatim Downloads:"
echo "------------------------"
if pgrep -f "wget.*nominatim" > /dev/null || pgrep -f "wget.*south-africa" > /dev/null; then
    echo "Status: DOWNLOADING"
    tail -3 /tmp/nominatim-sa-download.log 2>/dev/null | grep -E "%|eta"
else
    echo "Status: Completed or not started"
fi
echo ""
echo "Downloaded Nominatim files:"
ls -lh /home/geektrading/maps/nominatim-data/*.osm.pbf 2>/dev/null || echo "  (none yet)"
echo ""

# Check Docker services
echo "🐳 Docker Services:"
echo "--------------------"
docker ps --filter "name=maps" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
echo ""

# Check service health
echo "🏥 Service Health:"
echo "-------------------"
echo -n "Maps API:    "
curl -s http://localhost:5020/api/health 2>/dev/null | grep -o '"status":"[^"]*"' || echo "Not responding"
echo ""
echo -n "OSRM:        "
curl -s http://localhost:5024/health 2>/dev/null || echo "Not running"
echo ""
echo -n "Nominatim:   "
curl -s http://localhost:5025/status 2>/dev/null | head -1 || echo "Not running"
echo ""

echo "=============================================="
echo "Run this script again to check progress:"
echo "  /home/geektrading/maps/scripts/check-status.sh"
echo "=============================================="
