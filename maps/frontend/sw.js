// Data Acuity Maps Service Worker
// Version: 2.0.0 - Mobile-first Waze-like UX

const CACHE_NAME = 'dataacuity-maps-v22';
const TILE_CACHE_NAME = 'dataacuity-tiles-v1';
const API_CACHE_NAME = 'dataacuity-api-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/maps.css',
  '/js/maps.min.js',
  '/manifest.json',
  '/favicon.png',
  '/favicon.svg',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name.startsWith('dataacuity-') &&
                   name !== CACHE_NAME &&
                   name !== TILE_CACHE_NAME &&
                   name !== API_CACHE_NAME;
          })
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Handle offline tile requests from IndexedDB
  if (url.pathname.startsWith('/offline-tile/')) {
    event.respondWith(serveOfflineTile(url.pathname));
    return;
  }

  // Handle map tiles - cache with network-first, long expiry
  if (isTileRequest(url)) {
    event.respondWith(networkFirstTiles(event.request));
    return;
  }

  // Handle API requests - network-first with short cache
  if (isApiRequest(url)) {
    event.respondWith(networkFirstApi(event.request));
    return;
  }

  // Handle static assets - cache-first
  event.respondWith(cacheFirst(event.request));
});

// Serve tiles from IndexedDB for offline use
async function serveOfflineTile(pathname) {
  // Extract tile key from pathname: /offline-tile/z/x/y
  const tileKey = pathname.replace('/offline-tile/', '');

  try {
    const db = await openOfflineDB();
    const tx = db.transaction('tiles', 'readonly');
    const store = tx.objectStore('tiles');
    const request = store.get(tileKey);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        if (request.result && request.result.data) {
          resolve(new Response(request.result.data, {
            headers: { 'Content-Type': 'image/png' }
          }));
        } else {
          // Return transparent tile if not found
          resolve(new Response(null, { status: 204 }));
        }
      };
      request.onerror = () => {
        resolve(new Response(null, { status: 204 }));
      };
    });
  } catch (e) {
    return new Response(null, { status: 204 });
  }
}

// Open IndexedDB in service worker
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dataacuity-maps-offline', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Check if request is for map tiles
function isTileRequest(url) {
  return url.pathname.includes('/tiles/') ||
         url.hostname.includes('tile') ||
         url.pathname.endsWith('.pbf') ||
         url.pathname.endsWith('.mvt') ||
         url.pathname.match(/\/\d+\/\d+\/\d+\.(png|jpg|webp|pbf)$/);
}

// Check if request is for API
function isApiRequest(url) {
  return url.pathname.startsWith('/api/') ||
         url.hostname.includes('api.');
}

// Cache-first strategy for static assets
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline page if available
    const offlinePage = await caches.match('/');
    if (offlinePage) return offlinePage;

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network-first strategy for tiles with cache fallback
async function networkFirstTiles(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(TILE_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return transparent tile placeholder
    return new Response(null, {
      status: 204,
      statusText: 'No Content'
    });
  }
}

// Network-first strategy for API with short cache
async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      // Return cached response with stale indicator
      const headers = new Headers(cached.headers);
      headers.set('X-Cache-Status', 'stale');
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: headers
      });
    }

    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'Network unavailable and no cached data'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-memories') {
    event.waitUntil(syncMemories());
  }
});

// Sync saved memories when back online
async function syncMemories() {
  // Get pending memories from IndexedDB and sync
  // This would integrate with the memories feature
  console.log('[SW] Syncing memories...');
}

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    },
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data.url;

      // Focus existing window or open new one
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Periodic cache cleanup
self.addEventListener('message', (event) => {
  if (event.data === 'cleanup-caches') {
    event.waitUntil(cleanupCaches());
  }
});

async function cleanupCaches() {
  // Limit tile cache to ~50MB
  const tileCache = await caches.open(TILE_CACHE_NAME);
  const tileKeys = await tileCache.keys();

  if (tileKeys.length > 1000) {
    console.log('[SW] Cleaning up tile cache...');
    // Delete oldest 20% of tiles
    const toDelete = tileKeys.slice(0, Math.floor(tileKeys.length * 0.2));
    await Promise.all(toDelete.map(key => tileCache.delete(key)));
  }

  // Clear API cache older than 1 hour
  const apiCache = await caches.open(API_CACHE_NAME);
  const apiKeys = await apiCache.keys();

  // API responses are short-lived, clear all periodically
  if (apiKeys.length > 100) {
    console.log('[SW] Cleaning up API cache...');
    await Promise.all(apiKeys.slice(0, 50).map(key => apiCache.delete(key)));
  }
}
