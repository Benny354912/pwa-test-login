// Service Worker für EasyLogin PWA

const CACHE_NAME = 'easylogin-v1';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.js',
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'
];

// Installation
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache.filter(url => !url.includes('http'))).catch(() => {
                    // Ignore errors for external URLs during install
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activation
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Network first, then cache
self.addEventListener('fetch', (event) => {
    // Don't cache external API calls
    if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
        return event.respondWith(fetch(event.request));
    }
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }
                
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then((response) => {
                    return response || new Response('Offline - Ressource nicht verfügbar', { status: 503 });
                });
            })
    );
});

// Background Sync
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-logins') {
        event.waitUntil(syncLogins());
    }
});

async function syncLogins() {
    console.log('🔄 Syncing logins...');
    // Implement sync logic if needed
}

// Push Notifications
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    const options = {
        body: event.data.text(),
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%231F3A93" width="192" height="192"/><path fill="white" d="M96 40c-9.94 0-18 8.06-18 18s8.06 18 18 18 18-8.06 18-18-8.06-18-18-18zm0 36c-9.94 0-18 8.06-18 18s8.06 18 18 18 18-8.06 18-18-8.06-18-18-18z"/></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle fill="%231F3A93" cx="48" cy="48" r="48"/><path fill="white" d="M48 25c-6 0-10 4-10 10s4 10 10 10 10-4 10-10-4-10-10-10zm0 22c-6 0-10 4-10 10s4 10 10 10 10-4 10-10-4-10-10-10z"/></svg>'
    };
    
    event.waitUntil(self.registration.showNotification('EasyLogin', options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
