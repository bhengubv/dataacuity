# 📊 Complete Grafana Dashboard Setup Guide

**Status**: ✅ All datasources configured
**Ready to import**: 7 dashboards (5 community + 2 custom)

---

## 🎯 Quick Start - Import All Dashboards

### Step 1: Verify Datasources (IMPORTANT!)

Before importing dashboards, verify all datasources are working:

1. Go to http://localhost:5015
2. Click **☰** → **Connections** → **Data sources**
3. You should see:
   - ✅ **Prometheus** (default)
   - ✅ **Loki**
   - ✅ **PostgreSQL-Markets**
   - ✅ **PostgreSQL-Warehouse**

4. Click on each and test:
   - Click datasource → Scroll down → **Test** button
   - Should see green ✅ success message

---

## 📥 Import Dashboards - Two Methods

### Method A: Import by Dashboard ID (Community Dashboards)

**Easiest method for pre-built dashboards from Grafana.com**

1. Click **Dashboards** (left sidebar)
2. Click **New** → **Import**
3. Enter dashboard ID in "Import via grafana.com" field
4. Click **Load**
5. Select **Prometheus** as datasource
6. Click **Import**

---

### Method B: Import from JSON File (Custom Dashboards)

**For our custom DataAcuity dashboards**

1. Click **Dashboards** (left sidebar)
2. Click **New** → **Import**
3. Click **Upload JSON file**
4. Navigate to: `/home/geektrading/monitoring/grafana/dashboards/`
5. Select the JSON file
6. Click **Import**

---

## 🔢 Dashboard Import Checklist

### Priority 1: Essential Monitoring (Import First)

#### ✅ 1. DataAcuity Platform Overview (CUSTOM)
**File**: `dataacuity-overview.json`
**Method**: Upload JSON file
**Shows**:
- Service health status (all services at a glance)
- CPU and memory gauges
- Markets API requests by endpoint
- Portal (Nginx) traffic
- Redis memory usage (all 3 instances)
- PostgreSQL connections (both databases)

**Auto-refresh**: 10 seconds
**Why import first**: Best overview of your entire platform

---

#### ✅ 2. Markets API Performance (CUSTOM)
**File**: `markets-api-dashboard.json`
**Method**: Upload JSON file
**Shows**:
- Request rate gauge
- Requests per second by endpoint (graph)
- HTTP status codes (2xx, 4xx, 5xx)
- Response time percentiles (p95, p99)
- Live API logs

**Auto-refresh**: 10 seconds
**Why import**: Dedicated monitoring for your main API

---

#### ✅ 3. Node Exporter Full
**ID**: **1860**
**Method**: Import by ID
**Shows**:
- CPU usage per core
- Memory timeline
- Disk space and I/O
- Network traffic
- System load
- Filesystem usage

**Why import**: Complete system resource monitoring

---

### Priority 2: Container Monitoring

#### ✅ 4. Docker Container & Host Metrics
**ID**: **193**
**Method**: Import by ID
**Shows**:
- CPU usage per container
- Memory usage per container
- Network I/O per container
- Container count and status

**Why import**: See which containers use most resources

---

#### ✅ 5. cAdvisor Dashboard
**ID**: **14282**
**Method**: Import by ID
**Shows**:
- Detailed container metrics
- CPU throttling
- Memory limits
- Filesystem usage per container

**Why import**: Deep dive into container performance

---

### Priority 3: Service-Specific Monitoring

#### ✅ 6. Redis Dashboard
**ID**: **11835**
**Method**: Import by ID
**Shows**:
- Memory usage (all 3 Redis instances)
- Hit/miss rates
- Commands per second
- Connected clients
- Key counts

**Note**: After import, use dropdown to switch between:
- Markets cache
- Twenty CRM cache
- Automatisch cache

**Why import**: Monitor cache performance

---

#### ✅ 7. PostgreSQL Database
**ID**: **9628**
**Method**: Import by ID
**Shows**:
- Active connections
- Query rate
- Cache hit ratio
- Locks and deadlocks
- Transaction rate

