#!/bin/bash
# SA Transit Data Hub Setup Script

set -e

echo "==================================="
echo "SA Transit Data Hub Setup"
echo "==================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check for required tools
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker is required but not installed.${NC}" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || echo -e "${YELLOW}Warning: psql not found. Some manual steps may be needed.${NC}"

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-maps}"
DB_USER="${DB_USER:-maps}"
DB_PASS="${MAPS_DB_PASSWORD:-maps_secret_2024}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "\n${GREEN}Step 1: Applying transit schema to database...${NC}"

# Apply schema
export PGPASSWORD="$DB_PASS"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$PROJECT_DIR/db/schema.sql" 2>/dev/null; then
    echo "Schema applied successfully"
else
    echo -e "${YELLOW}Could not apply schema via psql. Trying via docker...${NC}"
    docker exec -i maps_db psql -U "$DB_USER" -d "$DB_NAME" < "$PROJECT_DIR/db/schema.sql" || {
        echo -e "${RED}Failed to apply schema. Please apply manually:${NC}"
        echo "  psql -h localhost -p 5433 -U maps -d maps -f $PROJECT_DIR/db/schema.sql"
    }
fi

echo -e "\n${GREEN}Step 2: Building Transit API container...${NC}"
cd /home/geektrading/maps
docker compose build transit_api

echo -e "\n${GREEN}Step 3: Starting Transit API...${NC}"
docker compose up -d transit_api

echo -e "\n${GREEN}Step 4: Waiting for API to be ready...${NC}"
sleep 5

# Check health
if curl -s http://localhost:5030/health | grep -q "healthy"; then
    echo -e "${GREEN}Transit API is healthy!${NC}"
else
    echo -e "${YELLOW}API may still be starting up...${NC}"
fi

echo -e "\n${GREEN}==================================="
echo "Setup Complete!"
echo "==================================="
echo ""
echo "Transit API: http://localhost:5030"
echo "API Docs:    http://localhost:5030/docs"
echo ""
echo "Next steps:"
echo "1. Import GTFS feeds:"
echo "   python3 scripts/import-gtfs.py --feed gautrain --source-id 1"
echo ""
echo "2. Parse PDF schedules:"
echo "   python3 scripts/parse-pdf-schedule.py --pdf schedule.pdf --source-id 3 --parser metrorail"
echo ""
echo "3. Sync from TagMe:"
echo "   python3 scripts/tagme-sync.py"
echo "==================================="
