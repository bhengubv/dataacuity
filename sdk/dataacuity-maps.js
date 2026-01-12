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
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataAcuityMaps;
}
if (typeof window !== 'undefined') {
    window.DataAcuityMaps = DataAcuityMaps;
}
