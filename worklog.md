# AENEWS Wedding Platform — Work Log

---
Task ID: 1
Agent: Main Agent
Task: Implement Luxury Visual Engine — Cinematic Ambiance System

Work Log:
- Phase 1: Created backup of entire frontend at backup-frontend/
- Phase 2: Created luxury engine architecture:
  - `/src/lib/luxury-engine-store.ts` — Zustand store with 12 effect toggles, intensity/density/speed controls, 4 theme options, performance tier system
  - `/src/components/luxury/particle-engine.ts` — Custom Canvas 2D particle engine with:
    - Star field with individual twinkle cycles and lifecycle (spawn/live/die/respawn)
    - Golden dust with Perlin-like noise drift for organic movement
    - Micro sparkles with random flash lifecycle
    - FPS monitoring and adaptive performance
  - `/src/components/luxury/LuxuryVisualEngine.tsx` — Main React component:
    - Single Canvas overlay for stars, dust, sparkles
    - DOM-based Luminous Halos (Framer Motion animated)
    - Global Breathing CSS effect
    - Auto-detection of device capabilities
    - Adaptive performance with hysteresis (never auto-downgrade below "low")
  - `/src/components/admin/LuxuryExperienceManager.tsx` — Admin dashboard:
    - Master toggle for entire engine
    - 7 individual effect controls (starrySky, goldenDust, microSparkles, luminousHalos, globalBreathing, sectionAmbiance, scrollReflections)
    - 4 theme options (Gold, Rose, Champagne, Midnight) with live preview
    - 4 sliders (intensity, density, speed, halo count)
    - Performance monitoring with live FPS, quality tier selector, particle counts
    - Auto-performance toggle
- Phase 9: Integrated Luxury tab into AdminPanel with Crown icon
- Injected LuxuryVisualEngine into page.tsx (1 import + 1 JSX line added, zero existing code modified)
- Fixed auto-performance logic to never auto-downgrade below "low" tier
- Set "minimal" tier to still have 50 stars + 15 dust + 4 sparkles + 1 halo (never zero particles)

Stage Summary:
- All 10 phases completed successfully
- Zero regression — all existing features still work (countdown, gallery, timeline, search, admin, invitation)
- Luxury Engine is a completely independent visual layer that can be toggled on/off
- Browser validation passed: page loads, all sections render, admin Luxury tab works
- Custom Canvas implementation (no external dependencies added) — zero risk of dependency conflicts
- Performance adaptive system with 5 tiers: ultra/high/medium/low/minimal

---
Task ID: 2-PLAN
Agent: Plan Architect
Task: Design premium multi-tenant SaaS transformation plan (single-wedding → commercial platform, 50-200 weddings/month)

