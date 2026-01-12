# DataAcuity Maps SDK

Drop-in replacement for Google Maps API with routing, geocoding, POI search, and autocomplete.

## Quick Start

### Web (JavaScript)

```html
<script src="https://maps.dataacuity.co.za/sdk/dataacuity-maps.js"></script>
<script>
  const maps = new DataAcuityMaps();

  // Search for places
  const results = await maps.autocomplete('Sandton');
  console.log(results);

  // Get directions
  const route = await maps.getRoute(
    [28.0473, -26.2041],  // Origin [lng, lat]
    [28.2293, -25.7479]   // Destination [lng, lat]
  );
  console.log(`${route.distance_text} - ${route.duration_text}`);
</script>
```

### Mobile (PWA)

DataAcuity Maps is a Progressive Web App (PWA) - install it directly from the browser:

1. Visit https://maps.dataacuity.co.za on your mobile device
2. Tap "Add to Home Screen" (iOS Safari) or the install prompt (Android Chrome)
3. Launch from your home screen for a native-like experience

Features:
- Offline map tile caching
- Touch-optimized draggable panels
- Home screen installation
- Background sync for saved memories

## API Reference

### DataAcuityMaps

#### Constructor

```javascript
const maps = new DataAcuityMaps({
  baseUrl: 'https://maps.dataacuity.co.za/api',  // Optional
  apiKey: 'your-api-key',                         // Optional for whitelisted IPs
  cacheTimeout: 300000                            // Cache TTL in ms (default: 5 min)
});
```

#### Methods

##### `autocomplete(query, options)`

Search for places by name.

```javascript
const results = await maps.autocomplete('Cape Town', {
  limit: 10,           // Max results (default: 10)
  types: ['poi'],      // Filter by source: 'poi', 'nominatim'
  location: {          // Bias results near location
    lat: -33.9,
    lng: 18.4
  }
});
```

Response:
```javascript
{
  query: 'Cape Town',
  count: 10,
  results: [
    {
      source: 'poi',
      id: 5,
      title: 'Cape Town',
      subtitle: 'Landmark · Cape Town',
      lat: -33.9249,
      lng: 18.4241,
      category: 'Landmark'
    }
  ]
}
```

##### `getRoute(origin, destination, options)`

Calculate route between two points.

```javascript
const route = await maps.getRoute(
  [28.0473, -26.2041],  // Origin [lng, lat]
  [28.2293, -25.7479],  // Destination [lng, lat]
  {
    profile: 'car',     // 'car', 'bike', 'foot' (default: 'car')
    alternatives: false // Include alternative routes
  }
);
```

Response:
```javascript
{
  distance_m: 59485.7,
  duration_s: 2910.8,
  distance_text: '59.5 km',
  duration_text: '48 min',
  geometry: {
    type: 'LineString',
    coordinates: [[28.047305, -26.204099], ...]
  },
  steps: [
    {
      name: 'Von Weilligh Street',
      distance_m: 1.9,
      duration_s: 7.5,
      maneuver: 'depart',
      modifier: ''
    }
  ]
}
```

##### `reverseGeocode(lat, lng)`

Get address from coordinates.

```javascript
const location = await maps.reverseGeocode(-33.9249, 18.4241);
```

Response:
```javascript
{
  display_name: 'Cape Town, City of Cape Town, Western Cape, South Africa',
  lat: -33.9249,
  lng: 18.4241,
  address: {
    city: 'Cape Town',
    state: 'Western Cape',
    country: 'South Africa'
  }
}
```

##### `nearbySearch(location, options)`

Find POIs near a location.

```javascript
const nearby = await maps.nearbySearch(
  { lat: -26.1076, lng: 28.0567 },
  {
    radius: 5000,        // Radius in meters (default: 1000)
    category: 'Shopping', // Filter by category
    limit: 20            // Max results (default: 20)
  }
);
```

##### `createAutocomplete(inputElement, options)`

Create an autocomplete widget.

```javascript
const autocomplete = maps.createAutocomplete(
  document.getElementById('search-input'),
  {
    onSelect: (place) => {
      console.log('Selected:', place);
      map.flyTo([place.lng, place.lat]);
    },
    minChars: 2,       // Min chars before search (default: 2)
    debounceMs: 300,   // Debounce delay (default: 300)
    placeholder: 'Search places...'
  }
);

// Cleanup
autocomplete.destroy();
```

##### `createMap(container, options)`

Create a map instance (requires MapLibre GL JS).

```javascript
const map = maps.createMap('map-container', {
  center: [28.0473, -26.2041],
  zoom: 12,
  style: 'streets'  // 'streets', 'satellite', 'dark'
});
```

## POI Categories

Available categories with icons and colors:

| Category | Icon | Color |
|----------|------|-------|
| Landmark | place | #795548 |
| Shopping | shopping_cart | #e91e63 |
| Hospital | local_hospital | #f44336 |
| University | school | #3f51b5 |
| Nature | park | #4caf50 |
| Sports | sports_soccer | #ff5722 |
| Airport | flight | #2196f3 |
| Government | account_balance | #607d8b |
| Beach | beach_access | #00bcd4 |
| Entertainment | local_activity | #e91e63 |
| Fuel | local_gas_station | #ff5722 |
| ATM | atm | #4caf50 |
| Transport | directions_bus | #00bcd4 |
| Restaurant | restaurant | #ff9800 |
| Hotel | hotel | #9c27b0 |

## Coordinate Format

The SDK uses GeoJSON coordinate order `[longitude, latitude]` for consistency:

```javascript
// Route endpoints
maps.getRoute([lng, lat], [lng, lat])

// Map center
maps.createMap('map', { center: [lng, lat] })

// However, location objects use { lat, lng }
maps.nearbySearch({ lat: -26.1, lng: 28.0 })
```

## Error Handling

```javascript
try {
  const route = await maps.getRoute(origin, destination);
} catch (error) {
  switch (error.status) {
    case 400:
      console.error('Invalid coordinates');
      break;
    case 404:
      console.error('No route found');
      break;
    case 429:
      console.error('Rate limit exceeded');
      break;
    case 502:
      console.error('Routing service unavailable');
      break;
  }
}
```

## Caching

The SDK includes built-in caching:

- Autocomplete results: 5 minutes
- Routes: 5 minutes
- Geocoding: 5 minutes

Clear cache manually:

```javascript
maps.clearCache();
```

## Migration from Google Maps

| Google Maps | DataAcuity Maps |
|-------------|-----------------|
| `google.maps.places.AutocompleteService` | `maps.autocomplete()` |
| `google.maps.DirectionsService` | `maps.getRoute()` |
| `google.maps.Geocoder` | `maps.reverseGeocode()` |
| `google.maps.places.PlacesService.nearbySearch` | `maps.nearbySearch()` |

## Files

```
sdk/
├── dataacuity-maps.js              # Browser SDK
├── dataacuity-maps.min.js          # Minified browser SDK (if available)
└── README.md                       # This file
```

## Support

- API Docs: https://maps.dataacuity.co.za/api/docs
- Issues: support@dataacuity.co.za
