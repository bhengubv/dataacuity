# DataAcuity Maps - Changelog

All notable changes to the Maps platform are documented here.

## [2026-01-12] - Session 4

### Added
- **Self-hosted vector tiles** - South Africa PMTiles (446 MB, 432K tiles, zoom 0-14)
- **Protomaps basemap style** - Custom MapLibre GL style at `tiles/styles/south-africa.json`
- **Local tile frontend option** - "South Africa (Local)" in map style selector
- **Nginx tiles proxy** - `/tiles/` route proxying to tile server
- **Tile update script** - `scripts/update-tiles.sh` for monthly OSM updates
- **Monthly tile cron job** - Runs 1st of month at 3am SAST
- **Stellenbosch Taxis GTFS** - First transit feed imported (226 stops, 4 routes)

### Fixed
- `.env` variable warning - Escaped `$` as `$$` in database password

### Changed
- Updated `tiles/config.json` to include styles path
- Updated `frontend/js/maps.js` with local tile option
- Updated `frontend/nginx.conf` with tiles proxy

---

## [2024-12-23] - Session 3

### Added
- **SA Transit Data Hub** - Full GTFS-compliant transit database
- **Transit API** - Port 5030 with routes, stops, trip planning
- **GTFS import tools** - For agencies with GTFS feeds
- **PDF schedule parser** - For operators without GTFS
- **TagMe integration** - Crowdsourced minibus taxi routes
- **Isochrone maps** - `/api/isochrone` endpoint
- **Multi-stop routing** - `/api/route/multi` endpoint
- **Route optimization** - `/api/route/optimize` (TSP)
- **Load shedding** - EskomSePush integration

---

## [2024-12-22] - Session 2

### Added
- **HERE Traffic API** - 250K requests/month free tier
- **Traffic incidents** - Accidents, road works, closures
- **Weather API** - Open-Meteo (unlimited, free)
- **Elevation API** - Open-Elevation with route profiles
- **Opening hours import** - POI business hours from OSM
- **API demo page** - Interactive demo at `/demo.html`
- **API Reference** - Full documentation in `API-REFERENCE.md`

### Changed
- Updated SDK with traffic, weather, elevation methods
- Added Redis caching for external APIs

---

## [2024-12-21] - Session 1

### Added
- **POI expansion** - 87 → 34,299 POIs from OpenStreetMap
- **Weekly POI updates** - Cron job for OSM sync
- **Capabilities endpoint** - Feature status dashboard
- **Street view** - Mapillary integration
- **Transit stops** - Bus/train station data
- **Crowdsourced traffic** - Via TagMe

---

## [2024-01] - Security Audit

### Fixed
- Removed hardcoded database credentials
- Fixed CORS to use environment variables
- Added rate limiting (slowapi)
- Added bbox validation
- Fixed XSS vulnerabilities in frontend
- Improved error handling and logging
