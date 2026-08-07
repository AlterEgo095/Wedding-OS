# AENEWS Wedding OS — Canonical Architecture

**RC-3.0 (post-consolidation)** | 2026-07

> This document supersedes RC-2.0. It reflects the post-consolidation
> architecture after CONS-1 through CONS-7 (Penpot removal, security
> remediation, Super-Admin Production Studio, Client backend expansion,
> Deployment pipeline, documentation + audit recommendations).

---

## 1. CANONICAL SOURCE

```
GitHub: https://github.com/AlterEgo095/Wedding-OS.git
Branch: main
```

The VPS at `/opt/wedding-platform` is a deployment of `main`. No critical
code, migration, or script exists only on the VPS.

### Provenance chain

```
GitHub main SHA
  = VPS HEAD (git)
  = Docker image DEPLOY_SHA (ARG at build time)
  = Container runtime deploySha (/api/health)
```

All three SHA must match for a certified deployment.

---

## 2. THREE-SURFACE ARCHITECTURE

The codebase is one Next.js app serving three distinct surfaces over a
shared multi-tenant core:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       AENEWS Wedding OS (Next.js 16)                      │
├──────────────────────────────────────────────────────────────────────────┤
│  Multi-tenant core (AsyncLocalStorage + Prisma extension fail-closed)     │
│                                                                           │
│  ┌─────────────────────────┐   ┌─────────────────────────┐               │
│  │  1. Super Admin         │   │  2. Client backend      │               │
│  │  Production Studio      │   │  /w/[slug]/admin        │               │
│  │  /platform/admin        │   │  shell 689 lines        │               │
│  │  shell 584 lines        │   │  + 21 dynamic tabs      │               │
│  │  + tabs/ (4)            │   │    15 original +        │               │
│  │  + tabs/production/ (6) │   │    6 new (CONS-5)       │               │
│  │  = 10 tabs total        │   │                         │               │
│  └────────────┬────────────┘   └────────────┬────────────┘               │
│               │                              │                            │
│               ▼ triggers pipeline            ▼ edits tenant-scoped data   │
│  ┌───────────────────────────────────────────────────────────┐           │
│  │  3. Deployment pipeline (9 stages, src/lib/pipeline/)     │           │
│  │  Template → Theme → Assets → Components → Bindings →      │           │
│  │  Collection → Wedding → Frontend                          │           │
│  │  persiste Wedding.publishedConfigJson + publishedVersion  │           │
│  └───────────────────────────────────────────────────────────┘           │
│                              │                                            │
│                              ▼                                            │
│  ┌───────────────────────────────────────────────────────────┐           │
│  │  4. Public wedding frontend (/w/[slug])                   │           │
│  │  layout.tsx reads publishedConfigJson → ThemeInjector     │           │
│  │  + SectionRenderer (hero, story, gallery, timeline, map)  │           │
│  │  + guest space (RSVP, QR check-in, personal gallery)      │           │
│  └───────────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Surface 1 — Super Admin Production Studio

```
src/app/platform/admin/
├── page.tsx              # 584 lines — shell (tab routing + dynamic imports)
├── tabs/
│   ├── DashboardTab.tsx
│   ├── WeddingsTab.tsx
│   ├── UsersTab.tsx
│   ├── AuditTab.tsx
│   ├── shared.tsx        # shared platform-admin UI primitives
│   └── production/
│       ├── TemplatesManager.tsx     # Template catalog (themeSeed, layout)
│       ├── ThemesManager.tsx        # PlatformTheme CSS vars + fonts
│       ├── ComponentsRegistry.tsx   # ComponentRegistry section components
│       ├── AssetsLibrary.tsx        # PlatformAsset images + fonts + icons
│       ├── DeploymentsPanel.tsx     # trigger + retry + poll deployments
│       └── GovernancePanel.tsx      # lifecycle + quality rules
```

10 tabs total (4 platform-level + 6 Production Studio). Refactored from
the original 2655-line god component to a 584-line shell with 10 dynamic
tab imports (CONS-3).

### Surface 2 — Client backend (per-wedding admin)

