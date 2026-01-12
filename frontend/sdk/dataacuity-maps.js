/**
 * DataAcuity Maps SDK
 * Drop-in replacement for Google Maps API
 *
 * Usage:
 *   <script src="https://maps.dataacuity.co.za/sdk/dataacuity-maps.js"></script>
 *   const maps = new DataAcuityMaps({ apiKey: 'optional' });
 */

class DataAcuityMaps {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://maps.dataacuity.co.za/api';
        this.apiKey = options.apiKey || null;
        this.cache = new Map();
        this.cacheTimeout = options.cacheTimeout || 300000; // 5 min
    }

    // ==========================================
    // AUTOCOMPLETE (like Google Places Autocomplete)
    // ==========================================

    /**
     * Search for places with autocomplete
     * @param {string} query - Search text
     * @param {Object} options - { lat, lng, limit }
     * @returns {Promise<Array>} - Array of place suggestions
     */
    async autocomplete(query, options = {}) {
        if (query.length < 2) return [];

        const params = new URLSearchParams({
            q: query,
            limit: options.limit || 10
        });

        if (options.lat && options.lng) {
            params.set('lat', options.lat);
            params.set('lng', options.lng);
        }

        const response = await this._fetch(`/autocomplete?${params}`);
        return response.results.map(r => ({
            placeId: r.id,
            name: r.title,
            description: r.subtitle,
            location: { lat: r.lat, lng: r.lng },
            category: r.category,
            source: r.source
        }));
    }

    /**
     * Create an autocomplete input widget
     * @param {HTMLInputElement} input - Input element
     * @param {Object} options - Configuration
     * @returns {Object} - Controller with destroy() method
     */
    createAutocomplete(input, options = {}) {
        const dropdown = document.createElement('div');
        dropdown.className = 'da-autocomplete-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-height: 300px;
            overflow-y: auto;
            z-index: 10000;
            display: none;
        `;
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(dropdown);

        let debounceTimer;
        const onSelect = options.onSelect || (() => {});

        const search = async () => {
            const query = input.value;
            if (query.length < 2) {
                dropdown.style.display = 'none';
                return;
            }

            const results = await this.autocomplete(query, options);

            if (results.length === 0) {
                dropdown.style.display = 'none';
                return;
            }

            dropdown.innerHTML = results.map((r, i) => `
                <div class="da-autocomplete-item" data-index="${i}" style="
                    padding: 12px 16px;
                    cursor: pointer;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                ">
                    <span style="
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        background: ${this._getCategoryColor(r.category)};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: 14px;
                    ">${this._getCategoryIcon(r.category)}</span>
                    <div>
                        <div style="font-weight: 500;">${r.name}</div>
                        <div style="font-size: 12px; color: #666;">${r.description || ''}</div>
                    </div>
                </div>
            `).join('');

            dropdown.style.display = 'block';

            // Position dropdown
            const rect = input.getBoundingClientRect();
            dropdown.style.width = `${rect.width}px`;
            dropdown.style.top = `${input.offsetHeight + 4}px`;
            dropdown.style.left = '0';

            // Add click handlers
            dropdown.querySelectorAll('.da-autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.index);
                    const selected = results[idx];
                    input.value = selected.name;
                    dropdown.style.display = 'none';
                    onSelect(selected);
                });
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#f5f5f5';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = 'white';
                });
            });
        };

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(search, 200);
        });

        input.addEventListener('blur', () => {
            setTimeout(() => dropdown.style.display = 'none', 200);
        });

        return {
            destroy: () => {
                dropdown.remove();
                input.removeEventListener('input', search);
            }
        };
    }

    // ==========================================
    // ROUTING (like Google Directions API)
    // ==========================================

    /**
     * Get route between two points
     * @param {Object} origin - { lat, lng } or "lat,lng" string
     * @param {Object} destination - { lat, lng } or "lat,lng" string
     * @param {Object} options - { mode, alternatives, steps }
     */
    async getRoute(origin, destination, options = {}) {
        const originStr = this._toCoordString(origin);
        const destStr = this._toCoordString(destination);

        const params = new URLSearchParams({
            origin: originStr,
            destination: destStr
        });

        if (options.mode) params.set('mode', options.mode);
        if (options.alternatives) params.set('alternatives', 'true');
        if (options.steps !== false) params.set('steps', 'true');

        const response = await this._fetch(`/route/simple?${params}`);

        return {
            distance: response.distance_m,
            distanceText: response.distance_text,
            duration: response.duration_s,
            durationText: response.duration_text,
            geometry: response.geometry,
            steps: response.steps || [],
            alternatives: response.alternatives || []
        };
    }

    /**
     * Get route with traffic (uses crowdsourced TagMe data)
     */
    async getRouteWithTraffic(origin, destination, options = {}) {
        const originStr = this._toCoordString(origin);
        const destStr = this._toCoordString(destination);

        const params = new URLSearchParams({
            origin: originStr,
            destination: destStr
        });

        const response = await this._fetch(`/traffic/route?${params}`);
        return response;
    }

    // ==========================================
    // GEOCODING (like Google Geocoding API)
    // ==========================================

    /**
     * Convert address to coordinates
     * @param {string} address - Address to geocode
     */
    async geocode(address) {
        const response = await this._fetch(`/geocode?q=${encodeURIComponent(address)}`);
        return response.results.map(r => ({
            placeId: r.place_id,
            formattedAddress: r.display_name,
            location: { lat: r.lat, lng: r.lng },
            type: r.type
        }));
    }

    /**
     * Convert coordinates to address
     * @param {number} lat
     * @param {number} lng
     */
    async reverseGeocode(lat, lng) {
        const response = await this._fetch(`/reverse-geocode?lat=${lat}&lng=${lng}`);
        return {
            formattedAddress: response.display_name,
            address: response.address,
            location: { lat, lng }
        };
    }

    // ==========================================
    // POI SEARCH (like Google Places Nearby)
    // ==========================================

    /**
     * Find nearby points of interest
     * @param {Object} location - { lat, lng }
     * @param {Object} options - { radius, category, limit }
     */
    async nearbySearch(location, options = {}) {
        const params = new URLSearchParams({
            lat: location.lat,
            lng: location.lng,
            radius_km: options.radius || 5,
            limit: options.limit || 20
        });

        if (options.category) {
            params.set('category', options.category);
        }

        const response = await this._fetch(`/pois/nearby?${params}`);
        return response.results.map(r => ({
            placeId: r.id,
            name: r.name,
            category: r.category,
            location: { lat: r.latitude, lng: r.longitude },
            address: r.address,
            distance: r.distance_km
        }));
    }

    /**
     * Get available POI categories
     */
    async getCategories() {
        const response = await this._fetch('/pois/categories');
        return response.categories;
    }

    // ==========================================
    // FUN FEATURES
    // ==========================================

    /**
     * Get journey stats (calories, CO2 savings, achievements)
     */
    async getJourneyStats(origin, destination, mode = 'driving') {
        const originStr = this._toCoordString(origin);
        const destStr = this._toCoordString(destination);
        const response = await this._fetch(
            `/journey/stats?origin=${originStr}&destination=${destStr}&mode=${mode}`
        );
        return response;
    }

    /**
     * Get available map themes
     */
    async getThemes() {
        const response = await this._fetch('/themes');
        return response.themes;
    }

    /**
     * Get voice navigation styles
     */
    async getVoiceStyles() {
        const response = await this._fetch('/navigation/voice-styles');
        return response.styles;
    }

    /**
     * Get navigation instruction in a voice style
     */
    async getVoiceInstruction(instruction, style = 'default') {
        const response = await this._fetch(
            `/navigation/instruction?instruction=${encodeURIComponent(instruction)}&style=${style}`
        );
        return response.styled_instruction;
    }

    // ==========================================
    // MAP DISPLAY (MapLibre GL integration)
    // ==========================================

    /**
     * Create a map instance (requires MapLibre GL JS)
     * @param {string|HTMLElement} container - Container ID or element
     * @param {Object} options - Map options
     */
    createMap(container, options = {}) {
        if (typeof maplibregl === 'undefined') {
            throw new Error('MapLibre GL JS is required. Include it before DataAcuity Maps SDK.');
        }

        const styles = {
            streets: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
            dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            satellite: null // Use raster
        };

        const map = new maplibregl.Map({
            container,
            style: styles[options.style] || styles.streets,
            center: options.center || [28.0473, -26.2041], // Johannesburg
            zoom: options.zoom || 12
        });

        // Add navigation controls
        map.addControl(new maplibregl.NavigationControl());

        // Add geolocate control
        if (options.geolocate !== false) {
            map.addControl(new maplibregl.GeolocateControl({
                positionOptions: { enableHighAccuracy: true },
                trackUserLocation: true
            }));
        }

        return map;
    }

    /**
     * Draw a route on the map
     */
    drawRoute(map, route, options = {}) {
        const sourceId = options.sourceId || 'route';
        const layerId = options.layerId || 'route-line';

        // Remove existing route
        if (map.getSource(sourceId)) {
            map.removeLayer(layerId);
            map.removeSource(sourceId);
        }

        map.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: route.geometry
            }
        });

        map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': options.color || '#4285F4',
                'line-width': options.width || 5
            }
        });

        // Fit map to route
        if (options.fitBounds !== false) {
            const coords = route.geometry.coordinates;
            const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
            map.fitBounds(bounds, { padding: 50 });
        }
    }

    // ==========================================
    // INTERNAL HELPERS
    // ==========================================

    async _fetch(endpoint) {
        const cacheKey = endpoint;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.time < this.cacheTimeout) {
            return cached.data;
        }

        const headers = {};
        if (this.apiKey) {
            headers['X-API-Key'] = this.apiKey;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, { headers });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `API error: ${response.status}`);
        }

        const data = await response.json();
        this.cache.set(cacheKey, { data, time: Date.now() });
        return data;
    }

    _toCoordString(location) {
        if (typeof location === 'string') return location;
        return `${location.lng},${location.lat}`;
    }

    _getCategoryColor(category) {
        const colors = {
            'Shopping': '#e91e63',
            'Airport': '#2196f3',
            'Hospital': '#f44336',
            'University': '#3f51b5',
            'Landmark': '#795548',
            'Nature': '#4caf50',
            'Beach': '#00bcd4',
            'Sports': '#ff5722',
            'Entertainment': '#9c27b0',
            'Government': '#607d8b'
        };
        return colors[category] || '#757575';
    }

    _getCategoryIcon(category) {
        const icons = {
            'Shopping': '🛒',
            'Airport': '✈️',
            'Hospital': '🏥',
            'University': '🎓',
            'Landmark': '📍',
            'Nature': '🌳',
            'Beach': '🏖️',
            'Sports': '⚽',
            'Entertainment': '🎭',
            'Government': '🏛️'
        };
        return icons[category] || '📍';
    }

    // ==========================================
    // STREET VIEW (Mapillary)
    // ==========================================

    /**
     * Get street-level imagery near a location
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {Object} options - { radius }
     * @returns {Promise<Object>} - Street view data
     */
    async getStreetView(lat, lng, options = {}) {
        const params = new URLSearchParams({
            lat,
            lng,
            radius: options.radius || 100
        });
        return this._fetch(`/streetview?${params}`);
    }

    /**
     * Get embeddable street view URL
     * @param {string} imageId - Mapillary image ID
     * @returns {Promise<Object>} - Embed URLs
     */
    async getStreetViewEmbed(imageId) {
        return this._fetch(`/streetview/embed/${imageId}`);
    }

    // ==========================================
    // TRANSIT / PUBLIC TRANSPORT
    // ==========================================

    /**
     * Get transit stops in an area
     * @param {Object} bounds - { minLng, minLat, maxLng, maxLat }
     * @returns {Promise<Object>} - GeoJSON FeatureCollection
     */
    async getTransitStops(bounds) {
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        return this._fetch(`/transit/stops?bbox=${bbox}`);
    }

    /**
     * Get transit route between two points
     * @param {Object} origin - { lng, lat }
     * @param {Object} destination - { lng, lat }
     * @returns {Promise<Object>} - Transit route info
     */
    async getTransitRoute(origin, destination) {
        const params = new URLSearchParams({
            origin: `${origin.lng},${origin.lat}`,
            destination: `${destination.lng},${destination.lat}`
        });
        return this._fetch(`/transit/routes?${params}`);
    }

    // ==========================================
    // TRAFFIC
    // ==========================================

    /**
     * Get crowdsourced traffic data
     * @param {Object} bounds - { minLng, minLat, maxLng, maxLat }
     * @returns {Promise<Object>} - GeoJSON with traffic segments
     */
    async getTraffic(bounds) {
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        return this._fetch(`/traffic?bbox=${bbox}`);
    }

    /**
     * Get route with traffic-aware ETA
     * @param {Object} origin - { lng, lat }
     * @param {Object} destination - { lng, lat }
     * @param {string} mode - 'driving', 'walking', 'cycling'
     * @returns {Promise<Object>} - Route with traffic info
     */
    async getRouteWithTraffic(origin, destination, mode = 'driving') {
        const params = new URLSearchParams({
            origin: `${origin.lng},${origin.lat}`,
            destination: `${destination.lng},${destination.lat}`,
            mode
        });
        return this._fetch(`/traffic/route?${params}`);
    }

    /**
     * Get HERE traffic data (recommended - 250k requests/month free)
     * Results are cached for 3 minutes server-side.
     * @param {Object} bounds - { minLng, minLat, maxLng, maxLat }
     * @param {Object} options - { refresh: false } - set refresh=true to bypass cache
     * @returns {Promise<Object>} - GeoJSON with traffic flow segments
     */
    async getHereTraffic(bounds, options = {}) {
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        const params = new URLSearchParams({ bbox });
        if (options.refresh) params.append('refresh', 'true');
        return this._fetch(`/traffic/here?${params}`);
    }

    /**
     * Get traffic incidents (accidents, road works, closures)
     * Results are cached for 5 minutes server-side.
     * @param {Object} bounds - { minLng, minLat, maxLng, maxLat }
     * @param {Object} options - { refresh: false } - set refresh=true to bypass cache
     * @returns {Promise<Object>} - GeoJSON with incident points
     */
    async getTrafficIncidents(bounds, options = {}) {
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        const params = new URLSearchParams({ bbox });
        if (options.refresh) params.append('refresh', 'true');
        return this._fetch(`/traffic/incidents?${params}`);
    }

    // ==========================================
    // INDOOR MAPS
    // ==========================================

    /**
     * Get indoor map for a POI (mall, airport, etc)
     * @param {number} poiId - POI ID
     * @returns {Promise<Object>} - Indoor map data
     */
    async getIndoorMap(poiId) {
        return this._fetch(`/indoor/${poiId}`);
    }

    /**
     * List POIs with indoor maps available
     * @returns {Promise<Object>} - Available indoor maps
     */
    async listIndoorMaps() {
        return this._fetch('/indoor/available');
    }

    // ==========================================
    // REVIEWS & RATINGS
    // ==========================================

    /**
     * Get reviews for a POI
     * @param {number} poiId - POI ID
     * @returns {Promise<Object>} - Reviews and average rating
     */
    async getReviews(poiId) {
        return this._fetch(`/pois/${poiId}/reviews`);
    }

    /**
     * Add a review for a POI
     * @param {number} poiId - POI ID
     * @param {Object} review - { rating: 1-5, text: string, user_hash: string }
     * @returns {Promise<Object>} - Result
     */
    async addReview(poiId, review) {
        return this._fetch(`/pois/${poiId}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                poi_id: poiId,
                ...review
            })
        });
    }

    // ==========================================
    // BUSINESS HOURS
    // ==========================================

    /**
     * Get opening hours for a POI
     * @param {number} poiId - POI ID
     * @returns {Promise<Object>} - Hours info
     */
    async getHours(poiId) {
        return this._fetch(`/pois/${poiId}/hours`);
    }

    // ==========================================
    // ELEVATION
    // ==========================================

    /**
     * Get elevation for a single point
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} - { lat, lng, elevation_m }
     */
    async getElevation(lat, lng) {
        return this._fetch(`/elevation?lat=${lat}&lng=${lng}`);
    }

    /**
     * Get elevation for multiple points (max 100)
     * @param {Array<Object>} locations - [{ lat, lng }, ...]
     * @returns {Promise<Object>} - { results: [{ lat, lng, elevation_m }] }
     */
    async getElevationBatch(locations) {
        return this._fetch('/elevation/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(locations)
        });
    }

    /**
     * Get elevation profile along a route
     * @param {Array<Object>} points - [{ lat, lng }, ...] route points
     * @param {number} samples - Number of elevation samples (10-200)
     * @returns {Promise<Object>} - { profile: [...], stats: { min, max, ascent, descent } }
     */
    async getElevationProfile(points, samples = 50) {
        const path = points.map(p => `${p.lat},${p.lng}`).join('|');
        return this._fetch(`/elevation/profile?path=${encodeURIComponent(path)}&samples=${samples}`);
    }

    // ==========================================
    // WEATHER
    // ==========================================

    /**
     * Get current weather and 7-day forecast
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} - { current: {...}, forecast: [...] }
     */
    async getWeather(lat, lng) {
        return this._fetch(`/weather?lat=${lat}&lng=${lng}`);
    }

    /**
     * Get weather alerts for a location
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} - { alerts: [...], alert_count }
     */
    async getWeatherAlerts(lat, lng) {
        return this._fetch(`/weather/alerts?lat=${lat}&lng=${lng}`);
    }

    // ==========================================
    // ISOCHRONE (Reachability Maps)
    // ==========================================

    /**
     * Get isochrone - areas reachable within X minutes
     * @param {number} lat - Center latitude
     * @param {number} lng - Center longitude
     * @param {number} minutes - Travel time (5-60)
     * @param {string} mode - 'driving', 'walking', 'cycling'
     * @returns {Promise<Object>} - GeoJSON polygon of reachable area
     */
    async getIsochrone(lat, lng, minutes = 15, mode = 'driving') {
        return this._fetch(`/isochrone?lat=${lat}&lng=${lng}&minutes=${minutes}&mode=${mode}`);
    }

    // ==========================================
    // MULTI-STOP ROUTING
    // ==========================================

    /**
     * Get route through multiple stops
     * @param {Array<Object>} stops - [{ lng, lat }, ...]
     * @param {Object} options - { mode, optimize }
     * @returns {Promise<Object>} - Route with total distance/duration
     */
    async getMultiStopRoute(stops, options = {}) {
        const { mode = 'driving', optimize = false } = options;
        const stopsStr = stops.map(s => `${s.lng},${s.lat}`).join('|');
        return this._fetch(`/route/multi?stops=${stopsStr}&mode=${mode}&optimize=${optimize}`);
    }

    /**
     * Optimize multi-stop route order (Traveling Salesman)
     * @param {Array<Object>} stops - [{ lng, lat }, ...]
     * @param {Object} options - { mode, roundtrip }
     * @returns {Promise<Object>} - Optimized route with best stop order
     */
    async optimizeRoute(stops, options = {}) {
        const { mode = 'driving', roundtrip = false } = options;
        return this._fetch(`/route/optimize?mode=${mode}&roundtrip=${roundtrip}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stops.map(s => [s.lng, s.lat]))
        });
    }

    // ==========================================
    // LOAD SHEDDING (South Africa)
    // ==========================================

    /**
     * Get current Eskom load shedding status
     * @returns {Promise<Object>} - Current stage and next changes
     */
    async getLoadSheddingStatus() {
        return this._fetch('/loadshedding');
    }

    /**
     * Get load shedding schedule for a location
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} - Area info and upcoming outages
     */
    async getLoadSheddingSchedule(lat, lng) {
        return this._fetch(`/loadshedding/area?lat=${lat}&lng=${lng}`);
    }

    /**
     * Search for load shedding area by name
     * @param {string} query - Area name to search
     * @returns {Promise<Object>} - Matching areas
     */
    async searchLoadSheddingArea(query) {
        return this._fetch(`/loadshedding/search?q=${encodeURIComponent(query)}`);
    }

    // ==========================================
    // CAPABILITIES
    // ==========================================

    /**
     * Get current API capabilities and feature status
     * @returns {Promise<Object>} - Feature availability
     */
    async getCapabilities() {
        return this._fetch('/capabilities');
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataAcuityMaps;
}
if (typeof window !== 'undefined') {
    window.DataAcuityMaps = DataAcuityMaps;
}
