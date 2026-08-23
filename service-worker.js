const CACHE_NAME = 'essence-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/enhancements.js',
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
  '/posts/post16.html',
  '/posts/post17.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))
    ))
  );
  self.clients.claim();
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || caches.match('/index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/index.html');
  }
}

self.addEventListener('fetch', (event) => {
  if (!['http:', 'https:'].includes(new URL(event.request.url).protocol)) return;

  // API responses should be fresh, but still remain usable offline when a
  // previous response is available.
  if (new URL(event.request.url).pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Navigation responses are network-first so deployments are not hidden by
  // an indefinitely stale cached HTML page.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
