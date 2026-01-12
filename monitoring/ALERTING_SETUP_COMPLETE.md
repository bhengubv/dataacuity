# Alerting System - Setup Complete

## Summary

The complete alerting system has been successfully configured for the DataAcuity monitoring infrastructure.

**Setup Date**: 2025-11-30
**Alertmanager Version**: 0.29.0
**Status**: ✅ Operational

---

## What Was Configured

### 1. Alertmanager Service
- ✅ Alertmanager deployed and running on port 9093
- ✅ Connected to Prometheus for alert routing
- ✅ SMTP email notifications configured

### 2. SMTP Email Configuration
- **SMTP Server**: mail.thegeek.co.za:587
- **From Address**: social@thegeek.co.za
- **To Address**: tbengu@thegeek.co.za
- **Authentication**: Configured with credentials
- **TLS**: Enabled (port 587 STARTTLS)

### 3. Alert Rules
Successfully loaded **23 alert rules** across **5 groups**:

#### Infrastructure Alerts (6 rules)
- `HighCPUUsage` - Warning when CPU > 80% for 5 minutes
- `CriticalCPUUsage` - Critical when CPU > 95% for 2 minutes
- `HighMemoryUsage` - Warning when memory > 80% for 5 minutes
- `CriticalMemoryUsage` - Critical when memory > 95% for 2 minutes
- `DiskSpaceLow` - Warning when disk < 20% free
- `DiskSpaceCritical` - Critical when disk < 10% free

#### Container Alerts (3 rules)
- `ContainerDown` - Critical when container is down for 1 minute
- `HighContainerMemory` - Warning when container uses > 90% memory limit
- `ContainerCPUThrottling` - Warning when container CPU is being throttled

#### Database Alerts (3 rules)
- `PostgreSQLDown` - Critical when database is unreachable
- `PostgreSQLTooManyConnections` - Warning when > 80 connections
- `PostgreSQLSlowQueries` - Warning when queries take > 60 seconds

#### Application Alerts (4 rules)
- `HighErrorRate` - Warning when error rate > 5%
- `CriticalErrorRate` - Critical when error rate > 20%
- `HighResponseTime` - Warning when p95 response time > 2 seconds
- `LowRequestRate` - Info when request rate drops below 0.01 req/s

#### Monitoring Stack Alerts
- `PrometheusDown` - Critical when Prometheus stops responding
- `GrafanaDown` - Warning when Grafana stops responding
- `PrometheusTSDBCompactionsFailing` - Warning on compaction failures
- `PrometheusTargetDown` - Warning when scrape targets are down

### 4. Alert Routing

Alerts are routed based on severity:

| Severity | Receiver | Group Wait | Repeat Interval |
|----------|----------|------------|-----------------|
| **critical** | email-critical | 0s (immediate) | 1 hour |
| **warning** | email-notifications | 10s | 6 hours |
| **info** | email-notifications | 10s | 24 hours |

### 5. Email Templates

Two HTML email templates configured:

**Standard Alerts** (`email-notifications`):
- Clean, color-coded HTML email
- Shows alert severity, description, and affected instance
- Includes timestamp and status information

**Critical Alerts** (`email-critical`):
- Red banner with "CRITICAL ALERT" header
- Urgent styling to draw attention
- Subject line: 🚨 [CRITICAL] [Alert Name] - DataAcuity
- Includes link to Grafana dashboard

---

## Access Points

### Alertmanager UI
```
URL: http://localhost:9093
```

Features:
- View active alerts
- Silence alerts temporarily
- View alert history
- Check notification status

### Prometheus Alerts View
```
URL: http://localhost:9090/alerts
```

Features:
- See all configured rules
- View rule evaluation status
- Check alert states (pending, firing, inactive)

---

## Testing the Alerting System

### Method 1: Trigger a Test Alert (Manual)

You can create a simple test alert by creating high CPU load:

```bash
# Generate CPU load to trigger HighCPUUsage alert
stress --cpu 8 --timeout 300s

# Or use dd command
dd if=/dev/zero of=/dev/null &
# (kill with: pkill dd)
```

