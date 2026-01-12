# DataAcuity DNS Records Configuration

## Server IP
```
197.97.200.106
```

## Required DNS A Records

Configure these DNS A records pointing to your server IP:

| Subdomain | Type | Value | Service |
|-----------|------|-------|---------|
| `dataacuity.co.za` | A | 197.97.200.106 | Portal (main) |
| `markets.dataacuity.co.za` | A | 197.97.200.106 | Markets Dashboard |
| `brain.dataacuity.co.za` | A | 197.97.200.106 | AI Assistant (Open WebUI) |
| `crm.dataacuity.co.za` | A | 197.97.200.106 | Twenty CRM |
| `twenty.dataacuity.co.za` | A | 197.97.200.106 | Twenty CRM (alias) |
| `n8n.dataacuity.co.za` | A | 197.97.200.106 | Workflows (N8N) |
| `bio.dataacuity.co.za` | A | 197.97.200.106 | Bio Pages |
| `morph.dataacuity.co.za` | A | 197.97.200.106 | File Converter |
| `dashboard.dataacuity.co.za` | A | 197.97.200.106 | Grafana Monitoring |
| `super.dataacuity.co.za` | A | 197.97.200.106 | Superset Analytics |
| `airbyte.dataacuity.co.za` | A | 197.97.200.106 | Airbyte ETL |
| `auto.dataacuity.co.za` | A | 197.97.200.106 | Automatisch |
| `sandbox.dataacuity.co.za` | A | 197.97.200.106 | Webstudio Sandbox |

## Optional: Wildcard Record

Instead of individual A records, you can use a wildcard:

| Type | Name | Value |
|------|------|-------|
| A | `*.dataacuity.co.za` | 197.97.200.106 |
| A | `dataacuity.co.za` | 197.97.200.106 |

## SSL Certificates

SSL certificates are managed by Let's Encrypt via Certbot. Certificates are stored at:
```
/etc/letsencrypt/live/dashboard.dataacuity.co.za/
```

To add a new subdomain with SSL:
```bash
sudo certbot --nginx -d newsubdomain.dataacuity.co.za
```

## Current Nginx Configuration

All services are reverse-proxied through nginx:
- Config location: `/etc/nginx/sites-available/`
- Enabled configs: `/etc/nginx/sites-enabled/`

### Active Services

| Service | Local Port | Domain |
|---------|------------|--------|
| Portal | 5006 | dataacuity.co.za |
| Markets | 5010 | markets.dataacuity.co.za |
| AI Brain | 5000 | brain.dataacuity.co.za |
| Twenty CRM | 5005 | crm.dataacuity.co.za, twenty.dataacuity.co.za |
| N8N | 5008 | n8n.dataacuity.co.za |
| Bio | 5009 | bio.dataacuity.co.za |
| Morph | 5011 | morph.dataacuity.co.za |
| Grafana | 5015 | dashboard.dataacuity.co.za |
| Superset | 5003 | super.dataacuity.co.za |
| Airbyte | 5002 | airbyte.dataacuity.co.za |
| Sandbox | 5012 | sandbox.dataacuity.co.za |

## Verification

Test DNS propagation:
```bash
# Check A record
dig +short dataacuity.co.za

# Check all subdomains
for sub in markets brain crm n8n bio morph dashboard super airbyte; do
  echo "$sub.dataacuity.co.za: $(dig +short $sub.dataacuity.co.za)"
done
```

Test HTTPS:
```bash
curl -sI https://dataacuity.co.za | head -2
```
