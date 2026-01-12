#!/bin/bash
# Standardize place_type values in the places table
# Maps GeoNames single-letter feature classes to human-readable types
# Run this script when you have time - it takes 15-30 minutes for 5.5M records

echo "Starting place_type standardization..."
echo "This will update ~5.5M records across 9 categories"
echo ""

# Function to run update and report progress
run_update() {
    local old_type=$1
    local new_type=$2
    local description=$3
    local count=$(docker exec maps_db psql -U maps -d maps -tAc "SELECT COUNT(*) FROM places WHERE place_type = '$old_type'")

    if [ "$count" -gt "0" ]; then
        echo "Updating '$old_type' -> '$new_type' ($description) - $count records..."
        time docker exec maps_db psql -U maps -d maps -c "UPDATE places SET place_type = '$new_type' WHERE place_type = '$old_type';"
        echo "Done!"
        echo ""
    else
        echo "Skipping '$old_type' -> '$new_type' (already done or no records)"
    fi
}

# Run updates in order of size (largest first)
run_update "s" "spot" "buildings, farms, schools"
run_update "h" "hydrographic" "streams, lakes, bays"
run_update "t" "terrain" "mountains, hills, rocks"
run_update "a" "administrative" "countries, states, regions"
run_update "l" "area" "parks, areas"
run_update "v" "vegetation" "forests, heath"
run_update "r" "road" "roads, railroads"
run_update "p" "settlement" "populated places"
run_update "u" "undersea" "undersea features"

echo ""
echo "Standardization complete!"
echo ""

# Show final distribution
echo "Final place_type distribution:"
docker exec maps_db psql -U maps -d maps -c "SELECT place_type, COUNT(*) as count FROM places GROUP BY place_type ORDER BY count DESC;"
