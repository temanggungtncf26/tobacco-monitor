// ============================================================
// SERVICE WORKER - Tobacco Monitor PWA v2
// Fokus: Cache UI shell (HTML/CSS/JS statis)
// Data API di-cache oleh IndexedDB di app (OfflineDB)
// ============================================================

const CACHE_VERSION = 'tobacco-monitor-v2';
const GAS_ORIGIN    = 'script.google.com';

const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// ---- INSTALL ----
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Gagal precache:', url, err);
          });
        })
      );
    }).then(function() { return self.skipWaiting(); })
  );
});

// ---- ACTIVATE: hapus cache lama ----
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_VERSION; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ---- FETCH ----
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // 1. API GAS -> langsung ke network, IndexedDB di app yang handle offline
  if (url.hostname.includes(GAS_ORIGIN)) return;

  // 2. Non-GET -> jangan di-intercept
  if (event.request.method !== 'GET') return;

  // 3. Navigasi -> index.html dari cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(function(cached) {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // 4. Aset statis -> Cache First + update di background
  event.respondWith(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        var networkFetch = fetch(event.request).then(function(res) {
          if (res && res.status === 200) cache.put(event.request, res.clone());
          return res;
        }).catch(function() { return null; });
        return cached || networkFetch;
      });
    })
  );
});

// ---- Message: force update ----
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
