#!/bin/bash
# =============================================================================
# Setup Offline Map Tiles for South Africa
# Downloads vector tiles (MBTiles format) for offline use
# =============================================================================

set -e

TILES_DIR="/home/geektrading/maps/tiles"
LOG_FILE="/tmp/tiles-setup.log"

echo "=============================================="
echo "Setting up Offline Map Tiles"
echo "=============================================="
exec > >(tee -a "$LOG_FILE") 2>&1

# Rate limiting settings
RATE_LIMIT="500k"

# Download OpenMapTiles for South Africa
# Using Protomaps free tiles (PMTiles format - more efficient)
echo ""
echo "[1/4] Downloading South Africa map tiles..."
echo "Source: Protomaps (free, open data)"

# Protomaps provides free planet tiles, we'll extract SA region
# Alternative: OpenMapTiles (requires registration for large areas)

cd "$TILES_DIR"

# Download using planetiler extract for South Africa
# Bounding box: South Africa roughly -35 to -22 lat, 16 to 33 lon
if [ ! -f "south-africa.pmtiles" ]; then
    echo "Downloading South Africa tiles from Protomaps..."
    # Protomaps provides regional extracts
    wget --limit-rate=$RATE_LIMIT \
         --retry-connrefused --waitretry=30 --read-timeout=60 \
         -O south-africa.pmtiles \
         "https://build.protomaps.com/20231231/south-africa.pmtiles" 2>&1 || {
        echo "Protomaps download failed, trying alternative source..."
        # Alternative: Use OpenFreeMap tiles
        wget --limit-rate=$RATE_LIMIT \
             --retry-connrefused --waitretry=30 --read-timeout=60 \
             -O south-africa.mbtiles \
             "https://data.openmaptiles.org/extracts/africa/south-africa.mbtiles" 2>&1 || {
            echo "Will use online tile fallback"
        }
    }
else
    echo "Tiles already downloaded"
fi

# Download fonts for map labels
echo ""
echo "[2/4] Downloading map fonts..."
cd "$TILES_DIR/fonts"

if [ ! -d "Open Sans Regular" ]; then
    # Download Noto Sans fonts (supports multiple languages)
    wget -q --limit-rate=$RATE_LIMIT \
         "https://github.com/openmaptiles/fonts/releases/download/v3.0/v3.0.zip" \
         -O fonts.zip 2>/dev/null && unzip -q -o fonts.zip && rm fonts.zip || {
        echo "Font download failed, using system fonts"
    }
else
    echo "Fonts already downloaded"
fi

# Download sprites (map icons)
echo ""
echo "[3/4] Downloading map sprites/icons..."
cd "$TILES_DIR/sprites"

if [ ! -f "sprite.json" ]; then
    # Download OpenMapTiles sprites
    wget -q --limit-rate=$RATE_LIMIT \
         "https://github.com/openmaptiles/osm-bright-gl-style/raw/master/sprite.png" \
         -O sprite.png 2>/dev/null || echo "Sprite download failed"
    wget -q --limit-rate=$RATE_LIMIT \
         "https://github.com/openmaptiles/osm-bright-gl-style/raw/master/sprite.json" \
         -O sprite.json 2>/dev/null || echo "Sprite JSON download failed"
    wget -q --limit-rate=$RATE_LIMIT \
         "https://github.com/openmaptiles/osm-bright-gl-style/raw/master/sprite@2x.png" \
         -O sprite@2x.png 2>/dev/null || echo "Sprite 2x download failed"
    wget -q --limit-rate=$RATE_LIMIT \
         "https://github.com/openmaptiles/osm-bright-gl-style/raw/master/sprite@2x.json" \
         -O sprite@2x.json 2>/dev/null || echo "Sprite 2x JSON download failed"
else
    echo "Sprites already downloaded"
fi

# Create tile server config
echo ""
echo "[4/4] Creating tile server configuration..."
cd "$TILES_DIR"

cat > config.json << 'EOF'
{
  "options": {
    "paths": {
      "root": "/data",
      "fonts": "fonts",
      "sprites": "sprites",
      "mbtiles": ""
    }
  },
  "styles": {
    "basic": {
      "style": "styles/basic.json",
      "tilejson": {
        "name": "Basic",
        "description": "Basic map style for South Africa"
      }
    },
    "bright": {
      "style": "styles/bright.json"
    },
    "dark": {
      "style": "styles/dark.json"
    }
  },
  "data": {
    "south-africa": {
      "mbtiles": "south-africa.mbtiles"
    }
  }
}
EOF

# Create basic style
mkdir -p "$TILES_DIR/styles"
cat > "$TILES_DIR/styles/basic.json" << 'EOF'
{
  "version": 8,
  "name": "Basic",
  "sources": {
    "openmaptiles": {
      "type": "vector",
      "url": "mbtiles://{south-africa}"
    }
  },
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
      "id": "landcover",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "landcover",
      "paint": {"fill-color": "#d8e8c8", "fill-opacity": 0.5}
    },
    {
      "id": "roads",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "paint": {"line-color": "#ffffff", "line-width": 1}
    },
    {
      "id": "buildings",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "building",
      "paint": {"fill-color": "#d9d0c9"}
    },
    {
      "id": "place-labels",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "layout": {
        "text-field": "{name}",
        "text-font": ["Open Sans Regular"],
        "text-size": 12
      }
    }
  ]
}
EOF

echo ""
echo "=============================================="
echo "Tiles Setup Complete!"
echo "=============================================="
echo ""
ls -lh "$TILES_DIR"/*.mbtiles "$TILES_DIR"/*.pmtiles 2>/dev/null || echo "No tile files downloaded yet"
echo ""
echo "Tile server will serve from: http://localhost:5021"
