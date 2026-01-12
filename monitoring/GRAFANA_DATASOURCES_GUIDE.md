# 📊 Grafana Datasources Configuration Guide

**Last Updated**: 2025-11-30
**Grafana Version**: 12.3.0
**Status**: ✅ All datasources configured and ready

---

## 🎯 Available Datasources

Your Grafana instance now has **4 datasources** configured:

| Datasource | Type | Purpose | Status |
|------------|------|---------|--------|
| **Prometheus** | Metrics | Time-series metrics from all exporters | ✅ Default |
| **Loki** | Logs | Container logs aggregation | ✅ Active |
| **PostgreSQL-Markets** | Database | Direct queries to Markets database | ✅ Active |
| **PostgreSQL-Warehouse** | Database | Direct queries to Data Warehouse | ✅ Active |

---

## ✅ How to Verify Datasources

### Step 1: Access Datasources Page
1. Open Grafana: http://localhost:5015
2. Click **☰** (menu) → **Connections** → **Data sources**
3. You should see all 4 datasources listed

### Step 2: Test Each Datasource

#### Test Prometheus:
1. Click on **Prometheus**
2. Scroll to bottom → Click **Test** button
3. Should see: ✅ "Successfully queried the Prometheus API"

#### Test Loki:
1. Click on **Loki**
2. Scroll to bottom → Click **Test** button
3. Should see: ✅ "Data source is working"

#### Test PostgreSQL-Markets:
1. Click on **PostgreSQL-Markets**
2. Scroll to bottom → Click **Test** button
3. Should see: ✅ "Database Connection OK"

#### Test PostgreSQL-Warehouse:
1. Click on **PostgreSQL-Warehouse**
2. Scroll to bottom → Click **Test** button
3. Should see: ✅ "Database Connection OK"

---

## 🔍 How to Use Each Datasource

### 1. Prometheus (Metrics)

**Use for**: Monitoring system metrics, application performance, resource usage

**Example Queries**:

```promql
# CPU usage percentage
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage percentage
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Markets API request rate
rate(http_requests_total{job="markets-api"}[5m])

# Redis memory usage
redis_memory_used_bytes

# Nginx requests per second
rate(nginx_http_requests_total[5m])

# PostgreSQL active connections
pg_stat_database_numbackends{datname="openbb_data"}

# Container CPU usage
rate(container_cpu_usage_seconds_total{name!=""}[5m]) * 100
```

**Where to use**:
- All metric-based dashboards
- Performance monitoring panels
- Alert rules

---

### 2. Loki (Logs)

**Use for**: Searching and analyzing container logs

**Example Queries** (LogQL):

```logql
# All Markets API logs
{container="markets_api"}

# Markets API errors only
{container="markets_api"} |= "error"

# All PostgreSQL logs
{container=~"markets_db|data-warehouse_postgres_1"}

# Grafana errors
{container="grafana"} |= "error"

# All container failures
{job="docker"} |= "failed"

# Nginx access logs
{container="dataacuity_portal"}

# Last 100 lines from Prometheus
{container="prometheus"} | tail 100

# Search for specific text
{container="markets_api"} |= "symbol" |= "SPY"
```

**Where to use**:
- **Explore** tab for ad-hoc log searching
- Log panels in dashboards
- Debugging and troubleshooting

---

### 3. PostgreSQL-Markets (Database)

**Use for**: Querying Markets database directly, creating business intelligence dashboards

**Example Queries**:

```sql
-- Count all symbols in database
SELECT COUNT(*) as total_symbols FROM symbols;

-- Recent market data entries
SELECT symbol, date, close, volume
FROM market_data
ORDER BY date DESC
LIMIT 100;

-- Symbols by exchange
SELECT exchange, COUNT(*) as symbol_count
FROM symbols
GROUP BY exchange
ORDER BY symbol_count DESC;

-- Database size
SELECT
    pg_database.datname as database_name,
    pg_size_pretty(pg_database_size(pg_database.datname)) as size
FROM pg_database
WHERE datname = 'openbb_data';

-- Active queries
SELECT pid, usename, application_name, state, query
FROM pg_stat_activity
WHERE state != 'idle';

-- Table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Where to use**:
- Business analytics dashboards
- Data quality monitoring
- Custom market data visualizations

---

### 4. PostgreSQL-Warehouse (Database)

**Use for**: Querying Data Warehouse, ETL monitoring

**Example Queries**:

```sql
-- List all tables
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_name;

