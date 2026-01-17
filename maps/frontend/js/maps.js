/**
 * Data Acuity Maps - Mobile First Navigation
 * Waze-like UX with Google Maps capabilities
 */

const API_BASE = '/api';

// ============================================
// App State
// ============================================
const state = {
    map: null,
    userLocation: null,
    userMarker: null,
    selectedDestination: null,
    savedPlaces: JSON.parse(localStorage.getItem('savedPlaces') || '{}'),
    recentSearches: JSON.parse(localStorage.getItem('recentSearches') || '[]'),
    searchResults: [],
    filteredRecents: [],
    markers: [],
    routeLayer: null,
    // Settings with localStorage persistence
    settings: {
        useMetric: localStorage.getItem('useMetric') !== 'false',
        use24Hour: localStorage.getItem('use24Hour') !== 'false',
        avoidTolls: localStorage.getItem('avoidTolls') === 'true',
        avoidHighways: localStorage.getItem('avoidHighways') === 'true',
        avoidFerries: localStorage.getItem('avoidFerries') === 'true',
        avoidUnpaved: localStorage.getItem('avoidUnpaved') === 'true',
        darkMode: localStorage.getItem('darkMode') === 'true',
        show3DBuildings: localStorage.getItem('show3DBuildings') === 'true',
        showTraffic: localStorage.getItem('showTraffic') === 'true',
        showSpeedLimit: localStorage.getItem('showSpeedLimit') !== 'false',
        voiceGuidance: localStorage.getItem('voiceGuidance') !== 'false',
        alertSounds: localStorage.getItem('alertSounds') !== 'false',
        batterySaver: localStorage.getItem('batterySaver') === 'true'
    },
    // Keep for backward compatibility
    useMetric: localStorage.getItem('useMetric') !== 'false'
};

// Navigation state (needs to be declared early for closeNavPanel)
let navigationWatchId = null;
let isNavigating = false;
let lastAnnouncedStep = -1;
let currentRouteSteps = [];
let currentStepIndex = 0;
let currentRouteGeometry = null;
let isRerouting = false;
let offRouteCount = 0;
let currentRouteDurationSec = 0;
let currentRouteDistanceM = 0;
let currentSpeedLimit = 60; // Default urban speed limit in km/h
let lastSpeedWarningTime = 0;
const OFF_ROUTE_THRESHOLD = 0.05; // 50 meters
const OFF_ROUTE_CONFIRM_COUNT = 3; // Must be off-route for 3 GPS updates
const SPEED_WARNING_INTERVAL = 30000; // Only warn every 30 seconds

// Incident reporting state
let incidents = JSON.parse(localStorage.getItem('incidents') || '[]');
let incidentMarkers = [];
let selectedIncidentType = null;
let alertedIncidentIds = new Set(); // Track which incidents we've already alerted
const INCIDENT_EXPIRY_HOURS = 4; // Incidents expire after 4 hours
const INCIDENT_ALERT_DISTANCE = 0.5; // Alert when within 500m of incident
const CAMERA_ALERT_DISTANCE = 0.8; // Alert for cameras at 800m (earlier warning)
const CAMERA_TYPES = ['speed_camera', 'red_light']; // Camera incident types

// ============================================
// Distance Utilities
// ============================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula - returns distance in km
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function formatDistance(km) {
    if (state.useMetric) {
        if (km < 1) {
            return Math.round(km * 1000) + ' m';
        }
        return km.toFixed(1) + ' km';
    } else {
        const miles = km * 0.621371;
        if (miles < 0.1) {
            return Math.round(miles * 5280) + ' ft';
        }
        return miles.toFixed(1) + ' mi';
    }
}

// ============================================
// Map Configuration
// ============================================
const MAP_CONFIG = {
    // Default to South Africa
    defaultCenter: [28.0473, -26.2041], // Johannesburg
    defaultZoom: 12,
    minZoom: 3,
    maxZoom: 18,
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
};

// Map styles for light/dark mode
const MAP_STYLES = {
    light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
};

// Dark mode settings
const DARK_MODE_AUTO_START = 18; // 6 PM
const DARK_MODE_AUTO_END = 6;    // 6 AM

// ============================================
// Initialize App
// ============================================
function initApp() {
    if (typeof maplibregl === 'undefined') {
        setTimeout(initApp, 100);
        return;
    }

    // Check WebGL support
    if (!isWebGLSupported()) {
        showError('Your browser does not support WebGL maps');
        hideLoading();
        return;
    }

    initMap();
    initSearch();
    initEventListeners();
    loadSavedPlaces();
    initURLState();

    // Auto-locate user on first load (after map is ready)
    state.map.on('load', () => {
        // Check if URL has coordinates first
        const hasURLCoords = parseURLState();

        // Always try to get user location in background (for distance calculations)
        // Even if URL has coords, we need userLocation for distance display
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    state.userLocation = [longitude, latitude];
                    console.log('[Init] Got user location for distances:', state.userLocation);

                    // Always show user marker (blue dot)
                    updateUserMarker();

                    // If no URL coords, also fly to location
                    if (!hasURLCoords) {
                        state.map.flyTo({ center: state.userLocation, zoom: 15, duration: 1500 });
                        showToast('Location found');
                    }
                },
                (error) => {
                    console.log('[Init] Location not available:', error.message);
                    // Only show toast if we were going to use location for navigation
                    if (!hasURLCoords) {
                        showToast('Tap GPS button to find your location');
                    }
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
        }
    });
}

function isWebGLSupported() {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
        return false;
    }
}

// ============================================
// Map Initialization
// ============================================
function initMap() {
    try {
        state.map = new maplibregl.Map({
            container: 'map',
            style: MAP_CONFIG.style,
            center: MAP_CONFIG.defaultCenter,
            zoom: MAP_CONFIG.defaultZoom,
            minZoom: MAP_CONFIG.minZoom,
            maxZoom: MAP_CONFIG.maxZoom,
            attributionControl: false
        });

        // Add minimal controls
        state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        state.map.on('load', () => {
            hideLoading();
            // Load incident markers on map
            loadIncidentsOnMap();
            // Initialize traffic UI and load layer if enabled
            initTrafficUI();
            if (state.settings.showTraffic) {
                loadTrafficLayer();
                startTrafficRefresh();
            }
            // Initialize dark mode (after map loads so we can switch styles)
            initDarkMode();
            startDarkModeAutoSwitch();
        });

        state.map.on('error', (e) => {
            console.error('[Map Error]', e);
        });

        // Click on map to close panels
        state.map.on('click', (e) => {
            if (state.selectedDestination) return;
            closeNavPanel();
        });

    } catch (error) {
        console.error('[initMap]', error);
        showError('Failed to load map');
        hideLoading();
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 500);
    }
}

// ============================================
// User Location
// ============================================
function locateMe(silent = false) {
    if (!navigator.geolocation) {
        if (!silent) showToast('Geolocation not supported');
        return;
    }

    const fab = document.getElementById('fab-locate');
    if (fab) fab.classList.add('locating');
    if (!silent) showToast('Finding your location...');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            console.log('[Location] Got position:', latitude, longitude, 'accuracy:', accuracy);
            state.userLocation = [longitude, latitude];

            // Fly to location
            state.map.flyTo({
                center: state.userLocation,
                zoom: 15,
                duration: 1500
            });

            // Add/update user marker
            updateUserMarker();

            if (fab) fab.classList.remove('locating');
            showToast('Location found');
        },
        (error) => {
            console.error('[Location Error]', error.code, error.message);
            if (fab) fab.classList.remove('locating');
            if (!silent) {
                switch (error.code) {
                    case 1: // PERMISSION_DENIED
                        showToast('Please allow location access in browser settings');
                        break;
                    case 2: // POSITION_UNAVAILABLE
                        showToast('Location unavailable - check GPS/WiFi');
                        break;
                    case 3: // TIMEOUT
                        showToast('Location timeout - trying again...');
                        // Retry with lower accuracy
                        retryLocationLowAccuracy(silent);
                        return;
                    default:
                        showToast('Could not get location');
                }
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000
        }
    );
}

function retryLocationLowAccuracy(silent) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            state.userLocation = [longitude, latitude];
            state.map.flyTo({ center: state.userLocation, zoom: 15, duration: 1500 });
            updateUserMarker();
            document.getElementById('fab-locate')?.classList.remove('locating');
            showToast('Location found');
        },
        (error) => {
            console.error('[Location Retry Error]', error.code, error.message);
            document.getElementById('fab-locate')?.classList.remove('locating');
            if (!silent) showToast('Could not get location - check permissions');
        },
        {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 60000
        }
    );
}
window.locateMe = locateMe;

