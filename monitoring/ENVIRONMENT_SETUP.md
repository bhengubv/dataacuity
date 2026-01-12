# Environment Configuration Guide

## Overview

The DataAcuity monitoring stack uses a centralized `.env` file to manage all configuration variables. This approach provides several benefits:

- **Security**: Sensitive credentials stored in one place, excluded from version control
- **Consistency**: Single source of truth for all environment variables
- **Flexibility**: Easy to modify configuration without editing docker-compose files
- **Portability**: Simple deployment to different environments (dev, staging, production)

## Setup Instructions

### 1. Initial Setup

Copy the example environment file and customize it:

```bash
cd /home/geektrading/monitoring
cp .env.example .env
nano .env  # or use your preferred editor
```

### 2. Required Variables

Update these critical variables in your `.env` file:

```bash
# Admin email
GF_SECURITY_ADMIN_EMAIL=your-email@example.com
GF_USERS_DEFAULT_EMAIL=your-email@example.com

# Server URL
GF_SERVER_ROOT_URL=https://your-monitoring-domain.com

# Database passwords
MARKETS_DB_PASSWORD=your_secure_markets_password
WAREHOUSE_DB_PASSWORD=your_secure_warehouse_password
```

### 3. Optional Configuration

#### Alertmanager Email Alerts

To enable email alerts, uncomment and configure these variables:

```bash
ALERTMANAGER_SMTP_HOST=smtp.gmail.com
ALERTMANAGER_SMTP_PORT=587
ALERTMANAGER_SMTP_FROM=alerts@yourdomain.com
ALERTMANAGER_SMTP_AUTH_USERNAME=your-smtp-username
ALERTMANAGER_SMTP_AUTH_PASSWORD=your-smtp-password
ALERTMANAGER_RECEIVER_EMAIL=your-email@example.com
```

#### Port Customization

If you need to change exposed ports, modify these variables:

```bash
GRAFANA_PORT=5015
PROMETHEUS_PORT=9090
# ... etc
```

## Environment Variable Categories

### Grafana Configuration
- `GF_SECURITY_ADMIN_USER`: Grafana admin username
- `GF_SECURITY_ADMIN_EMAIL`: Admin email address
- `GF_USERS_ALLOW_SIGN_UP`: Allow user registration (false recommended)
- `GF_USERS_DEFAULT_EMAIL`: Default email for new users
- `GF_SERVER_ROOT_URL`: Public URL for Grafana
- `GF_INSTALL_PLUGINS`: Comma-separated list of plugins to install

### Database Credentials
- `MARKETS_DB_PASSWORD`: Markets PostgreSQL database password
- `WAREHOUSE_DB_PASSWORD`: Data warehouse PostgreSQL password

### Redis Configuration
- `REDIS_ADDR_MARKETS`: Markets Redis instance address
- `REDIS_ADDR_TWENTY`: Twenty CRM Redis instance address
- `REDIS_ADDR_AUTOMATISCH`: Automatisch Redis instance address

### Prometheus Settings
- `PROMETHEUS_RETENTION`: Data retention period (default: 90d)
- `PROMETHEUS_STORAGE_PATH`: Storage path for metrics data

### Port Mappings
All service ports are configurable via environment variables:
- `GRAFANA_PORT`: Grafana UI (default: 5015)
- `PROMETHEUS_PORT`: Prometheus UI (default: 9090)
- `LOKI_PORT`: Loki API (default: 3100)
- `NODE_EXPORTER_PORT`: Node exporter metrics (default: 9100)
- `CADVISOR_PORT`: cAdvisor UI (default: 8081)
- Plus exporters for PostgreSQL, Redis, and Nginx

## Security Best Practices

### 1. File Permissions

Ensure your `.env` file has restricted permissions:

```bash
chmod 600 /home/geektrading/monitoring/.env
```

### 2. Password Strength

Generate strong passwords using:

```bash
# Generate a 32-character secure password
openssl rand -base64 32
```

### 3. Version Control

**NEVER commit the `.env` file to version control!**

The `.gitignore` file is configured to exclude:
- `.env` (contains secrets)
- Data directories (grafana_data, prometheus_data, loki_data)

### 4. Regular Rotation

Periodically rotate sensitive credentials:
- Database passwords
- API tokens
- SMTP credentials

## Deployment

### Starting the Stack

```bash
cd /home/geektrading/monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

Docker Compose automatically loads variables from `.env`.

### Verifying Configuration

Check that environment variables are loaded:

```bash
docker compose -f docker-compose.monitoring.yml config
```

### Updating Configuration

After modifying `.env`:

```bash
# Restart affected services
docker compose -f docker-compose.monitoring.yml restart

# Or recreate containers to ensure all changes apply
docker compose -f docker-compose.monitoring.yml up -d --force-recreate
```

## Troubleshooting

### Variables Not Loading

**Problem**: Environment variables not applied to containers

**Solutions**:
1. Verify `.env` file location (must be in same directory as docker-compose.yml)
2. Check syntax in `.env` (no quotes needed for values, no spaces around `=`)
3. Restart Docker Compose: `docker compose down && docker compose up -d`

### Permission Denied

**Problem**: Cannot read `.env` file

**Solution**:
```bash
sudo chown $USER:$USER /home/geektrading/monitoring/.env
chmod 600 /home/geektrading/monitoring/.env
```

### Database Connection Failures

**Problem**: Exporters cannot connect to databases

**Solutions**:
1. Verify passwords match in both `.env` files (monitoring and service-specific)
2. Check network connectivity between containers
3. Confirm database containers are running

## Environment-Specific Configurations

### Development
```bash
GF_SERVER_ROOT_URL=http://localhost:5015
PROMETHEUS_RETENTION=30d  # Less retention for dev
```

### Production
```bash
GF_SERVER_ROOT_URL=https://monitor.dataacuity.co.za
PROMETHEUS_RETENTION=90d
# Enable email alerts
ALERTMANAGER_SMTP_HOST=smtp.gmail.com
# ... etc
```

## Integration with Other Services

The monitoring stack connects to external services via the `data-warehouse_data_stack` network. Ensure these services are running and accessible:

- **Markets Database**: `markets_db:5432`
- **Data Warehouse**: `data-warehouse_postgres_1:5432`
- **Redis Instances**: `markets_redis`, `twenty_redis`, `automatisch_redis`
- **Portal Nginx**: `dataacuity_portal:80`

## Backup Recommendations

### What to Backup

1. **Configuration files** (include in version control):
   - `docker-compose.monitoring.yml`
   - `.env.example`
   - All files in `grafana/provisioning/`
   - All files in `prometheus/`
   - All files in `loki/`

2. **Data volumes** (backup separately):
   - `grafana_data`
   - `prometheus_data`
   - `loki_data`

3. **Secrets** (backup securely):
   - `.env` file (encrypted backup only!)

### Backup Commands

```bash
# Backup configuration (safe to commit)
tar -czf monitoring-config-$(date +%Y%m%d).tar.gz \
  --exclude='.env' \
  --exclude='grafana_data' \
  --exclude='prometheus_data' \
  --exclude='loki_data' \
  /home/geektrading/monitoring/

# Backup data volumes (includes metrics/logs)
docker run --rm \
  -v grafana_data:/data \
  -v $(pwd):/backup \
  ubuntu tar czf /backup/grafana_data-$(date +%Y%m%d).tar.gz /data
```

## Further Reading

- [Grafana Environment Variables](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/)
- [Prometheus Configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)
