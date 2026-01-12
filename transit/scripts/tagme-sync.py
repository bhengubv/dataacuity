#!/usr/bin/env python3
"""
TagMe Integration for SA Transit Data Hub
Syncs crowdsourced taxi routes from TagMe to transit database

This script:
1. Pulls route recordings from TagMe API
2. Processes GPS traces into route geometries
3. Matches similar routes and merges them
4. Creates verified routes when enough confirmations exist
"""

import os
import sys
import json
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple
from collections import defaultdict

import asyncpg
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://maps:maps_secret_2024@localhost:5433/maps")
TAGME_API_URL = os.getenv("TAGME_API_URL", "http://tagme_api:8000")

# Thresholds for route matching
ROUTE_SIMILARITY_THRESHOLD = 0.7  # 70% overlap required
MIN_VERIFICATIONS = 3  # Minimum verifications to auto-approve
STOP_CLUSTER_RADIUS = 100  # meters


class TagMeSync:
    """Sync crowdsourced routes from TagMe"""

    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
        self.source_id = None
        self.stats = {
            "routes_fetched": 0,
            "routes_processed": 0,
            "routes_matched": 0,
            "routes_created": 0,
            "stops_created": 0
        }

    async def initialize(self):
        """Get or create the crowdsourced data source"""
        async with self.db_pool.acquire() as conn:
            self.source_id = await conn.fetchval("""
                SELECT id FROM data_sources
                WHERE source_type = 'crowdsourced' AND name = 'Crowdsourced - TagMe'
            """)

            if not self.source_id:
                self.source_id = await conn.fetchval("""
                    INSERT INTO data_sources (name, source_type, country_code)
                    VALUES ('Crowdsourced - TagMe', 'crowdsourced', 'ZA')
                    RETURNING id
                """)

    async def fetch_tagme_routes(self, since: Optional[datetime] = None) -> List[Dict]:
        """Fetch route recordings from TagMe API"""
        params = {}
        if since:
            params["since"] = since.isoformat()

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(
                    f"{TAGME_API_URL}/api/v1/routes",
                    params=params
                )
                response.raise_for_status()
                data = response.json()
                return data.get("routes", [])
        except Exception as e:
            logger.error(f"Failed to fetch from TagMe: {e}")
            return []

    async def process_route(self, route_data: Dict):
        """Process a single route from TagMe"""
        device_id = route_data.get("device_id")
        points = route_data.get("points", [])
        metadata = route_data.get("metadata", {})

        if len(points) < 10:
            logger.debug(f"Skipping route with only {len(points)} points")
            return

        async with self.db_pool.acquire() as conn:
            # Get or create contributor
            contributor_id = await self._get_or_create_contributor(conn, device_id)

            # Process GPS points into a route geometry
            route_geometry = self._points_to_linestring(points)
            stops = self._identify_stops(points)

            # Check for similar existing routes
            similar = await self._find_similar_routes(conn, route_geometry)

            if similar:
                # Increment verification count on existing route
                await conn.execute("""
                    UPDATE route_contributions
                    SET verification_count = verification_count + 1,
                        updated_at = NOW()
                    WHERE id = $1
                """, similar["id"])
                self.stats["routes_matched"] += 1

                # Check if should auto-verify
                if similar["verification_count"] + 1 >= MIN_VERIFICATIONS:
                    await self._verify_route(conn, similar["id"])
            else:
                # Create new contribution
                await conn.execute("""
                    INSERT INTO route_contributions (
                        contributor_id, route_type, route_name, route_number,
                        origin_name, destination_name, waypoints, stops,
                        fare_amount, notes, recorded_points
                    ) VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326),
                              $8, $9, $10, $11)
                """,
                    contributor_id,
                    metadata.get("route_type", "minibus_taxi"),
                    metadata.get("route_name"),
                    metadata.get("route_number"),
                    stops[0]["name"] if stops else None,
                    stops[-1]["name"] if stops else None,
                    route_geometry,
                    json.dumps([{"lat": s["lat"], "lng": s["lng"], "name": s["name"]} for s in stops]),
                    metadata.get("fare"),
                    metadata.get("notes"),
                    json.dumps(points)
                )
                self.stats["routes_created"] += 1

            # Update contributor stats
            await conn.execute("""
                UPDATE contributors
                SET contributions_count = contributions_count + 1,
                    last_contribution = NOW()
                WHERE id = $1
            """, contributor_id)

        self.stats["routes_processed"] += 1

    async def _get_or_create_contributor(self, conn, device_id: str) -> int:
        """Get or create a contributor record"""
        contributor = await conn.fetchrow(
            "SELECT id FROM contributors WHERE device_id = $1",
            device_id
        )

        if contributor:
            return contributor["id"]

        return await conn.fetchval("""
            INSERT INTO contributors (device_id, first_contribution, last_contribution)
            VALUES ($1, NOW(), NOW())
            RETURNING id
        """, device_id)

    def _points_to_linestring(self, points: List[Dict]) -> str:
        """Convert GPS points to WKT LineString"""
        coords = [f"{p['lng']} {p['lat']}" for p in points if 'lat' in p and 'lng' in p]
        return f"LINESTRING({', '.join(coords)})"

    def _identify_stops(self, points: List[Dict]) -> List[Dict]:
        """Identify probable stops from GPS trace (slow/stationary points)"""
        stops = []

        if not points:
            return stops

        # First point is origin
        stops.append({
            "lat": points[0]["lat"],
            "lng": points[0]["lng"],
            "name": f"Stop {len(stops) + 1}",
            "type": "origin"
        })

        # Find points where vehicle was stationary
        for i in range(1, len(points) - 1):
            if self._is_stop_candidate(points[i-1:i+2]):
                stops.append({
                    "lat": points[i]["lat"],
                    "lng": points[i]["lng"],
                    "name": f"Stop {len(stops) + 1}",
                    "type": "intermediate"
                })

        # Last point is destination
        stops.append({
            "lat": points[-1]["lat"],
            "lng": points[-1]["lng"],
            "name": f"Stop {len(stops) + 1}",
            "type": "destination"
        })

        return stops

    def _is_stop_candidate(self, points: List[Dict]) -> bool:
        """Check if a point is likely a stop (slow speed, dwelling)"""
        if len(points) < 3:
            return False

        # Check if speed is low
        speeds = [p.get("speed", 0) for p in points]
        avg_speed = sum(speeds) / len(speeds)

        # Check timestamps for dwelling
        if "timestamp" in points[0]:
            try:
                t0 = datetime.fromisoformat(points[0]["timestamp"])
                t2 = datetime.fromisoformat(points[2]["timestamp"])
                dwell_time = (t2 - t0).total_seconds()

                # Stopped for more than 30 seconds
                if avg_speed < 2 and dwell_time > 30:
                    return True
            except:
                pass

        return avg_speed < 1.5  # Less than 1.5 m/s

    async def _find_similar_routes(self, conn, geometry_wkt: str) -> Optional[Dict]:
        """Find existing routes that are similar to the new one"""
        result = await conn.fetchrow("""
            WITH new_route AS (
                SELECT ST_GeomFromText($1, 4326) as geom
            )
            SELECT rc.id, rc.verification_count,
                   ST_HausdorffDistance(
                       rc.waypoints::geography,
                       (SELECT geom FROM new_route)::geography
                   ) as distance
            FROM route_contributions rc, new_route
            WHERE rc.status = 'pending'
              AND ST_DWithin(
                  rc.waypoints::geography,
                  new_route.geom::geography,
                  500  -- Within 500m
              )
            ORDER BY distance
            LIMIT 1
        """, geometry_wkt)

        if result and result["distance"] < 200:  # Within 200m Hausdorff distance
            return dict(result)

        return None

    async def _verify_route(self, conn, contribution_id: int):
        """Verify a route and create official GTFS entries"""
        contribution = await conn.fetchrow("""
            SELECT * FROM route_contributions WHERE id = $1
        """, contribution_id)

        if not contribution:
            return

        # Create route in routes table
        route_id = f"CROWD-{contribution_id}"
        await conn.execute("""
            INSERT INTO routes (
                route_id, data_source_id, route_short_name, route_long_name,
                route_type, route_geometry, is_active
            ) VALUES ($1, $2, $3, $4, 3, $5, true)
            ON CONFLICT (route_id, data_source_id) DO UPDATE SET
                route_geometry = EXCLUDED.route_geometry,
                updated_at = NOW()
        """,
            route_id,
            self.source_id,
            contribution["route_number"],
            contribution["route_name"] or f"{contribution['origin_name']} - {contribution['destination_name']}",
            contribution["waypoints"]
        )

        # Create stops
        stops = json.loads(contribution["stops"]) if contribution["stops"] else []
        for i, stop in enumerate(stops):
            stop_id = f"CROWD-{contribution_id}-{i}"
            await conn.execute("""
                INSERT INTO stops (
                    stop_id, data_source_id, stop_name, stop_lat, stop_lon, is_verified
                ) VALUES ($1, $2, $3, $4, $5, true)
                ON CONFLICT (stop_id, data_source_id) DO NOTHING
            """, stop_id, self.source_id, stop.get("name", f"Stop {i+1}"),
                stop["lat"], stop["lng"])

        # Update contribution status
        await conn.execute("""
            UPDATE route_contributions
            SET status = 'verified', verified_at = NOW()
            WHERE id = $1
        """, contribution_id)

        # Award reputation to contributor
        await conn.execute("""
            UPDATE contributors
            SET reputation_score = reputation_score + 50,
                verified_contributions = verified_contributions + 1
            WHERE id = (SELECT contributor_id FROM route_contributions WHERE id = $1)
        """, contribution_id)

        logger.info(f"Verified route {contribution_id}: {contribution['route_name']}")

    async def merge_similar_routes(self):
        """Merge similar pending routes"""
        async with self.db_pool.acquire() as conn:
            # Find clusters of similar routes
            clusters = await conn.fetch("""
                WITH route_pairs AS (
                    SELECT
                        a.id as route_a,
                        b.id as route_b,
                        ST_HausdorffDistance(a.waypoints::geography, b.waypoints::geography) as distance
                    FROM route_contributions a
                    JOIN route_contributions b ON a.id < b.id
                    WHERE a.status = 'pending' AND b.status = 'pending'
                      AND ST_DWithin(a.waypoints::geography, b.waypoints::geography, 300)
                )
                SELECT route_a, route_b, distance
                FROM route_pairs
                WHERE distance < 150
                ORDER BY distance
            """)

            merged_routes = set()
            for cluster in clusters:
                if cluster["route_b"] in merged_routes:
                    continue

                # Merge route_b into route_a
                await conn.execute("""
                    UPDATE route_contributions
                    SET verification_count = verification_count + 1
                    WHERE id = $1
                """, cluster["route_a"])

                await conn.execute("""
                    UPDATE route_contributions
                    SET status = 'merged', merged_to_route_id = $2
                    WHERE id = $1
                """, cluster["route_b"], cluster["route_a"])

                merged_routes.add(cluster["route_b"])
                logger.info(f"Merged route {cluster['route_b']} into {cluster['route_a']}")

    async def sync_all(self, since: Optional[datetime] = None):
        """Run full sync from TagMe"""
        await self.initialize()

        # Fetch new routes
        routes = await self.fetch_tagme_routes(since)
        self.stats["routes_fetched"] = len(routes)
        logger.info(f"Fetched {len(routes)} routes from TagMe")

        # Process each route
        for route in routes:
            await self.process_route(route)

        # Merge similar routes
        await self.merge_similar_routes()

        # Update data source timestamp
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE data_sources SET last_updated = NOW()
                WHERE id = $1
            """, self.source_id)

        logger.info(f"Sync complete: {self.stats}")
        return self.stats


async def generate_taxi_route_report(db_pool: asyncpg.Pool):
    """Generate a report of crowdsourced taxi routes"""
    async with db_pool.acquire() as conn:
        stats = await conn.fetchrow("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'verified') as verified,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                COUNT(DISTINCT contributor_id) as contributors,
                AVG(verification_count) as avg_verifications
            FROM route_contributions
        """)

        top_routes = await conn.fetch("""
            SELECT route_name, origin_name, destination_name,
                   verification_count, upvotes, downvotes
            FROM route_contributions
            WHERE status IN ('pending', 'verified')
            ORDER BY verification_count DESC, upvotes - downvotes DESC
            LIMIT 10
        """)

        top_contributors = await conn.fetch("""
            SELECT display_name, reputation_score, contributions_count, verified_contributions
            FROM contributors
            WHERE is_banned = false
            ORDER BY reputation_score DESC
            LIMIT 10
        """)

        return {
            "summary": dict(stats) if stats else {},
            "top_routes": [dict(r) for r in top_routes],
            "top_contributors": [dict(c) for c in top_contributors]
        }


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Sync routes from TagMe")
    parser.add_argument("--since", help="Sync routes since date (YYYY-MM-DD)")
    parser.add_argument("--report", action="store_true", help="Generate report only")
    parser.add_argument("--database-url", default=DATABASE_URL)

    args = parser.parse_args()

    pool = await asyncpg.create_pool(args.database_url, min_size=2, max_size=5)

    try:
        if args.report:
            report = await generate_taxi_route_report(pool)
            print(json.dumps(report, indent=2, default=str))
        else:
            since = None
            if args.since:
                since = datetime.strptime(args.since, "%Y-%m-%d")
            else:
                # Default: last 24 hours
                since = datetime.now() - timedelta(hours=24)

            syncer = TagMeSync(pool)
            await syncer.sync_all(since)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