function updateUserMarker() {
    if (!state.userLocation) return;

    // Remove existing marker
    if (state.userMarker) {
        state.userMarker.remove();
    }

    // Create marker element with pulse
    const el = document.createElement('div');
    el.style.cssText = `
        position: relative;
        width: 20px;
        height: 20px;
    `;

    // Pulse ring
    const pulse = document.createElement('div');
    pulse.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: 60px;
        height: 60px;
        margin: -30px 0 0 -30px;
        background: rgba(33, 150, 243, 0.25);
        border-radius: 50%;
        animation: userPulse 2s ease-out infinite;
    `;

    // Blue dot
    const dot = document.createElement('div');
    dot.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 20px;
        height: 20px;
        background: #2196F3;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    `;

    el.appendChild(pulse);
    el.appendChild(dot);

    // Add keyframe animation if not exists
    if (!document.getElementById('user-marker-style')) {
        const style = document.createElement('style');
        style.id = 'user-marker-style';
        style.textContent = `
            @keyframes userPulse {
                0% { transform: scale(0.5); opacity: 1; }
                100% { transform: scale(1.5); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    state.userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(state.userLocation)
        .addTo(state.map);
}

// ============================================
// Search
// ============================================
function initSearch() {
    const input = document.getElementById('search-input');
    if (!input) {
        console.error('[initSearch] search-input not found');
        return;
    }

    const clearBtn = document.getElementById('search-clear');
    const searchBody = document.querySelector('.search-body');

    let debounceTimer;

    // Input event - fires on every keystroke
    input.oninput = function() {
        const query = this.value.trim();
        console.log('[Search] Input:', query, 'Recents:', state.recentSearches.length);

        // Toggle clear button
        if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);

        // If empty, restore default view
        if (query.length === 0) {
            if (originalSearchBodyContent && searchBody) {
                searchBody.innerHTML = originalSearchBodyContent;
            }
            showRecentSearches();
            return;
        }

        // Cancel previous search timer
        clearTimeout(debounceTimer);

        // Debounce search - start after 300ms of no typing
        debounceTimer = setTimeout(() => {
            if (query.length >= 2) {
                performSearch(query, false);
            }
        }, 500);
    };

    // Enter key - select first result
    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = this.value.trim();
            if (query.length >= 2) {
                performSearch(query, true);
            }
        }
    };

    // Focus - show recents
    input.onfocus = function() {
        if (this.value.trim().length === 0) {
            showRecentSearches();
        }
    };

    console.log('[initSearch] Initialized, recents:', state.recentSearches.length);
}

function showRecentSearches() {
    const recentSection = document.getElementById('recent-section');
    const recentContainer = document.getElementById('recent-searches');

    if (state.recentSearches.length === 0) {
        recentSection.style.display = 'none';
        return;
    }

    recentSection.style.display = 'block';
    recentContainer.innerHTML = state.recentSearches.slice(0, 5).map((place, idx) => `
        <div class="search-result" onclick="selectRecentSearch(${idx})">
            <div class="result-icon">🕐</div>
            <div class="result-info">
                <div class="result-name">${escapeHtml(place.name.split(',')[0])}</div>
                <div class="result-address">${escapeHtml(place.name.split(',').slice(1, 2).join(''))}</div>
            </div>
        </div>
    `).join('');
}

function selectRecentSearch(idx) {
    const place = state.recentSearches[idx];
    if (place) {
        selectPlace(place.lng, place.lat, place.name);
    }
}
window.selectRecentSearch = selectRecentSearch;

function showFilteredRecents(query) {
    // Don't do anything here - let performSearch handle all result display
    // This prevents race conditions and overwrites
}

function selectFilteredRecent(idx) {
    const place = state.filteredRecents[idx];
    if (place) {
        selectPlace(place.lng, place.lat, place.name);
    }
}
window.selectFilteredRecent = selectFilteredRecent;

async function performSearch(query, autoSelect = false) {
    const searchBody = document.querySelector('.search-body');

    console.log('[performSearch] Starting search for:', query);

    // Show searching state - replace entire search-body content
    searchBody.innerHTML = `
        <div style="padding:40px 20px;text-align:center;">
            <div style="display:inline-block;width:32px;height:32px;border:3px solid #e0e0e0;border-top-color:#2196F3;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px;"></div>
            <div style="color:#666;font-size:16px;">Searching for "${escapeHtml(query)}"...</div>
        </div>
    `;

    try {
        // Search Nominatim for addresses
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1&countrycodes=za`
        );
        const results = await response.json();
        console.log('[performSearch] Got results:', results.length);

        // Auto-select first result if Enter was pressed
        if (autoSelect && results.length > 0) {
            const first = results[0];
            selectPlace(parseFloat(first.lon), parseFloat(first.lat), first.display_name);
            return;
        }

        // Store results for click handling
        state.searchResults = results;

        // Build results HTML - directly into search-body
        let html = '';
        if (results.length > 0) {
            console.log('[performSearch] userLocation:', state.userLocation);
            html = `<div style="padding:12px 0 8px;color:#666;font-size:13px;text-transform:uppercase;font-weight:600;">Results for "${escapeHtml(query)}"</div>`;
            html += results.map((place, idx) => {
                const placeLat = parseFloat(place.lat);
                const placeLng = parseFloat(place.lon);
                let distanceText = '';
                if (state.userLocation) {
                    const dist = calculateDistance(state.userLocation[1], state.userLocation[0], placeLat, placeLng);
                    distanceText = formatDistance(dist);
                    console.log('[Distance]', place.display_name.split(',')[0], ':', dist.toFixed(2), 'km ->', distanceText);
                }
                return `
                <div class="search-result" onclick="selectSearchResult(${idx})" style="display:flex;align-items:center;padding:16px 8px;border-bottom:1px solid #f0f0f0;cursor:pointer;">
                    <div style="width:44px;height:44px;border-radius:50%;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:20px;margin-right:14px;">📍</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:16px;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(place.display_name.split(',')[0])}</div>
                        <div style="font-size:14px;color:#666;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(place.display_name.split(',').slice(1, 3).join(','))}</div>
                    </div>
                    <div style="margin-left:12px;text-align:right;flex-shrink:0;min-width:60px;">
                        <div style="font-size:15px;font-weight:600;color:#1976D2;">${distanceText || '—'}</div>
                    </div>
                </div>
            `}).join('');
        } else {
            html = `<div style="padding:40px 20px;text-align:center;color:#999;">
                <div style="font-size:48px;margin-bottom:16px;">🔍</div>
                <div style="font-size:16px;">No results found for "${escapeHtml(query)}"</div>
            </div>`;
        }

        // Set results directly into search-body
        searchBody.innerHTML = html;
        console.log('[performSearch] Results rendered, innerHTML length:', html.length);

    } catch (error) {
        console.error('[Search Error]', error);
        searchBody.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#999;">
            <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
            <div style="font-size:16px;">Search failed. Please try again.</div>
        </div>`;
    }
}

function selectSearchResult(idx) {
    const place = state.searchResults[idx];
    if (place) {
        selectPlace(parseFloat(place.lon), parseFloat(place.lat), place.display_name);
    }
}
window.selectSearchResult = selectSearchResult;

function selectPlace(lng, lat, name) {
    closeSearch();

    // Save to recent
    addToRecent({ lng, lat, name });

    // Store selected destination
    state.selectedDestination = { lng, lat, name };

    // Fly to location
    state.map.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 1000
    });

    // Add marker
    clearMarkers();
    const marker = new maplibregl.Marker({ color: '#2196F3' })
        .setLngLat([lng, lat])
        .addTo(state.map);
    state.markers.push(marker);

    // Show navigation panel
    showNavPanel(name, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
}
window.selectPlace = selectPlace;

function addToRecent(place) {
    const recent = state.recentSearches.filter(p =>
        !(p.lng === place.lng && p.lat === place.lat)
    );
    recent.unshift(place);
    state.recentSearches = recent.slice(0, 10);
    localStorage.setItem('recentSearches', JSON.stringify(state.recentSearches));
}

function clearMarkers() {
    state.markers.forEach(m => m.remove());
    state.markers = [];
}

// ============================================
// Search Overlay
// ============================================
// Store original search-body content for restoration
let originalSearchBodyContent = null;

function openSearch() {
    const backdrop = document.getElementById('search-backdrop');
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    const searchBody = document.querySelector('.search-body');

    // Store original content if not already stored
    if (!originalSearchBodyContent && searchBody) {
        originalSearchBodyContent = searchBody.innerHTML;
    }

    backdrop.classList.add('active');
    overlay.classList.add('active');
    toggleMenu(false);

    // Restore default content
    if (originalSearchBodyContent && searchBody) {
        searchBody.innerHTML = originalSearchBodyContent;
    }

    // Show recent searches
    showRecentSearches();

    // Silently request location if we don't have it (for distance calculation)
    if (!state.userLocation && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { longitude, latitude } = position.coords;
                state.userLocation = [longitude, latitude];
                console.log('[openSearch] Got user location:', state.userLocation);
            },
            (error) => {
                console.log('[openSearch] Location not available:', error.message);
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
        );
    }

    // Focus input after animation
    setTimeout(() => input.focus(), 300);
}
window.openSearch = openSearch;

function closeSearch() {
    const backdrop = document.getElementById('search-backdrop');
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    const searchBody = document.querySelector('.search-body');
    const clearBtn = document.getElementById('search-clear');

    backdrop.classList.remove('active');
    overlay.classList.remove('active');
    input.value = '';
    input.blur();
    clearBtn.classList.remove('visible');

    // Restore default content
    if (originalSearchBodyContent && searchBody) {
        searchBody.innerHTML = originalSearchBodyContent;
    }
}
window.closeSearch = closeSearch;

function clearSearch() {
    const input = document.getElementById('search-input');
    const resultsDiv = document.getElementById('search-results');
    const defaultDiv = document.getElementById('search-default');
    const clearBtn = document.getElementById('search-clear');

    input.value = '';
    input.focus();
    resultsDiv.classList.remove('active');
    defaultDiv.style.display = 'block';
    clearBtn.classList.remove('visible');
}
window.clearSearch = clearSearch;

// ============================================
// Navigation Panel
// ============================================
function showNavPanel(name, address) {
    const panel = document.getElementById('nav-panel');
    const bottomBar = document.getElementById('bottom-bar');

    document.getElementById('nav-name').textContent = name;
    document.getElementById('nav-address').textContent = address;

    panel.classList.add('active');
    bottomBar.style.display = 'none';
}

function closeNavPanel() {
    // Stop live navigation if running
    if (isNavigating) {
        stopLiveNavigation();
    }

    const panel = document.getElementById('nav-panel');
    const bottomBar = document.getElementById('bottom-bar');
    const directionsList = document.getElementById('directions-list');
    const initialActions = document.getElementById('nav-actions-initial');
    const routeActions = document.getElementById('nav-actions-route');

    panel.classList.remove('active');
    bottomBar.style.display = 'block';

    // Reset directions list
    if (directionsList) directionsList.classList.remove('active');
    if (initialActions) initialActions.style.display = 'flex';
    if (routeActions) routeActions.style.display = 'none';

    // Reset Start button
    const startBtn = document.querySelector('#nav-actions-route .nav-action-btn.primary');
    if (startBtn) {
        startBtn.innerHTML = '🚗 Start';
        startBtn.onclick = startLiveNavigation;
    }

    // Reset navigation state
    currentRouteGeometry = null;
    offRouteCount = 0;

    state.selectedDestination = null;
    clearMarkers();
    clearRoute();
}
window.closeNavPanel = closeNavPanel;

function startNavigation() {
    if (!state.selectedDestination) return;

    if (!state.userLocation) {
        showToast('Getting your location...');
        locateMe();
        return;
    }

    getDirections(
        state.userLocation,
        [state.selectedDestination.lng, state.selectedDestination.lat]
    );
}
window.startNavigation = startNavigation;

// ============================================
// Voice Guidance
// ============================================
function speak(text) {
    // Check if voice guidance is enabled
    if (!state.settings.voiceGuidance) return;

    // Check if speech synthesis is available
    if (!('speechSynthesis' in window)) {
        console.log('[Voice] Speech synthesis not supported');
        return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to use a good voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                         voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
        utterance.voice = englishVoice;
    }

    window.speechSynthesis.speak(utterance);
    console.log('[Voice] Speaking:', text);
}

function formatManeuver(step) {
    const maneuver = step.maneuver || '';
    const name = step.name || 'the road';

    const maneuverMap = {
        'depart': `Head towards ${name}`,
        'turn': `Turn onto ${name}`,
        'turn-left': `Turn left onto ${name}`,
        'turn-right': `Turn right onto ${name}`,
        'sharp-left': `Sharp left onto ${name}`,
        'sharp-right': `Sharp right onto ${name}`,
        'slight-left': `Slight left onto ${name}`,
        'slight-right': `Slight right onto ${name}`,
        'straight': `Continue straight on ${name}`,
        'ramp': `Take the ramp onto ${name}`,
        'merge': `Merge onto ${name}`,
        'fork': `Take the fork onto ${name}`,
        'roundabout': `Enter the roundabout and exit onto ${name}`,
        'rotary': `Enter the roundabout and exit onto ${name}`,
        'arrive': `You have arrived at your destination`,
        'new name': `Continue on ${name}`
    };

    return maneuverMap[maneuver] || `Continue on ${name}`;
}

function announceRoute(distance, duration, steps) {
    currentRouteSteps = steps || [];
    currentStepIndex = 0;

    // Announce route summary
    const summary = `Route found. ${distance}, ${duration}`;
    speak(summary);

    // After summary, announce first instruction
    if (currentRouteSteps.length > 0) {
        setTimeout(() => {
            const firstStep = formatManeuver(currentRouteSteps[0]);
            speak(firstStep);
        }, 3000);
    }
}

function announceNextStep() {
    if (currentStepIndex < currentRouteSteps.length) {
        const step = currentRouteSteps[currentStepIndex];
        speak(formatManeuver(step));
        currentStepIndex++;
    }
}
window.announceNextStep = announceNextStep;

function displayDirectionsList(distance, duration, steps) {
    const directionsList = document.getElementById('directions-list');
    const directionsSteps = document.getElementById('directions-steps');
    const directionsTime = document.getElementById('directions-time');
    const directionsDistance = document.getElementById('directions-distance');
    const initialActions = document.getElementById('nav-actions-initial');
    const routeActions = document.getElementById('nav-actions-route');

    if (!directionsList || !directionsSteps) return;

    // Update summary
    if (directionsTime) directionsTime.textContent = duration;
    if (directionsDistance) directionsDistance.textContent = distance;

    // Build steps HTML
    let stepsHtml = '';
    if (steps && steps.length > 0) {
        steps.forEach((step, index) => {
            const maneuver = step.maneuver || 'continue';
            const name = step.name || '';
            const instruction = formatManeuver(step);
            const stepDistance = step.distance_text || (step.distance ? (step.distance / 1000).toFixed(1) + ' km' : '');

            // Get icon for maneuver
            const icon = getManeuverIcon(maneuver);
            const iconClass = maneuver === 'depart' ? 'depart' : (maneuver === 'arrive' ? 'arrive' : 'turn');

            stepsHtml += `
                <div class="directions-step">
                    <div class="directions-step-icon ${iconClass}">${icon}</div>
                    <div class="directions-step-content">
                        <div class="directions-step-instruction">${escapeHtml(instruction)}</div>
                        ${name ? `<div class="directions-step-detail">${escapeHtml(name)}</div>` : ''}
                    </div>
                    ${stepDistance ? `<div class="directions-step-distance">${stepDistance}</div>` : ''}
                </div>
            `;
        });
    }

    directionsSteps.innerHTML = stepsHtml;

    // Show directions list and switch action buttons
    directionsList.classList.add('active');
    if (initialActions) initialActions.style.display = 'none';
    if (routeActions) routeActions.style.display = 'flex';
}

function getManeuverIcon(maneuver) {
    const icons = {
        'depart': '🚀',
        'arrive': '🏁',
        'turn': '↪️',
        'turn-left': '⬅️',
        'turn-right': '➡️',
        'sharp-left': '↩️',
        'sharp-right': '↪️',
        'slight-left': '↖️',
        'slight-right': '↗️',
        'straight': '⬆️',
        'ramp': '🛣️',
        'merge': '🔀',
        'fork': '🔱',
        'roundabout': '🔄',
        'rotary': '🔄',
        'new name': '➡️'
    };
    return icons[maneuver] || '➡️';
}

// ============================================
// Live Navigation
// ============================================
function startLiveNavigation() {
    if (!navigator.geolocation) {
        showToast('GPS not available');
        return;
    }

    if (!currentRouteSteps || currentRouteSteps.length === 0) {
        showToast('No route loaded');
        return;
    }

    isNavigating = true;
    lastAnnouncedStep = -1;
    currentStepIndex = 0;
    alertedIncidentIds.clear(); // Reset incident alerts for new navigation
    updateShareFAB(true); // Show share ETA button

    // Update UI for navigation mode
    const startBtn = document.querySelector('#nav-actions-route .nav-action-btn.primary');
    if (startBtn) {
        startBtn.innerHTML = '⏹️ Stop';
        startBtn.onclick = stopLiveNavigation;
    }

    showToast('Navigation started');
    speak('Starting navigation');

    // Highlight first step
    highlightCurrentStep(0);

    // Show ETA display
    if (currentRouteDurationSec > 0) {
        updateETADisplay(currentRouteDurationSec, currentRouteDistanceM);
    }

    // Start watching position
    navigationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, heading, speed } = position.coords;
            state.userLocation = [longitude, latitude];

            // Update user marker
            updateUserMarker();

            // Center map on user with rotation if heading available
            if (isNavigating) {
                state.map.easeTo({
                    center: state.userLocation,
                    zoom: 17,
                    bearing: heading || 0,
                    pitch: 60, // 3D tilt view
                    duration: 500
                });
            }

            // Check progress along route
            checkNavigationProgress(latitude, longitude);

            // Check if off route and need to reroute
            checkOffRoute(latitude, longitude);

            // Check for nearby incidents
            checkIncidentProximity(latitude, longitude);

            // Update lane guidance for upcoming turns
            updateLaneGuidance(latitude, longitude);

            // Update speed display if available
            if (speed !== null && speed > 0) {
                const speedKmh = Math.round(speed * 3.6);
                updateSpeedDisplay(speedKmh);
            }
        },
        (error) => {
            console.error('[Navigation GPS Error]', error);
            showToast('GPS error: ' + error.message);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 1000
        }
    );

    // Announce first instruction
    if (currentRouteSteps.length > 0) {
        const firstInstruction = formatManeuver(currentRouteSteps[0]);
        setTimeout(() => speak(firstInstruction), 1500);
        lastAnnouncedStep = 0;
    }
}
window.startLiveNavigation = startLiveNavigation;

function stopLiveNavigation() {
    isNavigating = false;

    if (navigationWatchId !== null) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
    }

    // Reset UI
    const startBtn = document.querySelector('#nav-actions-route .nav-action-btn.primary');
    if (startBtn) {
        startBtn.innerHTML = '🚗 Start';
        startBtn.onclick = startLiveNavigation;
    }

    // Reset map view
    state.map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 500
    });

    // Remove speed display
    removeSpeedDisplay();

    // Remove ETA display
    removeETADisplay();

    // Hide lane guidance
    hideLaneGuidance();

    // Hide share ETA FAB and stop sharing
    updateShareFAB(false);
    stopTripSharing();

    // Clear step highlight
    document.querySelectorAll('.directions-step').forEach(el => {
        el.classList.remove('current-step');
    });

    showToast('Navigation stopped');
    speak('Navigation ended');
}
window.stopLiveNavigation = stopLiveNavigation;

function checkOffRoute(lat, lng) {
    // Skip if not navigating, already rerouting, or no route
    if (!isNavigating || isRerouting || !currentRouteGeometry) return;

    // Calculate distance to nearest point on route
    const distToRoute = distanceToRoute(lat, lng, currentRouteGeometry.coordinates);

    console.log('[Navigation] Distance to route:', (distToRoute * 1000).toFixed(0), 'm');

    if (distToRoute > OFF_ROUTE_THRESHOLD) {
        offRouteCount++;
        console.log('[Navigation] Off route count:', offRouteCount);

        if (offRouteCount >= OFF_ROUTE_CONFIRM_COUNT) {
            // Confirmed off route - trigger reroute
            triggerReroute(lat, lng);
        }
    } else {
        // Back on route
        offRouteCount = 0;
    }
}

function distanceToRoute(lat, lng, routeCoords) {
    if (!routeCoords || routeCoords.length < 2) return Infinity;

    let minDist = Infinity;

    // Check distance to each segment of the route
    for (let i = 0; i < routeCoords.length - 1; i++) {
        const segStart = routeCoords[i];
        const segEnd = routeCoords[i + 1];

        const dist = distanceToSegment(
            lat, lng,
            segStart[1], segStart[0],
            segEnd[1], segEnd[0]
        );

        if (dist < minDist) {
            minDist = dist;
        }

        // Early exit if we're close enough
        if (minDist < 0.01) break; // Within 10m
    }

    return minDist;
}

function distanceToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
    // Calculate perpendicular distance from point P to line segment AB
    const A = pLat - aLat;
    const B = pLng - aLng;
    const C = bLat - aLat;
    const D = bLng - aLng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
        param = dot / lenSq;
    }

    let nearestLat, nearestLng;

    if (param < 0) {
        nearestLat = aLat;
        nearestLng = aLng;
    } else if (param > 1) {
        nearestLat = bLat;
        nearestLng = bLng;
    } else {
        nearestLat = aLat + param * C;
        nearestLng = aLng + param * D;
    }

    return calculateDistance(pLat, pLng, nearestLat, nearestLng);
}

async function triggerReroute(lat, lng) {
    if (isRerouting || !state.selectedDestination) return;

    isRerouting = true;
    offRouteCount = 0;

    console.log('[Navigation] Rerouting from:', lat, lng);
    showToast('Rerouting...');
    speak('Rerouting');

    try {
        const response = await fetch(
            `${API_BASE}/route/simple?origin=${lng},${lat}&destination=${state.selectedDestination.lng},${state.selectedDestination.lat}`
        );

        if (!response.ok) {
            throw new Error('Reroute request failed');
        }

        const data = await response.json();

        if (!data.geometry) {
            throw new Error('No route found');
        }

        // Update route display
        displayRoute(data.geometry);
        currentRouteGeometry = data.geometry;

        // Store duration and distance for ETA
        currentRouteDurationSec = data.duration_s || 0;
        currentRouteDistanceM = data.distance_m || 0;

        // Update directions list
        const distance = data.distance_text || (data.distance_m / 1000).toFixed(1) + ' km';
        const duration = data.duration_text || Math.round(data.duration_s / 60) + ' min';
        displayDirectionsList(distance, duration, data.steps);

        // Update route steps for navigation
        currentRouteSteps = data.steps || [];
        currentStepIndex = 0;
        lastAnnouncedStep = -1;

        // Highlight first step
        highlightCurrentStep(0);

        // Update ETA display
        updateETADisplay(currentRouteDurationSec, currentRouteDistanceM);

        // Announce new route
        speak('Route updated. ' + duration + ' remaining');

        // Announce first instruction
        if (currentRouteSteps.length > 0) {
            setTimeout(() => {
                speak(formatManeuver(currentRouteSteps[0]));
                lastAnnouncedStep = 0;
            }, 2000);
        }

        showToast('Route updated');

    } catch (error) {
        console.error('[Reroute Error]', error);
        showToast('Could not reroute');
        speak('Unable to find new route');
    } finally {
        isRerouting = false;
    }
}

function checkNavigationProgress(lat, lng) {
    if (!currentRouteSteps || currentRouteSteps.length === 0) return;

    // Find the closest step based on distance to step location
    let closestStepIndex = currentStepIndex;
    let minDistance = Infinity;

    for (let i = currentStepIndex; i < currentRouteSteps.length; i++) {
        const step = currentRouteSteps[i];
        if (step.location) {
            const stepLat = step.location[1];
            const stepLng = step.location[0];
            const dist = calculateDistance(lat, lng, stepLat, stepLng);

            if (dist < minDistance) {
                minDistance = dist;
                closestStepIndex = i;
            }
        }
    }

    // If we're within 50m of a step, consider it the current step
    if (minDistance < 0.05) { // 50 meters
        if (closestStepIndex > currentStepIndex) {
            currentStepIndex = closestStepIndex;
            highlightCurrentStep(currentStepIndex);

            // Announce completed step and update speed limit
            if (currentStepIndex < currentRouteSteps.length) {
                const step = currentRouteSteps[currentStepIndex];

                // Update speed limit for new road
                updateSpeedLimitFromStep(step);

                if (currentStepIndex !== lastAnnouncedStep) {
                    speak(formatManeuver(step));
                    lastAnnouncedStep = currentStepIndex;
                }
            }
        }
    }

    // Pre-announce upcoming turn when within 200m
    const nextStepIndex = currentStepIndex + 1;
    if (nextStepIndex < currentRouteSteps.length && nextStepIndex !== lastAnnouncedStep) {
        const nextStep = currentRouteSteps[nextStepIndex];
        if (nextStep.location) {
            const dist = calculateDistance(lat, lng, nextStep.location[1], nextStep.location[0]);
            if (dist < 0.2 && dist > 0.05) { // Between 50-200m
                speak('In ' + Math.round(dist * 1000) + ' meters, ' + formatManeuver(nextStep));
                lastAnnouncedStep = nextStepIndex;
            }
        }
    }

    // Check if arrived at destination
    if (currentStepIndex >= currentRouteSteps.length - 1) {
        const lastStep = currentRouteSteps[currentRouteSteps.length - 1];
        if (lastStep.maneuver === 'arrive' || lastStep.location) {
            const destLat = lastStep.location ? lastStep.location[1] : state.selectedDestination?.lat;
            const destLng = lastStep.location ? lastStep.location[0] : state.selectedDestination?.lng;
            if (destLat && destLng) {
                const distToDest = calculateDistance(lat, lng, destLat, destLng);
                if (distToDest < 0.03) { // Within 30m
                    speak('You have arrived at your destination');
                    stopLiveNavigation();
                }
            }
        }
    }
}

function highlightCurrentStep(stepIndex) {
    const steps = document.querySelectorAll('.directions-step');
    steps.forEach((el, i) => {
        if (i === stepIndex) {
            el.classList.add('current-step');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            el.classList.remove('current-step');
        }
    });
}

// ============================================
// Lane Guidance
// ============================================

const LANE_SHOW_DISTANCE = 0.5; // Show lane guidance within 500m of turn
const LANE_HIDE_DISTANCE = 0.03; // Hide after passing (30m)
let currentLaneStep = -1; // Track which step's lanes are being shown

// SVG arrow paths for different lane indications
const LANE_ARROW_SVGS = {
    straight: '<path d="M12 4L12 20M12 4L6 10M12 4L18 10"/>',
    left: '<path d="M8 12L4 12L4 8M4 12C4 12 4 16 12 20"/>',
    right: '<path d="M16 12L20 12L20 8M20 12C20 12 20 16 12 20"/>',
    slight_left: '<path d="M7 8L12 20M7 8L4 12M7 8L11 6"/>',
    slight_right: '<path d="M17 8L12 20M17 8L20 12M17 8L13 6"/>',
    sharp_left: '<path d="M4 8L12 20M4 8L4 14M4 8L10 8"/>',
    sharp_right: '<path d="M20 8L12 20M20 8L20 14M20 8L14 8"/>',
    uturn: '<path d="M6 16L6 8C6 5 10 4 12 4C14 4 18 5 18 8L18 16M6 16L10 12M6 16L2 12"/>',
    merge_left: '<path d="M8 4L12 12L12 20M8 4L4 8M8 4L12 8"/>',
    merge_right: '<path d="M16 4L12 12L12 20M16 4L20 8M16 4L12 8"/>',
    none: '<circle cx="12" cy="12" r="3"/>'
};

function showLaneGuidance(step) {
    if (!step.lanes || step.lanes.length === 0) return;

    const container = document.getElementById('lane-guidance');
    const arrowsContainer = document.getElementById('lane-guidance-arrows');
    const hintEl = document.getElementById('lane-guidance-hint');

    if (!container || !arrowsContainer) return;

    // Build lane arrows HTML
    let arrowsHtml = '';
    let validCount = 0;
    let totalCount = step.lanes.length;

    step.lanes.forEach((lane, index) => {
        const isValid = lane.valid;
        if (isValid) validCount++;

        // Get the primary indication for this lane
        const indications = lane.indications || ['straight'];
        const primaryIndication = indications[0] || 'straight';

        // Map OSRM indications to our SVG keys
        const svgKey = mapIndicationToSvg(primaryIndication);
        const svg = LANE_ARROW_SVGS[svgKey] || LANE_ARROW_SVGS.straight;

        arrowsHtml += `
            <div class="lane-arrow ${isValid ? 'valid' : ''}">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                    ${svg}
                </svg>
                <div class="lane-arrow-divider"></div>
            </div>
        `;
    });

    arrowsContainer.innerHTML = arrowsHtml;

    // Update hint text
    if (validCount === 1) {
        hintEl.textContent = 'Use highlighted lane';
    } else if (validCount > 1) {
        hintEl.textContent = `Use ${validCount} highlighted lanes`;
    } else {
        hintEl.textContent = 'Any lane';
    }

    container.classList.add('show');
}

function hideLaneGuidance() {
    const container = document.getElementById('lane-guidance');
    if (container) {
        container.classList.remove('show');
    }
    currentLaneStep = -1;
}

function mapIndicationToSvg(indication) {
    const mapping = {
        'straight': 'straight',
        'left': 'left',
        'right': 'right',
        'slight left': 'slight_left',
        'slight right': 'slight_right',
        'sharp left': 'sharp_left',
        'sharp right': 'sharp_right',
        'uturn': 'uturn',
        'merge to left': 'merge_left',
        'merge to right': 'merge_right',
        'none': 'none'
    };
    return mapping[indication] || 'straight';
}

function updateLaneGuidance(lat, lng) {
    if (!isNavigating || !currentRouteSteps) return;

    // Check upcoming steps for lane data
    for (let i = currentStepIndex; i < Math.min(currentStepIndex + 3, currentRouteSteps.length); i++) {
        const step = currentRouteSteps[i];

        if (!step.lanes || step.lanes.length === 0) continue;
        if (!step.location) continue;

        const distance = calculateDistance(lat, lng, step.location[1], step.location[0]);

        // Show lane guidance when within range
        if (distance < LANE_SHOW_DISTANCE && distance > LANE_HIDE_DISTANCE) {
            if (currentLaneStep !== i) {
                currentLaneStep = i;
                showLaneGuidance(step);

                // Voice announcement for lane guidance
                if (state.settings.voiceGuidance) {
                    const laneText = getLaneVoiceText(step);
                    if (laneText) {
                        speak(laneText);
                    }
                }
            }
            return;
        }
    }

    // Hide if no relevant lane guidance
    if (currentLaneStep !== -1) {
        hideLaneGuidance();
    }
}

function getLaneVoiceText(step) {
    if (!step.lanes || step.lanes.length === 0) return null;

    const validLanes = step.lanes.filter(l => l.valid);
    const totalLanes = step.lanes.length;

    if (validLanes.length === 0) return null;

    // Determine position of valid lanes (left, right, center)
    const validIndices = step.lanes.map((l, i) => l.valid ? i : -1).filter(i => i !== -1);
    const avgIndex = validIndices.reduce((a, b) => a + b, 0) / validIndices.length;
    const middleIndex = (totalLanes - 1) / 2;

    let position = '';
    if (validIndices.length === 1) {
        if (validIndices[0] === 0) position = 'leftmost';
        else if (validIndices[0] === totalLanes - 1) position = 'rightmost';
        else if (validIndices[0] < middleIndex) position = 'left';
        else if (validIndices[0] > middleIndex) position = 'right';
        else position = 'center';
    } else {
        if (avgIndex < middleIndex - 0.5) position = 'left';
        else if (avgIndex > middleIndex + 0.5) position = 'right';
        else position = 'center';
    }

    if (validLanes.length === 1) {
        return `Use the ${position} lane`;
    } else if (validLanes.length === totalLanes) {
        return 'Any lane';
    } else {
        return `Use the ${position} ${validLanes.length} lanes`;
    }
}

function updateSpeedDisplay(speedKmh) {
    let speedEl = document.getElementById('nav-speed-display');
    if (!speedEl) {
        speedEl = document.createElement('div');
        speedEl.id = 'nav-speed-display';
        speedEl.style.cssText = `
            position: fixed;
            bottom: 200px;
            left: 16px;
            background: white;
            padding: 12px 16px;
            border-radius: 16px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.2);
            z-index: 150;
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        document.body.appendChild(speedEl);
    }

    const displaySpeed = state.settings.useMetric ? speedKmh : Math.round(speedKmh * 0.621371);
    const displayLimit = state.settings.useMetric ? currentSpeedLimit : Math.round(currentSpeedLimit * 0.621371);
    const unit = state.settings.useMetric ? 'km/h' : 'mph';

    // Check if speeding (allow 5 km/h grace)
    const isSpeeding = speedKmh > currentSpeedLimit + 5;
    const speedColor = isSpeeding ? '#F44336' : '#333';
    const speedBg = isSpeeding ? '#FFEBEE' : 'white';

    // Update display
    speedEl.style.background = speedBg;
    speedEl.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:28px;font-weight:700;color:${speedColor};">${displaySpeed}</div>
            <div style="font-size:11px;color:#666;">${unit}</div>
        </div>
        <div style="width:1px;height:40px;background:#ddd;"></div>
        <div style="text-align:center;">
            <div style="width:44px;height:44px;border:3px solid #F44336;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:16px;font-weight:700;color:#333;">${displayLimit}</span>
            </div>
        </div>
    `;

    // Speed warning
    if (isSpeeding) {
        triggerSpeedWarning(speedKmh);
    }
}

function triggerSpeedWarning(speedKmh) {
    const now = Date.now();

    // Only warn periodically to avoid spam
    if (now - lastSpeedWarningTime < SPEED_WARNING_INTERVAL) return;
    lastSpeedWarningTime = now;

    // Visual flash
    const speedEl = document.getElementById('nav-speed-display');
    if (speedEl) {
        speedEl.style.animation = 'speedFlash 0.5s ease 3';
        setTimeout(() => {
            speedEl.style.animation = '';
        }, 1500);
    }

    // Add flash animation if not exists
    if (!document.getElementById('speed-warning-style')) {
        const style = document.createElement('style');
        style.id = 'speed-warning-style';
        style.textContent = `
            @keyframes speedFlash {
                0%, 100% { transform: scale(1); box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
                50% { transform: scale(1.05); box-shadow: 0 4px 20px rgba(244,67,54,0.4); }
            }
        `;
        document.head.appendChild(style);
    }

    // Audio warning if enabled
    if (state.settings.alertSounds) {
        speakWarning('Slow down. Speed limit ' + currentSpeedLimit + ' kilometers per hour.');
    }
}

function speakWarning(text) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1.2;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
}

function estimateSpeedLimit(roadName) {
    if (!roadName) return 60;

    const name = roadName.toLowerCase();

    // Highways and freeways
    if (name.includes('highway') || name.includes('freeway') ||
        name.includes('motorway') || name.includes('n1') ||
        name.includes('n2') || name.includes('n3') ||
        name.includes('n4') || name.includes('n12') ||
        name.includes('n14') || name.includes('m1') ||
        name.includes('r21') || name.includes('r24')) {
        return 120;
    }

    // Main roads and avenues
    if (name.includes('avenue') || name.includes('drive') ||
        name.includes('road') || name.includes('boulevard') ||
        name.includes('main') || name.includes('r')) {
        return 80;
    }

    // Streets (residential)
    if (name.includes('street') || name.includes('lane') ||
        name.includes('close') || name.includes('crescent')) {
        return 60;
    }

    // Default urban
    return 60;
}

function updateSpeedLimitFromStep(step) {
    if (step && step.name) {
        currentSpeedLimit = estimateSpeedLimit(step.name);
        console.log('[Navigation] Speed limit for', step.name, ':', currentSpeedLimit, 'km/h');
    }
}

function removeSpeedDisplay() {
    const speedEl = document.getElementById('nav-speed-display');
    if (speedEl) speedEl.remove();
}

function updateETADisplay(durationSec, distanceM) {
    // Store current route info
    currentRouteDurationSec = durationSec;
    currentRouteDistanceM = distanceM;

    let etaEl = document.getElementById('nav-eta-display');
    if (!etaEl) {
        etaEl = document.createElement('div');
        etaEl.id = 'nav-eta-display';
        etaEl.style.cssText = `
            position: fixed;
            top: 110px;
            left: 16px;
            right: 16px;
            background: white;
            padding: 16px 20px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 150;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;
        document.body.appendChild(etaEl);
    }

    // Calculate ETA
    const now = new Date();
    const eta = new Date(now.getTime() + durationSec * 1000);
    const etaTime = formatTime(eta);

    // Format duration
    const durationMin = Math.round(durationSec / 60);
    let durationText;
    if (durationMin >= 60) {
        const hours = Math.floor(durationMin / 60);
        const mins = durationMin % 60;
        durationText = `${hours}h ${mins}m`;
    } else {
        durationText = `${durationMin} min`;
    }

    // Format distance
    let distanceText;
    if (state.settings.useMetric) {
        const km = distanceM / 1000;
        distanceText = km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(distanceM)} m`;
    } else {
        const miles = distanceM / 1609.34;
        distanceText = miles >= 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round(distanceM * 3.281)} ft`;
    }

    etaEl.innerHTML = `
        <div style="flex:1;">
            <div style="font-size:32px;font-weight:700;color:#1976D2;">${etaTime}</div>
            <div style="font-size:14px;color:#666;margin-top:4px;">Arrival time</div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:18px;font-weight:600;color:#333;">${durationText}</div>
            <div style="font-size:14px;color:#666;margin-top:4px;">${distanceText}</div>
        </div>
    `;
}