-- Row counts per table
SELECT
    schemaname,
    tablename,
    n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Database statistics
SELECT
    numbackends as connections,
    xact_commit as transactions_committed,
    xact_rollback as transactions_rolled_back,
    blks_read as blocks_read,
    blks_hit as blocks_hit,
    tup_returned as rows_returned,
    tup_fetched as rows_fetched,
    tup_inserted as rows_inserted,
    tup_updated as rows_updated,
    tup_deleted as rows_deleted
FROM pg_stat_database
WHERE datname = 'postgres';

-- Recent activity
SELECT
    datname,
    usename,
    application_name,
    client_addr,
    backend_start,
    state,
    query
FROM pg_stat_activity
WHERE datname = 'postgres'
ORDER BY backend_start DESC;
```

**Where to use**:
- ETL pipeline monitoring
- Data warehouse analytics
- Data quality dashboards

---

## 🎨 Creating Dashboards with Different Datasources

### Example: Combined Dashboard

You can create a dashboard that uses multiple datasources:

**Panel 1**: System CPU (Prometheus)
```promql
100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

**Panel 2**: Markets API Logs (Loki)
```logql
{container="markets_api"} |= "error"
```

**Panel 3**: Symbol Count (PostgreSQL-Markets)
```sql
SELECT COUNT(*) FROM symbols;
```

**Panel 4**: Database Size (PostgreSQL-Warehouse)
```sql
SELECT pg_size_pretty(pg_database_size('postgres'));
```

---

## 🔧 Advanced Datasource Features

### Prometheus Features:
- ✅ Query timeout: 60 seconds
- ✅ Cache level: High (faster queries)
- ✅ Incremental querying enabled
- ✅ HTTP method: POST (supports long queries)

### Loki Features:
- ✅ Max lines: 5000 (increased from 1000)
- ✅ Derived fields: Click container name to jump to metrics
- ✅ Log streaming enabled

### PostgreSQL Features:
- ✅ SSL disabled (internal network)
- ✅ PostgreSQL 15 compatible
- ✅ Direct connection to databases
- ✅ Supports all SQL queries

---

## 📚 Quick Tips

### Switching Datasources in a Panel:
1. Edit panel → Click datasource dropdown at top
2. Select different datasource
3. Query editor changes automatically

### Using Variables with Datasources:
1. Dashboard settings → Variables → Add variable
2. Type: Query
3. Data source: Prometheus
4. Query: `label_values(up, job)`
5. Use in panels: `{job="$job"}`

### Exploring Data:
1. Click **Explore** (compass icon in sidebar)
2. Select datasource from dropdown
3. Run ad-hoc queries
4. Click "Add to dashboard" to save useful queries

---

## ✅ Datasource Health Check Commands

Run these to verify datasources are working:

```bash
# Test Prometheus
curl -s http://localhost:9090/api/v1/query?query=up | python3 -m json.tool

# Test Loki
curl -s http://localhost:3100/ready

# Test Markets Database
docker exec markets_db psql -U openbb -d openbb_data -c "SELECT 1;"

# Test Warehouse Database
docker exec data-warehouse_postgres_1 psql -U postgres -c "SELECT 1;"

# Test Grafana datasources API
curl -s http://localhost:5015/api/datasources | python3 -m json.tool
```

---

## 🚀 What's Next?

Now that all datasources are configured:

1. ✅ **Import dashboards** - Use the datasources in pre-built dashboards
2. ✅ **Create custom dashboards** - Build your own visualizations
3. ✅ **Set up alerts** - Get notified of issues
4. ✅ **Explore data** - Use the Explore tab for ad-hoc analysis

---

## 🆘 Troubleshooting

### Datasource shows red "X":
- Check container is running: `docker ps | grep <service>`
- Verify network connectivity: `docker exec grafana ping <service>`
- Check credentials in datasources.yml

### Prometheus queries timing out:
- Reduce time range (use last 15 minutes instead of 24 hours)
- Simplify query (remove complex aggregations)
- Check Prometheus logs: `docker logs prometheus`

### PostgreSQL connection fails:
- Verify database is running: `docker ps | grep postgres`
- Check password is correct
- Ensure Grafana and database on same network

### Loki not showing logs:
- Check Promtail is running: `docker ps | grep promtail`
- Verify logs are being shipped: `docker logs promtail`
- Check Loki is ready: `curl http://localhost:3100/ready`

---

**All datasources are now configured and ready to use! 🎉**

Access Grafana at http://localhost:5015 and start building dashboards!
