# ARCHITECTURE MAP — Wedding OS Rebuild (Mission 1.0, Phase B)
> Generated from recovered baseline 63117e1 (tag recovered-baseline-0.7).
> Short by design. No re-audit. Action-oriented.

## 1. QU'EST-CE QUI TOURNE ? (What runs)

**Active application** (Next.js 16 App Router + Prisma 6 + SQLite):

| Layer | Location | Count | Status |
|---|---|---|---|
| Frontend pages | `src/app/**/page.tsx` | 25 | Active (public `/`, `/w/[slug]`, `/w/[slug]/admin`, `/w/[slug]/invite/[code]`, `/platform/{admin,login,ops,forgot-password,reset-password,onboarding}`, `/admin`) |
| API routes | `src/app/api/**/route.ts` | 83 | Active across 14 domains (admin, collections, couple-story, csrf, custom-domain, designer, guest, guests, health, marketplace, me, media, music, onboarding, platform, registry, settings, tables, theme, timeline) |
| Lib / domain logic | `src/lib/` | 51 files | Active (auth, db, tenant-context, guest-auth, collections/, penpot/, config/, billing, rate-limit, audit, csrf, two-factor) |
| Components | `src/components/` | 8 dirs | Active (admin, collections, effects, luxury, penpot, providers, ui, wedding) |
| Hooks | `src/hooks/` | 3 | Active (use-authed-fetch, use-mobile, use-toast) |
| Engines | `src/engines/` | 10 dirs | **Scaffolding only** (each has only `types.ts`, no implementation) |
| Prisma schema | `prisma/schema.prisma` | 23 models, 657 LOC | Active, tenant-scoped (12 models with `weddingId`) |
| Mini-services | `mini-services/` | empty | Ready for WebSocket services (socket.io dep present) |

**Tenant isolation layer** (the P0-relevant surface):
- `src/lib/tenant-context.ts` (408 LOC) — AsyncLocalStorage tenant context + resolution (public/admin)
- `src/lib/prisma-extensions/tenant-scoped.ts` (181 LOC) — Prisma extension auto-injects `weddingId`
- **FAIL-OPEN #1**: `tenant-scoped.ts:101-103` — `if (!ctx) return query(args)` (passes through unscoped when ALS breaks)
- **FAIL-OPEN #2**: `tenant-context.ts:224` — `slug ?? DEFAULT_WEDDING_SLUG` (silent default fallback)

## 2. QU'EST-CE QUI EST DUPLIQUÉ ? (What's duplicated)

| Item | Duplication | Action |
|---|---|---|
| `backup-frontend/` (124 files) | Old Phase 1 frontend — superseded by `src/app/` + `src/components/` but has unique components (HeroSection, GuestSearch, etc. NOT in `src/components/wedding/`) | ARCHIVE to `archive/legacy/backup-frontend/` (reference, not runtime) |
| Root `.mjs` scripts (49 files) | Iterative debug deploy/vps/fix scripts — `scripts/archive/` already has 67 archived copies | DELETE (duplicates of archived versions; in recovery pack) |
| `scripts/deploy-vps-*.cjs` (13) + `scripts/deploy-phase8-*.cjs` (6) | Phase 8 one-time deploy scripts | Keep for now (not yet archived); evaluate after Phase L |
| `src/engines/*/types.ts` (10 dirs) | Empty engine scaffolding — types only, no implementation | MERGE into `src/server/services/` in Phase D, or remove if unused |

## 3. QU'EST-CE QUI EST MORT ? (What's dead)

| Item | Why dead | Action |
|---|---|---|
| `p3-screenshots/`, `p3-screenshots-v2/`, `p4-screenshots/`, `screenshots/` | Audit screenshots, not source | DELETE (in recovery pack) |
| `upload/`, `download/` | Runtime upload/download dirs | DELETE (runtime, not source) |
| `agent-ctx/` | Agent context files | DELETE (scratchpad) |
| `vps-backups/` | DB backup files | DELETE (in recovery pack) |
| `.initial_snapshot.json` | Sandbox session metadata | DELETE |
| `deploy-audit-report.json`, `deploy-result.json` | Deploy debug output | DELETE |
| `dev-watchdog.sh`, `start-dev.sh`, `deploy.sh`, `deploy-vps.sh`, `phase4-deploy.sh` (root) | Root-level shell scripts superseded by `.zscripts/` | Evaluate; keep `.zscripts/` as canonical |
| `COLLECTION_ENGINE_PLAN.md`, `COLLECTION_ENGINE_PLAN_V2.md`, `AUDIT_STRATEGIQUE_GLOBAL.md` | Planning/audit docs | MOVE to `docs/historical/` |

## 4. QU'EST-CE QUI DOIT FUSIONNER ? (What must merge)

| Merge | From → To | Reason |
|---|---|---|
| API route business logic → services | `src/app/api/**/route.ts` (inline Prisma) → `src/server/services/` | Routes should be thin; business logic in services |
| Tenant access → fail-closed | `tenant-scoped.ts:101-103` (fail-open) → reject when ctx missing | P0 security (Phase F) |
| Guest lookup + auto-auth → explicit weddingId | `lookup/route.ts:94,112` + `auto-auth/route.ts:52,136` → add `weddingId: context.weddingId` | P0 fix (Phase G) |
| Engines scaffolding → services or remove | `src/engines/*/types.ts` → `src/server/services/` or delete | Dead scaffolding |

## 5. QUELLE ARCHITECTURE FINALE ? (Final architecture)

The current `src/{app,components,hooks,lib}` structure is already a valid Next.js layout.
**No mechanical rewrite.** The rebuild improves IN PLACE:

```
src/
├── app/                      # Next.js App Router (thin routes)
│   ├── (public)/             # Public wedding pages (/, /w/[slug])
│   ├── (guest)/              # Guest experience (/w/[slug]/invite/[code])
│   ├── (admin)/              # Per-wedding admin (/w/[slug]/admin)
│   ├── platform/             # Platform admin (/platform/*)
│   └── api/                  # API routes (thin → call services)
├── server/                   # NEW — backend solidification (Phase F)
│   ├── auth/                 # Auth context, session, 2FA
│   ├── tenant/               # Tenant context (fail-closed), tenant-bound repos
│   ├── services/             # Business logic (guests, weddings, collections, billing)
│   ├── repositories/         # Prisma access layer (explicit weddingId)
│   └── observability/        # Audit, health, logging
├── components/               # UI components (keep current 8 dirs)
├── hooks/                    # Client hooks (keep)
└── lib/                      # Shared utilities (keep, prune dead code)

prisma/                       # Schema + migrations + seed
scripts/                      # Active ops scripts (security, migrate, backup, test)
docs/                         # Documentation (architecture, historical)
archive/legacy/               # Archived old code (backup-frontend)
```

**Key principle**: ONE RESPONSIBILITY = ONE LOCATION.
- API routes = request parsing + auth check + call service + response (≤50 LOC target)
- Services = business logic (tenant-aware, fail-closed)
- Repositories = Prisma access (explicit weddingId, no implicit scoping)
- Components = presentation only (no DB access, no business logic)

## 6. EXECUTION ORDER

Phase C (this) → Phase D (architecture recast) → Phase E (route inventory) →
Phase F (backend fail-closed) → Phase G (P0 fix) → Phase H (frontend) →
Phase I (DB from zero) → Phase J (git push) → Phase K (tests) → Phase L (resume impl)