function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();

    if (state.settings.use24Hour) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } else {
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
}

function removeETADisplay() {
    const etaEl = document.getElementById('nav-eta-display');
    if (etaEl) etaEl.remove();
}

// ============================================
// Directions / Routing
// ============================================
async function getDirections(from, to) {
    showToast('Getting directions...');

    try {
        // Use /api/route/alternatives with traffic-aware routing
        const response = await fetch(
            `${API_BASE}/route/alternatives?origin=${from[0]},${from[1]}&destination=${to[0]},${to[1]}&with_traffic=true`
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error('[Route API Error]', response.status, errText);
            throw new Error('Route request failed');
        }

        const data = await response.json();
        console.log('[Route] Response:', data);

        if (!data.routes || data.routes.length === 0) {
            showToast('No route found');
            return;
        }

        // Store all routes for selection
        alternateRoutes = data.routes;
        selectedRouteIndex = 0;

        // Display all routes on map (selected one on top)
        displayAllRoutes(data.routes, 0);

        // Show route options panel if multiple routes
        if (data.routes.length > 1) {
            showRouteOptions(data.routes);
        }

        // Use the fastest (first) route by default
        const selectedRoute = data.routes[0];

        // Store route geometry for off-route detection
        currentRouteGeometry = selectedRoute.geometry;
        offRouteCount = 0;

        // Store duration and distance for ETA display (use traffic-adjusted)
        currentRouteDurationSec = selectedRoute.duration_in_traffic_s || selectedRoute.duration_s || 0;
        currentRouteDistanceM = selectedRoute.distance_m || 0;

        const distance = selectedRoute.distance_text;
        const duration = selectedRoute.duration_in_traffic_text || selectedRoute.duration_text;

        showToast(`${distance} • ${duration}`);

        // Update nav panel with route info
        document.getElementById('nav-address').textContent = `${distance} • ${duration}`;

        // Show directions list
        displayDirectionsList(distance, duration, selectedRoute.steps);

        // Store steps for navigation
        currentRouteSteps = selectedRoute.steps || [];

        // Voice guidance - announce route
        announceRoute(distance, duration, selectedRoute.steps);

    } catch (error) {
        console.error('[Directions Error]', error);
        showToast('Could not get directions');
    }
}

// Track route markers
let routeStartMarker = null;
let routeEndMarker = null;

// Alternate routes state
let alternateRoutes = [];
let selectedRouteIndex = 0;
const ROUTE_COLORS = ['#2196F3', '#9E9E9E', '#757575']; // Primary, Alt1, Alt2

function displayRoute(geometry) {
    clearRoute();

    if (!state.map.getSource('route')) {
        state.map.addSource('route', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: geometry
            }
        });

        state.map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#2196F3',
                'line-width': 6,
                'line-opacity': 0.8
            }
        });
    } else {
        state.map.getSource('route').setData({
            type: 'Feature',
            geometry: geometry
        });
    }

    // Add start and end markers
    if (geometry.coordinates && geometry.coordinates.length > 0) {
        const startCoord = geometry.coordinates[0];
        const endCoord = geometry.coordinates[geometry.coordinates.length - 1];

        // Start marker (green circle with "A")
        const startEl = document.createElement('div');
        startEl.innerHTML = `
            <div style="width:32px;height:32px;background:#4CAF50;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);color:white;font-weight:bold;font-size:14px;">A</div>
        `;
        routeStartMarker = new maplibregl.Marker({ element: startEl, anchor: 'center' })
            .setLngLat(startCoord)
            .addTo(state.map);

        // End marker (red with "B")
        const endEl = document.createElement('div');
        endEl.innerHTML = `
            <div style="width:32px;height:32px;background:#F44336;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);color:white;font-weight:bold;font-size:14px;">B</div>
        `;
        routeEndMarker = new maplibregl.Marker({ element: endEl, anchor: 'center' })
            .setLngLat(endCoord)
            .addTo(state.map);

        // Fit map to route
        const bounds = geometry.coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new maplibregl.LngLatBounds(geometry.coordinates[0], geometry.coordinates[0]));

        state.map.fitBounds(bounds, { padding: 80 });
    }
}

function clearRoute() {
    // Remove all route layers
    for (let i = 0; i < 3; i++) {
        if (state.map.getLayer(`route-line-${i}`)) {
            state.map.removeLayer(`route-line-${i}`);
        }
        if (state.map.getSource(`route-${i}`)) {
            state.map.removeSource(`route-${i}`);
        }
    }
    // Also remove legacy single route layer
    if (state.map.getLayer('route-line')) {
        state.map.removeLayer('route-line');
    }
    if (state.map.getSource('route')) {
        state.map.removeSource('route');
    }
    // Remove route markers
    if (routeStartMarker) {
        routeStartMarker.remove();
        routeStartMarker = null;
    }
    if (routeEndMarker) {
        routeEndMarker.remove();
        routeEndMarker = null;
    }
    // Clear alternate routes
    alternateRoutes = [];
    selectedRouteIndex = 0;
}

function displayAllRoutes(routes, selectedIndex) {
    clearRoute();

    if (!routes || routes.length === 0) return;

    // Add routes in reverse order so selected is on top
    const orderedIndices = routes.map((_, i) => i).sort((a, b) => {
        if (a === selectedIndex) return 1;
        if (b === selectedIndex) return -1;
        return b - a;
    });

    orderedIndices.forEach(idx => {
        const route = routes[idx];
        const isSelected = idx === selectedIndex;
        const color = isSelected ? ROUTE_COLORS[0] : ROUTE_COLORS[Math.min(idx, 2)];
        const opacity = isSelected ? 0.9 : 0.5;
        const width = isSelected ? 6 : 4;

        // Add route source
        state.map.addSource(`route-${idx}`, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: route.geometry
            }
        });

        // Add route line layer
        state.map.addLayer({
            id: `route-line-${idx}`,
            type: 'line',
            source: `route-${idx}`,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': color,
                'line-width': width,
                'line-opacity': opacity
            }
        });

        // Make alternate routes clickable
        if (!isSelected) {
            state.map.on('click', `route-line-${idx}`, () => {
                selectRoute(idx);
            });

            // Change cursor on hover
            state.map.on('mouseenter', `route-line-${idx}`, () => {
                state.map.getCanvas().style.cursor = 'pointer';
            });
            state.map.on('mouseleave', `route-line-${idx}`, () => {
                state.map.getCanvas().style.cursor = '';
            });
        }
    });

    // Add start/end markers for selected route
    const selectedRoute = routes[selectedIndex];
    if (selectedRoute.geometry.coordinates && selectedRoute.geometry.coordinates.length > 0) {
        const startCoord = selectedRoute.geometry.coordinates[0];
        const endCoord = selectedRoute.geometry.coordinates[selectedRoute.geometry.coordinates.length - 1];

        // Start marker (green circle with "A")
        const startEl = document.createElement('div');
        startEl.innerHTML = `
            <div style="width:32px;height:32px;background:#4CAF50;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);color:white;font-weight:bold;font-size:14px;">A</div>
        `;
        routeStartMarker = new maplibregl.Marker({ element: startEl, anchor: 'center' })
            .setLngLat(startCoord)
            .addTo(state.map);

        // End marker (red with "B")
        const endEl = document.createElement('div');
        endEl.innerHTML = `
            <div style="width:32px;height:32px;background:#F44336;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);color:white;font-weight:bold;font-size:14px;">B</div>
        `;
        routeEndMarker = new maplibregl.Marker({ element: endEl, anchor: 'center' })
            .setLngLat(endCoord)
            .addTo(state.map);

        // Fit map to all routes
        const allCoords = routes.flatMap(r => r.geometry.coordinates);
        const bounds = allCoords.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new maplibregl.LngLatBounds(allCoords[0], allCoords[0]));

        state.map.fitBounds(bounds, { padding: 100 });
    }
}

function showRouteOptions(routes) {
    const panel = document.getElementById('route-options');
    const list = document.getElementById('route-options-list');

    if (!panel || !list) return;

    // Build route options HTML
    list.innerHTML = routes.map((route, idx) => {
        const colorClass = idx === 0 ? 'primary' : (idx === 1 ? 'alt1' : 'alt2');
        const trafficLevel = route.traffic?.level || 'unknown';
        const trafficLabel = trafficLevel === 'free' ? 'Clear' :
                            trafficLevel === 'moderate' ? 'Moderate' :
                            trafficLevel === 'heavy' ? 'Heavy' :
                            trafficLevel === 'severe' ? 'Severe' : 'Unknown';

        const timeClass = trafficLevel === 'heavy' ? 'delayed' :
                         trafficLevel === 'severe' ? 'heavy' : '';

        const isSelected = idx === selectedRouteIndex;

        return `
            <div class="route-option ${isSelected ? 'selected' : ''}" onclick="selectRoute(${idx})">
                <div class="route-option-color ${colorClass}"></div>
                <div class="route-option-info">
                    <div class="route-option-label">
                        ${route.label}
                        <span class="route-option-traffic ${trafficLevel}">${trafficLabel}</span>
                    </div>
                    <div class="route-option-time ${timeClass}">${route.duration_in_traffic_text || route.duration_text}</div>
                    <div class="route-option-details">${route.distance_text} • via ${route.summary || 'main roads'}</div>
                </div>
                <button class="route-option-go" onclick="event.stopPropagation(); selectRouteAndGo(${idx})">
                    ▶
                </button>
            </div>
        `;
    }).join('');

    panel.classList.add('show');
}
window.showRouteOptions = showRouteOptions;

function closeRouteOptions() {
    const panel = document.getElementById('route-options');
    if (panel) {
        panel.classList.remove('show');
    }
}
window.closeRouteOptions = closeRouteOptions;

function selectRoute(index) {
    if (index < 0 || index >= alternateRoutes.length) return;

    selectedRouteIndex = index;
    const selectedRoute = alternateRoutes[index];

    // Redisplay routes with new selection
    displayAllRoutes(alternateRoutes, index);

    // Update route options panel
    const options = document.querySelectorAll('.route-option');
    options.forEach((opt, idx) => {
        opt.classList.toggle('selected', idx === index);
    });

    // Update navigation data
    currentRouteGeometry = selectedRoute.geometry;
    currentRouteDurationSec = selectedRoute.duration_in_traffic_s || selectedRoute.duration_s || 0;
    currentRouteDistanceM = selectedRoute.distance_m || 0;
    currentRouteSteps = selectedRoute.steps || [];
    offRouteCount = 0;

    // Update nav panel
    const distance = selectedRoute.distance_text;
    const duration = selectedRoute.duration_in_traffic_text || selectedRoute.duration_text;
    document.getElementById('nav-address').textContent = `${distance} • ${duration}`;

    // Update directions list
    displayDirectionsList(distance, duration, selectedRoute.steps);

    showToast(`${selectedRoute.label} selected: ${duration}`);
}
window.selectRoute = selectRoute;

function selectRouteAndGo(index) {
    selectRoute(index);
    closeRouteOptions();
    // Start navigation
    startLiveNavigation();
}
window.selectRouteAndGo = selectRouteAndGo;

// ============================================
// Nearby Search
// ============================================
async function searchNearby(category) {
    closeSearch();
    toggleMenu(false);

    if (!state.userLocation) {
        showToast('Getting your location...');
        locateMe();
        setTimeout(() => searchNearby(category), 2000);
        return;
    }

    showToast(`Finding ${category.replace('_', ' ')}...`);

    try {
        const [lng, lat] = state.userLocation;
        const response = await fetch(
            `${API_BASE}/nearby?lat=${lat}&lng=${lng}&category=${category}&radius=5000`
        );

        if (!response.ok) throw new Error('Nearby search failed');

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            showToast('Nothing found nearby');
            return;
        }

        // Clear existing markers
        clearMarkers();

        // Add markers for results
        data.results.slice(0, 20).forEach(place => {
            const marker = new maplibregl.Marker({ color: '#FF5722' })
                .setLngLat([place.lng, place.lat])
                .setPopup(new maplibregl.Popup().setHTML(`
                    <strong>${escapeHtml(place.name)}</strong><br>
                    <small>${escapeHtml(place.address || '')}</small>
                `))
                .addTo(state.map);

            marker.getElement().addEventListener('click', () => {
                state.selectedDestination = { lng: place.lng, lat: place.lat, name: place.name };
                showNavPanel(place.name, place.address || '');
            });

            state.markers.push(marker);
        });

        showToast(`Found ${data.results.length} places`);

    } catch (error) {
        console.error('[Nearby Error]', error);
        showToast('Search failed');
    }
}
window.searchNearby = searchNearby;

// ============================================
// Saved Places
// ============================================
function loadSavedPlaces() {
    const homeEl = document.getElementById('home-address');
    const workEl = document.getElementById('work-address');

    if (state.savedPlaces.home) {
        homeEl.textContent = state.savedPlaces.home.name.split(',')[0];
    }
    if (state.savedPlaces.work) {
        workEl.textContent = state.savedPlaces.work.name.split(',')[0];
    }
}

function goToSaved(type) {
    const place = state.savedPlaces[type];

    if (!place) {
        showToast(`${type === 'home' ? 'Home' : 'Work'} not set`);
        setSavedPlace(type);
        return;
    }

    closeSearch();
    toggleMenu(false);

    selectPlace(place.lng, place.lat, place.name);
}
window.goToSaved = goToSaved;

function setSavedPlace(type) {
    toggleMenu(false);

    if (!state.userLocation) {
        showToast('Getting your location first...');
        locateMe();
        setTimeout(() => setSavedPlace(type), 2000);
        return;
    }

    // Set current location as saved place
    const [lng, lat] = state.userLocation;

    // Reverse geocode to get address
    fetch(`${API_BASE}/reverse-geocode?lat=${lat}&lng=${lng}`)
        .then(r => r.json())
        .then(data => {
            const name = data.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

            state.savedPlaces[type] = { lng, lat, name };
            localStorage.setItem('savedPlaces', JSON.stringify(state.savedPlaces));

            loadSavedPlaces();
            showToast(`${type === 'home' ? 'Home' : 'Work'} saved`);
        })
        .catch(() => {
            const name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            state.savedPlaces[type] = { lng, lat, name };
            localStorage.setItem('savedPlaces', JSON.stringify(state.savedPlaces));

            loadSavedPlaces();
            showToast(`${type === 'home' ? 'Home' : 'Work'} saved`);
        });
}
window.setSavedPlace = setSavedPlace;

// ============================================
// Menu
// ============================================
function toggleMenu(show) {
    const panel = document.getElementById('menu-panel');
    const overlay = document.getElementById('menu-overlay');

    if (typeof show === 'undefined') {
        show = !panel.classList.contains('active');
    }

    if (show) {
        panel.classList.add('active');
        overlay.classList.add('active');
    } else {
        panel.classList.remove('active');
        overlay.classList.remove('active');
    }
}
window.toggleMenu = toggleMenu;

// Menu item handlers (secondary features)
// ============================================
// Historical Timeline Functions
// ============================================

let historicalMapsData = null;
let currentHistoricalOverlay = null;
let selectedHistoricalMap = null;

