// sw.js — app shell offline chalane ke liye. Gemini ki requests ko haath nahi lagata.
const CACHE = 'roshni-lite-v1';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/app.js', 'js/store.js', 'js/context.js', 'js/gemini.js', 'js/offline.js', 'js/timer.js', 'js/icons.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Gemini wagairah seedha network par

  // Pehle network (taake update milti rahe), na ho to cache.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