```
src/app/w/[slug]/admin/
└── page.tsx              # 689 lines — shell (21 tab routing + dynamic imports)

src/components/admin/    # 21 tab components (lazy-loaded, ssr: false)
├── DashboardTab.tsx               # (original — overview)
├── WeddingInfoTab.tsx             # (original — couple + date + venue)
├── GuestManager.tsx               # (original — 1104 lines, CRUD invités)
├── TableManager.tsx               # (original — plan de placement DnD)
├── MediaManager.tsx               # (original — galerie + uploads)
├── MusicManager.tsx               # (original — playlist ambiance)
├── TimelineManager.tsx            # (original — chronologie/histoire couple)
├── InvitationManager.tsx          # (original — envoi + tracking invitations)
├── CheckInManager.tsx             # (original — check-in QR code)
├── AppearanceManager.tsx          # (original — LuxuryVisualEngine presets)
├── ThemeCustomizer.tsx            # (original — couleurs + polices)
├── DesignerTab.tsx                # (original — section reordering)
├── AccessLogsTab.tsx              # (original — GuestAccessLog viewer)
├── UserManager.tsx                # (original — Organizer/Controller accounts)
├── SettingsTab.tsx                # (original — Settings key/value)
├── FamiliesManager.tsx            # (CONS-5 — side BRIDE/GROOM/COMMON)
├── GroupsManager.tsx              # (CONS-5 — custom color tags)
├── GiftsManager.tsx               # (CONS-5 — gift tracker + thank-you status)
├── ProgramManager.tsx             # (CONS-5 — program du jour J ordonné)
├── StatisticsPanel.tsx            # (CONS-5 — 10 KPIs + 4 Recharts)
└── QRCodeManager.tsx              # (CONS-5 — bulk QR print/PDF export)
```

21 tabs total: 15 original + 6 new (CONS-5). The shell wires all 21 via
`dynamic(() => import(...), { ssr: false })` for bundle-splitting.

### Surface 3 — Public wedding frontend

```
src/app/w/[slug]/
├── layout.tsx           # server: resolve slug + load publishedConfigJson
├── page.tsx             # client: activeManifest + ThemeInjector + SectionRenderer
├── invite/[code]/       # guest invitation landing (AES-256-GCM token)
├── wedding-context.tsx  # client provider: manifest + publishedConfig
└── admin/               # surface 2 lives here (auth-gated)
```

### Surface 4 — Deployment pipeline (library, not a route surface)

```
src/lib/pipeline/
└── deployment-pipeline.ts   # 705 lines, 9 stages
```

See §6 + [`docs/DEPLOYMENT_PIPELINE.md`](./docs/DEPLOYMENT_PIPELINE.md).

---

## 3. MULTI-TENANT ARCHITECTURE

```
AENEWS Wedding OS
        │
        ├── Wedding A (tenant)
        │   ├── identity (bride, groom, date, venue)
        │   ├── Collection binding (manifest) + publishedConfigJson snapshot
        │   ├── Guests + Sessions (tenant-scoped)
        │   ├── Tables + Invitations + Media + Theme + Music
        │   ├── Families + GuestGroups + Gifts + ProgramItems (CONS-5)
        │   └── public experience at /w/[slug]
        │
        ├── Wedding B (tenant) — fully isolated
        │
        └── Wedding N
```

### Isolation mechanism (preserved multi-tenant core)

The following files form the multi-tenant core. They were preserved
untouched through all CONS phases (security agent verified in CONS-2):

| File | Role |
|---|---|
| `src/lib/tenant-context.ts` | `AsyncLocalStorage<TenantContext>`, `runWithTenant`, `resolveAdminTenant`, `withPublicTenant`, `withAdminTenantHandler` |
| `src/lib/prisma-extensions/tenant-scoped.ts` | Prisma extension auto-injecting `weddingId` on 17 tenant-scoped models + fail-closed throw `TENANT_FAIL_CLOSED` |
| `src/lib/db.ts` | Three clients: `db` (platform), `tenantDb` (auto-scoped), `unsafePlatformDb` (cross-tenant explicit) |
| `src/lib/auth.ts` | JWT auth, 2FA TOTP, CSRF double-submit, password reset, `getAuthUser`, `hasPermission`, `assertWeddingAccess` |
| `src/lib/guest-auth.ts` | AES-256-GCM encrypted guest tokens, 2FA TOTP secret encryption, fail-hard on missing `ENCRYPTION_KEY` (CONS-2 fix C3) |
| `src/lib/rate-limit.ts` | HOF `withRateLimit` + in-memory or Redis backend |
| `src/lib/api-errors.ts` | `badRequest`, `unauthorized`, `forbidden`, `notFound`, `rateLimited`, `conflict`, `internalError` — French copy |
| `src/lib/logger.ts` | JSON structured logger, no stack in prod, child `with(ctx)` |

