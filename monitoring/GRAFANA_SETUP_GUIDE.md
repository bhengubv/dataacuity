# 📊 Grafana Setup & Dashboard Import Guide

## ✅ Monitoring Stack Status

All services are running successfully:
- ✅ **Grafana** - http://localhost:5015
- ✅ **Prometheus** - http://localhost:9090
- ✅ **Loki** - http://localhost:3100 (ready)
- ✅ **Node Exporter** - Collecting system metrics
- ✅ **cAdvisor** - Collecting container metrics
- ✅ **Promtail** - Shipping logs to Loki
- ✅ **PostgreSQL Exporters** - Ready for database monitoring

---

## 🔐 Step 1: Access Grafana

1. Open your web browser
2. Navigate to: **http://localhost:5015**
3. You'll see the Grafana login page

**Default Credentials:**
- Username: `admin`
- Password: `admin`

**Important:** Grafana will prompt you to change the password on first login. Choose a strong password!

---

## 📊 Step 2: Verify Data Sources

Grafana has been pre-configured with data sources via provisioning:

1. Click the **menu icon** (☰) in the top left
2. Go to **Connections** → **Data sources**
3. You should see:
   - ✅ **Prometheus** (default)
   - ✅ **Loki**

4. Click on each to verify they're working:
   - Click **Prometheus** → Scroll down → Click **Test**
   - Should see: "Successfully queried the Prometheus API"
   - Repeat for **Loki**

---

## 📈 Step 3: Import Pre-Built Dashboards

### Method 1: Import by Dashboard ID (Recommended)

1. Click **Dashboards** (left sidebar)
2. Click **New** → **Import**
3. Enter a dashboard ID from the list below
4. Click **Load**
5. Select **Prometheus** as the data source
6. Click **Import**

### Recommended Dashboards:

| Dashboard | ID | Description |
|-----------|----|----|
| **Node Exporter Full** | `1860` | Complete system metrics (CPU, RAM, disk, network) |
| **Docker Container & Host Metrics** | `193` | Container resource usage |
| **PostgreSQL Database** | `9628` | Database performance metrics |
| **Loki Dashboard** | `13639` | Log viewer and search |
| **cAdvisor exporter** | `14282` | Detailed container metrics |

### Method 2: Import from JSON File

If method 1 fails, download JSON files manually:

1. Go to https://grafana.com/grafana/dashboards/1860
2. Click **Download JSON**
3. In Grafana: **Dashboards** → **Import** → **Upload JSON file**
4. Select the downloaded file
5. Choose **Prometheus** as data source
6. Click **Import**

---

## 🎯 Step 4: Explore Your First Dashboard

After importing **Node Exporter Full** (ID: 1860):

1. Go to **Dashboards** → Browse
2. Click **Node Exporter Full**
3. You should see:
   - CPU usage (all cores)
   - Memory usage
   - Disk space and I/O
   - Network traffic
   - System load
   - Temperature (if sensors available)

**Tip:** Use the time range selector (top right) to change the view (Last 15 minutes, Last 1 hour, etc.)

---

## 🔍 Step 5: Explore Logs with Loki

1. Click **Explore** (compass icon in left sidebar)
2. Select **Loki** from the data source dropdown
3. Click **Log browser** button
4. Select a label (e.g., `container="grafana"`)
5. Click **Show logs**
6. You'll see real-time logs from your containers!

**Useful Loki queries:**
```
{container="markets_api"}                    # Markets API logs
{container=~"postgres.*"}                    # All PostgreSQL logs
{container="grafana"} |= "error"             # Grafana errors only
{job="docker"} |= "failed"                   # All container failures
```

---

## 🛠️ Step 6: Create Your First Custom Dashboard

1. Click **Dashboards** → **New dashboard**
2. Click **Add visualization**
3. Select **Prometheus** as data source
4. In the query editor, enter:
   ```
   up
   ```
5. This shows which services Prometheus can scrape (1 = up, 0 = down)
6. Click **Apply**
7. Click **Save dashboard** (icon in top right)
8. Name it: "My Monitoring Overview"

---

## 📊 Recommended Panels to Add

### CPU Usage Panel
```promql
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

### Memory Usage Panel
```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

### Disk Space Panel
```promql
(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"} * 100
```

### Container Count
```promql
count(container_last_seen)
```

### Markets API Request Rate (if /metrics endpoint exists)
```promql
rate(http_requests_total{job="markets-api"}[5m])
```

---

## 🔔 Step 7: Set Up Alerts (Optional)

1. Go to **Alerting** → **Alert rules**
2. Click **New alert rule**
3. Example: Alert when disk space > 90%
   ```promql
   (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 < 10
   ```
4. Set threshold and notification channel
5. Save alert rule

---

## 🎨 Dashboard Customization Tips

### Change Theme
1. Click your profile (bottom left)
2. **Preferences** → **UI Theme**
3. Choose: Light, Dark, or System

### Add Dashboard Variables
1. Edit dashboard → **Settings** (gear icon)
2. **Variables** → **Add variable**
3. Example: Add instance variable to switch between servers

### Share Dashboards
1. Open dashboard → Click **Share** (icon in top right)
2. Get link, embed code, or export JSON

---

## 🔧 Troubleshooting

### No data showing in dashboards
- Check Prometheus targets: http://localhost:9090/targets
- Ensure services are running: `docker compose ps`
- Verify data source connection in Grafana

### Can't login
- Default credentials: admin / admin
- If changed and forgotten, reset:
  ```bash
  docker exec grafana grafana cli admin reset-admin-password newpassword
  ```

### Dashboard import fails
- Try importing from JSON file instead of ID
- Check internet connection (downloads from grafana.com)
- Verify Prometheus data source is configured

### Loki not showing logs
- Check Loki is ready: `curl http://localhost:3100/ready`
- Verify Promtail is running: `docker ps | grep promtail`
- Check Promtail logs: `docker logs promtail`

---

## 📚 Next Steps

1. ✅ **Import all recommended dashboards**
2. ✅ **Create custom dashboard for Markets API** (once /metrics endpoint is added)
3. ✅ **Set up alerts for critical metrics** (disk space, memory, services down)
4. ✅ **Configure Slack/email notifications**
5. ✅ **Add to Caddy reverse proxy**: monitor.dataacuity.co.za → localhost:5015
6. ✅ **Enable authentication for Prometheus** (currently open to localhost only)

---

## 🌐 Access from Other Devices

To access Grafana from other devices on your network:

1. Find your server's IP address:
   ```bash
   hostname -I
   ```

2. Access from other device:
   ```
   http://YOUR_SERVER_IP:5015
   ```

3. For production, set up Caddy reverse proxy:
   ```
   monitor.dataacuity.co.za {
       reverse_proxy localhost:5015
   }
   ```

---

## 📖 Resources

- **Grafana Docs**: https://grafana.com/docs/grafana/latest/
- **Dashboard Gallery**: https://grafana.com/grafana/dashboards/
- **PromQL Guide**: https://prometheus.io/docs/prometheus/latest/querying/basics/
- **LogQL Guide** (Loki): https://grafana.com/docs/loki/latest/query/

---

**Your monitoring stack is now ready! 🎉**

Access Grafana at http://localhost:5015 and start exploring your metrics!
