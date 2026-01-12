/**
 * DataAcuity Historical Maps
 * "Navigate Time & Space"
 */

const API_BASE = '/api';  // Proxied to maps_api via nginx

// Safe JSON fetch helper - handles non-JSON responses gracefully
async function fetchJSON(url, options = {}) {
    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            return { ok: false, status: response.status, data: null };
        }

        // Check content-type before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.warn(`[fetchJSON] Non-JSON response from ${url}:`, contentType);
            return { ok: false, status: response.status, data: null };
        }

        const data = await response.json();
        return { ok: true, status: response.status, data };
    } catch (error) {
        console.warn(`[fetchJSON] Failed to fetch ${url}:`, error.message);
        return { ok: false, status: 0, data: null, error };
    }
}

// Map configuration
const MAP_CONFIG = {
    center: [25, 0],  // Center on Africa
    zoom: 3,
    minZoom: 2,
    maxZoom: 16,  // ~300m scale (18 = ~100m, 16 = ~300m)
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
};

// Map orientation presets (bearing in degrees)
const ORIENTATIONS = {
    'north-up': { bearing: 0, label: 'North Up', description: 'Modern standard' },
    'south-up': { bearing: 180, label: 'South Up', description: 'Australian/African perspective' },
    'east-up': { bearing: 90, label: 'East Up', description: 'Medieval European (toward Jerusalem)' },
    'west-up': { bearing: -90, label: 'West Up', description: 'Alternative view' }
};

// Map styles (tile providers) - All FREE, no API keys needed
const MAP_STYLES = {
    'local-sa': {
        name: 'South Africa (Local)',
        url: '/tiles/styles/south-africa/style.json',
        description: 'Self-hosted SA tiles (fastest)',
        local: true
    },
    'voyager': {
        name: 'Carto Voyager',
        url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        description: 'Colorful, detailed streets'
    },
    'positron': {
        name: 'Carto Positron',
        url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        description: 'Light, minimal'
    },
    'dark-matter': {
        name: 'Carto Dark',
        url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        description: 'Dark theme'
    },
    'osm-standard': {
        name: 'OpenStreetMap',
        url: null, // Uses raster tiles
        raster: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        description: 'Classic OSM style'
    },
    'topo': {
        name: 'OpenTopoMap',
        url: null,
        raster: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        description: 'Terrain & elevation'
    },
    'satellite': {
        name: 'ESRI Satellite',
        url: null,
        raster: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        description: 'Aerial imagery (free)'
    },
    'satellite-labels': {
        name: 'Satellite + Labels',
        url: null,
        raster: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        overlay: 'https://stamen-tiles.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png',
        description: 'Aerial with place names'
    }
};

// Place categories with colors and icons
const PLACE_CATEGORIES = {
    'settlements': {
        name: 'Settlements',
        color: '#007AFF',
        icon: '🏘️',
        types: ['settlement', 'city', 'town', 'village', 'neighborhood', 'locality', 'suburb', 'hamlet']
    },
    'water': {
        name: 'Water Features',
        color: '#5AC8FA',
        icon: '💧',
        types: ['river', 'lake', 'bay', 'reservoir', 'ocean', 'sea', 'stream', 'waterfall', 'spring', 'lagoon', 'wetland']
    },
    'terrain': {
        name: 'Terrain',
        color: '#8B4513',
        icon: '⛰️',
        types: ['mountain', 'peak', 'mountain-range', 'mountain-pass', 'hill', 'valley', 'plateau', 'desert', 'forest', 'cape', 'peninsula']
    },
    'islands': {
        name: 'Islands',
        color: '#34C759',
        icon: '🏝️',
        types: ['island', 'archipelago', 'atoll', 'reef']
    },
    'historic': {
        name: 'Historic Sites',
        color: '#FF9500',
        icon: '🏛️',
        types: ['ancient_city', 'ruins', 'archaeological', 'monument', 'temple', 'castle', 'fort', 'historic']
    },
    'transport': {
        name: 'Transport',
        color: '#AF52DE',
        icon: '🚂',
        types: ['train-station', 'bus-stop', 'airport', 'port', 'harbor', 'station']
    },
    'buildings': {
        name: 'Buildings',
        color: '#FF3B30',
        icon: '🏢',
        types: ['hotel', 'church', 'school', 'hospital', 'university', 'mosque', 'synagogue', 'museum']
    },
    'admin': {
        name: 'Administrative',
        color: '#8E8E93',
        icon: '📍',
        types: ['admin-district', 'country', 'state', 'province', 'region', 'county', 'p']
    }
};

// Get category for a place type
function getCategoryForType(placeType) {
    if (!placeType) return null;
    const type = placeType.toLowerCase();
    for (const [catKey, cat] of Object.entries(PLACE_CATEGORIES)) {
        if (cat.types.some(t => type.includes(t) || t.includes(type))) {
            return catKey;
        }
    }
    return 'admin'; // Default category
}

// App state
const state = {
    map: null,
    currentYear: 2024,
    markers: [],
    selectedPlace: null,
    isPlaying: false,
    playInterval: null,
    orientation: localStorage.getItem('mapOrientation') || 'north-up',
    mapStyle: localStorage.getItem('mapStyle') || 'voyager',
    // Category filters (which categories are visible)
    categoryFilters: JSON.parse(localStorage.getItem('categoryFilters')) || {
        settlements: true,
        water: true,
        terrain: true,
        islands: true,
        historic: true,
        transport: false,
        buildings: false,
        admin: false
    },
    // All loaded places for filtering
    allPlaces: [],
    // Current popup for labels
    hoverPopup: null,
    // Routing state
    routing: {
        active: false,
        waypoints: [],  // Array of {lng, lat, name}
        routeLayer: null,
        markers: []
    },
    // Nearby POI state
    nearby: {
        active: false,
        center: null,
        radius: 2000, // meters
        markers: [],
        activeCategories: []
    },
    // Memories state
    memories: {
        active: false,
        items: [],
        markers: [],
        userHash: null
    },
    // Current mode
    mode: localStorage.getItem('mapMode') || 'explore'
};

// ============================================
// Mode Switching
// ============================================

function switchMode(mode) {
    // Validate mode
    const validModes = ['explore', 'timeline', 'navigate', 'transit'];
    if (!validModes.includes(mode)) return;

    // Update state
    state.mode = mode;
    localStorage.setItem('mapMode', mode);

    // Update body data attribute for CSS
    document.body.setAttribute('data-mode', mode);

    // Update tab active states
    document.querySelectorAll('.mode-tab').forEach(tab => {
        const isActive = tab.dataset.mode === mode;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });

    // Mode-specific initialization
    switch (mode) {
        case 'explore':
            initExploreMode();
            break;
        case 'timeline':
            initTimelineMode();
            break;
        case 'navigate':
            initNavigateMode();
            break;
        case 'transit':
            initTransitMode();
            break;
    }

    // Close any open panels that don't belong in this mode
    closeModePanels(mode);
}

function initExploreMode() {
    // Explore mode: Basic map browsing, search, place details
    // Disable reports layer if it exists
    const reportsToggle = document.getElementById('reports-layer-toggle');
    if (reportsToggle && typeof reportsState !== 'undefined' && reportsState.enabled) {
        reportsToggle.checked = false;
        if (typeof toggleReportsLayer === 'function') toggleReportsLayer(false);
    }
    // Disable transit layer if it exists
    const transitToggle = document.getElementById('transit-layer-toggle');
    if (transitToggle && typeof transitState !== 'undefined' && transitState.enabled) {
        transitToggle.checked = false;
        if (typeof toggleTransitLayer === 'function') toggleTransitLayer(false);
    }
}

function initTimelineMode() {
    // Timeline mode: Historical exploration
    // Show timeline panel
    const timeline = document.getElementById('timeline-panel');
    if (timeline) timeline.classList.remove('hidden');

    // Disable reports and transit
    const reportsToggle = document.getElementById('reports-layer-toggle');
    if (reportsToggle && typeof reportsState !== 'undefined' && reportsState.enabled) {
        reportsToggle.checked = false;
        if (typeof toggleReportsLayer === 'function') toggleReportsLayer(false);
    }
    const transitToggle = document.getElementById('transit-layer-toggle');
    if (transitToggle && typeof transitState !== 'undefined' && transitState.enabled) {
        transitToggle.checked = false;
        if (typeof toggleTransitLayer === 'function') toggleTransitLayer(false);
    }
}

function initNavigateMode() {
    // Navigate mode: Routing with traffic
    // Enable reports layer automatically
    const reportsToggle = document.getElementById('reports-layer-toggle');
    if (reportsToggle && typeof reportsState !== 'undefined' && !reportsState.enabled) {
        reportsToggle.checked = true;
        if (typeof toggleReportsLayer === 'function') toggleReportsLayer(true);
    }
    // Show routing panel
    const routingPanel = document.getElementById('routing-panel');
    if (routingPanel) routingPanel.classList.remove('hidden');
}

function initTransitMode() {
    // Transit mode: Public transport
    // Enable transit layer automatically
    const transitToggle = document.getElementById('transit-layer-toggle');
    if (transitToggle && typeof transitState !== 'undefined' && !transitState.enabled) {
        transitToggle.checked = true;
        if (typeof toggleTransitLayer === 'function') toggleTransitLayer(true);
    }
}

function closeModePanels(mode) {
    // Close panels not relevant to current mode
    const routingPanel = document.getElementById('routing-panel');
    const nearbyPanel = document.getElementById('nearby-panel');
    const leaderboardPanel = document.getElementById('leaderboard-panel');
    const timelinePanel = document.getElementById('timeline-panel');

    // Always close these unless in specific mode
    if (mode !== 'navigate' && routingPanel) {
        routingPanel.classList.add('hidden');
    }
    if (mode !== 'timeline' && timelinePanel) {
        timelinePanel.classList.add('hidden');
    }
    if (mode === 'timeline' || mode === 'transit') {
        if (nearbyPanel) nearbyPanel.classList.add('hidden');
    }
    if (mode !== 'navigate') {
        if (leaderboardPanel) leaderboardPanel.classList.add('hidden');
    }
}

function initModeSystem() {
    // Set initial mode from state
    const savedMode = state.mode;
    document.body.setAttribute('data-mode', savedMode);

    // Update tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        const isActive = tab.dataset.mode === savedMode;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });

    // Initialize the mode
    switchMode(savedMode);
}

window.switchMode = switchMode;

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Critical path - required for initial render
    initMap();
    initTimeline();
    initSearch();
    initModals();

    // Defer non-critical initialization to improve TTI
    const deferInit = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

    deferInit(() => {
        initDraggablePanel();
        initOrientationControls();
        initMapStyles();
        initLegend();
        initCategoryFilters();
        initURLHandling();
        loadStats();
        initKeyboardShortcuts();
        initYearInput();
        initStatsHints();
        initModeSystem();
    });

    // Defer secondary features further
    deferInit(() => {
        initRouting();
        initNearby();
        initMemories();
        initOnboarding();
        initTransitLayer();
        initReportsLayer();
        initLeaderboard();
    }, { timeout: 2000 });
});

// ============================================
// URL Management for SEO
// ============================================

function initURLHandling() {
    // Parse URL on load
    parseURLState();

    // Listen for hash changes (back/forward navigation)
    window.addEventListener('hashchange', () => {
        parseURLState();
    });

    // Update URL when map moves (debounced)
    if (state.map) {
        let urlUpdateTimeout;
        state.map.on('moveend', () => {
            clearTimeout(urlUpdateTimeout);
            urlUpdateTimeout = setTimeout(() => {
                updateURLState();
            }, 500);
        });
    }
}

function parseURLState() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);

    // Handle year parameter
    const year = params.get('year');
    if (year && !isNaN(parseInt(year))) {
        const yearValue = parseInt(year);
        state.currentYear = yearValue;
        const slider = document.getElementById('timeline-slider');
        if (slider) {
            slider.value = yearValue;
            updateYear(yearValue);
        }
    }

    // Handle place parameter (search and fly to)
    const place = params.get('place');
    if (place) {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = decodeURIComponent(place);
            // Trigger search
            performSearch(place);
        }
    }

    // Handle map view parameters
    const lat = params.get('lat');
    const lng = params.get('lng');
    const zoom = params.get('zoom');

    if (lat && lng && state.map) {
        const center = [parseFloat(lng), parseFloat(lat)];
        const zoomLevel = zoom ? parseFloat(zoom) : state.map.getZoom();
        state.map.flyTo({ center, zoom: zoomLevel, duration: 1000 });
    }
}

function updateURLState() {
    if (!state.map) return;

    const center = state.map.getCenter();
    const zoom = state.map.getZoom();
    const year = state.currentYear;

    const params = new URLSearchParams();

    // Only add year if not current year
    if (year !== 2024) {
        params.set('year', year);
    }

    // Add map position (rounded for cleaner URLs)
    params.set('lat', center.lat.toFixed(4));
    params.set('lng', center.lng.toFixed(4));
    params.set('zoom', zoom.toFixed(1));

    const newHash = params.toString();
    if (newHash) {
        history.replaceState(null, '', '#' + newHash);
    }

    // Update canonical URL dynamically
    updateCanonicalURL();
}

function updateCanonicalURL() {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        const baseURL = 'https://maps.dataacuity.co.za/';
        const hash = window.location.hash;
        canonical.href = hash ? baseURL + hash : baseURL;
    }
}

function setURLPlace(placeName) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    params.set('place', encodeURIComponent(placeName));
    history.pushState(null, '', '#' + params.toString());

    // Update page title for SEO
    document.title = `${placeName} - DataAcuity Maps`;

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.content = `Explore ${placeName} through history on DataAcuity Maps. Discover historical names, events, and how this place changed over time from 3000 BCE to today.`;
    }
}

function setURLYear(year) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (year !== 2024) {
        params.set('year', year);
    } else {
        params.delete('year');
    }
    history.replaceState(null, '', '#' + params.toString());
}

// ============================================
// Collapsible Sections
// ============================================

function toggleSection(header) {
    const section = header.closest('.collapsible-section');
    const content = section.querySelector('.section-content');
    const toggle = header.querySelector('.section-toggle');

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        toggle.classList.remove('collapsed');
    } else {
        content.classList.add('collapsed');
        toggle.classList.add('collapsed');
    }

    // Save collapsed state
    const sectionId = section.className.split(' ')[0];
    const collapsedStates = JSON.parse(localStorage.getItem('collapsedSections') || '{}');
    collapsedStates[sectionId] = content.classList.contains('collapsed');
    localStorage.setItem('collapsedSections', JSON.stringify(collapsedStates));
}

function restoreCollapsedStates() {
    const collapsedStates = JSON.parse(localStorage.getItem('collapsedSections') || '{}');
    Object.entries(collapsedStates).forEach(([sectionClass, isCollapsed]) => {
        if (isCollapsed) {
            const section = document.querySelector(`.${sectionClass}`);
            if (section) {
                const content = section.querySelector('.section-content');
                const toggle = section.querySelector('.section-toggle');
                if (content) content.classList.add('collapsed');
                if (toggle) toggle.classList.add('collapsed');
            }
        }
    });
}

// ============================================
// Signal-style Toast Notifications
// ============================================

function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info', duration = 4000) {
    const container = getToastContainer();

    const icons = {
        success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
        warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    const titles = {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
    };

    // Sanitize message to prevent XSS
    const safeMessage = escapeHtml(message);

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.position = 'relative';
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${safeMessage}</div>
        </div>
        <button class="toast-close">&times;</button>
        <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
    `;

    container.appendChild(toast);

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    // Auto-remove after duration
    setTimeout(() => removeToast(toast), duration);

    return toast;
}

function removeToast(toast) {
    if (!toast || toast.classList.contains('toast-exit')) return;

    toast.classList.add('toast-exit');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// Convenience functions
function showSuccess(message, duration) {
    return showToast(message, 'success', duration);
}

function showError(message, duration) {
    return showToast(message, 'error', duration);
}

function showWarning(message, duration) {
    return showToast(message, 'warning', duration);
}

function showInfo(message, duration) {
    return showToast(message, 'info', duration);
}

// ============================================
// Draggable Panel
// ============================================

function initDraggablePanel() {
    const layersPanel = document.getElementById('layers-panel');
    const layersList = document.getElementById('layers-list');

    // Add draggable class
    layersPanel.classList.add('draggable');

    // Replace the h3 with a drag handle
    const existingH3 = layersPanel.querySelector('h3');
    if (existingH3) {
        existingH3.remove();
    }

    // Create drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'panel-drag-handle';
    dragHandle.innerHTML = `
        <h3>
            <span class="drag-icon">⋮⋮</span>
            Map Layers
        </h3>
        <button class="panel-close-btn" onclick="closeDraggablePanel()">&times;</button>
    `;

    // Insert before layers list
    layersPanel.insertBefore(dragHandle, layersList);

    // Make panel draggable (supports both mouse and touch)
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    function getEventCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function startLayersDrag(e) {
        if (e.target.classList.contains('panel-close-btn')) return;

        isDragging = true;
        const coords = getEventCoords(e);
        startX = coords.x;
        startY = coords.y;

        const rect = layersPanel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        dragHandle.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function onLayersMove(e) {
        if (!isDragging) return;

        const coords = getEventCoords(e);
        const dx = coords.x - startX;
        const dy = coords.y - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Keep panel within viewport
        const panelRect = layersPanel.getBoundingClientRect();
        const maxX = window.innerWidth - panelRect.width;
        const maxY = window.innerHeight - panelRect.height;

        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(56, Math.min(newTop, maxY)); // 56px for header

        layersPanel.style.left = newLeft + 'px';
        layersPanel.style.top = newTop + 'px';
        layersPanel.style.right = 'auto';

        // Prevent scrolling while dragging on touch
        if (e.touches) e.preventDefault();
    }

    function endLayersDrag() {
        if (isDragging) {
            isDragging = false;
            dragHandle.style.cursor = 'grab';

            // Save position
            const rect = layersPanel.getBoundingClientRect();
            localStorage.setItem('layersPanelPosition', JSON.stringify({
                left: rect.left,
                top: rect.top
            }));
        }
    }

    // Mouse events
    dragHandle.addEventListener('mousedown', startLayersDrag);
    document.addEventListener('mousemove', onLayersMove);
    document.addEventListener('mouseup', endLayersDrag);

    // Touch events
    dragHandle.addEventListener('touchstart', startLayersDrag, { passive: false });
    document.addEventListener('touchmove', onLayersMove, { passive: false });
    document.addEventListener('touchend', endLayersDrag);

    // Restore saved position
    const savedPosition = localStorage.getItem('layersPanelPosition');
    if (savedPosition) {
        const pos = JSON.parse(savedPosition);
        layersPanel.style.left = pos.left + 'px';
        layersPanel.style.top = pos.top + 'px';
        layersPanel.style.right = 'auto';
    }

    // Restore collapsed states after sections are created
    setTimeout(restoreCollapsedStates, 100);
}

function closeDraggablePanel() {
    document.getElementById('layers-panel').classList.add('hidden');
}

// Generic function to make any panel draggable (supports both mouse and touch)
function makePanelDraggable(panel, dragHandle, storageKey) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    // Get coordinates from mouse or touch event
    function getEventCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function startDrag(e) {
        // Don't drag when clicking buttons
        if (e.target.closest('button') || e.target.closest('input')) return;

        isDragging = true;
        const coords = getEventCoords(e);
        startX = coords.x;
        startY = coords.y;

        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        dragHandle.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function onMove(e) {
        if (!isDragging) return;

        const coords = getEventCoords(e);
        const dx = coords.x - startX;
        const dy = coords.y - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Keep panel within viewport
        const panelRect = panel.getBoundingClientRect();
        const maxX = window.innerWidth - panelRect.width;
        const maxY = window.innerHeight - panelRect.height;

        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(56, Math.min(newTop, maxY)); // 56px for header

        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.transform = 'none';  // Remove any centering transform

        // Prevent scrolling while dragging on touch
        if (e.touches) e.preventDefault();
    }

    function endDrag() {
        if (isDragging) {
            isDragging = false;
            dragHandle.style.cursor = 'grab';

            // Save position
            if (storageKey) {
                const rect = panel.getBoundingClientRect();
                localStorage.setItem(storageKey, JSON.stringify({
                    left: rect.left,
                    top: rect.top
                }));
            }
        }
    }

    // Mouse events
    dragHandle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', endDrag);

    // Touch events
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', endDrag);

    // Restore saved position
    if (storageKey) {
        const savedPosition = localStorage.getItem(storageKey);
        if (savedPosition) {
            const pos = JSON.parse(savedPosition);
            panel.style.left = pos.left + 'px';
            panel.style.top = pos.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.transform = 'none';  // Remove any centering transform
        }
    }
}

function initMap() {
    const savedOrientation = ORIENTATIONS[state.orientation] || ORIENTATIONS['north-up'];
    const savedStyle = MAP_STYLES[state.mapStyle] || MAP_STYLES['voyager'];

    // Build style - either vector JSON or raster tiles
    let mapStyle;
    if (savedStyle.url) {
        mapStyle = savedStyle.url;
    } else {
        mapStyle = buildRasterStyle(savedStyle);
    }

    state.map = new maplibregl.Map({
        container: 'map',
        style: mapStyle,
        center: MAP_CONFIG.center,
        zoom: MAP_CONFIG.zoom,
        minZoom: MAP_CONFIG.minZoom,
        maxZoom: MAP_CONFIG.maxZoom,
        bearing: savedOrientation.bearing
    });

    state.map.addControl(new maplibregl.NavigationControl(), 'top-left');
    state.map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    // Create hover popup for labels
    state.hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'hover-label-popup'
    });

    state.map.on('load', () => {
        loadPlacesForYear(state.currentYear);
        setupMapClickHandler();
        checkForSharedRoute();
        setupTransitMapListeners();
    });
}

// Build a raster tile style for non-vector providers
function buildRasterStyle(styleConfig) {
    const sources = {
        'raster-tiles': {
            type: 'raster',
            tiles: [styleConfig.raster],
            tileSize: 256,
            attribution: getAttribution(styleConfig.raster)
        }
    };

    const layers = [{
        id: 'raster-layer',
        type: 'raster',
        source: 'raster-tiles',
        minzoom: 0,
        maxzoom: 19
    }];

    // Add overlay layer if exists (e.g., labels over satellite)
    if (styleConfig.overlay) {
        sources['overlay-tiles'] = {
            type: 'raster',
            tiles: [styleConfig.overlay],
            tileSize: 256
        };
        layers.push({
            id: 'overlay-layer',
            type: 'raster',
            source: 'overlay-tiles',
            minzoom: 0,
            maxzoom: 19
        });
    }

    return {
        version: 8,
        sources: sources,
        layers: layers
    };
}

// Get attribution for tile providers
function getAttribution(url) {
    if (url.includes('openstreetmap')) return '© OpenStreetMap contributors';
    if (url.includes('opentopomap')) return '© OpenTopoMap';
    if (url.includes('arcgisonline')) return '© Esri';
    if (url.includes('stamen')) return '© Stamen Design';
    return '';
}

function setupMapClickHandler() {
    // Click on map to get coordinates (for contribution)
    state.map.on('click', (e) => {
        const coords = e.lngLat;

        // Update contribution form if modal is open
        const latInput = document.querySelector('input[name="lat"]');
        const lngInput = document.querySelector('input[name="lng"]');
        if (latInput && lngInput) {
            latInput.value = coords.lat.toFixed(6);
            lngInput.value = coords.lng.toFixed(6);
        }
    });
}

// ============================================
// Timeline
// ============================================

function initTimeline() {
    const slider = document.getElementById('timeline-slider');
    const yearDisplay = document.getElementById('year-display');
    const playBtn = document.getElementById('btn-play');

    slider.addEventListener('input', (e) => {
        const year = parseInt(e.target.value);
        updateYear(year);
    });

    playBtn.addEventListener('click', togglePlay);

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const year = parseInt(btn.dataset.year);
            slider.value = year;
            updateYear(year);

            // Update active state
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Make timeline panel draggable
    const timelinePanel = document.getElementById('timeline-panel');
    const timelineDragHandle = document.getElementById('timeline-drag-handle');
    if (timelinePanel && timelineDragHandle) {
        makePanelDraggable(timelinePanel, timelineDragHandle, 'timelinePanelPosition');
    }

    // Initialize timeline as collapsed
    if (timelinePanel) {
        const sliderContainer = timelinePanel.querySelector('.timeline-slider-container');
        const presetsContainer = timelinePanel.querySelector('.timeline-presets');
        const toggleBtn = document.getElementById('timeline-toggle');

        timelinePanel.classList.add('collapsed');
        if (sliderContainer) sliderContainer.style.display = 'none';
        if (presetsContainer) presetsContainer.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = '+';
    }
}

function updateYear(year) {
    state.currentYear = year;
    const display = formatYear(year);
    document.getElementById('year-display').textContent = display;

    // Update preset button active state
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.year) === year);
    });

    // Update URL for SEO/shareability
    setURLYear(year);

    // Reload places for this year
    loadPlacesForYear(year);
}

function formatYear(year) {
    if (year < 0) {
        return `${Math.abs(year)} BCE`;
    } else if (year === 0) {
        return '1 BCE';  // There is no year 0
    } else {
        return `${year} CE`;
    }
}

function togglePlay() {
    const btn = document.getElementById('btn-play');

    if (state.isPlaying) {
        clearInterval(state.playInterval);
        state.isPlaying = false;
        btn.textContent = '▶️';
    } else {
        state.isPlaying = true;
        btn.textContent = '⏸️';

        // Animate through time
        const slider = document.getElementById('timeline-slider');
        let year = parseInt(slider.value);

        state.playInterval = setInterval(() => {
            year += 50;  // Jump 50 years at a time
            if (year > 2024) {
                year = -3000;  // Loop back
            }
            slider.value = year;
            updateYear(year);
        }, 500);
    }
}

// ============================================
// Data Loading
// ============================================

async function loadPlacesForYear(year) {
    const bbox = getMapBounds();
    const result = await fetchJSON(`${API_BASE}/timeline/${year}?bbox=${bbox}&limit=500`);

    if (result.ok && result.data && result.data.features) {
        displayPlaces(result.data.features);
    } else {
        // Show sample data if API is not available
        displaySampleData();
    }
}

function getMapBounds() {
    const bounds = state.map.getBounds();
    return `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
}