**Note**: Use dropdown to switch between Markets and Warehouse databases

**Why import**: Monitor database health

---

## 🚀 Step-by-Step Import Instructions

### Import Custom Dashboards (Do These First!)

#### Dashboard 1: DataAcuity Platform Overview

```bash
# The file is already created at:
/home/geektrading/monitoring/grafana/dashboards/dataacuity-overview.json
```

**In Grafana**:
1. **Dashboards** → **New** → **Import**
2. Click **Upload JSON file**
3. If using file picker, navigate to the path above
4. **OR** copy the file content and paste into the JSON textarea
5. Click **Import**
6. ✅ Done! The dashboard will load immediately

---

#### Dashboard 2: Markets API Performance

```bash
# The file is already created at:
/home/geektrading/monitoring/grafana/dashboards/markets-api-dashboard.json
```

**In Grafana**: Same steps as above

---

### Import Community Dashboards

#### Dashboard 3: Node Exporter Full (ID: 1860)

1. **Dashboards** → **New** → **Import**
2. Enter: **1860**
3. Click **Load**
4. Datasource dropdown: Select **Prometheus**
5. Click **Import**
6. ✅ Dashboard loads with live data!

#### Dashboard 4: Docker Containers (ID: 193)

Repeat above with ID: **193**

#### Dashboard 5: cAdvisor (ID: 14282)

Repeat above with ID: **14282**

#### Dashboard 6: Redis (ID: 11835)

Repeat above with ID: **11835**

After import:
- Look for dropdown at top (might be labeled "instance" or "server")
- Select: markets, twenty, or automatisch
- Metrics update for that Redis instance

#### Dashboard 7: PostgreSQL (ID: 9628)

Repeat above with ID: **9628**

After import:
- Look for dropdown at top (might be labeled "instance" or "database")
- Select: Markets or Warehouse
- Metrics update for that database

---

## ⚙️ Post-Import Configuration

### For Each Dashboard:

#### 1. Set Auto-Refresh
- Top right corner → Click refresh icon (🔄)
- Select: **10s** or **30s**
- Dashboard will auto-update!

#### 2. Set Time Range
- Top right → Click time range (e.g., "Last 6 hours")
- Recommended: **Last 15 minutes** or **Last 1 hour**
- For historical analysis: **Last 24 hours**

#### 3. Star Your Favorites
- Click ⭐ icon at top of dashboard
- Appears in your favorites for quick access

#### 4. Save Dashboard Settings
- After changing refresh/time settings
- Click 💾 (Save) icon at top right
- Settings are preserved

---

## 🎨 Dashboard Organization

### Recommended Folder Structure

Create folders to organize dashboards:

1. **Dashboards** → **New folder**
2. Create these folders:
   - **📊 Overview** - Put DataAcuity Overview here
   - **🖥️ Infrastructure** - Node Exporter, Docker, cAdvisor
   - **⚙️ Services** - Markets API, Redis, PostgreSQL, Nginx
   - **📈 Custom** - Your custom dashboards

3. Move dashboards into folders:
   - Click dashboard → **Dashboard settings** (gear icon)
   - **General** → **Folder** → Select folder
   - **Save**

---

## 🔍 What You'll See in Each Dashboard

### DataAcuity Platform Overview
**First thing you'll see**:
- Row 1: Service status boxes (green = up, red = down)
  - Markets API: Should be **green** with "1"
  - Portal: Should be **green** with "1"
  - Redis Instances: Should show **"3"** in green
  - PostgreSQL: Should show **"2"** in green
- Row 2: CPU and Memory gauges (should be updating in real-time)
- Bottom rows: Graphs showing requests, traffic, connections

**If you see**:
- Green boxes = Services healthy ✅
- Red boxes = Service down ❌ (investigate!)
- Graphs updating = Metrics flowing ✅

---

### Markets API Performance
**First thing you'll see**:
- Top left: Request rate gauge (should be moving if API is active)
- Top right: Requests/sec graph by endpoint (shows which endpoints are busiest)
- Middle left: HTTP status codes (should see mostly 2xx green bars)
- Middle right: Response time (p95, p99 - lower is better)
- Bottom: Live API logs (real-time log stream)

