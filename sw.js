// JPmap service worker — offline shell + photo caching
// Bump the version whenever files are updated so clients pick up the new cache.
const CACHE = 'jpmap-v1';

const SHELL = [
  '.',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/config.js',
  'js/helpers.js',
  'manifest.json',
  'apple-touch-icon.png',
  'icon-512.png',
  'favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;  // let Maps/Firebase/CDN pass through

  // Photos: immutable filenames → cache-first
  if (url.pathname.includes('/photos/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // App shell: network-first (updates apply promptly), cache fallback when offline
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() =>
      caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
    )
  );
});
