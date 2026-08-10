// ══════════════════════════════════════════════════════════════════════════════
// Heureux Mariage — Service Worker premium
// Cache intelligent · Offline · Background sync · Update flow
// ══════════════════════════════════════════════════════════════════════════════

// P0-PWA-3: bumped v3→v4 to invalidate stale caches (icons were 404 in v3,
// breaking cache.addAll atomically). v4 precache succeeds because icons now exist.
// MISSION-5.9.0 Phase 0.2: bumped v4→v5 — replaced atomic cache.addAll with
// Promise.allSettled + individual cache.put so a single 404 no longer poisons
// the entire CRITICAL_ASSETS batch. Also added /offline fallback route.
// MISSION-5.9.0 Phase 3C: bumped v5→v6 — added /offline to CRITICAL_ASSETS
// (precached so the styled offline page is available even on first offline
// visit), the navigation catch branch now serves the cached /offline page
// instead of a plain 'Hors ligne' 503, and the `sync` event now has a real
// flushPendingRsvps() replay loop for the new `rsvp-sync` tag (was a stub
// that only postMessaged clients).
const CACHE_VERSION = 'heureux-mariage-v6';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const RSVP_QUEUE_CACHE = `${CACHE_VERSION}-rsvp-queue`;

// Assets critiques mis en cache au install (offline de base)
// MISSION-5.9.0 Phase 3C: added '/offline' so the styled fallback page is
// precached — without this, a first-visit offline navigation would render
// the plain 'Hors ligne' 503 text instead of the gold-themed /offline route.
const CRITICAL_ASSETS = [
  '/',
  '/manifest.json',
  '/offline',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-152x152.png',
  '/icons/icon-144x144.png',
];

// Routes qui doivent toujours être en cache (offline-first)
const OFFLINE_ROUTES = [
  /^\/w\/[^/]+$/,           // pages mariage publiques
  /^\/showcase/,            // showcase thèmes
  /^\/onboarding/,          // onboarding
];

