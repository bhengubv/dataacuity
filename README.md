# DataAcuity Platform

A comprehensive, privacy-first integrated platform consisting of 20+ interconnected services for financial markets, geospatial mapping, workflow automation, analytics, and threat intelligence.

**Domain:** `dataacuity.co.za`
**Primary Stack:** Python (FastAPI), PostgreSQL, Docker, Traefik, Keycloak

## Services

| Service | Port | Description |
|---------|------|-------------|
| **suite** | - | Master orchestration (Traefik reverse proxy, Keycloak SSO) |
| **portal** | 5006 | Landing page hub |
| **maps** | 5020-5025 | Geospatial platform with PostGIS, OSRM routing, Nominatim geocoding, MapLibre frontend |
| **markets** | 8000, 5010 | Financial markets data platform (OpenBB) |
| **api-gateway** | 8084 | Unified API gateway with authentication and rate limiting |
| **bio** | 3000 | Link-in-bio tool (Nuxt 3) |
| **monitoring** | 9090, 5015 | Prometheus, Grafana, Loki observability stack |
| **data-warehouse** | 5001 | Analytics PostgreSQL with DBT transformations |
| **superset** | 8088 | Business intelligence and visualization |
| **n8n** | 5678 | Workflow automation |
| **airbyte** | - | ETL/data integration platform |
| **twenty** | 3000 | CRM platform |
| **morph** | - | File format converter |
| **ai-brain** | 11434, 8080 | Ollama + Open WebUI for AI inference |
| **learn** | - | JupyterLite interactive notebooks |
| **developer-studio** | - | Browser-based IDE |
| **sandbox** | - | Webstudio visual builder |
| **tagme** | 5023 | High-throughput location data ingestion |
| **automatisch** | - | Alternative workflow automation |
| **dashboard** | - | System status dashboard |
| **CircleOS** | - | Privacy-first mobile OS specifications |

## Architecture

```
                                    ┌─────────────────┐
                                    │    Traefik      │
                                    │  (Reverse Proxy)│
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
            ┌───────┴───────┐       ┌───────┴───────┐       ┌───────┴───────┐
            │   Keycloak    │       │  API Gateway  │       │    Portal     │
            │    (SSO)      │       │ (Auth/Routing)│       │  (Landing)    │
            └───────────────┘       └───────┬───────┘       └───────────────┘
                                            │
        ┌───────────────┬───────────────┬───┴───┬───────────────┬───────────────┐
        │               │               │       │               │               │
   ┌────┴────┐    ┌────┴────┐    ┌────┴────┐  ┌┴───────┐  ┌────┴────┐    ┌────┴────┐
   │  Maps   │    │ Markets │    │   Bio   │  │  CRM   │  │ Superset│    │   N8N   │
   │ (Geo)   │    │(Finance)│    │ (Links) │  │(Twenty)│  │  (BI)   │    │(Workflow│
   └────┬────┘    └────┬────┘    └────┬────┘  └───┬────┘  └────┬────┘    └─────────┘
        │              │              │           │            │
   ┌────┴────┐    ┌────┴────┐    ┌────┴────┐     │       ┌────┴────┐
   │ PostGIS │    │ Postgres│    │ Postgres│     │       │   DWH   │
   │  + OSRM │    │         │    │         │     │       │ + DBT   │
   └─────────┘    └─────────┘    └─────────┘     │       └─────────┘
                                                 │
                                    ┌────────────┴────────────┐
                                    │       Monitoring        │
                                    │ Prometheus/Grafana/Loki │
                                    └─────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- 16GB+ RAM recommended
- 100GB+ disk space

### Start Core Services

```bash
# Start the orchestration layer (Traefik + Keycloak)
cd suite && docker compose up -d

# Start monitoring
cd ../monitoring && docker compose up -d

# Start maps platform
cd ../maps && docker compose up -d
```

### Start Individual Services

```bash
# Markets platform
cd markets && docker compose up -d

# API Gateway
cd api-gateway && docker compose up -d

# Bio (link-in-bio)
cd bio && docker compose up -d
```

## Configuration

Each service has its own configuration:

- **Environment:** Copy `.env.example` to `.env` and configure
- **Docker:** Modify `docker-compose.yml` as needed
- **Secrets:** Never commit `.env` files (they're gitignored)

### Required Environment Variables

| Service | Required Variables |
|---------|-------------------|
| maps | `MAPS_DB_PASSWORD`, `ALLOWED_ORIGINS` |
| markets | `DATABASE_URL`, `API_KEYS` |
| api-gateway | `JWT_SECRET`, `DB_PASSWORD` |
| suite | `KEYCLOAK_ADMIN_PASSWORD`, `TRAEFIK_DASHBOARD_PASSWORD` |

## Development

### Directory Structure

```
/home/geektrading/
├── suite/                    # Master orchestration
├── maps/                     # Geospatial platform
│   ├── api/                  # FastAPI backend
│   ├── frontend/             # MapLibre frontend
│   ├── db/                   # Database schemas
│   └── scripts/              # Import scripts
├── markets/                  # Financial platform
├── api-gateway/              # Unified gateway
├── monitoring/               # Observability stack
├── data-warehouse/           # Analytics + DBT
└── [other services]/
```

### Common Commands

```bash
# View logs
docker logs <container_name> --tail 100 -f

# Rebuild after changes
docker compose build <service>
docker compose up -d <service>

# Database access
docker exec -it <db_container> psql -U <user> -d <database>

# Health check
curl http://localhost:<port>/health
```

## Networks

| Network | Purpose |
|---------|---------|
| `dataacuity_network` | Primary internal network |
| `maps_network` | Geospatial services |
| `data-warehouse_data_stack` | Analytics services |

## Security

- **Authentication:** Keycloak SSO (OAuth2/OIDC)
- **API Security:** JWT validation, rate limiting, API keys
- **Database:** Parameterized queries, no hardcoded credentials
- **Frontend:** XSS prevention, CORS whitelist, CSP headers

## Monitoring

- **Metrics:** Prometheus (`/metrics` endpoints)
- **Dashboards:** Grafana at `grafana.dataacuity.co.za`
- **Logs:** Loki aggregation via Promtail
- **Alerts:** Alertmanager for critical events

## Documentation

- [Maps API Reference](maps/API-REFERENCE.md)
- [CircleOS Specification](CircleOS/README.md)
- [API Gateway Setup](api-gateway/README.md)

## License

Proprietary - All rights reserved.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
