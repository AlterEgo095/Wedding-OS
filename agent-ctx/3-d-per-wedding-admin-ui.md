# Task 3-D: Per-Wedding Admin UI

## Summary
Built the tenant-aware per-wedding admin UI at `/w/[slug]/admin/{login,page}.tsx`. The login page is a luxury branded form (gold gradient, glass card, framer-motion entrance) that POSTs to `/api/admin/login` with the `X-Wedding-Slug` header. The admin dashboard mirrors `/admin/page.tsx` exactly (same NAV_ITEMS, sidebar, mobile responsive behavior, all 10 panels) but installs a **global `window.fetch` interceptor** that auto-attaches the `X-Wedding-Slug` header to every `/api/*` call — meaning all 10 existing admin components (Dashboard, GuestManager, TableManager, MediaManager, MusicManager, TimelineManager, UserManager, SettingsManager, AccessLogManager, AppearanceManager) work UNCHANGED.

## Files Created (2)
1. `/src/app/w/[slug]/admin/login/page.tsx` — luxury branded login page
   - coupleLabel from `useWedding()` (with formatSlugAsLabel fallback)
   - Dark gradient bg + gold radial glow, glass card, Crown icon
   - Specific error handling: 401 / 403 / 429 with French messages
   - On success: localStorage + router.push to `/w/{slug}/admin`

2. `/src/app/w/[slug]/admin/page.tsx` — tenant-aware admin dashboard
   - Mirrors `/admin/page.tsx` (same NAV_ITEMS, sidebar, mobile bottom tab bar)
   - On mount: check localStorage, redirect to login if missing
   - **Global fetch interceptor** wraps `window.fetch` → adds `X-Wedding-Slug` to all `/api/*` calls
   - Sidebar: couple photo + coupleLabel + user name + role
   - `isPlatformAdmin(role)` filter → BOTH `PLATFORM_ADMIN` and `SUPER_ADMIN` see Users + Settings tabs
   - "Plateforme" link → `/platform/admin` (shown only for platform admins)
   - "Retour au site" → `/w/{slug}`
   - `useSyncExternalStore` for `mounted` flag (avoids hydration mismatch + lint error)

## Files NOT Created
- `/src/app/w/[slug]/admin/layout.tsx` — skipped (parent `/w/[slug]/layout.tsx` already provides `WeddingContextProvider`)

## Key Decisions
1. **Global fetch interceptor** instead of prop-drilling `useTenantFetch` to 10 components → zero churn in existing admin components
2. **`useSyncExternalStore`** for `mounted` flag → avoids `react-hooks/set-state-in-effect` lint error without disabling the rule, and avoids hydration mismatch when localStorage has a token
3. **`isPlatformAdmin(role)`** from `@/lib/types` for the `superAdminOnly` filter → accepts both `PLATFORM_ADMIN` and legacy `SUPER_ADMIN` (the seeded admin user is `SUPER_ADMIN`)
4. **`coupleLabel` from `useWedding()`** (already provided by parent layout) instead of fetching `/api/settings` → saves an API call

## ESLint Status
✅ 0 errors, 0 warnings in my 2 new files
(17 pre-existing errors in deploy-vps-*.cjs + AmbientMusicPlayer.tsx — unchanged)

## Browser Verification (agent-browser)
- `/w/josue-hornella/admin/login` → renders Crown + "Espace administrateur" + "Josué & Hornella" h1 + email/password form + "Se connecter" + "Retour à l'invitation"
- Login with `admin@josue-hornella.wedding` / `admin2026` → POST 200 → redirect to `/w/josue-hornella/admin` ✓
- Admin page renders sidebar with couple photo + coupleLabel + user info; all 10 nav items visible; "Plateforme" link visible (user is SUPER_ADMIN); Dashboard shows 243 guests (proves fetch interceptor attached X-Wedding-Slug)
- Clicked "Programme" tab → TimelineManager fetched `/api/timeline` → returned 12 events ✓
- Visiting `/w/josue-hornella/admin` with no token → redirected to `/w/josue-hornella/admin/login` ✓
- Clicked "Déconnexion" → localStorage cleared + redirected to login ✓

## Test Credentials
- Email: `admin@josue-hornella.wedding`
- Password: `admin2026`
- Role: `SUPER_ADMIN` (treated as platform admin by `isPlatformAdmin()`)
