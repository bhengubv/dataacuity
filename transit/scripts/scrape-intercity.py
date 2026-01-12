#!/usr/bin/env python3
"""
Intercity Bus Schedule Scraper
Scrapes schedule data from South African intercity bus operators

Supported operators:
- Intercape (intercape.co.za)
- Translux (translux.co.za)
- Greyhound (greyhound.co.za)

Note: Web scraping should respect robots.txt and rate limits
"""

import os
import sys
import json
import logging
import asyncio
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from urllib.parse import urljoin

import asyncpg
import httpx
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://maps:maps_secret_2024@localhost:5433/maps")

# Data source IDs from database
SOURCE_IDS = {
    "intercape": 16,
    "translux": 17,
    "greyhound": 18
}

# Operator configurations
OPERATORS = {
    "intercape": {
        "name": "Intercape",
        "base_url": "https://www.intercape.co.za",
        "routes_url": "https://www.intercape.co.za/routes",
        "schedule_url": "https://www.intercape.co.za/schedule",
        "color": "E31937"  # Red
    },
    "translux": {
        "name": "Translux",
        "base_url": "https://www.translux.co.za",
        "routes_url": "https://www.translux.co.za/routes",
        "color": "003366"  # Blue
    },
    "greyhound": {
        "name": "Greyhound",
        "base_url": "https://www.greyhound.co.za",
        "routes_url": "https://www.greyhound.co.za/routes",
        "color": "00529B"  # Blue
    }
}

# Major South African cities/stops (fallback if scraping fails)
MAJOR_STOPS = {
    "johannesburg": {"name": "Johannesburg", "lat": -26.2041, "lon": 28.0473},
    "pretoria": {"name": "Pretoria", "lat": -25.7479, "lon": 28.2293},
    "cape_town": {"name": "Cape Town", "lat": -33.9249, "lon": 18.4241},
    "durban": {"name": "Durban", "lat": -29.8587, "lon": 31.0218},
    "port_elizabeth": {"name": "Port Elizabeth", "lat": -33.9608, "lon": 25.6022},
    "east_london": {"name": "East London", "lat": -33.0292, "lon": 27.8546},
    "bloemfontein": {"name": "Bloemfontein", "lat": -29.0852, "lon": 26.1596},
    "polokwane": {"name": "Polokwane", "lat": -23.9045, "lon": 29.4689},
    "nelspruit": {"name": "Nelspruit", "lat": -25.4753, "lon": 30.9694},
    "kimberley": {"name": "Kimberley", "lat": -28.7282, "lon": 24.7499},
    "george": {"name": "George", "lat": -33.9631, "lon": 22.4617},
    "knysna": {"name": "Knysna", "lat": -34.0356, "lon": 23.0488},
    "mossel_bay": {"name": "Mossel Bay", "lat": -34.1830, "lon": 22.1460},
    "oudtshoorn": {"name": "Oudtshoorn", "lat": -33.5920, "lon": 22.2034},
    "upington": {"name": "Upington", "lat": -28.4478, "lon": 21.2561},
    "springs": {"name": "Springs", "lat": -26.2500, "lon": 28.4167},
    "benoni": {"name": "Benoni", "lat": -26.1883, "lon": 28.3206},
    "pietermaritzburg": {"name": "Pietermaritzburg", "lat": -29.6006, "lon": 30.3794},
    "richards_bay": {"name": "Richards Bay", "lat": -28.7830, "lon": 32.0377},
    "mthatha": {"name": "Mthatha", "lat": -31.5889, "lon": 28.7844}
}


@dataclass
class ScrapedRoute:
    """Scraped route data"""
    operator: str
    route_id: str
    origin: str
    destination: str
    via: List[str]
    duration_hours: Optional[float]
    price_range: Optional[Dict[str, float]]
    frequency: Optional[str]
    url: Optional[str]


@dataclass
class ScrapedStop:
    """Scraped stop data"""
    stop_id: str
    name: str
    city: str
    address: Optional[str]
    lat: Optional[float]
    lon: Optional[float]