function displayPlaces(features) {
    // Store all places for filtering
    state.allPlaces = features;

    // Apply category filters
    renderFilteredPlaces();
}

function renderFilteredPlaces() {
    // Clear existing markers
    state.markers.forEach(marker => marker.remove());
    state.markers = [];

    const filteredFeatures = state.allPlaces.filter(feature => {
        const category = getCategoryForType(feature.properties.place_type);
        return state.categoryFilters[category];
    });

    filteredFeatures.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;
        const category = getCategoryForType(props.place_type);
        const catConfig = PLACE_CATEGORIES[category] || PLACE_CATEGORIES.admin;

        // Create marker element with category styling
        const el = document.createElement('div');
        el.className = 'map-marker';
        el.dataset.placeId = props.id;
        el.dataset.placeName = props.display_name || props.name_at_year || props.current_name;
        el.dataset.placeType = props.place_type;
        el.style.cssText = `
            width: 24px;
            height: 24px;
            background: ${catConfig.color};
            border: 2px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            transition: transform 0.15s ease;
        `;
        el.innerHTML = catConfig.icon;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .setPopup(createPopup(props))
            .addTo(state.map);

        // Hover label
        el.addEventListener('mouseenter', () => {
            el.style.transform = 'scale(1.2)';
            const name = props.display_name || props.name_at_year || props.current_name;
            state.hoverPopup
                .setLngLat(coords)
                .setHTML(`<div class="hover-label">${name}</div>`)
                .addTo(state.map);
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = 'scale(1)';
            state.hoverPopup.remove();
        });

        // Click handler for detailed view
        el.addEventListener('click', () => {
            loadPlaceDetails(props.id);
        });

        state.markers.push(marker);
    });

    // Update legend counts
    updateLegendCounts();
}

function updateLegendCounts() {
    const counts = {};
    Object.keys(PLACE_CATEGORIES).forEach(cat => counts[cat] = 0);

    state.allPlaces.forEach(feature => {
        const category = getCategoryForType(feature.properties.place_type);
        if (counts[category] !== undefined) {
            counts[category]++;
        }
    });

    Object.entries(counts).forEach(([cat, count]) => {
        const countEl = document.getElementById(`legend-count-${cat}`);
        if (countEl) {
            countEl.textContent = count > 0 ? `(${count})` : '';
        }
    });
}

function createPopup(props) {
    const content = `
        <div class="popup-content">
            <div class="popup-title">${props.display_name || props.name_at_year}</div>
            ${props.native_name ? `<div class="popup-historical">${props.native_name}</div>` : ''}
            ${props.used_by ? `<div class="popup-historical">Used by: ${props.used_by}</div>` : ''}
            <span class="popup-type">${props.place_type}</span>
        </div>
    `;
    return new maplibregl.Popup({ offset: 15 }).setHTML(content);
}

async function loadPlaceDetails(placeId) {
    try {
        const response = await fetch(`${API_BASE}/places/${placeId}`);
        if (!response.ok) return;

        const place = await response.json();
        showPlacePanel(place);
    } catch (error) {
        console.error('Error loading place details:', error);
    }
}

function showPlacePanel(place) {
    const panel = document.getElementById('place-panel');
    const content = document.getElementById('panel-content');

    // Update URL for SEO/shareability
    if (place.current_name) {
        setURLPlace(place.current_name);
    }

    // Sort historical names by year
    const names = place.historical_names || [];
    names.sort((a, b) => (a.year_start || -9999) - (b.year_start || -9999));

    content.innerHTML = `
        <div class="panel-header">
            <h3 class="panel-title">${place.current_name}</h3>
            <p class="panel-subtitle">${place.place_type} | ${place.country_code || 'Unknown'}</p>
        </div>

        <div class="panel-section">
            <h4>Names Through History</h4>
            <div class="name-timeline">
                ${names.length > 0 ? names.map(n => `
                    <div class="name-entry ${!n.year_end ? 'current' : ''}">
                        <div class="name-text">${n.name}</div>
                        ${n.name_native ? `<div class="name-native">${n.name_native}</div>` : ''}
                        <div class="name-meta">
                            <span class="name-years">${formatYearRange(n.year_start, n.year_end)}</span>
                            ${n.used_by ? `<span>• ${n.used_by}</span>` : ''}
                        </div>
                        ${n.source_title ? `<div class="name-meta">Source: ${n.source_title}</div>` : ''}
                    </div>
                `).join('') : `
                    <div class="name-entry current">
                        <div class="name-text">${place.current_name}</div>
                        <div class="name-meta">
                            <span class="name-years">Present</span>
                        </div>
                    </div>
                `}
            </div>
        </div>

        ${place.lat && place.lng ? `
        <div class="panel-section">
            <h4>Location</h4>
            <p>${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}</p>
        </div>

        <div class="place-actions">
            <button class="btn btn-secondary btn-icon-text" onclick="getDirectionsToPlace(${place.lng}, ${place.lat}, '${place.current_name.replace(/'/g, "\\'")}')">
                🧭 Directions
            </button>
            <button class="btn btn-secondary btn-icon-text" onclick="findNearbyFromPlace(${place.lng}, ${place.lat})">
                📍 Nearby
            </button>
            <button class="btn btn-secondary btn-icon-text" onclick="loadStreetView(${place.lat}, ${place.lng})">
                📷 Street View
            </button>
        </div>

        <div id="streetview-section" class="streetview-section hidden">
            <h4>📷 Street View</h4>
            <div id="streetview-content" class="streetview-content">
                <div class="streetview-loading">Loading street-level imagery...</div>
            </div>
        </div>

        <div class="reviews-section">
            <h4>⭐ Reviews</h4>
            <div id="reviews-summary" class="reviews-summary">
                <span class="reviews-loading">Loading reviews...</span>
            </div>
            <div id="reviews-list" class="reviews-list"></div>
            <p class="tagme-notice">
                <small>Submit reviews via the <strong>TagMe</strong> app</small>
            </p>
        </div>

        <div class="share-section">
            <h4>Share This Place</h4>
            <div class="share-buttons-grid">
                <button class="share-btn-small share-whatsapp" onclick="sharePlaceToWhatsApp('${place.current_name.replace(/'/g, "\\'")}', ${place.lat}, ${place.lng})" title="Share on WhatsApp">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </button>
                <button class="share-btn-small share-telegram" onclick="sharePlaceToTelegram('${place.current_name.replace(/'/g, "\\'")}', ${place.lat}, ${place.lng})" title="Share on Telegram">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </button>
                <button class="share-btn-small share-twitter" onclick="sharePlaceToTwitter('${place.current_name.replace(/'/g, "\\'")}', ${place.lat}, ${place.lng})" title="Share on X/Twitter">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </button>
                <button class="share-btn-small share-facebook" onclick="sharePlaceToFacebook('${place.current_name.replace(/'/g, "\\'")}', ${place.lat}, ${place.lng})" title="Share on Facebook">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </button>
                <button class="share-btn-small share-email" onclick="sharePlaceToEmail('${place.current_name.replace(/'/g, "\\'")}', ${place.lat}, ${place.lng})" title="Share via Email">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                </button>
                <button class="share-btn-small share-copy" onclick="copyPlaceUrl('${place.current_name.replace(/'/g, "\\'")}', ${place.lat}, ${place.lng})" title="Copy Link">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
            </div>
        </div>
        ` : ''}
    `;

    panel.classList.remove('hidden');

    // Auto-load reviews for this place
    if (place.lat && place.lng) {
        loadPlaceReviews(place.lat, place.lng);
    }
}

// Helper functions for place panel actions
function getDirectionsToPlace(lng, lat, name) {
    // Set this place as destination and open routing
    const routingPanel = document.getElementById('routing-panel');
    if (routingPanel) {
        routingPanel.classList.remove('hidden');
        // Set the destination input
        const destInput = routingPanel.querySelector('.waypoint-search:last-of-type');
        if (destInput) {
            destInput.value = name;
        }
    }
    // If we have user's location, calculate route directly
    if (state.nearby.center) {
        getDirectionsTo(lng, lat, name);
    } else {
        toggleRoutingPanel();
        showInfo('Enter a starting point or use your location');
    }
}

function findNearbyFromPlace(lng, lat) {
    // Set this location as nearby center
    const nearbyPanel = document.getElementById('nearby-panel');
    if (nearbyPanel) {
        nearbyPanel.classList.remove('hidden');
        state.nearby.active = true;
        setNearbyCenter(lng, lat);
        state.map.flyTo({ center: [lng, lat], zoom: 14 });
    }
}

window.getDirectionsToPlace = getDirectionsToPlace;
window.findNearbyFromPlace = findNearbyFromPlace;

// ============================================
// Street View (Mapillary)
// ============================================

let currentStreetViewLocation = null;

async function loadStreetView(lat, lng) {
    const section = document.getElementById('streetview-section');
    const content = document.getElementById('streetview-content');

    currentStreetViewLocation = { lat, lng };
    section.classList.remove('hidden');
    content.innerHTML = '<div class="streetview-loading">Loading street-level imagery...</div>';

    try {
        const resp = await fetch(`/api/streetview?lat=${lat}&lng=${lng}&radius=200`);
        const data = await resp.json();

        if (data.status === 'not_configured') {
            content.innerHTML = `
                <div class="streetview-notice">
                    <p>Street View not configured</p>
                    <small>${data.message}</small>
                </div>
            `;
            return;
        }

        if (data.images && data.images.length > 0) {
            content.innerHTML = `
                <div class="streetview-gallery">
                    ${data.images.slice(0, 6).map((img, i) => `
                        <div class="streetview-thumb" onclick="openStreetViewImage('${img.id}', '${img.viewer_url}')">
                            <img src="${img.thumbnail}" alt="Street view ${i + 1}" loading="lazy">
                            ${img.captured_at ? `<span class="streetview-date">${new Date(img.captured_at).toLocaleDateString()}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
                <p class="streetview-credit">
                    <small>📸 ${data.count} images from <a href="https://www.mapillary.com" target="_blank" rel="noopener">Mapillary</a></small>
                </p>
            `;
        } else {
            content.innerHTML = `
                <div class="streetview-notice">
                    <p>No street-level imagery available here</p>
                    <small>Help by contributing photos with the Mapillary app!</small>
                </div>
            `;
        }
    } catch (e) {
        content.innerHTML = `
            <div class="streetview-notice">
                <p>Could not load street view</p>
                <small>${e.message}</small>
            </div>
        `;
    }
}

function openStreetViewImage(imageId, viewerUrl) {
    window.open(viewerUrl, '_blank', 'noopener,noreferrer');
}

window.loadStreetView = loadStreetView;
window.openStreetViewImage = openStreetViewImage;

// ============================================
// Reviews
// ============================================

async function loadPlaceReviews(lat, lng) {

    const summaryEl = document.getElementById('reviews-summary');
    const listEl = document.getElementById('reviews-list');

    try {
        // For now, use a hash of coordinates as POI ID
        const poiId = Math.abs(hashCode(`${lat},${lng}`)) % 1000000;
        const resp = await fetch(`/api/pois/${poiId}/reviews`);
        const data = await resp.json();

        if (data.review_count > 0) {
            summaryEl.innerHTML = `
                <span class="rating-display">
                    <span class="rating-stars">${'★'.repeat(Math.round(data.average_rating))}${'☆'.repeat(5 - Math.round(data.average_rating))}</span>
                    <span class="rating-value">${data.average_rating}</span>
                </span>
                <span class="review-count">(${data.review_count} reviews)</span>
            `;

            listEl.innerHTML = data.reviews.slice(0, 5).map(r => `
                <div class="review-item">
                    <div class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                    ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : ''}
                    <span class="review-date">${new Date(r.created_at).toLocaleDateString()}</span>
                </div>
            `).join('');
        } else {
            summaryEl.innerHTML = '<span class="no-reviews">No reviews yet</span>';
            listEl.innerHTML = '';
        }
    } catch (e) {
        summaryEl.innerHTML = '<span class="no-reviews">No reviews yet</span>';
        listEl.innerHTML = '';
    }
}

// Simple hash function for generating consistent IDs
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// HTML escape helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.loadPlaceReviews = loadPlaceReviews;

function formatYearRange(start, end) {
    const startStr = start === null ? 'Ancient' : formatYear(start);
    const endStr = end === null ? 'Present' : formatYear(end);
    return `${startStr} - ${endStr}`;
}

// ============================================
// Search
// ============================================

function initSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    let debounceTimer;

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length < 2) {
            results.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(() => searchPlaces(query), 300);
    });

    // Handle Enter key - immediate search or fly to first result
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(debounceTimer);
            const query = input.value.trim();

            // Check if results are already showing
            const firstResult = results.querySelector('.search-result-item');
            if (firstResult && !results.classList.contains('hidden')) {
                // Click the first result
                firstResult.click();
            } else if (query.length >= 2) {
                // Trigger immediate search
                searchPlaces(query);
            }
        }
        // Arrow key navigation through results
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const items = results.querySelectorAll('.search-result-item');
            if (items.length === 0) return;

            e.preventDefault();
            const current = results.querySelector('.search-result-item.highlighted');
            let next;

            if (!current) {
                next = e.key === 'ArrowDown' ? items[0] : items[items.length - 1];
            } else {
                current.classList.remove('highlighted');
                const idx = Array.from(items).indexOf(current);
                if (e.key === 'ArrowDown') {
                    next = items[(idx + 1) % items.length];
                } else {
                    next = items[(idx - 1 + items.length) % items.length];
                }
            }
            next.classList.add('highlighted');
            next.scrollIntoView({ block: 'nearest' });
        }
    });

    input.addEventListener('focus', () => {
        if (input.value.length >= 2) {
            results.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            results.classList.add('hidden');
        }
    });
}

async function searchPlaces(query) {
    const results = document.getElementById('search-results');

    try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) return;

        const data = await response.json();

        if (data.results.length === 0) {
            results.innerHTML = '<div class="search-result-item">No results found</div>';
        } else {
            results.innerHTML = data.results.map(r => {
                // Build location display - escape all user-contributed content
                let locationParts = [];
                if (r.admin1_name) locationParts.push(escapeHtml(r.admin1_name));
                if (r.country_name) locationParts.push(escapeHtml(r.country_name));
                if (r.continent && !r.country_name) locationParts.push(escapeHtml(r.continent));
                const locationDisplay = locationParts.length > 0 ? locationParts.join(', ') : escapeHtml(r.country_code || '');

                const matchedName = escapeHtml(r.matched_name || r.current_name);
                const currentName = escapeHtml(r.current_name);
                const placeType = escapeHtml(r.place_type);

                return `
                <div class="search-result-item" onclick="flyToPlace(${r.lng}, ${r.lat}, ${r.id})">
                    <div class="search-result-name">${matchedName}</div>
                    <div class="search-result-location">${locationDisplay}</div>
                    <div class="search-result-meta">
                        ${r.matched_name && r.matched_name !== r.current_name ? `Now: ${currentName} • ` : ''}
                        ${placeType}
                        ${r.year_start ? ` • ${formatYear(r.year_start)}` : ''}
                    </div>
                </div>
            `}).join('');
        }

        results.classList.remove('hidden');
    } catch (error) {
        console.error('Search error:', error);
    }
}

function flyToPlace(lng, lat, placeId) {
    state.map.flyTo({
        center: [lng, lat],
        zoom: 10,
        duration: 1500
    });

    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('search-input').value = '';

    // Load place details after flying
    setTimeout(() => loadPlaceDetails(placeId), 1600);
}

// ============================================
// Stats
// ============================================

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        if (!response.ok) return;

        const stats = await response.json();

        document.getElementById('stats-places').textContent = stats.total_places || 0;
        document.getElementById('stats-names').textContent = stats.total_historical_names || 0;
        document.getElementById('stats-events').textContent = stats.total_events || 0;
    } catch (error) {
        // Use sample stats if API not available
        document.getElementById('stats-places').textContent = '12';
        document.getElementById('stats-names').textContent = '35';
        document.getElementById('stats-events').textContent = '8';
    }
}

// ============================================
// Modals
// ============================================

