#!/bin/bash
# Check Pleiades import status

PROGRESS_FILE="/home/geektrading/maps/data/pleiades/import_progress.json"
LOG_FILE="/home/geektrading/maps/data/pleiades/import.log"

echo "======================================"
echo "  Pleiades Import Status"
echo "======================================"
echo ""

# Check if process is running
PID=$(pgrep -f "import_pleiades_batches.py")
if [ -n "$PID" ]; then
    echo "Status: RUNNING (PID: $PID)"
else
    echo "Status: NOT RUNNING"
fi
echo ""

# Show progress
if [ -f "$PROGRESS_FILE" ]; then
    echo "Progress:"
    echo "  Batches imported: $(jq '.imported_batches' $PROGRESS_FILE)/343"
    echo "  Places imported: $(jq '.imported_places' $PROGRESS_FILE)"
    echo "  Names imported: $(jq '.imported_names' $PROGRESS_FILE)"
    echo "  Errors: $(jq '.errors' $PROGRESS_FILE)"
    echo "  Last import: $(jq -r '.last_import_time' $PROGRESS_FILE)"
    echo "  Completed: $(jq '.completed' $PROGRESS_FILE)"

    # Calculate remaining time
    REMAINING=$((343 - $(jq '.imported_batches' $PROGRESS_FILE)))
    ETA_HOURS=$(echo "scale=1; $REMAINING * 120 / 3600" | bc)
    echo "  ETA: ~${ETA_HOURS} hours ($REMAINING batches remaining)"
fi
echo ""

# Show last few log lines
echo "Recent log entries:"
echo "--------------------------------------"
tail -5 "$LOG_FILE" 2>/dev/null || echo "No log file found"
echo ""

# Show database counts
echo "Database totals:"
echo "--------------------------------------"
curl -s http://localhost:5020/api/stats | jq '.'
