# DataAcuity Suite

Unified orchestration for the DataAcuity platform - a comprehensive data intelligence and analytics ecosystem.

## Quick Start

```bash
# 1. Generate secrets
./scripts/generate-secrets.sh

# 2. Start all services
./scripts/suite.sh up

# Or start specific profiles
./scripts/suite.sh up core monitoring
```

## Architecture

```
                    ┌─────────────────┐
                    │    Traefik      │ ← SSL/TLS termination
                    │  (*.dataacuity) │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │    Keycloak     │ ← Single Sign-On
                    │  (auth.domain)  │
                    └────────┬────────┘
                             │
    ┌────────────────────────┼────────────────────────┐
    │                        │                        │
┌───┴────┐            ┌──────┴──────┐          ┌─────┴─────┐
│  Core  │            │  Analytics  │          │ Automation│
├────────┤            ├─────────────┤          ├───────────┤
│ Portal │            │  Superset   │          │   N8N     │
│Markets │            │  DBT        │          │  Airbyte  │
│  Bio   │            │  Warehouse  │          │           │
│ Twenty │            │             │          │           │
└───┬────┘            └──────┬──────┘          └─────┬─────┘
    │                        │                       │
    └────────────────────────┼───────────────────────┘
                             │
                    ┌────────┴────────┐
                    │   Monitoring    │
                    │  Prometheus     │
                    │   Grafana       │
                    └─────────────────┘
```

## Service Profiles

| Profile | Services | Ports |
|---------|----------|-------|
| `gateway` | Traefik | 80, 443 |
| `auth` | Keycloak, Keycloak DB | - |
| `core` | Portal, Markets (API + Dashboard), Bio | - |
| `crm` | Twenty CRM, Twenty DB/Redis | - |
| `analytics` | Superset, Data Warehouse, DBT | - |
| `automation` | N8N | - |
| `etl` | Airbyte (Server, Worker, Webapp) | - |
| `ai` | Ollama, Open WebUI | - |
| `tools` | Morph (ConvertX), Dashboard | - |
| `monitoring` | Prometheus, Grafana, Loki, Alertmanager, Exporters | - |

## URLs (via Traefik)

| Service | URL |
|---------|-----|
| Portal | https://dataacuity.co.za |
| Markets | https://markets.dataacuity.co.za |
| Markets API | https://api.markets.dataacuity.co.za |
| Bio | https://bio.dataacuity.co.za |
| CRM | https://crm.dataacuity.co.za |
| Analytics | https://analytics.dataacuity.co.za |
| N8N | https://n8n.dataacuity.co.za |
| ETL | https://etl.dataacuity.co.za |
| AI Brain | https://ai.dataacuity.co.za |
| File Converter | https://convert.dataacuity.co.za |
| Grafana | https://grafana.dataacuity.co.za |
| Prometheus | https://prometheus.dataacuity.co.za |
| Alertmanager | https://alerts.dataacuity.co.za |
| Keycloak | https://auth.dataacuity.co.za |
| Traefik Dashboard | https://traefik.dataacuity.co.za |

## Scripts

```bash
# Suite management
./scripts/suite.sh up [profiles...]      # Start services
./scripts/suite.sh down [profiles...]    # Stop services
./scripts/suite.sh restart [profiles...] # Restart services
./scripts/suite.sh status                # Check status
./scripts/suite.sh logs [profiles...]    # View logs
./scripts/suite.sh ps                    # List containers
./scripts/suite.sh pull                  # Update images
./scripts/suite.sh build                 # Build custom images
./scripts/suite.sh migrate               # Migration helper

# Environment management
./scripts/generate-secrets.sh            # Generate new .env
./scripts/generate-secrets.sh --migrate  # Migrate existing secrets
./scripts/validate-env.sh                # Validate configuration

# SSO setup
./scripts/setup-keycloak.sh              # Initial Keycloak setup
./scripts/setup-keycloak.sh --export     # Export realm config
```

## Migration from Old Setup

1. Stop old services:
```bash
cd ~/markets && docker compose down
cd ~/bio && docker compose down
cd ~/portal && docker compose down
cd ~/twenty && docker compose down
cd ~/superset && docker compose down
cd ~/n8n && docker compose down
cd ~/automatisch && docker compose down  # (being retired)
cd ~/airbyte && docker compose down
cd ~/ai-brain && docker compose -f docker-compose.ai.yml down
cd ~/morph && docker compose down
cd ~/dashboard && docker compose down
cd ~/monitoring && docker compose -f docker-compose.monitoring.yml down
```

2. Generate secrets (migrating existing):
```bash
cd ~/suite
./scripts/generate-secrets.sh --migrate
```

3. Start the suite:
```bash
./scripts/suite.sh up
```

Data is preserved because the suite uses the same volume names.

## Configuration

### Environment Variables

All configuration is in `.env`. Generate with:
```bash
./scripts/generate-secrets.sh
```

Key variables:
- `DOMAIN` - Base domain (default: dataacuity.co.za)
- `TIMEZONE` - Server timezone
- `ACME_EMAIL` - Email for SSL certificates
- `*_DB_PASSWORD` - Database passwords
- `*_SECRET` - Application secrets

### Traefik Configuration

- `traefik/config/middlewares.yml` - Rate limiting, security headers
- `traefik/config/tls.yml` - TLS configuration

### Keycloak SSO

1. Start auth profile: `./scripts/suite.sh up auth`
2. Run setup: `./scripts/setup-keycloak.sh`
3. Configure each service with generated client secrets

## Monitoring

### Grafana Dashboards

Pre-configured dashboards:
- System overview (CPU, memory, disk)
- Docker container metrics
- PostgreSQL performance
- Redis metrics
- Application logs

### Alerting

Alerts configured in `../monitoring/prometheus/alerts/`:
- Service down
- High CPU/memory usage
- Disk space warnings
- Database connection issues

## Directory Structure

```
suite/
├── docker-compose.yml        # Master orchestration
├── .env                      # Configuration (generated)
├── .env.example              # Configuration template
├── README.md                 # This file
├── traefik/
│   └── config/
│       ├── middlewares.yml   # Middleware configuration
│       └── tls.yml           # TLS settings
├── keycloak/
│   └── realm-dataacuity.json # SSO realm configuration
└── scripts/
    ├── suite.sh              # Main management script
    ├── generate-secrets.sh   # Secret generator
    ├── validate-env.sh       # Configuration validator
    └── setup-keycloak.sh     # SSO setup script
```

## Troubleshooting

### Services not starting
```bash
./scripts/suite.sh logs <profile>
docker compose logs <service-name>
```

### Network issues
```bash
docker network ls
docker network inspect dataacuity_network
```

### Database connectivity
```bash
docker exec -it <db-container> psql -U <user> -d <database>
```

### SSL/TLS issues
```bash
docker logs traefik
# Check ACME storage
docker exec traefik cat /acme/acme.json
```

## Support

- Issues: https://github.com/anthropics/claude-code/issues
- Documentation: Check individual service docs in their directories