function initModals() {
    // Contribute modal (optional - may not exist)
    const contributeBtn = document.getElementById('btn-contribute');
    const contributeModal = document.getElementById('contribute-modal');

    if (contributeBtn && contributeModal) {
        contributeBtn.addEventListener('click', () => {
            contributeModal.classList.remove('hidden');
        });
    }

    // Info modal
    const infoBtn = document.getElementById('btn-info');
    const infoModal = document.getElementById('info-modal');

    if (infoBtn && infoModal) {
        infoBtn.addEventListener('click', () => {
            infoModal.classList.remove('hidden');
        });
    }

    // Layers panel
    const layersBtn = document.getElementById('btn-layers');
    const layersPanel = document.getElementById('layers-panel');

    layersBtn.addEventListener('click', () => {
        layersPanel.classList.toggle('hidden');
    });

    // Close panel
    document.getElementById('close-panel').addEventListener('click', () => {
        document.getElementById('place-panel').classList.add('hidden');
    });

    // Make place panel draggable
    const placePanel = document.getElementById('place-panel');
    const placePanelHeader = document.getElementById('place-panel-header');
    makePanelDraggable(placePanel, placePanelHeader, 'placePanelPosition');

    // Close buttons and overlays
    document.querySelectorAll('.modal .close-btn, .modal-overlay').forEach(el => {
        el.addEventListener('click', () => {
            el.closest('.modal').classList.add('hidden');
        });
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tab}`).classList.add('active');
        });
    });

    // Contribute form submission (optional - may not exist)
    const contributeForm = document.getElementById('contribute-form');
    if (contributeForm) {
        contributeForm.addEventListener('submit', handleContribution);
    }
}

async function handleContribution(e) {
    e.preventDefault();

    const activeTab = document.querySelector('.tab-content.active').id;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
        let endpoint, payload;

        if (activeTab === 'tab-place') {
            endpoint = `${API_BASE}/places`;
            payload = {
                current_name: data.current_name,
                lat: parseFloat(data.lat),
                lng: parseFloat(data.lng),
                place_type: data.place_type
            };
        } else if (activeTab === 'tab-name') {
            endpoint = `${API_BASE}/places/${data.place_id}/names`;
            payload = {
                name: data.name,
                name_native: data.name_native,
                year_start: data.year_start ? parseInt(data.year_start) : null,
                year_end: data.year_end ? parseInt(data.year_end) : null,
                used_by: data.used_by,
                source_title: data.source_title
            };
        } else if (activeTab === 'tab-event') {
            endpoint = `${API_BASE}/events`;
            payload = {
                name: data.event_name,
                description: data.description,
                event_type: data.event_type,
                year: parseInt(data.year),
                place_id: data.event_place_id ? parseInt(data.event_place_id) : null,
                source_title: data.event_source
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showSuccess('Thank you for your contribution!');
            document.getElementById('contribute-modal').classList.add('hidden');
            e.target.reset();
            loadPlacesForYear(state.currentYear);
            loadStats();
        } else {
            const error = await response.json();
            showError(error.detail || 'Failed to submit');
        }
    } catch (error) {
        console.error('Contribution error:', error);
        showError('Failed to submit. Please try again.');
    }
}

// ============================================
// Sample Data (when API not available)
// ============================================

function displaySampleData() {
    const samplePlaces = [
        { id: 1, name: 'Cape Town', native: 'Kaapstad / //Hui !Gaeb', type: 'city', lng: 18.4241, lat: -33.9249 },
        { id: 2, name: 'Johannesburg', native: 'eGoli', type: 'city', lng: 28.0473, lat: -26.2041 },
        { id: 3, name: 'Jerusalem', native: 'Yerushalayim / Al-Quds', type: 'city', lng: 35.2137, lat: 31.7683 },
        { id: 4, name: 'Bethlehem', native: 'Beit Lechem', type: 'town', lng: 35.2076, lat: 31.7054 },
        { id: 5, name: 'Durban', native: 'eThekwini', type: 'city', lng: 31.0218, lat: -29.8587 },
        { id: 6, name: 'Babylon', native: 'Bab-ilim', type: 'ancient_city', lng: 44.4275, lat: 32.5363 }
    ];

    const features = samplePlaces.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
            id: p.id,
            current_name: p.name,
            name_at_year: p.name,
            native_name: p.native,
            place_type: p.type,
            display_name: p.name
        }
    }));

    displayPlaces(features);
}

// ============================================
// Map Orientation
// ============================================

function initOrientationControls() {
    // Create orientation control panel in layers panel
    const layersList = document.getElementById('layers-list');

    const orientationSection = document.createElement('div');
    orientationSection.className = 'orientation-section collapsible-section';
    orientationSection.innerHTML = `
        <div class="section-header" onclick="toggleSection(this)">
            <h4>Map Orientation</h4>
            <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
            <div class="orientation-options">
                ${Object.entries(ORIENTATIONS).map(([key, opt]) => `
                    <label class="orientation-option" title="${opt.description}">
                        <input type="radio" name="orientation" value="${key}" ${state.orientation === key ? 'checked' : ''}>
                        <span>${opt.label}</span>
                    </label>
                `).join('')}
            </div>
            <p style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.5rem;">
                Preference saved automatically
            </p>
        </div>
    `;

    layersList.appendChild(orientationSection);

    // Add event listeners
    orientationSection.querySelectorAll('input[name="orientation"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            setOrientation(e.target.value);
        });
    });

    // Update the current orientation indicator in header
    updateOrientationIndicator();
}

function setOrientation(orientationKey) {
    if (!ORIENTATIONS[orientationKey]) return;

    state.orientation = orientationKey;
    localStorage.setItem('mapOrientation', orientationKey);

    const orientation = ORIENTATIONS[orientationKey];

    // Animate the map rotation
    state.map.easeTo({
        bearing: orientation.bearing,
        duration: 1000
    });

    updateOrientationIndicator();
}

function updateOrientationIndicator() {
    // Update compass indicator if exists
    const indicator = document.getElementById('orientation-indicator');
    if (indicator) {
        const orientation = ORIENTATIONS[state.orientation];
        indicator.textContent = orientation.label;
        indicator.title = orientation.description;
    }
}

// Quick toggle function for keyboard shortcut
function cycleOrientation() {
    const keys = Object.keys(ORIENTATIONS);
    const currentIndex = keys.indexOf(state.orientation);
    const nextIndex = (currentIndex + 1) % keys.length;
    setOrientation(keys[nextIndex]);
}

// Keyboard shortcut: Press 'O' to cycle orientation
document.addEventListener('keydown', (e) => {
    if (e.key === 'o' || e.key === 'O') {
        if (!e.target.matches('input, textarea')) {
            cycleOrientation();
        }
    }
});

// ============================================
// Map Styles
// ============================================

function initMapStyles() {
    const layersList = document.getElementById('layers-list');

    const styleSection = document.createElement('div');
    styleSection.className = 'style-section collapsible-section';
    styleSection.innerHTML = `
        <div class="section-header" onclick="toggleSection(this)">
            <h4>Map Style</h4>
            <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
            <div class="style-options">
                ${Object.entries(MAP_STYLES).map(([key, style]) => `
                    <label class="style-option" title="${style.description}">
                        <input type="radio" name="mapStyle" value="${key}" ${state.mapStyle === key ? 'checked' : ''}>
                        <span>${style.name}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    // Insert before orientation section
    layersList.insertBefore(styleSection, layersList.firstChild);

    // Add event listeners
    styleSection.querySelectorAll('input[name="mapStyle"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            setMapStyle(e.target.value);
        });
    });
}

function setMapStyle(styleKey) {
    if (!MAP_STYLES[styleKey]) return;

    state.mapStyle = styleKey;
    localStorage.setItem('mapStyle', styleKey);

    const style = MAP_STYLES[styleKey];

    // Build style - either vector JSON or raster tiles
    let mapStyle;
    if (style.url) {
        mapStyle = style.url;
    } else {
        mapStyle = buildRasterStyle(style);
    }

    state.map.setStyle(mapStyle);

    // Re-add route layer after style change if routing is active
    state.map.once('style.load', () => {
        if (state.routing.waypoints.length >= 2) {
            calculateRoute();
        }
        loadPlacesForYear(state.currentYear);
    });
}

// ============================================
// Legend Panel
// ============================================

function initLegend() {
    const mapContainer = document.getElementById('map-container');

    const legend = document.createElement('div');
    legend.id = 'map-legend';
    legend.className = 'map-legend draggable';
    legend.innerHTML = `
        <div class="legend-header panel-drag-handle">
            <h4><span class="drag-icon">⋮⋮</span> Legend</h4>
            <button class="legend-toggle" onclick="toggleLegend()">+</button>
        </div>
        <div class="legend-content" style="display: none;">
            ${Object.entries(PLACE_CATEGORIES).map(([key, cat]) => `
                <div class="legend-item" data-category="${key}">
                    <span class="legend-icon" style="background: ${cat.color}">${cat.icon}</span>
                    <span class="legend-label">${cat.name}</span>
                    <span class="legend-count" id="legend-count-${key}"></span>
                </div>
            `).join('')}
        </div>
    `;

    mapContainer.appendChild(legend);

    // Make legend draggable
    const dragHandle = legend.querySelector('.legend-header');
    makePanelDraggable(legend, dragHandle, 'legendPosition');
}

function toggleLegend() {
    const legend = document.getElementById('map-legend');
    const content = legend.querySelector('.legend-content');
    const btn = legend.querySelector('.legend-toggle');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.textContent = '−';
    } else {
        content.style.display = 'none';
        btn.textContent = '+';
    }
}

function toggleTimeline() {
    const timeline = document.getElementById('timeline-panel');
    const sliderContainer = timeline.querySelector('.timeline-slider-container');
    const presetsContainer = timeline.querySelector('.timeline-presets');
    const btn = document.getElementById('timeline-toggle');

    if (timeline.classList.contains('collapsed')) {
        timeline.classList.remove('collapsed');
        sliderContainer.style.display = 'flex';
        presetsContainer.style.display = 'flex';
        btn.textContent = '−';
    } else {
        timeline.classList.add('collapsed');
        sliderContainer.style.display = 'none';
        presetsContainer.style.display = 'none';
        btn.textContent = '+';
    }
}

// ============================================
// Category Filters
// ============================================

function initCategoryFilters() {
    const layersList = document.getElementById('layers-list');

    const filterSection = document.createElement('div');
    filterSection.className = 'filter-section collapsible-section';
    filterSection.innerHTML = `
        <div class="section-header" onclick="toggleSection(this)">
            <h4>Show Categories</h4>
            <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
            <div class="filter-options">
                ${Object.entries(PLACE_CATEGORIES).map(([key, cat]) => `
                    <label class="filter-option">
                        <input type="checkbox" name="categoryFilter" value="${key}"
                               ${state.categoryFilters[key] ? 'checked' : ''}>
                        <span class="filter-icon" style="background: ${cat.color}">${cat.icon}</span>
                        <span class="filter-label">${cat.name}</span>
                    </label>
                `).join('')}
            </div>
            <div class="filter-actions">
                <button class="btn btn-sm" onclick="selectAllCategories()">All</button>
                <button class="btn btn-sm" onclick="selectNoCategories()">None</button>
            </div>
        </div>
    `;

    // Insert after style section (before orientation)
    const orientationSection = layersList.querySelector('.orientation-section');
    if (orientationSection) {
        layersList.insertBefore(filterSection, orientationSection);
    } else {
        layersList.appendChild(filterSection);
    }

    // Add event listeners
    filterSection.querySelectorAll('input[name="categoryFilter"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            setCategoryFilter(e.target.value, e.target.checked);
        });
    });
}

function setCategoryFilter(category, enabled) {
    state.categoryFilters[category] = enabled;
    localStorage.setItem('categoryFilters', JSON.stringify(state.categoryFilters));
    renderFilteredPlaces();
}

function selectAllCategories() {
    Object.keys(PLACE_CATEGORIES).forEach(cat => {
        state.categoryFilters[cat] = true;
        const checkbox = document.querySelector(`input[value="${cat}"]`);
        if (checkbox) checkbox.checked = true;
    });
    localStorage.setItem('categoryFilters', JSON.stringify(state.categoryFilters));
    renderFilteredPlaces();
}

function selectNoCategories() {
    Object.keys(PLACE_CATEGORIES).forEach(cat => {
        state.categoryFilters[cat] = false;
        const checkbox = document.querySelector(`input[value="${cat}"]`);
        if (checkbox) checkbox.checked = false;
    });
    localStorage.setItem('categoryFilters', JSON.stringify(state.categoryFilters));
    renderFilteredPlaces();
}

// ============================================
// Transit Layer (GTFS)
// ============================================

const transitState = {
    enabled: false,
    stops: [],
    routes: [],
    markers: [],
    routeLines: []
};

function initTransitLayer() {
    // Add transit toggle to layers panel
    const layersList = document.getElementById('layers-list');

    const transitSection = document.createElement('div');
    transitSection.className = 'filter-section collapsible-section';
    transitSection.innerHTML = `
        <div class="section-header" onclick="toggleSection(this)">
            <h4>🚌 Public Transit</h4>
            <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
            <label class="filter-option transit-toggle">
                <input type="checkbox" id="transit-layer-toggle" onchange="toggleTransitLayer(this.checked)">
                <span>Show Transit Stops & Routes</span>
            </label>
            <div id="transit-routes-list" class="transit-routes-list hidden">
                <p class="transit-loading">Loading routes...</p>
            </div>
        </div>
    `;

    layersList.appendChild(transitSection);

    // Restore saved state
    const saved = localStorage.getItem('transitLayerEnabled');
    if (saved === 'true') {
        document.getElementById('transit-layer-toggle').checked = true;
        toggleTransitLayer(true);
    }
}

async function toggleTransitLayer(enabled) {
    transitState.enabled = enabled;
    localStorage.setItem('transitLayerEnabled', enabled);

    if (enabled) {
        await loadTransitData();
        renderTransitLayer();
    } else {
        clearTransitLayer();
    }
}

async function loadTransitData() {
    const routesList = document.getElementById('transit-routes-list');
    routesList.classList.remove('hidden');
    routesList.innerHTML = '<p class="transit-loading">Loading routes...</p>';

    try {
        // Load routes from GTFS API
        const routesResp = await fetch('/api/gtfs/routes');
        const routesData = await routesResp.json();
        transitState.routes = routesData.routes || [];

        // Build route list UI
        if (transitState.routes.length > 0) {
            routesList.innerHTML = `
                <div class="transit-route-filters">
                    ${transitState.routes.map(route => `
                        <label class="transit-route-item" style="border-left: 4px solid #${route.route_color || '888'}">
                            <input type="checkbox" checked data-route-id="${route.route_id}" onchange="toggleTransitRoute('${route.route_id}', this.checked)">
                            <span class="route-name">${route.route_short_name}</span>
                            <span class="route-desc">${route.route_long_name}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        } else {
            routesList.innerHTML = '<p class="no-transit">No transit routes available in this area</p>';
        }

        // Load stops for current view
        await loadTransitStops();

    } catch (e) {
        routesList.innerHTML = `<p class="transit-error">Could not load transit data</p>`;
        console.error('Transit load error:', e);
    }
}

async function loadTransitStops() {
    const bounds = state.map.getBounds();
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

    try {
        const resp = await fetch(`/api/gtfs/stops?bbox=${bbox}`);
        const data = await resp.json();
        transitState.stops = data.stops || [];
    } catch (e) {
        console.error('Could not load transit stops:', e);
        transitState.stops = [];
    }
}

function renderTransitLayer() {
    clearTransitLayer();

    if (!transitState.enabled) return;

    // Get enabled route IDs
    const enabledRoutes = new Set();
    document.querySelectorAll('#transit-routes-list input[data-route-id]:checked').forEach(cb => {
        enabledRoutes.add(cb.dataset.routeId);
    });

    // Render stops
    transitState.stops.forEach(stop => {
        // Check if stop is served by an enabled route
        const stopRoutes = stop.route_ids ? stop.route_ids.split(',') : [];
        const hasEnabledRoute = stopRoutes.length === 0 || stopRoutes.some(r => enabledRoutes.has(r));

        if (!hasEnabledRoute) return;

        const el = document.createElement('div');
        el.className = 'transit-stop-marker';
        el.innerHTML = '🚏';
        el.title = stop.stop_name;

        const popup = new maplibregl.Popup({ offset: 25 })
            .setHTML(`
                <div class="transit-popup">
                    <strong>🚏 ${stop.stop_name}</strong>
                    ${stop.route_names ? `<p class="popup-routes">Routes: ${stop.route_names}</p>` : ''}
                    ${stop.wheelchair_boarding === 1 ? '<span class="accessibility">♿ Accessible</span>' : ''}
                </div>
            `);

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([stop.stop_lon, stop.stop_lat])
            .setPopup(popup)
            .addTo(state.map);

        transitState.markers.push(marker);
    });

    // Add route lines using map layers
    addTransitRouteLines(enabledRoutes);
}

function addTransitRouteLines(enabledRoutes) {
    // Build GeoJSON for routes
    const features = [];

    transitState.routes.forEach(route => {
        if (!enabledRoutes.has(route.route_id)) return;
        if (!route.shape_coords) return;

        try {
            const coords = JSON.parse(route.shape_coords);
            features.push({
                type: 'Feature',
                properties: {
                    route_id: route.route_id,
                    route_name: route.route_short_name,
                    color: `#${route.route_color || '0088ff'}`
                },
                geometry: {
                    type: 'LineString',
                    coordinates: coords
                }
            });
        } catch (e) {
            // Skip routes without valid shape data
        }
    });

    if (features.length === 0) return;

    // Add source and layer
    if (state.map.getSource('transit-routes')) {
        state.map.getSource('transit-routes').setData({
            type: 'FeatureCollection',
            features: features
        });
    } else {
        state.map.addSource('transit-routes', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: features
            }
        });

        state.map.addLayer({
            id: 'transit-routes-line',
            type: 'line',
            source: 'transit-routes',
            paint: {
                'line-color': ['get', 'color'],
                'line-width': 4,
                'line-opacity': 0.8
            }
        });
    }
}

function clearTransitLayer() {
    // Remove markers
    transitState.markers.forEach(m => m.remove());
    transitState.markers = [];

    // Remove route lines layer
    if (state.map.getLayer('transit-routes-line')) {
        state.map.removeLayer('transit-routes-line');
    }
    if (state.map.getSource('transit-routes')) {
        state.map.removeSource('transit-routes');
    }
}

function toggleTransitRoute(routeId, enabled) {
    renderTransitLayer();
}

// Update transit stops when map moves
function setupTransitMapListeners() {
    state.map.on('moveend', async () => {
        if (transitState.enabled) {
            await loadTransitStops();
            renderTransitLayer();
        }
    });
}

window.toggleTransitLayer = toggleTransitLayer;
window.toggleTransitRoute = toggleTransitRoute;

// ============================================
// Road Reports Layer (Waze-like)
// ============================================

const reportsState = {
    enabled: false,
    reports: [],
    markers: [],
    refreshInterval: null
};

// Report type icons and colors
const REPORT_ICONS = {
    traffic_jam: { icon: '🚗', color: '#ff4444', label: 'Traffic Jam' },
    traffic_moderate: { icon: '🚙', color: '#ffaa00', label: 'Moderate Traffic' },
    accident: { icon: '💥', color: '#ff0000', label: 'Accident' },
    hazard_road: { icon: '⚠️', color: '#ff8800', label: 'Road Hazard' },
    hazard_weather: { icon: '🌧️', color: '#4488ff', label: 'Weather Hazard' },
    police: { icon: '👮', color: '#0066cc', label: 'Police' },
    closure: { icon: '🚧', color: '#cc0000', label: 'Road Closure' },
    construction: { icon: '🏗️', color: '#ff6600', label: 'Construction' },
    camera: { icon: '📷', color: '#666666', label: 'Speed Camera' },
    fuel_price: { icon: '⛽', color: '#00aa00', label: 'Fuel Price' }
};

function initReportsLayer() {
    // Add reports toggle to layers panel
    const layersList = document.getElementById('layers-list');

    const reportsSection = document.createElement('div');
    reportsSection.className = 'filter-section collapsible-section';
    reportsSection.innerHTML = `
        <div class="section-header" onclick="toggleSection(this)">
            <h4>🚨 Road Reports</h4>
            <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
            <label class="filter-option reports-toggle">
                <input type="checkbox" id="reports-layer-toggle" onchange="toggleReportsLayer(this.checked)">
                <span>Show Live Road Reports</span>
            </label>
            <div id="reports-filter-list" class="reports-filter-list hidden">
                <p class="reports-info">Live crowd-sourced reports</p>
                <div class="report-type-filters">
                    <label class="report-type-item">
                        <input type="checkbox" checked data-report-type="traffic_jam" onchange="renderReportsLayer()">
                        <span>🚗 Traffic</span>
                    </label>
                    <label class="report-type-item">
                        <input type="checkbox" checked data-report-type="accident" onchange="renderReportsLayer()">
                        <span>💥 Accidents</span>
                    </label>
                    <label class="report-type-item">
                        <input type="checkbox" checked data-report-type="hazard_road" onchange="renderReportsLayer()">
                        <span>⚠️ Hazards</span>
                    </label>
                    <label class="report-type-item">
                        <input type="checkbox" checked data-report-type="police" onchange="renderReportsLayer()">
                        <span>👮 Police</span>
                    </label>
                    <label class="report-type-item">
                        <input type="checkbox" checked data-report-type="closure" onchange="renderReportsLayer()">
                        <span>🚧 Closures</span>
                    </label>
                    <label class="report-type-item">
                        <input type="checkbox" checked data-report-type="camera" onchange="renderReportsLayer()">
                        <span>📷 Cameras</span>
                    </label>
                </div>
                <p class="tagme-notice">
                    <small>Submit reports via <strong>TagMe</strong> app</small>
                </p>
            </div>
        </div>
    `;

    layersList.appendChild(reportsSection);

    // Restore saved state
    const saved = localStorage.getItem('reportsLayerEnabled');
    if (saved === 'true') {
        document.getElementById('reports-layer-toggle').checked = true;
        toggleReportsLayer(true);
    }

    // Setup map move listener for reports
    setupReportsMapListeners();
}

async function toggleReportsLayer(enabled) {
    reportsState.enabled = enabled;
    localStorage.setItem('reportsLayerEnabled', enabled);

    const filterList = document.getElementById('reports-filter-list');

    if (enabled) {
        filterList?.classList.remove('hidden');
        await loadReportsData();
        renderReportsLayer();
        // Auto-refresh every 60 seconds
        reportsState.refreshInterval = setInterval(async () => {
            if (reportsState.enabled) {
                await loadReportsData();
                renderReportsLayer();
            }
        }, 60000);
    } else {
        filterList?.classList.add('hidden');
        clearReportsLayer();
        if (reportsState.refreshInterval) {
            clearInterval(reportsState.refreshInterval);
            reportsState.refreshInterval = null;
        }
    }
}

async function loadReportsData() {
    const bounds = state.map.getBounds();
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

    try {
        const resp = await fetch(`${API_BASE}/reports/bbox?bbox=${bbox}`);
        if (resp.ok) {
            const data = await resp.json();
            reportsState.reports = data.reports || [];
        } else {
            console.error('Could not load road reports:', resp.status);
            reportsState.reports = [];
        }
    } catch (e) {
        console.error('Could not load road reports:', e);
        reportsState.reports = [];
    }
}