### Fail-closed semantics

If a query hits a tenant-scoped model **outside** a `runWithTenant()` block,
the Prisma extension throws `TENANT_FAIL_CLOSED`. Cross-tenant queries
must use the explicitly-named `unsafePlatformDb` client.

### Route wrapper coverage

- `withPublicTenant(handler)` — unauthenticated public reads (33 routes).
- `withAdminTenantHandler(request, user, handler)` — authenticated mutations (49 routes).
- `resolveAdminTenant(request, user)` — lower-level for custom control flow.

~82 wrapped routes out of 88 total. The 6 unwrapped are platform-level
APIs (cross-tenant by design, gated by `requirePlatformAdmin`).

---

## 4. ROUTING

```
/                                → platform showcase (default wedding)
/w/[slug]                        → public wedding experience (tenant-scoped)
/w/[slug]/admin                  → client backend (21 tabs, auth-gated)
/w/[slug]/invite/[code]          → guest invitation landing (AES-256-GCM token)
/platform/admin                  → Super Admin Production Studio (10 tabs)
/platform/login                  → platform auth
/onboarding                      → public lead capture + wizard
/api/platform/*                  → platform-level APIs (cross-tenant, SUPER_ADMIN)
/api/platform/deployments/*      → deployment pipeline trigger/retry/status
/api/weddings/[id]/*             → per-wedding admin APIs (tenant-scoped)
/api/weddings/[id]/published-config → PUBLIC read of published snapshot (CDN-cached)
/api/guests/*                    → guest CRUD (tenant-scoped, Zod-validated)
/api/guest/*                     → guest-facing APIs (public, token-scoped)
/api/collections/*               → collection catalog + apply
/api/check-in                    → QR check-in (tenant-scoped, CONTROLLER+)
```

---

## 5. DATA MODEL

### 44 Prisma models total

| Group | Count | Models |
|---|---|---|
| Tenant root | 1 | `Wedding` |
| Tenant-scoped (auto-filtered by `weddingId`) | 17 | `Guest`, `Table`, `Media`, `EventTimeline`, `CoupleStory`, `Settings`, `Theme`, `MusicTrack`, `GuestSession`, `GuestAccessLog`, `Invitation`, `UsageCounter`, `WeddingCollectionBinding`, `Family` *, `GuestGroup` *, `Gift` *, `ProgramItem` * |
| Platform-level (weddingId nullable) | 4 | `AdminUser`, `AuditLog`, `Subscription`, `Invoice` |
| Collection Engine | 4 | `Collection`, `CollectionVariant`, `CollectionModule`, `Lead` |
| Commercial / Billing | 8 | `Customer`, `Deal`, `CommercialOrder`, `OrderItem`, `Payment`, `Entitlement`, `DeliveryJob`, `DeliveryAttempt`, `Plan` (9 — billing + commercial) |
| Designer OS (legacy) | 3 | `DesignVersion`, `IngestionJob`, `ExportJob` |
| Auth | 1 | `PasswordResetToken` |
| Production Studio (CONS-3) | 5 | `Template`, `PlatformTheme`, `ComponentRegistry`, `PlatformAsset`, `Deployment` |
| Client backend (CONS-5) | 4 * | `Family`, `GuestGroup`, `Gift`, `ProgramItem` |
| **Total** | **44** | — |

\* `Family`, `GuestGroup`, `Gift`, `ProgramItem` are tenant-scoped (counted in
both the tenant-scoped group and the CONS-5 group — they are the same 4
models, listed twice for clarity).

### Additive fields (CONS-6)

`Wedding.publishedConfigJson String?` + `Wedding.publishedVersion String?`
— populated by the deployment pipeline stage 9 (`publishFrontend`).

### Additive fields (CONS-5)

`Guest.familyId String?` + `Guest.groupId String?` — nullable FKs to
`Family` and `GuestGroup`. Backward-compatible (existing guests have null).

### Why no enums

All statuses/roles/plans are `String` with values in comments (audit
finding H18). Migration to Prisma enums is P2 (medium-term).

---

## 6. DEPLOYMENT PIPELINE

