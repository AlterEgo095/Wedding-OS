# AENEWS Wedding OS — Canonical Architecture

**RC-2.0** | 2026-07-05

---

## 1. CANONICAL SOURCE

```
GitHub: https://github.com/AlterEgo095/Wedding-OS.git
Branch: main
```

The VPS at `/opt/wedding-platform` is a deployment of `main`. No critical
code, migration, or script exists only on the VPS.

## 2. MULTI-TENANT ARCHITECTURE

```
AENEWS Wedding OS
        │
        ├── Wedding A (tenant)
        │   ├── identity (bride, groom, date, venue)
        │   ├── Collection binding (manifest)
        │   ├── Guests (tenant-scoped)
        │   ├── Tables
        │   ├── Invitations
        │   ├── Media
        │   ├── Theme
        │   └── public experience at /w/[slug]
        │
        ├── Wedding B (tenant)
        │   └── ... (fully isolated)
        │
        └── Wedding N
```

### Isolation mechanism

- **AsyncLocalStorage** (`src/lib/tenant-context.ts`) carries the
  `TenantContext` (weddingId, slug, status, plan) per request.
- **Prisma extension** (`src/lib/prisma-extensions/tenant-scoped.ts`)
  auto-injects `weddingId` into all queries against 13 tenant-scoped models.
- **Fail-closed**: if no tenant context is active, queries against
  tenant-scoped models THROW (`TENANT_FAIL_CLOSED`). Cross-tenant access
  requires explicit `unsafePlatformDb`.
- **Route wrappers**: `withPublicTenant` (unauthenticated) and
  `withAdminTenantHandler` (authenticated) resolve the tenant from the
  request and run the handler inside `runWithTenant()`.

## 3. EXISTENTIAL CHAIN (Collection → Public Experience)

```
Collection (DB)
  ↓ generateManifest()
WeddingManifest (JSON)
  ↓ persist
WeddingCollectionBinding.manifest (DB)
  ↓ resolveWeddingManifest()
WeddingManifest (runtime)
  ↓ SectionRenderer
Public experience (/w/[slug])
```

| Link | Implementation | Status |
|---|---|---|
| Collection → generateManifest | `src/lib/wedding/manifest.ts:130` | REAL |
| generateManifest → Binding | `src/lib/collections/index.ts:1051` (applyCollection) | REAL |
| Binding → resolveWeddingManifest | `src/lib/wedding/manifest.ts:228` | REAL |
| Binding.draftManifest → Designer | `src/app/api/weddings/[id]/design/route.ts` | REAL |
| Manifest → SectionRenderer | `src/components/wedding/SectionRenderer.tsx` | REAL |
| SectionRenderer → public | `src/app/w/[slug]/page.tsx` | REAL |

### Layouts (structural differentiation)

| Layout | Sections | Count |
|---|---|---|
| royal | hero, story, gallery, timeline, map, guest-auth | 6 |
| classic | hero, story, gallery, timeline, map, guest-auth | 6 |
| minimal | hero, story, timeline, guest-auth | **4** (no gallery, no map) |
| destination | hero, **gallery, story**, timeline, map, guest-auth | 6 (gallery before story) |
| modern | hero, timeline, gallery, story, guest-auth | **5** (no map) |

## 4. ROUTING

```
/                          → platform showcase (default wedding)
/w/[slug]                  → public wedding experience (tenant-scoped)
/w/[slug]/admin            → wedding admin (12 tabs)
/w/[slug]/invite/[code]    → guest invitation landing
/platform/admin            → platform command center
/platform/ops              → platform ops dashboard
/platform/login            → platform auth
/onboarding                → public lead capture + wizard
/api/platform/*            → platform-level APIs (cross-tenant, SUPER_ADMIN)
/api/weddings/[id]/*       → per-wedding admin APIs (tenant-scoped)
/api/guests/*              → guest CRUD (tenant-scoped)
/api/guest/*               → guest-facing APIs (public, tenant-scoped)
/api/collections/*         → collection catalog + apply
/api/check-in              → QR check-in (tenant-scoped, CONTROLLER+)
```

## 5. DATA MODEL (23 tables)

### Tenant root
- `Wedding` — the tenant entity (slug, couple, date, venue, status, plan)

### Tenant-scoped (13 models, auto-filtered by weddingId)
- `Guest`, `Table`, `Media`, `EventTimeline`, `CoupleStory`
- `Settings`, `Theme`, `MusicTrack`
- `GuestSession`, `GuestAccessLog`, `Invitation`
- `UsageCounter`, `WeddingCollectionBinding`

### Platform-level
- `AdminUser` (weddingId nullable — null for SUPER_ADMIN)
- `AuditLog` (weddingId nullable — null for platform events)
- `Subscription`, `Invoice` (1:1 + 1:N with Wedding)
- `Lead`, `PasswordResetToken`

### Collection Engine
- `Collection` (catalog product: themeSeed, luxuryPreset, lifecycle)
- `CollectionVariant` (A/B/C/D palette overrides)
- `CollectionModule` (34 slots across 5 packs, Penpot frame mapping)

## 6. AUTH MODEL

| Role | Scope | Capabilities |
|---|---|---|
| SUPER_ADMIN / PLATFORM_ADMIN | platform-wide | all weddings, billing, users, ops |
| ORGANIZER | single wedding | guests, tables, invitations, designer |
| CONTROLLER | single wedding | read guests, check-in |
| RECEPTION | single wedding | check-in only |
| DESIGNER | platform-wide | create/edit Collections (Phase 4) |
| (guest) | single wedding, token-scoped | view invitation, RSVP |

Auth: JWT (admin) + AES-256-GCM encrypted tokens (guest). CSRF double-submit
cookie on mutating admin routes. 2FA TOTP available for platform admins.

## 7. EVENT OS EVOLUTION (Phase 7, additive)

The `Wedding` model remains the canonical tenant (backward compat).
`src/lib/event-types.ts` introduces `EventType` (WEDDING/BIRTHDAY/CONFERENCE/
CORPORATE/PRIVATE_EVENT) stored in `Settings` key=`event_type`. The
terminology (hostLabels, guestTerm) lets the renderer adapt labels without
renaming the model. A future migration can add an `eventType` column to
Wedding and rename the model to Event — but that is out of RC scope.

## 8. PROVENANCE (Phase 1)

```
GitHub main SHA
  = VPS HEAD (git)
  = Docker image DEPLOY_SHA (ARG at build time)
  = Container runtime deploySha (/api/health)
```

The deploy script (`scripts/deploy-production.sh`) exports `DEPLOY_SHA=$(git
rev-parse HEAD)` and passes it to `docker compose build` as a build arg. The
Dockerfile bakes it into the image as `ENV DEPLOY_SHA`. The health endpoint
returns it. All three SHA must match for a certified deployment.