function renderReportsLayer() {
    clearReportsLayer();

    if (!reportsState.enabled) return;

    // Get enabled report types
    const enabledTypes = new Set();
    document.querySelectorAll('#reports-filter-list input[data-report-type]:checked').forEach(cb => {
        enabledTypes.add(cb.dataset.reportType);
    });
    // Also add related types
    if (enabledTypes.has('traffic_jam')) enabledTypes.add('traffic_moderate');
    if (enabledTypes.has('hazard_road')) enabledTypes.add('hazard_weather');

    // Render report markers
    reportsState.reports.forEach(report => {
        if (!enabledTypes.has(report.report_type)) return;

        const reportInfo = REPORT_ICONS[report.report_type] || { icon: '📍', color: '#888', label: 'Report' };

        const el = document.createElement('div');
        el.className = 'road-report-marker';
        el.innerHTML = reportInfo.icon;
        el.title = reportInfo.label;
        el.style.setProperty('--report-color', reportInfo.color);

        // Format time ago
        const timeAgo = formatTimeAgo(new Date(report.received_at));

        // Build popup content
        const popup = new maplibregl.Popup({ offset: 25 })
            .setHTML(`
                <div class="report-popup">
                    <div class="report-popup-header" style="border-left: 4px solid ${reportInfo.color}">
                        <span class="report-icon">${reportInfo.icon}</span>
                        <strong>${reportInfo.label}</strong>
                    </div>
                    ${report.description ? `<p class="report-description">${escapeHtml(report.description)}</p>` : ''}
                    <div class="report-meta">
                        <span class="report-time">🕐 ${timeAgo}</span>
                        ${report.severity > 1 ? `<span class="report-severity">Severity: ${report.severity}/5</span>` : ''}
                    </div>
                    <div class="report-confidence">
                        <span class="confidence-score" title="Confidence based on verifications">
                            ${report.confidence_score >= 0 ? '👍' : '👎'} ${report.confidence_score} confidence
                        </span>
                        <span class="verified-count">✓ ${report.verified_count || 0} verified</span>
                    </div>
                </div>
            `);

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([report.longitude, report.latitude])
            .setPopup(popup)
            .addTo(state.map);

        reportsState.markers.push(marker);
    });
}

function clearReportsLayer() {
    reportsState.markers.forEach(m => m.remove());
    reportsState.markers = [];
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupReportsMapListeners() {
    state.map.on('moveend', async () => {
        if (reportsState.enabled) {
            await loadReportsData();
            renderReportsLayer();
        }
    });
}

window.toggleReportsLayer = toggleReportsLayer;
window.renderReportsLayer = renderReportsLayer;

// ============================================
// Routing
// ============================================

function initRouting() {
    // Add routing button to header
    const headerRight = document.querySelector('.header-right');
    const routeBtn = document.createElement('button');
    routeBtn.id = 'btn-route';
    routeBtn.className = 'btn btn-icon';
    routeBtn.title = 'Plan Route';
    routeBtn.innerHTML = '<span>🧭</span>';
    headerRight.insertBefore(routeBtn, headerRight.firstChild);

    routeBtn.addEventListener('click', toggleRoutingPanel);

    // Create routing panel
    createRoutingPanel();
}

function createRoutingPanel() {
    const mapContainer = document.getElementById('map-container');

    const panel = document.createElement('div');
    panel.id = 'routing-panel';
    panel.className = 'routing-panel hidden draggable';
    panel.innerHTML = `
        <div class="routing-header panel-drag-handle">
            <h3><span class="drag-icon">⋮⋮</span> Plan Route</h3>
            <button class="panel-close-btn" onclick="toggleRoutingPanel()">&times;</button>
        </div>
        <div class="routing-content">
            <div id="waypoints-list">
                <div class="waypoint-input" data-index="0">
                    <span class="waypoint-label">A</span>
                    <input type="text" placeholder="Start location..." class="waypoint-search" data-index="0">
                    <button class="btn-remove-waypoint hidden" onclick="removeWaypoint(0)">&times;</button>
                </div>
                <div class="waypoint-input" data-index="1">
                    <span class="waypoint-label">B</span>
                    <input type="text" placeholder="End location..." class="waypoint-search" data-index="1">
                    <button class="btn-remove-waypoint hidden" onclick="removeWaypoint(1)">&times;</button>
                </div>
            </div>
            <button id="btn-add-waypoint" class="btn btn-secondary btn-sm">+ Add Stop</button>
            <div class="routing-actions">
                <button id="btn-calculate-route" class="btn btn-primary">Get Directions</button>
                <button id="btn-clear-route" class="btn btn-secondary">Clear</button>
            </div>
            <div id="route-info" class="route-info hidden">
                <div class="route-summary">
                    <span id="route-distance"></span> • <span id="route-duration"></span>
                    <span id="route-traffic-eta" class="traffic-eta hidden"></span>
                </div>
                <div id="route-traffic-alerts" class="route-traffic-alerts hidden"></div>
                <div class="voice-controls">
                    <select id="voice-style" class="voice-style-select">
                        <option value="default">🎙️ Standard</option>
                        <option value="friendly">😊 Friendly</option>
                        <option value="pirate">🏴‍☠️ Pirate</option>
                        <option value="robot">🤖 Robot</option>
                        <option value="zen">🧘 Zen</option>
                        <option value="sports">💪 Coach</option>
                    </select>
                    <button id="btn-play-directions" class="btn btn-sm btn-voice" onclick="playDirections()" title="Play directions">
                        🔊 Play
                    </button>
                    <button id="btn-stop-directions" class="btn btn-sm btn-voice hidden" onclick="stopDirections()" title="Stop">
                        ⏹️ Stop
                    </button>
                </div>
                <div id="route-steps" class="route-steps"></div>
            </div>
        </div>
    `;

    mapContainer.appendChild(panel);

    // Event listeners
    document.getElementById('btn-add-waypoint').addEventListener('click', addWaypoint);
    document.getElementById('btn-calculate-route').addEventListener('click', calculateRoute);
    document.getElementById('btn-clear-route').addEventListener('click', clearRoute);

    // Setup waypoint search inputs
    setupWaypointSearch();

    // Make routing panel draggable
    const dragHandle = panel.querySelector('.routing-header');
    makePanelDraggable(panel, dragHandle, 'routingPanelPosition');
}

function toggleRoutingPanel() {
    const panel = document.getElementById('routing-panel');
    panel.classList.toggle('hidden');
    state.routing.active = !panel.classList.contains('hidden');
}

function setupWaypointSearch() {
    document.querySelectorAll('.waypoint-search').forEach(input => {
        let debounceTimer;

        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();
            const index = parseInt(e.target.dataset.index);

            if (query.length < 2) return;

            debounceTimer = setTimeout(() => searchForWaypoint(query, index, e.target), 300);
        });

        input.addEventListener('focus', (e) => {
            // Show existing dropdown if any
            const dropdown = e.target.parentElement.querySelector('.waypoint-dropdown');
            if (dropdown) dropdown.classList.remove('hidden');
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.waypoint-input')) {
            document.querySelectorAll('.waypoint-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });
}

async function searchForWaypoint(query, index, inputElement) {
    try {
        // Search local database first
        const localResults = [];
        try {
            const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                localResults.push(...(data.results || []).map(r => ({
                    ...r,
                    source: 'local'
                })));
            }
        } catch (e) {
            console.warn('Local search failed:', e);
        }

        // Also search Nominatim for addresses
        const nominatimResults = await searchNominatim(query);

        // Combine results - local first, then Nominatim
        const combined = [...localResults, ...nominatimResults];
        showWaypointDropdown(combined, index, inputElement);
    } catch (error) {
        console.error('Waypoint search error:', error);
    }
}

// Nominatim geocoding for street addresses
async function searchNominatim(query) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'HistoricalMapsApp/1.0'
            }
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.map(r => ({
            current_name: r.display_name.split(',').slice(0, 3).join(','),
            full_address: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            place_type: r.type || r.class || 'address',
            source: 'nominatim'
        }));
    } catch (error) {
        console.warn('Nominatim search failed:', error);
        return [];
    }
}

function showWaypointDropdown(results, index, inputElement) {
    // Remove existing dropdown
    const existingDropdown = inputElement.parentElement.querySelector('.waypoint-dropdown');
    if (existingDropdown) existingDropdown.remove();

    if (results.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'waypoint-dropdown';

    // Create options with proper event handling to prevent XSS
    results.slice(0, 8).forEach((r, i) => {
        const option = document.createElement('div');
        option.className = 'waypoint-option';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'waypoint-option-name';
        nameSpan.textContent = r.current_name || r.matched_name;

        const metaSpan = document.createElement('span');
        metaSpan.className = 'waypoint-option-meta';

        const typeSpan = document.createElement('span');
        typeSpan.className = 'waypoint-option-type';
        typeSpan.textContent = r.place_type;
        metaSpan.appendChild(typeSpan);

        if (r.source === 'nominatim') {
            const sourceSpan = document.createElement('span');
            sourceSpan.className = 'source-osm';
            sourceSpan.title = 'OpenStreetMap';
            sourceSpan.textContent = 'OSM';
            metaSpan.appendChild(sourceSpan);
        }

        option.appendChild(nameSpan);
        option.appendChild(metaSpan);

        // Use data attributes and event listener instead of inline onclick
        option.addEventListener('click', () => {
            selectWaypoint(index, r.lng, r.lat, r.current_name || r.matched_name);
        });

        dropdown.appendChild(option);
    });

    inputElement.parentElement.appendChild(dropdown);
}

function selectWaypoint(index, lng, lat, name) {
    // Update waypoints array
    while (state.routing.waypoints.length <= index) {
        state.routing.waypoints.push(null);
    }
    state.routing.waypoints[index] = { lng, lat, name };

    // Update input
    const input = document.querySelector(`.waypoint-search[data-index="${index}"]`);
    if (input) input.value = name;

    // Remove dropdown
    document.querySelectorAll('.waypoint-dropdown').forEach(d => d.remove());

    // Add marker
    addWaypointMarker(index, lng, lat, name);
}

function addWaypointMarker(index, lng, lat, name) {
    // Remove existing marker for this index
    if (state.routing.markers[index]) {
        state.routing.markers[index].remove();
    }

    const labels = 'ABCDEFGHIJ';
    const el = document.createElement('div');
    el.className = 'waypoint-marker';
    el.innerHTML = labels[index] || '+';
    el.style.cssText = `
        width: 28px;
        height: 28px;
        background: #FF3B30;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    `;

    const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 15 }).setText(name))
        .addTo(state.map);

    state.routing.markers[index] = marker;
}

function addWaypoint() {
    const list = document.getElementById('waypoints-list');
    const index = list.children.length;
    const labels = 'ABCDEFGHIJ';

    const waypointDiv = document.createElement('div');
    waypointDiv.className = 'waypoint-input';
    waypointDiv.dataset.index = index;
    waypointDiv.innerHTML = `
        <span class="waypoint-label">${labels[index] || '+'}</span>
        <input type="text" placeholder="Add stop..." class="waypoint-search" data-index="${index}">
        <button class="btn-remove-waypoint" onclick="removeWaypoint(${index})">&times;</button>
    `;

    list.appendChild(waypointDiv);
    setupWaypointSearch();

    // Show remove buttons for all waypoints if more than 2
    if (list.children.length > 2) {
        list.querySelectorAll('.btn-remove-waypoint').forEach(btn => btn.classList.remove('hidden'));
    }
}

function removeWaypoint(index) {
    const list = document.getElementById('waypoints-list');
    const waypointDiv = list.querySelector(`[data-index="${index}"]`);

    if (waypointDiv && list.children.length > 2) {
        waypointDiv.remove();

        // Remove marker
        if (state.routing.markers[index]) {
            state.routing.markers[index].remove();
            state.routing.markers.splice(index, 1);
        }

        // Remove from waypoints
        state.routing.waypoints.splice(index, 1);

        // Reindex remaining waypoints
        reindexWaypoints();
    }
}

function reindexWaypoints() {
    const labels = 'ABCDEFGHIJ';
    const list = document.getElementById('waypoints-list');

    Array.from(list.children).forEach((div, i) => {
        div.dataset.index = i;
        div.querySelector('.waypoint-label').textContent = labels[i] || '+';
        div.querySelector('.waypoint-search').dataset.index = i;

        const removeBtn = div.querySelector('.btn-remove-waypoint');
        if (removeBtn) {
            removeBtn.setAttribute('onclick', `removeWaypoint(${i})`);
        }
    });
}

async function calculateRoute() {
    const validWaypoints = state.routing.waypoints.filter(w => w !== null);

    if (validWaypoints.length < 2) {
        showWarning('Please select at least a start and end location');
        return;
    }

    // Show loading indicator
    const calculateBtn = document.getElementById('btn-calculate-route');
    const originalText = calculateBtn.textContent;
    calculateBtn.textContent = 'Calculating...';
    calculateBtn.disabled = true;

    // Build coordinates
    const coords = validWaypoints.map(w => `${w.lng},${w.lat}`).join(';');
    const coordsORS = validWaypoints.map(w => [w.lng, w.lat]);

    // Try OSRM first, then fallback to OpenRouteService
    let routeData = null;
    let routeSource = '';

    try {
        // Try OSRM demo server first
        const osrmResponse = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
            { signal: AbortSignal.timeout(10000) }
        );

        if (osrmResponse.ok) {
            const data = await osrmResponse.json();
            if (data.code === 'Ok' && data.routes && data.routes.length) {
                routeData = data.routes[0];
                routeSource = 'osrm';
            }
        }
    } catch (osrmError) {
        console.log('OSRM failed, trying fallback...', osrmError.message);
    }

    // Fallback to OpenRouteService if OSRM failed
    if (!routeData) {
        try {
            // OpenRouteService free tier - no API key needed for limited use
            const orsResponse = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    coordinates: coordsORS
                }),
                signal: AbortSignal.timeout(15000)
            });

            if (orsResponse.ok) {
                const orsData = await orsResponse.json();
                if (orsData.features && orsData.features.length) {
                    const feature = orsData.features[0];
                    routeData = {
                        geometry: feature.geometry,
                        distance: feature.properties.summary?.distance || 0,
                        duration: feature.properties.summary?.duration || 0,
                        legs: [{
                            steps: feature.properties.segments?.[0]?.steps?.map(step => ({
                                maneuver: { instruction: step.instruction },
                                distance: step.distance
                            })) || []
                        }]
                    };
                    routeSource = 'openrouteservice';
                }
            }
        } catch (orsError) {
            console.log('OpenRouteService also failed:', orsError.message);
        }
    }

    // Reset button
    calculateBtn.textContent = originalText;
    calculateBtn.disabled = false;

    if (routeData) {
        displayRoute(routeData);
        if (routeSource === 'openrouteservice') {
            showInfo('Route calculated via OpenRouteService');
        }
    } else {
        showError('Could not calculate route. The locations may be too far apart or not connected by roads.');
    }
}

async function displayRoute(route) {
    // Remove existing route
    if (state.map.getLayer('route')) {
        state.map.removeLayer('route');
    }
    if (state.map.getSource('route')) {
        state.map.removeSource('route');
    }

    // Add route to map
    state.map.addSource('route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: route.geometry
        }
    });

    state.map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#007AFF',
            'line-width': 5,
            'line-opacity': 0.8
        }
    });

    // Fit map to route
    const coordinates = route.geometry.coordinates;
    const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
    }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

    state.map.fitBounds(bounds, { padding: 50 });

    // Show route info
    const distance = (route.distance / 1000).toFixed(1);
    const duration = Math.round(route.duration / 60);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;

    document.getElementById('route-distance').textContent = `${distance} km`;
    document.getElementById('route-duration').textContent =
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

    // Show turn-by-turn directions
    const steps = route.legs.flatMap(leg => leg.steps);
    document.getElementById('route-steps').innerHTML = steps.map((step, i) => `
        <div class="route-step">
            <span class="step-number">${i + 1}</span>
            <span class="step-instruction">${step.maneuver.instruction || step.name}</span>
            <span class="step-distance">${(step.distance / 1000).toFixed(1)} km</span>
        </div>
    `).join('');

    document.getElementById('route-info').classList.remove('hidden');

    // Fetch and display traffic alerts along route
    await fetchRouteTrafficAlerts(route, duration);
}

// Traffic delay factors per report type (in minutes)
const TRAFFIC_DELAYS = {
    traffic_jam: { base: 10, perSeverity: 5 },
    traffic_moderate: { base: 3, perSeverity: 2 },
    accident: { base: 15, perSeverity: 8 },
    hazard_road: { base: 2, perSeverity: 1 },
    hazard_weather: { base: 5, perSeverity: 3 },
    police: { base: 1, perSeverity: 0 },
    closure: { base: 20, perSeverity: 10 },
    construction: { base: 5, perSeverity: 3 },
    camera: { base: 0, perSeverity: 0 }
};

async function fetchRouteTrafficAlerts(route, baseDurationMin) {
    const trafficEtaEl = document.getElementById('route-traffic-eta');
    const alertsEl = document.getElementById('route-traffic-alerts');

    // Build waypoints from route geometry (sample every ~5km)
    const coords = route.geometry.coordinates;
    const samplePoints = [];
    let lastSampled = 0;

    for (let i = 0; i < coords.length; i += 10) {
        if (i === 0 || i >= lastSampled + 10) {
            samplePoints.push(`${coords[i][0]},${coords[i][1]}`);
            lastSampled = i;
        }
    }

    // Always include last point
    if (samplePoints.length === 0 || coords.length > 0) {
        const last = coords[coords.length - 1];
        samplePoints.push(`${last[0]},${last[1]}`);
    }

    const waypoints = samplePoints.slice(0, 20).join(';'); // Limit to 20 points

    try {
        const resp = await fetch(`${API_BASE}/reports/route?waypoints=${encodeURIComponent(waypoints)}&buffer_km=2`);
        if (!resp.ok) {
            trafficEtaEl.classList.add('hidden');
            alertsEl.classList.add('hidden');
            return;
        }

        const data = await resp.json();
        const reports = data.reports || [];

        if (reports.length === 0) {
            trafficEtaEl.classList.add('hidden');
            alertsEl.innerHTML = '<div class="no-traffic-alerts">✓ No incidents reported on this route</div>';
            alertsEl.classList.remove('hidden');
            return;
        }

        // Calculate total delay
        let totalDelay = 0;
        const alertsByType = {};

        reports.forEach(report => {
            const delay = TRAFFIC_DELAYS[report.report_type];
            if (delay) {
                const reportDelay = delay.base + (delay.perSeverity * (report.severity - 1));
                totalDelay += reportDelay;
            }

            if (!alertsByType[report.report_type]) {
                alertsByType[report.report_type] = [];
            }
            alertsByType[report.report_type].push(report);
        });

        // Show traffic-adjusted ETA
        if (totalDelay > 0) {
            const adjustedDuration = baseDurationMin + totalDelay;
            const adjHours = Math.floor(adjustedDuration / 60);
            const adjMinutes = adjustedDuration % 60;
            const adjustedEta = adjHours > 0 ? `${adjHours}h ${adjMinutes}m` : `${adjMinutes} min`;

            trafficEtaEl.innerHTML = `<span class="traffic-delay-indicator">🚦 +${totalDelay} min traffic</span> → <strong>${adjustedEta}</strong>`;
            trafficEtaEl.classList.remove('hidden');
        } else {
            trafficEtaEl.classList.add('hidden');
        }

        // Build alerts list
        let alertsHtml = '<div class="traffic-alerts-header">⚠️ Road alerts on route:</div>';
        alertsHtml += '<div class="traffic-alerts-list">';

        Object.entries(alertsByType).forEach(([type, typeReports]) => {
            const reportInfo = REPORT_ICONS[type] || { icon: '📍', label: 'Report' };
            const count = typeReports.length;

            alertsHtml += `
                <div class="traffic-alert-item" style="border-left: 3px solid ${reportInfo.color}">
                    <span class="alert-icon">${reportInfo.icon}</span>
                    <span class="alert-text">${reportInfo.label}</span>
                    <span class="alert-count">${count > 1 ? `×${count}` : ''}</span>
                </div>
            `;
        });

        alertsHtml += '</div>';
        alertsHtml += '<p class="tagme-notice"><small>Report incidents via <strong>TagMe</strong> app</small></p>';

        alertsEl.innerHTML = alertsHtml;
        alertsEl.classList.remove('hidden');

    } catch (e) {
        console.error('Could not fetch traffic alerts:', e);
        trafficEtaEl.classList.add('hidden');
        alertsEl.classList.add('hidden');
    }
}

function clearRoute() {
    // Remove route layers (both 'route' and 'route-line' variants)
    if (state.map.getLayer('route-line')) {
        state.map.removeLayer('route-line');
    }
    if (state.map.getLayer('route')) {
        state.map.removeLayer('route');
    }
    if (state.map.getSource('route')) {
        state.map.removeSource('route');
    }

    // Remove markers
    state.routing.markers.forEach(m => m && m.remove());
    state.routing.markers = [];

    // Clear waypoints
    state.routing.waypoints = [];

    // Reset inputs
    document.querySelectorAll('.waypoint-search').forEach(input => {
        input.value = '';
    });

    // Remove extra waypoint inputs (keep first two)
    const list = document.getElementById('waypoints-list');
    while (list.children.length > 2) {
        list.lastChild.remove();
    }

    // Hide route info and traffic alerts
    document.getElementById('route-info').classList.add('hidden');
    document.getElementById('route-traffic-eta')?.classList.add('hidden');
    document.getElementById('route-traffic-alerts')?.classList.add('hidden');

    // Hide remove buttons
    list.querySelectorAll('.btn-remove-waypoint').forEach(btn => btn.classList.add('hidden'));
}

// ============================================
// What's Nearby - POI Discovery
// ============================================

const POI_CATEGORIES = {
    accommodation: {
        icon: '🏨',
        label: 'Accommodation',
        color: '#8B5CF6',
        overpass: 'tourism~"hotel|hostel|motel|guest_house|bed_and_breakfast|apartment"'
    },
    fuel: {
        icon: '⛽',
        label: 'Fuel Stations',
        color: '#EF4444',
        overpass: 'amenity=fuel'
    },
    restaurant: {
        icon: '🍽️',
        label: 'Restaurants',
        color: '#F59E0B',
        overpass: 'amenity~"restaurant|fast_food|cafe"'
    },
    atm: {
        icon: '🏧',
        label: 'ATMs & Banks',
        color: '#10B981',
        overpass: 'amenity~"atm|bank"'
    },
    hospital: {
        icon: '🏥',
        label: 'Medical',
        color: '#EF4444',
        overpass: 'amenity~"hospital|clinic|pharmacy|doctors"'
    },
    parking: {
        icon: '🅿️',
        label: 'Parking',
        color: '#3B82F6',
        overpass: 'amenity=parking'
    },
    shopping: {
        icon: '🛒',
        label: 'Shopping',
        color: '#EC4899',
        overpass: 'shop~"supermarket|mall|convenience"'
    },
    attractions: {
        icon: '🎭',
        label: 'Attractions',
        color: '#8B5CF6',
        overpass: 'tourism~"attraction|museum|viewpoint|artwork"'
    }
};

