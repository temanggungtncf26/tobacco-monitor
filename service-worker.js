// ============================================================
// SERVICE WORKER - Tobacco Monitor PWA v3
// Tambahan: Background Sync event untuk proses antrian offline
// ============================================================

const CACHE_VERSION = 'tobacco-monitor-v3';
const GAS_ORIGIN    = 'script.google.com';
const GAS_API_URL   = 'https://script.google.com/macros/s/AKfycbwU5c4NrCDne4WgAfQj98ykaLaMiU6JqLct3v0yU4ASBBE_4Z4x7hLZ3MxrywusSNO8AQ/exec';

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

// ---- ACTIVATE ----
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
  if (url.hostname.includes(GAS_ORIGIN)) return; // Biarkan app handle GAS
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(function(cached) {
        return cached || fetch(event.request);
      })
    );
    return;
  }

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

// ---- BACKGROUND SYNC ----
// Dipanggil browser otomatis saat koneksi kembali (jika app tidak terbuka)
self.addEventListener('sync', function(event) {
  if (event.tag === 'tm-sync-queue') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(_processSyncQueueFromSW());
  }
});

function _processSyncQueueFromSW() {
  // Buka IndexedDB langsung dari SW dan proses antrian
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('TobaccoMonitorDB', 2);
    req.onsuccess = function(e) {
      var db    = e.target.result;
      var tx    = db.transaction('sync_queue', 'readonly');
      var store = tx.objectStore('sync_queue');
      var getAll = store.getAll();

      getAll.onsuccess = function(ev) {
        var queue = ev.target.result || [];
        if (queue.length === 0) { resolve(); return; }

        var chain = Promise.resolve();
        queue.forEach(function(item) {
          chain = chain.then(function() {
            return fetch(GAS_API_URL, {
              method : 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body   : JSON.stringify({ action: item.funcName, args: item.args })
            })
            .then(function(res) { return res.json(); })
            .then(function(result) {
              if (result && result.success) {
                // Hapus dari antrian
                var delTx = db.transaction('sync_queue', 'readwrite');
                delTx.objectStore('sync_queue').delete(item.id);
                console.log('[SW] Sync sukses item #' + item.id);
              }
            })
            .catch(function(err) {
              console.warn('[SW] Sync gagal item #' + item.id, err);
            });
          });
        });

        chain.then(function() {
          // Kirim pesan ke semua client agar refresh UI
          self.clients.matchAll().then(function(clients) {
            clients.forEach(function(client) {
              client.postMessage({ type: 'SYNC_COMPLETE' });
            });
          });
          resolve();
        }).catch(reject);
      };
      getAll.onerror = reject;
    };
    req.onerror = reject;
  });
}

// ---- Message handler ----
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