**Healthy metrics**:
- Response time p95 < 1 second
- Mostly 2xx status codes
- No 5xx errors

---

### Node Exporter Full
**First thing you'll see**:
- Top row: Quick stats (CPU, RAM, disk space, uptime)
- CPU section: Per-core usage graphs
- Memory section: RAM usage over time
- Disk section: Disk I/O and space
- Network section: Bandwidth graphs

**All graphs update in real-time!**

---

## 💡 Pro Tips

### 1. Create Custom Views
- Edit any panel → Modify query
- Example: Change time range from 5m to 1h in queries
- Click **Apply** → **Save dashboard**

### 2. Use Templating
- Add dashboard variables for:
  - Instance selection (switch between servers)
  - Time range presets
  - Service filters

### 3. Set Up Alerts
- Edit panel → **Alert** tab
- Set threshold (e.g., CPU > 90%)
- Configure notification channel
- Get notified before issues occur!

### 4. Share Dashboards
- Click **Share** icon (top right)
- Get link to share with team
- Or export JSON to save/backup

### 5. Keyboard Shortcuts
- Press **?** - Show all keyboard shortcuts
- **d** + **k** - Keyboard shortcuts menu
- **d** + **h** - Go home
- **f** - Toggle fullscreen panel
- **Esc** - Exit panel edit mode

---

## ✅ Verification Checklist

After importing all dashboards, verify:

- [ ] All 7 dashboards imported successfully
- [ ] DataAcuity Overview shows green status boxes
- [ ] Node Exporter shows CPU/memory graphs
- [ ] Markets API dashboard shows request graphs
- [ ] Docker dashboard shows containers
- [ ] Redis dashboard shows memory usage
- [ ] PostgreSQL dashboard shows connections
- [ ] Auto-refresh set to 10s or 30s on each
- [ ] Time range set to appropriate value
- [ ] Starred your favorite dashboards
- [ ] Created folders for organization

---

## 🆘 Troubleshooting

### Dashboard shows "No data"
**Cause**: Datasource not selected or metrics not available
**Fix**:
1. Check datasource dropdown at top (should be Prometheus)
2. Check time range (try "Last 15 minutes")
3. Verify service is running: `docker ps | grep <service>`

### Panel shows "Error"
**Cause**: Query syntax error or datasource issue
**Fix**:
1. Edit panel → Check query syntax
2. Click **Query inspector** → See exact error
3. Verify datasource is working (Connections → Data sources → Test)

### Graphs not updating
**Cause**: Auto-refresh disabled
**Fix**:
- Top right → Click refresh dropdown → Select 10s or 30s

### Dashboard won't import
**Cause**: JSON file error or datasource not found
**Fix**:
- If importing by ID: Check internet connection
- If importing JSON: Verify file path is correct
- Check Grafana logs: `docker logs grafana`

---

## 📚 Next Steps

Once all dashboards are imported:

1. ✅ **Explore Each Dashboard** - Click through and familiarize yourself
2. ✅ **Set Up Alerts** - Configure notifications for critical metrics
3. ✅ **Create Custom Dashboards** - Build dashboards for specific use cases
4. ✅ **Share with Team** - Give team members access to Grafana
5. ✅ **Schedule Reports** - Set up automated dashboard snapshots

---

## 🎯 Quick Reference - All Dashboard IDs

| Dashboard | Import Method | ID/File |
|-----------|--------------|---------|
| DataAcuity Overview | JSON Upload | `dataacuity-overview.json` |
| Markets API Performance | JSON Upload | `markets-api-dashboard.json` |
| Node Exporter Full | Dashboard ID | **1860** |
| Docker Containers | Dashboard ID | **193** |
| cAdvisor | Dashboard ID | **14282** |
| Redis | Dashboard ID | **11835** |
| PostgreSQL | Dashboard ID | **9628** |

---

**All dashboards configured! Your monitoring stack is complete! 🎉**

Access Grafana: http://localhost:5015