// Sample Advertisement Pins (would normally be loaded from ad server)
// These use offset values that will be applied to search center location
const AD_PIN_TEMPLATES = [
    {
        id: 'ad-1',
        name: 'Oceanview Restaurant & Bar',
        latOffset: 0.005,
        lngOffset: 0.003,
        icon: '🍽️',
        category: 'restaurant',
        description: 'Fine dining with stunning views',
        address: 'Premium Location'
    },
    {
        id: 'ad-2',
        name: 'City Central Hotel',
        latOffset: -0.004,
        lngOffset: 0.006,
        icon: '🏨',
        category: 'accommodation',
        description: 'Luxury accommodation in the heart of the city',
        address: 'Central Business District'
    },
    {
        id: 'ad-3',
        name: 'AutoFix Service Center',
        latOffset: 0.003,
        lngOffset: -0.005,
        icon: '🔧',
        category: 'services',
        description: 'Professional vehicle servicing and repairs',
        address: 'Conveniently Located'
    },
    {
        id: 'ad-4',
        name: 'FreshMart Supermarket',
        latOffset: -0.006,
        lngOffset: -0.004,
        icon: '🛒',
        category: 'shopping',
        description: 'Fresh groceries and daily essentials',
        address: 'Your Neighborhood'
    }
];

// Generate ad pins along a route
function getAdPinsAlongRoute(routeCoordinates) {
    if (!routeCoordinates || routeCoordinates.length < 2) return [];

    // Pick points along the route (at 25% and 75% of the way)
    const totalPoints = routeCoordinates.length;
    const positions = [
        Math.floor(totalPoints * 0.25),
        Math.floor(totalPoints * 0.75)
    ];

    return positions.map((pos, index) => {
        const coord = routeCoordinates[Math.min(pos, totalPoints - 1)];
        const template = AD_PIN_TEMPLATES[index % AD_PIN_TEMPLATES.length];
        return {
            ...template,
            id: `route-ad-${index}`,
            lng: coord[0] + 0.001, // Slight offset so it's visible next to route
            lat: coord[1] + 0.001
        };
    });
}

// Add advertisement markers along a route
function addRouteAdMarkers(routeCoordinates) {
    const adPins = getAdPinsAlongRoute(routeCoordinates);

    adPins.forEach(ad => {
        const el = document.createElement('div');
        el.className = 'ad-marker-container';
        el.innerHTML = `
            <div class="ad-marker">
                <div class="ad-marker-icon">${ad.icon}</div>
                <div class="ad-marker-badge">Ad</div>
            </div>
            <div class="ad-marker-label">
                <div class="ad-label-name">${ad.name}</div>
                <div class="ad-label-description">${ad.description}</div>
                <div class="ad-label-promo">Highlight Your Business with <a href="https://www.bidbaas.co.za" target="_blank" rel="noopener">Bid Baas</a></div>
                <button class="ad-label-directions" onclick="event.stopPropagation(); getDirectionsTo(${ad.lng}, ${ad.lat}, '${ad.name.replace(/'/g, "\\'")}')">Get Directions</button>
            </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([ad.lng, ad.lat])
            .addTo(state.map);

        // Store with route markers for cleanup
        state.routing.markers.push(marker);
        console.log('Route ad marker added:', ad.name, 'at', ad.lat, ad.lng);
    });
}

function initNearby() {
    const mapContainer = document.getElementById('map');

    // Add nearby button to header
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const nearbyBtn = document.createElement('button');
        nearbyBtn.id = 'btn-nearby';
        nearbyBtn.className = 'btn btn-icon';
        nearbyBtn.innerHTML = '<span>📍</span>';
        nearbyBtn.title = "What's Nearby";
        nearbyBtn.onclick = toggleNearbyPanel;
        // Insert before the refresh button
        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) {
            headerRight.insertBefore(nearbyBtn, refreshBtn);
        } else {
            headerRight.appendChild(nearbyBtn);
        }
    }

    // Create nearby panel
    const panel = document.createElement('div');
    panel.id = 'nearby-panel';
    panel.className = 'nearby-panel hidden draggable';
    panel.innerHTML = `
        <div class="nearby-header panel-drag-handle">
            <h3><span class="drag-icon">⋮⋮</span> What's Nearby</h3>
            <div class="nearby-header-controls">
                <button class="nearby-collapse-btn" onclick="collapseNearbyPanel()" title="Collapse/Expand">−</button>
                <button class="panel-close-btn" onclick="toggleNearbyPanel()">&times;</button>
            </div>
        </div>
        <div class="nearby-content">
            <div class="nearby-location">
                <button id="btn-use-my-location" class="btn btn-primary btn-sm">
                    <span>📍</span> Use My Location
                </button>
                <span class="nearby-location-text" id="nearby-location-text">or click on map</span>
            </div>
            <div class="nearby-radius">
                <label>Search radius:</label>
                <select id="nearby-radius">
                    <option value="500">500m</option>
                    <option value="1000">1km</option>
                    <option value="2000" selected>2km</option>
                    <option value="5000">5km</option>
                    <option value="10000">10km</option>
                </select>
            </div>
            <div class="nearby-categories-wrapper">
                <button type="button" class="nearby-categories-toggle" id="nearby-categories-toggle">
                    <span>Categories <span class="nearby-categories-count" id="nearby-categories-count">0</span></span>
                    <span class="toggle-arrow">▼</span>
                </button>
                <div class="nearby-categories" id="nearby-categories">
                    ${Object.entries(POI_CATEGORIES).map(([key, cat]) => `
                        <label class="nearby-category">
                            <input type="checkbox" value="${key}" onchange="toggleNearbyCategory('${key}')">
                            <span class="category-icon">${cat.icon}</span>
                            <span class="category-label">${cat.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div id="nearby-validation" class="nearby-validation warning">
                <span class="validation-icon">ℹ️</span>
                <span id="nearby-validation-text">Select a location and at least one category</span>
            </div>
            <div class="nearby-actions">
                <button id="btn-search-nearby" class="btn btn-primary" disabled>Search</button>
                <button id="btn-clear-nearby" class="btn btn-secondary">Clear</button>
            </div>
            <div id="nearby-results" class="nearby-results hidden">
                <div class="nearby-results-header">
                    <span id="nearby-results-count">0 results</span>
                </div>
                <div id="nearby-results-list" class="nearby-results-list"></div>
            </div>
            <div id="nearby-loading" class="nearby-loading hidden">
                <div class="loading-spinner"></div>
                <span class="loading-text">Searching nearby places...</span>
                <div class="loading-progress">
                    <div class="loading-progress-bar"></div>
                </div>
            </div>
        </div>
    `;

    mapContainer.appendChild(panel);

    // Event listeners
    document.getElementById('btn-use-my-location').addEventListener('click', useMyLocation);
    document.getElementById('btn-search-nearby').addEventListener('click', searchNearby);
    document.getElementById('btn-clear-nearby').addEventListener('click', clearNearby);
    document.getElementById('nearby-radius').addEventListener('change', (e) => {
        state.nearby.radius = parseInt(e.target.value);
    });

    // Categories dropdown toggle
    document.getElementById('nearby-categories-toggle').addEventListener('click', () => {
        const toggle = document.getElementById('nearby-categories-toggle');
        const categories = document.getElementById('nearby-categories');
        toggle.classList.toggle('open');
        categories.classList.toggle('open');
    });

    // Make panel draggable
    const dragHandle = panel.querySelector('.nearby-header');
    makePanelDraggable(panel, dragHandle, 'nearbyPanelPosition');

    // Map click handler for selecting location (wait for map to be ready)
    if (state.map) {
        const addClickHandler = () => {
            state.map.on('click', (e) => {
                if (state.nearby.active) {
                    setNearbyCenter(e.lngLat.lng, e.lngLat.lat);
                }
            });
        };

        if (state.map.loaded()) {
            addClickHandler();
        } else {
            state.map.on('load', addClickHandler);
        }
    }
}

function toggleNearbyPanel() {
    const panel = document.getElementById('nearby-panel');
    panel.classList.toggle('hidden');
    state.nearby.active = !panel.classList.contains('hidden');
}

function collapseNearbyPanel() {
    const panel = document.getElementById('nearby-panel');
    const content = panel.querySelector('.nearby-content');
    const btn = panel.querySelector('.nearby-collapse-btn');

    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        content.style.display = 'block';
        btn.textContent = '−';
    } else {
        panel.classList.add('collapsed');
        content.style.display = 'none';
        btn.textContent = '+';
    }
}

function useMyLocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setNearbyCenter(position.coords.longitude, position.coords.latitude);
                state.map.flyTo({
                    center: [position.coords.longitude, position.coords.latitude],
                    zoom: 14
                });
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Could not get your location. Please click on the map instead.');
            }
        );
    } else {
        alert('Geolocation is not supported by your browser. Please click on the map instead.');
    }
}

function setNearbyCenter(lng, lat) {
    state.nearby.center = { lng, lat };

    // Update location text
    const locationText = document.getElementById('nearby-location-text');
    locationText.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    // Add/update center marker
    if (state.nearby.centerMarker) {
        state.nearby.centerMarker.remove();
    }

    const el = document.createElement('div');
    el.className = 'nearby-center-marker';
    el.innerHTML = '📍';
    el.style.cssText = 'font-size: 24px; cursor: pointer;';

    // Create popup with location info
    const popup = new maplibregl.Popup({
        offset: 25,
        className: 'nearby-center-popup'
    }).setHTML(`
        <div class="center-popup-content">
            <div class="center-popup-title">You Are Here</div>
            <div class="center-popup-coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
            <div class="center-popup-address" id="center-popup-address">
                <span class="address-loading">Loading address...</span>
            </div>
        </div>
    `);

    state.nearby.centerMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(state.map);

    // Show popup immediately
    state.nearby.centerMarker.togglePopup();

    // Reverse geocode to get address
    reverseGeocode(lat, lng);

    // Enable search button if categories selected
    updateNearbySearchButton();
}

async function reverseGeocode(lat, lng) {
    reverseGeocodeElement(lat, lng, 'center-popup-address');
}

async function reverseGeocodeElement(lat, lng, elementId) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
        );
        const data = await response.json();

        const addressEl = document.getElementById(elementId);
        if (addressEl && data.display_name) {
            // Format a shorter address - escape to prevent XSS
            const parts = [];
            if (data.address) {
                if (data.address.road) parts.push(escapeHtml(data.address.road));
                if (data.address.suburb) parts.push(escapeHtml(data.address.suburb));
                if (data.address.city || data.address.town || data.address.village) {
                    parts.push(escapeHtml(data.address.city || data.address.town || data.address.village));
                }
            }
            const shortAddress = parts.length > 0 ? parts.join(', ') : escapeHtml(data.display_name.split(',').slice(0, 3).join(', '));
            addressEl.innerHTML = `<span class="address-text">${shortAddress}</span>`;
        }
    } catch (error) {
        const addressEl = document.getElementById(elementId);
        if (addressEl) {
            addressEl.innerHTML = '<span class="address-error">Address unavailable</span>';
        }
    }
}

function toggleNearbyCategory(category) {
    const checkbox = document.querySelector(`#nearby-categories input[value="${category}"]`);
    if (checkbox.checked) {
        state.nearby.activeCategories.push(category);
    } else {
        state.nearby.activeCategories = state.nearby.activeCategories.filter(c => c !== category);
    }
    updateNearbyCategoryCount();
    updateNearbySearchButton();
}

function updateNearbyCategoryCount() {
    const count = state.nearby.activeCategories.length;
    const countEl = document.getElementById('nearby-categories-count');
    if (countEl) {
        countEl.textContent = count;
        countEl.style.display = count > 0 ? 'inline' : 'none';
    }
}

function updateNearbySearchButton() {
    const btn = document.getElementById('btn-search-nearby');
    const validation = document.getElementById('nearby-validation');
    const validationText = document.getElementById('nearby-validation-text');
    const validationIcon = validation?.querySelector('.validation-icon');

    const hasLocation = !!state.nearby.center;
    const hasCategories = state.nearby.activeCategories.length > 0;
    const isValid = hasLocation && hasCategories;

    btn.disabled = !isValid;

    if (validation && validationText) {
        if (isValid) {
            validation.classList.add('valid');
            validation.classList.remove('warning');
            validationIcon.textContent = '✓';
            validationText.textContent = 'Ready to search';
        } else if (!hasLocation && !hasCategories) {
            validation.classList.remove('valid');
            validation.classList.add('warning');
            validationIcon.textContent = 'ℹ️';
            validationText.textContent = 'Select a location and at least one category';
        } else if (!hasLocation) {
            validation.classList.remove('valid');
            validation.classList.add('warning');
            validationIcon.textContent = '📍';
            validationText.textContent = 'Click on map or use your location';
        } else {
            validation.classList.remove('valid');
            validation.classList.add('warning');
            validationIcon.textContent = '☑️';
            validationText.textContent = 'Select at least one category';
        }
    }
}

async function searchNearby() {
    if (!state.nearby.center || state.nearby.activeCategories.length === 0) return;

    const loading = document.getElementById('nearby-loading');
    const results = document.getElementById('nearby-results');
    loading.classList.remove('hidden');
    results.classList.add('hidden');

    // Clear previous markers
    clearNearbyMarkers();

    const allResults = [];

    for (const category of state.nearby.activeCategories) {
        const cat = POI_CATEGORIES[category];
        try {
            const pois = await queryOverpass(
                state.nearby.center.lat,
                state.nearby.center.lng,
                state.nearby.radius,
                cat.overpass
            );

            pois.forEach(poi => {
                poi.category = category;
                poi.categoryInfo = cat;
            });

            allResults.push(...pois);
        } catch (error) {
            console.error(`Error fetching ${category}:`, error);
        }
    }

    // Sort by distance
    allResults.sort((a, b) => a.distance - b.distance);

    // Display results
    displayNearbyResults(allResults);

    loading.classList.add('hidden');
    results.classList.remove('hidden');
}

async function queryOverpass(lat, lng, radius, filter) {
    const query = `
        [out:json][timeout:25];
        (
            node[${filter}](around:${radius},${lat},${lng});
            way[${filter}](around:${radius},${lat},${lng});
        );
        out center;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`
        });

        if (!response.ok) throw new Error('Overpass API error');

        const data = await response.json();
        return data.elements.map(el => {
            const elLat = el.lat || el.center?.lat;
            const elLng = el.lon || el.center?.lon;
            const distance = calculateDistance(lat, lng, elLat, elLng);

            return {
                id: el.id,
                name: el.tags?.name || el.tags?.brand || 'Unnamed',
                lat: elLat,
                lng: elLng,
                distance: distance,
                tags: el.tags || {}
            };
        }).filter(p => p.lat && p.lng);
    } catch (error) {
        console.error('Overpass query failed:', error);
        return [];
    }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function displayNearbyResults(results) {
    const countEl = document.getElementById('nearby-results-count');
    const listEl = document.getElementById('nearby-results-list');

    countEl.textContent = `${results.length} results found`;

    // Clear list and build with proper DOM manipulation to prevent XSS
    listEl.innerHTML = '';

    results.slice(0, 50).forEach(poi => {
        const distanceStr = poi.distance < 1000
            ? `${Math.round(poi.distance)}m`
            : `${(poi.distance / 1000).toFixed(1)}km`;

        const openingHours = poi.tags.opening_hours || '';

        // Build location string from OSM address tags
        const locationParts = [];
        if (poi.tags['addr:street']) {
            let street = poi.tags['addr:housenumber']
                ? `${poi.tags['addr:housenumber']} ${poi.tags['addr:street']}`
                : poi.tags['addr:street'];
            locationParts.push(street);
        }
        if (poi.tags['addr:suburb']) locationParts.push(poi.tags['addr:suburb']);
        else if (poi.tags['addr:city']) locationParts.push(poi.tags['addr:city']);
        const locationStr = locationParts.join(', ');

        // Build result item with DOM APIs to prevent XSS
        const resultDiv = document.createElement('div');
        resultDiv.className = 'nearby-result';

        const mainDiv = document.createElement('div');
        mainDiv.className = 'nearby-result-main';
        mainDiv.addEventListener('click', () => flyToNearbyPoi(poi.lng, poi.lat, poi.name));

        const iconSpan = document.createElement('span');
        iconSpan.className = 'result-icon';
        iconSpan.textContent = poi.categoryInfo.icon;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'result-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'result-name';
        nameDiv.textContent = poi.name;

        infoDiv.appendChild(nameDiv);

        if (locationStr) {
            const locationDiv = document.createElement('div');
            locationDiv.className = 'result-location';
            locationDiv.textContent = locationStr;
            infoDiv.appendChild(locationDiv);
        }

        const metaDiv = document.createElement('div');
        metaDiv.className = 'result-meta';

        const distanceSpan = document.createElement('span');
        distanceSpan.className = 'result-distance';
        distanceSpan.textContent = distanceStr;
        metaDiv.appendChild(distanceSpan);

        if (openingHours) {
            const hoursSpan = document.createElement('span');
            hoursSpan.className = 'result-hours';
            hoursSpan.textContent = openingHours;
            metaDiv.appendChild(hoursSpan);
        }

        infoDiv.appendChild(metaDiv);
        mainDiv.appendChild(iconSpan);
        mainDiv.appendChild(infoDiv);

        const directionsBtn = document.createElement('button');
        directionsBtn.className = 'nearby-directions-btn';
        directionsBtn.title = 'Get directions';
        directionsBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>';
        directionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            getDirectionsTo(poi.lng, poi.lat, poi.name);
        });

        resultDiv.appendChild(mainDiv);
        resultDiv.appendChild(directionsBtn);
        listEl.appendChild(resultDiv);
    });

    // Add regular markers to map
    results.slice(0, 50).forEach(poi => {
        addNearbyMarker(poi);
    });
}

function addAdMarker(ad) {
    const el = document.createElement('div');
    el.className = 'ad-marker-container';

    // Build ad marker with DOM APIs to prevent XSS
    const markerDiv = document.createElement('div');
    markerDiv.className = 'ad-marker';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'ad-marker-icon';
    iconDiv.textContent = ad.icon;

    const badgeDiv = document.createElement('div');
    badgeDiv.className = 'ad-marker-badge';
    badgeDiv.textContent = 'Ad';

    markerDiv.appendChild(iconDiv);
    markerDiv.appendChild(badgeDiv);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'ad-marker-label';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'ad-label-name';
    nameDiv.textContent = ad.name;

    const descDiv = document.createElement('div');
    descDiv.className = 'ad-label-description';
    descDiv.textContent = ad.description;

    const promoDiv = document.createElement('div');
    promoDiv.className = 'ad-label-promo';
    promoDiv.innerHTML = 'Highlight Your Business with <a href="https://www.bidbaas.co.za" target="_blank" rel="noopener">Bid Baas</a>';

    const directionsBtn = document.createElement('button');
    directionsBtn.className = 'ad-label-directions';
    directionsBtn.textContent = 'Get Directions';
    directionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        getDirectionsTo(ad.lng, ad.lat, ad.name);
    });

    labelDiv.appendChild(nameDiv);
    labelDiv.appendChild(descDiv);
    labelDiv.appendChild(promoDiv);
    labelDiv.appendChild(directionsBtn);

    el.appendChild(markerDiv);
    el.appendChild(labelDiv);

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([ad.lng, ad.lat])
        .addTo(state.map);

    state.nearby.markers.push(marker);
    console.log('Ad marker added:', ad.name, 'at', ad.lat, ad.lng);
}