async function loadHistoricalMapsManifest() {
    if (historicalMapsData) return historicalMapsData;

    try {
        const response = await fetch('/historical-maps/manifest.json');
        if (!response.ok) throw new Error('Failed to load manifest');
        historicalMapsData = await response.json();
        return historicalMapsData;
    } catch (error) {
        console.error('Error loading historical maps:', error);
        return null;
    }
}

function openTimeline() {
    toggleMenu(false);
    const backdrop = document.getElementById('timeline-backdrop');
    const panel = document.getElementById('timeline-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
        // Load and display maps
        initTimelinePanel();
    }
}
window.openTimeline = openTimeline;

function closeTimelinePanel() {
    const backdrop = document.getElementById('timeline-backdrop');
    const panel = document.getElementById('timeline-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
}
window.closeTimelinePanel = closeTimelinePanel;

async function initTimelinePanel() {
    const data = await loadHistoricalMapsManifest();
    if (!data) {
        showToast('Unable to load historical maps');
        return;
    }

    // Set initial year and update display
    const slider = document.getElementById('timeline-slider');
    if (slider) {
        updateTimelineYear(slider.value);
    }
}

function updateTimelineYear(year) {
    year = parseInt(year);

    // Update year display
    const yearValue = document.getElementById('timeline-year-value');
    const yearSuffix = document.getElementById('timeline-year-suffix');
    const periodName = document.getElementById('timeline-period-name');

    if (yearValue) {
        yearValue.textContent = Math.abs(year);
    }
    if (yearSuffix) {
        yearSuffix.textContent = year < 0 ? 'BCE' : 'CE';
    }

    // Determine period
    if (periodName && historicalMapsData) {
        const period = historicalMapsData.periods.find(p => year >= p.start && year <= p.end);
        periodName.textContent = period ? period.name : '';
    }

    // Filter and display maps for this period
    displayMapsForYear(year);
}
window.updateTimelineYear = updateTimelineYear;

function displayMapsForYear(year) {
    const grid = document.getElementById('timeline-maps-grid');
    if (!grid || !historicalMapsData) return;

    // Find maps that cover this year
    const relevantMaps = historicalMapsData.maps.filter(map => {
        return year >= map.period.start && year <= map.period.end;
    });

    if (relevantMaps.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 20px;">No maps available for this period</div>';
        return;
    }

    grid.innerHTML = relevantMaps.map(map => {
        const isSelected = selectedHistoricalMap === map.id;
        const thumbPath = `/historical-maps/thumbs/${map.file.replace('.jpg', '-thumb.jpg')}`;
        const fallbackPath = `/historical-maps/${map.file}`;

        return `
            <div class="timeline-map-card ${isSelected ? 'selected' : ''}"
                 onclick="selectHistoricalMap('${map.id}')"
                 data-map-id="${map.id}">
                <img class="timeline-map-thumb"
                     src="${thumbPath}"
                     alt="${map.title}"
                     onerror="this.src='${fallbackPath}'">
                <div class="timeline-map-info">
                    <div class="timeline-map-title">${map.title}</div>
                    <div class="timeline-map-period">${formatMapPeriod(map.period)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function formatMapPeriod(period) {
    const formatYear = (y) => y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
    return `${formatYear(period.start)} - ${formatYear(period.end)}`;
}

async function selectHistoricalMap(mapId) {
    const data = await loadHistoricalMapsManifest();
    if (!data) return;

    const map = data.maps.find(m => m.id === mapId);
    if (!map) return;

    selectedHistoricalMap = mapId;

    // Update UI selection
    document.querySelectorAll('.timeline-map-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.mapId === mapId);
    });

    // Show overlay controls
    const controls = document.getElementById('timeline-overlay-controls');
    if (controls) {
        controls.style.display = 'block';
    }

    // Apply the overlay
    applyHistoricalOverlay(map);

    // Update indicator
    const indicator = document.getElementById('timeline-indicator');
    const indicatorTitle = document.getElementById('timeline-indicator-title');
    if (indicator && indicatorTitle) {
        indicatorTitle.textContent = map.title;
        indicator.classList.add('active');
    }

    showToast(`Overlaying: ${map.title}`);
}
window.selectHistoricalMap = selectHistoricalMap;

function applyHistoricalOverlay(mapData) {
    if (!state.map) return;

    // Remove existing overlay if any
    removeHistoricalOverlay();

    const imagePath = `/historical-maps/${mapData.file}`;

    // Get bounds from map data or use default world bounds
    let bounds;
    if (mapData.bounds) {
        bounds = mapData.bounds;
    } else if (mapData.region === 'world') {
        bounds = [[-60, -180], [75, 180]];
    } else {
        // Default to Mediterranean region for ancient maps
        bounds = [[20, -20], [55, 60]];
    }

    // Add image source
    state.map.addSource('historical-overlay', {
        type: 'image',
        url: imagePath,
        coordinates: [
            [bounds[0][1], bounds[1][0]], // top-left
            [bounds[1][1], bounds[1][0]], // top-right
            [bounds[1][1], bounds[0][0]], // bottom-right
            [bounds[0][1], bounds[0][0]]  // bottom-left
        ]
    });

    // Add image layer
    state.map.addLayer({
        id: 'historical-overlay-layer',
        type: 'raster',
        source: 'historical-overlay',
        paint: {
            'raster-opacity': 0.7,
            'raster-fade-duration': 300
        }
    });

    currentHistoricalOverlay = mapData.id;

    // Optionally fly to the map region
    if (mapData.bounds) {
        state.map.fitBounds([
            [bounds[0][1], bounds[0][0]],
            [bounds[1][1], bounds[1][0]]
        ], { padding: 50, duration: 1000 });
    }
}

function removeHistoricalOverlay() {
    if (!state.map) return;

    try {
        if (state.map.getLayer('historical-overlay-layer')) {
            state.map.removeLayer('historical-overlay-layer');
        }
        if (state.map.getSource('historical-overlay')) {
            state.map.removeSource('historical-overlay');
        }
    } catch (e) {
        console.log('Error removing overlay:', e);
    }

    currentHistoricalOverlay = null;
}

function clearTimelineOverlay() {
    removeHistoricalOverlay();
    selectedHistoricalMap = null;

    // Update UI
    document.querySelectorAll('.timeline-map-card').forEach(card => {
        card.classList.remove('selected');
    });

    const controls = document.getElementById('timeline-overlay-controls');
    if (controls) {
        controls.style.display = 'none';
    }

    const indicator = document.getElementById('timeline-indicator');
    if (indicator) {
        indicator.classList.remove('active');
    }

    showToast('Historical overlay cleared');
}
window.clearTimelineOverlay = clearTimelineOverlay;

function updateTimelineOpacity(value) {
    const opacityValue = document.getElementById('timeline-opacity-value');
    if (opacityValue) {
        opacityValue.textContent = `${value}%`;
    }

    // Update map layer opacity
    if (state.map && state.map.getLayer('historical-overlay-layer')) {
        state.map.setPaintProperty('historical-overlay-layer', 'raster-opacity', value / 100);
    }
}
window.updateTimelineOpacity = updateTimelineOpacity;

// ============================================
// Transit Overlay Functions
// ============================================

let transitCurrentTab = 'nearby';
let transitStopsCache = null;
let transitDepartureTime = null; // null = now

function openTransit() {
    toggleMenu(false);
    const backdrop = document.getElementById('transit-backdrop');
    const panel = document.getElementById('transit-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
        // Load nearby stops
        loadNearbyTransitStops();
    }
}
window.openTransit = openTransit;

function closeTransitPanel() {
    const backdrop = document.getElementById('transit-backdrop');
    const panel = document.getElementById('transit-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
}
window.closeTransitPanel = closeTransitPanel;

function switchTransitTab(tab) {
    transitCurrentTab = tab;

    // Update tab UI
    document.querySelectorAll('.transit-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Load content based on tab
    if (tab === 'nearby') {
        loadNearbyTransitStops();
    } else if (tab === 'routes') {
        showTransitRoutePlanner();
    } else {
        loadTransitByType(tab);
    }
}
window.switchTransitTab = switchTransitTab;

function setTransitDeparture(mode) {
    const nowBtn = document.getElementById('transit-depart-now');
    const laterBtn = document.getElementById('transit-depart-later');
    const timeInput = document.getElementById('transit-depart-time');

    if (mode === 'now') {
        nowBtn.classList.add('active');
        laterBtn.classList.remove('active');
        timeInput.style.display = 'none';
        transitDepartureTime = null;
    } else {
        nowBtn.classList.remove('active');
        laterBtn.classList.add('active');
        timeInput.style.display = 'block';
        // Set default to current time
        const now = new Date();
        timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        transitDepartureTime = timeInput.value;
    }
}
window.setTransitDeparture = setTransitDeparture;

function updateTransitDeparture() {
    transitDepartureTime = document.getElementById('transit-depart-time').value;
}
window.updateTransitDeparture = updateTransitDeparture;

function showTransitRoutePlanner() {
    const content = document.getElementById('transit-content');
    if (!content) return;

    content.innerHTML = `
        <div style="padding: 10px 0;">
            <div style="background: #f5f5f5; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background: #4CAF50;"></div>
                    <input type="text" id="transit-from" placeholder="From (current location)"
                           style="flex: 1; border: none; background: transparent; font-size: 15px; outline: none;"
                           value="${state.userLocation ? 'Current Location' : ''}" readonly>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background: #E53935;"></div>
                    <input type="text" id="transit-to" placeholder="Enter destination"
                           style="flex: 1; border: none; background: transparent; font-size: 15px; outline: none;"
                           onkeyup="if(event.key==='Enter') planTransitTrip()">
                </div>
            </div>
            <button onclick="planTransitTrip()" style="width: 100%; padding: 14px; background: #4CAF50; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer;">
                Find Transit Routes
            </button>
        </div>
        <div id="transit-route-results"></div>
    `;
}

async function planTransitTrip() {
    const destInput = document.getElementById('transit-to');
    const resultsDiv = document.getElementById('transit-route-results');

    if (!destInput || !resultsDiv) return;

    const destination = destInput.value.trim();
    if (!destination) {
        showToast('Please enter a destination');
        return;
    }

    if (!state.userLocation) {
        showToast('Enable location for transit routing');
        return;
    }

    resultsDiv.innerHTML = '<div class="transit-loading">Finding transit routes...</div>';

    try {
        // Geocode destination
        const geoResponse = await fetch(`${API_BASE}/geocode?q=${encodeURIComponent(destination)}`);
        if (!geoResponse.ok) throw new Error('Geocode failed');

        const geoData = await geoResponse.json();
        if (!geoData.results || geoData.results.length === 0) {
            resultsDiv.innerHTML = `<div class="transit-empty"><div class="transit-empty-icon">🔍</div><p>Destination not found</p></div>`;
            return;
        }

        const dest = geoData.results[0];

        // Get transit route
        const routeResponse = await fetch(
            `${API_BASE}/transit/routes?origin=${state.userLocation.lng},${state.userLocation.lat}&destination=${dest.lng},${dest.lat}`
        );

        if (!routeResponse.ok) throw new Error('Route failed');

        const routeData = await routeResponse.json();

        // Calculate walking distances
        const originWalkDist = routeData.origin_stops?.[0]?.distance_km || 0;
        const destWalkDist = routeData.destination_stops?.[0]?.distance_km || 0;

        const departTime = transitDepartureTime || new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

        resultsDiv.innerHTML = `
            <div class="transit-route-card" style="margin-top: 16px;">
                <div class="transit-route-header">
                    <div>
                        <div class="transit-route-time">${departTime}</div>
                        <div class="transit-route-duration">Depart</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 14px; color: #666;">To ${escapeHtml(dest.name)}</div>
                    </div>
                </div>
                <div class="transit-route-steps">
                    <div class="transit-route-step">
                        <div class="transit-step-icon transit-step-walk">🚶</div>
                        <div class="transit-step-details">
                            <div class="transit-step-line">Walk ${(originWalkDist * 1000).toFixed(0)}m</div>
                            <div class="transit-step-info">to ${escapeHtml(routeData.origin_stops?.[0]?.name || 'nearest stop')}</div>
                        </div>
                    </div>
                    <div class="transit-route-step">
                        <div class="transit-step-icon transit-step-bus">🚌</div>
                        <div class="transit-step-details">
                            <div class="transit-step-line">Public Transport</div>
                            <div class="transit-step-info">${escapeHtml(routeData.origin_stops?.[0]?.stop_type || 'Bus/Taxi')}</div>
                        </div>
                    </div>
                    <div class="transit-route-step">
                        <div class="transit-step-icon transit-step-walk">🚶</div>
                        <div class="transit-step-details">
                            <div class="transit-step-line">Walk ${(destWalkDist * 1000).toFixed(0)}m</div>
                            <div class="transit-step-info">to destination</div>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #eee;">
                    <button onclick="showTransitRouteOnMap(${dest.lat}, ${dest.lng}, '${escapeHtml(dest.name)}')"
                            style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;">
                        Show on Map
                    </button>
                </div>
            </div>
            <p style="text-align: center; color: #888; font-size: 12px; margin-top: 16px;">
                Schedule data requires GTFS integration. Check local schedules for exact times.
            </p>
        `;

    } catch (error) {
        console.error('Transit planning error:', error);
        resultsDiv.innerHTML = `<div class="transit-empty"><div class="transit-empty-icon">⚠️</div><p>Unable to plan route</p></div>`;
    }
}
window.planTransitTrip = planTransitTrip;

function showTransitRouteOnMap(destLat, destLng, destName) {
    closeTransitPanel();

    if (state.map && state.userLocation) {
        // Fit bounds to show both origin and destination
        const bounds = [
            [Math.min(state.userLocation.lng, destLng), Math.min(state.userLocation.lat, destLat)],
            [Math.max(state.userLocation.lng, destLng), Math.max(state.userLocation.lat, destLat)]
        ];

        state.map.fitBounds(bounds, { padding: 80, duration: 1000 });

        // Add destination marker
        const popup = new maplibregl.Popup({ offset: 25 })
            .setHTML(`<strong>${escapeHtml(destName)}</strong><br><small>Destination</small>`);

        new maplibregl.Marker({ color: '#E53935' })
            .setLngLat([destLng, destLat])
            .setPopup(popup)
            .addTo(state.map);
    }

    showToast('Transit route to ' + destName);
}
window.showTransitRouteOnMap = showTransitRouteOnMap;

async function loadNearbyTransitStops() {
    const content = document.getElementById('transit-content');
    if (!content) return;

    if (!state.userLocation) {
        content.innerHTML = `
            <div class="transit-empty">
                <div class="transit-empty-icon">📍</div>
                <p>Enable location to see nearby transit stops</p>
            </div>
        `;
        return;
    }

    content.innerHTML = '<div class="transit-loading">Loading nearby stops...</div>';

    try {
        // Calculate bounding box around user (approx 2km radius)
        const lat = state.userLocation.lat;
        const lng = state.userLocation.lng;
        const delta = 0.02; // ~2km

        const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
        const response = await fetch(`${API_BASE}/transit/stops?bbox=${bbox}`);

        if (!response.ok) throw new Error('Failed to load stops');

        const data = await response.json();
        const features = data.features || [];

        if (features.length === 0) {
            content.innerHTML = `
                <div class="transit-empty">
                    <div class="transit-empty-icon">🚌</div>
                    <p>No transit stops found nearby</p>
                </div>
            `;
            return;
        }

        // Sort by distance from user
        features.sort((a, b) => {
            const distA = getDistance(lat, lng, a.geometry.coordinates[1], a.geometry.coordinates[0]);
            const distB = getDistance(lat, lng, b.geometry.coordinates[1], b.geometry.coordinates[0]);
            return distA - distB;
        });

        transitStopsCache = features;
        renderTransitStops(features.slice(0, 20));

    } catch (error) {
        console.error('Transit load error:', error);
        content.innerHTML = `
            <div class="transit-empty">
                <div class="transit-empty-icon">⚠️</div>
                <p>Unable to load transit stops</p>
            </div>
        `;
    }
}

async function loadTransitByType(type) {
    const content = document.getElementById('transit-content');
    if (!content) return;

    if (!state.userLocation) {
        content.innerHTML = `
            <div class="transit-empty">
                <div class="transit-empty-icon">📍</div>
                <p>Enable location to see ${type}</p>
            </div>
        `;
        return;
    }

    content.innerHTML = '<div class="transit-loading">Loading...</div>';

    // Filter cached stops by type
    if (transitStopsCache) {
        const typeMap = {
            'buses': 'Bus Station',
            'trains': 'Train Station',
            'taxis': 'Transport'
        };

        const filtered = transitStopsCache.filter(f =>
            f.properties.stop_type === typeMap[type] ||
            (type === 'taxis' && f.properties.stop_type === 'Transport')
        );

        if (filtered.length === 0) {
            content.innerHTML = `
                <div class="transit-empty">
                    <div class="transit-empty-icon">${type === 'buses' ? '🚌' : type === 'trains' ? '🚂' : '🚕'}</div>
                    <p>No ${type} stops found nearby</p>
                </div>
            `;
            return;
        }

        renderTransitStops(filtered.slice(0, 20));
    } else {
        loadNearbyTransitStops();
    }
}

function renderTransitStops(stops) {
    const content = document.getElementById('transit-content');
    if (!content) return;

    const html = `
        <div class="transit-stop-list">
            ${stops.map(stop => {
                const props = stop.properties;
                const coords = stop.geometry.coordinates;
                const type = getStopType(props.stop_type);
                const distance = state.userLocation
                    ? formatDistance(getDistance(
                        state.userLocation.lat, state.userLocation.lng,
                        coords[1], coords[0]
                    ) * 1000)
                    : '';

                return `
                    <div class="transit-stop-card" onclick="goToTransitStop(${coords[1]}, ${coords[0]}, '${escapeHtml(props.name || 'Transit Stop')}')">
                        <div class="transit-stop-icon ${type.class}">${type.icon}</div>
                        <div class="transit-stop-info">
                            <div class="transit-stop-name">${escapeHtml(props.name || 'Transit Stop')}</div>
                            <div class="transit-stop-meta">${escapeHtml(props.stop_type || 'Transport')}</div>
                        </div>
                        <div class="transit-stop-distance">${distance}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    content.innerHTML = html;
}

function getStopType(type) {
    const types = {
        'Bus Station': { icon: '🚌', class: 'bus' },
        'Train Station': { icon: '🚂', class: 'train' },
        'Transport': { icon: '🚕', class: 'taxi' },
        'Airport': { icon: '✈️', class: 'airport' }
    };
    return types[type] || { icon: '🚏', class: 'bus' };
}

function goToTransitStop(lat, lng, name) {
    closeTransitPanel();

    if (state.map) {
        state.map.flyTo({
            center: [lng, lat],
            zoom: 17,
            duration: 1000
        });

        // Add a marker
        const popup = new maplibregl.Popup({ offset: 25 })
            .setHTML(`<strong>${escapeHtml(name)}</strong><br><small>Transit Stop</small>`);

        new maplibregl.Marker({ color: '#4CAF50' })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(state.map)
            .togglePopup();
    }

    showToast(`Showing: ${name}`);
}
window.goToTransitStop = goToTransitStop;

function handleTransitSearch(event) {
    if (event.key === 'Enter') {
        const query = event.target.value.trim();
        if (query) {
            searchTransitDestination(query);
        }
    }
}
window.handleTransitSearch = handleTransitSearch;

async function searchTransitDestination(query) {
    const content = document.getElementById('transit-content');
    if (!content) return;

    content.innerHTML = '<div class="transit-loading">Searching...</div>';

    try {
        // Use geocode to find destination
        const response = await fetch(`${API_BASE}/geocode?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        if (!data.results || data.results.length === 0) {
            content.innerHTML = `
                <div class="transit-empty">
                    <div class="transit-empty-icon">🔍</div>
                    <p>No results found for "${escapeHtml(query)}"</p>
                </div>
            `;
            return;
        }

        // Get transit route to first result
        const dest = data.results[0];
        if (state.userLocation) {
            getTransitRoute(
                state.userLocation.lng, state.userLocation.lat,
                dest.lng, dest.lat, dest.name
            );
        } else {
            content.innerHTML = `
                <div class="transit-empty">
                    <div class="transit-empty-icon">📍</div>
                    <p>Enable location for transit directions</p>
                </div>
            `;
        }

    } catch (error) {
        console.error('Transit search error:', error);
        content.innerHTML = `
            <div class="transit-empty">
                <div class="transit-empty-icon">⚠️</div>
                <p>Search failed. Try again.</p>
            </div>
        `;
    }
}

async function getTransitRoute(originLng, originLat, destLng, destLat, destName) {
    const content = document.getElementById('transit-content');
    if (!content) return;

    content.innerHTML = '<div class="transit-loading">Finding transit route...</div>';

    try {
        const response = await fetch(
            `${API_BASE}/transit/routes?origin=${originLng},${originLat}&destination=${destLng},${destLat}`
        );

        if (!response.ok) throw new Error('Route failed');

        const data = await response.json();

        // Display route options
        content.innerHTML = `
            <div class="transit-route-card">
                <div class="transit-route-header">
                    <div class="transit-route-time">To ${escapeHtml(destName)}</div>
                </div>
                <div class="transit-route-steps">
                    <div class="transit-route-step">
                        <div class="transit-step-icon transit-step-walk">🚶</div>
                        <div class="transit-step-details">
                            <div class="transit-step-line">Walk to nearest stop</div>
                            <div class="transit-step-info">${data.origin_stops ? escapeHtml(data.origin_stops[0]?.name || 'Nearby stop') : 'Nearby stop'}</div>
                        </div>
                    </div>
                    <div class="transit-route-step">
                        <div class="transit-step-icon transit-step-bus">🚌</div>
                        <div class="transit-step-details">
                            <div class="transit-step-line">Take public transport</div>
                            <div class="transit-step-info">Check local schedules for times</div>
                        </div>
                    </div>
                    <div class="transit-route-step">
                        <div class="transit-step-icon transit-step-walk">🚶</div>
                        <div class="transit-step-details">
                            <div class="transit-step-line">Walk to destination</div>
                            <div class="transit-step-info">${data.destination_stops ? escapeHtml(data.destination_stops[0]?.name || 'Nearby stop') : 'Nearby stop'}</div>
                        </div>
                    </div>
                </div>
            </div>
            <p style="text-align: center; color: #666; font-size: 13px; margin-top: 16px;">
                Real-time schedules coming soon with GTFS integration
            </p>
        `;

    } catch (error) {
        console.error('Transit route error:', error);
        content.innerHTML = `
            <div class="transit-empty">
                <div class="transit-empty-icon">⚠️</div>
                <p>Unable to find transit route</p>
            </div>
        `;
    }
}

// ============================================
// Rideshare / Carpool Functions
// ============================================

let selectedRideshareService = 'uber';
let rideshareDestination = null;

function openRideshare(destName, destLat, destLng) {
    rideshareDestination = { name: destName, lat: destLat, lng: destLng };

    const destDisplay = document.getElementById('rideshare-dest-name');
    if (destDisplay) {
        destDisplay.textContent = destName || 'Select a destination';
    }

    const backdrop = document.getElementById('rideshare-backdrop');
    const panel = document.getElementById('rideshare-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
    }

    // Estimate prices based on distance
    if (state.userLocation && destLat && destLng) {
        const distKm = getDistance(state.userLocation.lat, state.userLocation.lng, destLat, destLng);
        updateRideshareEstimates(distKm);
    }
}
window.openRideshare = openRideshare;

function closeRidesharePanel() {
    const backdrop = document.getElementById('rideshare-backdrop');
    const panel = document.getElementById('rideshare-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
}
window.closeRidesharePanel = closeRidesharePanel;

function updateRideshareEstimates(distKm) {
    // South African rideshare estimates (very approximate)
    const baseRates = {
        uber: { base: 10, perKm: 8, min: 25 },
        bolt: { base: 8, perKm: 7.5, min: 20 },
        indrive: { base: 5, perKm: 6, min: 15 },
        taxi: { base: 15, perKm: 12, min: 50 }
    };

    document.querySelectorAll('.rideshare-option').forEach(option => {
        const service = option.querySelector('.rideshare-name').textContent.toLowerCase().split(' ')[0];
        const rate = baseRates[service] || baseRates.uber;

        const lowEstimate = Math.max(rate.min, Math.round(rate.base + distKm * rate.perKm * 0.8));
        const highEstimate = Math.round(rate.base + distKm * rate.perKm * 1.3);

        const priceEl = option.querySelector('.rideshare-price-value');
        if (priceEl) {
            priceEl.textContent = `R${lowEstimate}-${highEstimate}`;
        }
    });
}

function selectRideshare(service, element) {
    selectedRideshareService = service;

    document.querySelectorAll('.rideshare-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');

    const serviceNames = {
        uber: 'Uber',
        bolt: 'Bolt',
        indrive: 'inDrive',
        taxi: 'Taxi'
    };

    const btn = document.getElementById('rideshare-book-btn');
    if (btn) {
        btn.textContent = `Open ${serviceNames[service] || service} to Book`;
    }
}
window.selectRideshare = selectRideshare;

function bookRideshare() {
    if (!rideshareDestination) {
        showToast('Please select a destination first');
        return;
    }

    const { lat, lng, name } = rideshareDestination;
    let deepLink = '';

    // Construct deep links for each service
    switch (selectedRideshareService) {
        case 'uber':
            // Uber deep link format
            deepLink = `uber://?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${encodeURIComponent(name)}`;
            break;
        case 'bolt':
            // Bolt deep link
            deepLink = `bolt://r?destination_lat=${lat}&destination_lng=${lng}&destination_name=${encodeURIComponent(name)}`;
            break;
        case 'indrive':
            // inDrive doesn't have public deep links, open store
            deepLink = 'https://indrive.com/';
            break;
        case 'taxi':
            // No specific app, show phone number
            showToast('Call your local taxi service');
            return;
    }

    // Try to open the app
    const fallbackUrls = {
        uber: 'https://m.uber.com/',
        bolt: 'https://bolt.eu/',
        indrive: 'https://indrive.com/'
    };

    window.location.href = deepLink;

    // Fallback to web after delay if app didn't open
    setTimeout(() => {
        if (document.hasFocus()) {
            window.open(fallbackUrls[selectedRideshareService] || fallbackUrls.uber, '_blank');
        }
    }, 1500);

    closeRidesharePanel();
    showToast(`Opening ${selectedRideshareService}...`);
}
window.bookRideshare = bookRideshare;

// ============================================
// POI Photo Functions
// ============================================

let poiPhotosCache = {}; // Stored in localStorage
let currentPhotoPoiId = null;

// Load photos from localStorage on init
try {
    const savedPhotos = localStorage.getItem('poiPhotos');
    if (savedPhotos) poiPhotosCache = JSON.parse(savedPhotos);
} catch (e) {}

function getPoiPhotos(poiId) {
    return poiPhotosCache[poiId] || [];
}

function addPoiPhotoUI(poiId, containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const photos = getPoiPhotos(poiId);

    const html = `
        <div class="poi-photo-section">
            <div style="font-size: 14px; font-weight: 600; color: #333; margin-bottom: 10px;">Photos</div>
            <div class="poi-photos-grid">
                ${photos.slice(0, 5).map((photo, idx) => `
                    <img class="poi-photo-thumb" src="${photo}" alt="Photo ${idx + 1}"
                         onclick="event.stopPropagation(); viewPoiPhoto('${photo}')">
                `).join('')}
                <div class="poi-photo-add" onclick="event.stopPropagation(); triggerPoiPhotoUpload('${poiId}')">
                    <div class="poi-photo-add-icon">📷</div>
                    <span>Add Photo</span>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
}
window.addPoiPhotoUI = addPoiPhotoUI;

function triggerPoiPhotoUpload(poiId) {
    currentPhotoPoiId = poiId;
    document.getElementById('poi-photo-input').click();
}
window.triggerPoiPhotoUpload = triggerPoiPhotoUpload;

function handlePoiPhotoUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentPhotoPoiId) return;

    // Convert to base64 for local storage
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result;

        // Store photo
        if (!poiPhotosCache[currentPhotoPoiId]) {
            poiPhotosCache[currentPhotoPoiId] = [];
        }
        poiPhotosCache[currentPhotoPoiId].unshift(base64);

        // Limit to 10 photos per POI
        if (poiPhotosCache[currentPhotoPoiId].length > 10) {
            poiPhotosCache[currentPhotoPoiId] = poiPhotosCache[currentPhotoPoiId].slice(0, 10);
        }

        // Save to localStorage
        try {
            localStorage.setItem('poiPhotos', JSON.stringify(poiPhotosCache));
        } catch (e) {
            // localStorage might be full, remove oldest photos
            console.warn('Storage full, clearing old photos');
        }

        showToast('Photo added!');
        currentPhotoPoiId = null;

        // Reset input
        event.target.value = '';
    };
    reader.readAsDataURL(file);
}
window.handlePoiPhotoUpload = handlePoiPhotoUpload;

function viewPoiPhoto(photoSrc) {
    const modal = document.getElementById('photo-viewer-modal');
    const img = document.getElementById('photo-viewer-img');
    if (modal && img) {
        img.src = photoSrc;
        modal.classList.add('active');
    }
}
window.viewPoiPhoto = viewPoiPhoto;

function closePhotoViewer() {
    const modal = document.getElementById('photo-viewer-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}
window.closePhotoViewer = closePhotoViewer;

// ============================================
// Fuel Prices Functions
// ============================================

let fuelStationsCache = [];
let currentFuelType = '95';
let fuelPricesCache = {}; // Crowdsourced prices stored locally

function openFuelPrices() {
    toggleMenu(false);
    const backdrop = document.getElementById('fuel-backdrop');
    const panel = document.getElementById('fuel-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
        loadFuelStations();
    }
}
window.openFuelPrices = openFuelPrices;

function closeFuelPanel() {
    const backdrop = document.getElementById('fuel-backdrop');
    const panel = document.getElementById('fuel-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
}
window.closeFuelPanel = closeFuelPanel;

function switchFuelType(type) {
    currentFuelType = type;
    document.querySelectorAll('.fuel-type-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.fuel === type);
    });
    renderFuelStations();
}
window.switchFuelType = switchFuelType;

async function loadFuelStations() {
    const list = document.getElementById('fuel-station-list');
    if (!list) return;

    if (!state.userLocation) {
        list.innerHTML = `
            <div class="fuel-empty">
                <div class="fuel-empty-icon">📍</div>
                <p>Enable location to find fuel stations</p>
            </div>
        `;
        return;
    }

    list.innerHTML = '<div class="fuel-empty">Loading fuel stations...</div>';

    // Load crowdsourced prices from localStorage
    try {
        const saved = localStorage.getItem('fuelPrices');
        if (saved) fuelPricesCache = JSON.parse(saved);
    } catch (e) {}

    try {
        const response = await fetch(
            `${API_BASE}/pois/nearby?lat=${state.userLocation.lat}&lng=${state.userLocation.lng}&radius=10000&category=fuel,gas,petrol`
        );

        if (!response.ok) throw new Error('Failed to load stations');

        const data = await response.json();
        fuelStationsCache = data.pois || [];

        if (fuelStationsCache.length === 0) {
            list.innerHTML = `
                <div class="fuel-empty">
                    <div class="fuel-empty-icon">⛽</div>
                    <p>No fuel stations found nearby</p>
                </div>
            `;
            return;
        }

        renderFuelStations();

    } catch (error) {
        console.error('Fuel stations error:', error);
        list.innerHTML = `
            <div class="fuel-empty">
                <div class="fuel-empty-icon">⚠️</div>
                <p>Unable to load fuel stations</p>
            </div>
        `;
    }
}

function renderFuelStations() {
    const list = document.getElementById('fuel-station-list');
    if (!list || fuelStationsCache.length === 0) return;

    const stations = fuelStationsCache.map(station => {
        const prices = fuelPricesCache[station.id] || {};
        const distance = state.userLocation
            ? getDistance(state.userLocation.lat, state.userLocation.lng, station.lat, station.lng) * 1000
            : 0;
        return { ...station, prices, distance };
    });

    // Sort by distance (could also sort by price if data available)
    stations.sort((a, b) => a.distance - b.distance);

    list.innerHTML = stations.slice(0, 20).map(station => {
        const prices = station.prices;
        const lastUpdated = prices.updatedAt ? formatTimeAgo(prices.updatedAt) : null;

        return `
            <div class="fuel-station-card" onclick="goToFuelStation(${station.lat}, ${station.lng}, '${escapeHtml(station.name)}')">
                <div class="fuel-station-header">
                    <div class="fuel-station-info">
                        <div class="fuel-station-name">${escapeHtml(station.name)}</div>
                        <div class="fuel-station-brand">${escapeHtml(detectFuelBrand(station.name))}</div>
                    </div>
                    <div class="fuel-station-distance">${formatDistance(station.distance)}</div>
                </div>
                <div class="fuel-prices-row">
                    <div class="fuel-price-badge">
                        <span class="fuel-price-type">95</span>
                        <span class="fuel-price-value ${prices['95'] ? '' : 'no-data'}">
                            ${prices['95'] ? 'R' + prices['95'].toFixed(2) : '-'}
                        </span>
                    </div>
                    <div class="fuel-price-badge">
                        <span class="fuel-price-type">93</span>
                        <span class="fuel-price-value ${prices['93'] ? '' : 'no-data'}">
                            ${prices['93'] ? 'R' + prices['93'].toFixed(2) : '-'}
                        </span>
                    </div>
                    <div class="fuel-price-badge">
                        <span class="fuel-price-type">Diesel</span>
                        <span class="fuel-price-value ${prices.diesel ? '' : 'no-data'}">
                            ${prices.diesel ? 'R' + prices.diesel.toFixed(2) : '-'}
                        </span>
                    </div>
                </div>
                <div class="fuel-station-footer">
                    <span class="fuel-updated">${lastUpdated ? 'Updated ' + lastUpdated : 'No price data'}</span>
                    <button class="fuel-report-btn" onclick="event.stopPropagation(); openFuelReport(${station.id}, '${escapeHtml(station.name)}')">
                        Report Price
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function detectFuelBrand(name) {
    const brands = {
        'Shell': ['shell'],
        'Engen': ['engen'],
        'Caltex': ['caltex'],
        'BP': ['bp', 'british petroleum'],
        'Total': ['total', 'totalenergies'],
        'Sasol': ['sasol'],
        'Puma': ['puma']
    };

    const lowerName = name.toLowerCase();
    for (const [brand, keywords] of Object.entries(brands)) {
        if (keywords.some(kw => lowerName.includes(kw))) {
            return brand;
        }
    }
    return 'Fuel Station';
}

function goToFuelStation(lat, lng, name) {
    closeFuelPanel();

    if (state.map) {
        state.map.flyTo({
            center: [lng, lat],
            zoom: 17,
            duration: 1000
        });

        const popup = new maplibregl.Popup({ offset: 25 })
            .setHTML(`<strong>${escapeHtml(name)}</strong><br><small>Fuel Station</small>`);

        new maplibregl.Marker({ color: '#FF9800' })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(state.map)
            .togglePopup();
    }

    showToast(`Showing: ${name}`);
}
window.goToFuelStation = goToFuelStation;

function openFuelReport(stationId, stationName) {
    document.getElementById('fuel-report-station-id').value = stationId;
    document.getElementById('fuel-report-station-name').textContent = stationName;

    // Pre-fill with existing prices if available
    const prices = fuelPricesCache[stationId] || {};
    document.getElementById('fuel-report-price-95').value = prices['95'] || '';
    document.getElementById('fuel-report-price-93').value = prices['93'] || '';
    document.getElementById('fuel-report-price-diesel').value = prices.diesel || '';

    document.getElementById('fuel-report-modal').classList.add('active');
}
window.openFuelReport = openFuelReport;

function closeFuelReport() {
    document.getElementById('fuel-report-modal').classList.remove('active');
}
window.closeFuelReport = closeFuelReport;

function submitFuelReport() {
    const stationId = document.getElementById('fuel-report-station-id').value;
    const price95 = parseFloat(document.getElementById('fuel-report-price-95').value);
    const price93 = parseFloat(document.getElementById('fuel-report-price-93').value);
    const priceDiesel = parseFloat(document.getElementById('fuel-report-price-diesel').value);

    if (!stationId) {
        showToast('Error: No station selected');
        return;
    }

    // Update local cache
    fuelPricesCache[stationId] = {
        '95': price95 || null,
        '93': price93 || null,
        diesel: priceDiesel || null,
        updatedAt: Date.now()
    };

    // Save to localStorage
    localStorage.setItem('fuelPrices', JSON.stringify(fuelPricesCache));

    closeFuelReport();
    renderFuelStations();
    showToast('Thank you! Price reported');

    // In production, this would also send to the server
    // sendFuelPriceToServer(stationId, fuelPricesCache[stationId]);
}
window.submitFuelReport = submitFuelReport;

function openLayers() {
    toggleMenu(false);
    const backdrop = document.getElementById('layers-backdrop');
    const panel = document.getElementById('layers-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
        // Load current layer settings
        loadLayerSettings();
    }
}
window.openLayers = openLayers;

function closeLayersPanel() {
    const backdrop = document.getElementById('layers-backdrop');
    const panel = document.getElementById('layers-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
}
window.closeLayersPanel = closeLayersPanel;

// Map style URLs
const MAP_STYLE_URLS = {
    streets: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    satellite: 'https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_key',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    local: '/tiles/styles/south-africa.json',
    terrain: 'https://api.maptiler.com/maps/outdoor/style.json?key=get_your_own_key',
    hybrid: 'https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_key'
};

// Current map style
let currentMapStyle = localStorage.getItem('mapStyle') || 'streets';

function selectMapStyle(element) {
    const style = element.dataset.style;
    if (!style || style === currentMapStyle) return;

    // Update UI
    document.querySelectorAll('.layer-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');

    // Get style URL
    let styleUrl = MAP_STYLE_URLS[style];

    // For satellite/terrain/hybrid, use free alternatives if no key
    if (style === 'satellite' || style === 'terrain' || style === 'hybrid') {
        // Use Carto as fallback (no satellite, but styled)
        styleUrl = style === 'satellite'
            ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
            : style === 'terrain'
            ? 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
            : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

        // Try free satellite from Esri
        if (style === 'satellite' || style === 'hybrid') {
            styleUrl = {
                version: 8,
                sources: {
                    'esri-satellite': {
                        type: 'raster',
                        tiles: [
                            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                        ],
                        tileSize: 256,
                        attribution: 'Esri, Maxar, Earthstar Geographics'
                    }
                },
                layers: [{
                    id: 'satellite-layer',
                    type: 'raster',
                    source: 'esri-satellite',
                    minzoom: 0,
                    maxzoom: 19
                }]
            };
        }
    }

    // Switch map style
    if (state.map) {
        const center = state.map.getCenter();
        const zoom = state.map.getZoom();
        const bearing = state.map.getBearing();
        const pitch = state.map.getPitch();

        state.map.setStyle(styleUrl);

        // Restore position after style loads
        state.map.once('style.load', () => {
            state.map.setCenter(center);
            state.map.setZoom(zoom);
            state.map.setBearing(bearing);
            state.map.setPitch(pitch);

            // Re-add user marker if exists
            if (state.userLocation) {
                updateUserMarker();
            }

            // Re-add route if exists
            if (currentRouteGeometry) {
                displayRoute(currentRouteGeometry);
            }

            // Re-add incident markers
            loadIncidentsOnMap();

            showToast(`Map style: ${element.querySelector('.layer-name').textContent}`);
        });
    }

    // Save preference
    currentMapStyle = style;
    localStorage.setItem('mapStyle', style);
}
window.selectMapStyle = selectMapStyle;

function toggleLayerOption(layer, enabled) {
    localStorage.setItem(`layer_${layer}`, enabled);

    switch (layer) {
        case 'traffic':
            state.settings.showTraffic = enabled;
            if (enabled) {
                loadTrafficLayer();
            } else {
                removeTrafficLayer();
            }
            break;
        case 'transit':
            if (enabled) {
                loadTransitStops();
            } else {
                removeTransitStops();
            }
            break;
        case 'cycling':
            // Toggle cycling layer (if available in style)
            toggleMapLayer('cycling', enabled);
            break;
        case '3d':
            state.settings.show3DBuildings = enabled;
            toggle3DBuildings(enabled);
            break;
    }
}
window.toggleLayerOption = toggleLayerOption;

function loadLayerSettings() {
    // Set current style selection
    document.querySelectorAll('.layer-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.style === currentMapStyle);
    });

    // Set toggle states
    const trafficCheckbox = document.getElementById('layer-traffic');
    const transitCheckbox = document.getElementById('layer-transit');
    const cyclingCheckbox = document.getElementById('layer-cycling');
    const buildings3dCheckbox = document.getElementById('layer-3d');

    if (trafficCheckbox) trafficCheckbox.checked = state.settings.showTraffic;
    if (transitCheckbox) transitCheckbox.checked = localStorage.getItem('layer_transit') === 'true';
    if (cyclingCheckbox) cyclingCheckbox.checked = localStorage.getItem('layer_cycling') === 'true';
    if (buildings3dCheckbox) buildings3dCheckbox.checked = state.settings.show3DBuildings;
}

function loadTrafficLayer() {
    // Traffic layer implementation - uses existing traffic data
    if (!state.map) return;
    showToast('Loading traffic...');
    // Trigger existing traffic functionality
    if (typeof initTrafficUI === 'function') {
        initTrafficUI();
    }
}

function removeTrafficLayer() {
    if (!state.map) return;
    // Remove traffic layer if exists
    if (state.map.getLayer('traffic-layer')) {
        state.map.removeLayer('traffic-layer');
    }
    if (state.map.getSource('traffic-source')) {
        state.map.removeSource('traffic-source');
    }
}

let transitMarkers = [];

async function loadTransitStops() {
    if (!state.map || !state.userLocation) {
        showToast('Enable location to see transit stops');
        return;
    }

    showToast('Loading transit stops...');

    try {
        const response = await fetch(
            `${API_BASE}/transit/stops?lat=${state.userLocation.lat}&lng=${state.userLocation.lng}&radius=5000`
        );

        if (!response.ok) throw new Error('Failed to load stops');

        const data = await response.json();
        const stops = data.stops || [];

        // Add markers for each stop
        stops.slice(0, 50).forEach(stop => {
            const el = document.createElement('div');
            el.className = 'transit-stop-marker';
            el.innerHTML = '🚏';
            el.style.cssText = 'font-size: 24px; cursor: pointer;';
            el.title = stop.stop_name;

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([stop.stop_lon, stop.stop_lat])
                .setPopup(new maplibregl.Popup().setHTML(
                    `<strong>${stop.stop_name}</strong><br>
                     <small>${stop.route_type || 'Transit Stop'}</small>`
                ))
                .addTo(state.map);

            transitMarkers.push(marker);
        });

        showToast(`Showing ${Math.min(stops.length, 50)} transit stops`);
    } catch (error) {
        console.error('Transit load error:', error);
        showToast('Unable to load transit stops');
    }
}

function removeTransitStops() {
    transitMarkers.forEach(marker => marker.remove());
    transitMarkers = [];
}

function toggleMapLayer(layerId, visible) {
    if (!state.map) return;
    // Toggle visibility of layer if it exists in current style
    try {
        if (state.map.getLayer(layerId)) {
            state.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
    } catch (e) {
        console.log(`Layer ${layerId} not found in current style`);
    }
}

function toggle3DBuildings(enabled) {
    if (!state.map) return;

    if (enabled) {
        // Add 3D building layer
        if (!state.map.getLayer('3d-buildings')) {
            state.map.addLayer({
                'id': '3d-buildings',
                'source': 'carto',
                'source-layer': 'building',
                'type': 'fill-extrusion',
                'minzoom': 14,
                'paint': {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': ['get', 'render_height'],
                    'fill-extrusion-base': ['get', 'render_min_height'],
                    'fill-extrusion-opacity': 0.6
                }
            });
        }
    } else {
        if (state.map.getLayer('3d-buildings')) {
            state.map.removeLayer('3d-buildings');
        }
    }
}

// ============================================
// Settings Functions
// ============================================
function openSettings() {
    toggleMenu(false);
    const backdrop = document.getElementById('settings-backdrop');
    const panel = document.getElementById('settings-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
        // Load current settings into UI
        loadSettingsUI();
    }
}
window.openSettings = openSettings;

function closeSettings() {
    const backdrop = document.getElementById('settings-backdrop');
    const panel = document.getElementById('settings-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
}
window.closeSettings = closeSettings;

function loadSettingsUI() {
    // Distance unit
    const distanceValue = document.getElementById('distance-unit-value');
    if (distanceValue) {
        distanceValue.textContent = state.settings.useMetric ? 'Kilometers' : 'Miles';
    }

    // Time format
    const timeValue = document.getElementById('time-format-value');
    if (timeValue) {
        timeValue.textContent = state.settings.use24Hour ? '24-hour' : '12-hour';
    }

    // Dark mode value text
    const darkModeValue = document.getElementById('dark-mode-value');
    if (darkModeValue) {
        darkModeValue.textContent = state.settings.darkMode ? 'On' : 'Off';
    }

    // Toggle switches
    setCheckbox('avoid-tolls', state.settings.avoidTolls);
    setCheckbox('avoid-highways', state.settings.avoidHighways);
    setCheckbox('avoid-ferries', state.settings.avoidFerries);
    setCheckbox('avoid-unpaved', state.settings.avoidUnpaved);
    setCheckbox('dark-mode', state.settings.darkMode);
    setCheckbox('show-3d-buildings', state.settings.show3DBuildings);
    setCheckbox('show-traffic', state.settings.showTraffic);
    setCheckbox('show-speed-limit', state.settings.showSpeedLimit);
    setCheckbox('voice-guidance', state.settings.voiceGuidance);
    setCheckbox('alert-sounds', state.settings.alertSounds);
    setCheckbox('battery-saver', state.settings.batterySaver);
}

function setCheckbox(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = value;
}

function saveSetting(key, value) {
    state.settings[key] = value;
    localStorage.setItem(key, value.toString());

    // Update backward compatibility
    if (key === 'useMetric') {
        state.useMetric = value;
    }

    // Apply setting changes that need immediate effect
    if (key === 'darkMode') {
        applyDarkMode(value);
        const darkModeValue = document.getElementById('dark-mode-value');
        if (darkModeValue) darkModeValue.textContent = value ? 'On' : 'Off';
    }

    showToast('Setting saved');
}
window.saveSetting = saveSetting;

function toggleDistanceUnit() {
    const newValue = !state.settings.useMetric;
    state.settings.useMetric = newValue;
    state.useMetric = newValue; // backward compatibility
    localStorage.setItem('useMetric', newValue.toString());

    const distanceValue = document.getElementById('distance-unit-value');
    if (distanceValue) {
        distanceValue.textContent = newValue ? 'Kilometers' : 'Miles';
    }

    showToast(newValue ? 'Using kilometers' : 'Using miles');
}
window.toggleDistanceUnit = toggleDistanceUnit;

function toggleTimeFormat() {
    const newValue = !state.settings.use24Hour;
    state.settings.use24Hour = newValue;
    localStorage.setItem('use24Hour', newValue.toString());

    const timeValue = document.getElementById('time-format-value');
    if (timeValue) {
        timeValue.textContent = newValue ? '24-hour' : '12-hour';
    }

    showToast(newValue ? 'Using 24-hour format' : 'Using 12-hour format');
}
window.toggleTimeFormat = toggleTimeFormat;

function toggleDarkMode(enabled) {
    state.settings.darkMode = enabled;
    localStorage.setItem('darkMode', enabled.toString());
    applyDarkMode(enabled);

    const darkModeValue = document.getElementById('dark-mode-value');
    if (darkModeValue) darkModeValue.textContent = enabled ? 'On' : 'Off';
}
window.toggleDarkMode = toggleDarkMode;

function applyDarkMode(enabled) {
    if (enabled) {
        document.body.classList.add('dark-mode');
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        document.documentElement.removeAttribute('data-theme');
    }

    // Switch map style if map is loaded
    if (state.map) {
        const currentCenter = state.map.getCenter();
        const currentZoom = state.map.getZoom();
        const currentBearing = state.map.getBearing();
        const currentPitch = state.map.getPitch();

        const newStyle = enabled ? MAP_STYLES.dark : MAP_STYLES.light;

        // Only change if style is different
        const currentStyle = state.map.getStyle()?.sprite || '';
        const isDark = currentStyle.includes('dark-matter');

        if (enabled !== isDark) {
            state.map.setStyle(newStyle);

            // Restore map position after style loads
            state.map.once('style.load', () => {
                state.map.jumpTo({
                    center: currentCenter,
                    zoom: currentZoom,
                    bearing: currentBearing,
                    pitch: currentPitch
                });

                // Re-add route layer if exists
                if (currentRouteGeometry) {
                    setTimeout(() => {
                        displayAllRoutes([{
                            id: 'current',
                            geometry: currentRouteGeometry,
                            distance: currentRouteDistanceM,
                            duration: currentRouteDurationSec
                        }], 0);
                    }, 100);
                }

                // Re-load incident markers
                loadIncidentsOnMap();
            });
        }
    }
}

// Check if dark mode should be active based on time
function shouldUseDarkMode() {
    const hour = new Date().getHours();
    return hour >= DARK_MODE_AUTO_START || hour < DARK_MODE_AUTO_END;
}

// Initialize dark mode on app start
function initDarkMode() {
    const savedMode = localStorage.getItem('darkMode');

    // If user has explicit preference, use it
    if (savedMode !== null) {
        const enabled = savedMode === 'true';
        state.settings.darkMode = enabled;
        applyDarkMode(enabled);
    } else {
        // Auto mode: check time of day
        const shouldBeDark = shouldUseDarkMode();
        state.settings.darkMode = shouldBeDark;
        applyDarkMode(shouldBeDark);
    }

    // Update UI
    const darkModeValue = document.getElementById('dark-mode-value');
    const darkModeCheckbox = document.getElementById('dark-mode');
    if (darkModeValue) darkModeValue.textContent = state.settings.darkMode ? 'On' : 'Off';
    if (darkModeCheckbox) darkModeCheckbox.checked = state.settings.darkMode;
}

// Auto-switch dark mode based on time (check every 5 minutes)
function startDarkModeAutoSwitch() {
    setInterval(() => {
        // Only auto-switch if no explicit user preference
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode === null) {
            const shouldBeDark = shouldUseDarkMode();
            if (shouldBeDark !== state.settings.darkMode) {
                state.settings.darkMode = shouldBeDark;
                applyDarkMode(shouldBeDark);

                // Update UI
                const darkModeValue = document.getElementById('dark-mode-value');
                const darkModeCheckbox = document.getElementById('dark-mode');
                if (darkModeValue) darkModeValue.textContent = shouldBeDark ? 'On' : 'Off';
                if (darkModeCheckbox) darkModeCheckbox.checked = shouldBeDark;

                showToast(shouldBeDark ? 'Night mode activated' : 'Day mode activated');
            }
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
}

// Reset dark mode to auto
function resetDarkModeToAuto() {
    localStorage.removeItem('darkMode');
    const shouldBeDark = shouldUseDarkMode();
    state.settings.darkMode = shouldBeDark;
    applyDarkMode(shouldBeDark);

    const darkModeValue = document.getElementById('dark-mode-value');
    const darkModeCheckbox = document.getElementById('dark-mode');
    if (darkModeValue) darkModeValue.textContent = 'Auto';
    if (darkModeCheckbox) darkModeCheckbox.checked = shouldBeDark;

    showToast('Dark mode set to auto');
}
window.resetDarkModeToAuto = resetDarkModeToAuto;

function clearRecentSearches() {
    if (confirm('Clear all recent searches?')) {
        state.recentSearches = [];
        localStorage.setItem('recentSearches', '[]');
        showToast('Recent searches cleared');
        closeSettings();
    }
}
window.clearRecentSearches = clearRecentSearches;

function clearAllData() {
    if (confirm('This will reset all settings and saved places. Continue?')) {
        // Clear all localStorage items for this app
        const keysToRemove = [
            'savedPlaces', 'recentSearches', 'useMetric', 'use24Hour',
            'avoidTolls', 'avoidHighways', 'avoidFerries', 'avoidUnpaved',
            'darkMode', 'show3DBuildings', 'showTraffic', 'showSpeedLimit',
            'voiceGuidance', 'alertSounds', 'batterySaver', 'incidents'
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));

        showToast('All data cleared. Reloading...');
        setTimeout(() => location.reload(), 1000);
    }
}
window.clearAllData = clearAllData;

function startOver() {
    toggleMenu(false);
    showToast('Starting fresh...');

    // Clear all caches
    if ('caches' in window) {
        caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
        });
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(reg => reg.unregister());
        });
    }

    // Clear storage
    localStorage.clear();
    sessionStorage.clear();

    // Clear markers and routes
    clearMarkers();
    clearRoute();
    state.userLocation = null;
    state.selectedDestination = null;
    if (state.userMarker) {
        state.userMarker.remove();
        state.userMarker = null;
    }

    setTimeout(() => {
        showToast('Requesting location...');
        // Re-request location permission
        locateMe(false);
    }, 500);
}
window.startOver = startOver;

function openAbout() {
    toggleMenu(false);
    showToast('Data Acuity Maps v2.0');
}
window.openAbout = openAbout;

// ============================================
// Incident Reporting Functions
// ============================================

const INCIDENT_TYPES = {
    police: { icon: '🚔', label: 'Police', color: '#2196F3' },
    accident: { icon: '💥', label: 'Accident', color: '#f44336' },
    hazard: { icon: '⚠️', label: 'Hazard', color: '#FF9800' },
    traffic: { icon: '🚗', label: 'Traffic Jam', color: '#9C27B0' },
    closure: { icon: '🚧', label: 'Road Closed', color: '#E91E63' },
    construction: { icon: '🏗️', label: 'Construction', color: '#795548' },
    speed_camera: { icon: '📷', label: 'Speed Camera', color: '#000000', speedLimit: 60 },
    red_light: { icon: '🚦', label: 'Red Light Camera', color: '#D32F2F' }
};

function openReportPanel() {
    if (!state.userLocation) {
        showToast('Enable location to report incidents');
        locateMe();
        return;
    }

    const backdrop = document.getElementById('report-backdrop');
    const panel = document.getElementById('report-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
        selectedIncidentType = null;
        // Clear previous selection
        document.querySelectorAll('.report-type').forEach(btn => {
            btn.classList.remove('selected');
        });
        document.getElementById('report-submit').disabled = true;
    }
}
window.openReportPanel = openReportPanel;

function closeReportPanel() {
    const backdrop = document.getElementById('report-backdrop');
    const panel = document.getElementById('report-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
    selectedIncidentType = null;
}
window.closeReportPanel = closeReportPanel;

function selectIncidentType(element) {
    // Clear previous selection
    document.querySelectorAll('.report-type').forEach(btn => {
        btn.classList.remove('selected');
    });

    // Select new type
    element.classList.add('selected');
    selectedIncidentType = element.dataset.type;
    document.getElementById('report-submit').disabled = false;
}
window.selectIncidentType = selectIncidentType;

function submitIncident() {
    if (!selectedIncidentType || !state.userLocation) {
        showToast('Please select an incident type');
        return;
    }

    const incident = {
        id: Date.now().toString(),
        type: selectedIncidentType,
        lat: state.userLocation.lat,
        lng: state.userLocation.lng,
        timestamp: Date.now(),
        confirmations: 1,
        dismissals: 0
    };

    // Add to incidents array
    incidents.push(incident);

    // Clean up expired incidents and save
    cleanupExpiredIncidents();
    localStorage.setItem('incidents', JSON.stringify(incidents));

    // Add marker to map
    addIncidentMarker(incident);

    // Close panel and show confirmation
    closeReportPanel();

    const typeInfo = INCIDENT_TYPES[selectedIncidentType];
    showToast(`${typeInfo.icon} ${typeInfo.label} reported!`);

    // Speak confirmation if voice enabled
    if (state.settings.voiceGuidance) {
        speak(`${typeInfo.label} reported at your location`);
    }
}
window.submitIncident = submitIncident;

function cleanupExpiredIncidents() {
    const now = Date.now();
    const expiryMs = INCIDENT_EXPIRY_HOURS * 60 * 60 * 1000;

    // Filter out expired incidents
    incidents = incidents.filter(incident => {
        return (now - incident.timestamp) < expiryMs;
    });

    // Update localStorage
    localStorage.setItem('incidents', JSON.stringify(incidents));
}

function addIncidentMarker(incident) {
    if (!state.map) return;

    const typeInfo = INCIDENT_TYPES[incident.type] || INCIDENT_TYPES.hazard;

    // Create marker element
    const el = document.createElement('div');
    el.className = `incident-marker ${incident.type}`;
    el.innerHTML = typeInfo.icon;
    el.dataset.incidentId = incident.id;

    // Create popup content
    const timeAgo = getTimeAgo(incident.timestamp);
    const popupContent = `
        <div class="incident-popup">
            <div class="incident-popup-title">${typeInfo.icon} ${typeInfo.label}</div>
            <div class="incident-popup-time">Reported ${timeAgo}</div>
            <div class="incident-popup-actions">
                <button class="incident-confirm-btn" onclick="confirmIncident('${incident.id}')">
                    👍 Still there
                </button>
                <button class="incident-dismiss-btn" onclick="dismissIncident('${incident.id}')">
                    👎 Gone
                </button>
            </div>
        </div>
    `;

    // Create marker with popup
    const marker = new maplibregl.Marker({ element: el })
        .setLngLat([incident.lng, incident.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupContent))
        .addTo(state.map);

    // Store reference for later removal
    incidentMarkers.push({ id: incident.id, marker: marker });
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

function confirmIncident(incidentId) {
    const incident = incidents.find(i => i.id === incidentId);
    if (incident) {
        incident.confirmations++;
        incident.timestamp = Date.now(); // Refresh timestamp on confirmation
        localStorage.setItem('incidents', JSON.stringify(incidents));
        showToast('Thanks for confirming!');
    }
}
window.confirmIncident = confirmIncident;

function dismissIncident(incidentId) {
    const incident = incidents.find(i => i.id === incidentId);
    if (incident) {
        incident.dismissals++;

        // Remove if more dismissals than confirmations
        if (incident.dismissals > incident.confirmations) {
            removeIncident(incidentId);
            showToast('Incident removed');
        } else {
            localStorage.setItem('incidents', JSON.stringify(incidents));
            showToast('Thanks for the feedback!');
        }
    }
}
window.dismissIncident = dismissIncident;

function removeIncident(incidentId) {
    // Remove from array
    incidents = incidents.filter(i => i.id !== incidentId);
    localStorage.setItem('incidents', JSON.stringify(incidents));

    // Remove marker from map
    const markerEntry = incidentMarkers.find(m => m.id === incidentId);
    if (markerEntry) {
        markerEntry.marker.remove();
        incidentMarkers = incidentMarkers.filter(m => m.id !== incidentId);
    }
}

function loadIncidentsOnMap() {
    if (!state.map) return;

    // Clean up expired incidents first
    cleanupExpiredIncidents();

    // Clear existing markers
    incidentMarkers.forEach(entry => entry.marker.remove());
    incidentMarkers = [];

    // Add markers for all current incidents
    incidents.forEach(incident => {
        addIncidentMarker(incident);
    });
}

function checkIncidentProximity(lat, lng) {
    if (!isNavigating) return;

    incidents.forEach(incident => {
        // Skip if already alerted
        if (alertedIncidentIds.has(incident.id)) return;

        const distance = calculateDistance(lat, lng, incident.lat, incident.lng);
        const isCamera = CAMERA_TYPES.includes(incident.type);
        const alertDistance = isCamera ? CAMERA_ALERT_DISTANCE : INCIDENT_ALERT_DISTANCE;

        if (distance < alertDistance) {
            // Alert for this incident
            alertedIncidentIds.add(incident.id);
            if (isCamera) {
                showCameraAlert(incident, distance);
            } else {
                showIncidentAlert(incident, distance);
            }
        }
    });
}

function showIncidentAlert(incident, distance) {
    const typeInfo = INCIDENT_TYPES[incident.type] || INCIDENT_TYPES.hazard;

    // Update alert UI
    const alertEl = document.getElementById('incident-alert');
    const iconEl = document.getElementById('incident-alert-icon');
    const titleEl = document.getElementById('incident-alert-title');
    const distanceEl = document.getElementById('incident-alert-distance');

    if (alertEl && iconEl && titleEl && distanceEl) {
        iconEl.textContent = typeInfo.icon;
        titleEl.textContent = `${typeInfo.label} reported ahead`;
        distanceEl.textContent = formatDistance(distance);

        alertEl.classList.add('show');

        // Auto-hide after 5 seconds
        setTimeout(() => {
            alertEl.classList.remove('show');
        }, 5000);
    }

    // Voice alert if enabled
    if (state.settings.voiceGuidance) {
        const distanceText = formatDistance(distance);
        speak(`${typeInfo.label} reported ${distanceText} ahead`);
    }

    // Sound alert if enabled
    if (state.settings.alertSounds) {
        playAlertSound();
    }
}

function closeIncidentAlert() {
    const alertEl = document.getElementById('incident-alert');
    if (alertEl) {
        alertEl.classList.remove('show');
    }
}
window.closeIncidentAlert = closeIncidentAlert;

function showCameraAlert(incident, distance) {
    const typeInfo = INCIDENT_TYPES[incident.type] || INCIDENT_TYPES.speed_camera;
    const isSpeedCamera = incident.type === 'speed_camera';

    // Update camera alert UI
    const alertEl = document.getElementById('camera-alert');
    const iconEl = document.getElementById('camera-alert-icon');
    const titleEl = document.getElementById('camera-alert-title');
    const speedEl = document.getElementById('camera-alert-speed');
    const distanceEl = document.getElementById('camera-alert-distance');

    if (alertEl && iconEl && titleEl && speedEl && distanceEl) {
        iconEl.textContent = typeInfo.icon;
        titleEl.textContent = isSpeedCamera ? 'Speed Camera Ahead' : 'Red Light Camera Ahead';
        speedEl.textContent = isSpeedCamera ? `${typeInfo.speedLimit || 60} km/h` : '';
        speedEl.style.display = isSpeedCamera ? 'block' : 'none';
        distanceEl.textContent = formatDistance(distance);

        alertEl.classList.add('show');

        // Auto-hide after 8 seconds (longer for cameras)
        setTimeout(() => {
            alertEl.classList.remove('show');
        }, 8000);
    }

    // Voice alert if enabled - more urgent for cameras
    if (state.settings.voiceGuidance) {
        const distanceText = formatDistance(distance);
        if (isSpeedCamera) {
            speak(`Warning! Speed camera ahead in ${distanceText}. Speed limit ${typeInfo.speedLimit || 60} kilometers per hour.`);
        } else {
            speak(`Warning! Red light camera ahead in ${distanceText}.`);
        }
    }

    // Camera-specific alert sound
    if (state.settings.alertSounds) {
        playCameraAlertSound();
    }
}

function closeCameraAlert() {
    const alertEl = document.getElementById('camera-alert');
    if (alertEl) {
        alertEl.classList.remove('show');
    }
}
window.closeCameraAlert = closeCameraAlert;

function playCameraAlertSound() {
    // Create a distinctive camera warning sound - double beep
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // First beep
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.frequency.value = 1200; // Higher pitch for urgency
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0.4, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.15);

        // Second beep (slightly delayed)
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1400; // Even higher
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.4, audioContext.currentTime + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
        osc2.start(audioContext.currentTime + 0.2);
        osc2.stop(audioContext.currentTime + 0.35);
    } catch (e) {
        // Audio not available
    }
}

function playAlertSound() {
    // Create a simple beep sound
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        // Audio not available
    }
}

// ============================================
// Live Traffic Layer
// ============================================

let trafficLayerVisible = false;
let trafficRefreshInterval = null;
const TRAFFIC_REFRESH_MS = 180000; // Refresh every 3 minutes

const TRAFFIC_COLORS = {
    free: '#00C853',      // Green - free flow
    moderate: '#FFD600',  // Yellow - moderate traffic
    heavy: '#FF6D00',     // Orange - heavy traffic
    severe: '#D50000',    // Red - severe/standstill
    unknown: '#9E9E9E'    // Gray - no data
};

async function loadTrafficLayer() {
    if (!state.map || !state.settings.showTraffic) return;

    const center = state.map.getCenter();
    const zoom = state.map.getZoom();

    // Only load traffic at zoom level 10+ for performance
    if (zoom < 10) {
        showToast('Zoom in to see traffic');
        return;
    }

    try {
        // Calculate bbox from current view
        const bounds = state.map.getBounds();
        const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

        const response = await fetch(`${API_BASE}/traffic/here?bbox=${bbox}`);
        const data = await response.json();

        if (data.type === 'FeatureCollection' && data.features) {
            displayTrafficLayer(data);
            trafficLayerVisible = true;
        } else if (data.error) {
            console.warn('[Traffic]', data.message || 'Traffic data unavailable');
            // Fall back to crowdsourced traffic
            loadCrowdsourcedTraffic(bbox);
        }
    } catch (error) {
        console.error('[Traffic Error]', error);
        // Try crowdsourced fallback
        const bounds = state.map.getBounds();
        const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        loadCrowdsourcedTraffic(bbox);
    }
}

async function loadCrowdsourcedTraffic(bbox) {
    try {
        const response = await fetch(`${API_BASE}/traffic?bbox=${bbox}`);
        const data = await response.json();

        if (data.type === 'FeatureCollection' && data.features) {
            displayTrafficLayer(data);
            trafficLayerVisible = true;
        }
    } catch (error) {
        console.error('[Crowdsourced Traffic Error]', error);
    }
}

function displayTrafficLayer(geojson) {
    if (!state.map) return;

    // Remove existing traffic layer if present
    removeTrafficLayer();

    // Add traffic source
    state.map.addSource('traffic-flow', {
        type: 'geojson',
        data: geojson
    });

    // Add traffic line layer with color based on traffic level
    state.map.addLayer({
        id: 'traffic-flow-layer',
        type: 'line',
        source: 'traffic-flow',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': [
                'match',
                ['get', 'traffic_level'],
                'free', TRAFFIC_COLORS.free,
                'moderate', TRAFFIC_COLORS.moderate,
                'heavy', TRAFFIC_COLORS.heavy,
                'severe', TRAFFIC_COLORS.severe,
                'standstill', TRAFFIC_COLORS.severe,
                TRAFFIC_COLORS.unknown
            ],
            'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 2,
                14, 4,
                18, 8
            ],
            'line-opacity': 0.8
        }
    }, 'road-label'); // Insert below road labels if layer exists

    // Add traffic direction arrows for one-way visualization
    state.map.addLayer({
        id: 'traffic-flow-arrows',
        type: 'symbol',
        source: 'traffic-flow',
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 100,
            'text-field': '▶',
            'text-size': 12,
            'text-rotation-alignment': 'map',
            'text-allow-overlap': true
        },
        paint: {
            'text-color': [
                'match',
                ['get', 'traffic_level'],
                'free', TRAFFIC_COLORS.free,
                'moderate', TRAFFIC_COLORS.moderate,
                'heavy', TRAFFIC_COLORS.heavy,
                'severe', TRAFFIC_COLORS.severe,
                'standstill', TRAFFIC_COLORS.severe,
                TRAFFIC_COLORS.unknown
            ],
            'text-opacity': 0.6
        }
    });
}

function removeTrafficLayer() {
    if (!state.map) return;

    if (state.map.getLayer('traffic-flow-arrows')) {
        state.map.removeLayer('traffic-flow-arrows');
    }
    if (state.map.getLayer('traffic-flow-layer')) {
        state.map.removeLayer('traffic-flow-layer');
    }
    if (state.map.getSource('traffic-flow')) {
        state.map.removeSource('traffic-flow');
    }

    trafficLayerVisible = false;
}

function toggleTrafficLayer(enabled) {
    state.settings.showTraffic = enabled;
    localStorage.setItem('showTraffic', enabled.toString());

    if (enabled) {
        loadTrafficLayer();
        startTrafficRefresh();
        updateTrafficUI(true);
        showToast('Traffic layer enabled');
    } else {
        removeTrafficLayer();
        stopTrafficRefresh();
        updateTrafficUI(false);
        showToast('Traffic layer disabled');
    }
}
window.toggleTrafficLayer = toggleTrafficLayer;

function startTrafficRefresh() {
    // Stop any existing interval
    stopTrafficRefresh();

    // Refresh traffic data periodically
    trafficRefreshInterval = setInterval(() => {
        if (state.settings.showTraffic && state.map) {
            loadTrafficLayer();
        }
    }, TRAFFIC_REFRESH_MS);

    // Also refresh when map moves significantly
    state.map.on('moveend', onMapMoveForTraffic);
}

function stopTrafficRefresh() {
    if (trafficRefreshInterval) {
        clearInterval(trafficRefreshInterval);
        trafficRefreshInterval = null;
    }

    if (state.map) {
        state.map.off('moveend', onMapMoveForTraffic);
    }
}

let trafficMoveTimeout = null;
function onMapMoveForTraffic() {
    if (!state.settings.showTraffic) return;

    // Debounce map moves
    clearTimeout(trafficMoveTimeout);
    trafficMoveTimeout = setTimeout(() => {
        loadTrafficLayer();
    }, 500);
}

function refreshTraffic() {
    if (state.settings.showTraffic) {
        showToast('Refreshing traffic...');
        loadTrafficLayer();
    }
}
window.refreshTraffic = refreshTraffic;

function quickToggleTraffic() {
    const newState = !state.settings.showTraffic;
    toggleTrafficLayer(newState);
    updateTrafficUI(newState);

    // Also update the settings checkbox
    const checkbox = document.getElementById('show-traffic');
    if (checkbox) {
        checkbox.checked = newState;
    }
}
window.quickToggleTraffic = quickToggleTraffic;

function updateTrafficUI(enabled) {
    const fabBtn = document.getElementById('fab-traffic');
    const legend = document.getElementById('traffic-legend');

    if (fabBtn) {
        if (enabled) {
            fabBtn.classList.add('active');
        } else {
            fabBtn.classList.remove('active');
        }
    }

    if (legend) {
        if (enabled) {
            legend.classList.add('show');
        } else {
            legend.classList.remove('show');
        }
    }
}

// Initialize traffic UI state on load
function initTrafficUI() {
    if (state.settings.showTraffic) {
        updateTrafficUI(true);
    }
}
window.initTrafficUI = initTrafficUI;

// ============================================
// Offline Routes & Tile Caching
// ============================================

const OFFLINE_DB_NAME = 'dataacuity-maps-offline';
const OFFLINE_DB_VERSION = 1;
const TILE_ZOOM_LEVELS = [12, 13, 14, 15, 16]; // Zoom levels to cache
const ROUTE_CORRIDOR_KM = 2; // Cache tiles within 2km of route
let offlineDB = null;
let downloadAbortController = null;

// Initialize IndexedDB
async function initOfflineDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            offlineDB = request.result;
            resolve(offlineDB);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Store for saved routes metadata
            if (!db.objectStoreNames.contains('routes')) {
                const routeStore = db.createObjectStore('routes', { keyPath: 'id' });
                routeStore.createIndex('savedAt', 'savedAt', { unique: false });
            }

            // Store for cached map tiles
            if (!db.objectStoreNames.contains('tiles')) {
                const tileStore = db.createObjectStore('tiles', { keyPath: 'key' });
                tileStore.createIndex('routeId', 'routeId', { unique: false });
            }
        };
    });
}

