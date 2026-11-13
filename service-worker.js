const CACHE_PREFIX = 'gyoseishoshi-pass-';
const CACHE = `${CACHE_PREFIX}v1.3.0-app-1`;
const ASSETS = ['./', './index.html', './styles.css', './legal.css', './data.js', './reinforcement-v0.3.0.js', './administrative-focus-v0.4.0.js', './administrative-trend-v0.5.0.js', './mega-bank-v1.0.0.js', './app.js', './monetization-config.js', './monetization.js', './privacy.html', './terms.html', './contact.html', './sources.html', './manifest.webmanifest', './icons/app-icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.headers.has('range')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
