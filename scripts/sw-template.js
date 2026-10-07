// Ferroprint service worker. It keeps the app, the fonts and the cloud icons, so Ferroprint opens offline.
// The build writes the version and the file list. See scripts/service-worker.mjs.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'ferroprint-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// A new version removes the files of the old versions.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ferroprint-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // A page load tries the network first, so a new version arrives at once. Offline, the kept page opens.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
          return res;
        })
        .catch(() => caches.match('./', { ignoreVary: true }))
    );
    return;
  }
  // Other files come from the cache. A file that is not in the cache yet goes into it after the download.
  // The cache holds only static files from this site, so a Vary header from the server does not apply.
  e.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
