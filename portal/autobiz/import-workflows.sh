#!/bin/bash
# Bulk import all AutoBiz workflows to n8n
# Usage: ./import-workflows.sh [N8N_API_KEY]

N8N_URL="http://localhost:5008/api/v1"
API_KEY="${1:-}"
WORKFLOW_DIR="/home/geektrading/portal/autobiz/workflows"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "   AutoBiz Workflow Bulk Importer"
echo "=========================================="
echo ""

# Check if API key provided
if [ -z "$API_KEY" ]; then
    echo -e "${YELLOW}No API key provided.${NC}"
    echo "To get your n8n API key:"
    echo "  1. Go to http://localhost:5008/settings/api"
    echo "  2. Create a new API key"
    echo "  3. Run: ./import-workflows.sh YOUR_API_KEY"
    echo ""
    echo "Alternatively, import via n8n CLI (see below)"
    exit 1
fi

# Test connection
echo "Testing n8n connection..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-N8N-API-KEY: $API_KEY" "$N8N_URL/workflows")

if [ "$RESPONSE" != "200" ]; then
    echo -e "${RED}Failed to connect to n8n (HTTP $RESPONSE)${NC}"
    echo "Check your API key and ensure n8n is running"
    exit 1
fi

echo -e "${GREEN}Connected to n8n!${NC}"
echo ""

# Import workflows
SUCCESS=0
FAILED=0

for category in sales operations finance admin marketing customer-service; do
    if [ -d "$WORKFLOW_DIR/$category" ]; then
        echo "Importing $category workflows..."

        for file in "$WORKFLOW_DIR/$category"/*.json; do
            if [ -f "$file" ]; then
                name=$(basename "$file" .json)

                # Import workflow
                RESULT=$(curl -s -X POST "$N8N_URL/workflows" \
                    -H "X-N8N-API-KEY: $API_KEY" \
                    -H "Content-Type: application/json" \
                    -d @"$file")

                if echo "$RESULT" | grep -q '"id"'; then
                    echo -e "  ${GREEN}✓${NC} $name"
                    ((SUCCESS++))
                else
                    echo -e "  ${RED}✗${NC} $name - $(echo $RESULT | jq -r '.message // "Unknown error"' 2>/dev/null)"
                    ((FAILED++))
                fi
            fi
        done
    fi
done

echo ""
echo "=========================================="
echo "Import Complete!"
echo -e "  ${GREEN}Success: $SUCCESS${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo "=========================================="
echo ""
echo "Next: Go to http://localhost:5008 to view your workflows"