function addNearbyMarker(poi) {
    const el = document.createElement('div');
    el.className = 'nearby-marker';
    el.innerHTML = poi.categoryInfo.icon;
    el.style.cssText = `
        font-size: 20px;
        cursor: pointer;
        background: white;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        border: 2px solid ${poi.categoryInfo.color};
    `;

    const marker = new maplibregl.Marker({ element: el })
        .setLngLat([poi.lng, poi.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
            <strong>${poi.name}</strong><br>
            <em>${poi.categoryInfo.label}</em><br>
            ${poi.tags.opening_hours ? `<small>Hours: ${poi.tags.opening_hours}</small><br>` : ''}
            ${poi.tags.phone ? `<small>Phone: ${poi.tags.phone}</small>` : ''}
        `))
        .addTo(state.map);

    state.nearby.markers.push(marker);
}

function flyToNearbyPoi(lng, lat, name) {
    state.map.flyTo({
        center: [lng, lat],
        zoom: 17,
        duration: 1500
    });
}

async function getDirectionsTo(lng, lat, name) {
    if (!state.nearby.center) {
        showWarning('No origin location set');
        return;
    }

    // Clear any existing route
    clearRoute();

    // Build coordinates for routing
    const origin = state.nearby.center;
    const coords = `${origin.lng},${origin.lat};${lng},${lat}`;

    // Show loading indicator on the button that was clicked
    showRouteLoading(true);

    try {
        // Try OSRM first
        const osrmResponse = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
            { signal: AbortSignal.timeout(10000) }
        );

        if (osrmResponse.ok) {
            const data = await osrmResponse.json();
            if (data.code === 'Ok' && data.routes && data.routes.length) {
                const route = data.routes[0];
                displayDirectRoute(route, origin, { lng, lat, name });
                return;
            }
        }
    } catch (err) {
        console.log('OSRM failed, trying fallback...', err.message);
    }

    // Fallback to OpenRouteService
    try {
        const orsResponse = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: [[origin.lng, origin.lat], [lng, lat]] }),
            signal: AbortSignal.timeout(15000)
        });

        if (orsResponse.ok) {
            const orsData = await orsResponse.json();
            if (orsData.features && orsData.features.length) {
                const feature = orsData.features[0];
                const route = {
                    geometry: feature.geometry,
                    distance: feature.properties.summary.distance,
                    duration: feature.properties.summary.duration
                };
                displayDirectRoute(route, origin, { lng, lat, name });
                return;
            }
        }
    } catch (err) {
        console.log('ORS also failed', err.message);
    }

    showWarning('Could not calculate route');
    showRouteLoading(false);
}

function showRouteLoading(loading) {
    const btns = document.querySelectorAll('.nearby-directions-btn');
    btns.forEach(btn => {
        btn.style.opacity = loading ? '0.5' : '1';
        btn.style.pointerEvents = loading ? 'none' : 'auto';
    });
}

function displayDirectRoute(route, origin, destination) {
    showRouteLoading(false);

    // Add route line to map
    if (state.map.getSource('route')) {
        state.map.getSource('route').setData({
            type: 'Feature',
            geometry: route.geometry
        });
    } else {
        state.map.addSource('route', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: route.geometry
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
                'line-color': '#007AFF',
                'line-width': 5,
                'line-opacity': 0.8
            }
        });
    }

    // Add origin marker (green) with popup
    const originEl = document.createElement('div');
    originEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#34C759" stroke="white" stroke-width="2"/></svg>';
    originEl.style.cursor = 'pointer';

    const originPopup = new maplibregl.Popup({
        offset: 25,
        className: 'route-marker-popup origin-popup'
    }).setHTML(`
        <div class="route-popup-content">
            <div class="route-popup-title start">Start Point</div>
            <div class="route-popup-name">${origin.name || 'Your Location'}</div>
            <div class="route-popup-coords">${origin.lat.toFixed(5)}, ${origin.lng.toFixed(5)}</div>
        </div>
    `);

    const originMarker = new maplibregl.Marker({ element: originEl })
        .setLngLat([origin.lng, origin.lat])
        .setPopup(originPopup)
        .addTo(state.map);

    // Add destination marker (red) with popup
    const destEl = document.createElement('div');
    destEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF3B30" stroke="white" stroke-width="2"/></svg>';
    destEl.style.cursor = 'pointer';

    const destPopup = new maplibregl.Popup({
        offset: 25,
        className: 'route-marker-popup destination-popup'
    }).setHTML(`
        <div class="route-popup-content">
            <div class="route-popup-title destination">Destination</div>
            <div class="route-popup-name">${destination.name || 'Unknown'}</div>
            <div class="route-popup-coords">${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}</div>
            <div class="route-popup-address" id="dest-popup-address">
                <span class="address-loading">Loading address...</span>
            </div>
        </div>
    `);

    const destMarker = new maplibregl.Marker({ element: destEl })
        .setLngLat([destination.lng, destination.lat])
        .setPopup(destPopup)
        .addTo(state.map);

    // Show destination popup by default
    destMarker.togglePopup();

    // Reverse geocode destination address
    reverseGeocodeElement(destination.lat, destination.lng, 'dest-popup-address');

    // Store markers for cleanup
    state.routing.markers = [originMarker, destMarker];

    // Add advertisement markers along the route
    addRouteAdMarkers(route.geometry.coordinates);

    // Format distance and duration
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);

    // Show route info popup with share capability
    showRouteInfo(destination.name, distanceKm, durationMin, origin, destination);

    // Fit map to show entire route
    const coordinates = route.geometry.coordinates;
    const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
    }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

    state.map.fitBounds(bounds, { padding: 80 });
}

function showRouteInfo(destName, distanceKm, durationMin, origin, destination) {
    // Remove existing route info if any
    const existing = document.getElementById('route-info-popup');
    if (existing) existing.remove();

    // Store route info for sharing
    state.currentRoute = { origin, destination, destName, distanceKm, durationMin };

    // Escape user-contributed content to prevent XSS
    const safeDestName = escapeHtml(destName);

    const popup = document.createElement('div');
    popup.id = 'route-info-popup';
    popup.className = 'route-info-popup draggable';
    popup.innerHTML = `
        <div class="route-info-header panel-drag-handle">
            <span class="drag-icon">⋮⋮</span>
            <span class="route-info-title">Route to ${safeDestName}</span>
            <button class="route-info-close" onclick="closeRouteInfo()">&times;</button>
        </div>
        <div class="route-info-stats">
            <span class="route-stat"><strong>${distanceKm}</strong> km</span>
            <span class="route-stat"><strong>${durationMin}</strong> min</span>
        </div>
        <div class="route-share-section">
            <span class="share-label">Share:</span>
            <div class="share-buttons">
                <button class="share-btn share-whatsapp" onclick="shareToWhatsApp()" title="WhatsApp">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </button>
                <button class="share-btn share-telegram" onclick="shareToTelegram()" title="Telegram">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </button>
                <button class="share-btn share-twitter" onclick="shareToTwitter()" title="X/Twitter">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </button>
                <button class="share-btn share-facebook" onclick="shareToFacebook()" title="Facebook">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </button>
                <button class="share-btn share-email" onclick="shareToEmail()" title="Email">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </button>
                <button class="share-btn share-copy" onclick="shareRoute()" title="Copy Link">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    // Make route info popup draggable
    const dragHandle = popup.querySelector('.route-info-header');
    makePanelDraggable(popup, dragHandle, 'routeInfoPosition');
}

function shareRoute() {
    if (!state.currentRoute) return;

    const { origin, destination, destName } = state.currentRoute;
    const params = new URLSearchParams();
    params.set('from', `${origin.lng.toFixed(6)},${origin.lat.toFixed(6)}`);
    params.set('to', `${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}`);
    params.set('dest', destName);

    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    // Try to use clipboard API
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showShareConfirmation();
        }).catch(() => {
            fallbackCopyToClipboard(shareUrl);
        });
    } else {
        fallbackCopyToClipboard(shareUrl);
    }
}

function fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showShareConfirmation();
}

function showShareConfirmation() {
    const btn = document.querySelector('.route-share-btn');
    if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Link Copied!';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 2000);
    }
}

function checkForSharedRoute() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    const to = params.get('to');
    const destName = params.get('dest');

    if (from && to) {
        const [fromLng, fromLat] = from.split(',').map(Number);
        const [toLng, toLat] = to.split(',').map(Number);

        if (!isNaN(fromLng) && !isNaN(fromLat) && !isNaN(toLng) && !isNaN(toLat)) {
            // Set up the nearby center for the route
            state.nearby.center = { lng: fromLng, lat: fromLat };

            // Calculate and display the route
            setTimeout(() => {
                getDirectionsTo(toLng, toLat, destName || 'Destination');
            }, 1000); // Wait for map to load
        }
    }
}

function getShareUrl() {
    if (!state.currentRoute) return '';
    const { origin, destination, destName } = state.currentRoute;
    const params = new URLSearchParams();
    params.set('from', `${origin.lng.toFixed(6)},${origin.lat.toFixed(6)}`);
    params.set('to', `${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}`);
    params.set('dest', destName);
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function getShareText() {
    if (!state.currentRoute) return '';
    const { destName, distanceKm, durationMin } = state.currentRoute;
    return `Directions to ${destName} (${distanceKm} km, ${durationMin} min)`;
}

function shareToWhatsApp() {
    const url = getShareUrl();
    const text = getShareText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, '_blank');
}

function shareToTelegram() {
    const url = getShareUrl();
    const text = getShareText();
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function shareToTwitter() {
    const url = getShareUrl();
    const text = getShareText();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
}

function shareToFacebook() {
    const url = getShareUrl();
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
}

function shareToEmail() {
    const url = getShareUrl();
    const { destName, distanceKm, durationMin } = state.currentRoute;
    const subject = `Directions to ${destName}`;
    const body = `Here are directions to ${destName} (${distanceKm} km, approximately ${durationMin} minutes):\n\n${url}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

window.shareRoute = shareRoute;
window.shareToWhatsApp = shareToWhatsApp;
window.shareToTelegram = shareToTelegram;
window.shareToTwitter = shareToTwitter;
window.shareToFacebook = shareToFacebook;
window.shareToEmail = shareToEmail;

function closeRouteInfo() {
    const popup = document.getElementById('route-info-popup');
    if (popup) popup.remove();
    clearRoute();
}

window.closeRouteInfo = closeRouteInfo;

// ============================================
// Hard Refresh - Clear all state and reload
// ============================================
function hardRefresh() {
    // Clear all saved panel positions from localStorage
    const keysToRemove = [
        'timelinePanelPosition', 'placePanelPosition', 'legendPosition',
        'routingPanelPosition', 'nearbyPanelPosition', 'routeInfoPosition',
        'layersPanelPosition', 'collapsedCategories', 'mapStyle'
    ];
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Clear route and nearby markers
    clearRoute();
    clearNearbyMarkers();

    // Close all panels
    document.querySelectorAll('.hidden').forEach(el => el.classList.add('hidden'));
    const routeInfo = document.getElementById('route-info-popup');
    if (routeInfo) routeInfo.remove();

    // Reset URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    // Hard reload the page
    window.location.reload(true);
}

window.hardRefresh = hardRefresh;

// Clear all cached map data (service worker caches)
async function clearMapCache() {
    const btn = document.getElementById('btn-clear-cache');
    const originalContent = btn ? btn.innerHTML : '';

    try {
        // Show loading state
        if (btn) {
            btn.innerHTML = '<span aria-hidden="true">⏳</span>';
            btn.disabled = true;
        }

        // Clear service worker caches
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            const mapCaches = cacheNames.filter(name => name.startsWith('dataacuity-'));

            await Promise.all(mapCaches.map(name => caches.delete(name)));
            console.log('[Cache] Cleared caches:', mapCaches);
        }

        // Clear localStorage map data
        const keysToRemove = [
            'timelinePanelPosition', 'placePanelPosition', 'legendPosition',
            'routingPanelPosition', 'nearbyPanelPosition', 'routeInfoPosition',
            'layersPanelPosition', 'collapsedCategories', 'mapStyle',
            'memories', 'searchHistory'
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Clear sessionStorage
        sessionStorage.clear();

        // Notify service worker to re-cache essentials
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage('cleanup-caches');
        }

        // Show success and reload
        if (btn) {
            btn.innerHTML = '<span aria-hidden="true">✓</span>';
        }
        updateStatsHint('Cache cleared! Reloading...');

        // Reload after short delay to show success
        setTimeout(() => {
            window.location.reload(true);
        }, 500);

    } catch (error) {
        console.error('[Cache] Clear failed:', error);
        if (btn) {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
        updateStatsHint('Failed to clear cache');
    }
}

window.clearMapCache = clearMapCache;

function clearNearbyMarkers() {
    state.nearby.markers.forEach(m => m.remove());
    state.nearby.markers = [];
}

function clearNearby() {
    clearNearbyMarkers();

    if (state.nearby.centerMarker) {
        state.nearby.centerMarker.remove();
        state.nearby.centerMarker = null;
    }

    state.nearby.center = null;
    state.nearby.activeCategories = [];

    // Reset UI
    document.getElementById('nearby-location-text').textContent = 'or click on map';
    document.querySelectorAll('#nearby-categories input').forEach(cb => cb.checked = false);
    document.getElementById('nearby-results').classList.add('hidden');
    document.getElementById('nearby-results-list').innerHTML = '';
    updateNearbyCategoryCount();
    updateNearbySearchButton();
}

// ============================================
// 1. Onboarding System
// ============================================

function initOnboarding() {
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
        setTimeout(() => {
            document.getElementById('onboarding-overlay').classList.remove('hidden');
        }, 800);
    }
}

function closeOnboarding() {
    const dontShowAgain = document.getElementById('dont-show-again').checked;
    if (dontShowAgain) {
        localStorage.setItem('hasSeenOnboarding', 'true');
    }
    document.getElementById('onboarding-overlay').classList.add('hidden');
}

function showOnboarding() {
    document.getElementById('onboarding-overlay').classList.remove('hidden');
}

// ============================================
// 2. Keyboard Shortcuts
// ============================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Handle Ctrl+Shift+R for cache clear (works even in inputs)
        if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
            e.preventDefault();
            clearMapCache();
            return;
        }

        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape') {
                e.target.blur();
            }
            return;
        }

        const slider = document.getElementById('timeline-slider');
        const yearInput = document.getElementById('year-input');

        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                const stepBack = e.shiftKey ? 100 : 10;
                const newYearBack = Math.max(-3000, state.currentYear - stepBack);
                slider.value = newYearBack;
                if (yearInput) yearInput.value = Math.abs(newYearBack);
                updateYear(newYearBack);
                updateEraButtons(newYearBack);
                updateStatsHint(`Traveling to ${formatYear(newYearBack)}`);
                break;

            case 'ArrowRight':
                e.preventDefault();
                const stepForward = e.shiftKey ? 100 : 10;
                const newYearForward = Math.min(2024, state.currentYear + stepForward);
                slider.value = newYearForward;
                if (yearInput) yearInput.value = Math.abs(newYearForward);
                updateYear(newYearForward);
                updateEraButtons(newYearForward);
                updateStatsHint(`Traveling to ${formatYear(newYearForward)}`);
                break;

            case '/':
                e.preventDefault();
                document.getElementById('search-input').focus();
                updateStatsHint('Type to search places...');
                break;

            case '?':
                e.preventDefault();
                toggleShortcutsPanel();
                break;

            case 'Escape':
                closeAllPanels();
                break;

            case 'd':
            case 'D':
                e.preventDefault();
                openRoutingPanel();
                break;

            case 'n':
            case 'N':
                e.preventDefault();
                openNearbyPanel();
                break;

            case 'm':
            case 'M':
                e.preventDefault();
                openMemoriesPanel();
                break;

            case 'l':
            case 'L':
                e.preventDefault();
                document.getElementById('layers-panel').classList.toggle('hidden');
                break;

            case ' ':
                e.preventDefault();
                togglePlay();
                break;
        }
    });
}

function toggleShortcutsPanel() {
    const panel = document.getElementById('shortcuts-panel');
    if (panel) panel.classList.toggle('hidden');
}

function closeAllPanels() {
    const shortcutsPanel = document.getElementById('shortcuts-panel');
    if (shortcutsPanel) shortcutsPanel.classList.add('hidden');

    document.getElementById('place-panel').classList.add('hidden');
    document.getElementById('layers-panel').classList.add('hidden');

    const onboarding = document.getElementById('onboarding-overlay');
    if (onboarding) onboarding.classList.add('hidden');

    const routingPanel = document.getElementById('routing-panel');
    if (routingPanel) routingPanel.classList.add('hidden');

    const nearbyPanel = document.getElementById('nearby-panel');
    if (nearbyPanel) nearbyPanel.classList.add('hidden');

    updateStatsHint('Slide timeline or search to explore');
}

// ============================================
// 3. FAB Panel Openers
// ============================================

function openRoutingPanel() {
    toggleRoutingPanel();
    updateStatsHint('Enter start and destination');
}

function openNearbyPanel() {
    toggleNearbyPanel();
    updateStatsHint('Click map to find nearby places');
}

// ============================================
// 4. Year Input Functions
// ============================================

function initYearInput() {
    const yearInput = document.getElementById('year-input');
    const slider = document.getElementById('timeline-slider');

    if (!yearInput) return;

    yearInput.addEventListener('change', (e) => {
        let value = parseInt(e.target.value);
        if (isNaN(value)) return;

        const bceBtn = document.querySelector('.era-btn[data-era="bce"]');
        const isBCE = bceBtn && bceBtn.classList.contains('active');
        const year = isBCE ? -Math.abs(value) : Math.abs(value);

        const clampedYear = Math.max(-3000, Math.min(2024, year));
        slider.value = clampedYear;
        yearInput.value = Math.abs(clampedYear);
        updateYear(clampedYear);
        updateStatsHint(`Jumped to ${formatYear(clampedYear)}`);
    });

    yearInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    });
}

function toggleEra(era) {
    const bceBtn = document.querySelector('.era-btn[data-era="bce"]');
    const ceBtn = document.querySelector('.era-btn[data-era="ce"]');
    const yearInput = document.getElementById('year-input');
    const slider = document.getElementById('timeline-slider');

    if (!bceBtn || !ceBtn) return;

    if (era === 'bce') {
        bceBtn.classList.add('active');
        ceBtn.classList.remove('active');
    } else {
        ceBtn.classList.add('active');
        bceBtn.classList.remove('active');
    }

    const value = parseInt(yearInput.value) || 0;
    const year = era === 'bce' ? -Math.abs(value) : Math.abs(value);
    const clampedYear = Math.max(-3000, Math.min(2024, year));

    slider.value = clampedYear;
    updateYear(clampedYear);
}

function updateEraButtons(year) {
    const bceBtn = document.querySelector('.era-btn[data-era="bce"]');
    const ceBtn = document.querySelector('.era-btn[data-era="ce"]');
    const yearInput = document.getElementById('year-input');

    if (!bceBtn || !ceBtn || !yearInput) return;

    if (year < 0) {
        bceBtn.classList.add('active');
        ceBtn.classList.remove('active');
        yearInput.value = Math.abs(year);
    } else {
        ceBtn.classList.add('active');
        bceBtn.classList.remove('active');
        yearInput.value = year;
    }
}

// ============================================
// 5. Stats Hint Updates
// ============================================

const statsHints = [
    'Slide timeline or search to explore',
    'Try searching "Constantinople"',
    'Click markers for history',
    'Press ? for shortcuts',
    'Use D for directions',
    'Use N to find nearby places'
];

let currentHintIndex = 0;

function initStatsHints() {
    setInterval(() => {
        if (!state.selectedPlace && !state.routing.active && !state.nearby.active) {
            currentHintIndex = (currentHintIndex + 1) % statsHints.length;
            const hint = document.getElementById('stats-hint');
            if (hint) {
                hint.textContent = statsHints[currentHintIndex];
                hint.classList.remove('active');
            }
        }
    }, 8000);
}

function updateStatsHint(message, isActive = true) {
    const hint = document.getElementById('stats-hint');
    if (hint) {
        hint.textContent = message;
        if (isActive) {
            hint.classList.add('active');
        } else {
            hint.classList.remove('active');
        }
    }

    setTimeout(() => {
        const hint = document.getElementById('stats-hint');
        if (hint && hint.textContent === message) {
            hint.textContent = statsHints[0];
            hint.classList.remove('active');
        }
    }, 5000);
}

// ============================================
// 6. Share Place Functions
// ============================================

function getPlaceShareUrl(placeName, lat, lng) {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('place', encodeURIComponent(placeName));
    params.set('lat', lat.toFixed(4));
    params.set('lng', lng.toFixed(4));
    if (state.currentYear !== 2024) {
        params.set('year', state.currentYear);
    }
    return `${baseUrl}#${params.toString()}`;
}

function sharePlaceToWhatsApp(placeName, lat, lng) {
    const url = getPlaceShareUrl(placeName, lat, lng);
    const text = `Check out ${placeName} on DataAcuity Maps!\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function sharePlaceToTelegram(placeName, lat, lng) {
    const url = getPlaceShareUrl(placeName, lat, lng);
    const text = `Check out ${placeName} on DataAcuity Maps!`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function sharePlaceToTwitter(placeName, lat, lng) {
    const url = getPlaceShareUrl(placeName, lat, lng);
    const text = `Exploring ${placeName} through history on DataAcuity Maps!`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
}

function sharePlaceToFacebook(placeName, lat, lng) {
    const url = getPlaceShareUrl(placeName, lat, lng);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
}

function sharePlaceToEmail(placeName, lat, lng) {
    const url = getPlaceShareUrl(placeName, lat, lng);
    const subject = `${placeName} on DataAcuity Maps`;
    const body = `I found ${placeName} on DataAcuity Maps - check out its history!\n\n${url}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function copyPlaceUrl(placeName, lat, lng) {
    const url = getPlaceShareUrl(placeName, lat, lng);
    navigator.clipboard.writeText(url).then(() => {
        showSuccess('Link copied to clipboard!');
        const btn = document.querySelector('.share-copy-btn');
        if (btn) {
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = 'Copy';
                btn.classList.remove('copied');
            }, 2000);
        }
    }).catch(() => {
        showError('Failed to copy link');
    });
}

// Make new functions globally available
window.closeOnboarding = closeOnboarding;
window.showOnboarding = showOnboarding;
window.toggleShortcutsPanel = toggleShortcutsPanel;
window.toggleEra = toggleEra;
window.openRoutingPanel = openRoutingPanel;
window.openNearbyPanel = openNearbyPanel;
window.sharePlaceToWhatsApp = sharePlaceToWhatsApp;
window.sharePlaceToTelegram = sharePlaceToTelegram;
window.sharePlaceToTwitter = sharePlaceToTwitter;
window.sharePlaceToFacebook = sharePlaceToFacebook;
window.sharePlaceToEmail = sharePlaceToEmail;
window.copyPlaceUrl = copyPlaceUrl;

// Make functions globally available
window.flyToPlace = flyToPlace;
window.setOrientation = setOrientation;
window.cycleOrientation = cycleOrientation;
window.setMapStyle = setMapStyle;
window.toggleRoutingPanel = toggleRoutingPanel;
window.selectWaypoint = selectWaypoint;
window.removeWaypoint = removeWaypoint;
window.calculateRoute = calculateRoute;
window.clearRoute = clearRoute;
window.toggleLegend = toggleLegend;
window.toggleTimeline = toggleTimeline;
window.selectAllCategories = selectAllCategories;
window.selectNoCategories = selectNoCategories;
window.setCategoryFilter = setCategoryFilter;
window.toggleNearbyPanel = toggleNearbyPanel;
window.collapseNearbyPanel = collapseNearbyPanel;
window.toggleNearbyCategory = toggleNearbyCategory;
window.flyToNearbyPoi = flyToNearbyPoi;
window.getDirectionsTo = getDirectionsTo;

// ============================================
// Historical Map Overlays
// ============================================

const HISTORICAL_MAPS_PATH = '/historical-maps/optimized/';
const HISTORICAL_MAPS_THUMBS_PATH = '/historical-maps/thumbs/';