// Get tiles along a route corridor
function getTilesForRoute(geometry, corridorKm = ROUTE_CORRIDOR_KM) {
    const tiles = new Set();

    // Sample points along the route
    const coords = geometry.coordinates || [];
    if (coords.length === 0) return Array.from(tiles);

    // Sample every ~200m along route
    for (let i = 0; i < coords.length; i++) {
        const [lng, lat] = coords[i];

        // For each zoom level, calculate which tiles to cache
        for (const zoom of TILE_ZOOM_LEVELS) {
            // Calculate tile at this point
            const tile = latLngToTile(lat, lng, zoom);

            // Also add surrounding tiles for corridor coverage
            const tilesAround = Math.ceil(corridorKm / tileSizeKm(lat, zoom));
            for (let dx = -tilesAround; dx <= tilesAround; dx++) {
                for (let dy = -tilesAround; dy <= tilesAround; dy++) {
                    tiles.add(`${zoom}/${tile.x + dx}/${tile.y + dy}`);
                }
            }
        }
    }

    return Array.from(tiles);
}

// Convert lat/lng to tile coordinates
function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

// Approximate tile size in km at a given latitude and zoom
function tileSizeKm(lat, zoom) {
    const earthCircumKm = 40075;
    const tilesAtZoom = Math.pow(2, zoom);
    return (earthCircumKm * Math.cos(lat * Math.PI / 180)) / tilesAtZoom;
}

