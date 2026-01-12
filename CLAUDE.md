# DataAcuity Platform - Developer Guide

## Overview

DataAcuity is a comprehensive, privacy-first integrated platform consisting of 20+ interconnected services for financial markets, geospatial mapping, workflow automation, analytics, and AI.

**Domain:** `dataacuity.co.za`
**Timezone:** `Africa/Johannesburg`
**Primary Tech Stack:** Python (FastAPI), PostgreSQL, Docker, Traefik, Keycloak
**Last Audit:** 2026-01-12

---

## Directory Structure

```
/home/geektrading/
├── suite/                    # Master orchestration (Traefik, Keycloak)
├── markets/                  # Financial markets data platform (OpenBB)
├── portal/                   # Landing page hub
├── bio/                      # Link-in-bio tool (Nuxt)
├── maps/                     # Geospatial platform (PostGIS, OSRM, Nominatim)
├── transit/                  # Public transport API (runs via maps/)
├── tagme/                    # High-throughput location ingestion (runs via maps/)
├── api-gateway/              # Unified API gateway (internal + external)
├── monitoring/               # Prometheus, Grafana, Loki, Alertmanager
├── data-warehouse/           # Analytics PostgreSQL
├── dbt/                      # Data transformation (dbt Core)
├── superset/                 # Business intelligence
├── n8n/                      # Workflow automation
├── airbyte/                  # ETL platform
├── twenty/                   # CRM platform
├── morph/                    # File converter (ConvertX)
├── dashboard/                # System status backend
├── developer-studio/         # Browser-based IDE (docs/POC)
├── ai-brain/                 # Ollama + Open WebUI
├── sandbox/                  # Webstudio visual builder
├── learn/                    # JupyterLite notebooks (static)
├── CircleOS/                 # Privacy-first mobile OS (specs)
├── automatisch/              # Alternative automation (Zapier clone)
├── backups/                  # Automated backups
├── docs/                     # Platform documentation
└── scripts/                  # Utility scripts
```

---

## Key Services & Ports

| Service | Container | Port | URL | Status |
|---------|-----------|------|-----|--------|
| Traefik | traefik | 80, 443 | - | ✅ Running |
| Keycloak | keycloak | 8180 | auth.dataacuity.co.za | ✅ Healthy |
| API Gateway (External) | api-gateway-external | 8084 | api.dataacuity.co.za | ✅ Healthy |
| API Gateway (Internal) | api-gateway-internal | 8083 | - | ✅ Healthy |
| API Docs | api-docs | 8082 | docs.dataacuity.co.za | ✅ Healthy |
| Markets API | markets_api | 8000 | api.markets.dataacuity.co.za | ✅ Running |
| Markets Dashboard | markets_dashboard | 5010 | markets.dataacuity.co.za | ✅ Running |
| OpenBB Backend | markets_openbb_backend | 8080 | - | ✅ Running |
| Maps API | maps_api | 5020 | maps.dataacuity.co.za/api | ✅ Running |
| Maps Frontend | maps_frontend | 5022 | maps.dataacuity.co.za | ✅ Running |
| Maps Tiles | maps_tiles | 5021 | - | ✅ Healthy |
| Transit API | transit_api | 5030 | - | ✅ Healthy |
| TagMe API | tagme_api | 5023 | - | ✅ Healthy |
| OSRM | maps_osrm | 5024 | - | ✅ Running |
| Nominatim | maps_nominatim | 5025 | - | ✅ Running |
| Bio | bio_onelink | 5009 | bio.dataacuity.co.za | ✅ Running |
| Grafana | grafana | 5015 | grafana.dataacuity.co.za | ✅ Running |
| Prometheus | prometheus | 9090 | prometheus.dataacuity.co.za | ✅ Running |
| Loki | loki | 3100 | - | ✅ Running |
| Alertmanager | alertmanager | 9093 | - | ✅ Running |
| Superset | superset | 5003 | analytics.dataacuity.co.za | ✅ Healthy |
| N8N | n8n | 5008 | n8n.dataacuity.co.za | ✅ Running |
| Automatisch | automatisch | 5004 | - | ✅ Running |
| Morph (ConvertX) | morph_convertx | 5011 | - | ✅ Running |
| Sandbox (Webstudio) | sandbox_webstudio | 5012 | - | ✅ Running |
| Developer IDE | sandbox_developer_ide | 5013 | - | ✅ Running |
| Ollama | ai_brain_ollama | 11434 | - | ✅ Running |
| Open WebUI | ai_brain_webui | 5000 | ai.dataacuity.co.za | ✅ Healthy |

---

## Databases

| Database | Container | Port | Purpose |
|----------|-----------|------|---------|
| maps | maps_db | 5433 | Geospatial data, POIs, transit, GTFS |
| openbb_data | markets_db | 5432 | Financial markets |
| onelink | bio_db | 5432 | Bio/link-in-bio |
| datawarehouse | postgres-dwh | 5001 | Analytics DW |
| superset | superset_db | 5432 | BI metadata |
| twenty | twenty-db | 5432 | CRM data |
| keycloak | keycloak_db | 5432 | SSO/Auth |
| api_gateway | gateway-db | 5432 | API keys, quotas |
| automatisch | automatisch_db | 5432 | Automation workflows |
| airbyte | airbyte-db | 5432 | ETL metadata |

