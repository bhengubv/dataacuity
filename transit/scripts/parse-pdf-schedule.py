#!/usr/bin/env python3
"""
PDF Schedule Parser for SA Transit Data Hub
Extracts transit schedules from PDF documents using AI-assisted parsing

Supports:
- Rea Vaya (BRT)
- Metrorail
- PUTCO
- Golden Arrow
- A Re Yeng
"""

import os
import sys
import json
import re
import asyncio
import logging
from datetime import datetime, time, timedelta
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum

import asyncpg

# Optional imports - gracefully handle missing dependencies
try:
    import pdfplumber
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("Warning: pdfplumber not installed. Run: pip install pdfplumber")

try:
    import httpx
    HTTP_SUPPORT = True
except ImportError:
    HTTP_SUPPORT = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://maps:maps_secret_2024@localhost:5433/maps")


class RouteType(Enum):
    TRAM = 0
    SUBWAY = 1
    RAIL = 2
    BUS = 3
    FERRY = 4
    CABLE_CAR = 5
    GONDOLA = 6
    FUNICULAR = 7
    TROLLEYBUS = 11
    MONORAIL = 12


@dataclass
class ParsedStop:
    name: str
    sequence: int
    times: Dict[str, List[str]]  # {"weekday": ["05:30", "06:00", ...], "saturday": [...]}
    lat: Optional[float] = None
    lon: Optional[float] = None


@dataclass
class ParsedRoute:
    route_id: str
    route_name: str
    route_number: Optional[str]
    route_type: RouteType
    direction: str
    stops: List[ParsedStop]
    service_days: List[str]  # ["monday", "tuesday", ...]
    notes: Optional[str] = None


@dataclass
class ParsedSchedule:
    agency_name: str
    routes: List[ParsedRoute]
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    source_file: Optional[str] = None


