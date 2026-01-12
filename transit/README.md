# SA Transit Data Hub

Unified public transit data for South Africa, following GTFS specifications with support for crowdsourced routes.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  SA Transit Data Hub                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ GTFS Import │  │ PDF Parser  │  │ Crowdsource (TagMe!) │ │
│  │   Tools     │  │   Tools     │  │                      │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬──────────┘ │
│         ▼                ▼                     ▼            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              PostgreSQL + PostGIS                        ││
│  │              (GTFS Schema + Extensions)                  ││
│  └─────────────────────────────────────────────────────────┘│
│         │                │                     │            │
│         ▼                ▼                     ▼            │
│  ┌──────────┐     ┌──────────┐         ┌──────────┐        │
│  │ REST API │     │Real-time │         │  Export  │        │
│  │          │     │  Feed    │         │  (GTFS)  │        │
│  └──────────┘     └──────────┘         └──────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Data Sources

| Operator | Type | Status | Source | Stops |
|----------|------|--------|--------|-------|
| Stellenbosch Taxis | Taxi | ✅ Imported | GTFS (TumiData) | 226 |
| Gautrain | Rail | Pending credentials | GTFS | - |
| MyCiTi | BRT | Pending credentials | GTFS | - |
| GO GEORGE | Bus | Pending credentials | GTFS | - |
| A Re Yeng | BRT | Pending credentials | GTFS | - |
| Rea Vaya | BRT | Pending | PDF | - |
| Metrorail WC | Rail | Pending | PDF | - |
| Metrorail GP | Rail | Pending | PDF | - |
| PUTCO | Bus | Pending | PDF | - |
| Golden Arrow | Bus | Pending | PDF | - |
| Minibus Taxis | Informal | Crowdsourced | TagMe | - |

**Last Updated:** 2026-01-12

## Quick Start

```bash
# 1. Apply database schema
./scripts/setup.sh

# 2. Start the API
cd /home/geektrading/maps
docker compose up -d transit_api

# 3. Access API docs
open http://localhost:5030/docs
```

## API Endpoints

### Core Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/agencies` | List transit agencies |
| `GET /api/routes` | List routes with filters |
| `GET /api/routes/{id}` | Route details with stops |
| `GET /api/routes/{id}/schedule` | Schedule for a date |
| `GET /api/stops` | Find stops near location |
| `GET /api/stops/{id}` | Stop details with routes |
| `GET /api/stops/{id}/departures` | Upcoming departures |
| `POST /api/plan` | Trip planning |

### Real-time Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/realtime/vehicles` | Live vehicle positions |
| `GET /api/realtime/alerts` | Service alerts |

### Crowdsourcing Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/contribute/route` | Submit a route |
| `POST /api/contribute/stop` | Submit a stop |
| `GET /api/contribute/pending` | Pending contributions |
| `POST /api/contribute/route/{id}/vote` | Vote on contribution |
| `GET /api/contribute/leaderboard` | Top contributors |

## Import Data

### Import GTFS Feed

```bash
python3 scripts/import-gtfs.py \
  --url https://example.com/gtfs.zip \
  --source-id 1

# Or use known feeds
python3 scripts/import-gtfs.py --feed gautrain --source-id 1
python3 scripts/import-gtfs.py --feed myciti --source-id 2
```

### Parse PDF Schedule

```bash
python3 scripts/parse-pdf-schedule.py \
  --pdf schedule.pdf \
  --source-id 3 \
  --parser metrorail

# Geocode stops after parsing
python3 scripts/parse-pdf-schedule.py \
  --pdf schedule.pdf \
  --source-id 3 \
  --parser generic \
  --agency "Rea Vaya" \
  --geocode
```

### Sync Crowdsourced Routes

```bash
# Sync from TagMe (last 24 hours)
python3 scripts/tagme-sync.py

# Sync since specific date
python3 scripts/tagme-sync.py --since 2024-01-01

# Generate report only
python3 scripts/tagme-sync.py --report
```

## Crowdsourcing via TagMe

Users can contribute routes by:

1. Recording their trip in the TagMe app
2. Marking origin/destination
3. Submitting with route details (fare, times, etc.)

Routes are verified through:
- Multiple independent submissions
- Community voting (upvotes/downvotes)
- Admin review

When a route receives enough verifications (3+), it's automatically promoted to official status.

## Database Schema

Core GTFS tables:
- `agencies` - Transit operators
- `routes` - Transit routes
- `stops` - Stations/stops with geometry
- `trips` - Specific trips on routes
- `stop_times` - Arrival/departure times
- `calendar` - Service patterns
- `calendar_dates` - Exceptions
- `shapes` - Route geometries
- `fare_attributes` / `fare_rules` - Fares

Extended tables:
- `data_sources` - Track data origins
- `shape_geometries` - Pre-computed LineStrings
- `vehicle_positions` - Real-time tracking
- `service_alerts` - Disruption notices

Crowdsourcing tables:
- `contributors` - User profiles
- `route_contributions` - Submitted routes
- `stop_contributions` - Submitted stops
- `contribution_votes` - Community votes

## Expansion Roadmap

### Phase 1: South Africa (Current)
- Gautrain, MyCiTi, GO GEORGE
- PDF parsing for other operators
- Crowdsourced taxi routes

### Phase 2: Regional
- Namibia (TransNamib)
- Botswana
- Zimbabwe
- Mozambique

### Phase 3: Continental
- East Africa (Kenya, Tanzania)
- West Africa (Nigeria, Ghana)
- North Africa (Morocco, Egypt)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://maps:...@localhost:5433/maps` |
| `TRANSIT_API_KEY` | Admin API key | - |
| `TAGME_API_URL` | TagMe API endpoint | `http://tagme_api:8000` |
| `MAPS_API_URL` | Maps API for geocoding | `http://maps_api:8000` |

## License

Part of the DataAcuity Maps platform.
