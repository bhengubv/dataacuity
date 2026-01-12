#!/bin/bash
# =============================================================================
# Download Offline Map Tiles for South Africa
# Uses free, open data sources with rate limiting
# =============================================================================

set -e

TILES_DIR="/home/geektrading/maps/tiles"
LOG_FILE="/tmp/tiles-download.log"

echo "=============================================="
echo "Downloading Offline Map Tiles"
echo "=============================================="
exec > >(tee -a "$LOG_FILE") 2>&1

cd "$TILES_DIR"

# Rate limiting
RATE_LIMIT="500k"
DELAY=30

# Option 1: Try OpenFreeMap (fully free, daily updates)
echo ""
echo "[1/3] Downloading from OpenFreeMap (free, open)..."
echo "This provides pre-built vector tiles optimized for web display."

# OpenFreeMap provides free PMTiles for various regions
# Check for SA-specific or Africa extract
if [ ! -f "south-africa.pmtiles" ]; then
    # Try OpenFreeMap's planet extract first (they have regional extracts)
    wget --limit-rate=$RATE_LIMIT \
         --retry-connrefused --waitretry=$DELAY --read-timeout=120 \
         --tries=3 \
         -O south-africa.pmtiles.tmp \
         "https://data.source.coop/protomaps/openstreetmap/v3.10/za.pmtiles" 2>&1 && \
    mv south-africa.pmtiles.tmp south-africa.pmtiles || {
        echo "Primary download failed, trying alternative..."
        rm -f south-africa.pmtiles.tmp
    }
fi

# Option 2: Download from Protomaps (free, MIT licensed)
if [ ! -f "south-africa.pmtiles" ]; then
    echo ""
    echo "Trying Protomaps daily build..."
    wget --limit-rate=$RATE_LIMIT \
         --retry-connrefused --waitretry=$DELAY --read-timeout=120 \
         --tries=3 \
         -O africa.pmtiles.tmp \
         "https://r2-public.protomaps.com/protomaps-sample-datasets/protomaps-basemap-opensource-20230408.pmtiles" 2>&1 && \
    mv africa.pmtiles.tmp south-africa.pmtiles || {
        echo "Protomaps download failed"
        rm -f africa.pmtiles.tmp
    }
fi

# Option 3: Use OpenMapTiles from Geofabrik
if [ ! -f "south-africa.pmtiles" ] && [ ! -f "south-africa.mbtiles" ]; then
    echo ""
    echo "Trying Geofabrik OpenMapTiles..."
    # Geofabrik doesn't provide mbtiles directly, but we can use other sources
    echo "Note: For production, consider MapTiler or generating tiles from OSM data"
fi

# Download fonts (required for label rendering)
echo ""
echo "[2/3] Setting up fonts..."
mkdir -p "$TILES_DIR/fonts"
cd "$TILES_DIR/fonts"

if [ ! -d "Noto Sans Regular" ]; then
    echo "Downloading map fonts..."
    wget -q --limit-rate=$RATE_LIMIT \
         "https://github.com/openmaptiles/fonts/releases/download/v3.0/v3.0.zip" \
         -O fonts.zip 2>/dev/null && {
        unzip -q -o fonts.zip
        rm fonts.zip
        echo "Fonts downloaded successfully"
    } || echo "Font download failed (will use system fonts)"
fi

# Create style configuration
echo ""
echo "[3/3] Creating tile configuration..."
cd "$TILES_DIR"

# Create tileserver-gl config
cat > config.json << 'CONFIGEOF'
{
  "options": {
    "paths": {
      "root": "/data",
      "fonts": "fonts",
      "styles": "styles",
      "mbtiles": ""
    }
  },
  "styles": {
    "basic": {
      "style": "styles/basic.json"
    },
    "dark": {
      "style": "styles/dark.json"
    }
  },
  "data": {
    "v3": {
      "mbtiles": "south-africa.mbtiles"
    }
  }
}
CONFIGEOF