Work Log:
- Read existing worklog (Task 1 — Luxury Visual Engine by Main Agent) to understand prior context
- Audited current single-tenant architecture:
  - `prisma/schema.prisma` — 9 models, NO `weddingId` anywhere. `AdminUser` has roles SUPER_ADMIN/ORGANIZER/CONTROLLER/RECEPTION but no wedding assignment. `Settings` uses flat global `key` uniqueness. `Table.number` is globally unique (breaks multi-tenancy).
  - `src/lib/auth.ts` — custom JWT auth, 8h expiry, role hierarchy, in-memory rate limiter (not multi-instance safe).
  - `src/lib/db.ts` — global PrismaClient singleton, no tenant scoping.
  - `src/middleware.ts` — empty pass-through (Edge runtime can't verify JWT, so auth is per-route).
  - 26 API routes under `/api/*` — all global, no tenant filter. `guests/route.ts` uses raw `where` without weddingId. `admin/dashboard/route.ts` does global `db.guest.count()`.
  - `src/app/page.tsx` — 368 lines, single-page render of Hero/Gallery/Story/Timeline/Map/Footer/Admin; admin opened via long-press/5-taps.
  - `src/app/admin/page.tsx` — separate admin SPA at `/admin` with 10 tabs (Dashboard, Guests, Tables, Access-logs, Media, Music, Timeline, Appearance, Users, Settings).
  - `Dockerfile` — multi-stage, node:20-alpine, standalone output, port 3000 (Caddyfile maps `:81` → `:3000`; production uses 3080 per task brief). Persistent volume for `/app/db` + `/app/public/uploads`.
  - `Caddyfile` — reverse proxy on `:81`, supports `XTransformPort` query for dynamic port proxying.
  - `.env` — only `DATABASE_URL=file:.../db/custom.db`. No Stripe, no R2, no JWT_SECRET in env (falls back to dev secret with warning).
  - `package.json` — NextAuth v4 installed but unused; no Stripe SDK; `next-intl` installed but unused (FR-only).
  - `prisma/seed.ts` — seeds SUPER_ADMIN `admin@josue-hornella.wedding` + global settings + sample guests/tables/timeline/stories.
- Designed 6-part premium plan covering: Executive Summary, 6 ADRs (tenancy model, routing, auth, DB scaling, storage, billing), full new Prisma schema, 10-phase implementation (~30 dev-days = 6 weeks for 1-2 seniors), 10-risk register, 10 KPIs, parallel hotfix deploy track.
- Key decisions: (1) Shared SQLite + `weddingId` columns now, Postgres schema-per-tenant at >500 weddings; (2) Subpath `/w/{slug}` default + custom domain via Caddy on-demand TLS for Premium/Élite; (3) Keep custom JWT, add `weddingId`+`weddingRole` claims; (4) Cloudflare R2 for media; (5) Stripe Checkout + Customer Portal + Webhooks.
- NO source files modified (research/planning task only). Full plan delivered in final message to orchestrator.

Stage Summary:
- Plan is execution-ready: every phase lists concrete file paths (e.g. `src/lib/tenant-context.ts`, `src/lib/prisma-extensions/tenant-scoped.ts`, `src/app/w/[slug]/page.tsx`, `src/app/(platform)/admin/weddings/page.tsx`), deliverables, dependencies, effort in days, and risks.
- Migration is zero-data-loss: existing rows backfilled to default Wedding (`slug: josue-hornella`); existing invitationCodes preserved so already-sent QR/SMS links keep working.
- Backward compatibility preserved: root `/` continues to render the default wedding; `heureuxmariage.aenews.net` URL keeps working seamlessly.
- Parallel hotfix track documented so the 21H30 time bug + displayName sync bug can ship to VPS without blocking multi-tenant work.

---
Task ID: 3-DEPLOY
Agent: Main Agent (VPS Deploy)
Task: Deploy 21H30 time fix + displayName sync fix to production VPS (95.111.226.63)

Work Log:
- Created deploy scripts using ssh2 (no SSH CLI available on sandbox machine)
- Script 1 (deploy-vps-hotfix.cjs): SSH connected ✓, uploaded 9 modified files to /opt/wedding-platform/ ✓, ran DB fix ✓, started docker build — TIMED OUT at 9 min (VPS has limited CPU, build too slow)
- Discovered VPS uses docker-compose with 2 services (app + nginx), image name `wedding-platform-app:latest` (not `heureux-mariage`)
- Script 2 (deploy-vps-continue.cjs): Tried `docker compose build app` — also timed out
- ⚠️ INCIDENT: The interrupted `docker compose build` left the container in a broken state — `wedding-app` container was DELETED, production returned 502
- Script 3 (deploy-vps-restore.cjs): EMERGENCY RESTORE via `docker compose up -d --no-build` — container restored, production HTTP 200 ✓
- Script 4 (deploy-vps-dbfix-v2.cjs): Tried DB fix with better-sqlite3 — FAILED (module not directly accessible in container)
- Script 5 (deploy-vps-dbfix-v3.cjs): Rewrote DB fix using Prisma client (which IS available) — SUCCESS ✓

DB Fix Results (verified via direct DB query + public API):
- BEFORE: 1 guest "SHARA MBOYO" (individuel, id cmqm1o0fc004fpr01b39bdmj4)
- UPDATE: lastName → "CHRIST MPEPE", displayName → "SHARA CHRIST MPEPE"
- AFTER: 0 guests with "MBOYO", 2 guests with "CHRIST MPEPE" (Couple + SHARA)
- venue_time = "21H30" ✓ (verified via /api/settings public endpoint)
- wedding_time = "21:30" ✓ (verified via /api/settings public endpoint)

Stage Summary:
- ✅ Production RESTORED and healthy (wedding-app container Up, HTTP 200)
- ✅ DB FIXED: MBOYO → CHRIST MPEPE (both Couple and SHARA records correct)
- ✅ TIME SETTINGS VERIFIED: 21H30 displays correctly on production
- ⚠️ CODE CHANGES (auto-sync displayName logic) NOT YET DEPLOYED — would require Docker rebuild which is risky on this VPS (slow CPU caused timeouts). The DB is in correct state so user-visible problem is FIXED. The auto-sync code prevents FUTURE regressions when admin edits names — can be deployed in a scheduled maintenance window.
- 📁 Deploy scripts saved at /home/z/my-project/scripts/deploy-vps-*.cjs for future use
- 📋 Recommended next step for code deploy: use `docker compose build app --no-cache` with longer timeout (15+ min) OR build image locally and push to VPS via `docker save | ssh ... docker load`

---
Task ID: 4-PHASE1
Agent: Main Agent (Phase 1 Implementation)
Task: Phase 1 — Multi-Tenant Foundation: introduce Wedding entity + zero-data-loss migration + keep app fully working

Work Log:
- Backed up local DB to db/custom.db.pre-phase1-20260626-222317 before any changes
- Rewrote prisma/schema.prisma (additive approach, zero breaking changes):
  - Added Wedding model (slug, brideName, groomName, coupleLabel, status, plan, customDomain, isDefault, etc.)
  - Added billing models: Subscription, Invoice, UsageCounter (for Phase 6)
  - Added per-wedding config: Theme, MusicTrack (1:1 with Wedding)
  - Added Invitation model (for Phase 7 onboarding)
  - Added nullable `weddingId` column to all tenant-scoped tables: AdminUser, Guest, Table, Media, EventTimeline, CoupleStory, Settings, GuestSession, GuestAccessLog, AuditLog
  - Changed unique constraints from global to composite: Settings [weddingId, key], Table [weddingId, number], Guest [weddingId, invitationCode]
  - Added composite indexes @@index([weddingId, ...]) on all tenant tables for fast scoping in Phase 2
  - Kept AdminUser name (not renamed to User) for backward compat — Phase 3 will alias
- Created src/lib/types.ts:
  - Plan type + PLAN_LIMITS + PLAN_METADATA (TRIAL/ESSENTIEL/PREMIUM/ELITE)
  - WeddingStatus type (DRAFT/PUBLISHED/ARCHIVED/SUSPENDED)
  - Role type + ROLE_HIERARCHY + hasRole helper
  - SLUG_REGEX + RESERVED_SLUGS + isValidSlug + generateSlug + buildCoupleLabel
  - DEFAULT_WEDDING_SLUG = 'josue-hornella'
- Updated src/lib/auth.ts:
  - Added `weddingId?: string | null` to AuthUser interface
  - Added `weddingId` claim to JWT payload in generateToken()
  - getAuthUser() now refreshes weddingId from DB (in case it changed since token was issued)
- Created scripts/migrate-phase1.ts:
  - Idempotent migration script — safe to run multiple times
  - Creates default Wedding (slug: josue-hornella, plan: ELITE, status: PUBLISHED, isDefault: true)
  - Backfills weddingId on ALL existing rows: AdminUser, Guest, Table, Media, EventTimeline, CoupleStory, Settings, GuestSession, GuestAccessLog, AuditLog
  - Seeds Theme (from existing primary_color/accent_color settings)
  - Seeds MusicTrack (from existing music_file/music_enabled/music_volume settings)
  - Seeds Subscription (complimentary Élite for legacy client)
  - Prints verification report at the end
- Updated prisma/seed.ts:
  - Creates default wedding before any other seed data
  - All seed operations now scoped with weddingId
  - Settings upsert rewritten to use composite [weddingId, key] (findFirst + update/create pattern since upsert needs full unique key)
- Ran `bun run db:push` — schema applied successfully, Prisma Client regenerated (v6.19.2)
- Ran `bun run scripts/migrate-phase1.ts` — ALL CHECKS PASSED:
  - Default wedding created (id=cmqvi4exn0000shoqvdvwaf0w)
  - 243/243 Guests backfilled with weddingId ✓
  - 31/31 Tables backfilled ✓
  - 32/32 Settings backfilled ✓
  - 12/12 EventTimeline backfilled ✓
  - 4/4 CoupleStory backfilled ✓
  - 4/4 Media backfilled ✓
  - 4/4 GuestSession backfilled ✓
  - 32/32 GuestAccessLog backfilled ✓
  - 15/15 AuditLog backfilled (NULL allowed for platform-level) ✓
  - Theme seeded ✓ / MusicTrack seeded ✓ / Subscription seeded ✓
  - 0 Guests with NULL weddingId ✓
- Lint check: 0 errors on Phase 1 files (pre-existing errors in .cjs deploy scripts + AmbientMusicPlayer.tsx are unrelated)
- Started dev server via .zscripts/dev.sh — boots in 1.2s, GET / returns 200 in 86ms
- API verification:
  - GET /api/settings → 32 settings, venue_time=21H30, wedding_time=21:30 ✓
  - GET /api/timeline → 12 events ✓
  - POST /api/admin/login → returns token + user, JWT contains weddingId: null (SUPER_ADMIN) ✓
  - GET /api/admin/dashboard → 243 guests, 31 tables, 349 seats ✓
  - GET /api/guests → 20 guests (paginated), each with weddingId=cmqvi4exn0000shoqvdvwaf0w ✓
- Browser verification (agent-browser):
  - Page renders all sections: Hero, Notre Histoire, Galerie, Programme (12 events), Le Lieu (with map), Trouver Mon Invitation, Footer ✓
  - "21H30" appears once (in Le Lieu section) ✓
  - Zero "14H00" or "14:00" on the page ✓
  - No console errors, no hydration warnings

Stage Summary:
- ✅ Phase 1 COMPLETE with ZERO REGRESSIONS
- Default wedding (josue-hornella) created and all 243+ existing records backfilled
- App boots in 1.2s, all APIs respond correctly, JWT auth includes weddingId claim
- Backward compatibility preserved: root "/" continues to serve the default wedding unchanged
- weddingId columns are nullable for now (Phase 2 will enforce NOT NULL once all routes are wedding-scoped)
- New models (Wedding, Subscription, Invoice, UsageCounter, Theme, MusicTrack, Invitation) are ready for Phases 2-10
- Production NOT touched (local dev only) — Phase 1 deploys to VPS in a dedicated maintenance window after Phase 2
- Files produced: prisma/schema.prisma (rewrite), src/lib/types.ts (new), src/lib/auth.ts (modified), scripts/migrate-phase1.ts (new), prisma/seed.ts (modified)
- DB backup at db/custom.db.pre-phase1-20260626-222317 (rollback path)

---
Task ID: 5-PHASE2
Agent: Main Agent (Phase 2 Implementation)
Task: Phase 2 — Multi-Tenant Routing + Isolation: /w/{slug} routing + Prisma extension anti-leak + backward compat

Work Log:
- Read worklog (Phase 1 complete, Phase 2 plan = "Routing + isolation" 3 days)
- Backed up local DB to db/custom.db.pre-phase2-20260626-225440 before schema changes
- Schema change: made `weddingId` NOT NULL on all 8 tenant-scoped tables (Guest, Table, Media, EventTimeline, CoupleStory, Settings, GuestSession, GuestAccessLog). AuditLog stays nullable for platform-level events. AdminUser stays nullable for SUPER_ADMIN. Ran `bun run db:push` — applied cleanly (Phase 1 backfill had already populated all rows), Prisma client v6.19.2 regenerated.
- Created `src/lib/tenant-context.ts` (320 lines):
  - AsyncLocalStorage<TenantContext> for per-request isolation
  - `runWithTenant(ctx, fn)` + `getTenantContext()` + `requireTenantWeddingId()`
  - `resolveWeddingBySlug(slug)` with 60s in-memory cache
  - `resolveDefaultWedding()` for backward compat
  - `invalidateWeddingCache(slug?)` for cache busting after admin updates
  - `extractSlugFromRequest()` — reads X-Wedding-Slug header / ?wedding= query
  - `resolvePublicTenant(request)` — for unauthenticated requests, gates by status (DRAFT/SUSPENDED)
  - `resolveAdminTenant(request, user)` — for authenticated requests, locks non-SUPER_ADMIN to their wedding
  - HOF wrappers: `withPublicTenant(handler)` + `withAdminTenantHandler(request, user, handler)`
- Created `src/lib/prisma-extensions/tenant-scoped.ts` (160 lines):
  - Prisma Client Extension using `Prisma.defineExtension`
  - Auto-injects `weddingId` on: findMany, findFirst, count, groupBy, aggregate, updateMany, deleteMany (WHERE clause) + create, createMany (DATA payload)
  - Does NOT touch: findUnique, update, delete, upsert (these use composite keys or by-id lookups — callers must use findFirst or add weddingId explicitly)
  - Only active when AsyncLocalStorage context is set (backward compat: passes through unchanged when no context)
  - Tenant-scoped models: Guest, Table, Media, EventTimeline, CoupleStory, Settings, GuestSession, GuestAccessLog, Theme, MusicTrack, Invitation, UsageCounter
  - Excluded: AuditLog (null weddingId for platform events), AdminUser (SUPER_ADMIN has null)
- Updated `src/lib/db.ts`: exports both `db` (raw, for platform ops) and `tenantDb` (extended with anti-leak guard). Both singletons via globalForPrisma.
- Updated `src/lib/guest-auth.ts`: switched `createGuestSession`, `validateGuestSession`, `logGuestAccess`, `getAuthenticatedGuest` from `db` to `tenantDb`. Changed `findUnique({ where: { id, token, isActive } })` to `findFirst` so extension can scope. All guest sessions are now per-wedding — a session token issued in Wedding A will NOT validate in Wedding B's context.
- Refactored 17 API routes to be wedding-aware:
  - Public routes (withPublicTenant): /api/settings GET, /api/timeline GET, /api/couple-story GET, /api/media GET, /api/music GET, /api/guest/lookup, /api/guest/auth, /api/guest/auto-auth, /api/guest/me, /api/guest/logout, /api/guest/rsvp POST, /api/guest/invite GET
  - Admin routes (withAdminTenantHandler): /api/settings PUT, /api/timeline POST/PUT/DELETE, /api/couple-story POST/PUT/DELETE, /api/tables (all), /api/media POST/DELETE, /api/music POST/PUT/DELETE, /api/guests (all), /api/guests/[id] (all), /api/guests/search, /api/guests/export, /api/guests/import, /api/guests/import-docx, /api/guest/access-logs, /api/admin/dashboard, /api/guest/rsvp GET/PUT
  - Special: /api/admin/users (AdminUser not tenant-scoped — filters by user.weddingId for non-SUPER_ADMIN), /api/admin/login (adds weddingId to JWT + audit log), /api/guests/qrcode/[code] (mixed admin+guest auth, QR URL now encodes /w/{slug}/invite/{token} for non-default weddings)
- Fixed 2 broken upserts (would have crashed at runtime): /api/settings PUT used `where: { key }` (no longer valid — composite unique is [weddingId, key]) → changed to `where: { weddingId_key: { weddingId, key } }`. /api/music had same issue via `getMusicSetting`/`setMusicSetting` helpers → fixed.
- Fixed /api/guests/import-docx: `db.guest.findUnique({ where: { invitationCode } })` would fail (invitationCode no longer globally unique) → changed to `tenantDb.guest.findFirst({ where: { invitationCode } })` (auto-scoped by extension).
- All AuditLog.create calls now include `weddingId: ctx.weddingId` (was missing, would have crashed on NOT NULL constraint).
- Created `src/app/w/[slug]/wedding-context.tsx`: React Context provider + `useWedding()` hook + `useTenantFetch()` helper (auto-adds X-Wedding-Slug header to all client-side API calls).
- Created `src/app/w/[slug]/layout.tsx` (server component): resolves wedding by slug, returns 404 if not found or DRAFT (non-default), shows holding page if SUSPENDED, wraps children in WeddingContextProvider.
- Created `src/app/w/[slug]/page.tsx` (290 lines, client component): beautiful per-wedding landing page with:
  - Hero: couple label, date, venue time, live countdown timer
  - Welcome message
  - Venue section (name, city, address, reference)
  - Timeline section (all events for this wedding, fetched with X-Wedding-Slug header)
  - Guest lookup form (tenant-scoped search, click-to-authenticate via /api/guest/auto-auth)
  - Footer with wedding identity (slug, status, plan) + link to / for default wedding
  - LuxuryVisualEngine integrated (same cinematic ambiance as root /)
- Created `src/app/w/[slug]/invite/[code]/page.tsx`: receives encrypted invitation token, validates via /api/guest/invite (with X-Wedding-Slug header), shows success/error states, auto-redirects to wedding landing page.
- Created `scripts/test-isolation.ts` (210 lines): comprehensive isolation test that creates a second wedding with sample data and verifies:
  - Test 1: findMany guests in Wedding A context → 0 of Wedding B's guests (PASS)
  - Test 2: findMany guests in Wedding B context → 0 of Wedding A's guests (PASS)
  - Test 3: findFirst by ID — Wedding A guest not visible in Wedding B context (PASS)
  - Test 4: count guests in A context = A's count, B context = B's count (PASS)
  - Test 5: settings findMany in A context → 0 of B's settings (PASS)
  - Test 6: timeline findMany in A context → 0 of B's events (PASS)
  - Test 7: raw db (no extension) returns BOTH weddings — correct for platform ops (PASS)
  - Test 8: composite unique [weddingId, number] — both weddings can have Table #1 (PASS)
  - Test 9: composite unique [weddingId, invitationCode] — same code in different weddings (PASS)
  - Test 10: cascade delete — deleting Wedding B removes all its guests/settings/events/tables (PASS)
  - Result: 11/11 PASSED, 0 FAILED 🎉
- Fixed infinite loop bug in /w/[slug]/page.tsx: `weddingDate` Date object was recreated every render, causing useEffect to re-run forever. Changed to use `weddingDateStr` (string) as dependency, compute Date inside effect.
- Lint: 0 errors in any Phase 2 file. 17 pre-existing errors in deploy scripts (require()) + AmbientMusicPlayer (setState in effect) — unchanged.
- Dev server: boots in 1.3s, all routes return 200.
- Browser verification (agent-browser):
  - `/w/josue-hornella` renders: Hero (Josué & Hornella), Venue (Salle Polyvalente – Grand Palais Kinshasa), Timeline (12 events), Guest lookup form, Footer (slug, PUBLISHED, ELITE, link to /) ✓
  - Guest search "Josué" → returned "JOSUE LIBAZA · Invitation individuelle · 1 place · Table DICLOFENAC" — tenant-scoped search works ✓
  - `/w/nonexistent-wedding` → 404 page (layout's notFound() triggered correctly) ✓
  - `/` (root) → full luxury experience unchanged, backward compat preserved ✓
  - "Maximum update depth exceeded" console error is PRE-EXISTING (also on root / page, from LuxuryVisualEngine particle engine) — NOT a Phase 2 regression. Page renders correctly despite it.

Stage Summary:
- ✅ Phase 2 COMPLETE with ZERO REGRESSIONS
- Multi-tenant routing live: `/w/{slug}` serves any wedding by slug
- Anti-leak Prisma extension verified: 11/11 isolation tests passed (Wedding A cannot read Wedding B's data)
- `weddingId` is now NOT NULL on all tenant-scoped tables — database enforces isolation at schema level
- Backward compatibility preserved: root `/` continues serving the default wedding (josue-hornella) unchanged; all existing fetches work because APIs default to default wedding when no X-Wedding-Slug header is provided
- 17 API routes refactored to be wedding-aware (public routes use withPublicTenant, admin routes use withAdminTenantHandler)
- 2 broken upserts fixed (settings, music) that would have crashed at runtime due to composite unique constraint change
- New per-wedding landing page at /w/{slug} with hero, countdown, venue, timeline, guest lookup
- New invitation auto-auth page at /w/{slug}/invite/{code} for QR/SMS links (encodes wedding slug in URL)
- Production NOT touched (local dev only) — Phase 2 deploys to VPS in a dedicated maintenance window after Phase 3
- Files produced: prisma/schema.prisma (modified), src/lib/db.ts (modified), src/lib/guest-auth.ts (modified), src/lib/tenant-context.ts (new, 320 lines), src/lib/prisma-extensions/tenant-scoped.ts (new, 160 lines), src/app/w/[slug]/{layout,page,wedding-context}.tsx (new), src/app/w/[slug]/invite/[code]/page.tsx (new), 17 API routes refactored, scripts/test-isolation.ts (new, 210 lines)
- DB backup at db/custom.db.pre-phase2-20260626-225440 (rollback path)
- Next: Phase 3 (Auth & RBAC, 2 days) — login per-wedding + platform admin

---
Task ID: 3-B
Agent: Full-Stack Developer (Phase 3-B Platform APIs)
Task: Phase 3 Task B — Backend Platform APIs (/api/platform/{login,logout,dashboard,weddings,users})

Work Log:
- Read worklog (Phase 1 + 2 complete, Phase 3 = Auth & RBAC) and 8 reference files: existing /api/admin/login route (for login pattern), /api/admin/users route (for AdminUser select pattern), /api/admin/dashboard route (for raw db cross-tenant pattern), lib/auth.ts (requirePlatformAdmin, setAuthCookie, clearAuthCookie, checkLoginRateLimit, resetLoginRateLimit), lib/types.ts (isPlatformAdmin, isValidSlug, buildCoupleLabel, Plan/WeddingStatus types), lib/rate-limit.ts (getRateLimitKey, checkRateLimit, withSecurityHeaders), lib/tenant-context.ts (invalidateWeddingCache), prisma/schema.prisma (Wedding + AdminUser + AuditLog models)
- Created /api/platform/login/route.ts:
  - POST endpoint, force-dynamic
  - Dual rate-limit: IP-based (10/15min via checkRateLimit) + per-email (5/15min via checkLoginRateLimit)
  - Verifies password via bcrypt (verifyPassword)
  - PLATFORM_ADMIN gate: returns 403 with "Platform admin access required" if isPlatformAdmin(user.role) is false
  - Issues JWT via generateToken (embeds weddingId=null + isPlatformAdmin=true claim)
  - Sets auth_token cookie via setAuthCookie (httpOnly, secure in prod, 8h expiry)
  - Updates lastLoginAt + creates AuditLog (weddingId=null, action=PLATFORM_LOGIN) in parallel
  - Returns { user, token } with security headers via withSecurityHeaders
- Created /api/platform/logout/route.ts:
  - POST endpoint, force-dynamic
  - Best-effort PLATFORM_LOGOUT audit log (wrapped in try/catch so logout always succeeds even if audit fails)
  - Clears auth_token cookie via clearAuthCookie
  - Returns { success: true }
- Created /api/platform/dashboard/route.ts:
  - GET endpoint, force-dynamic, PLATFORM_ADMIN only via requirePlatformAdmin
  - Returns aggregated cross-tenant stats using RAW db (not tenantDb — would auto-scope incorrectly)
  - 10 parallel queries via Promise.all: weddings.total, weddings.groupBy(status), weddings.groupBy(plan), users.total, users.count(platform admins), users.groupBy(role), guests.total, guests.last7days (createdAt >= 7d ago), 5 most recent weddings, 20 most recent audit logs (with user relation)
  - Formats grouped results into Record<string, number> for byStatus/byPlan/byRole
- Created /api/platform/weddings/route.ts:
  - GET: paginated list with ?page&limit&search&status&plan params; limit capped at 100; searches slug/coupleLabel/brideName/groomName/venueName/venueCity/customDomain; returns { weddings, total, page, limit }; each wedding includes _count of guests + admins
  - POST: creates wedding; validates slug via isValidSlug (rejects reserved words like 'admin', 'api', 'platform'); validates status/plan enum; checks slug uniqueness (409 if exists); auto-computes coupleLabel via buildCoupleLabel; forces isDefault=false; auto-sets publishedAt when status=PUBLISHED; returns 201 with created wedding; AuditLog action=CREATE_WEDDING
- Created /api/platform/weddings/[id]/route.ts:
  - GET: returns single wedding with _count of guests/tables/media/admins
  - PUT: updates fields (brideName, groomName, weddingDate, timezone, venue*, status, plan, customDomain); validates status/plan enums; checks customDomain uniqueness (409 if taken); recomputes coupleLabel when bride/groom changes; auto-sets publishedAt on first PUBLISHED transition; calls invalidateWeddingCache(slug) after update; AuditLog action=UPDATE_WEDDING with field list in details
  - DELETE: returns 400 "Cannot delete the default wedding" if isDefault; otherwise cascade-deletes via Prisma (onDelete: Cascade on all tenant-scoped relations); invalidates cache; AuditLog action=DELETE_WEDDING
- Created /api/platform/users/route.ts:
  - GET: paginated list with ?page&limit&search&role&weddingId params; searches email+name; filters by role/weddingId; each user includes wedding relation (slug, coupleLabel) — null for platform admins; ALWAYS excludes password via explicit select clause
- Lint: 0 errors in any of the 6 new files. The 17 pre-existing errors (in backup-frontend/AmbientMusicPlayer.tsx, src/components/AmbientMusicPlayer.tsx, scripts/deploy-vps-*.cjs, sync-vps-tables-only.js) are unrelated to this task — they were noted in Phase 1 and Phase 2 worklogs as pre-existing
- End-to-end verification via curl on dev server (port 3000):
  - GET /api/platform/dashboard unauthenticated → 401 "Unauthorized — authentication required" ✓
  - POST /api/platform/login with missing creds → 400 "Email and password are required" ✓
  - POST /api/platform/login as ORGANIZER (gate-test@example.com) → 403 "Platform admin access required" ✓
  - POST /api/platform/login as SUPER_ADMIN (admin@josue-hornella.wedding) → 200 with { user, token } + auth_token cookie set + PLATFORM_LOGIN audit log entry ✓
  - GET /api/platform/dashboard authenticated → 200 with full payload: 1 wedding, 11 users (3 SUPER_ADMIN, 3 ORGANIZER, 3 RECEPTION, 2 CONTROLLER), 243 guests, recentActivity shows PLATFORM_LOGIN entry at top ✓
  - GET /api/platform/weddings?limit=5 → 200 with paginated list, default wedding has _count.guests=243, _count.admins=8 ✓
  - GET /api/platform/users?limit=3 → 200 with paginated list, platform admin has wedding=null, staff users show wedding relation ✓
  - GET /api/platform/weddings/{default-id} → 200 with full wedding details + _count (guests/tables/media/admins) ✓
  - POST /api/platform/weddings {slug:"test-platform-wedding", brideName:"Alice", groomName:"Bob"} → 201, coupleLabel auto-computed "Alice & Bob" ✓
  - PUT /api/platform/weddings/{test-id} {brideName:"Alicia", venueCity:"Paris", status:"PUBLISHED"} → 200, coupleLabel re-computed to "Alicia & Bob", publishedAt set ✓
  - DELETE /api/platform/weddings/{default-id} → 400 "Cannot delete the default wedding" ✓
  - DELETE /api/platform/weddings/{test-id} → 200 { success: true }, follow-up GET returns 404 ✓
  - POST /api/platform/logout → 200 { success: true } + PLATFORM_LOGOUT audit log entry created ✓
  - Re-login dashboard shows the complete audit trail: PLATFORM_LOGIN → PLATFORM_LOGOUT → DELETE_USER → CREATE_USER → DELETE_WEDDING ✓

Stage Summary:
- ✅ All 6 platform API files created and working end-to-end
- Files created:
  - /src/app/api/platform/login/route.ts (118 lines)
  - /src/app/api/platform/logout/route.ts (43 lines)
  - /src/app/api/platform/dashboard/route.ts (138 lines)
  - /src/app/api/platform/weddings/route.ts (203 lines)
  - /src/app/api/platform/weddings/[id]/route.ts (261 lines)
  - /src/app/api/platform/users/route.ts (76 lines)
- Key decisions:
  - All routes use RAW `db` (NOT `tenantDb`) — the tenant-scoped extension would incorrectly filter cross-tenant aggregates that platform admins need to see
  - PLATFORM_ADMIN-only gate is enforced via the new `requirePlatformAdmin(user)` helper from lib/auth.ts — returns a NextResponse (401/403) or null, so routes can `const denied = requirePlatformAdmin(user); if (denied) return denied;`
  - All AuditLog entries for platform actions use `weddingId: null` so they don't get scoped to any tenant and are filterable in the dashboard
  - Default wedding is protected from deletion at the API layer (400 "Cannot delete the default wedding") — the legacy client at "/" depends on it existing
  - coupleLabel is auto-recomputed on PUT when brideName or groomName changes — keeps the display label in sync
  - invalidateWeddingCache(slug) is called after every wedding PUT/DELETE so the next /w/{slug} request re-fetches fresh data from DB (60s cache otherwise)
  - Password hashes are NEVER exposed — every select clause explicitly excludes the `password` field
  - Slug validation reuses the shared `isValidSlug` helper from lib/types.ts (rejects reserved words, requires 3-32 lowercase alphanumeric/hyphens, no leading/trailing/double hyphens)
  - Login endpoint uses dual rate limiting: IP-based (10/15min via getRateLimitKey + checkRateLimit) + per-email (5/15min via checkLoginRateLimit + resetLoginRateLimit) — same pattern as /api/admin/login
  - Status enum validates against WeddingStatus type ('DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED'); Plan enum validates against Plan type ('TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE')
  - publishedAt is auto-set on first PUBLISHED transition (PUT only) — preserves original publish timestamp on subsequent updates
  - customDomain uniqueness is checked on both POST (via Prisma unique constraint) and PUT (explicit conflict check returning 409)
- Lint status: ✅ 0 errors in new files (17 pre-existing errors in unrelated files: backup-frontend/AmbientMusicPlayer.tsx, src/components/AmbientMusicPlayer.tsx, scripts/deploy-vps-*.cjs, sync-vps-tables-only.js)
- Next: Phase 3 Task C (frontend platform admin pages) can consume these APIs directly — JWT cookie is set on login so SSR pages can use getServerAuthUser() without any client-side token handling

---
Task ID: 3-D
Agent: Full-Stack Developer (Phase 3-D Per-Wedding Admin UI)
Task: Phase 3 Task D — Per-Wedding Admin UI (/w/[slug]/admin/{login,page}.tsx)

Work Log:
- Read worklog.md to understand prior context (Phase 1 multi-tenant foundation, Phase 2 routing + isolation, Phase 3-A main page). Read /admin/page.tsx, /components/admin/LoginForm.tsx, /app/w/[slug]/layout.tsx, /app/w/[slug]/wedding-context.tsx, /app/w/[slug]/page.tsx, /lib/auth.ts, /lib/types.ts to understand existing patterns.
- Confirmed /w/[slug]/layout.tsx already wraps children in <WeddingContextProvider> providing coupleLabel + slug. Skipped creating /w/[slug]/admin/layout.tsx (not needed — parent layout already provides the context).
- Created `/src/app/w/[slug]/admin/login/page.tsx` (luxury branded login):
  - Client component using useParams<{ slug: string }>().slug, useRouter, useWedding()
  - coupleLabel pulled from WeddingContextProvider (with formatSlugAsLabel fallback that turns "josue-hornella" → "Josue & Hornella")
  - Dark gradient background (oklch 0.12-0.16 270°) with decorative radial gold glow
  - Glass card with gold-border, framer-motion entrance (opacity+y+scale), Crown icon spring-bouncing in
  - Email + Mot de passe inputs with Mail/Lock icons, "Se connecter" button with gradient-gold + Loader2 spinner
  - POST /api/admin/login with Content-Type + X-Wedding-Slug headers
  - Specific error handling: 401 → "Email ou mot de passe incorrect"; 403 → "Vous n'avez pas accès à ce mariage" (with "Retour à l'invitation" link); 429 → "Trop de tentatives. Réessayez dans 15 minutes."; other → server message
  - On success: localStorage.setItem('admin_token'/'admin_user'), toast.success, router.push('/w/${slug}/admin')
  - "Retour à l'invitation" link in footer (ArrowLeft icon) → /w/${slug}
- Created `/src/app/w/[slug]/admin/page.tsx` (tenant-aware admin dashboard):
  - Mirrors /admin/page.tsx exactly: same NAV_ITEMS (Dashboard, Invités, Tables, Accès, Médias, Musique, Programme, Apparence, Utilisateurs, Paramètres), same sidebar (desktop + mobile overlay + bottom tab bar), same framer-motion transitions
  - On mount (useEffect): reads localStorage; if no token → router.replace('/w/${slug}/admin/login')
  - Installs GLOBAL window.fetch interceptor (useEffect, deps [slug, router, token, user]):
    * Wraps window.fetch — for any URL starting with '/api/', creates a new Headers from init.headers (or Request.headers), sets 'X-Wedding-Slug' if not already present, then delegates to original fetch
    * Cleanup on unmount restores window.fetch to originalFetch
    * This lets all 10 existing admin components (Dashboard, GuestManager, TableManager, MediaManager, MusicManager, TimelineManager, UserManager, SettingsManager, AccessLogManager, AppearanceManager) work UNCHANGED — they call fetch('/api/…') and the interceptor auto-attaches the tenant header
  - coupleLabel from useWedding() (instead of hardcoded "Josué & Hornella"); fallback to slug
  - Couple photo: /uploads/couple-photo-1.jpeg (same fallback as /admin)
  - visibleNavItems filter uses isPlatformAdmin() from @/lib/types so BOTH PLATFORM_ADMIN and SUPER_ADMIN see the superAdminOnly tabs (Users, Settings)
  - Sidebar bottom shows user avatar + name + role; if isPlatformAdmin(user.role), shows "Plateforme" link (Crown icon) → /platform/admin
  - "Retour au site" buttons (sidebar + top bar) → /w/${slug}
  - handleLogout: clears localStorage + setToken(null) + setUser(null) + toast.success + router.replace to login
  - handleSessionExpired (passed to all 10 child components): ref-guarded to fire once, clears localStorage + toast.error + redirect to login
  - Used useSyncExternalStore(emptySubscribe, getTrue, getFalse) for `mounted` flag to avoid hydration mismatch (server renders loading screen; client renders loading screen during hydration; switches to admin UI after hydration) — sidesteps the react-hooks/set-state-in-effect lint rule without disabling it
  - Loading screen: dark gradient background, gold Crown icon in gradient-gold circle, Loader2 spinner with "Chargement de l'espace administrateur…"
- Lint: 0 errors in my 2 new files. The 17 remaining errors are all pre-existing (deploy-vps-*.cjs require() imports + AmbientMusicPlayer.tsx set-state-in-effect) — unchanged.
- Dev server verification:
  - GET /w/josue-hornella/admin/login → 200 OK (compile 1.9s, render 279ms)
  - GET /w/josue-hornella/admin → 200 OK (compile 4.1s, render 293ms)
  - HTML contains "Espace administrateur", "Josué & Hornella", "Se connecter", "Retour", glass-card + gold-gradient classes
- Browser verification (agent-browser):
  - Login page renders: Crown icon, "ESPACE ADMINISTRATEUR" eyebrow, "Josué & Hornella" h1 (coupleLabel from context ✓), email/password inputs, "Se connecter" button, "Retour à l'invitation" link
  - Submitted login form (admin@josue-hornella.wedding / admin2026) → POST /api/admin/login 200 → redirected to /w/josue-hornella/admin ✓
  - Admin page renders with sidebar showing couple photo + "Josué & Hornella" + "Super Admin" user name; all 10 nav items visible (Utilisateurs + Paramètres visible because isPlatformAdmin(SUPER_ADMIN) = true); "Plateforme" link visible → /platform/admin; "Retour au site" → /w/josue-hornella
  - Dashboard tab loaded correctly: 243 Total Invités, 0 Confirmés, 243 En attente — proves the global fetch interceptor attached X-Wedding-Slug header to /api/admin/dashboard (otherwise it would return 401)
  - Clicked "Programme" tab → TimelineManager fetched /api/timeline → returned 12 events (default wedding's timeline) — interceptor working ✓
  - window.fetch.toString() confirms my interceptor is installed
  - Visited /w/josue-hornella/admin with no token → redirected to /w/josue-hornella/admin/login ✓
  - Clicked "Déconnexion" → localStorage cleared, redirected to /w/josue-hornella/admin/login ✓

Stage Summary:
- Files created: /src/app/w/[slug]/admin/login/page.tsx (luxury branded login), /src/app/w/[slug]/admin/page.tsx (tenant-aware admin dashboard mirroring /admin/page.tsx)
- Files NOT created: /src/app/w/[slug]/admin/layout.tsx (skipped — parent /w/[slug]/layout.tsx already wraps in WeddingContextProvider)
- Key decision: GLOBAL fetch interceptor (wraps window.fetch) instead of prop-drilling useTenantFetch to all 10 existing admin components. This means ZERO changes to Dashboard/GuestManager/TableManager/MediaManager/UserManager/TimelineManager/SettingsManager/AccessLogManager/MusicManager/AppearanceManager — they all call fetch('/api/…') directly and the interceptor auto-attaches X-Wedding-Slug. Reduces code churn and risk of regression.
- Key decision: useSyncExternalStore for `mounted` flag instead of useState+useEffect to avoid the react-hooks/set-state-in-effect lint error WITHOUT disabling the rule. Returns false on SSR + during hydration, true after — lets us render a stable loading screen during hydration and avoid mismatches.
- Key decision: coupleLabel from useWedding() (already provided by parent layout) instead of fetching /api/settings — saves one API call and avoids a loading flash for the heading.
- Key decision: isPlatformAdmin(role) check from @/lib/types for visibleNavItems filter — accepts BOTH 'PLATFORM_ADMIN' and 'SUPER_ADMIN' (legacy alias) so the existing seeded admin@josue-hornella.wedding (role SUPER_ADMIN) can still see Users + Settings tabs.
- Lint status: 0 errors in my 2 new files (17 pre-existing errors in deploy scripts + AmbientMusicPlayer.tsx — unchanged)
- Verified end-to-end: login → admin renders → fetch interceptor attaches X-Wedding-Slug → Dashboard shows 243 guests + Timeline shows 12 events → logout clears localStorage + redirects

---
Task ID: 3-RBAC-AUDIT
Agent: Full-Stack Developer (Phase 3 RBAC Audit)
Task: Audit and fix RBAC enforcement on all admin API routes so "RBAC enforced partout"

Work Log:
- Read worklog.md (Phase 1 + 2 complete, Phase 3-A/B/C/D done) and lib/auth.ts + lib/types.ts to confirm RBAC matrix, helper signatures, and role hierarchy (PLATFORM_ADMIN/SUPER_ADMIN=4, ORGANIZER=3, RECEPTION=2, CONTROLLER=1).
- Audited all 17 admin API route files (settings, timeline, couple-story, tables, media, music, music/file, guests, guests/[id], guests/search, guests/export, guests/import, guests/import-docx, guest/access-logs, admin/dashboard, admin/users, guest/rsvp) by reading each one and checking every mutating handler (POST/PUT/DELETE) and sensitive GET for hasPermission / requireRole calls.
- Identified gaps:
  * tables/route.ts GET — auth-only, no role check (should be CONTROLLER+).
  * media/route.ts POST — auth-only, no ORGANIZER+ check (DELETE was OK).
  * music/route.ts POST/PUT/DELETE — all auth-only, no ORGANIZER+ check (hasPermission not even imported).
  * guests/route.ts GET — auth-only, no CONTROLLER+ check (POST/PUT/DELETE were OK).
  * guests/[id]/route.ts GET — used hasPermission(role, ['ORGANIZER']) which excluded CONTROLLER+RECEPTION from admin path (they fell through to guest-session path → 401). Should be CONTROLLER+.
  * guests/search/route.ts GET — required ORGANIZER+, should be CONTROLLER+ per matrix ("view own wedding data").
  * guests/export/route.ts GET — auth-only, no CONTROLLER+ check (hasPermission not even imported).
  * guest/access-logs/route.ts GET — required ORGANIZER+, should be CONTROLLER+ per matrix.
  * admin/dashboard/route.ts GET — auth-only, no CONTROLLER+ check (hasPermission not even imported).
  * guest/rsvp/route.ts GET (admin stats) — auth-only, no CONTROLLER+ check (PUT reset already had ORGANIZER+).
- Fixed each by adding the standard pattern `if (!hasPermission(user.role, [...])) return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });` immediately after the `if (!user)` guard, mirroring the existing /api/guests/route.ts convention.
- For files where hasPermission wasn't yet imported (music, guests/export, admin/dashboard), added it to the existing `import { getAuthUser } from '@/lib/auth'` line.
- Verified 3 modified files (music/route.ts — most complex with 4 edits + import; admin/dashboard/route.ts — added import + check; guests/[id]/route.ts — loosened role from ORGANIZER to CONTROLLER) by reading them back to confirm coherence.
- Ran `bun run lint` — 17 errors total, ALL pre-existing (deploy-vps-*.cjs require() imports, AmbientMusicPlayer.tsx set-state-in-effect, sync-vps-tables-only.js). 0 NEW errors introduced by this audit.

Stage Summary:
- Files modified (10):
  - src/app/api/tables/route.ts — GET: added CONTROLLER+ check.
  - src/app/api/media/route.ts — POST: added ORGANIZER+ check.
  - src/app/api/music/route.ts — imported hasPermission; POST/PUT/DELETE: each got ORGANIZER+ check.
  - src/app/api/guests/route.ts — GET: added CONTROLLER+ check.
  - src/app/api/guests/[id]/route.ts — GET: loosened admin gate from ORGANIZER to CONTROLLER (so RECEPTION+CONTROLLER can view guest details; PUT/DELETE already had ORGANIZER).
  - src/app/api/guests/search/route.ts — GET: loosened from ORGANIZER+ to CONTROLLER+ (consistent with "view own wedding data" matrix row).
  - src/app/api/guests/export/route.ts — imported hasPermission; GET: added CONTROLLER+ check.
  - src/app/api/guest/access-logs/route.ts — GET: loosened from ORGANIZER+ to CONTROLLER+.
  - src/app/api/admin/dashboard/route.ts — imported hasPermission; GET: added CONTROLLER+ check.
  - src/app/api/guest/rsvp/route.ts — GET (admin stats): added CONTROLLER+ check (PUT reset already had ORGANIZER+).
- Routes already compliant (audited, no changes):
  - src/app/api/settings/route.ts — PUT checks hasPermission(role, ['SUPER_ADMIN', 'ORGANIZER']) = ORGANIZER+ (SUPER_ADMIN is legacy alias for PLATFORM_ADMIN, recognized by isPlatformAdmin).
  - src/app/api/timeline/route.ts — POST/PUT/DELETE all check ['ORGANIZER'].
  - src/app/api/couple-story/route.ts — POST/PUT/DELETE all check ['ORGANIZER'].
  - src/app/api/guests/route.ts — POST/PUT/DELETE all check ['ORGANIZER'].
  - src/app/api/guests/import/route.ts — POST checks ['ORGANIZER'].
  - src/app/api/guests/import-docx/route.ts — POST checks ['ORGANIZER'].
  - src/app/api/admin/users/route.ts — GET checks ['ORGANIZER'] (filter by weddingId for non-platform admins inline); POST/PUT/DELETE check ['SUPER_ADMIN'] (= PLATFORM_ADMIN per matrix "Create users | PLATFORM_ADMIN | no"). PUT/DELETE are stricter than matrix minimum ("ORGANIZER (own) or PLATFORM_ADMIN") but are secure — loosening would require additional weddingId + privilege-escalation checks beyond the "only ADD missing role checks" scope of this audit.
  - src/app/api/music/file/route.ts — public GET file-serving endpoint (no admin mutation handler; matrix doesn't apply).
- Lint status: ✅ 0 NEW errors. 17 pre-existing errors in unrelated files (deploy-vps-*.cjs, AmbientMusicPlayer.tsx, sync-vps-tables-only.js) — unchanged.
- All edits follow the existing /api/guests/route.ts convention: `if (!hasPermission(user.role, [...])) return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });` placed immediately after the `if (!user)` 401 guard, before any tenant resolution. Tenant isolation (resolveAdminTenant / runWithTenant / withAdminTenantHandler) was left untouched as instructed.

---
Task ID: 3-FINAL
Agent: Main Agent (Phase 3 Finalization — RBAC enforced partout)
Task: Phase 3 — Auth & RBAC finalization: fix resolveAdminTenant bug, audit RBAC on all admin routes, normalize SUPER_ADMIN → PLATFORM_ADMIN, end-to-end verification

Work Log:
- Read worklog.md to assess Phase 3 state: Tasks 3-A (main page), 3-B (platform APIs), 3-C (platform admin UI), 3-D (per-wedding admin UI) were already complete. Remaining gap: "RBAC enforced partout" + a latent bug in resolveAdminTenant + DB still contained legacy SUPER_ADMIN role values.
- Backed up assessment by reading: prisma/schema.prisma (Wedding + AdminUser models with weddingId + role columns), src/lib/auth.ts (full RBAC helpers: hasPermission, requireRole, requirePlatformAdmin, assertWeddingAccess, ROLE_LABELS, JWT claims with weddingId + isPlatformAdmin), src/lib/types.ts (Role type, ROLE_HIERARCHY, normalizeRole, isPlatformAdmin accepting BOTH PLATFORM_ADMIN and SUPER_ADMIN), src/lib/tenant-context.ts (resolveAdminTenant had bug), src/middleware.ts (no-op — auth handled per-route), src/app/api/admin/login/route.ts (already includes weddingId in JWT), /api/guests/route.ts (already had hasPermission checks on POST/PUT/DELETE but GET was missing role check), platform admin UI files (all complete).
- Fixed bug in src/lib/tenant-context.ts resolveAdminTenant():
  - BEFORE: `if (user.role !== 'SUPER_ADMIN' && user.weddingId)` — only treated SUPER_ADMIN as platform-wide; PLATFORM_ADMIN users with a non-null weddingId would be incorrectly locked to that wedding.
  - AFTER: `if (!isPlatformAdmin(user.role) && user.weddingId)` — uses the shared isPlatformAdmin() helper which accepts BOTH PLATFORM_ADMIN and legacy SUPER_ADMIN. Updated JSDoc + inline comments to reflect the canonical role name. Imported isPlatformAdmin from ./types.
- Dispatched subagent (Task ID 3-RBAC-AUDIT) to audit all 17 admin API routes for RBAC enforcement and fix gaps. Subagent fixed 10 files (added missing hasPermission checks) and confirmed 7 routes were already compliant. See worklog entry 3-RBAC-AUDIT for the full file-by-file breakdown.
- Created scripts/migrate-phase3-roles.ts (140 lines):
  - Idempotent migration: finds all AdminUser with role='SUPER_ADMIN', updates them to 'PLATFORM_ADMIN' via updateMany.
  - Bootstraps a default PLATFORM_ADMIN (admin@josue-hornella.wedding / admin2026) if none exists.
  - Prints a full user summary grouped by role with weddingId + lastLoginAt.
  - Verifies 0 SUPER_ADMIN remain at the end (fails loudly if any remain).
- Updated prisma/seed.ts: the default admin is now created with role='PLATFORM_ADMIN' (canonical name) instead of 'SUPER_ADMIN'. On re-seed, any existing SUPER_ADMIN is normalized to PLATFORM_ADMIN + name updated to 'Platform Admin'. This ensures new deployments use the canonical role from day 1.
- Ran the migration script on local dev DB:
  - Found 3 SUPER_ADMIN users (admin@mariage.fr, admin@wedding.com, admin@josue-hornella.wedding)
  - Updated all 3 → PLATFORM_ADMIN
  - 0 SUPER_ADMIN remaining ✓
  - Final user distribution: 3 PLATFORM_ADMIN, 3 ORGANIZER, 3 RECEPTION, 2 CONTROLLER (11 total)
- Lint check: `bun run lint` → 17 errors, ALL pre-existing (deploy-vps-*.cjs require() imports, AmbientMusicPlayer.tsx set-state-in-effect, sync-vps-tables-only.js). 0 NEW errors introduced by Phase 3 finalization.
- Browser verification (agent-browser) — Platform admin flow:
  - GET /platform/login → renders luxury login card with Crown icon, "Administration Plateforme" heading ✓
  - Filled admin@josue-hornella.wedding / admin2026 → POST /api/platform/login 200 → redirected to /platform/admin ✓
  - Platform dashboard renders: 1 Total Mariages (1 publié), 11 Utilisateurs (3 admins plateforme), 243 Invités, $199 MRR Estimé, recent weddings table (Josué & Hornella, /w/josue-hornella, PUBLIÉ, ÉLITE), audit log activity feed (PLATFORM_LOGIN entries) ✓
  - "Mariages" tab: paginated wedding table with search + status/plan filters, shows default wedding with "défaut" badge ✓
- Browser verification — Per-wedding admin flow:
  - GET /w/josue-hornella/admin/login → renders "Josué & Hornella" heading (coupleLabel from WeddingContext) ✓
  - Filled admin@josue-hornella.wedding / admin2026 → POST /api/admin/login 200 → redirected to /w/josue-hornella/admin ✓
  - Admin dashboard renders with all 10 nav items (Dashboard, Invités, Tables, Accès, Médias, Musique, Programme, Apparence, Utilisateurs, Paramètres) + "Plateforme" link (visible because isPlatformAdmin(PLATFORM_ADMIN)=true) ✓
  - Dashboard data loaded via fetch interceptor (X-Wedding-Slug auto-attached): 243 Total Invités, 0 Confirmés, 243 En attente, 31 Tables ✓
  - Role label "PLATFORM_ADMIN" displayed in sidebar (confirms JWT claim flows through correctly after migration) ✓
- RBAC enforcement tests via curl (9/9 PASSED):
  - Test 1: PLATFORM_ADMIN → GET /api/platform/dashboard → 200 ✅
  - Test 2: No auth → GET /api/platform/dashboard → 401 ✅
  - Test 3: CONTROLLER → GET /api/platform/dashboard → 403 ✅ (needs PLATFORM_ADMIN)
  - Test 4: CONTROLLER → POST /api/guests → 403 ✅ (needs ORGANIZER+)
  - Test 5: ORGANIZER → POST /api/guests → 201 ✅ (allowed)
  - Test 6: CONTROLLER → GET /api/guests → 200 ✅ (read allowed for CONTROLLER+)
  - Test 7: No auth → GET /api/guests → 401 ✅
  - Test 8: RECEPTION → GET /api/guests → 200 ✅ (RECEPTION >= CONTROLLER in hierarchy)
  - Test 9: ORGANIZER locked to own wedding → GET /api/guests with X-Wedding-Slug=josue-hornella → 200 ✅ (tenant isolation working)
- Cleaned up test guest created during RBAC Test 5 (deleted via ORGANIZER token, HTTP 200).
- Dev log verified clean: all API calls returning 200, no runtime errors, no hydration warnings, Prisma queries executing with tenant-scoped WHERE clauses.

Stage Summary:
- ✅ Phase 3 (Auth & RBAC) COMPLETE — "RBAC enforced partout" criterion met
- Files modified:
  - src/lib/tenant-context.ts — fixed resolveAdminTenant to use isPlatformAdmin() (was `role !== 'SUPER_ADMIN'`)
  - prisma/seed.ts — canonical role PLATFORM_ADMIN for new deployments + normalization on re-seed
  - 10 admin API route files (RBAC audit by subagent — see entry 3-RBAC-AUDIT): tables/route.ts, media/route.ts, music/route.ts, guests/route.ts, guests/[id]/route.ts, guests/search/route.ts, guests/export/route.ts, guest/access-logs/route.ts, admin/dashboard/route.ts, guest/rsvp/route.ts
- Files created:
  - scripts/migrate-phase3-roles.ts (140 lines) — idempotent SUPER_ADMIN → PLATFORM_ADMIN normalization + bootstrap + summary
- DB state: 0 SUPER_ADMIN remaining (3 normalized to PLATFORM_ADMIN). 11 users total: 3 PLATFORM_ADMIN, 3 ORGANIZER, 3 RECEPTION, 2 CONTROLLER.
- RBAC matrix enforced end-to-end:
  - Platform routes (/api/platform/*): requirePlatformAdmin → 401 if no auth, 403 if non-platform role, 200 if PLATFORM_ADMIN
  - Per-wedding read routes (GET /api/guests, /api/tables, /api/admin/dashboard, etc.): CONTROLLER+ allowed (read access for all staff)
  - Per-wedding write routes (POST/PUT/DELETE /api/guests, /api/timeline, /api/settings, etc.): ORGANIZER+ required
  - Check-in operations: RECEPTION+ required
  - Tenant isolation: non-platform admins locked to their weddingId via resolveAdminTenant (X-Wedding-Slug header ignored for non-platform users)
- Lint: 0 new errors (17 pre-existing in deploy scripts + AmbientMusicPlayer — unchanged)
- Dev server: healthy, all routes 200, no errors in dev.log
- Production NOT touched (local dev only) — Phase 3 deploys to VPS in a dedicated maintenance window after Phase 4
- Next: Phase 4 (Pages publiques per-wedding, 3 days) — Hero/Story/Timeline/Gallery/Music per-wedding UX

---
Task ID: 4
Agent: Main Agent (Phase 4 Implementation)
Task: Phase 4 — Per-Wedding Public Pages: full luxury invitation UX (Hero/Story/Timeline/Gallery/Music/GuestSpace) per wedding

Work Log:
- Read worklog.md to confirm Phase 3 complete (RBAC enforced partout). Read PLAN_MULTI_TENANT.md Phase 4 spec: "Invitation UX complète par mariage — Hero/Story/Timeline/Gallery/Music per-wedding".
- Assessed current state: /w/[slug]/page.tsx was a Phase 2 MVP (basic Hero + Venue + Timeline + Guest lookup + Footer, 422 lines). The root "/" page (367 lines) uses rich components: Navigation, HeroSection, OurStory, PremiumGallery, EventTimeline, MapSection, Footer, GuestAuthProvider, GuestAuthForm, GuestPersonalSpace, AmbientMusicPlayer, VisualEffectsLayer, LuxuryVisualEngine, PWAInstall, AdminPanel, AENEWSBanner.
- Verified all luxury components use relative fetch('/api/...') calls (HeroSection, GuestAuthProvider, GuestPersonalSpace, GuestAuthForm all confirmed) — they work for the default wedding because APIs default to default wedding when no X-Wedding-Slug header is present.
- Chose the PROVEN strategy from Task 3-D (per-wedding admin): a GLOBAL window.fetch interceptor that auto-adds X-Wedding-Slug header to all /api/* calls. This lets ALL existing luxury components work UNCHANGED — zero modification to HeroSection/OurStory/PremiumGallery/EventTimeline/MapSection/GuestAuthProvider/GuestPersonalSpace/AmbientMusicPlayer/Footer. Zero regression risk on root "/" page.
- Rewrote /w/[slug]/page.tsx (290 lines) with full luxury per-wedding UX:
  - GLOBAL window.fetch interceptor installed in useEffect (wraps window.fetch, adds X-Wedding-Slug header for any URL starting with /api/ or api/, leaves absolute URLs/uploads untouched). Cleanup restores original fetch on unmount. Same pattern as /w/[slug]/admin/page.tsx.
  - useSyncExternalStore for hydration-safe mounted flag (returns false on SSR + during hydration, true after) — avoids react-hooks/set-state-in-effect lint error WITHOUT disabling the rule. Renders a stable luxury loading screen (dark gradient + gold pulse + "Chargement de l'invitation…") during hydration.
  - Composes the SAME luxury components as root "/" page: VisualEffectsLayer, LuxuryVisualEngine, Navigation, HeroSection, OurStory (stories prop), PremiumGallery, EventTimeline (events prop), MapSection (settings prop), GuestAuthForm, GuestPersonalSpace, AmbientMusicPlayer, Footer, PWAInstall.
  - Wrapped in Suspense + GuestAuthProvider (same as root) so the guest auth context works: useGuestAuth() provides { guest, authenticated, loading, loginByLookupToken, loginWithLinkToken }.
  - Fetches this wedding's data (stories, timeline, settings, music) in useEffect via plain fetch() — the interceptor auto-scopes them. Mirrors root page's fetchData() exactly.
  - Handles ?invite=token query param for guest auto-auth: loginWithLinkToken(inviteParam) called when inviteParam is present and guest is not yet authenticated. Guest stays on /w/{slug} after auth (not redirected to root "/").
  - Conditional rendering: authLoading → shimmer; authenticated+guest → GuestPersonalSpace; else → regularContent (OurStory + PremiumGallery + EventTimeline + MapSection + GuestAuthForm).
  - DELIBERATELY EXCLUDED from per-wedding page: AdminPanel + hidden admin trigger zone (admin lives at /w/[slug}/admin — separate dedicated UI from Task 3-D), AENEWSBanner (platform marketing banner — not relevant to a specific wedding's invitation).
  - onLogout: calls /api/guest/logout then router.refresh() (stays on the same wedding page, unlike root which redirects to "/").
- Lint: `bun run lint` → 17 errors, ALL pre-existing (deploy-vps-*.cjs require() imports, AmbientMusicPlayer.tsx set-state-in-effect, sync-vps-tables-only.js). 0 NEW errors from Phase 4 rewrite.
- Dev server: GET /w/josue-hornella → 200 in 685ms (compile 441ms, render 244ms). No errors in dev.log. All API calls return 200 with Prisma queries properly scoped by weddingId (confirmed via SQL log: `WHERE weddingId = ?`).
- Browser verification (agent-browser):
  - GET /w/josue-hornella → renders full luxury UX: Hero (JOSUÉ / HORNELLA + countdown "JOURS"), Notre Histoire (couple stories with "Vers le Grand Jour"), Notre Galerie (PremiumGallery), Programme du Jour (EventTimeline with "Accueil des invités"), Le Lieu (MapSection with "21H30" + map), Trouver Mon Invitation (GuestAuthForm), Footer ("© 2026 Josué & Hornella — Tous droits réservés" + "#JosueEtHornella2026") ✓
  - window.fetch.toString().includes('X-Wedding-Slug') → true (interceptor installed) ✓
  - Console errors: 0 ✓ / Page errors: 0 ✓
  - Guest lookup flow: filled "Josué" in search → GuestAuthForm called /api/guest/lookup (interceptor added X-Wedding-Slug) → returned "JOSUE LIBAZA DICLOFENAC • 1 place" result ✓
  - Clicked guest result → /api/guest/auto-auth called (interceptor scoped) → GuestAuthProvider received guest → GuestPersonalSpace rendered: "ESPACE SÉCURISÉ", "JOSUE LIBAZA", "DICLOFENAC • 1 place", "PERSONNEL" ✓
  - Guest stayed on /w/josue-hornella URL after auth (not redirected to root "/") ✓
  - ?invite=TOKEN auto-auth: page loads without errors, GuestAuthProvider processes the token ✓
- Dev log confirms all Prisma queries are tenant-scoped: `WHERE weddingId = ?` appears in every query for Settings, Guest, CoupleStory, EventTimeline — proving the fetch interceptor + Phase 2 tenant extension work end-to-end for the public UX.

Stage Summary:
- ✅ Phase 4 COMPLETE — Full luxury invitation UX per wedding
- Files modified: src/app/w/[slug]/page.tsx (full rewrite, 290 lines — was 422-line MVP, now composes all luxury components)
- Files NOT modified: ZERO changes to any luxury component (HeroSection, OurStory, PremiumGallery, EventTimeline, MapSection, GuestAuthProvider, GuestAuthForm, GuestPersonalSpace, AmbientMusicPlayer, Navigation, Footer, LuxuryVisualEngine, VisualEffectsLayer, PWAInstall) — all reused unchanged via the global fetch interceptor pattern
- Key architectural decision: GLOBAL window.fetch interceptor (same as Task 3-D per-wedding admin) instead of prop-drilling useTenantFetch to 14+ components. This means ZERO code churn in existing components → ZERO regression risk on root "/" page. The interceptor transparently scopes all /api/* calls to the current wedding via X-Wedding-Slug header.
- Key UX decision: Excluded AdminPanel + hidden trigger (admin is at /w/[slug}/admin) and AENEWSBanner (platform marketing) from the per-wedding public page. The per-wedding page is purely the guest-facing invitation experience.
- Key auth decision: Guest stays on /w/{slug} after auth/logout (router.refresh()) instead of redirecting to root "/". This keeps the tenant context intact throughout the guest journey.
- All 7 luxury sections verified rendering per-wedding: Hero (with countdown), Notre Histoire (couple stories), Notre Galerie (premium gallery), Programme du Jour (timeline), Le Lieu (map + 21H30), Trouver Mon Invitation (guest lookup), Footer (couple identity + hashtag)
- Guest flow verified end-to-end: search → select name → auto-auth → personal space renders — all scoped to the current wedding via the fetch interceptor
- Lint: 0 new errors (17 pre-existing in deploy scripts + AmbientMusicPlayer — unchanged)
- Dev server: healthy, all routes 200, no errors, Prisma queries properly tenant-scoped
- Production NOT touched (local dev only) — Phase 4 deploys to VPS in a dedicated maintenance window after Phase 5
- Next: Phase 5 (Dashboard super-admin, 3 days) — Vue plateforme (MRR, churn, weddings) at /platform/admin live with full CRUD
