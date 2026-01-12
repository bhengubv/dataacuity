# DataAcuity Maps API Reference

**Base URL:** `https://maps.dataacuity.co.za/api/`

**Authentication:** None required (public API)

**Interactive Docs:** `/api/docs` (Swagger UI)

---

## Geocoding

### Forward Geocode
Convert address/place name to coordinates.

```http
GET /api/geocode?q={query}&limit={limit}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | Yes | Search query (address or place name) |
| limit | int | No | Max results (default: 5) |

**Example:**
```bash
curl "https://maps.dataacuity.co.za/api/geocode?q=Sandton"
```

### Reverse Geocode
Convert coordinates to address.

```http
GET /api/reverse?lat={lat}&lng={lng}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| lat | float | Yes | Latitude |
| lng | float | Yes | Longitude |

---

## Routing

### Get Route
Calculate route between two points with turn-by-turn directions.

```http
POST /api/route
Content-Type: application/json

{
  "origin": "28.0473,-26.2041",
  "destination": "28.0567,-26.1076",
  "mode": "driving"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| origin | string | Yes | Origin coordinates "lng,lat" |
| destination | string | Yes | Destination coordinates "lng,lat" |
| mode | string | No | `driving`, `walking`, `cycling` (default: driving) |
| alternatives | bool | No | Return alternative routes |

**Response includes:**
- Distance (m, text)
- Duration (s, text)
- GeoJSON geometry
- Turn-by-turn steps

---

## Points of Interest (POIs)

### Search POIs
Find POIs within a bounding box.

```http
GET /api/pois?bbox={bbox}&category={category}&limit={limit}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bbox | string | Yes | Bounding box: `minLng,minLat,maxLng,maxLat` |
| category | string | No | Filter by category |
| limit | int | No | Max results (default: 50) |

**Categories:** Restaurant, Hotel, Fuel, ATM, Supermarket, Hospital, Pharmacy, School, Bank, Cafe, Fast Food, Mall, Cinema, Parking, Bus Station, Train Station, Tourist Attraction, Museum, Library, Gym, and more.

### Get POI Details
```http
GET /api/pois/{id}
```

### Get Opening Hours
```http
GET /api/pois/{id}/hours
```

### Get Reviews
```http
GET /api/pois/{id}/reviews
```

### Add Review
```http
POST /api/pois/{id}/reviews
Content-Type: application/json

{
  "rating": 5,
  "text": "Great place!",
  "user_hash": "abc123"
}
```

---

## Weather

### Current Weather & Forecast
Get current conditions and 7-day forecast.

```http
GET /api/weather?lat={lat}&lng={lng}
```

**Response:**
```json
{
  "current": {
    "temperature_c": 25.3,
    "feels_like_c": 26.1,
    "humidity_percent": 45,
    "weather_description": "Partly cloudy"
  },
  "forecast": [
    {
      "date": "2024-12-23",
      "temp_max_c": 28,
      "temp_min_c": 18,
      "precipitation_probability": 20
    }
  ]
}
```

### Weather Alerts
Check for severe weather warnings.

```http
GET /api/weather/alerts?lat={lat}&lng={lng}
```

---

## Elevation

### Single Point Elevation
```http
GET /api/elevation?lat={lat}&lng={lng}
```

**Response:**
```json
{
  "lat": -26.2041,
  "lng": 28.0473,
  "elevation_m": 1753,
  "source": "SRTM"
}
```

### Batch Elevation (max 100 points)
```http
POST /api/elevation/batch
Content-Type: application/json

[
  {"lat": -26.2, "lng": 28.0},
  {"lat": -26.1, "lng": 28.1}
]
```

### Elevation Profile
Get elevation along a route for hiking/cycling.

