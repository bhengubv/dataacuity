#!/usr/bin/env python3
"""
WhereIsMyTransport API Integration
Sync transit data from WhereIsMyTransport platform

WhereIsMyTransport provides:
- 657 minibus taxi routes in Cape Town alone
- 8,870 km coverage
- Real-time vehicle tracking capable

API Documentation: https://platform.whereismytransport.com/docs
Contact: sales@whereismytransport.com for API access
"""

import os
import sys
import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

import asyncpg
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://maps:maps_secret_2024@localhost:5433/maps")
WIMT_CLIENT_ID = os.getenv("WIMT_CLIENT_ID", "")
WIMT_CLIENT_SECRET = os.getenv("WIMT_CLIENT_SECRET", "")

# WhereIsMyTransport API endpoints
WIMT_AUTH_URL = "https://identity.whereismytransport.com/connect/token"
WIMT_API_BASE = "https://platform.whereismytransport.com/api"

# Data source ID for WhereIsMyTransport
WIMT_SOURCE_ID = 19  # As per data_sources table


@dataclass
class WIMTAgency:
    """WhereIsMyTransport agency data"""
    id: str
    name: str
    culture: str


@dataclass
class WIMTRoute:
    """WhereIsMyTransport route data"""
    id: str
    agency_id: str
    short_name: str
    long_name: str
    mode: str
    color: Optional[str]
    geometry: Optional[Dict]


@dataclass
class WIMTStop:
    """WhereIsMyTransport stop data"""
    id: str
    name: str
    lat: float
    lon: float
    modes: List[str]


