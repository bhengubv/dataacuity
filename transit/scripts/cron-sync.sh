#!/bin/bash
# SA Transit Data Hub - Scheduled Sync Script
# Run via cron: 0 */4 * * * /home/geektrading/transit/scripts/cron-sync.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/transit-sync.log"
LOCK_FILE="/tmp/transit-sync.lock"

# Prevent concurrent runs
exec 200>"$LOCK_FILE"
flock -n 200 || { echo "Another sync is running" >> "$LOG_FILE"; exit 1; }

export DATABASE_URL="${DATABASE_URL:-postgresql://maps:maps_secret_2024@localhost:5433/maps}"
export TAGME_API_URL="${TAGME_API_URL:-http://localhost:5023}"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting transit sync" >> "$LOG_FILE"

# Sync from TagMe
cd "$SCRIPT_DIR"
python3 tagme-sync.py >> "$LOG_FILE" 2>&1

# Generate report
python3 tagme-sync.py --report >> "$LOG_FILE" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') - Sync complete" >> "$LOG_FILE"