---

## Platform Audit (2026-01-12)

### Service Configuration Status

| Folder | docker-compose | .env | Config Status | Notes |
|--------|:--------------:|:----:|:-------------:|-------|
| suite | ✅ | ✅ | Production-ready | Traefik + Keycloak |
| monitoring | ✅ `*` | ✅ | Production-ready | Uses docker-compose.monitoring.yml |
| maps | ✅ | ✅ | Production-ready | Fully secured |
| markets | ✅ | ⚠️ Missing | Needs .env | Has .env.example |
| api-gateway | ✅ | ⚠️ Missing | Needs .env | Hardcoded DWH creds |
| portal | ✅ | - | OK | Static Nginx |
| bio | ✅ | ⚠️ Missing | Hardcoded creds | Needs security fix |
| dashboard | ✅ | - | OK | Backend only |
| sandbox | ✅ | ⚠️ Missing | Hardcoded secrets | OIDC + DB creds |
| superset | ✅ | ✅ | OK | Minor hardcoding |
| dbt | ✅ | ⚠️ Missing | Creds in profiles.yml | Needs fix |
| n8n | ✅ | - | OK | App-managed |
| airbyte | ✅ | ✅ | OK | - |
| automatisch | ✅ | ✅ | OK | - |
| morph | ✅ | - | OK | Stateless |
| data-warehouse | ✅ | ✅ | OK | Isolated network |
| ai-brain | ✅ `*` | - | OK | Uses docker-compose.ai.yml |
| twenty | ✅ | ✅ | OK | - |
| tagme | - | - | OK | Runs via maps/ |
| CircleOS | - | - | N/A | Mobile OS specs |
| developer-studio | - | - | N/A | Documentation/POC |
| learn | - | - | N/A | Static JupyterLite |

`*` = Non-standard docker-compose filename

### Critical Security Issues

| Service | Issue | Location | Risk |
|---------|-------|----------|------|
| api-gateway | Missing .env, hardcoded DWH password | docker-compose.yml:29 | HIGH |
| bio | Hardcoded DB password + secret | docker-compose.yml | HIGH |
| sandbox | Hardcoded OIDC secret, AUTH_SECRET, DB creds | docker-compose.yml | HIGH |
| markets | Missing .env, default credentials | docker-compose.yml | MEDIUM |
| dbt | Database credentials in profiles.yml | profiles.yml | MEDIUM |

### Remediation Commands

```bash
# Create missing .env files
cp /home/geektrading/api-gateway/.env.example /home/geektrading/api-gateway/.env
cp /home/geektrading/markets/.env.example /home/geektrading/markets/.env

# Services needing manual .env creation:
# - /home/geektrading/bio/.env
# - /home/geektrading/sandbox/.env

# After creating .env files, move hardcoded secrets and restart:
docker compose -f /path/to/docker-compose.yml up -d
```

---

## Docker Networks

| Network | Purpose | Services |
|---------|---------|----------|
| dataacuity_network | Primary internal | suite, keycloak |
| data-warehouse_data_stack | Analytics/Automation | data-warehouse, dbt, superset, n8n, airbyte, api-gateway |
| maps_network | Geospatial services | maps, transit, tagme, osrm, nominatim |
| ai-brain_data_stack | AI services | ollama, open-webui |

---

## Maps Platform Details

**Location:** `/home/geektrading/maps/`

### Components
- **maps_api** - FastAPI backend with rate limiting, bbox validation
- **maps_db** - PostGIS 16 with places, POIs, transit schemas
- **maps_redis** - Caching layer
- **maps_osrm** - Routing (South Africa data)
- **maps_nominatim** - Geocoding (optional profile)
- **maps_tiles** - TileServer GL with PMTiles
- **maps_frontend** - Nginx + MapLibre GL
- **transit_api** - GTFS public transport
- **tagme_api** - Location data ingestion

### Self-Hosted Tiles (Protomaps)

| Item | Value |
|------|-------|
| File | `tiles/south-africa.pmtiles` |
| Size | 446 MB |
| Tiles | 432,593 |
| Zoom | 0-14 |
| Layers | boundaries, buildings, earth, landcover, landuse, places, pois, roads, water |
| Style | `tiles/styles/south-africa.json` |
| Update | Monthly (1st at 3am via cron) |

### GTFS Transit Data

| ID | Operator | Status | Stops |
|----|----------|--------|-------|
| 11 | Stellenbosch Taxis | ✅ Imported | 226 |
| 1 | Gautrain | Pending credentials | - |
| 2 | MyCiTi | Pending credentials | - |
| 9 | GO GEORGE | Pending credentials | - |