// Historical maps manifest (loaded dynamically)
let historicalMapsManifest = null;
let currentHistoricalOverlay = null;

// Map state for historical overlays
const historicalMapState = {
    enabled: false,
    autoSwitch: true,  // Automatically switch based on timeline
    opacity: 0.7,
    currentMapId: null
};

// Load the historical maps manifest
async function loadHistoricalMapsManifest() {
    try {
        const response = await fetch('/historical-maps/manifest.json');
        if (response.ok) {
            historicalMapsManifest = await response.json();
            console.log('Loaded historical maps manifest:', historicalMapsManifest.maps.length, 'maps');
            return historicalMapsManifest;
        }
    } catch (error) {
        console.error('Error loading historical maps manifest:', error);
    }
    return null;
}

// Get world maps sorted by period
function getWorldMaps() {
    if (!historicalMapsManifest) return [];
    return historicalMapsManifest.maps
        .filter(m => m.region === 'world')
        .sort((a, b) => a.period.start - b.period.start);
}

// Find the best map for a given year
function findMapForYear(year) {
    const worldMaps = getWorldMaps();
    if (worldMaps.length === 0) return null;

    // Find maps where the year falls within the period
    const matchingMaps = worldMaps.filter(m =>
        year >= m.period.start && year <= m.period.end
    );

    if (matchingMaps.length > 0) {
        // Return the most specific (shortest period) matching map
        return matchingMaps.reduce((best, current) => {
            const bestRange = best.period.end - best.period.start;
            const currentRange = current.period.end - current.period.start;
            return currentRange < bestRange ? current : best;
        });
    }

    // If no exact match, find the closest map
    let closestMap = worldMaps[0];
    let closestDistance = Infinity;

    worldMaps.forEach(m => {
        const midPoint = (m.period.start + m.period.end) / 2;
        const distance = Math.abs(midPoint - year);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestMap = m;
        }
    });

    return closestMap;
}

// Add historical map as image overlay
function addHistoricalMapOverlay(mapConfig) {
    if (!state.map || !mapConfig) return;

    // Remove existing overlay
    removeHistoricalMapOverlay();

    const imageUrl = HISTORICAL_MAPS_PATH + mapConfig.file;

    // Define bounds based on map config or default to world
    const bounds = mapConfig.bounds || [[-85, -180], [85, 180]];

    // Add the image source
    state.map.addSource('historical-map-overlay', {
        type: 'image',
        url: imageUrl,
        coordinates: [
            [bounds[0][1], bounds[1][0]], // top-left: [lng, lat]
            [bounds[1][1], bounds[1][0]], // top-right
            [bounds[1][1], bounds[0][0]], // bottom-right
            [bounds[0][1], bounds[0][0]]  // bottom-left
        ]
    });

    // Add the image layer
    state.map.addLayer({
        id: 'historical-map-layer',
        type: 'raster',
        source: 'historical-map-overlay',
        paint: {
            'raster-opacity': historicalMapState.opacity,
            'raster-fade-duration': 300
        }
    }, 'raster-layer'); // Insert below labels if using vector tiles

    historicalMapState.currentMapId = mapConfig.id;
    currentHistoricalOverlay = mapConfig;

    // Update UI
    updateHistoricalMapUI();

    showToast(`Historical map: ${mapConfig.title} (${mapConfig.originalDate || ''})`, 'info', 3000);
}

// Remove historical map overlay
function removeHistoricalMapOverlay() {
    if (!state.map) return;

    try {
        if (state.map.getLayer('historical-map-layer')) {
            state.map.removeLayer('historical-map-layer');
        }
        if (state.map.getSource('historical-map-overlay')) {
            state.map.removeSource('historical-map-overlay');
        }
    } catch (e) {
        console.warn('Error removing historical map overlay:', e);
    }

    historicalMapState.currentMapId = null;
    currentHistoricalOverlay = null;
    updateHistoricalMapUI();
}

// Set opacity for historical map overlay
function setHistoricalMapOpacity(opacity) {
    historicalMapState.opacity = opacity;

    if (state.map && state.map.getLayer('historical-map-layer')) {
        state.map.setPaintProperty('historical-map-layer', 'raster-opacity', opacity);
    }

    // Update slider display
    const opacityValue = document.getElementById('historical-opacity-value');
    if (opacityValue) {
        opacityValue.textContent = Math.round(opacity * 100) + '%';
    }
}

// Toggle historical map overlay
function toggleHistoricalMap(enabled) {
    historicalMapState.enabled = enabled;

    if (enabled) {
        const mapForYear = findMapForYear(state.currentYear);
        if (mapForYear) {
            addHistoricalMapOverlay(mapForYear);
        }
    } else {
        removeHistoricalMapOverlay();
    }

    // Save preference
    localStorage.setItem('historicalMapEnabled', enabled);
}

// Toggle auto-switch feature
function toggleHistoricalAutoSwitch(enabled) {
    historicalMapState.autoSwitch = enabled;
    localStorage.setItem('historicalAutoSwitch', enabled);
}

// Select a specific historical map
function selectHistoricalMap(mapId) {
    if (!historicalMapsManifest) return;

    const mapConfig = historicalMapsManifest.maps.find(m => m.id === mapId);
    if (mapConfig) {
        historicalMapState.autoSwitch = false;
        addHistoricalMapOverlay(mapConfig);

        // Update the auto-switch checkbox
        const autoSwitchCheckbox = document.getElementById('historical-auto-switch');
        if (autoSwitchCheckbox) {
            autoSwitchCheckbox.checked = false;
        }
    }
}

// Update the historical map UI
function updateHistoricalMapUI() {
    const mapSelect = document.getElementById('historical-map-select');
    if (mapSelect && historicalMapState.currentMapId) {
        mapSelect.value = historicalMapState.currentMapId;
    }

    // Update info display
    const mapInfo = document.getElementById('historical-map-info');
    if (mapInfo && currentHistoricalOverlay) {
        mapInfo.innerHTML = `
            <strong>${currentHistoricalOverlay.title}</strong>
            <small>${currentHistoricalOverlay.cartographer || ''} ${currentHistoricalOverlay.originalDate || ''}</small>
        `;
    } else if (mapInfo) {
        mapInfo.innerHTML = '<em>No historical map overlay active</em>';
    }
}

// Initialize historical maps section in layers panel
function initHistoricalMaps() {
    loadHistoricalMapsManifest().then(manifest => {
        if (!manifest) return;

        const layersList = document.getElementById('layers-list');
        if (!layersList) return;

        // Create the historical maps section
        const historicalSection = document.createElement('div');
        historicalSection.className = 'collapsible-section historical-maps-section';
        historicalSection.innerHTML = `
            <div class="section-header" onclick="toggleSection(this)">
                <span class="section-toggle">▼</span>
                <h4>Historical Map Overlays</h4>
            </div>
            <div class="section-content">
                <div class="historical-map-controls">
                    <label class="toggle-label">
                        <input type="checkbox" id="historical-enabled" onchange="toggleHistoricalMap(this.checked)" />
                        <span>Show historical map overlay</span>
                    </label>

                    <label class="toggle-label">
                        <input type="checkbox" id="historical-auto-switch" checked onchange="toggleHistoricalAutoSwitch(this.checked)" />
                        <span>Auto-switch with timeline</span>
                    </label>

                    <div class="opacity-control">
                        <label>Opacity: <span id="historical-opacity-value">70%</span></label>
                        <input type="range" id="historical-opacity" min="0" max="1" step="0.1" value="0.7"
                               oninput="setHistoricalMapOpacity(parseFloat(this.value))" />
                    </div>

                    <div class="map-select-container">
                        <label for="historical-map-select">Select map:</label>
                        <select id="historical-map-select" onchange="selectHistoricalMap(this.value)">
                            <option value="">-- Select a map --</option>
                            ${getWorldMaps().map(m => `
                                <option value="${m.id}">${m.title} (${m.originalDate || formatPeriod(m.period)})</option>
                            `).join('')}
                        </select>
                    </div>

                    <div id="historical-map-info" class="map-info">
                        <em>No historical map overlay active</em>
                    </div>

                    <div class="map-thumbnails">
                        ${getWorldMaps().slice(0, 6).map(m => `
                            <div class="map-thumbnail" onclick="selectHistoricalMap('${m.id}')" title="${m.title}">
                                <img src="${HISTORICAL_MAPS_THUMBS_PATH}${m.file}" alt="${m.title}" loading="lazy" />
                                <span class="thumb-label">${m.originalDate || ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // Insert after the style section
        const styleSection = layersList.querySelector('.style-section');
        if (styleSection) {
            styleSection.after(historicalSection);
        } else {
            layersList.appendChild(historicalSection);
        }

        // Restore saved preferences
        const savedEnabled = localStorage.getItem('historicalMapEnabled') === 'true';
        const savedAutoSwitch = localStorage.getItem('historicalAutoSwitch') !== 'false';

        historicalMapState.autoSwitch = savedAutoSwitch;
        document.getElementById('historical-auto-switch').checked = savedAutoSwitch;

        if (savedEnabled) {
            document.getElementById('historical-enabled').checked = true;
            toggleHistoricalMap(true);
        }
    });
}

// Format period for display
function formatPeriod(period) {
    const start = period.start < 0 ? `${Math.abs(period.start)} BCE` : `${period.start} CE`;
    const end = period.end < 0 ? `${Math.abs(period.end)} BCE` : `${period.end} CE`;
    return `${start} - ${end}`;
}

// Hook into the timeline update to auto-switch maps
const originalUpdateYear = updateYear;
updateYear = function(year) {
    originalUpdateYear(year);

    // Auto-switch historical map if enabled
    if (historicalMapState.enabled && historicalMapState.autoSwitch) {
        const mapForYear = findMapForYear(year);
        if (mapForYear && mapForYear.id !== historicalMapState.currentMapId) {
            addHistoricalMapOverlay(mapForYear);
        }
    }
};

// Initialize historical maps when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for map to be ready, then init historical maps
    const checkMapReady = setInterval(() => {
        if (state.map && state.map.loaded()) {
            clearInterval(checkMapReady);
            initHistoricalMaps();
        }
    }, 100);
});

// Make functions globally available
window.toggleHistoricalMap = toggleHistoricalMap;
window.toggleHistoricalAutoSwitch = toggleHistoricalAutoSwitch;
window.selectHistoricalMap = selectHistoricalMap;
window.setHistoricalMapOpacity = setHistoricalMapOpacity;

// ============================================
// Biblical Journeys Feature
// ============================================

let biblicalJourneysData = null;

const biblicalJourneyState = {
    active: false,
    currentJourney: null,
    routeLayer: null,
    markers: [],
    isPlaying: false,
    playInterval: null,
    currentWaypointIndex: 0,
    animationSpeed: 2000 // ms between waypoints
};

// Load biblical journeys data
async function loadBiblicalJourneys() {
    const result = await fetchJSON('/data/biblical-journeys.json');

    if (result.ok && result.data && result.data.journeys) {
        biblicalJourneysData = result.data;
        console.log('Loaded biblical journeys:', biblicalJourneysData.journeys.length, 'journeys');
        return biblicalJourneysData;
    }
    // Silently fail - biblical journeys feature just won't be available
    return null;
}

// Get journeys by category
function getJourneysByCategory(categoryId) {
    if (!biblicalJourneysData) return [];
    return biblicalJourneysData.journeys.filter(j => j.category === categoryId);
}

// Display a biblical journey on the map
function displayBiblicalJourney(journeyId) {
    if (!biblicalJourneysData || !state.map) return;

    const journey = biblicalJourneysData.journeys.find(j => j.id === journeyId);
    if (!journey) return;

    // Clear existing journey
    clearBiblicalJourney();

    biblicalJourneyState.active = true;
    biblicalJourneyState.currentJourney = journey;

    // Get category color
    const category = biblicalJourneysData.categories.find(c => c.id === journey.category);
    const routeColor = category ? category.color : '#007AFF';

    // Build route coordinates
    const coordinates = journey.waypoints.map(wp => wp.location);

    // Add route line
    state.map.addSource('biblical-route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            }
        }
    });

    state.map.addLayer({
        id: 'biblical-route-line',
        type: 'line',
        source: 'biblical-route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': routeColor,
            'line-width': 4,
            'line-opacity': 0.8,
            'line-dasharray': [2, 1]
        }
    });

    // Add waypoint markers
    journey.waypoints.forEach((waypoint, index) => {
        const el = document.createElement('div');
        el.className = 'biblical-waypoint-marker';
        el.innerHTML = `<span class="waypoint-number">${index + 1}</span>`;
        el.style.backgroundColor = routeColor;

        const popup = new maplibregl.Popup({
            offset: 25,
            closeButton: true,
            maxWidth: '320px'
        }).setHTML(createWaypointPopupHTML(waypoint, journey, index));

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(waypoint.location)
            .setPopup(popup)
            .addTo(state.map);

        biblicalJourneyState.markers.push(marker);
    });

    // Fit map to journey bounds
    const bounds = new maplibregl.LngLatBounds();
    coordinates.forEach(coord => bounds.extend(coord));
    state.map.fitBounds(bounds, { padding: 50, duration: 1000 });

    // Update timeline to journey year
    if (journey.year) {
        const slider = document.getElementById('timeline-slider');
        if (slider) {
            slider.value = journey.year;
            updateYear(journey.year);
        }
    }

    // Update UI
    updateBiblicalJourneyUI();

    showToast(`Displaying: ${journey.name}`, 'info', 3000);
}

// Create popup HTML for waypoint
function createWaypointPopupHTML(waypoint, journey, index) {
    const eventsHTML = waypoint.events
        ? `<ul class="waypoint-events">${waypoint.events.map(e => `<li>${e}</li>`).join('')}</ul>`
        : '';

    return `
        <div class="biblical-popup">
            <div class="popup-header" style="border-left: 4px solid ${getCategoryColor(journey.category)}">
                <span class="waypoint-badge">${index + 1}</span>
                <h3>${waypoint.name}</h3>
            </div>
            <p class="popup-description">${waypoint.description || ''}</p>
            ${eventsHTML}
            <div class="popup-scripture">
                <strong>📖 ${waypoint.scripture || journey.scripture}</strong>
            </div>
            <div class="popup-actions">
                <button class="btn btn-sm" onclick="flyToWaypoint(${index})">Focus</button>
                ${index > 0 ? `<button class="btn btn-sm" onclick="goToPreviousWaypoint()">← Previous</button>` : ''}
                ${index < journey.waypoints.length - 1 ? `<button class="btn btn-sm" onclick="goToNextWaypoint()">Next →</button>` : ''}
            </div>
        </div>
    `;
}

// Get category color
function getCategoryColor(categoryId) {
    if (!biblicalJourneysData) return '#007AFF';
    const category = biblicalJourneysData.categories.find(c => c.id === categoryId);
    return category ? category.color : '#007AFF';
}

// Clear biblical journey from map
function clearBiblicalJourney() {
    // Stop animation if playing
    stopJourneyAnimation();

    // Remove markers
    biblicalJourneyState.markers.forEach(marker => marker.remove());
    biblicalJourneyState.markers = [];

    // Remove route layer and source
    if (state.map) {
        try {
            if (state.map.getLayer('biblical-route-line')) {
                state.map.removeLayer('biblical-route-line');
            }
            if (state.map.getSource('biblical-route')) {
                state.map.removeSource('biblical-route');
            }
        } catch (e) {
            console.warn('Error clearing biblical journey:', e);
        }
    }

    biblicalJourneyState.active = false;
    biblicalJourneyState.currentJourney = null;
    biblicalJourneyState.currentWaypointIndex = 0;

    updateBiblicalJourneyUI();
}

// Fly to specific waypoint
function flyToWaypoint(index) {
    if (!biblicalJourneyState.currentJourney) return;

    const waypoint = biblicalJourneyState.currentJourney.waypoints[index];
    if (!waypoint) return;

    biblicalJourneyState.currentWaypointIndex = index;

    state.map.flyTo({
        center: waypoint.location,
        zoom: 8,
        duration: 1000
    });

    // Open the popup
    if (biblicalJourneyState.markers[index]) {
        biblicalJourneyState.markers[index].togglePopup();
    }
}

// Navigate to next waypoint
function goToNextWaypoint() {
    if (!biblicalJourneyState.currentJourney) return;

    const nextIndex = biblicalJourneyState.currentWaypointIndex + 1;
    if (nextIndex < biblicalJourneyState.currentJourney.waypoints.length) {
        flyToWaypoint(nextIndex);
    }
}

// Navigate to previous waypoint
function goToPreviousWaypoint() {
    if (!biblicalJourneyState.currentJourney) return;

    const prevIndex = biblicalJourneyState.currentWaypointIndex - 1;
    if (prevIndex >= 0) {
        flyToWaypoint(prevIndex);
    }
}

// Play journey animation
function playJourneyAnimation() {
    if (!biblicalJourneyState.currentJourney || biblicalJourneyState.isPlaying) return;

    biblicalJourneyState.isPlaying = true;
    biblicalJourneyState.currentWaypointIndex = 0;

    // Start with first waypoint
    flyToWaypoint(0);

    biblicalJourneyState.playInterval = setInterval(() => {
        const nextIndex = biblicalJourneyState.currentWaypointIndex + 1;

        if (nextIndex < biblicalJourneyState.currentJourney.waypoints.length) {
            flyToWaypoint(nextIndex);
        } else {
            // Journey complete
            stopJourneyAnimation();
            showToast('Journey complete!', 'success', 2000);
        }
    }, biblicalJourneyState.animationSpeed);

    updateBiblicalJourneyUI();
}

// Stop journey animation
function stopJourneyAnimation() {
    if (biblicalJourneyState.playInterval) {
        clearInterval(biblicalJourneyState.playInterval);
        biblicalJourneyState.playInterval = null;
    }
    biblicalJourneyState.isPlaying = false;
    updateBiblicalJourneyUI();
}

// Toggle animation
function toggleJourneyAnimation() {
    if (biblicalJourneyState.isPlaying) {
        stopJourneyAnimation();
    } else {
        playJourneyAnimation();
    }
}

// Set animation speed
function setJourneyAnimationSpeed(speed) {
    biblicalJourneyState.animationSpeed = speed;
    // Restart animation if playing
    if (biblicalJourneyState.isPlaying) {
        stopJourneyAnimation();
        playJourneyAnimation();
    }
}

// Update biblical journey UI
function updateBiblicalJourneyUI() {
    const journeySelect = document.getElementById('biblical-journey-select');
    const playBtn = document.getElementById('journey-play-btn');
    const clearBtn = document.getElementById('journey-clear-btn');
    const infoPanel = document.getElementById('journey-info-panel');

    if (journeySelect && biblicalJourneyState.currentJourney) {
        journeySelect.value = biblicalJourneyState.currentJourney.id;
    }

    if (playBtn) {
        playBtn.textContent = biblicalJourneyState.isPlaying ? '⏸️ Pause' : '▶️ Play';
        playBtn.disabled = !biblicalJourneyState.currentJourney;
    }

    if (clearBtn) {
        clearBtn.disabled = !biblicalJourneyState.currentJourney;
    }

    if (infoPanel && biblicalJourneyState.currentJourney) {
        const journey = biblicalJourneyState.currentJourney;
        infoPanel.innerHTML = `
            <div class="journey-info-content">
                <h4>${journey.name}</h4>
                <p>${journey.description}</p>
                <div class="journey-meta">
                    <span>📖 ${journey.scripture}</span>
                    <span>📍 ${journey.waypoints.length} locations</span>
                </div>
                <div class="journey-progress">
                    <span>Location ${biblicalJourneyState.currentWaypointIndex + 1} of ${journey.waypoints.length}</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${((biblicalJourneyState.currentWaypointIndex + 1) / journey.waypoints.length) * 100}%"></div>
                    </div>
                </div>
            </div>
        `;
    } else if (infoPanel) {
        infoPanel.innerHTML = '<em>Select a journey to display</em>';
    }
}

