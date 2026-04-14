// ============================================================
// SERVICE WORKER - Tobacco Monitor PWA
// Versi: 1.0.0
// Strategi:
//   - Aset statis (HTML, CSS, JS CDN) → Cache First
//   - API calls ke GAS (script.google.com) → Network First
//   - Offline fallback untuk UI shell
// ============================================================

const CACHE_VERSION = 'tobacco-monitor-v1';
const GAS_ORIGIN    = 'script.google.com';

// Daftar aset yang di-precache saat install (App Shell)
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  // Bootstrap CSS
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  // Bootstrap JS
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  // Font Awesome
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  // SweetAlert2
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  // XLSX
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  // html2pdf
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// ---- INSTALL: Precache App Shell ----
self.addEventListener('install', function(event) {
  console.log('[SW] Installing version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function(cache) {
        // addAll akan gagal semua jika 1 URL error, gunakan individual add agar lebih resilient
        return Promise.allSettled(
          PRECACHE_ASSETS.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Failed to precache:', url, err);
            });
          })
        );
      })
      .then(function() {
        console.log('[SW] Precache complete');
        return self.skipWaiting(); // Aktifkan SW baru tanpa menunggu tab ditutup
      })
  );
});

// ---- ACTIVATE: Hapus cache lama ----
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) { return name !== CACHE_VERSION; })
            .map(function(name) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(function() {
        return self.clients.claim(); // Ambil kendali semua tab yang terbuka
      })
  );
});

// ---- FETCH: Strategi per tipe request ----
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // 1. API calls ke Google Apps Script → Network First
  //    Jika offline, kembalikan pesan JSON error agar app tidak crash
  if (url.hostname.includes(GAS_ORIGIN)) {
    event.respondWith(networkFirstForAPI(event.request));
    return;
  }

  // 2. Navigasi (buka app) → Cache First, fallback ke index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html')
        .then(function(cached) {
          return cached || fetch(event.request);
        })
    );
    return;
  }

  // 3. Semua resource statis → Cache First, update cache di background
  if (event.request.method === 'GET') {
    event.respondWith(cacheFirstWithUpdate(event.request));
    return;
  }
});

// ---- Helper: Network First untuk API ----
function networkFirstForAPI(request) {
  return fetch(request)
    .catch(function() {
      // Offline: kembalikan JSON error agar .catch() di app bisa menanganinya
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Tidak ada koneksi internet. Data tidak dapat diperbarui.',
          offline: true
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });
}

// ---- Helper: Cache First dengan stale-while-revalidate ----
function cacheFirstWithUpdate(request) {
  return caches.open(CACHE_VERSION).then(function(cache) {
    return cache.match(request).then(function(cached) {
      // Fetch di background untuk update cache (stale-while-revalidate)
      var fetchPromise = fetch(request)
        .then(function(networkResponse) {
          // Hanya cache response yang valid (status 200, bukan opaque cross-origin)
          if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(function() {
          // Gagal fetch & tidak ada cache → kembalikan null (browser handle)
          return null;
        });

      // Kembalikan cache jika ada, jika tidak tunggu network
      return cached || fetchPromise;
    });
  });
}

// ---- Message handler: force update dari app ----
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