The pipeline compiles a wedding's configuration into an immutable
published snapshot. See [`docs/DEPLOYMENT_PIPELINE.md`](./docs/DEPLOYMENT_PIPELINE.md)
for the full spec.

### 9 stages (all in `src/lib/pipeline/deployment-pipeline.ts`)

```
1. validateInputs      → verify wedding/template/theme IDs exist + are PUBLISHED
2. resolveTemplate     → load Template row (themeSeed, layout, luxury preset)
3. resolveTheme        → load PlatformTheme row (CSS vars, fonts, palette)
4. resolveAssets       → load PlatformAsset[] (images, fonts, icons)
5. resolveComponents   → load ComponentRegistry[] (section-level React components)
6. resolveBindings     → load WeddingCollectionBinding (section→component map)
7. resolveCollection   → load Collection + Variants (manifest source)
8. compileFrontend     → build PublishedConfig JSON snapshot
9. publishFrontend     → persist Wedding.publishedConfigJson + .publishedVersion
                         + Wedding.status = PUBLISHED + Deployment.status = DEPLOYED
```

### Trigger model

- **Who:** SUPER_ADMIN, PLATFORM_ADMIN only (`requirePlatformAdmin`).
- **API:** `POST /api/platform/deployments/trigger` — Zod body, rate-limited 10/min, audit-logged.
- **Retry:** `POST /api/platform/deployments/[id]/retry` — re-runs from stage 1.
- **Public read:** `GET /api/weddings/[id]/published-config` — no auth, CDN-cached 60s/5min stale-while-revalidate.

### Render path (post-publish)

```
/w/[slug]/layout.tsx
  ├─ resolveWeddingBySlug(slug)
  ├─ db.wedding.findUnique({ publishedConfigJson, publishedVersion })
  ├─ safeJsonParse(publishedConfigJson) → PublishedConfigSnapshot | null
  └─ <WeddingContextProvider manifest publishedConfig>
       ↓
/w/[slug]/page.tsx
  ├─ activeManifest = previewManifest || wedding.publishedConfig?.manifest || wedding.manifest
  └─ <ThemeInjector theme={wedding.publishedConfig?.theme ?? null} />
       ↓
ThemeInjector
  ├─ if theme prop → inject CSS vars + Google Fonts directly (no /api/theme fetch)
  └─ else           → fallback fetch /api/theme (backward-compat)
       ↓
SectionRenderer (renders manifest.sections[] in order)
```

### Lifecycle

```
Deployment.status:
  PENDING → BUILDING → DEPLOYED  (success path)
                     → FAILED    (any stage error)

PipelineStage.status (per-stage):
  PENDING → RUNNING → SUCCESS
                   → FAILED
```

### PublishedConfig JSON shape

```ts
{
  schemaVersion: string;        // "1.0.0" — reservation for future migrations
  wedding:      { id, slug, title, date, venue },
  template:     { id, slug, name, layout, luxuryPreset },
  theme:        { cssVars, fonts, palette },     // PlatformTheme snapshot
  manifest:     { sections[], layout },          // WeddingManifest
  components:   ComponentRegistry[],             // section-level React
  assets:       PlatformAsset[],                 // images, fonts, icons
}
```

Versioning: `publishedVersion` = `yyyy.MMdd.HHmmss-xxxx` (timestamp + 4-char
random). Enables rollback to a previously published snapshot.

---

## 7. AUTH MODEL

| Role | Scope | Capabilities |
|---|---|---|
| SUPER_ADMIN / PLATFORM_ADMIN | platform-wide | all weddings, billing, users, ops, **trigger deployments**, Production Studio |
| ORGANIZER | single wedding | guests, tables, families, groups, gifts, program, invitations, designer |
| CONTROLLER | single wedding | read guests, check-in, stats |
| RECEPTION | single wedding | check-in only |
| (guest) | single wedding, token-scoped | view invitation, RSVP, personal gallery |

### Authentication mechanisms

- **Admin:** JWT (`jsonwebtoken`) signed with `JWT_SECRET` (min 32 chars,
  fail-hard in prod). bcryptjs password hashing (rounds=12).
- **Guest:** AES-256-GCM encrypted tokens (`src/lib/guest-auth.ts`),
  key = `ENCRYPTION_KEY` (MUST differ from `JWT_SECRET`, fail-hard if
  equal — CONS-2 fix C3). `GuestSession.token` hashed SHA-256 at rest
  (CONS-2 fix H16).
