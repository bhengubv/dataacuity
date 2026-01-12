#!/bin/bash
# OSM POI Update Script - runs weekly
# Logs to /var/log/maps-poi-update.log

LOG="/var/log/maps-poi-update.log"
SCRIPT="/home/geektrading/maps/scripts/osm-poi-import.py"

echo "$(date): Starting OSM POI update..." >> $LOG
python3 $SCRIPT >> $LOG 2>&1
echo "$(date): OSM POI update complete" >> $LOG
echo "" >> $LOG
