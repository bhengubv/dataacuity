# Data Acuity API Gateway

Unified API Gateway infrastructure for Data Acuity platform, providing both internal service-to-service communication and external client integration capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL CLIENTS                                │
│                    (Mobile Apps, Web Apps, Third-party)                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TRAEFIK (Edge)                                  │
│                    TLS Termination, Load Balancing                          │
└─────────────────────────────────────────────────────────────────────────────┘
                          │                           │
                          ▼                           ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│     EXTERNAL API GATEWAY        │   │        API DOCUMENTATION            │
│     api.dataacuity.co.za        │   │       docs.dataacuity.co.za         │
│                                 │   │                                     │
│  • OAuth2/JWT Authentication    │   │  • Aggregated OpenAPI specs         │
│  • API Key Management           │   │  • Swagger UI                       │
│  • Rate Limiting (per plan)     │   │  • ReDoc                            │
│  • Quota Enforcement            │   │  • Service-specific docs            │
│  • Usage Analytics              │   │                                     │
│  • API Versioning (/api/v1/*)   │   │                                     │
└─────────────────────────────────┘   └─────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTERNAL API GATEWAY                                 │
│                       gateway.internal:8080                                  │
│                                                                              │
│  • Service Mesh Authentication (service tokens)                             │
│  • No rate limiting (trusted services)                                      │
│  • Service Discovery                                                        │
│  • Health Aggregation                                                       │
│  • Request Tracing (correlation IDs)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND SERVICES                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Markets  │ │   Maps   │ │  TagMe   │ │   AI     │ │  Morph   │          │
│  │   API    │ │   API    │ │   API    │ │  Brain   │ │ Convert  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

### External Gateway (Client Integration)
- **OAuth2/JWT Authentication**: Keycloak integration for user sessions
- **API Key Authentication**: For programmatic/application access
- **Company App IP Whitelist**: Trusted IPs with automatic enterprise access
- **Rate Limiting**: Per-plan rate limits (100-1000 req/min)
- **Quota Management**: Monthly usage limits per subscription tier
- **Usage Analytics**: Full request logging and analytics
- **API Versioning**: URL-based versioning (`/api/v1/...`)
- **CORS Support**: Configurable per-origin

### Company App Whitelist
Trusted company application IPs that receive special privileges:

| IP Address | Status |
|------------|--------|
| 197.97.200.118 | Whitelisted |
| 197.97.200.104 | Whitelisted |
| 197.97.200.105 | Whitelisted |
| 197.97.200.106 | Whitelisted |
| 196.22.142.107 | Whitelisted |

**Privileges for whitelisted IPs:**
- No rate limiting (unlimited requests)
- No quota enforcement
- Automatic enterprise-level authentication
- Full access to all services without API key

To check whitelist status: `GET /whitelist/status`

### Internal Gateway (Service Mesh)
- **Service Tokens**: For service-to-service authentication
- **No Rate Limiting**: Trusted internal traffic
- **Service Discovery**: Automatic service registration
- **Health Aggregation**: Unified health checks
- **Request Tracing**: Correlation IDs for debugging

### Documentation Portal
- **Aggregated OpenAPI**: Combined specs from all services
- **Swagger UI**: Interactive API explorer
- **ReDoc**: Beautiful API documentation
- **Per-service docs**: Individual service documentation

## Quick Start

### 1. Setup Environment

```bash
cd /home/geektrading/api-gateway
cp .env.example .env
# Edit .env with your configuration
```

### 2. Start Services

```bash
# Start all gateway services
docker-compose up -d

# Or with analytics dashboard
docker-compose --profile monitoring up -d
```

### 3. Verify Health

```bash
# External gateway
curl http://localhost:8081/health

# Internal gateway
curl http://localhost:8080/health

# Documentation portal
curl http://localhost:8082/
```

## API Endpoints

### External Gateway (api.dataacuity.co.za)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Gateway health check |
| `/services` | GET | List available services |
| `/plans` | GET | List subscription plans |
| `/api/v1/keys` | GET | List your API keys |
| `/api/v1/keys` | POST | Create new API key |
| `/api/v1/keys/{id}` | DELETE | Revoke API key |
| `/api/v1/usage` | GET | Get usage statistics |
| `/api/v1/{service}/*` | * | Proxy to backend service |

### Internal Gateway (gateway.internal:8080)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Gateway health check |
| `/health/services` | GET | All services health |
| `/services` | GET | Service registry |
| `/api/v1/{service}/*` | * | Proxy to backend service |
| `/admin/tokens` | POST | Create service token |

## Authentication

### External Clients

**Option 1: API Key**
```bash
curl -H "X-API-Key: dak_your_api_key_here" \
  https://api.dataacuity.co.za/api/v1/markets/latest-prices
```

**Option 2: JWT Token**
```bash
curl -H "Authorization: Bearer your_jwt_token" \
  https://api.dataacuity.co.za/api/v1/markets/latest-prices
```

### Internal Services

**Service Token**
```bash
curl -H "X-Service-Token: dst_your_service_token" \
  http://gateway.internal:8080/api/v1/markets/latest-prices
```

## Rate Limits & Quotas

| Plan | Rate Limit | API Calls/mo | AI Requests/mo |
|------|------------|--------------|----------------|
| Free | 100/min | 1,000 | 50 |
| Starter | 200/min | 50,000 | 500 |
| Growth | 500/min | 250,000 | 2,500 |
| Enterprise | 1000/min | Unlimited | Unlimited |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GATEWAY_ENVIRONMENT` | Environment name | production |
| `GATEWAY_DOMAIN` | Base domain | dataacuity.co.za |
| `GATEWAY_DATABASE_URL` | PostgreSQL connection | - |
| `GATEWAY_REDIS_URL` | Redis connection | - |
| `GATEWAY_KEYCLOAK_URL` | Keycloak server URL | - |
| `GATEWAY_LOG_LEVEL` | Logging level | INFO |

## Monitoring

### Prometheus Metrics

- `external_gateway_requests_total`: Total requests
- `external_gateway_request_duration_seconds`: Request latency
- `external_gateway_rate_limit_hits_total`: Rate limit violations
- `internal_gateway_service_health_checks_total`: Service health

### Grafana Dashboards

Access at `api-analytics.dataacuity.co.za`:
- API Gateway Overview
- Request latency trends
- Error rates by service
- Top consumers
- Rate limit violations

## Directory Structure

```
api-gateway/
├── shared/                 # Shared code (config, models, auth)
│   ├── config.py          # Configuration classes
│   ├── models.py          # SQLAlchemy models
│   ├── database.py        # Database connection
│   ├── auth.py            # Authentication utilities
│   └── rate_limiter.py    # Rate limiting logic
├── internal/              # Internal gateway
│   └── main.py            # FastAPI application
├── external/              # External gateway
│   └── main.py            # FastAPI application
├── docs/                  # Documentation aggregator
│   └── aggregator.py      # OpenAPI aggregation
├── traefik/               # Traefik configuration
│   └── services.yml       # Routing configuration
├── grafana/               # Grafana dashboards
│   ├── dashboards/        # Dashboard JSON files
│   └── datasources/       # Data source configs
├── scripts/               # Utility scripts
│   └── init-db.sql        # Database initialization
├── docker-compose.yml     # Service orchestration
├── Dockerfile.external    # External gateway image
├── Dockerfile.internal    # Internal gateway image
├── Dockerfile.docs        # Documentation portal image
└── requirements.txt       # Python dependencies
```

## Migrating Existing Clients

### Legacy Endpoint Support

The gateway provides backward compatibility for existing endpoints:

| Legacy Endpoint | New Endpoint | Status |
|-----------------|--------------|--------|
| `/markets/*` | `/api/v1/markets/*` | Deprecated (sunset: 2025-06-01) |

Deprecated endpoints return headers:
```
Deprecation: true
Sunset: 2025-06-01
Link: </api/v1/markets>; rel="successor-version"
```

## Troubleshooting

### Common Issues

**1. 401 Unauthorized**
- Check API key is valid and active
- Verify JWT token hasn't expired
- Ensure correct header name (`X-API-Key` or `Authorization`)

**2. 429 Too Many Requests**
- Check `X-RateLimit-Remaining` header
- Wait for `Retry-After` seconds
- Consider upgrading plan

**3. 502 Bad Gateway**
- Backend service may be down
- Check `/health/services` for status
- Review service logs

### Debug Mode

Enable debug logging:
```bash
GATEWAY_DEBUG=true GATEWAY_LOG_LEVEL=DEBUG docker-compose up
```

## Maps Platform Integration

The DataAcuity Maps Platform provides Google Maps-like functionality with routing, geocoding, POI search, and autocomplete. All services are available via `https://maps.dataacuity.co.za`.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         maps.dataacuity.co.za                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │   Frontend   │ │   Maps API   │ │  TagMe API   │
            │  (port 80)   │ │ (port 8000)  │ │ (port 8000)  │
            │              │ │              │ │              │
            │  • SPA       │ │  • POI       │ │  • Location  │
            │  • SDK       │ │  • Routing   │ │    Ingestion │
            │  • Assets    │ │  • Geocoding │ │  • Tracking  │
            └──────────────┘ └──────────────┘ └──────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │    OSRM      │ │  Nominatim   │ │   PostGIS    │
            │   Routing    │ │  Geocoding   │ │   Database   │
            │              │ │              │ │              │
            │  • Directions│ │  • Forward   │ │  • POIs      │
            │  • Distance  │ │  • Reverse   │ │  • Spatial   │
            │  • Duration  │ │  • Search    │ │    Queries   │
            └──────────────┘ └──────────────┘ └──────────────┘
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | API health check |
| `/api/autocomplete` | GET | Fast POI + Nominatim search |
| `/api/pois/search` | GET | Search POIs by query |
| `/api/pois/nearby` | GET | Find POIs near location |
| `/api/pois/categories` | GET | List POI categories |
| `/api/pois/{id}` | GET | Get POI details |
| `/api/route` | POST | Calculate route between points |
| `/api/geocode/forward` | GET | Address to coordinates |
| `/api/geocode/reverse` | GET | Coordinates to address |
| `/sdk/dataacuity-maps.js` | GET | JavaScript SDK |

### JavaScript SDK (Web Apps)

Drop-in Google Maps replacement for web applications:

```html
<!-- Include the SDK -->
<script src="https://maps.dataacuity.co.za/sdk/dataacuity-maps.js"></script>

<script>
  // Initialize
  const maps = new DataAcuityMaps({
    apiKey: 'optional-for-whitelisted-ips'
  });

  // Autocomplete search
  const results = await maps.autocomplete('Sandton City');
  // Returns: { query: 'Sandton City', count: 2, results: [...] }

  // Get route (note: [lng, lat] order like GeoJSON)
  const route = await maps.getRoute(
    [28.0473, -26.2041],  // Johannesburg
    [28.2293, -25.7479],  // Pretoria
    { profile: 'car' }
  );
  // Returns: { distance_m: 59485, duration_s: 2910, geometry: {...}, steps: [...] }

  // Reverse geocode
  const location = await maps.reverseGeocode(-33.9249, 18.4241);
  // Returns: { display_name: 'Cape Town, Western Cape, South Africa', ... }

  // Nearby POI search
  const nearby = await maps.nearbySearch(
    { lat: -26.1076, lng: 28.0567 },
    { radius: 5000, category: 'Shopping' }
  );

  // Create autocomplete input widget
  const autocomplete = maps.createAutocomplete(
    document.getElementById('search-input'),
    {
      onSelect: (place) => console.log('Selected:', place),
      minChars: 2,
      debounceMs: 300
    }
  );
</script>
```

### React Native SDK (Mobile Apps)

TypeScript SDK with React components and hooks:

```typescript
// Configure once at app startup
import { DataAcuityMaps } from '@dataacuity/maps-sdk';

DataAcuityMaps.configure({
  baseUrl: 'https://maps.dataacuity.co.za/api',
  apiKey: 'optional-for-whitelisted-ips'
});

// Use in components
import { useAutocomplete, useRoute, useNearbyPOIs } from '@dataacuity/maps-sdk';

function LocationSearch() {
  const { results, search, loading } = useAutocomplete();

  return (
    <TextInput
      onChangeText={search}
      placeholder="Search locations..."
    />
  );
}

function RouteDisplay({ origin, destination }) {
  const { route, loading, error } = useRoute(origin, destination);

  if (route) {
    return <Text>{route.distance_text} - {route.duration_text}</Text>;
  }
}
```

**Autocomplete Component:**

```typescript
import { Autocomplete } from '@dataacuity/maps-sdk';

<Autocomplete
  placeholder="Where to?"
  onSelect={(place) => navigation.navigate('Map', { place })}
  showCategories={true}
/>
```

### Direct API Usage

**Autocomplete:**
```bash
curl "https://maps.dataacuity.co.za/api/autocomplete?q=cape&limit=5"
```

Response:
```json
{
  "query": "cape",
  "count": 10,
  "results": [
    {
      "source": "poi",
      "id": 5,
      "title": "Cape Town",
      "subtitle": "Landmark · Cape Town",
      "lat": -33.9249,
      "lng": 18.4241,
      "category": "Landmark"
    }
  ]
}
```

**Routing:**
```bash
curl -X POST "https://maps.dataacuity.co.za/api/route" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": [28.0473, -26.2041],
    "destination": [28.2293, -25.7479]
  }'
```

Response:
```json
{
  "distance_m": 59485.7,
  "duration_s": 2910.8,
  "duration_text": "48 min",
  "distance_text": "59.5 km",
  "geometry": {
    "type": "LineString",
    "coordinates": [[28.047305, -26.204099], ...]
  },
  "steps": [
    {
      "instruction": "",
      "name": "Von Weilligh Street",
      "distance_m": 1.9,
      "duration_s": 7.5,
      "maneuver": "depart"
    }
  ]
}
```

**POI Categories:**
```bash
curl "https://maps.dataacuity.co.za/api/pois/categories"
```

Response:
```json
{
  "categories": [
    { "id": 12, "name": "Landmark", "icon": "place", "color": "#795548", "poi_count": 25 },
    { "id": 1, "name": "Shopping", "icon": "shopping_cart", "color": "#e91e63", "poi_count": 15 },
    { "id": 3, "name": "Hospital", "icon": "local_hospital", "color": "#f44336", "poi_count": 10 }
  ]
}
```

**Nearby Search:**
```bash
curl "https://maps.dataacuity.co.za/api/pois/nearby?lat=-26.1076&lng=28.0567&radius=5000&category=Shopping"
```

### SDK Files Location

The SDK files are available at:

| File | URL | Description |
|------|-----|-------------|
| JavaScript SDK | `https://maps.dataacuity.co.za/sdk/dataacuity-maps.js` | Browser SDK (15KB) |
| React Native SDK | `/home/geektrading/maps/sdk/react-native/` | TypeScript sources |
| Autocomplete Component | `/home/geektrading/maps/sdk/react-native/components/Autocomplete.tsx` | Ready-to-use component |
| React Hooks | `/home/geektrading/maps/sdk/react-native/hooks/useLocation.ts` | `useAutocomplete`, `useRoute`, etc. |

### POI Database

87 pre-seeded South African locations across 15 categories:

| Category | Count | Examples |
|----------|-------|----------|
| Landmark | 25 | Cape Town, Sandton, Nelson Mandela Square |
| Shopping | 15 | Sandton City, V&A Waterfront, Mall of Africa |
| Hospital | 10 | Netcare, Mediclinic, Groote Schuur |
| University | 8 | UCT, Wits, Stellenbosch |
| Nature | 7 | Table Mountain, Kruger National Park |
| Sports | 6 | FNB Stadium, Cape Town Stadium |
| Airport | 6 | OR Tambo, Cape Town International |
| Government | 4 | Parliament, Union Buildings |
| Beach | 4 | Camps Bay, Durban Golden Mile |
| Entertainment | 2 | Sun City, Gold Reef City |

### Coordinate Format

**Important:** The Maps API uses GeoJSON coordinate order `[longitude, latitude]` for route endpoints, but `lat, lng` for query parameters:

```javascript
// Route request body: [lng, lat]
{ "origin": [28.0473, -26.2041], "destination": [28.2293, -25.7479] }

// Query parameters: lat, lng
/api/pois/nearby?lat=-26.1076&lng=28.0567
/api/geocode/reverse?lat=-33.9249&lng=18.4241
```

### Service Ports (Internal)

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| Frontend | maps_frontend | 5022 | Nginx (SPA + SDK) |
| API | maps_api | 5020 | FastAPI backend |
| TagMe | maps_tagme | 5023 | Location ingestion |
| OSRM | maps_osrm | 5024 | Routing engine |
| Nominatim | maps_nominatim | 5025 | Geocoding |
| Tiles | maps_tiles | 5021 | Vector tiles |
| Database | maps_db | 5433 | PostgreSQL + PostGIS |

### Error Handling

```javascript
try {
  const route = await maps.getRoute(origin, destination);
} catch (error) {
  if (error.status === 404) {
    // No route found between points
  } else if (error.status === 429) {
    // Rate limited - wait and retry
  } else if (error.status === 502) {
    // OSRM service unavailable
  }
}
```

### Rate Limits

Maps API follows the same rate limiting as the main API gateway. Whitelisted company IPs have unlimited access.

| Endpoint Type | Standard Limit |
|---------------|----------------|
| Autocomplete | 100 req/min |
| Routing | 50 req/min |
| Geocoding | 50 req/min |
| POI Search | 100 req/min |

## Support

- Documentation: https://docs.dataacuity.co.za
- Issues: https://github.com/dataacuity/api-gateway/issues
- Email: support@dataacuity.co.za