- **2FA TOTP:** `otplib` for platform admins. Secret AES-256-GCM
  encrypted at rest. 5-min challenge JWT, backup codes SHA-256.
- **CSRF:** double-submit cookie on all mutating admin routes.
- **Password reset:** DB-backed, tokens SHA-256 hashed, one-time-use,
  1h expiry, anti-enumeration (same response whether email exists or not).
  Reset URL is NEVER returned in the HTTP body (CONS-2 fix C5).
- **Rate limit:** in-memory (single-instance) or Redis (distributed when
  `REDIS_URL` set). Login/2FA/reset: 10/min. Mutations: 30/min.
  Deployments: 10/min.

---

## 8. EXISTENTIAL CHAIN (Collection → Public Experience)

```
Collection (DB)
  ↓ generateManifest()
WeddingManifest (JSON)
  ↓ persist
WeddingCollectionBinding.manifest (DB)
  ↓ resolveWeddingManifest()  OR  Wedding.publishedConfigJson.manifest
WeddingManifest (runtime)
  ↓ SectionRenderer
Public experience (/w/[slug])
```

| Link | Implementation | Status |
|---|---|---|
| Collection → generateManifest | `src/lib/wedding/manifest.ts` | REAL |
| generateManifest → Binding | `src/lib/collections/index.ts` (applyCollection) | REAL |
| Binding → resolveWeddingManifest | `src/lib/wedding/manifest.ts` | REAL |
| Binding.draftManifest → Designer | `src/app/api/weddings/[id]/design/route.ts` | REAL |
| Manifest → SectionRenderer | `src/components/wedding/SectionRenderer.tsx` | REAL |
| SectionRenderer → public | `src/app/w/[slug]/page.tsx` | REAL |
| publishedConfigJson → render | `src/app/w/[slug]/layout.tsx` + `ThemeInjector` | REAL (CONS-6) |

### Layouts (structural differentiation)

| Layout | Sections | Count |
|---|---|---|
| royal | hero, story, gallery, timeline, map, guest-auth | 6 |
| classic | hero, story, gallery, timeline, map, guest-auth | 6 |
| minimal | hero, story, timeline, guest-auth | 4 (no gallery, no map) |
| destination | hero, gallery, story, timeline, map, guest-auth | 6 (gallery before story) |
| modern | hero, timeline, gallery, story, guest-auth | 5 (no map) |

---

## 9. EVENT OS EVOLUTION (deferred)

The `Wedding` model remains the canonical tenant (backward compat).
`src/lib/event-types.ts` introduces `EventType` (WEDDING/BIRTHDAY/CONFERENCE/
CORPORATE/PRIVATE_EVENT) stored in `Settings` key=`event_type`. The
terminology (hostLabels, guestTerm) lets the renderer adapt labels without
renaming the model. A future migration can add an `eventType` column to
`Wedding` and rename the model to `Event` — that is P3 (long-term).

---

## 10. POST-CONSOLIDATION STATE

| Metric | Before audit | After CONS-1 → CONS-7 |
|---|---|---|
| God component `platform/admin/page.tsx` | 2655 lines | 584 lines (shell + 10 tabs) |
| `w/[slug]/admin/page.tsx` | 15 tabs | 21 tabs (15 + 6 new) |
| Prisma models | 35 | 44 (35 + 5 Production Studio + 4 client backend) |
| Penpot integration | iframe + 34 files | removed (CONS-1) |
| Dead deploy scripts | 64 with creds | removed (CONS-1, see KNOWN-LIMITATIONS) |
| `ENCRYPTION_KEY` fallback | → `JWT_SECRET` | fail-hard if missing/equal (CONS-2 C3) |
| `GuestSession.token` | plaintext | SHA-256 hashed (CONS-2 H16) |
| Rate-limited routes | 5 / 86 | login/2FA/reset/mutations/deployments |
| Zod-validated routes | 1 `z.object` | all CONS-5+ routes + 5 high-traffic routes (CONS-7 task 5) |
| ESLint rules | 24 disabled | 6 re-enabled as warn/error (CONS-7 task 4) |
| Deployment pipeline | none | 9 stages, `publishedConfigJson` snapshot (CONS-6) |

### 6 commits CONS-1 through CONS-6 (per phase)

See `CONSOLIDATION-REPORT.md` for the full summary + remaining TODOs.