### Rate Limits
- `/api/places` - 100/minute
- `/api/geocode` - 60/minute
- `/api/reverse-geocode` - 60/minute
- `/api/share/location` - 10/minute

---

## Monitoring Stack

**Location:** `/home/geektrading/monitoring/`
**Config:** `docker-compose.monitoring.yml`

### Components
| Service | Port | Purpose |
|---------|------|---------|
| Prometheus | 9090 | Metrics collection |
| Grafana | 5015 | Dashboards & visualization |
| Loki | 3100 | Log aggregation |
| Alertmanager | 9093 | Alert routing |
| Promtail | - | Log shipping |
| Node Exporter | 9100 | Host metrics |
| cAdvisor | 8081 | Container metrics |
| Postgres Exporters | 9187, 9188 | Database metrics |
| Redis Exporters | 9121-9123 | Cache metrics |
| Nginx Exporter | 9113 | Web server metrics |

### Alerts Configured
- Instance down
- High CPU/memory usage
- Low disk space
- High error rate
- Database connection failures

---

## AI Stack

**Location:** `/home/geektrading/ai-brain/`
**Config:** `docker-compose.ai.yml`

| Service | Port | Purpose |
|---------|------|---------|
| Ollama | 11434 | LLM inference engine |
| Open WebUI | 5000 | Chat interface |

---

## Common Commands

### Service Management
```bash
# Start specific stack
cd /home/geektrading/<service>
docker compose up -d

# View all running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# View logs
docker logs <container> --tail 100 -f

# Restart service
docker compose restart <service>
```

### Maps Stack
```bash
cd /home/geektrading/maps
docker compose up -d                                    # Core services
docker compose --profile routing up -d                  # + OSRM
docker compose --profile geocoding up -d                # + Nominatim
docker compose --profile routing --profile geocoding up -d  # All

# Manual tile update
/home/geektrading/maps/scripts/update-tiles.sh
```

### Monitoring Stack
```bash
cd /home/geektrading/monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

### Database Access
```bash
# Maps database
docker exec -it maps_db psql -U maps -d maps

# Data warehouse
docker exec -it postgres-dwh psql -U dwh_user -d datawarehouse

# Markets database
docker exec -it markets_db psql -U openbb -d openbb_data
```

---

## Development Notes

### API Development
- FastAPI with Pydantic validation
- SQLAlchemy for database queries (parameterized)
- httpx for async external API calls
- slowapi for rate limiting
- Redis for caching (optional, graceful fallback)

### Frontend Development
- MapLibre GL JS for maps
- Vanilla JavaScript (no framework)
- Always use `escapeHtml()` for user content
- Use DOM APIs instead of innerHTML for user data

### Security Best Practices
- Never hardcode credentials in docker-compose.yml
- Use .env files for all secrets
- Parameterized queries only (SQLAlchemy text())
- Input validation with Pydantic
- Rate limiting on public endpoints
- Generic error messages (details logged server-side)

---

## Claude Code Skills

### Loki Mode (Installed)

**Location:** `~/.claude/skills/loki-mode/`
**Version:** 2.35.0

Multi-agent autonomous system orchestrating 37 specialized AI agents across 6 swarms:

| Swarm | Agents | Purpose |
|-------|--------|---------|
| Engineering | 8 | frontend, backend, database, mobile, API, QA, performance, infrastructure |
| Operations | 8 | DevOps, SRE, security, monitoring, incident response, release, cost, compliance |
| Business | 8 | marketing, sales, finance, legal, support, HR, investor relations, partnerships |
| Data | 3 | ML, data engineering, analytics |
| Product | 3 | PM, design, technical writing |
| Growth | 4 | growth hacking, community, customer success, lifecycle |

**Invocation:**
```bash
claude --dangerously-skip-permissions
# Then say: Loki Mode
```

---

## Troubleshooting

### Container Won't Start
1. Check .env file exists with required variables
2. Check logs: `docker logs <container>`
3. Verify network: `docker network ls`
4. Check dependencies are running

### Database Connection Failed
1. Verify password matches between .env and container
2. Check container is healthy: `docker ps`
3. Test connection: `docker exec -it <db_container> pg_isready`

### Service Not Accessible
1. Check port mapping: `docker port <container>`
2. Verify Traefik routing: `docker logs traefik`
3. Check firewall rules

---

## Resources

| Resource | Location |
|----------|----------|
| Codebase | `/home/geektrading/` |
| Suite Orchestration | `/home/geektrading/suite/docker-compose.yml` |
| DNS Records | `/home/geektrading/suite/DNS-RECORDS.md` |
| SSO Setup | `/home/geektrading/suite/SSO-SETUP.md` |
| Maps Session Progress | `/home/geektrading/maps/SESSION-PROGRESS.md` |
| Maps API Reference | `/home/geektrading/maps/API-REFERENCE.md` |
| Maps Changelog | `/home/geektrading/maps/CHANGELOG.md` |
| CircleOS Specs | `/home/geektrading/CircleOS/CLAUDE.md` |