After 5 minutes of high CPU, you should receive an email alert.

### Method 2: Send Test Alert via API

```bash
# Send a test alert directly to Alertmanager
curl -H "Content-Type: application/json" -d '[{
  "labels": {
    "alertname": "TestAlert",
    "severity": "warning",
    "instance": "test-instance"
  },
  "annotations": {
    "summary": "This is a test alert",
    "description": "Testing the alerting pipeline"
  }
}]' http://localhost:9093/api/v2/alerts
```

### Method 3: Check for Existing Alerts

```bash
# View current alerts in Alertmanager
curl http://localhost:9093/api/v2/alerts | python3 -m json.tool

# View alerts in Prometheus
curl http://localhost:9090/api/v1/alerts | python3 -m json.tool
```

---

## Alert Workflow

1. **Prometheus** evaluates alert rules every 15 seconds
2. If condition is met, alert enters **Pending** state
3. After `for` duration (e.g., 5 minutes), alert becomes **Firing**
4. **Alertmanager** receives the firing alert
5. Alert is grouped with similar alerts (10 second window)
6. **Email notification** is sent via SMTP
7. Alert repeats based on severity:
   - Critical: every 1 hour
   - Warning: every 6 hours
   - Info: every 24 hours
8. When condition resolves, alert moves to **Resolved** state

---

## Configuration Files

### Alert Rules
**Location**: `/home/geektrading/monitoring/prometheus/alerts/monitoring.rules.yml`

To add new alert rules:
```bash
nano /home/geektrading/monitoring/prometheus/alerts/monitoring.rules.yml

# Reload Prometheus config
curl -X POST http://localhost:9090/-/reload
```

### Alertmanager Config
**Location**: `/home/geektrading/monitoring/alertmanager/alertmanager.yml`

To modify notification settings:
```bash
nano /home/geektrading/monitoring/alertmanager/alertmanager.yml

# Restart Alertmanager
docker restart alertmanager
```

### Environment Variables
**Location**: `/home/geektrading/monitoring/.env`

SMTP settings (for reference, actual values are in alertmanager.yml):
```
ALERTMANAGER_SMTP_HOST=mail.thegeek.co.za
ALERTMANAGER_SMTP_PORT=587
ALERTMANAGER_SMTP_FROM=social@thegeek.co.za
ALERTMANAGER_RECEIVER_EMAIL=tbengu@thegeek.co.za
```

---

## Silencing Alerts

### Temporary Silence (via UI)
1. Go to http://localhost:9093
2. Click on "Silences"
3. Click "New Silence"
4. Set matcher (e.g., `alertname="HighCPUUsage"`)
5. Set duration
6. Add comment
7. Click "Create"

### Silence via API
```bash
curl -H "Content-Type: application/json" -d '{
  "matchers": [
    {
      "name": "alertname",
      "value": "HighCPUUsage",
      "isRegex": false
    }
  ],
  "startsAt": "2025-11-30T18:00:00Z",
  "endsAt": "2025-11-30T20:00:00Z",
  "createdBy": "admin",
  "comment": "Planned maintenance"
}' http://localhost:9093/api/v2/silences
```

---

## Troubleshooting

### No Email Received

**Check 1: SMTP Connection**
```bash
# Test SMTP from Alertmanager container
docker exec -it alertmanager sh -c "echo 'Test' | nc mail.thegeek.co.za 587"
```

**Check 2: Alertmanager Logs**
```bash
docker logs alertmanager | grep -i "email\|smtp\|error"
```

**Check 3: Alert State**
```bash
# Check if alert is firing
curl http://localhost:9090/api/v1/alerts | grep -i "state"
```

**Common Issues**:
- SMTP credentials incorrect → Check alertmanager.yml
- Firewall blocking port 587 → Check network settings
- Email in spam folder → Check spam/junk folder

### Alert Not Firing

**Check 1: Rule Evaluation**
```bash
# Check if rule is loaded
curl http://localhost:9090/api/v1/rules | grep "alertname"
```

**Check 2: Metrics Available**
```bash
# Verify metrics exist for the alert query
curl -g 'http://localhost:9090/api/v1/query?query=up'
```

