# DataAcuity Monitoring Stack

Complete observability stack for the DataAcuity platform.

## Components

- **Prometheus** (Port 9090) - Metrics collection and storage
- **Grafana** (Port 5015) - Visualization and dashboards
- **Loki** (Port 3100) - Log aggregation
- **Promtail** - Log shipper (collects Docker logs)
- **Node Exporter** (Port 9100) - System metrics
- **cAdvisor** (Port 8081) - Container metrics
- **PostgreSQL Exporters** (Ports 9187, 9188) - Database metrics

## Quick Start

```bash
# Start monitoring stack
cd /home/geektrading/monitoring
docker-compose -f docker-compose.monitoring.yml up -d

# Check status
docker-compose -f docker-compose.monitoring.yml ps

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f grafana

# Stop monitoring stack
docker-compose -f docker-compose.monitoring.yml down
```

## Access

- **Grafana**: http://localhost:5015 (admin/admin - change on first login)
- **Prometheus**: http://localhost:9090
- **cAdvisor**: http://localhost:8081

## Grafana Setup

1. Login to Grafana: http://localhost:5015
2. Default credentials: `admin` / `admin` (change immediately!)
3. Datasources are auto-configured:
   - Prometheus (default)
   - Loki
4. Import pre-built dashboards:
   - Node Exporter Full: Dashboard ID `1860`
   - Docker Container Metrics: Dashboard ID `193`
   - PostgreSQL Database: Dashboard ID `9628`

### Importing Dashboards

1. Go to Dashboards → Import
2. Enter dashboard ID (e.g., `1860`)
3. Select Prometheus datasource
4. Click Import

## Pre-built Dashboards to Import

| Dashboard | ID | Purpose |
|-----------|----|----|
| Node Exporter Full | 1860 | System metrics (CPU, memory, disk, network) |
| Docker Container & Host Metrics | 193 | Container resource usage |
| PostgreSQL Database | 9628 | Database performance metrics |
| Loki Logs Dashboard | 13639 | Log viewer and search |
| Redis Dashboard | 11835 | Redis metrics (when deployed) |

## Alerts

Basic alerts are configured in `/monitoring/prometheus/alerts/basic-alerts.yml`:

- Instance down (5 min)
- High CPU usage (>80% for 5 min)
- High memory usage (>85% for 5 min)
- Low disk space (<10%)
- Container down (2 min)
- High API error rate (>5% for 5 min)
- Database connection failures

## Monitoring Metrics

### System Metrics (Node Exporter)
- CPU usage
- Memory usage
- Disk usage and I/O
- Network traffic
- Load average

### Container Metrics (cAdvisor)
- Container CPU and memory usage
- Container network I/O
- Container filesystem usage
- Container count

### Database Metrics (PostgreSQL Exporter)
- Active connections
- Database size
- Transaction rate
- Query performance
- Replication lag (when configured)

### Application Metrics (Custom)
- HTTP request rate
- Response times
- Error rates
- API endpoint usage

## Data Retention

- **Prometheus**: 90 days of metrics
- **Loki**: 31 days of logs
- **Grafana**: Unlimited (dashboards and configs)

## Troubleshooting

### Grafana won't start
```bash
# Check logs
docker logs grafana

# Check permissions
sudo chown -R 472:472 /home/geektrading/monitoring/grafana

# Restart
docker-compose -f docker-compose.monitoring.yml restart grafana
```

### Prometheus not scraping targets
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Prometheus config
docker exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Reload Prometheus config
curl -X POST http://localhost:9090/-/reload
```

### No logs in Loki
```bash
# Check Promtail is running
docker logs promtail

# Check Loki can receive logs
curl -X POST http://localhost:3100/loki/api/v1/push

# Check Docker socket permissions
ls -la /var/run/docker.sock
```

## Adding New Services to Monitor

### Add Metrics Scraping

Edit `/monitoring/prometheus/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'my-new-service'
    static_configs:
      - targets: ['my-service:9090']
```

Reload Prometheus:
```bash
curl -X POST http://localhost:9090/-/reload
```

### Add Database Monitoring

Add PostgreSQL exporter to `docker-compose.monitoring.yml`:

```yaml
postgres-exporter-mydb:
  image: prometheuscommunity/postgres-exporter:latest
  environment:
    DATA_SOURCE_NAME: "postgresql://user:pass@host:5432/dbname?sslmode=disable"
  networks:
    - monitoring
```

## Security Notes

- Change Grafana admin password immediately!
- Don't expose Prometheus/Grafana ports to the internet (use Caddy reverse proxy)
- Configure authentication for Prometheus (basic auth or OAuth)
- Regularly update Docker images

## Next Steps

1. Configure Alertmanager for Slack/email notifications
2. Create custom dashboards for Markets API
3. Set up long-term metrics storage (Thanos or Cortex)
4. Configure backup for Grafana dashboards
5. Set up SSO for Grafana (Keycloak)

## Resources

- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/
- Loki: https://grafana.com/docs/loki/
- Grafana Dashboards: https://grafana.com/grafana/dashboards/