class WhereIsMyTransportSync:
    """Sync transit data from WhereIsMyTransport API"""

    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
        self.access_token: Optional[str] = None
        self.token_expires: Optional[datetime] = None
        self.http_client: Optional[httpx.AsyncClient] = None
        self.stats = {
            "agencies": 0,
            "routes": 0,
            "stops": 0,
            "errors": 0
        }

    async def __aenter__(self):
        self.http_client = httpx.AsyncClient(timeout=30.0)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.http_client:
            await self.http_client.aclose()

    async def authenticate(self) -> bool:
        """Authenticate with WhereIsMyTransport API"""
        if not WIMT_CLIENT_ID or not WIMT_CLIENT_SECRET:
            logger.error("WIMT_CLIENT_ID and WIMT_CLIENT_SECRET environment variables required")
            logger.info("Contact sales@whereismytransport.com to obtain API credentials")
            return False

        try:
            response = await self.http_client.post(
                WIMT_AUTH_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": WIMT_CLIENT_ID,
                    "client_secret": WIMT_CLIENT_SECRET,
                    "scope": "transitapi:all"
                }
            )
            response.raise_for_status()

            token_data = response.json()
            self.access_token = token_data["access_token"]
            expires_in = token_data.get("expires_in", 3600)
            self.token_expires = datetime.now() + timedelta(seconds=expires_in - 60)

            logger.info("Successfully authenticated with WhereIsMyTransport API")
            return True

        except httpx.HTTPError as e:
            logger.error(f"Authentication failed: {e}")
            return False

    async def _ensure_token(self):
        """Ensure we have a valid access token"""
        if not self.access_token or datetime.now() >= self.token_expires:
            if not await self.authenticate():
                raise Exception("Failed to authenticate with WhereIsMyTransport")

    async def _api_request(self, endpoint: str, params: Dict = None) -> Dict:
        """Make authenticated API request"""
        await self._ensure_token()

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json"
        }

        url = f"{WIMT_API_BASE}{endpoint}"
        response = await self.http_client.get(url, headers=headers, params=params)
        response.raise_for_status()

        return response.json()

    async def get_agencies(self, bbox: str = None) -> List[Dict]:
        """
        Get transit agencies

        Args:
            bbox: Bounding box filter "sw_lat,sw_lng,ne_lat,ne_lng"
        """
        params = {}
        if bbox:
            params["bbox"] = bbox

        try:
            data = await self._api_request("/agencies", params)
            return data.get("agencies", [])
        except httpx.HTTPError as e:
            logger.error(f"Failed to get agencies: {e}")
            return []

    async def get_routes(self, agency_id: str, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get routes for an agency"""
        params = {
            "agencies": agency_id,
            "limit": limit,
            "offset": offset
        }

        try:
            data = await self._api_request("/routes", params)
            return data.get("routes", [])
        except httpx.HTTPError as e:
            logger.error(f"Failed to get routes for agency {agency_id}: {e}")
            return []

    async def get_stops(self, bbox: str = None, limit: int = 1000) -> List[Dict]:
        """
        Get stops within a bounding box

        Args:
            bbox: Bounding box "sw_lat,sw_lng,ne_lat,ne_lng"
        """
        params = {"limit": limit}
        if bbox:
            params["point"] = bbox  # API uses different param name

        try:
            data = await self._api_request("/stops", params)
            return data.get("stops", [])
        except httpx.HTTPError as e:
            logger.error(f"Failed to get stops: {e}")
            return []

    async def get_route_geometry(self, route_id: str) -> Optional[Dict]:
        """Get geometry for a specific route"""
        try:
            data = await self._api_request(f"/routes/{route_id}/geometry")
            return data
        except httpx.HTTPError as e:
            logger.error(f"Failed to get geometry for route {route_id}: {e}")
            return None

    async def sync_agency(self, agency_id: str):
        """
        Sync all routes and stops for an agency

        Args:
            agency_id: WhereIsMyTransport agency ID
        """
        logger.info(f"Syncing agency {agency_id}...")

        # Get all routes for agency (paginated)
        all_routes = []
        offset = 0
        limit = 100

        while True:
            routes = await self.get_routes(agency_id, limit=limit, offset=offset)
            if not routes:
                break
            all_routes.extend(routes)
            offset += limit
            if len(routes) < limit:
                break

        logger.info(f"Found {len(all_routes)} routes for agency {agency_id}")

        # Import routes to database
        async with self.db_pool.acquire() as conn:
            for route in all_routes:
                try:
                    await self._import_route(conn, route)
                    self.stats["routes"] += 1
                except Exception as e:
                    logger.error(f"Failed to import route {route.get('id')}: {e}")
                    self.stats["errors"] += 1

    async def _import_route(self, conn, route_data: Dict):
        """Import a single route to database"""
        route_id = route_data.get("id", "")
        agency_id = route_data.get("agency", {}).get("id", "")

        # Map WIMT mode to GTFS route_type
        mode_mapping = {
            "Bus": 3,
            "Rail": 2,
            "LightRail": 0,
            "ShareTaxi": 3,  # Minibus taxi
            "Ferry": 4
        }
        route_type = mode_mapping.get(route_data.get("mode"), 3)

        await conn.execute("""
            INSERT INTO routes (
                route_id, data_source_id, agency_id, route_short_name,
                route_long_name, route_type, route_color, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (route_id, data_source_id) DO UPDATE SET
                route_short_name = EXCLUDED.route_short_name,
                route_long_name = EXCLUDED.route_long_name,
                updated_at = NOW()
        """,
            f"wimt_{route_id}",
            WIMT_SOURCE_ID,
            f"wimt_{agency_id}",
            route_data.get("shortName", ""),
            route_data.get("longName", route_data.get("name", "")),
            route_type,
            route_data.get("colour"),
            json.dumps({"wimt_id": route_id, "mode": route_data.get("mode")})
        )

    async def sync_stops_in_region(self, bbox: str):
        """
        Sync all stops within a bounding box

        Args:
            bbox: Bounding box "sw_lat,sw_lng,ne_lat,ne_lng"
                  e.g., Cape Town: "-34.4,18.3,-33.5,19.0"
        """
        logger.info(f"Syncing stops in region {bbox}...")

        stops = await self.get_stops(bbox=bbox, limit=5000)
        logger.info(f"Found {len(stops)} stops")

        async with self.db_pool.acquire() as conn:
            for stop in stops:
                try:
                    await self._import_stop(conn, stop)
                    self.stats["stops"] += 1
                except Exception as e:
                    logger.error(f"Failed to import stop {stop.get('id')}: {e}")
                    self.stats["errors"] += 1

    async def _import_stop(self, conn, stop_data: Dict):
        """Import a single stop to database"""
        stop_id = stop_data.get("id", "")
        geometry = stop_data.get("geometry", {})
        coords = geometry.get("coordinates", [0, 0])

        await conn.execute("""
            INSERT INTO stops (
                stop_id, data_source_id, stop_name, stop_lat, stop_lon,
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (stop_id, data_source_id) DO UPDATE SET
                stop_name = EXCLUDED.stop_name,
                updated_at = NOW()
        """,
            f"wimt_{stop_id}",
            WIMT_SOURCE_ID,
            stop_data.get("name", "Unknown Stop"),
            coords[1],  # lat
            coords[0],  # lng
            json.dumps({
                "wimt_id": stop_id,
                "modes": stop_data.get("modes", [])
            })
        )

    async def sync_cape_town(self):
        """
        Sync all transit data for Cape Town region

        Cape Town has 657 minibus taxi routes and 8,870 km coverage
        according to WhereIsMyTransport data
        """
        # Cape Town bounding box
        cape_town_bbox = "-34.4,18.3,-33.5,19.0"

        logger.info("Starting Cape Town transit data sync...")
        logger.info("This includes 657 minibus taxi routes and 8,870 km coverage")

        # Get agencies in Cape Town
        agencies = await self.get_agencies(bbox=cape_town_bbox)
        logger.info(f"Found {len(agencies)} agencies in Cape Town region")

        # Sync each agency
        for agency in agencies:
            agency_id = agency.get("id")
            agency_name = agency.get("name")
            logger.info(f"Syncing agency: {agency_name}")

            # Import agency
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO agencies (
                        agency_id, data_source_id, agency_name, agency_timezone,
                        country_code, region
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (agency_id, data_source_id) DO UPDATE SET
                        agency_name = EXCLUDED.agency_name,
                        updated_at = NOW()
                """,
                    f"wimt_{agency_id}",
                    WIMT_SOURCE_ID,
                    agency_name,
                    "Africa/Johannesburg",
                    "ZA",
                    "Western Cape"
                )
                self.stats["agencies"] += 1

            await self.sync_agency(agency_id)

        # Sync stops
        await self.sync_stops_in_region(cape_town_bbox)

        # Update data source timestamp
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE data_sources
                SET last_updated = NOW()
                WHERE id = $1
            """, WIMT_SOURCE_ID)

        logger.info("Cape Town sync complete!")
        logger.info(f"Statistics: {self.stats}")


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Sync transit data from WhereIsMyTransport")
    parser.add_argument(
        "--region",
        choices=["cape-town", "johannesburg", "durban", "pretoria"],
        default="cape-town",
        help="Region to sync"
    )
    parser.add_argument(
        "--database-url",
        default=DATABASE_URL,
        help="PostgreSQL connection URL"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be synced without making changes"
    )

    args = parser.parse_args()

    # Check credentials
    if not WIMT_CLIENT_ID or not WIMT_CLIENT_SECRET:
        print("""
WhereIsMyTransport API credentials required.

To obtain API access:
1. Contact sales@whereismytransport.com
2. Request API credentials for your use case
3. Set environment variables:
   export WIMT_CLIENT_ID="your_client_id"
   export WIMT_CLIENT_SECRET="your_client_secret"

WhereIsMyTransport provides:
- 657 minibus taxi routes in Cape Town
- 8,870 km coverage
- Real-time vehicle tracking
- Comprehensive informal transit data

Note: Commercial use requires licensing agreement
""")
        sys.exit(1)

    # Create database pool
    db_pool = await asyncpg.create_pool(args.database_url)

    try:
        async with WhereIsMyTransportSync(db_pool) as sync:
            if args.dry_run:
                print(f"Would sync region: {args.region}")
                # Just authenticate to verify credentials work
                if await sync.authenticate():
                    print("Credentials valid!")
                    agencies = await sync.get_agencies()
                    print(f"Found {len(agencies)} agencies available")
            else:
                if args.region == "cape-town":
                    await sync.sync_cape_town()
                else:
                    print(f"Region {args.region} not yet implemented")
    finally:
        await db_pool.close()


if __name__ == "__main__":
    asyncio.run(main())