**Check 3: Prometheus Logs**
```bash
docker logs prometheus | grep -i "error\|rule"
```

### Alertmanager Not Receiving Alerts

**Check Connection**:
```bash
curl http://localhost:9090/api/v1/alertmanagers
```

Should show alertmanager as "up" and "active".

---

## Customizing Alerts

### Adding a New Alert Rule

Edit `/home/geektrading/monitoring/prometheus/alerts/monitoring.rules.yml`:

```yaml
- alert: MyCustomAlert
  expr: my_metric > 100
  for: 5m
  labels:
    severity: warning
    component: custom
  annotations:
    summary: "Custom metric is high"
    description: "Value is {{ $value }}"
```

Then reload:
```bash
curl -X POST http://localhost:9090/-/reload
```

### Changing Email Recipients

Edit `/home/geektrading/monitoring/alertmanager/alertmanager.yml`:

```yaml
receivers:
  - name: 'email-notifications'
    email_configs:
      - to: 'team@example.com'  # Change recipient
```

Restart:
```bash
docker restart alertmanager
```

### Adding Slack/PagerDuty/Webhook

Example Slack configuration in alertmanager.yml:

```yaml
receivers:
  - name: 'slack-notifications'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

---

## Monitoring the Monitoring

### Alertmanager Metrics
```bash
curl http://localhost:9093/metrics | grep alertmanager_
```

Key metrics:
- `alertmanager_alerts` - Number of active alerts
- `alertmanager_notifications_total` - Total notifications sent
- `alertmanager_notifications_failed_total` - Failed notifications

### Prometheus Self-Monitoring
```bash
curl http://localhost:9090/metrics | grep prometheus_
```

---

## Best Practices

### 1. Alert Fatigue Prevention
- ✅ Use appropriate severity levels
- ✅ Set reasonable `for` durations
- ✅ Use inhibition rules (prevent redundant alerts)
- ✅ Group related alerts

### 2. Clear Alert Messages
- ✅ Descriptive `summary` annotations
- ✅ Actionable `description` with context
- ✅ Include affected instance/service
- ✅ Provide metric values in descriptions

### 3. Testing
- Test new alert rules before deploying to production
- Verify email delivery works
- Check alert grouping and routing
- Test silence functionality

### 4. Documentation
- Document what each alert means
- Include runbooks for critical alerts
- Keep SMTP credentials secure
- Document on-call procedures

---

## Next Steps

### Immediate
1. ✅ Alerting system is operational
2. ⏳ Test email delivery by triggering an alert
3. ⏳ Verify emails arrive in inbox (check spam)
4. ⏳ Set up additional notification channels (Slack, PagerDuty)

### Short-term
- Create runbooks for critical alerts
- Set up alert dashboards in Grafana
- Configure on-call rotation
- Add application-specific alerts

### Long-term
- Integrate with incident management system
- Set up alert analytics
- Create SLO-based alerts
- Implement auto-remediation for common issues

---

## Resources

- **Alertmanager Documentation**: https://prometheus.io/docs/alerting/latest/alertmanager/
- **Alert Rule Configuration**: https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
- **Email Configuration**: https://prometheus.io/docs/alerting/latest/configuration/#email_config

---

## Quick Reference Commands

```bash
# View active alerts
curl http://localhost:9093/api/v2/alerts

# Reload Prometheus config
curl -X POST http://localhost:9090/-/reload

# Restart Alertmanager
docker restart alertmanager

# Check alert rules
curl http://localhost:9090/api/v1/rules

# View Alertmanager config
curl http://localhost:9093/api/v2/status | python3 -m json.tool

# Send test alert
curl -H "Content-Type: application/json" -d '[{
  "labels": {"alertname": "Test", "severity": "warning"},
  "annotations": {"summary": "Test alert"}
}]' http://localhost:9093/api/v2/alerts
```

---

**System Status**: 🟢 Operational
**Alert Rules**: 23 rules across 5 groups
**Notifications**: Email via SMTP (mail.thegeek.co.za)
**Last Updated**: 2025-11-30
