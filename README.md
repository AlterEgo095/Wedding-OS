# AENEWS Wedding OS

> Multi-tenant SaaS platform for premium wedding design, deployment and
> day-of-event operations. Built and operated by **AENEWS**, deployed in
> production at [wedding.hpph.net](https://wedding.hpph.net).

---

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Pile technologique](#pile-technologique)
- [Architecture](#architecture)
- [Isolation multi-tenant](#isolation-multi-tenant)
- [Pipeline de déploiement](#pipeline-de-déploiement)
- [Démarrage rapide](#démarrage-rapide)
- [Variables d'environnement](#variables-denvironnement)
- [Aperçu de l'API](#aperçu-de-lapi)
- [Documentation](#documentation)
- [Limitations connues](#limitations-connues)

---

## Vue d'ensemble

**Wedding OS** is a multi-tenant SaaS: each wedding is an isolated tenant.
Three distinct surfaces share one Next.js codebase:

1. **Super Admin Production Studio** (`/platform/admin`) — platform-level
   command center where SUPER_ADMIN / PLATFORM_ADMIN operators manage the
   template catalog, theme library, component registry, platform assets,
   deployments, audit log and platform users. Drives the deployment
   pipeline that publishes weddings.
2. **Client backend** (`/w/[slug]/admin`) — per-wedding admin where the
   couple + their organizers manage 21 tabs: dashboard, weddings, guests,
   tables, families, groups, gifts, program, timeline, statistics, QR
   codes, invitations, check-in, media, music, settings, designer,
   appearance, access logs, users, audit.
3. **Public wedding frontend** (`/w/[slug]`) — guest-facing experience
   rendered from a published config snapshot: hero, couple story,
   gallery, timeline, map, RSVP, QR check-in, secure guest space.

The platform **deploys** wedding frontends — it does not author themes
manually. Designers work in the Production Studio; templates + themes +
assets + components are bound into a Collection, then a Super-Admin
triggers the 9-stage deployment pipeline which compiles and publishes
the frontend snapshot.

---

## Pile technologique

| Couche | Technologie | Notes |
|---|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack, standalone output) | React 19 |
| **Langage** | TypeScript 5 (strict) | `noImplicitAny: false` (legacy) |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York variant) | Radix primitives |
| **Icônes** | Lucide React | — |
| **Base de données** | SQLite (dev) + Prisma ORM 6 | PostgreSQL migration planned (P3) |
| **Auth** | JWT custom (`jsonwebtoken` + `bcryptjs`) | 2FA TOTP via `otplib` |
| **Multi-tenant** | `AsyncLocalStorage` + Prisma extension (fail-closed) | 17 tenant-scoped models |
| **State client** | Zustand (lightweight) | TanStack Query installed but not wired |
| **Forms** | React Hook Form + Zod (server-side schemas) | — |
| **Validation** | Zod 4 | Server-side on all CONS-5+ routes |
| **Drag-and-drop** | @dnd-kit | Table seating, program reorder |
| **Canvas** | Canvas 2D (LuxuryVisualEngine) | Gold dust, halos, breathing |
| **QR codes** | `qrcode` + AES-256-GCM tokens | Day-of-event check-in |
| **Charts** | Recharts | Statistics tab |
| **PDF** | jsPDF | Bulk QR code export |
| **Rate-limit** | in-memory + optional Redis (ioredis) | distributed when REDIS_URL set |
| **Production** | Docker multi-stage + docker-compose.prod.yml | non-root `nextjs`, no-new-privileges |
| **Reverse proxy** | Caddy (sur le VPS) | TLS automatique |
| **Runtime** | Node.js 20-alpine (container) / Bun (dev local) | — |

> **Note:** `next-auth` v4 is **not** wired — auth is JWT custom.
> `socket.io` + `socket.io-client` are installed but not used in `src/`.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       AENEWS Wedding OS (Next.js 16)                      │
├──────────────────────────────────────────────────────────────────────────┤
│  Multi-tenant core (AsyncLocalStorage + Prisma extension fail-closed)     │
│                                                                           │
│  ┌─────────────────────────┐   ┌─────────────────────────┐               │
│  │  Super Admin            │   │  Client backend         │               │
│  │  Production Studio      │   │  /w/[slug]/admin        │               │
│  │  /platform/admin        │   │  21 tabs (15 + 6 new)   │               │
│  │  10 tabs (4 + 6 prod)   │   │  weddings · guests      │               │
│  │  Dashboard · Weddings   │   │  tables · families      │               │
│  │  Users · Audit          │   │  groups · gifts         │               │
│  │  ── production/ ──      │   │  program · timeline     │               │
│  │  Templates · Themes     │   │  stats · qrcodes        │               │
│  │  Components · Assets    │   │  invitations · check-in │               │
│  │  Deployments            │   │  media · music          │               │
│  │  Governance             │   │  designer · appearance  │               │
│  │                         │   │  access · users · audit │               │
│  │  ↓ triggers             │   │  ↓ edits                │               │
│  │  deployment pipeline    │   │  tenant-scoped Prisma   │               │
│  └────────────┬────────────┘   └────────────┬────────────┘               │
│               │                              │                            │
│               ▼                              ▼                            │
│  ┌───────────────────────────────────────────────────────────┐           │
│  │  Deployment pipeline (9 stages)                           │           │
│  │  Template → Theme → Assets → Components → Bindings →      │           │
│  │  Collection → Wedding → Frontend                          │           │
│  │  persiste Wedding.publishedConfigJson + publishedVersion  │           │
│  └───────────────────────────────────────────────────────────┘           │
│                              │                                            │
│                              ▼                                            │
│  ┌───────────────────────────────────────────────────────────┐           │
│  │  Public wedding frontend (/w/[slug])                      │           │
│  │  layout.tsx reads publishedConfigJson → ThemeInjector     │           │
│  │  + SectionRenderer (hero, story, gallery, timeline, map)  │           │
│  │  + guest space (RSVP, QR check-in, personal gallery)      │           │
│  └───────────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Three surfaces, one codebase

| Surface | Path | Audience | Tabs |
|---|---|---|---|
| Super Admin Production Studio | `/platform/admin` | SUPER_ADMIN, PLATFORM_ADMIN | 10 (Dashboard, Weddings, Users, Audit + Templates, Themes, Components, Assets, Deployments, Governance) |
| Client backend | `/w/[slug]/admin` | ORGANIZER, CONTROLLER, RECEPTION (per-wedding) | 21 (15 original + 6 new: families, groups, gifts, program, stats, qrcodes) |
| Public frontend | `/w/[slug]` | Guests (token-scoped) | — (server-rendered from published config) |

---

## Isolation multi-tenant

Each wedding is a tenant. The tenant context (`weddingId`, `slug`, `status`,
`plan`) is propagated per-request via `AsyncLocalStorage` — no thread-local
leakage, no manual plumbing in route handlers.

### Tenant resolution priority

1. Custom domain (middleware `/api/resolve-domain`)
2. URL segment `/w/[slug]`
3. Header `X-Wedding-Slug`
4. Query string `?wedding=<slug>`
5. Default wedding (`isDefault=true`) — public showcase only

### Prisma extension fail-closed

`src/lib/prisma-extensions/tenant-scoped.ts` auto-injects `weddingId` into
all queries against **17 tenant-scoped models**:

> `Guest`, `Table`, `Media`, `EventTimeline`, `CoupleStory`, `Settings`,
> `Theme`, `MusicTrack`, `GuestSession`, `GuestAccessLog`, `Invitation`,
> `UsageCounter`, `WeddingCollectionBinding`, `Family`, `GuestGroup`,
> `Gift`, `ProgramItem`

If a query hits a tenant-scoped model **outside** a `runWithTenant()` block,
the extension throws `TENANT_FAIL_CLOSED`. Cross-tenant queries must use
the explicitly-named `unsafePlatformDb` client (visible in code review).

### Route wrappers

- `withPublicTenant(handler)` — unauthenticated public reads (33 routes).
- `withAdminTenantHandler(request, user, handler)` — authenticated mutations
  (49 routes). Resolves tenant, runs handler inside `runWithTenant()`.
- `resolveAdminTenant(request, user)` — lower-level resolver for routes
  that need custom control flow (pagination, etc.).

~82 wrapped routes out of 88 total. 6 platform-level routes use neither
(cross-tenant by design).

### Three Prisma clients (intentional vocabulary)

- `db` — platform-level (no tenant scope).
- `tenantDb` — auto-scoped via the extension (default for routes).
- `unsafePlatformDb` — explicit cross-tenant operations; name itself is a
  code-review red flag.

---

## Pipeline de déploiement

The deployment pipeline compiles a wedding's configuration into an
immutable, published snapshot that the public frontend renders.

### 9 stages

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

- **Who can trigger:** SUPER_ADMIN, PLATFORM_ADMIN only.
- **API:** `POST /api/platform/deployments/trigger` — Zod body, rate-limited
  10/min, audit-logged.
- **Retry:** `POST /api/platform/deployments/[id]/retry` — re-runs the
  pipeline from stage 1.
- **Public read:** `GET /api/weddings/[id]/published-config` — no auth,
  CDN-cached 60s/5min stale-while-revalidate.

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

Full pipeline docs: [`docs/DEPLOYMENT_PIPELINE.md`](./docs/DEPLOYMENT_PIPELINE.md)

---

## Démarrage rapide

### Prérequis

- [Bun](https://bun.sh/) ≥ 1.3 (runtime + package manager)
- Node.js 20+ (pour Prisma CLI + Next.js build)
- SQLite (préinstallé sur tous les OS modernes)

### Installation

```bash
bun install
bun run db:push       # Crée/migre le schéma SQLite
bun run db:generate   # Génère le client Prisma
bun run db:seed       # (optionnel) seed admin + demo wedding
```

### Démarrage

```bash
bun run dev           # Next.js dev server sur http://localhost:3000
bun run lint          # ESLint
bun run build         # Build production (standalone output)
```

Le serveur dev écoute sur le port **3000**. En production Docker, le
container `wedding-app` écoute sur le port **3080** (Caddy reverse-proxy
sur 443).

### Compte admin (dev local)

Après `bun run db:seed` (variables d'env requises):

- **Email** : valeur de `PLATFORM_ADMIN_EMAIL` (default `admin@example.com`)
- **Mot de passe** : valeur de `PLATFORM_ADMIN_PASSWORD` (requis en prod)

---

## Variables d'environnement

Voir [`.env.example`](./.env.example) pour le template complet.

| Variable | Description | Requis |
|---|---|---|
| `DATABASE_URL` | Chemin SQLite (dev) ou URL PostgreSQL (prod) | ✅ |
| `JWT_SECRET` | Secret signature JWT (min 32 chars). Rotation = invalidation sessions. | ✅ prod |
| `ENCRYPTION_KEY` | Clé AES-256-GCM (tokens invité, 2FA TOTP). **MUST differ from `JWT_SECRET`** (app refuse to start if equal). Min 32 chars. | ✅ prod |
| `PLATFORM_ADMIN_EMAIL` | Email admin initial (seed) | ✅ prod |
| `PLATFORM_ADMIN_PASSWORD` | Mot de passe admin initial (seed). Aucun fallback en prod. | ✅ prod |
| `NEXT_PUBLIC_BASE_URL` | URL publique (invitations, reset, CORS) | ✅ prod |
| `NODE_ENV` | `production` / `development` | ✅ |
| `SEED_DEMO_DATA` | `1` pour seed couple démo + invités | dev only |
| `REDIS_URL` | Optionnel — rate-limit distribué | optionnel |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Optionnel — envoi email (password reset). Non connecté = stub logger. | optionnel |

> ⚠️ **Rotation des secrets** : si `JWT_SECRET` ou `ENCRYPTION_KEY` sont
> leakés (git history, .env backup), ils doivent être **rotés** immédiatement.
> Voir `docs/ARCHITECTURE-CANONICAL.md` §6 (auth model) + `RELEASE-CHECKLIST.md`.

---

## Aperçu de l'API

### Publiques (avec tenant context, sans auth)
- `GET /api/collections` — catalogue Collections accessibles au plan
- `GET /api/theme` — thème du mariage courant
- `GET /api/settings` — paramètres publics du mariage
- `GET /api/guest/me` — espace invité (token AES-256-GCM required)
- `GET /api/couple-story` — histoire du couple
- `GET /api/timeline` — programme du jour
- `GET /api/media` — médias (filtrables)
- `GET /api/music` — configuration musique
- `GET /api/weddings/[id]/published-config` — snapshot publié (CDN-cached)

### Authentifiées (ORGANIZER+, tenant-scoped)
- `POST /api/guests` — CRUD invités (Zod validé)
- `POST /api/tables` — CRUD tables (Zod validé)
- `POST /api/timeline` — CRUD programme (Zod validé)
- `PUT /api/settings` — update paramètres (Zod validé)
- `POST /api/check-in` — check-in QR code (Zod validé)
- `POST /api/media` — upload médias
- `POST /api/weddings/[id]/{families,groups,gifts,program}` — CRUD étendu
- `GET /api/weddings/[id]/stats` — dashboard statistiques agrégées

### Plateforme (SUPER_ADMIN / PLATFORM_ADMIN)
- `GET/POST /api/platform/weddings` — CRUD mariages
- `POST /api/platform/weddings/[id]/duplicate` — duplique un mariage
- `GET/POST /api/platform/{templates,themes,components,assets}` — Production Studio
- `POST /api/platform/deployments/trigger` — déclenche le pipeline
- `GET /api/platform/deployments/[id]` — statut déploiement
- `POST /api/platform/deployments/[id]/retry` — retry
- `GET/POST /api/platform/leads` — pipeline leads
- `GET/POST /api/platform/billing` — subscriptions + factures

---

## Documentation

| Document | Description |
|---|---|
| [`docs/ARCHITECTURE-CANONICAL.md`](./docs/ARCHITECTURE-CANONICAL.md) | Architecture canonique post-consolidation (3 surfaces, isolation, modèle de données, auth) |
| [`docs/DEPLOYMENT_PIPELINE.md`](./docs/DEPLOYMENT_PIPELINE.md) | Pipeline 9 stages, data model, security model, failure modes, versioning |
| [`docs/PLAN_MULTI_TENANT.md`](./docs/PLAN_MULTI_TENANT.md) | Détails isolation multi-tenant (AsyncLocalStorage + Prisma extension) |
| [`docs/MONITORING.md`](./docs/MONITORING.md) | Healthcheck, logs, métriques runtime |
| [`docs/BACKUP.md`](./docs/BACKUP.md) | Stratégie de backup DB + volumes |
| [`KNOWN-LIMITATIONS.md`](./KNOWN-LIMITATIONS.md) | Ce qui est DEFER / PARTIAL / FUTURE (honnête) |
| [`RECOVERY.md`](./RECOVERY.md) | Branches/tags de recovery + procédure rollback DB |
| [`RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md) | Checklist de provenance GitHub SHA = VPS HEAD = Docker DEPLOY_SHA = runtime /api/health |

---

## Limitations connues

Voir [`KNOWN-LIMITATIONS.md`](./KNOWN-LIMITATIONS.md) pour la liste
complète et honnête. Résumé:

- **DEFER_EXTERNAL** — Stripe (colonnes existent, non connectées), SMS/Email/WhatsApp providers (Twilio/SendGrid/WhatsApp Business), Event OS full rendering (data model ready, renderer partiel).
- **PARTIAL** — GuestManager n'expose pas encore les sélecteurs `familyId` / `groupId` (FKs existent en DB, compteurs visibles dans FamiliesManager/GroupsManager via `_count`, mais l'UI d'assignation reste à ajouter). EventTimeline vs ProgramItem coexistent (timeline = histoire du couple, program = programme du jour J).
- **NON-BLOCKING** — Docker rebuild requis pour activer les routes API ajoutées après CONS-5/CONS-6 (le container `wedding-app` tourne sur une image bakée avant ces commits).

---

## Contributeurs

- **AENEWS** — conception, développement et opérations
- **Dieudonné Matanda** — product owner & vision

---

## Licence

Propriétaire — © AENEWS. Tous droits réservés.
Usage limité à la plateforme `wedding.hpph.net` et ses tenants.