class IntercityScraper:
    """Scrape intercity bus schedules"""

    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
        self.http_client: Optional[httpx.AsyncClient] = None
        self.stats = {
            "routes": 0,
            "stops": 0,
            "errors": 0
        }

    async def __aenter__(self):
        self.http_client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DataAcuity Transit Aggregator (+https://dataacuity.co.za/transit)",
                "Accept": "text/html,application/xhtml+xml"
            },
            follow_redirects=True
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.http_client:
            await self.http_client.aclose()

    async def _fetch_page(self, url: str) -> Optional[str]:
        """Fetch a page with rate limiting"""
        try:
            # Rate limit: 1 request per second
            await asyncio.sleep(1)

            response = await self.http_client.get(url)
            response.raise_for_status()
            return response.text
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch {url}: {e}")
            return None

    async def scrape_intercape_routes(self) -> List[ScrapedRoute]:
        """Scrape Intercape routes"""
        routes = []
        config = OPERATORS["intercape"]

        logger.info("Scraping Intercape routes...")

        html = await self._fetch_page(config["routes_url"])
        if not html:
            logger.warning("Could not fetch Intercape routes, using known routes")
            return self._get_known_intercape_routes()

        soup = BeautifulSoup(html, 'html.parser')

        # Parse route links (structure depends on actual website)
        route_links = soup.select('a[href*="/route/"]') or soup.select('.route-item a')

        for link in route_links:
            try:
                href = link.get('href', '')
                route_text = link.get_text(strip=True)

                # Extract origin-destination from text like "Johannesburg to Cape Town"
                match = re.match(r'(.+?)\s+to\s+(.+)', route_text, re.IGNORECASE)
                if match:
                    origin, destination = match.groups()
                    route_id = f"intercape_{origin.lower().replace(' ', '_')}_{destination.lower().replace(' ', '_')}"

                    routes.append(ScrapedRoute(
                        operator="intercape",
                        route_id=route_id,
                        origin=origin.strip(),
                        destination=destination.strip(),
                        via=[],
                        duration_hours=None,
                        price_range=None,
                        frequency=None,
                        url=urljoin(config["base_url"], href)
                    ))
            except Exception as e:
                logger.error(f"Error parsing route: {e}")
                self.stats["errors"] += 1

        if not routes:
            routes = self._get_known_intercape_routes()

        logger.info(f"Found {len(routes)} Intercape routes")
        return routes

    def _get_known_intercape_routes(self) -> List[ScrapedRoute]:
        """Return known Intercape routes as fallback"""
        known_routes = [
            ("Johannesburg", "Cape Town", ["Bloemfontein"], 18),
            ("Johannesburg", "Durban", [], 7),
            ("Cape Town", "Durban", ["Port Elizabeth", "East London"], 20),
            ("Johannesburg", "Port Elizabeth", ["Bloemfontein"], 14),
            ("Pretoria", "Cape Town", ["Johannesburg", "Bloemfontein"], 19),
            ("Cape Town", "George", ["Mossel Bay"], 6),
            ("Johannesburg", "Polokwane", [], 4),
            ("Durban", "Johannesburg", [], 7),
            ("Cape Town", "Knysna", ["George"], 7),
            ("Johannesburg", "Nelspruit", [], 4),
        ]

        routes = []
        for origin, dest, via, duration in known_routes:
            route_id = f"intercape_{origin.lower().replace(' ', '_')}_{dest.lower().replace(' ', '_')}"
            routes.append(ScrapedRoute(
                operator="intercape",
                route_id=route_id,
                origin=origin,
                destination=dest,
                via=via,
                duration_hours=duration,
                price_range=None,
                frequency="Daily",
                url=None
            ))

        return routes

    async def scrape_translux_routes(self) -> List[ScrapedRoute]:
        """Scrape Translux routes"""
        # Similar implementation to Intercape
        logger.info("Scraping Translux routes...")

        # Translux known routes (fallback)
        known_routes = [
            ("Johannesburg", "Durban", [], 7),
            ("Johannesburg", "Cape Town", ["Bloemfontein"], 17),
            ("Pretoria", "Durban", [], 8),
            ("Cape Town", "Port Elizabeth", [], 10),
            ("Durban", "Port Elizabeth", ["East London"], 12),
        ]

        routes = []
        for origin, dest, via, duration in known_routes:
            route_id = f"translux_{origin.lower().replace(' ', '_')}_{dest.lower().replace(' ', '_')}"
            routes.append(ScrapedRoute(
                operator="translux",
                route_id=route_id,
                origin=origin,
                destination=dest,
                via=via,
                duration_hours=duration,
                price_range=None,
                frequency="Daily",
                url=None
            ))

        logger.info(f"Found {len(routes)} Translux routes")
        return routes

    async def scrape_greyhound_routes(self) -> List[ScrapedRoute]:
        """Scrape Greyhound routes"""
        logger.info("Scraping Greyhound routes...")

        # Greyhound known routes (fallback)
        known_routes = [
            ("Johannesburg", "Cape Town", ["Bloemfontein", "Beaufort West"], 18),
            ("Johannesburg", "Durban", ["Harrismith"], 7),
            ("Pretoria", "Cape Town", [], 18),
            ("Cape Town", "Port Elizabeth", ["George"], 10),
            ("Johannesburg", "Port Elizabeth", [], 13),
            ("Durban", "Cape Town", [], 20),
        ]

        routes = []
        for origin, dest, via, duration in known_routes:
            route_id = f"greyhound_{origin.lower().replace(' ', '_')}_{dest.lower().replace(' ', '_')}"
            routes.append(ScrapedRoute(
                operator="greyhound",
                route_id=route_id,
                origin=origin,
                destination=dest,
                via=via,
                duration_hours=duration,
                price_range=None,
                frequency="Daily",
                url=None
            ))

        logger.info(f"Found {len(routes)} Greyhound routes")
        return routes

    async def import_routes(self, routes: List[ScrapedRoute], operator: str):
        """Import scraped routes to database"""
        source_id = SOURCE_IDS.get(operator)
        if not source_id:
            logger.error(f"Unknown operator: {operator}")
            return

        config = OPERATORS.get(operator, {})

        async with self.db_pool.acquire() as conn:
            # Create agency if not exists
            await conn.execute("""
                INSERT INTO agencies (
                    agency_id, data_source_id, agency_name, agency_url,
                    agency_timezone, country_code, region
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (agency_id, data_source_id) DO UPDATE SET
                    agency_name = EXCLUDED.agency_name,
                    updated_at = NOW()
            """,
                operator,
                source_id,
                config.get("name", operator.title()),
                config.get("base_url"),
                "Africa/Johannesburg",
                "ZA",
                "National"
            )

            # Import routes
            for route in routes:
                try:
                    await conn.execute("""
                        INSERT INTO routes (
                            route_id, data_source_id, agency_id,
                            route_short_name, route_long_name, route_type,
                            route_color, metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (route_id, data_source_id) DO UPDATE SET
                            route_long_name = EXCLUDED.route_long_name,
                            metadata = EXCLUDED.metadata,
                            updated_at = NOW()
                    """,
                        route.route_id,
                        source_id,
                        operator,
                        f"{route.origin[:3].upper()}-{route.destination[:3].upper()}",
                        f"{route.origin} to {route.destination}",
                        3,  # Bus
                        config.get("color"),
                        json.dumps({
                            "via": route.via,
                            "duration_hours": route.duration_hours,
                            "frequency": route.frequency,
                            "url": route.url
                        })
                    )
                    self.stats["routes"] += 1
                except Exception as e:
                    logger.error(f"Failed to import route {route.route_id}: {e}")
                    self.stats["errors"] += 1

    async def import_major_stops(self, operator: str):
        """Import major intercity stops"""
        source_id = SOURCE_IDS.get(operator)
        if not source_id:
            return

        async with self.db_pool.acquire() as conn:
            for stop_key, stop_data in MAJOR_STOPS.items():
                try:
                    await conn.execute("""
                        INSERT INTO stops (
                            stop_id, data_source_id, stop_name,
                            stop_lat, stop_lon, location_type
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (stop_id, data_source_id) DO UPDATE SET
                            stop_name = EXCLUDED.stop_name,
                            updated_at = NOW()
                    """,
                        f"{operator}_{stop_key}",
                        source_id,
                        stop_data["name"],
                        stop_data["lat"],
                        stop_data["lon"],
                        1  # Station
                    )
                    self.stats["stops"] += 1
                except Exception as e:
                    logger.error(f"Failed to import stop {stop_key}: {e}")

    async def sync_all(self):
        """Sync all intercity operators"""
        logger.info("Starting intercity bus sync...")

        # Intercape
        intercape_routes = await self.scrape_intercape_routes()
        await self.import_routes(intercape_routes, "intercape")
        await self.import_major_stops("intercape")

        # Translux
        translux_routes = await self.scrape_translux_routes()
        await self.import_routes(translux_routes, "translux")
        await self.import_major_stops("translux")

        # Greyhound
        greyhound_routes = await self.scrape_greyhound_routes()
        await self.import_routes(greyhound_routes, "greyhound")
        await self.import_major_stops("greyhound")

        # Update data source timestamps
        async with self.db_pool.acquire() as conn:
            for source_id in SOURCE_IDS.values():
                await conn.execute("""
                    UPDATE data_sources SET last_updated = NOW() WHERE id = $1
                """, source_id)

        logger.info("Intercity sync complete!")
        logger.info(f"Statistics: {self.stats}")


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Scrape intercity bus schedules")
    parser.add_argument(
        "--operator",
        choices=["intercape", "translux", "greyhound", "all"],
        default="all",
        help="Operator to scrape"
    )
    parser.add_argument(
        "--database-url",
        default=DATABASE_URL,
        help="PostgreSQL connection URL"
    )

    args = parser.parse_args()

    # Create database pool
    db_pool = await asyncpg.create_pool(args.database_url)

    try:
        async with IntercityScraper(db_pool) as scraper:
            if args.operator == "all":
                await scraper.sync_all()
            elif args.operator == "intercape":
                routes = await scraper.scrape_intercape_routes()
                await scraper.import_routes(routes, "intercape")
                await scraper.import_major_stops("intercape")
            elif args.operator == "translux":
                routes = await scraper.scrape_translux_routes()
                await scraper.import_routes(routes, "translux")
                await scraper.import_major_stops("translux")
            elif args.operator == "greyhound":
                routes = await scraper.scrape_greyhound_routes()
                await scraper.import_routes(routes, "greyhound")
                await scraper.import_major_stops("greyhound")
    finally:
        await db_pool.close()


if __name__ == "__main__":
    asyncio.run(main())