// ─── INSTALL: cache les assets critiques ───────────────────────────────────
// MISSION-5.9.0 Phase 0.2: replaced atomic cache.addAll (which rejects the
// ENTIRE batch on a single 404) with Promise.allSettled + individual cache.put.
// A single failing asset no longer poisons the whole precache.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          CRITICAL_ASSETS.map((url) =>
            fetch(url, { cache: 'no-cache' })
              .then((res) => (res.ok ? cache.put(url, res) : Promise.reject(new Error(`${url} → ${res.status}`))))
              .catch((err) => {
                console.warn('[SW] precache skip:', url, err.message);
              })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: nettoie les vieux caches + claim clients ────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH: stratégies multiples selon le type de requête ──────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET (mutations = toujours réseau)
  if (request.method !== 'GET') return;

  // Skip cross-origin (analytics, fonts Google, etc.)
  if (url.origin !== self.location.origin) return;

  // P0-PWA-3: Cache QR code endpoint offline (stale-while-revalidate).
  // CRITICAL: guests at the wedding venue may have poor signal. Their
  // invitation QR must display even offline. The QR is stable per guest
  // (doesn't change after generation), so SWR is safe.
  if (url.pathname.startsWith('/api/guests/qrcode/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const cloned = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Skip other API calls (toujours frais — données dynamiques)
  if (url.pathname.startsWith('/api/')) return;

  // Skip Next.js HMR/dev internals
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // ─── Stratégie 1: Navigation → Network first, cache fallback ────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // MISSION-5.9.0 Phase 3C: serve the styled /offline page (precached
          // in CRITICAL_ASSETS) instead of the plain 'Hors ligne' 503 text.
          // The /offline page is a Server Component route — its HTML is
          // cached here so it renders even with zero JS. The retry button
          // (a tiny Client Component) calls window.location.reload(), which
          // re-triggers this navigation strategy and will succeed if the
          // network has come back.
          const offlinePage = await caches.match('/offline');
          if (offlinePage) return offlinePage;
          // Fallback offline pour routes mariage/showcase (legacy branch —
          // /offline is always preferred when present)
          const offlineMatch = OFFLINE_ROUTES.some((re) => re.test(url.pathname));
          if (offlineMatch) {
            const fallback = await caches.match('/');
            if (fallback) return fallback;
          }
          return caches.match('/') || new Response('Hors ligne', { status: 503 });
        })
    );
    return;
  }

  // ─── Stratégie 2: Images → Cache first, réseau fallback ─────────────────
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(IMAGE_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 404 }));
      })
    );
    return;
  }

  // ─── Stratégie 3: Static assets (_next/static) → Cache first ────────────
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        });
      })
    );
    return;
  }

  // ─── Stratégie 4: Autres → Stale-while-revalidate ───────────────────────
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ─── MESSAGE: update flow (skipWaiting quand le client le demande) ─────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── SYNC: background sync pour les soumissions RSVP différées ─────────────
// MISSION-5.9.0 Phase 3C: replaced the previous stub (which only postMessaged
// clients — no actual replay) with a real flushPendingRsvps() loop.
//
// Contract with src/components/wedding/sections/RsvpSection.tsx:
//   - When the guest submits RSVP while offline, the client caches the POST
//     request in RSVP_QUEUE_CACHE under the URL '/api/guest/rsvp' + a unique
//     query suffix (so multiple queued submissions don't collide) and calls
//     `registration.sync.register('rsvp-sync')`.
//   - When the browser detects the network is back, it fires the `sync` event
//     with tag 'rsvp-sync' → this handler replays every queued request.
//   - Successful responses (response.ok) DELETE the queued request; failed
//     responses stay in the queue and retry on the next sync.
//
// Tag 'wedding-rsvp-sync' (the old stub tag) is also handled → no client code
// in the repo registers it (verified via grep), but we keep the branch as a
// forward-compat safety net in case a third-party integration still uses it.
self.addEventListener('sync', (event) => {
  if (event.tag === 'rsvp-sync' || event.tag === 'wedding-rsvp-sync') {
    event.waitUntil(flushPendingRsvps());
  }
});

/** Replays every queued RSVP POST request. Successful responses are deleted
 *  from the queue; failed ones stay and retry on the next sync event.
 *
 *  Resilience notes:
 *   - We use RSVP_QUEUE_CACHE (a per-version cache) so old queued requests
 *     from a previous SW version don't leak across deploys — the activate
 *     handler already deletes any cache not matching CACHE_VERSION.
 *   - We never throw out of this function — Background Sync will retry the
 *     whole batch on the next sync if we reject, but we want per-request
 *     isolation (one bad request mustn't block the others).
 *   - The Request objects in the queue were constructed with method: 'POST'
 *     + a body — fetch() can replay them as-is. The body is consumed once,
 *     which is fine because we delete the cached Request right after.
 */
async function flushPendingRsvps() {
  let cache;
  try {
    cache = await caches.open(RSVP_QUEUE_CACHE);
  } catch (e) {
    console.warn('[SW] flushPendingRsvps: cannot open queue cache', e);
    return;
  }

  let requests = [];
  try {
    requests = await cache.keys();
  } catch (e) {
    console.warn('[SW] flushPendingRsvps: cannot list queued requests', e);
    return;
  }

  await Promise.all(
    requests.map(async (request) => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
          console.info('[SW] RSVP flushed:', request.url);
        } else {
          // Non-2xx — leave in queue, will retry on next sync.
          console.warn('[SW] RSVP flush non-ok:', request.url, response.status);
        }
      } catch (e) {
        // Network still down or request errored — leave in queue.
        console.warn('[SW] RSVP flush error:', request.url, e.message);
      }
    }),
  );

  // Notify clients so they can refresh their UI (e.g. clear the
  // "pending submission" indicator). Best-effort — no await.
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) =>
      client.postMessage({ type: 'RSVP_SYNC_COMPLETE', tag: 'rsvp-sync' }),
    );
  } catch (e) {
    /* noop */
  }
}
