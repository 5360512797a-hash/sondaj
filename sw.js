// Çevrimdışı önbellek. Uygulamayı güncellediğinde VERSION değerini artır.
const VERSION = 'sondaj-v6';
const FILES = ['./', './index.html', './app.js', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './xlsx.full.min.js', './pdf.min.js', './pdf.worker.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Önce ağdan dene (güncel sürüm), ağ yoksa önbellekten aç.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