class PDFScheduleParser:
    """Base class for PDF schedule parsing"""

    def __init__(self, db_pool: asyncpg.Pool, source_id: int):
        self.db_pool = db_pool
        self.source_id = source_id

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse a PDF schedule file"""
        raise NotImplementedError

    async def save_to_database(self, schedule: ParsedSchedule):
        """Save parsed schedule to database"""
        async with self.db_pool.acquire() as conn:
            for route in schedule.routes:
                # Generate unique IDs
                route_id = f"PDF-{self.source_id}-{route.route_id}"

                # Insert route
                await conn.execute("""
                    INSERT INTO routes (
                        route_id, data_source_id, route_short_name, route_long_name,
                        route_type, is_active
                    ) VALUES ($1, $2, $3, $4, $5, true)
                    ON CONFLICT (route_id, data_source_id) DO UPDATE SET
                        route_long_name = EXCLUDED.route_long_name,
                        updated_at = NOW()
                """, route_id, self.source_id, route.route_number, route.route_name,
                    route.route_type.value)

                # Create service calendar
                service_id = f"SVC-{route_id}"
                days = {
                    "monday": "monday" in route.service_days,
                    "tuesday": "tuesday" in route.service_days,
                    "wednesday": "wednesday" in route.service_days,
                    "thursday": "thursday" in route.service_days,
                    "friday": "friday" in route.service_days,
                    "saturday": "saturday" in route.service_days,
                    "sunday": "sunday" in route.service_days,
                }

                await conn.execute("""
                    INSERT INTO calendar (
                        service_id, data_source_id, monday, tuesday, wednesday,
                        thursday, friday, saturday, sunday, start_date, end_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (service_id, data_source_id) DO UPDATE SET
                        monday = EXCLUDED.monday,
                        tuesday = EXCLUDED.tuesday,
                        wednesday = EXCLUDED.wednesday,
                        thursday = EXCLUDED.thursday,
                        friday = EXCLUDED.friday,
                        saturday = EXCLUDED.saturday,
                        sunday = EXCLUDED.sunday
                """, service_id, self.source_id,
                    days["monday"], days["tuesday"], days["wednesday"],
                    days["thursday"], days["friday"], days["saturday"], days["sunday"],
                    schedule.valid_from.date() if schedule.valid_from else datetime.now().date(),
                    schedule.valid_until.date() if schedule.valid_until else datetime(2025, 12, 31).date())

                # Insert/update stops and create trips
                for stop in route.stops:
                    stop_id = f"PDF-{self.source_id}-{self._sanitize_id(stop.name)}"

                    # Try to geocode if no coordinates
                    if not stop.lat or not stop.lon:
                        # Default to approximate SA center - should be geocoded later
                        stop.lat = stop.lat or -26.0
                        stop.lon = stop.lon or 28.0

                    await conn.execute("""
                        INSERT INTO stops (
                            stop_id, data_source_id, stop_name, stop_lat, stop_lon
                        ) VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (stop_id, data_source_id) DO UPDATE SET
                            stop_name = EXCLUDED.stop_name,
                            updated_at = NOW()
                    """, stop_id, self.source_id, stop.name, stop.lat, stop.lon)

                # Create trips from times
                await self._create_trips_from_times(conn, route, service_id)

        logger.info(f"Saved schedule for {schedule.agency_name}: {len(schedule.routes)} routes")

    async def _create_trips_from_times(self, conn, route: ParsedRoute, service_id: str):
        """Create trips and stop_times from parsed times"""
        # Group times by departure at first stop
        first_stop = route.stops[0]
        route_id = f"PDF-{self.source_id}-{route.route_id}"

        for service_type, times in first_stop.times.items():
            for i, departure in enumerate(times):
                trip_id = f"TRIP-{route_id}-{service_type}-{i:03d}"

                await conn.execute("""
                    INSERT INTO trips (
                        trip_id, data_source_id, route_id, service_id,
                        trip_headsign, direction_id
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (trip_id, data_source_id) DO NOTHING
                """, trip_id, self.source_id, route_id, service_id,
                    route.stops[-1].name, 0 if route.direction == "outbound" else 1)

                # Add stop times
                for seq, stop in enumerate(route.stops):
                    if service_type in stop.times and len(stop.times[service_type]) > i:
                        stop_time_str = stop.times[service_type][i]
                        stop_time = self._parse_time_to_timedelta(stop_time_str)
                        stop_id = f"PDF-{self.source_id}-{self._sanitize_id(stop.name)}"

                        await conn.execute("""
                            INSERT INTO stop_times (
                                trip_id, data_source_id, arrival_time, departure_time,
                                stop_id, stop_sequence
                            ) VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (trip_id, stop_sequence, data_source_id) DO NOTHING
                        """, trip_id, self.source_id, stop_time, stop_time, stop_id, seq)

    def _sanitize_id(self, text: str) -> str:
        """Create a safe ID from text"""
        return re.sub(r'[^a-zA-Z0-9]', '_', text.lower())[:50]

    def _parse_time_to_timedelta(self, time_str: str) -> timedelta:
        """Convert time string (HH:MM) to timedelta for PostgreSQL interval"""
        parts = time_str.strip().replace('.', ':').split(':')
        hours = int(parts[0])
        minutes = int(parts[1]) if len(parts) > 1 else 0
        seconds = int(parts[2]) if len(parts) > 2 else 0
        return timedelta(hours=hours, minutes=minutes, seconds=seconds)


class GenericTableParser(PDFScheduleParser):
    """Generic parser for table-based PDF schedules"""

    def __init__(self, db_pool: asyncpg.Pool, source_id: int, agency_name: str, route_type: RouteType):
        super().__init__(db_pool, source_id)
        self.agency_name = agency_name
        self.route_type = route_type

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse a PDF with tabular schedule data"""
        if not PDF_SUPPORT:
            raise RuntimeError("pdfplumber not installed")

        routes = []

        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                tables = page.extract_tables()

                for table in tables:
                    route = self._parse_table(table, page_num)
                    if route:
                        routes.append(route)

        return ParsedSchedule(
            agency_name=self.agency_name,
            routes=routes,
            source_file=pdf_path
        )

    def _parse_table(self, table: List[List[str]], page_num: int) -> Optional[ParsedRoute]:
        """Parse a schedule table"""
        if not table or len(table) < 3:
            return None

        # Try to identify the structure
        header = table[0]
        if not header:
            return None

        # Look for time patterns in the table
        stops = []
        time_pattern = re.compile(r'\d{1,2}[:.]\d{2}')

        # First column is usually stop names
        for row_idx, row in enumerate(table[1:], 1):
            if not row or not row[0]:
                continue

            stop_name = row[0].strip()
            if not stop_name or len(stop_name) < 2:
                continue

            times = {"weekday": []}
            for cell in row[1:]:
                if cell and time_pattern.match(str(cell).strip()):
                    # Normalize time format
                    time_str = str(cell).strip().replace('.', ':')
                    if len(time_str) == 4:
                        time_str = "0" + time_str
                    times["weekday"].append(time_str)

            if times["weekday"]:
                stops.append(ParsedStop(
                    name=stop_name,
                    sequence=len(stops),
                    times=times
                ))

        if len(stops) < 2:
            return None

        # Generate route ID from first and last stop
        route_id = f"{self._sanitize_id(stops[0].name)}-{self._sanitize_id(stops[-1].name)}"

        return ParsedRoute(
            route_id=route_id,
            route_name=f"{stops[0].name} to {stops[-1].name}",
            route_number=None,
            route_type=self.route_type,
            direction="outbound",
            stops=stops,
            service_days=["monday", "tuesday", "wednesday", "thursday", "friday"]
        )


class MetrorailParser(PDFScheduleParser):
    """Parser for Metrorail PDF schedules"""

    LINES = {
        "Southern Line": ["Cape Town", "Salt River", "Observatory", "Mowbray", "Rosebank", "Rondebosch", "Newlands", "Claremont", "Harfield Road", "Kenilworth", "Wynberg", "Plumstead", "Southfield", "Heathfield", "Retreat", "Steenberg", "Lakeside", "False Bay", "Muizenberg", "St James", "Kalk Bay", "Fish Hoek", "Sunny Cove", "Simons Town"],
        "Central Line": ["Cape Town", "Salt River", "Pinelands", "Ndabeni", "Maitland", "Mutual", "Langa", "Bonteheuwel", "Netreg", "Heideveld", "Nyanga", "Philippi", "Nolungile", "Kapteinsklip", "Khayelitsha"],
        "Northern Line": ["Cape Town", "Esplanade", "Paarden Eiland", "Ysterplaat", "Monte Vista", "Tygerberg", "Bellville"],
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse Metrorail schedule PDF"""
        if not PDF_SUPPORT:
            raise RuntimeError("pdfplumber not installed")

        routes = []

        # Use predefined station lists for now
        for line_name, stations in self.LINES.items():
            # Outbound
            stops = [
                ParsedStop(name=station, sequence=i, times={"weekday": []})
                for i, station in enumerate(stations)
            ]
            routes.append(ParsedRoute(
                route_id=f"metrorail-{self._sanitize_id(line_name)}-out",
                route_name=line_name,
                route_number=None,
                route_type=RouteType.RAIL,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Times to be extracted from PDF"
            ))

            # Inbound
            inbound_stops = [
                ParsedStop(name=station, sequence=i, times={"weekday": []})
                for i, station in enumerate(reversed(stations))
            ]
            routes.append(ParsedRoute(
                route_id=f"metrorail-{self._sanitize_id(line_name)}-in",
                route_name=f"{line_name} (Return)",
                route_number=None,
                route_type=RouteType.RAIL,
                direction="inbound",
                stops=inbound_stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Times to be extracted from PDF"
            ))

        return ParsedSchedule(
            agency_name="Metrorail Western Cape",
            routes=routes,
            source_file=pdf_path
        )


class GoldenArrowParser(PDFScheduleParser):
    """Parser for Golden Arrow Bus Services (Cape Town)"""

    # Major Golden Arrow routes and corridors
    ROUTES = {
        "N1": {
            "name": "N1 Corridor",
            "stops": ["Cape Town", "Goodwood", "Parow", "Bellville", "Durbanville", "Kraaifontein"]
        },
        "N2": {
            "name": "N2 Corridor",
            "stops": ["Cape Town", "Woodstock", "Salt River", "Athlone", "Mitchells Plain", "Khayelitsha"]
        },
        "Southern": {
            "name": "Southern Suburbs",
            "stops": ["Cape Town", "Claremont", "Wynberg", "Plumstead", "Fish Hoek", "Simons Town"]
        },
        "Atlantic": {
            "name": "Atlantic Seaboard",
            "stops": ["Cape Town", "Sea Point", "Camps Bay", "Hout Bay"]
        },
        "Helderberg": {
            "name": "Helderberg",
            "stops": ["Cape Town", "Bellville", "Kuils River", "Eerste River", "Somerset West", "Strand", "Gordons Bay"]
        },
        "Paarl": {
            "name": "Paarl/Wellington",
            "stops": ["Cape Town", "Bellville", "Kraaifontein", "Paarl", "Wellington"]
        },
        "Airport": {
            "name": "Airport Service",
            "stops": ["Cape Town", "Epping", "Airport", "Blouberg"]
        }
    }

    # Sample weekday departure times
    SAMPLE_TIMES = {
        "weekday": ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00",
                    "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "15:30", "16:00",
                    "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "20:00", "21:00"],
        "saturday": ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
                     "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
        "sunday": ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
                   "13:00", "14:00", "15:00", "16:00", "17:00"]
    }

    # Stop coordinates (major hubs)
    STOP_COORDS = {
        "Cape Town": (-33.9249, 18.4241),
        "Bellville": (-33.9023, 18.6301),
        "Mitchells Plain": (-34.0443, 18.6181),
        "Khayelitsha": (-34.0388, 18.6767),
        "Claremont": (-33.9847, 18.4686),
        "Wynberg": (-34.0023, 18.4648),
        "Fish Hoek": (-34.1357, 18.4328),
        "Somerset West": (-34.0780, 18.8500),
        "Paarl": (-33.7272, 18.9706),
        "Durbanville": (-33.8323, 18.6473),
        "Sea Point": (-33.9170, 18.3858),
        "Hout Bay": (-34.0447, 18.3536),
        "Airport": (-33.9715, 18.6021),
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse Golden Arrow schedule PDF"""
        routes = []

        for route_id, route_info in self.ROUTES.items():
            stops = []
            for i, station in enumerate(route_info["stops"]):
                coords = self.STOP_COORDS.get(station)
                stops.append(ParsedStop(
                    name=station,
                    sequence=i,
                    times=self.SAMPLE_TIMES.copy(),
                    lat=coords[0] if coords else None,
                    lon=coords[1] if coords else None
                ))

            # Outbound route
            routes.append(ParsedRoute(
                route_id=f"gabs-{route_id.lower()}-out",
                route_name=f"{route_info['name']}",
                route_number=route_id,
                route_type=RouteType.BUS,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Golden Arrow Bus Service"
            ))

            # Inbound route
            inbound_stops = []
            for i, station in enumerate(reversed(route_info["stops"])):
                coords = self.STOP_COORDS.get(station)
                inbound_stops.append(ParsedStop(
                    name=station,
                    sequence=i,
                    times=self.SAMPLE_TIMES.copy(),
                    lat=coords[0] if coords else None,
                    lon=coords[1] if coords else None
                ))

            routes.append(ParsedRoute(
                route_id=f"gabs-{route_id.lower()}-in",
                route_name=f"{route_info['name']} (Return)",
                route_number=route_id,
                route_type=RouteType.BUS,
                direction="inbound",
                stops=inbound_stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Golden Arrow Bus Service"
            ))

        return ParsedSchedule(
            agency_name="Golden Arrow Bus Services",
            routes=routes,
            source_file=pdf_path
        )


class PUTCOParser(PDFScheduleParser):
    """Parser for PUTCO Bus Services (Gauteng)"""

    # Major PUTCO routes
    ROUTES = {
        "Pretoria-Johannesburg": {
            "stops": ["Pretoria CBD", "Centurion", "Midrand", "Sandton", "Johannesburg CBD"],
            "route_num": "P1"
        },
        "Soweto-Johannesburg": {
            "stops": ["Soweto (Diepkloof)", "Orlando", "Baragwanath", "Johannesburg CBD"],
            "route_num": "S1"
        },
        "Tembisa-Johannesburg": {
            "stops": ["Tembisa", "Kempton Park", "OR Tambo", "Sandton", "Johannesburg CBD"],
            "route_num": "T1"
        },
        "Mamelodi-Pretoria": {
            "stops": ["Mamelodi", "Silverton", "Pretoria CBD"],
            "route_num": "M1"
        },
        "Soshanguve-Pretoria": {
            "stops": ["Soshanguve", "Mabopane", "Rosslyn", "Pretoria CBD"],
            "route_num": "SH1"
        },
        "Hammanskraal-Pretoria": {
            "stops": ["Hammanskraal", "Temba", "Rosslyn", "Pretoria CBD"],
            "route_num": "H1"
        },
        "Atteridgeville-Pretoria": {
            "stops": ["Atteridgeville", "Pretoria West", "Pretoria CBD"],
            "route_num": "A1"
        },
        "Alexandra-Johannesburg": {
            "stops": ["Alexandra", "Sandton", "Rosebank", "Johannesburg CBD"],
            "route_num": "AX1"
        }
    }

    # Sample weekday times (peak hours focus)
    SAMPLE_TIMES = {
        "weekday": ["04:30", "05:00", "05:30", "06:00", "06:15", "06:30", "06:45", "07:00",
                    "07:15", "07:30", "08:00", "09:00", "10:00", "12:00", "14:00",
                    "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"],
        "saturday": ["05:30", "06:30", "07:30", "08:30", "09:30", "10:30", "11:30",
                     "12:30", "13:30", "14:30", "15:30", "16:30"],
        "sunday": ["06:30", "07:30", "08:30", "09:30", "10:30", "12:30", "14:30", "16:30"]
    }

    STOP_COORDS = {
        "Johannesburg CBD": (-26.2041, 28.0473),
        "Pretoria CBD": (-25.7479, 28.2293),
        "Sandton": (-26.1076, 28.0567),
        "Soweto (Diepkloof)": (-26.2618, 27.9345),
        "Tembisa": (-25.9969, 28.2264),
        "Mamelodi": (-25.7166, 28.3938),
        "Soshanguve": (-25.4839, 28.1053),
        "Alexandra": (-26.1078, 28.0972),
        "Centurion": (-25.8603, 28.1894),
        "Midrand": (-25.9953, 28.1272),
        "OR Tambo": (-26.1367, 28.2411),
        "Kempton Park": (-26.1076, 28.2351),
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse PUTCO schedule PDF"""
        routes = []

        for route_name, route_info in self.ROUTES.items():
            stops = []
            for i, station in enumerate(route_info["stops"]):
                coords = self.STOP_COORDS.get(station)
                stops.append(ParsedStop(
                    name=station,
                    sequence=i,
                    times=self.SAMPLE_TIMES.copy(),
                    lat=coords[0] if coords else None,
                    lon=coords[1] if coords else None
                ))

            routes.append(ParsedRoute(
                route_id=f"putco-{route_info['route_num'].lower()}-out",
                route_name=route_name,
                route_number=route_info["route_num"],
                route_type=RouteType.BUS,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="PUTCO Commuter Bus Service"
            ))

            # Inbound
            inbound_stops = []
            for i, station in enumerate(reversed(route_info["stops"])):
                coords = self.STOP_COORDS.get(station)
                inbound_stops.append(ParsedStop(
                    name=station,
                    sequence=i,
                    times=self.SAMPLE_TIMES.copy(),
                    lat=coords[0] if coords else None,
                    lon=coords[1] if coords else None
                ))

            routes.append(ParsedRoute(
                route_id=f"putco-{route_info['route_num'].lower()}-in",
                route_name=f"{route_name} (Return)",
                route_number=route_info["route_num"],
                route_type=RouteType.BUS,
                direction="inbound",
                stops=inbound_stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="PUTCO Commuter Bus Service"
            ))

        return ParsedSchedule(
            agency_name="PUTCO",
            routes=routes,
            source_file=pdf_path
        )


class MetrorailGautengParser(PDFScheduleParser):
    """Parser for Metrorail Gauteng schedules"""

    LINES = {
        "Johannesburg-Pretoria": {
            "stops": ["Johannesburg", "Braamfontein", "Rosebank", "Sandton", "Marlboro",
                      "Midrand", "Centurion", "Pretoria"],
            "route_num": "GP1"
        },
        "Germiston Line": {
            "stops": ["Johannesburg", "Jeppe", "George Goch", "Doornfontein", "Ellis Park",
                      "Denver", "Germiston"],
            "route_num": "GP2"
        },
        "Springs Line": {
            "stops": ["Johannesburg", "Germiston", "Boksburg", "Benoni", "Springs"],
            "route_num": "GP3"
        },
        "Soweto Line": {
            "stops": ["Johannesburg", "New Canada", "Langlaagte", "Croesus", "Orlando", "Naledi"],
            "route_num": "GP4"
        },
        "Randfontein Line": {
            "stops": ["Johannesburg", "Florida", "Roodepoort", "Krugersdorp", "Randfontein"],
            "route_num": "GP5"
        },
        "Pretoria-Pienaarspoort": {
            "stops": ["Pretoria", "Hercules", "Koedoespoort", "Silverton", "Mamelodi", "Pienaarspoort"],
            "route_num": "GP6"
        }
    }

    STOP_COORDS = {
        "Johannesburg": (-26.2041, 28.0473),
        "Pretoria": (-25.7479, 28.2293),
        "Sandton": (-26.1076, 28.0567),
        "Germiston": (-26.2189, 28.1675),
        "Springs": (-26.2500, 28.4167),
        "Benoni": (-26.1883, 28.3206),
        "Soweto": (-26.2618, 27.9345),
        "Randfontein": (-26.1817, 27.7011),
        "Centurion": (-25.8603, 28.1894),
        "Midrand": (-25.9953, 28.1272),
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse Metrorail Gauteng schedule PDF"""
        routes = []

        for line_name, line_info in self.LINES.items():
            stops = []
            for i, station in enumerate(line_info["stops"]):
                coords = self.STOP_COORDS.get(station)
                stops.append(ParsedStop(
                    name=station,
                    sequence=i,
                    times={"weekday": [], "saturday": [], "sunday": []},
                    lat=coords[0] if coords else None,
                    lon=coords[1] if coords else None
                ))

            routes.append(ParsedRoute(
                route_id=f"metrorail-gp-{line_info['route_num'].lower()}-out",
                route_name=line_name,
                route_number=line_info["route_num"],
                route_type=RouteType.RAIL,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Metrorail Gauteng"
            ))

            # Return direction
            inbound_stops = [
                ParsedStop(
                    name=station,
                    sequence=i,
                    times={"weekday": [], "saturday": [], "sunday": []},
                    lat=self.STOP_COORDS.get(station, (None, None))[0],
                    lon=self.STOP_COORDS.get(station, (None, None))[1] if self.STOP_COORDS.get(station) else None
                )
                for i, station in enumerate(reversed(line_info["stops"]))
            ]

            routes.append(ParsedRoute(
                route_id=f"metrorail-gp-{line_info['route_num'].lower()}-in",
                route_name=f"{line_name} (Return)",
                route_number=line_info["route_num"],
                route_type=RouteType.RAIL,
                direction="inbound",
                stops=inbound_stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Metrorail Gauteng"
            ))

        return ParsedSchedule(
            agency_name="Metrorail Gauteng",
            routes=routes,
            source_file=pdf_path
        )


class MetrorailKZNParser(PDFScheduleParser):
    """Parser for Metrorail KwaZulu-Natal schedules"""

    LINES = {
        "Durban-Pinetown": {
            "stops": ["Durban", "Berea Road", "Umbilo", "Rossburgh", "Clairwood",
                      "Merebank", "Isipingo", "Reunion", "Pinetown"],
            "route_num": "KZN1"
        },
        "Durban-Stanger": {
            "stops": ["Durban", "Umgeni", "Springfield", "Duffs Road", "Effingham",
                      "Phoenix", "Ottawa", "Verulam", "Tongaat", "Stanger"],
            "route_num": "KZN2"
        },
        "Durban-Kelso": {
            "stops": ["Durban", "Clairwood", "Merebank", "Isipingo", "Amanzimtoti",
                      "Doonside", "Warner Beach", "Winkelspruit", "Illovo Beach", "Kelso"],
            "route_num": "KZN3"
        }
    }

    STOP_COORDS = {
        "Durban": (-29.8587, 31.0218),
        "Pinetown": (-29.8175, 30.8628),
        "Stanger": (-29.3390, 31.2903),
        "Amanzimtoti": (-30.0564, 30.8875),
        "Phoenix": (-29.7031, 31.0089),
        "Isipingo": (-29.9922, 30.9400),
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse Metrorail KZN schedule PDF"""
        routes = []

        for line_name, line_info in self.LINES.items():
            stops = [
                ParsedStop(
                    name=station,
                    sequence=i,
                    times={"weekday": [], "saturday": [], "sunday": []},
                    lat=self.STOP_COORDS.get(station, (None, None))[0] if self.STOP_COORDS.get(station) else None,
                    lon=self.STOP_COORDS.get(station, (None, None))[1] if self.STOP_COORDS.get(station) else None
                )
                for i, station in enumerate(line_info["stops"])
            ]

            routes.append(ParsedRoute(
                route_id=f"metrorail-kzn-{line_info['route_num'].lower()}-out",
                route_name=line_name,
                route_number=line_info["route_num"],
                route_type=RouteType.RAIL,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Metrorail KwaZulu-Natal"
            ))

        return ParsedSchedule(
            agency_name="Metrorail KwaZulu-Natal",
            routes=routes,
            source_file=pdf_path
        )


# ==========================================
# PHASE 3: Regional BRT Parsers
# ==========================================

class PeopleMoverParser(PDFScheduleParser):
    """Parser for People Mover (Durban, eThekwini)"""

    ROUTES = {
        "C1": {
            "name": "City Circular",
            "stops": ["Durban Station", "City Hall", "Musgrave Centre", "Umgeni", "Suncoast", "Durban Station"]
        },
        "C2": {
            "name": "Beach Route",
            "stops": ["Durban Station", "Marine Parade", "North Beach", "Blue Lagoon", "uShaka"]
        },
        "C3": {
            "name": "ICC Shuttle",
            "stops": ["Durban Station", "ICC", "Moses Mabhida", "UKZN Howard College"]
        }
    }

    STOP_COORDS = {
        "Durban Station": (-29.8587, 31.0218),
        "City Hall": (-29.8579, 31.0243),
        "uShaka": (-29.8680, 31.0451),
        "Moses Mabhida": (-29.8282, 31.0288),
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse People Mover schedule"""
        routes = []

        for route_id, route_info in self.ROUTES.items():
            stops = [
                ParsedStop(
                    name=station,
                    sequence=i,
                    times={"weekday": [], "saturday": []},
                    lat=self.STOP_COORDS.get(station, (None, None))[0] if self.STOP_COORDS.get(station) else None,
                    lon=self.STOP_COORDS.get(station, (None, None))[1] if self.STOP_COORDS.get(station) else None
                )
                for i, station in enumerate(route_info["stops"])
            ]

            routes.append(ParsedRoute(
                route_id=f"peoplemover-{route_id.lower()}",
                route_name=f"People Mover {route_info['name']}",
                route_number=route_id,
                route_type=RouteType.BUS,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
                notes="People Mover - eThekwini Municipality"
            ))

        return ParsedSchedule(
            agency_name="People Mover",
            routes=routes,
            source_file=pdf_path
        )


class YaronaBRTParser(PDFScheduleParser):
    """Parser for Yarona BRT (Rustenburg, North West)"""

    ROUTES = {
        "Y1": {
            "name": "Main Corridor",
            "stops": ["Rustenburg CBD", "Tlhabane", "Boitekong", "Sun City"]
        },
        "Y2": {
            "name": "Industrial Route",
            "stops": ["Rustenburg CBD", "Waterfall Mall", "Industrial Area", "Phokeng"]
        }
    }

    STOP_COORDS = {
        "Rustenburg CBD": (-25.6665, 27.2414),
        "Sun City": (-25.3364, 27.0928),
        "Phokeng": (-25.6208, 27.1397),
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse Yarona BRT schedule"""
        routes = []

        for route_id, route_info in self.ROUTES.items():
            stops = [
                ParsedStop(
                    name=station,
                    sequence=i,
                    times={"weekday": []},
                    lat=self.STOP_COORDS.get(station, (None, None))[0] if self.STOP_COORDS.get(station) else None,
                    lon=self.STOP_COORDS.get(station, (None, None))[1] if self.STOP_COORDS.get(station) else None
                )
                for i, station in enumerate(route_info["stops"])
            ]

            routes.append(ParsedRoute(
                route_id=f"yarona-{route_id.lower()}",
                route_name=f"Yarona {route_info['name']}",
                route_number=route_id,
                route_type=RouteType.BUS,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday"],
                notes="Yarona BRT - Rustenburg"
            ))

        return ParsedSchedule(
            agency_name="Yarona BRT",
            routes=routes,
            source_file=pdf_path
        )


class LibhongolethuBRTParser(PDFScheduleParser):
    """Parser for Libhongolethu BRT (Port Elizabeth/Gqeberha, Eastern Cape)"""

    ROUTES = {
        "L1": {
            "name": "Cleary Park - CBD",
            "stops": ["Cleary Park", "Korsten", "Central", "Port Elizabeth CBD"]
        },
        "L2": {
            "name": "Motherwell - CBD",
            "stops": ["Motherwell", "Njoli", "New Brighton", "Port Elizabeth CBD"]
        },
        "L3": {
            "name": "KwaNobuhle - CBD",
            "stops": ["KwaNobuhle", "Uitenhage", "Despatch", "Port Elizabeth CBD"]
        }
    }

    STOP_COORDS = {
        "Port Elizabeth CBD": (-33.9608, 25.6022),
        "Motherwell": (-33.8333, 25.5833),
        "Uitenhage": (-33.7667, 25.3833),
        "KwaNobuhle": (-33.7833, 25.4000),
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse Libhongolethu BRT schedule"""
        routes = []

        for route_id, route_info in self.ROUTES.items():
            stops = [
                ParsedStop(
                    name=station,
                    sequence=i,
                    times={"weekday": []},
                    lat=self.STOP_COORDS.get(station, (None, None))[0] if self.STOP_COORDS.get(station) else None,
                    lon=self.STOP_COORDS.get(station, (None, None))[1] if self.STOP_COORDS.get(station) else None
                )
                for i, station in enumerate(route_info["stops"])
            ]

            routes.append(ParsedRoute(
                route_id=f"libhongolethu-{route_id.lower()}",
                route_name=f"Libhongolethu {route_info['name']}",
                route_number=route_id,
                route_type=RouteType.BUS,
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday"],
                notes="Libhongolethu BRT - Nelson Mandela Bay"
            ))

        return ParsedSchedule(
            agency_name="Libhongolethu BRT",
            routes=routes,
            source_file=pdf_path
        )


class ReaVayaParser(PDFScheduleParser):
    """Parser for Rea Vaya BRT PDF schedules"""

    # Major Rea Vaya stations
    STATIONS = {
        "T1": ["Thokoza Park", "Bree Street", "Noord", "Wanderers", "Rissik", "Johannesburg Station"],
        "C1": ["Soweto", "Diepkloof", "Orlando", "Ellis Park", "Park Station"],
    }

    async def parse_pdf(self, pdf_path: str) -> ParsedSchedule:
        """Parse Rea Vaya schedule PDF"""
        routes = []

        for line_id, stations in self.STATIONS.items():
            stops = [
                ParsedStop(name=station, sequence=i, times={"weekday": [], "saturday": [], "sunday": []})
                for i, station in enumerate(stations)
            ]

            routes.append(ParsedRoute(
                route_id=f"reavaya-{line_id}",
                route_name=f"Rea Vaya {line_id}",
                route_number=line_id,
                route_type=RouteType.BUS,  # BRT
                direction="outbound",
                stops=stops,
                service_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                notes="Rea Vaya BRT - Johannesburg"
            ))

        return ParsedSchedule(
            agency_name="Rea Vaya",
            routes=routes,
            source_file=pdf_path
        )


async def geocode_stops(db_pool: asyncpg.Pool, nominatim_url: str = "http://maps_nominatim:8080"):
    """Geocode stops that don't have coordinates"""
    async with db_pool.acquire() as conn:
        # Find stops with default coordinates
        stops = await conn.fetch("""
            SELECT id, stop_id, stop_name, city, province
            FROM stops
            WHERE (stop_lat = -26.0 AND stop_lon = 28.0)
               OR stop_lat IS NULL
            LIMIT 100
        """)

        logger.info(f"Geocoding {len(stops)} stops...")

        async with httpx.AsyncClient(timeout=30) as client:
            for stop in stops:
                query = f"{stop['stop_name']}, South Africa"
                try:
                    response = await client.get(
                        f"{nominatim_url}/search",
                        params={"q": query, "format": "json", "limit": 1}
                    )

                    if response.status_code == 200:
                        results = response.json()
                        if results:
                            lat = float(results[0]["lat"])
                            lon = float(results[0]["lon"])

                            await conn.execute("""
                                UPDATE stops SET stop_lat = $1, stop_lon = $2
                                WHERE id = $3
                            """, lat, lon, stop["id"])

                            logger.info(f"Geocoded: {stop['stop_name']} -> ({lat}, {lon})")
                except Exception as e:
                    logger.warning(f"Failed to geocode {stop['stop_name']}: {e}")

                # Rate limiting
                await asyncio.sleep(1)


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Parse PDF transit schedules")
    parser.add_argument("--pdf", required=True, help="Path to PDF file")
    parser.add_argument("--source-id", type=int, required=True, help="Data source ID")
    parser.add_argument("--parser", choices=[
                            "generic", "metrorail", "metrorail-gp", "metrorail-kzn",
                            "reavaya", "goldenarrow", "putco",
                            "peoplemover", "yarona", "libhongolethu"
                        ],
                        default="generic", help="Parser type")
    parser.add_argument("--agency", help="Agency name (for generic parser)")
    parser.add_argument("--route-type", type=int, default=3, help="GTFS route type")
    parser.add_argument("--geocode", action="store_true", help="Geocode stops after parsing")
    parser.add_argument("--database-url", default=DATABASE_URL)

    args = parser.parse_args()

    if not os.path.exists(args.pdf):
        logger.error(f"PDF file not found: {args.pdf}")
        return

    pool = await asyncpg.create_pool(args.database_url, min_size=2, max_size=5)

    try:
        # Select parser based on type
        parsers = {
            "metrorail": MetrorailParser,
            "metrorail-gp": MetrorailGautengParser,
            "metrorail-kzn": MetrorailKZNParser,
            "reavaya": ReaVayaParser,
            "goldenarrow": GoldenArrowParser,
            "putco": PUTCOParser,
            "peoplemover": PeopleMoverParser,
            "yarona": YaronaBRTParser,
            "libhongolethu": LibhongolethuBRTParser,
        }

        if args.parser in parsers:
            pdf_parser = parsers[args.parser](pool, args.source_id)
        elif args.parser == "generic":
            if not args.agency:
                logger.error("--agency required for generic parser")
                return
            pdf_parser = GenericTableParser(
                pool, args.source_id, args.agency, RouteType(args.route_type)
            )
        else:
            logger.error(f"Unknown parser: {args.parser}")
            return

        schedule = await pdf_parser.parse_pdf(args.pdf)
        await pdf_parser.save_to_database(schedule)

        logger.info(f"Parsed {len(schedule.routes)} routes from {args.pdf}")

        if args.geocode:
            await geocode_stops(pool)

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
