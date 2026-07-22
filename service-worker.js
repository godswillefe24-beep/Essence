const CACHE_NAME = 'essence-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json',
  '/posts/post1.html',
  '/posts/post2.html',
  '/posts/post3.html',
  '/posts/post4.html',
  '/posts/post5.html',
  '/posts/post6.html',
  '/posts/post7.html',
  '/posts/post8.html',
  '/posts/post9.html',
  '/posts/post10.html',
  '/posts/post11.html',
  '/posts/post12.html',
  '/posts/post13.html',
  '/posts/post14.html',
  '/posts/post15.html',
  '/posts/post16.html'
];

// Install event - cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-HTTP(S) requests (e.g., chrome-extension://, blob:, etc.)
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  // Skip API calls - always try network first
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => response)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request)
        .then(response => {
          // Only cache successful responses with valid types
          if (!response || response.status !== 200 || response.type === 'error' || response.type === 'opaque') {
            return response;
          }
          
          // Skip caching certain content types
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('chrome-extension') || response.url.includes('chrome-extension')) {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            try {
              cache.put(event.request, responseToCache);
            } catch (error) {
              // Silently ignore caching errors
              console.debug('Cache write error:', error);
            }
          });
          return response;
        })
        .catch(() => {
          // Return offline page if available
          return caches.match(event.request);
        });
    })
  );
});

// Background sync for offline actions (future feature)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-comments') {
    event.waitUntil(syncComments());
  }
  
});

async function syncComments() {
  try {
    // Sync pending comments when connection restored
    console.log('Syncing comments...');
  } catch (error) {
    console.log('Sync failed:', error);
  }
}