// Save route with offline tiles
async function saveRouteOffline() {
    if (!currentRouteGeometry || !currentRouteSteps) {
        showToast('No route to save');
        return;
    }

    if (!offlineDB) {
        await initOfflineDB();
    }

    // Get route name from origin/destination
    const originName = document.getElementById('nav-destination-name')?.textContent || 'Route';
    const routeName = `To ${originName}`;

    // Generate unique ID
    const routeId = `route_${Date.now()}`;

    // Get tiles to download
    const tiles = getTilesForRoute(currentRouteGeometry);

    // Show download modal
    showDownloadModal(tiles.length);

    // Create abort controller for cancellation
    downloadAbortController = new AbortController();

    try {
        // Download tiles
        const tileBaseUrl = getTileBaseUrl();
        let downloaded = 0;
        let totalSize = 0;

        for (const tileKey of tiles) {
            // Check if cancelled
            if (downloadAbortController.signal.aborted) {
                throw new Error('Download cancelled');
            }

            const tileUrl = `${tileBaseUrl}/${tileKey}.png`;

            try {
                const response = await fetch(tileUrl, {
                    signal: downloadAbortController.signal
                });

                if (response.ok) {
                    const blob = await response.blob();
                    totalSize += blob.size;

                    // Store tile in IndexedDB
                    await storeTile(routeId, tileKey, blob);
                }
            } catch (e) {
                // Skip failed tiles but continue
                if (e.name === 'AbortError') throw e;
            }

            downloaded++;
            updateDownloadProgress(downloaded, tiles.length, totalSize);
        }

        // Store route metadata
        const routeData = {
            id: routeId,
            name: routeName,
            geometry: currentRouteGeometry,
            steps: currentRouteSteps,
            distance: currentRouteDistanceM,
            duration: currentRouteDurationSec,
            origin: state.selectedOrigin,
            destination: state.selectedDestination,
            tileCount: tiles.length,
            totalSize: totalSize,
            savedAt: Date.now()
        };

        await storeRoute(routeData);

        // Hide modal and show success
        hideDownloadModal();
        showToast(`Route saved! (${formatBytes(totalSize)})`);

    } catch (error) {
        hideDownloadModal();
        if (error.message !== 'Download cancelled') {
            showToast('Failed to save route');
            console.error('[Offline] Save error:', error);
        }
    }

    downloadAbortController = null;
}
window.saveRouteOffline = saveRouteOffline;

