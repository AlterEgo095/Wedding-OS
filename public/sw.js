/* Wedding OS — Service Worker
 * Phase G: PWA integration.
 *
 * Strategy:
 *  - Precache the bare minimum on install (start URL + favicon + manifest).
 *  - Cache-first for static assets (same-origin GET).
 *  - Network-first for navigation requests (always try to fetch the latest
 *    page, fall back to cache when offline).
 *  - Cleanup stale caches on activate.
 *
 * Note: this is intentionally minimal. Real production would add:
 *  - Background sync, periodic sync.
 *  - Push notifications handler.
 *  - Range request handling for media streaming.
 *  - WebP/AVIF content negotiation.
 */
const CACHE = 'wedding-os-v1'
const PRECACHE = ['/', '/favicon.svg', '/manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Network-first for navigation, cache-first for assets
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    )
  } else {
    e.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          })
      )
    )
  }
})