// Initialize biblical journeys panel
function initBiblicalJourneys() {
    loadBiblicalJourneys().then(data => {
        if (!data) return;

        // Create the biblical journeys floating button
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

        // Create floating button
        const floatingBtn = document.createElement('button');
        floatingBtn.id = 'btn-biblical-journeys';
        floatingBtn.className = 'floating-btn biblical-journeys-btn';
        floatingBtn.innerHTML = '📖';
        floatingBtn.title = 'Biblical Journeys';
        floatingBtn.onclick = toggleBiblicalJourneysPanel;

        // Find existing floating buttons container or create one
        let floatingBtns = document.querySelector('.floating-buttons');
        if (!floatingBtns) {
            floatingBtns = document.createElement('div');
            floatingBtns.className = 'floating-buttons';
            mapContainer.appendChild(floatingBtns);
        }
        floatingBtns.insertBefore(floatingBtn, floatingBtns.firstChild);

        // Create panel
        const panel = document.createElement('aside');
        panel.id = 'biblical-journeys-panel';
        panel.className = 'biblical-journeys-panel hidden';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>📖 Biblical Journeys</h3>
                <button class="panel-close-btn" onclick="toggleBiblicalJourneysPanel()">&times;</button>
            </div>
            <div class="panel-content">
                <div class="journey-categories">
                    ${data.categories.map(cat => `
                        <div class="journey-category">
                            <div class="category-header" onclick="toggleJourneyCategory('${cat.id}')" style="border-left: 4px solid ${cat.color}">
                                <span class="category-toggle">▼</span>
                                <h4>${cat.name}</h4>
                                <span class="category-period">${formatYearRange(cat.period)}</span>
                            </div>
                            <div class="category-journeys" id="category-${cat.id}">
                                ${getJourneysByCategory(cat.id).map(j => `
                                    <button class="journey-btn" onclick="displayBiblicalJourney('${j.id}')" title="${j.description}">
                                        ${j.name}
                                        <span class="journey-scripture">${j.scripture}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="journey-controls">
                    <div id="journey-info-panel" class="journey-info-panel">
                        <em>Select a journey to display</em>
                    </div>
                    <div class="control-buttons">
                        <button id="journey-play-btn" class="btn" onclick="toggleJourneyAnimation()" disabled>▶️ Play</button>
                        <button id="journey-clear-btn" class="btn btn-secondary" onclick="clearBiblicalJourney()" disabled>Clear</button>
                    </div>
                    <div class="speed-control">
                        <label>Speed:</label>
                        <select onchange="setJourneyAnimationSpeed(parseInt(this.value))">
                            <option value="3000">Slow</option>
                            <option value="2000" selected>Normal</option>
                            <option value="1000">Fast</option>
                            <option value="500">Very Fast</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        mapContainer.appendChild(panel);

        console.log('Biblical journeys panel initialized');
    });
}

// Format year range for display
function formatYearRange(period) {
    const start = period.start < 0 ? `${Math.abs(period.start)} BC` : `${period.start} AD`;
    const end = period.end < 0 ? `${Math.abs(period.end)} BC` : `${period.end} AD`;
    return `${start} - ${end}`;
}

// Toggle biblical journeys panel
function toggleBiblicalJourneysPanel() {
    const panel = document.getElementById('biblical-journeys-panel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

// Toggle journey category collapse
function toggleJourneyCategory(categoryId) {
    const content = document.getElementById(`category-${categoryId}`);
    const header = content?.previousElementSibling;
    const toggle = header?.querySelector('.category-toggle');

    if (content) {
        content.classList.toggle('collapsed');
        if (toggle) {
            toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
        }
    }
}

// Initialize biblical journeys when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for map to be ready
    const checkMapReady = setInterval(() => {
        if (state.map && state.map.loaded()) {
            clearInterval(checkMapReady);
            setTimeout(initBiblicalJourneys, 500); // Small delay to ensure other components loaded
        }
    }, 100);
});

// Make functions globally available
window.displayBiblicalJourney = displayBiblicalJourney;
window.clearBiblicalJourney = clearBiblicalJourney;
window.toggleBiblicalJourneysPanel = toggleBiblicalJourneysPanel;
window.toggleJourneyCategory = toggleJourneyCategory;
window.toggleJourneyAnimation = toggleJourneyAnimation;
window.playJourneyAnimation = playJourneyAnimation;
window.stopJourneyAnimation = stopJourneyAnimation;
window.setJourneyAnimationSpeed = setJourneyAnimationSpeed;
window.flyToWaypoint = flyToWaypoint;
window.goToNextWaypoint = goToNextWaypoint;
window.goToPreviousWaypoint = goToPreviousWaypoint;

// ============================================
// Memories Feature
// ============================================

const MEMORY_CATEGORIES = {
    'visited': { name: 'Visited', icon: '📍', color: '#4CAF50' },
    'favorite': { name: 'Favorite', icon: '⭐', color: '#FFC107' },
    'want_to_visit': { name: 'Want to Visit', icon: '🎯', color: '#2196F3' },
    'photo': { name: 'Photo Spot', icon: '📸', color: '#9C27B0' },
    'restaurant': { name: 'Restaurant', icon: '🍽️', color: '#FF5722' },
    'general': { name: 'General', icon: '📌', color: '#607D8B' }
};

function getUserHash() {
    let userHash = localStorage.getItem('dataacuity_user_hash');
    if (!userHash) {
        // Generate a random hash for anonymous user identification
        userHash = 'user_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('dataacuity_user_hash', userHash);
    }
    state.memories.userHash = userHash;
    return userHash;
}

function initMemories() {
    getUserHash();
    createMemoriesPanel();
    loadMemories();
}

function createMemoriesPanel() {
    const mapContainer = document.getElementById('map-container');

    const panel = document.createElement('div');
    panel.id = 'memories-panel';
    panel.className = 'memories-panel hidden draggable';
    panel.innerHTML = `
        <div class="memories-header panel-drag-handle">
            <h3><span class="drag-icon">⋮⋮</span> My Memories</h3>
            <div class="memories-header-controls">
                <button class="memories-collapse-btn" onclick="collapseMemoriesPanel()" title="Collapse/Expand">−</button>
                <button class="panel-close-btn" onclick="toggleMemoriesPanel()">&times;</button>
            </div>
        </div>
        <div class="memories-content">
            <div class="memories-actions">
                <button id="btn-save-memory" class="btn btn-primary btn-sm" onclick="openSaveMemoryDialog()">
                    <span>📍</span> Save Current Location
                </button>
                <button id="btn-refresh-memories" class="btn btn-secondary btn-sm" onclick="loadMemories()">
                    <span>🔄</span> Refresh
                </button>
            </div>
            <div class="memories-stats">
                <span id="memories-count">0</span> memories saved
            </div>
            <div class="memories-list" id="memories-list">
                <div class="memories-empty">
                    <p>No memories yet!</p>
                    <p>Click "Save Current Location" or right-click on the map to save a memory.</p>
                </div>
            </div>
        </div>
    `;

    mapContainer.appendChild(panel);

    // Make panel draggable
    const dragHandle = panel.querySelector('.memories-header');
    makePanelDraggable(panel, dragHandle, 'memoriesPanelPosition');

    // Add context menu for saving memories on map right-click
    if (state.map) {
        state.map.on('contextmenu', (e) => {
            openSaveMemoryDialog(e.lngLat.lng, e.lngLat.lat);
        });
    }
}

function toggleMemoriesPanel() {
    const panel = document.getElementById('memories-panel');
    panel.classList.toggle('hidden');
    state.memories.active = !panel.classList.contains('hidden');

    if (state.memories.active) {
        loadMemories();
        showMemoryMarkers();
    } else {
        hideMemoryMarkers();
    }
}

function collapseMemoriesPanel() {
    const panel = document.getElementById('memories-panel');
    const content = panel.querySelector('.memories-content');
    const btn = panel.querySelector('.memories-collapse-btn');

    content.classList.toggle('collapsed');
    btn.textContent = content.classList.contains('collapsed') ? '+' : '−';
}

function openMemoriesPanel() {
    toggleMemoriesPanel();
    updateStatsHint('View and manage your saved memories');
}

async function loadMemories() {
    const userHash = getUserHash();
    const result = await fetchJSON(`${API_BASE}/memories/mine?user_hash=${encodeURIComponent(userHash)}&limit=100`);

    if (result.ok && result.data) {
        state.memories.items = result.data.memories || [];
        renderMemoriesList();

        if (state.memories.active) {
            showMemoryMarkers();
        }
    }
    // Silently fail if API unavailable - memories will be empty
}

function renderMemoriesList() {
    const listEl = document.getElementById('memories-list');
    const countEl = document.getElementById('memories-count');

    if (!listEl) return;

    countEl.textContent = state.memories.items.length;

    if (state.memories.items.length === 0) {
        listEl.innerHTML = `
            <div class="memories-empty">
                <p>No memories yet!</p>
                <p>Click "Save Current Location" or right-click on the map to save a memory.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = state.memories.items.map(memory => {
        const cat = MEMORY_CATEGORIES[memory.category] || MEMORY_CATEGORIES.general;
        const date = new Date(memory.created_at).toLocaleDateString();
        const note = escapeHtml(memory.note || 'No note');

        return `
            <div class="memory-item" onclick="flyToMemory(${memory.lat}, ${memory.lng})">
                <div class="memory-icon" style="color: ${cat.color}">${cat.icon}</div>
                <div class="memory-details">
                    <div class="memory-note">${note}</div>
                    <div class="memory-meta">
                        <span class="memory-category">${cat.name}</span>
                        <span class="memory-date">${date}</span>
                    </div>
                </div>
                <button class="memory-fly-btn" title="Go to location">🗺️</button>
            </div>
        `;
    }).join('');
}

function showMemoryMarkers() {
    hideMemoryMarkers(); // Clear existing

    state.memories.items.forEach(memory => {
        const cat = MEMORY_CATEGORIES[memory.category] || MEMORY_CATEGORIES.general;

        // Create marker element
        const el = document.createElement('div');
        el.className = 'memory-marker';
        el.innerHTML = cat.icon;
        el.style.cssText = `
            font-size: 24px;
            cursor: pointer;
            filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.3));
        `;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([memory.lng, memory.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
                <div class="memory-popup">
                    <strong>${cat.icon} ${cat.name}</strong>
                    <p>${escapeHtml(memory.note || 'No note')}</p>
                    <small>${new Date(memory.created_at).toLocaleDateString()}</small>
                </div>
            `))
            .addTo(state.map);

        state.memories.markers.push(marker);
    });
}

function hideMemoryMarkers() {
    state.memories.markers.forEach(marker => marker.remove());
    state.memories.markers = [];
}

function flyToMemory(lat, lng) {
    state.map.flyTo({
        center: [lng, lat],
        zoom: 15,
        duration: 1500
    });
}

function openSaveMemoryDialog(lng, lat) {
    // If no coordinates provided, use map center
    if (lng === undefined || lat === undefined) {
        const center = state.map.getCenter();
        lng = center.lng;
        lat = center.lat;
    }

    // Create modal for saving memory
    const existingModal = document.getElementById('save-memory-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'save-memory-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeSaveMemoryModal()"></div>
        <div class="modal-content save-memory-modal-content">
            <button class="close-btn" onclick="closeSaveMemoryModal()">&times;</button>
            <h2>📍 Save Memory</h2>
            <p class="memory-coords">Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}</p>

            <div class="form-group">
                <label for="memory-note">Note (optional)</label>
                <textarea id="memory-note" rows="3" placeholder="What makes this place special?"></textarea>
            </div>

            <div class="form-group">
                <label>Category</label>
                <div class="memory-category-grid">
                    ${Object.entries(MEMORY_CATEGORIES).map(([key, cat]) => `
                        <label class="memory-category-option">
                            <input type="radio" name="memory-category" value="${key}" ${key === 'visited' ? 'checked' : ''}>
                            <span class="category-label" style="border-color: ${cat.color}">
                                ${cat.icon} ${cat.name}
                            </span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeSaveMemoryModal()">Cancel</button>
                <button class="btn btn-primary" onclick="saveMemory(${lng}, ${lat})">Save Memory</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Focus the note textarea
    setTimeout(() => document.getElementById('memory-note')?.focus(), 100);
}

function closeSaveMemoryModal() {
    const modal = document.getElementById('save-memory-modal');
    if (modal) modal.remove();
}

async function saveMemory(lng, lat) {
    const userHash = getUserHash();
    const note = document.getElementById('memory-note')?.value || '';
    const category = document.querySelector('input[name="memory-category"]:checked')?.value || 'general';

    try {
        const response = await fetch(
            `${API_BASE}/memories/save?lat=${lat}&lng=${lng}&user_hash=${encodeURIComponent(userHash)}&category=${category}` +
            (note ? `&note=${encodeURIComponent(note)}` : ''),
            { method: 'POST' }
        );

        if (response.ok) {
            const data = await response.json();
            showToast('Memory saved! 📍', 'success');
            closeSaveMemoryModal();

            // Reload memories and show panel
            await loadMemories();
            if (!state.memories.active) {
                toggleMemoriesPanel();
            }
        } else {
            showToast('Failed to save memory', 'error');
        }
    } catch (error) {
        console.error('Error saving memory:', error);
        showToast('Error saving memory', 'error');
    }
}

// Export memories functions
window.toggleMemoriesPanel = toggleMemoriesPanel;
window.collapseMemoriesPanel = collapseMemoriesPanel;
window.openMemoriesPanel = openMemoriesPanel;
window.loadMemories = loadMemories;
window.flyToMemory = flyToMemory;
window.openSaveMemoryDialog = openSaveMemoryDialog;
window.closeSaveMemoryModal = closeSaveMemoryModal;
window.saveMemory = saveMemory;

// ============================================
// Voice Navigation (TTS)
// ============================================

const voiceState = {
    speaking: false,
    currentUtterance: null,
    instructionQueue: [],
    currentIndex: 0,
    synthesis: window.speechSynthesis
};

// Check if TTS is supported
function isTTSSupported() {
    return 'speechSynthesis' in window;
}

// Get themed instruction from API
async function getThemedInstruction(instruction, style) {
    try {
        const response = await fetch(
            `${API_BASE}/navigation/instruction?instruction=${encodeURIComponent(instruction)}&style=${style}`
        );
        if (response.ok) {
            const data = await response.json();
            return data.themed_instruction || instruction;
        }
    } catch (error) {
        console.error('Error getting themed instruction:', error);
    }
    return instruction;
}

// Speak text using Web Speech API
function speak(text, onEnd) {
    if (!isTTSSupported()) {
        showToast('Voice navigation not supported in this browser', 'warning');
        return;
    }

    // Cancel any ongoing speech
    voiceState.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Configure voice settings
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to use a good voice
    const voices = voiceState.synthesis.getVoices();
    const preferredVoice = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha'))
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
        voiceState.speaking = false;
        if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
        console.error('Speech error:', e);
        voiceState.speaking = false;
    };

    voiceState.speaking = true;
    voiceState.currentUtterance = utterance;
    voiceState.synthesis.speak(utterance);
}

// Play all directions
async function playDirections() {
    if (!isTTSSupported()) {
        showToast('Voice navigation not supported in this browser', 'warning');
        return;
    }

    const routeSteps = document.querySelectorAll('.route-step');
    if (routeSteps.length === 0) {
        showToast('Calculate a route first', 'info');
        return;
    }

    const style = document.getElementById('voice-style')?.value || 'default';

    // Collect all instructions
    voiceState.instructionQueue = [];
    for (const step of routeSteps) {
        const instruction = step.querySelector('.step-instruction')?.textContent || step.textContent;
        if (instruction) {
            const themedInstruction = await getThemedInstruction(instruction.trim(), style);
            voiceState.instructionQueue.push(themedInstruction);
        }
    }

    if (voiceState.instructionQueue.length === 0) {
        showToast('No directions to play', 'info');
        return;
    }

    // Show/hide buttons
    document.getElementById('btn-play-directions')?.classList.add('hidden');
    document.getElementById('btn-stop-directions')?.classList.remove('hidden');

    // Start speaking
    voiceState.currentIndex = 0;
    speakNextInstruction();
}

function speakNextInstruction() {
    if (voiceState.currentIndex >= voiceState.instructionQueue.length) {
        // Done with all instructions
        stopDirections();
        showToast('Directions complete!', 'success');
        return;
    }

    const instruction = voiceState.instructionQueue[voiceState.currentIndex];

    // Highlight current step
    const steps = document.querySelectorAll('.route-step');
    steps.forEach((step, i) => {
        step.classList.toggle('speaking', i === voiceState.currentIndex);
    });

    speak(instruction, () => {
        voiceState.currentIndex++;
        // Small delay between instructions
        setTimeout(speakNextInstruction, 500);
    });
}

function stopDirections() {
    voiceState.synthesis.cancel();
    voiceState.speaking = false;
    voiceState.instructionQueue = [];
    voiceState.currentIndex = 0;

    // Show/hide buttons
    document.getElementById('btn-play-directions')?.classList.remove('hidden');
    document.getElementById('btn-stop-directions')?.classList.add('hidden');

    // Remove highlighting
    document.querySelectorAll('.route-step').forEach(step => {
        step.classList.remove('speaking');
    });
}

// Speak a single instruction (for step-by-step navigation)
async function speakInstruction(instruction) {
    const style = document.getElementById('voice-style')?.value || 'default';
    const themed = await getThemedInstruction(instruction, style);
    speak(themed);
}

// Initialize voices (they load asynchronously)
if (isTTSSupported()) {
    // Voices might not be loaded immediately
    if (voiceState.synthesis.getVoices().length === 0) {
        voiceState.synthesis.addEventListener('voiceschanged', () => {
            console.log('TTS voices loaded:', voiceState.synthesis.getVoices().length);
        });
    }
}

// Export voice functions
window.playDirections = playDirections;
window.stopDirections = stopDirections;
window.speakInstruction = speakInstruction;

// ============================================
// Leaderboard & User Profile Panel
// ============================================

function initLeaderboard() {
    // Add leaderboard button to header
    const headerRight = document.querySelector('.header-right');
    const leaderboardBtn = document.createElement('button');
    leaderboardBtn.id = 'btn-leaderboard';
    leaderboardBtn.className = 'btn btn-icon';
    leaderboardBtn.title = 'Leaderboard & Profile';
    leaderboardBtn.innerHTML = '<span>🏆</span>';
    headerRight.insertBefore(leaderboardBtn, headerRight.firstChild);

    leaderboardBtn.addEventListener('click', toggleLeaderboardPanel);

    // Create leaderboard panel
    createLeaderboardPanel();
}

function createLeaderboardPanel() {
    const mapContainer = document.getElementById('map-container');

    const panel = document.createElement('div');
    panel.id = 'leaderboard-panel';
    panel.className = 'leaderboard-panel hidden draggable';
    panel.innerHTML = `
        <div class="leaderboard-header panel-drag-handle">
            <h3><span class="drag-icon">⋮⋮</span> 🏆 Leaderboard</h3>
            <button class="panel-close-btn" onclick="toggleLeaderboardPanel()">&times;</button>
        </div>
        <div class="leaderboard-content">
            <div class="leaderboard-tabs">
                <button class="lb-tab active" data-tab="leaderboard" onclick="switchLeaderboardTab('leaderboard')">Top Contributors</button>
                <button class="lb-tab" data-tab="profile" onclick="switchLeaderboardTab('profile')">My Profile</button>
            </div>
            <div id="leaderboard-list" class="leaderboard-list">
                <p class="leaderboard-loading">Loading leaderboard...</p>
            </div>
            <div id="profile-view" class="profile-view hidden">
                <p class="profile-loading">Loading profile...</p>
            </div>
            <p class="tagme-notice">
                <small>Earn points via the <strong>TagMe</strong> app</small>
            </p>
        </div>
    `;

    mapContainer.appendChild(panel);

    // Make panel draggable
    const dragHandle = panel.querySelector('.leaderboard-header');
    makePanelDraggable(panel, dragHandle, 'leaderboardPanelPosition');
}

function toggleLeaderboardPanel() {
    const panel = document.getElementById('leaderboard-panel');
    const isHidden = panel.classList.toggle('hidden');

    if (!isHidden) {
        loadLeaderboard();
    }
}

function switchLeaderboardTab(tab) {
    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.lb-tab[data-tab="${tab}"]`)?.classList.add('active');

    const leaderboardList = document.getElementById('leaderboard-list');
    const profileView = document.getElementById('profile-view');

    if (tab === 'leaderboard') {
        leaderboardList.classList.remove('hidden');
        profileView.classList.add('hidden');
        loadLeaderboard();
    } else {
        leaderboardList.classList.add('hidden');
        profileView.classList.remove('hidden');
        loadUserProfile();
    }
}

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = '<p class="leaderboard-loading">Loading leaderboard...</p>';

    try {
        const resp = await fetch(`${API_BASE}/leaderboard?limit=20`);
        if (!resp.ok) {
            container.innerHTML = '<p class="leaderboard-error">Could not load leaderboard</p>';
            return;
        }

        const data = await resp.json();
        const leaders = data.leaders || [];

        if (leaders.length === 0) {
            container.innerHTML = '<p class="no-leaders">No contributors yet. Be the first!</p>';
            return;
        }

        // Level badges
        const levelBadges = ['🌱', '🧭', '🗺️', '⚔️', '🏆', '👑'];

        container.innerHTML = leaders.map((leader, i) => {
            const rank = i + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const badge = levelBadges[Math.min(leader.level - 1, 5)] || '🌱';

            return `
                <div class="leader-item ${rankClass}">
                    <span class="leader-rank">${rankIcon}</span>
                    <div class="leader-info">
                        <span class="leader-badge">${badge}</span>
                        <span class="leader-name">Contributor ${leader.device_id_hash?.slice(0, 6) || 'Anon'}</span>
                    </div>
                    <div class="leader-stats">
                        <span class="leader-points">${leader.total_points.toLocaleString()} pts</span>
                        <span class="leader-level">Lvl ${leader.level}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error('Failed to load leaderboard:', e);
        container.innerHTML = '<p class="leaderboard-error">Could not load leaderboard</p>';
    }
}

async function loadUserProfile() {
    const container = document.getElementById('profile-view');
    container.innerHTML = '<p class="profile-loading">Loading your profile...</p>';

    const userHash = getUserHash();

    try {
        const resp = await fetch(`${API_BASE}/user/profile?device_hash=${encodeURIComponent(userHash)}`);
        if (!resp.ok) {
            container.innerHTML = '<p class="profile-error">Could not load profile</p>';
            return;
        }

        const profile = await resp.json();

        container.innerHTML = `
            <div class="profile-card">
                <div class="profile-level">
                    <span class="level-badge">${profile.level_badge}</span>
                    <div class="level-info">
                        <span class="level-name">${profile.level_name}</span>
                        <span class="level-number">Level ${profile.level}</span>
                    </div>
                </div>
                <div class="profile-points">
                    <span class="points-value">${profile.total_points.toLocaleString()}</span>
                    <span class="points-label">Total Points</span>
                </div>
                <div class="profile-stats-grid">
                    <div class="profile-stat">
                        <span class="stat-icon">📍</span>
                        <span class="stat-value">${profile.reports_submitted}</span>
                        <span class="stat-label">Reports</span>
                    </div>
                    <div class="profile-stat">
                        <span class="stat-icon">✓</span>
                        <span class="stat-value">${profile.reports_verified}</span>
                        <span class="stat-label">Verified</span>
                    </div>
                    <div class="profile-stat">
                        <span class="stat-icon">⭐</span>
                        <span class="stat-value">${profile.reviews_submitted}</span>
                        <span class="stat-label">Reviews</span>
                    </div>
                    <div class="profile-stat">
                        <span class="stat-icon">🚗</span>
                        <span class="stat-value">${profile.km_driven}</span>
                        <span class="stat-label">km Driven</span>
                    </div>
                </div>
            </div>
        `;

    } catch (e) {
        console.error('Failed to load profile:', e);
        container.innerHTML = '<p class="profile-error">Could not load profile</p>';
    }
}

window.toggleLeaderboardPanel = toggleLeaderboardPanel;
window.switchLeaderboardTab = switchLeaderboardTab;