# Create basic style
mkdir -p styles
cat > styles/basic.json << 'STYLEEOF'
{
  "version": 8,
  "name": "Basic",
  "sources": {
    "openmaptiles": {
      "type": "vector",
      "url": "mbtiles://{v3}"
    }
  },
  "glyphs": "{fontstack}/{range}.pbf",
  "layers": [
    {
      "id": "background",
      "type": "background",
      "paint": {"background-color": "#f8f4f0"}
    },
    {
      "id": "water",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "water",
      "paint": {"fill-color": "#a0c8f0"}
    },
    {
      "id": "landcover-grass",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "landcover",
      "filter": ["==", "class", "grass"],
      "paint": {"fill-color": "#d8e8c8", "fill-opacity": 0.6}
    },
    {
      "id": "road-highway",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "filter": ["==", "class", "motorway"],
      "paint": {"line-color": "#ffc107", "line-width": 3}
    },
    {
      "id": "road-major",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "filter": ["in", "class", "primary", "secondary"],
      "paint": {"line-color": "#ffffff", "line-width": 2}
    },
    {
      "id": "road-minor",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "filter": ["in", "class", "tertiary", "minor"],
      "paint": {"line-color": "#ffffff", "line-width": 1}
    },
    {
      "id": "building",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "building",
      "paint": {"fill-color": "#d9d0c9", "fill-opacity": 0.7}
    },
    {
      "id": "place-city",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "filter": ["==", "class", "city"],
      "layout": {
        "text-field": "{name:latin}",
        "text-font": ["Noto Sans Regular"],
        "text-size": 14
      },
      "paint": {"text-color": "#333333"}
    },
    {
      "id": "place-town",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "filter": ["==", "class", "town"],
      "layout": {
        "text-field": "{name:latin}",
        "text-font": ["Noto Sans Regular"],
        "text-size": 12
      },
      "paint": {"text-color": "#555555"}
    }
  ]
}
STYLEEOF

# Create dark style
cat > styles/dark.json << 'DARKEOF'
{
  "version": 8,
  "name": "Dark",
  "sources": {
    "openmaptiles": {
      "type": "vector",
      "url": "mbtiles://{v3}"
    }
  },
  "glyphs": "{fontstack}/{range}.pbf",
  "layers": [
    {
      "id": "background",
      "type": "background",
      "paint": {"background-color": "#1a1a2e"}
    },
    {
      "id": "water",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "water",
      "paint": {"fill-color": "#0d1b2a"}
    },
    {
      "id": "road-highway",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "filter": ["==", "class", "motorway"],
      "paint": {"line-color": "#ffc107", "line-width": 3}
    },
    {
      "id": "road-major",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "filter": ["in", "class", "primary", "secondary"],
      "paint": {"line-color": "#4a4a6a", "line-width": 2}
    },
    {
      "id": "road-minor",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "paint": {"line-color": "#2a2a4a", "line-width": 1}
    },
    {
      "id": "building",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "building",
      "paint": {"fill-color": "#2a2a4a", "fill-opacity": 0.8}
    },
    {
      "id": "place-city",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "filter": ["==", "class", "city"],
      "layout": {
        "text-field": "{name:latin}",
        "text-font": ["Noto Sans Regular"],
        "text-size": 14
      },
      "paint": {"text-color": "#e0e0e0"}
    }
  ]
}
DARKEOF

echo ""
echo "=============================================="
echo "Tiles Setup Summary"
echo "=============================================="
ls -lh "$TILES_DIR"/*.pmtiles "$TILES_DIR"/*.mbtiles 2>/dev/null || echo "No tile files yet"
echo ""
echo "Configuration created at: $TILES_DIR/config.json"
echo "Styles created at: $TILES_DIR/styles/"
echo ""
echo "To use with tileserver-gl:"
echo "  docker run -p 8080:8080 -v $TILES_DIR:/data maptiler/tileserver-gl"
echo "=============================================="
