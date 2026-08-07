// ══════════════════════════════════════════════════════════════════════════════
// Heureux Mariage — Service Worker premium
// Cache intelligent · Offline · Background sync · Update flow
// ══════════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'heureux-mariage-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Assets critiques mis en cache au install (offline de base)
const CRITICAL_ASSETS = [
  '/',
  '/manifest.json',
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
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(CRITICAL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // ne pas bloquer si un asset 404
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

  // Skip API calls (toujours frais — données dynamiques)
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
          // Fallback offline pour routes mariage/showcase
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

// ─── SYNC: background sync pour les soumissions différées ──────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'wedding-rsvp-sync') {
    event.waitUntil(
      // Les RSVP en attente seront rejoués quand la connexion revient
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_TRIGGERED', tag: event.tag });
        });
      })
    );
  }
});