// Get the tile server base URL
function getTileBaseUrl() {
    // Use OpenStreetMap tiles for offline caching
    return 'https://tile.openstreetmap.org';
}

// Store a tile in IndexedDB
async function storeTile(routeId, tileKey, blob) {
    return new Promise((resolve, reject) => {
        const tx = offlineDB.transaction('tiles', 'readwrite');
        const store = tx.objectStore('tiles');

        store.put({
            key: tileKey,
            routeId: routeId,
            data: blob,
            cachedAt: Date.now()
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Store route metadata
async function storeRoute(routeData) {
    return new Promise((resolve, reject) => {
        const tx = offlineDB.transaction('routes', 'readwrite');
        const store = tx.objectStore('routes');

        store.put(routeData);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Get all saved routes
async function getSavedRoutes() {
    if (!offlineDB) {
        await initOfflineDB();
    }

    return new Promise((resolve, reject) => {
        const tx = offlineDB.transaction('routes', 'readonly');
        const store = tx.objectStore('routes');
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by saved date, newest first
            const routes = request.result.sort((a, b) => b.savedAt - a.savedAt);
            resolve(routes);
        };
        request.onerror = () => reject(request.error);
    });
}

// Delete a saved route and its tiles
async function deleteSavedRoute(routeId) {
    if (!offlineDB) return;

    return new Promise((resolve, reject) => {
        const tx = offlineDB.transaction(['routes', 'tiles'], 'readwrite');

        // Delete route metadata
        tx.objectStore('routes').delete(routeId);

        // Delete associated tiles
        const tileStore = tx.objectStore('tiles');
        const tileIndex = tileStore.index('routeId');
        const tileRequest = tileIndex.openCursor(IDBKeyRange.only(routeId));

        tileRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Load a saved route
async function loadSavedRoute(routeId) {
    if (!offlineDB) {
        await initOfflineDB();
    }

    return new Promise((resolve, reject) => {
        const tx = offlineDB.transaction('routes', 'readonly');
        const store = tx.objectStore('routes');
        const request = store.get(routeId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get a cached tile
async function getCachedTile(tileKey) {
    if (!offlineDB) return null;

    return new Promise((resolve) => {
        const tx = offlineDB.transaction('tiles', 'readonly');
        const store = tx.objectStore('tiles');
        const request = store.get(tileKey);

        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result.data);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => resolve(null);
    });
}

// Show download progress modal
function showDownloadModal(totalTiles) {
    const modal = document.getElementById('download-modal');
    const title = document.getElementById('download-title');
    const status = document.getElementById('download-status');
    const progress = document.getElementById('download-progress-fill');

    title.textContent = 'Saving Route';
    status.textContent = `Downloading ${totalTiles} tiles...`;
    progress.style.width = '0%';

    modal.classList.add('show');
}

function updateDownloadProgress(downloaded, total, totalBytes) {
    const status = document.getElementById('download-status');
    const progress = document.getElementById('download-progress-fill');

    const percent = Math.round((downloaded / total) * 100);
    progress.style.width = `${percent}%`;
    status.textContent = `${downloaded}/${total} tiles (${formatBytes(totalBytes)})`;
}

function hideDownloadModal() {
    const modal = document.getElementById('download-modal');
    modal.classList.remove('show');
}

function cancelDownload() {
    if (downloadAbortController) {
        downloadAbortController.abort();
    }
    hideDownloadModal();
    showToast('Download cancelled');
}
window.cancelDownload = cancelDownload;

// Open saved routes panel
async function openSavedRoutes() {
    toggleMenu(false);

    const backdrop = document.getElementById('saved-routes-backdrop');
    const panel = document.getElementById('saved-routes-panel');
    const list = document.getElementById('saved-routes-list');
    const empty = document.getElementById('saved-routes-empty');

    // Load saved routes
    const routes = await getSavedRoutes();

    // Render routes list
    if (routes.length === 0) {
        list.innerHTML = '';
        empty.classList.add('show');
    } else {
        empty.classList.remove('show');
        list.innerHTML = routes.map(route => `
            <div class="saved-route-item" onclick="useSavedRoute('${route.id}')">
                <div class="saved-route-icon">🗺️</div>
                <div class="saved-route-info">
                    <div class="saved-route-name">${escapeHtml(route.name)}</div>
                    <div class="saved-route-details">${formatDistance(route.distance / 1000)} • ${formatDuration(route.duration)}</div>
                    <div class="saved-route-size">${formatBytes(route.totalSize)} • Saved ${formatTimeAgo(route.savedAt)}</div>
                </div>
                <div class="saved-route-actions">
                    <button class="saved-route-btn delete" onclick="event.stopPropagation(); confirmDeleteRoute('${route.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    backdrop.classList.add('active');
    panel.classList.add('active');
}
window.openSavedRoutes = openSavedRoutes;

function closeSavedRoutes() {
    const backdrop = document.getElementById('saved-routes-backdrop');
    const panel = document.getElementById('saved-routes-panel');
    backdrop.classList.remove('active');
    panel.classList.remove('active');
}
window.closeSavedRoutes = closeSavedRoutes;

// Use a saved route
async function useSavedRoute(routeId) {
    const route = await loadSavedRoute(routeId);
    if (!route) {
        showToast('Route not found');
        return;
    }

    closeSavedRoutes();

    // Set origin and destination
    state.selectedOrigin = route.origin;
    state.selectedDestination = route.destination;

    // Load the route geometry and steps
    currentRouteGeometry = route.geometry;
    currentRouteSteps = route.steps;
    currentRouteDurationSec = route.duration;
    currentRouteDistanceM = route.distance;

    // Display route on map
    displayAllRoutes([{
        id: 'saved',
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration
    }], 0);

    // Show nav panel with route
    openNavPanelWithRoute(route);

    showToast('Route loaded (offline available)');
}
window.useSavedRoute = useSavedRoute;

function openNavPanelWithRoute(route) {
    const navPanel = document.getElementById('nav-panel');
    const initialActions = document.getElementById('nav-actions-initial');
    const routeActions = document.getElementById('nav-actions-route');

    // Update destination info
    const destName = document.getElementById('nav-destination-name');
    const destAddress = document.getElementById('nav-destination-address');
    if (destName) destName.textContent = route.name.replace('To ', '');
    if (destAddress) destAddress.textContent = 'Saved route';

    // Update route info
    const durationEl = document.getElementById('directions-duration');
    const distanceEl = document.getElementById('directions-distance');
    if (durationEl) durationEl.textContent = formatDuration(route.duration);
    if (distanceEl) distanceEl.textContent = formatDistance(route.distance / 1000);

    // Populate steps
    const stepsContainer = document.getElementById('directions-steps');
    if (stepsContainer && route.steps) {
        stepsContainer.innerHTML = route.steps.map((step, i) => `
            <div class="directions-step" data-step="${i}">
                <div class="directions-step-icon">${getManeuverIcon(step.maneuver?.type || 'straight')}</div>
                <div class="directions-step-content">
                    <div class="directions-step-instruction">${escapeHtml(step.instruction || step.name || 'Continue')}</div>
                    <div class="directions-step-distance">${formatDistance(step.distance / 1000)}</div>
                </div>
            </div>
        `).join('');
    }

    // Show route actions
    if (initialActions) initialActions.style.display = 'none';
    if (routeActions) routeActions.style.display = 'flex';

    navPanel.classList.add('active');
}

// Confirm delete route
function confirmDeleteRoute(routeId) {
    if (confirm('Delete this saved route and its offline maps?')) {
        deleteSavedRoute(routeId).then(() => {
            showToast('Route deleted');
            openSavedRoutes(); // Refresh list
        });
    }
}
window.confirmDeleteRoute = confirmDeleteRoute;

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format time ago
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

// Register custom protocol handler for offline tiles
function setupOfflineTileSource() {
    // Add transformRequest to map options to intercept tile requests
    if (state.map) {
        const originalTransformRequest = state.map._requestManager?._transformRequestFn;

        state.map.setTransformRequest((url, resourceType) => {
            // Only intercept tile requests when offline
            if (resourceType === 'Tile' && !navigator.onLine) {
                // Check if we have this tile cached
                const tileMatch = url.match(/\/(\d+)\/(\d+)\/(\d+)\.(png|pbf|jpg)/);
                if (tileMatch) {
                    const tileKey = `${tileMatch[1]}/${tileMatch[2]}/${tileMatch[3]}`;
                    // Return modified URL for service worker to intercept
                    return {
                        url: `/offline-tile/${tileKey}`,
                        credentials: 'same-origin'
                    };
                }
            }

            if (originalTransformRequest) {
                return originalTransformRequest(url, resourceType);
            }
            return { url };
        });
    }
}

// Initialize offline storage on app start
initOfflineDB().catch(e => console.warn('[Offline] DB init failed:', e));

// ============================================
// Region Offline Download
// ============================================

let selectedRegionBounds = null;
let selectedRegionType = null;
let regionDrawing = false;
let regionDrawStart = null;
let regionRectLayer = null;

function openRegionDownload() {
    toggleMenu(false);
    const backdrop = document.getElementById('region-backdrop');
    const panel = document.getElementById('region-panel');
    if (backdrop && panel) {
        backdrop.classList.add('active');
        panel.classList.add('active');
        // Update current view size estimate
        updateCurrentViewSize();
    }
}
window.openRegionDownload = openRegionDownload;

function closeRegionPanel() {
    const backdrop = document.getElementById('region-backdrop');
    const panel = document.getElementById('region-panel');
    if (backdrop && panel) {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
    cancelRegionDraw();
}
window.closeRegionPanel = closeRegionPanel;

function updateCurrentViewSize() {
    if (!state.map) return;

    const bounds = state.map.getBounds();
    const tiles = getTilesForBounds(bounds);
    const sizeElement = document.getElementById('current-region-size');
    if (sizeElement) {
        const estimatedMB = Math.round(tiles.length * 15 / 1024); // ~15KB per tile
        sizeElement.textContent = `~${estimatedMB} MB`;
    }
}

function selectRegionPreset(type, element) {
    // Update UI
    document.querySelectorAll('.region-preset').forEach(p => p.classList.remove('selected'));
    element.classList.add('selected');

    selectedRegionType = type;

    const drawBtn = document.getElementById('region-draw-btn');
    const infoPanel = document.getElementById('region-download-info');
    const downloadBtn = document.getElementById('region-download-btn');

    if (type === 'custom') {
        drawBtn.style.display = 'flex';
        infoPanel.classList.remove('active');
        downloadBtn.classList.remove('active');
    } else {
        drawBtn.style.display = 'none';
        calculateRegionStats(type);
    }
}
window.selectRegionPreset = selectRegionPreset;

function calculateRegionStats(type) {
    if (!state.map) return;

    let bounds;
    const center = state.map.getCenter();

    switch (type) {
        case 'current':
            bounds = state.map.getBounds();
            break;
        case 'city':
            // ~20km radius around center
            bounds = {
                _sw: { lat: center.lat - 0.18, lng: center.lng - 0.22 },
                _ne: { lat: center.lat + 0.18, lng: center.lng + 0.22 }
            };
            break;
        case 'province':
            // ~100km radius
            bounds = {
                _sw: { lat: center.lat - 0.9, lng: center.lng - 1.1 },
                _ne: { lat: center.lat + 0.9, lng: center.lng + 1.1 }
            };
            break;
        default:
            return;
    }

    selectedRegionBounds = bounds;
    showRegionStats(bounds);
}

function showRegionStats(bounds) {
    const tiles = getTilesForBounds(bounds);

    // Calculate area (approximate)
    const latDiff = Math.abs(bounds._ne.lat - bounds._sw.lat);
    const lngDiff = Math.abs(bounds._ne.lng - bounds._sw.lng);
    const areaKm2 = Math.round(latDiff * 111 * lngDiff * 85); // Approximate for SA latitude

    // Estimated size (~15KB per tile average)
    const estimatedBytes = tiles.length * 15 * 1024;

    // Update UI
    document.getElementById('region-area').textContent = `${areaKm2.toLocaleString()} km²`;
    document.getElementById('region-tiles').textContent = tiles.length.toLocaleString();
    document.getElementById('region-size').textContent = formatBytes(estimatedBytes);

    document.getElementById('region-download-info').classList.add('active');
    document.getElementById('region-download-btn').classList.add('active');
}

function getTilesForBounds(bounds) {
    const tiles = new Set();
    const sw = bounds._sw || bounds.getSouthWest?.() || { lat: bounds[0][0], lng: bounds[0][1] };
    const ne = bounds._ne || bounds.getNorthEast?.() || { lat: bounds[1][0], lng: bounds[1][1] };

    // For region downloads, use fewer zoom levels to keep size manageable
    const zoomLevels = [10, 11, 12, 13, 14];

    for (const zoom of zoomLevels) {
        const minTile = latLngToTile(ne.lat, sw.lng, zoom);
        const maxTile = latLngToTile(sw.lat, ne.lng, zoom);

        for (let x = minTile.x; x <= maxTile.x; x++) {
            for (let y = minTile.y; y <= maxTile.y; y++) {
                tiles.add(`${zoom}/${x}/${y}`);
            }
        }
    }

    return Array.from(tiles);
}

function startRegionDraw() {
    closeRegionPanel();
    regionDrawing = true;

    // Show drawing mode indicator
    document.getElementById('region-draw-mode').classList.add('active');

    // Change cursor
    if (state.map) {
        state.map.getCanvas().style.cursor = 'crosshair';

        // Add event listeners for drawing
        state.map.on('mousedown', onRegionDrawStart);
        state.map.on('touchstart', onRegionDrawStart);
    }

    showToast('Tap and drag to select area');
}
window.startRegionDraw = startRegionDraw;

function onRegionDrawStart(e) {
    if (!regionDrawing) return;

    regionDrawStart = e.lngLat;

    if (state.map) {
        state.map.on('mousemove', onRegionDrawMove);
        state.map.on('touchmove', onRegionDrawMove);
        state.map.on('mouseup', onRegionDrawEnd);
        state.map.on('touchend', onRegionDrawEnd);
    }
}

function onRegionDrawMove(e) {
    if (!regionDrawing || !regionDrawStart) return;

    const current = e.lngLat;

    // Update or create rectangle layer
    const coords = [
        [regionDrawStart.lng, regionDrawStart.lat],
        [current.lng, regionDrawStart.lat],
        [current.lng, current.lat],
        [regionDrawStart.lng, current.lat],
        [regionDrawStart.lng, regionDrawStart.lat]
    ];

    if (state.map.getSource('region-draw')) {
        state.map.getSource('region-draw').setData({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] }
        });
    } else {
        state.map.addSource('region-draw', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }
        });
        state.map.addLayer({
            id: 'region-draw-fill',
            type: 'fill',
            source: 'region-draw',
            paint: { 'fill-color': '#673AB7', 'fill-opacity': 0.3 }
        });
        state.map.addLayer({
            id: 'region-draw-line',
            type: 'line',
            source: 'region-draw',
            paint: { 'line-color': '#673AB7', 'line-width': 2 }
        });
    }
}

function onRegionDrawEnd(e) {
    if (!regionDrawing || !regionDrawStart) return;

    const end = e.lngLat;

    // Calculate bounds
    selectedRegionBounds = {
        _sw: {
            lat: Math.min(regionDrawStart.lat, end.lat),
            lng: Math.min(regionDrawStart.lng, end.lng)
        },
        _ne: {
            lat: Math.max(regionDrawStart.lat, end.lat),
            lng: Math.max(regionDrawStart.lng, end.lng)
        }
    };

    // Clean up drawing mode
    finishRegionDraw();

    // Show stats and reopen panel
    setTimeout(() => {
        openRegionDownload();
        showRegionStats(selectedRegionBounds);
        document.querySelectorAll('.region-preset').forEach(p => {
            p.classList.toggle('selected', p.dataset.region === 'custom');
        });
    }, 300);
}

function finishRegionDraw() {
    regionDrawing = false;
    regionDrawStart = null;

    document.getElementById('region-draw-mode').classList.remove('active');

    if (state.map) {
        state.map.getCanvas().style.cursor = '';
        state.map.off('mousedown', onRegionDrawStart);
        state.map.off('touchstart', onRegionDrawStart);
        state.map.off('mousemove', onRegionDrawMove);
        state.map.off('touchmove', onRegionDrawMove);
        state.map.off('mouseup', onRegionDrawEnd);
        state.map.off('touchend', onRegionDrawEnd);

        // Remove drawing layers
        if (state.map.getLayer('region-draw-fill')) {
            state.map.removeLayer('region-draw-fill');
        }
        if (state.map.getLayer('region-draw-line')) {
            state.map.removeLayer('region-draw-line');
        }
        if (state.map.getSource('region-draw')) {
            state.map.removeSource('region-draw');
        }
    }
}

function cancelRegionDraw() {
    if (regionDrawing) {
        finishRegionDraw();
        showToast('Drawing cancelled');
    }
}
window.cancelRegionDraw = cancelRegionDraw;

async function downloadRegion() {
    if (!selectedRegionBounds) {
        showToast('Please select a region first');
        return;
    }

    if (!offlineDB) {
        await initOfflineDB();
    }

    const tiles = getTilesForBounds(selectedRegionBounds);
    const regionId = `region_${Date.now()}`;

    // Show download modal
    showDownloadModal(tiles.length);

    downloadAbortController = new AbortController();

    try {
        const tileBaseUrl = getTileBaseUrl();
        let downloaded = 0;
        let totalSize = 0;

        for (const tileKey of tiles) {
            if (downloadAbortController.signal.aborted) {
                throw new Error('Download cancelled');
            }

            const tileUrl = `${tileBaseUrl}/${tileKey}.png`;

            try {
                const response = await fetch(tileUrl, {
                    signal: downloadAbortController.signal
                });

                if (response.ok) {
                    const blob = await response.blob();
                    totalSize += blob.size;
                    await storeTile(regionId, tileKey, blob);
                }
            } catch (e) {
                if (e.name === 'AbortError') throw e;
            }

            downloaded++;
            updateDownloadProgress(downloaded, tiles.length, totalSize);
        }

        // Store region metadata
        const regionData = {
            id: regionId,
            name: `${selectedRegionType || 'Custom'} Region`,
            type: 'region',
            bounds: selectedRegionBounds,
            tileCount: tiles.length,
            totalSize: totalSize,
            savedAt: Date.now()
        };

        await storeRoute(regionData);

        closeDownloadModal();
        closeRegionPanel();
        showToast(`Downloaded ${formatBytes(totalSize)} for offline use`);

    } catch (error) {
        closeDownloadModal();
        if (error.message !== 'Download cancelled') {
            showToast('Download failed');
            console.error('Region download error:', error);
        }
    }
}
window.downloadRegion = downloadRegion;

// ============================================
// Share ETA Feature
// ============================================
let currentTripId = null;
let tripShareInterval = null;

// Generate unique trip ID
function generateTripId() {
    return 'trip_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// Get current trip data for sharing
function getCurrentTripData() {
    if (!state.selectedDestination) return null;

    const destName = state.selectedDestination.name || 'Destination';
    const eta = document.getElementById('nav-eta-time')?.textContent || '';
    const remaining = document.getElementById('nav-eta-distance')?.textContent || '';

    return {
        tripId: currentTripId,
        destination: destName,
        eta: eta,
        remaining: remaining,
        destLat: state.selectedDestination.lat,
        destLng: state.selectedDestination.lng,
        currentLat: state.userLocation?.lat,
        currentLng: state.userLocation?.lng,
        durationSec: currentRouteDurationSec,
        distanceM: currentRouteDistanceM,
        timestamp: Date.now()
    };
}

// Open share ETA modal
function openShareETA() {
    if (!isNavigating || !state.selectedDestination) {
        showToast('Start navigation first');
        return;
    }

    // Generate trip ID if not exists
    if (!currentTripId) {
        currentTripId = generateTripId();
    }

    const tripData = getCurrentTripData();
    if (!tripData) return;

    // Update modal with current trip info
    const destEl = document.getElementById('share-eta-destination');
    const etaEl = document.getElementById('share-eta-time');
    const distEl = document.getElementById('share-eta-distance');
    const linkEl = document.getElementById('share-eta-link');

    if (destEl) destEl.textContent = tripData.destination;
    if (etaEl) etaEl.textContent = tripData.eta || 'Calculating...';
    if (distEl) distEl.textContent = tripData.remaining || '';

    // Generate shareable link
    const shareUrl = generateShareLink(tripData);
    if (linkEl) linkEl.value = shareUrl;

    // Show modal
    const modal = document.getElementById('share-eta-modal');
    modal.classList.add('show');

    // Start updating trip location in background
    startTripSharing();
}
window.openShareETA = openShareETA;

// Close share ETA modal
function closeShareETA() {
    const modal = document.getElementById('share-eta-modal');
    modal.classList.remove('show');
}
window.closeShareETA = closeShareETA;

// Close on backdrop click
function closeShareETAOnBackdrop(event) {
    if (event.target.classList.contains('share-eta-modal')) {
        closeShareETA();
    }
}
window.closeShareETAOnBackdrop = closeShareETAOnBackdrop;

// Generate shareable link
function generateShareLink(tripData) {
    const baseUrl = window.location.origin;
    const params = new URLSearchParams({
        trip: tripData.tripId,
        dest: encodeURIComponent(tripData.destination),
        lat: tripData.destLat?.toFixed(6) || '',
        lng: tripData.destLng?.toFixed(6) || ''
    });
    return `${baseUrl}/track?${params.toString()}`;
}

// Share via different methods
function shareETAvia(method) {
    const tripData = getCurrentTripData();
    if (!tripData) return;

    const shareUrl = generateShareLink(tripData);
    const message = `I'm on my way to ${tripData.destination}. ETA: ${tripData.eta}. Track my live location:`;
    const fullMessage = `${message}\n${shareUrl}`;

    switch (method) {
        case 'sms':
            // SMS with pre-filled message
            window.open(`sms:?body=${encodeURIComponent(fullMessage)}`, '_blank');
            showToast('Opening SMS...');
            break;

        case 'whatsapp':
            // WhatsApp share
            window.open(`https://wa.me/?text=${encodeURIComponent(fullMessage)}`, '_blank');
            showToast('Opening WhatsApp...');
            break;

        case 'email':
            // Email with subject and body
            const subject = `My ETA to ${tripData.destination}`;
            window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullMessage)}`, '_blank');
            showToast('Opening email...');
            break;

        case 'copy':
            copyShareLink();
            break;

        default:
            // Use Web Share API if available
            if (navigator.share) {
                navigator.share({
                    title: 'My ETA',
                    text: message,
                    url: shareUrl
                }).catch(() => {
                    copyShareLink();
                });
            } else {
                copyShareLink();
            }
    }

    closeShareETA();
}
window.shareETAvia = shareETAvia;

// Copy link to clipboard
function copyShareLink() {
    const linkEl = document.getElementById('share-eta-link');
    if (!linkEl) return;

    const link = linkEl.value;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
            showToast('Link copied to clipboard');
        }).catch(() => {
            fallbackCopyLink(link);
        });
    } else {
        fallbackCopyLink(link);
    }
}
window.copyShareLink = copyShareLink;

// Fallback copy method
function fallbackCopyLink(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        showToast('Link copied to clipboard');
    } catch (e) {
        showToast('Failed to copy link');
    }
    document.body.removeChild(textArea);
}

// Start sharing trip location updates
function startTripSharing() {
    if (tripShareInterval) return;

    // Update location every 30 seconds
    tripShareInterval = setInterval(async () => {
        if (!isNavigating || !currentTripId) {
            stopTripSharing();
            return;
        }

        const tripData = getCurrentTripData();
        if (!tripData) return;

        try {
            await fetch(`${API_BASE}/share/trip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tripData)
            });
        } catch (e) {
            console.warn('[Share] Failed to update trip:', e);
        }
    }, 30000);

    // Send initial update immediately
    const tripData = getCurrentTripData();
    if (tripData) {
        fetch(`${API_BASE}/share/trip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tripData)
        }).catch(() => {});
    }
}

// Stop sharing trip location
function stopTripSharing() {
    if (tripShareInterval) {
        clearInterval(tripShareInterval);
        tripShareInterval = null;
    }
    currentTripId = null;
}

// Show/hide Share ETA FAB during navigation
function updateShareFAB(visible) {
    const fab = document.getElementById('fab-share-eta');
    if (fab) {
        fab.style.display = visible ? 'flex' : 'none';
    }
}

// ============================================
// Event Listeners
// ============================================
function initEventListeners() {
    // Handle back button
    window.addEventListener('popstate', () => {
        if (document.getElementById('search-overlay').classList.contains('active')) {
            closeSearch();
        } else if (document.getElementById('menu-panel').classList.contains('active')) {
            toggleMenu(false);
        } else if (document.getElementById('nav-panel').classList.contains('active')) {
            closeNavPanel();
        } else if (document.getElementById('report-panel').classList.contains('active')) {
            closeReportPanel();
        } else if (document.getElementById('route-options').classList.contains('show')) {
            closeRouteOptions();
        } else if (document.getElementById('saved-routes-panel').classList.contains('active')) {
            closeSavedRoutes();
        } else if (document.getElementById('share-eta-modal').classList.contains('show')) {
            closeShareETA();
        }
    });

    // Handle escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearch();
            toggleMenu(false);
            closeNavPanel();
            closeReportPanel();
            closeRouteOptions();
            closeSavedRoutes();
            closeShareETA();
        }
    });
}

// ============================================
// URL State Management
// ============================================
function initURLState() {
    // Update URL when map moves (debounced)
    let urlTimeout;
    state.map.on('moveend', () => {
        clearTimeout(urlTimeout);
        urlTimeout = setTimeout(updateURLState, 300);
    });
}

function updateURLState() {
    if (!state.map) return;

    const center = state.map.getCenter();
    const zoom = state.map.getZoom();

    const lat = center.lat.toFixed(5);
    const lng = center.lng.toFixed(5);
    const z = Math.round(zoom);

    const hash = `#${lat},${lng},${z}z`;

    // Update URL without triggering navigation
    if (window.location.hash !== hash) {
        history.replaceState(null, '', hash);
    }
}

function parseURLState() {
    const hash = window.location.hash.slice(1);
    if (!hash) return false;

    // Parse format: lat,lng,zoomz (e.g., -26.20410,28.04730,15z)
    const match = hash.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+)z$/);
    if (!match) return false;

    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const zoom = parseInt(match[3]);

    // Validate coordinates
    if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (zoom < 1 || zoom > 20) return false;

    // Jump to location from URL
    state.map.jumpTo({
        center: [lng, lat],
        zoom: zoom
    });

    return true;
}

// ============================================
// Utilities
// ============================================
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showError(message) {
    const mapDiv = document.getElementById('map');
    mapDiv.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:white;text-align:center;padding:20px;">
            <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
            <div style="font-size:18px;">${escapeHtml(message)}</div>
        </div>
    `;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// Start App
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