```http
GET /api/elevation/profile?path={path}&samples={samples}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | Yes | `lat1,lng1|lat2,lng2|...` |
| samples | int | No | Number of samples (10-200, default: 50) |

**Response:**
```json
{
  "profile": [
    {"distance_km": 0, "elevation_m": 1753},
    {"distance_km": 0.5, "elevation_m": 1780}
  ],
  "stats": {
    "min_elevation_m": 1720,
    "max_elevation_m": 1850,
    "total_ascent_m": 150,
    "total_descent_m": 80,
    "total_distance_km": 5.2
  }
}
```

---

## Traffic

### Crowdsourced Traffic (TagMe)
Get traffic from TagMe community data.

```http
GET /api/traffic?bbox={bbox}
```

### HERE Traffic (recommended)
Higher quality traffic data with 250,000 requests/month free tier.

```http
GET /api/traffic/here?bbox={bbox}&refresh={bool}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bbox | string | Yes | Bounding box |
| refresh | bool | No | Bypass cache (default: false) |

### Traffic Incidents
Get accidents, road works, closures.

```http
GET /api/traffic/incidents?bbox={bbox}
```

### Route with Traffic
Get route ETA adjusted for traffic conditions.

```http
GET /api/traffic/route?origin={origin}&destination={dest}&mode={mode}
```

---

## Transit

### Transit Stops
Find bus/train stations.

```http
GET /api/transit/stops?bbox={bbox}&type={type}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bbox | string | Yes | Bounding box |
| type | string | No | `bus`, `train`, or blank for all |

---

## Street View (Mapillary)

Requires `MAPILLARY_ACCESS_TOKEN` environment variable.

### Get Street View Images
```http
GET /api/streetview?lat={lat}&lng={lng}&radius={radius}
```

### Embed Street View
```http
GET /api/streetview/embed/{image_id}
```

---

## Capabilities

Check current feature availability.

```http
GET /api/capabilities
```

**Response:**
```json
{
  "routing": {"status": "available", "provider": "OSRM"},
  "geocoding": {"status": "available", "provider": "Nominatim"},
  "pois": {"status": "available", "count": "34,000+"},
  "weather": {"status": "available", "provider": "Open-Meteo"},
  "elevation": {"status": "available", "provider": "Open-Elevation"},
  "traffic": {
    "crowdsourced": {"status": "available"},
    "here": {"status": "requires_api_key"}
  }
}
```

---

## SDK

JavaScript SDK available at `/sdk/dataacuity-maps.js`

```html
<script src="https://maps.dataacuity.co.za/sdk/dataacuity-maps.js"></script>
<script>
  const maps = new DataAcuityMaps({
    baseUrl: 'https://maps.dataacuity.co.za/api'
  });

  // Geocode
  const results = await maps.geocode('Sandton');

  // Route
  const route = await maps.route(
    { lng: 28.0473, lat: -26.2041 },
    { lng: 28.0567, lat: -26.1076 },
    { mode: 'driving' }
  );

  // Weather
  const weather = await maps.getWeather(-26.2041, 28.0473);

  // Elevation profile
  const profile = await maps.getElevationProfile([
    { lat: -26.2, lng: 28.0 },
    { lat: -26.1, lng: 28.1 }
  ], 50);
</script>
```

---

## Rate Limits & Caching

| Endpoint | Cache TTL | Notes |
|----------|-----------|-------|
| Weather | 30 min | Open-Meteo unlimited |
| Elevation | 24 hours | SRTM data doesn't change |
| HERE Traffic | 3 min | 250k/month free |
| Traffic Incidents | 5 min | 250k/month free |
| Geocoding | None | Nominatim fair use |

---

## Environment Variables

For enhanced features, set these in docker-compose.yml:

```yaml
HERE_API_KEY: ""           # Traffic (250k/month free)
MAPILLARY_ACCESS_TOKEN: "" # Street view (free)
TOMTOM_API_KEY: ""         # Alternative traffic (2.5k/day free)
```

Get free keys:
- HERE: https://developer.here.com/
- Mapillary: https://www.mapillary.com/developer
- TomTom: https://developer.tomtom.com/
