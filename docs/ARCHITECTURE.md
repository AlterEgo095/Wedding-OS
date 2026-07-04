# AENEWS Wedding OS — Enterprise Architecture

## Vue d'ensemble

AENEWS Wedding OS est une plateforme SaaS multi-tenant pour la gestion de mariages : invitations digitales, QR codes, gestion d'invités, galerie, programme, musique, statistiques, et billing.

**Stack :** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · Prisma 6 (SQLite WAL) · Framer Motion

---

## Structure du projet

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # 48 routes API (7 namespaces)
│   │   ├── platform/             # Super-admin (13 routes)
│   │   ├── onboarding/           # Lead capture + wizard (5 routes)
│   │   ├── admin/                # Legacy per-wedding admin (3 routes)
│   │   ├── guests/               # Admin guest CRUD (7 routes)
│   │   ├── guest/                # Public guest auth + RSVP (8 routes)
│   │   ├── theme/                # Theme GET/PUT + apply-template
│   │   ├── custom-domain/        # Domain CRUD
│   │   ├── music/, media/, tables/, timeline/, couple-story/, settings/
│   │   ├── sitemap.ts            # Dynamic sitemap.xml
│   │   └── robots.ts             # Dynamic robots.txt
│   ├── w/[slug]/                 # Per-tenant public + admin
│   ├── platform/                 # Super-admin SPA
│   ├── onboarding/               # Public lead form
│   ├── admin/                    # Legacy per-wedding admin
│   ├── layout.tsx                # Root: fonts, ThemeProvider, PWA
│   └── page.tsx                  # Landing + default wedding
│
├── components/
│   ├── ui/                       # 48 shadcn/ui primitives
│   ├── admin/                    # 14 admin panels
│   ├── wedding/                  # ThemeInjector
│   ├── effects/                  # 5 visual effects (Canvas + DOM)
│   ├── luxury/                   # LuxuryVisualEngine + particle-engine
│   └── ...                       # 18 luxury wedding components
│
├── lib/
│   ├── config/                   # ⭐ Enterprise Configuration (Phase 0)
│   │   ├── platform.ts           # PLATFORM, DEFAULT_WEDDING_SLUG, FEATURES, ...
│   │   ├── plans.ts              # PLANS, getPlan(), planSupportsCustomDomain()
│   │   ├── settings-registry.ts  # SETTING_KEYS (50+ typed keys)
│   │   └── index.ts              # Barrel export
│   ├── db.ts                     # Prisma clients (db + tenantDb) + SQLite WAL
│   ├── auth.ts                   # Custom JWT (HS256, 8h, httpOnly cookie)
│   ├── tenant-context.ts         # AsyncLocalStorage tenant isolation
│   ├── guest-auth.ts             # Guest session tokens (AES-256-GCM)
│   ├── billing.ts                # WhatsApp-driven billing
│   ├── logger.ts                 # ⭐ Structured logger (Phase 0)
│   ├── rate-limit.ts             # In-memory rate limiter
│   ├── custom-domains.ts         # Domain validation
│   ├── themes/templates.ts       # 4 theme templates, 8 fonts, 4 layouts
│   ├── prisma-extensions/        # tenant-scoped Prisma extension
│   └── types.ts                  # Shared types
│
├── engines/                      # ⭐ Enterprise Engines (Phase 0 — interfaces only)
│   ├── core/types.ts             # ICoreEngine, EngineEvent, EventSubscriber
│   ├── theme/types.ts            # IThemeEngine, ThemeTemplate, IPenpotThemeBridge
│   ├── invitation/types.ts       # IInvitationEngine, InvitationTemplateEntity
│   ├── ai/types.ts               # IAIEngine, AIMessage, AITool, AIContext
│   ├── automation/types.ts       # IAutomationEngine, AutomationRule
│   ├── media/types.ts            # IMediaEngine, IStorageAdapter
│   ├── analytics/types.ts        # IAnalyticsEngine, WeddingAnalytics
│   ├── marketplace/types.ts      # IMarketplaceEngine, BrandKit
│   ├── penpot/types.ts           # IPenpotEngine, PenpotDesignTokens
│   └── index.ts                  # Barrel export
│
├── hooks/                        # use-mobile, use-toast
└── middleware.ts                 # No-op (auth in routes)
```

---

## Architecture Multi-Tenant

### Isolation (défense en profondeur)

```
Request → extractSlugFromRequest (header/query)
       → resolveWeddingBySlug (60s cache)
       → runWithTenant(ctx) [AsyncLocalStorage]
       → tenantDb.* (Prisma extension auto-injects weddingId)
       → Response
```

**Couches :**
1. **AsyncLocalStorage** — contexte tenant par-request, propagé aux async continuations
2. **Prisma extension** — auto-injecte `weddingId` dans `findMany/findFirst/count/create/updateMany/deleteMany`
3. **HOC route wrappers** — `withPublicTenant()`, `withAdminTenantHandler()`
4. **RBAC** — 5 rôles hiérarchiques, `resolveAdminTenant` ignore `X-Wedding-Slug` pour non-platform admins
5. **Audit logging** — 47 `auditLog.create` sur toutes mutations

### Résolution du tenant

| Source | Priorité | Usage |
|---|---|---|
| URL `/w/[slug]` | 1 | Pages per-wedding |
| Header `X-Wedding-Slug` | 2 | SPA sur root `/` |
| Query `?wedding=slug` | 3 | Fallback |
| Auth `user.weddingId` | 4 | Admin non-platform |
| `DEFAULT_WEDDING_SLUG` | 5 | Legacy compat (root `/`) |

---

## Enterprise Configuration (Phase 0)

### Source unique de vérité

```typescript
// Toute la config vient de src/lib/config/
import { PLATFORM, DEFAULT_WEDDING_SLUG, PLANS, getPlan, SETTING_KEYS, FEATURES }
  from '@/lib/config';
```

### Feature flags (rollout progressif)

```env
NEXT_PUBLIC_FEATURE_THEME_ENGINE=true      # Phase 1
NEXT_PUBLIC_FEATURE_INVITATION_ENGINE=true # Phase 3
NEXT_PUBLIC_FEATURE_AI_ASSISTANT=true      # Phase 4
NEXT_PUBLIC_FEATURE_AUTOMATION=true        # Phase 5
NEXT_PUBLIC_FEATURE_MARKETPLACE=true       # Phase 6
NEXT_PUBLIC_FEATURE_PENPOT=true            # Phase 2
NEXT_PUBLIC_FEATURE_COMMAND_CENTER=true    # Phase 7
```

---

## Engines Architecture (Phase 0 — interfaces)

### 9 Engines définis

| Engine | Rôle | Interface | Implémentation |
|---|---|---|---|
| **Core** | Wedding lifecycle, guests, tables, timeline, stats | `ICoreEngine` | Phase 1 (wrap tenantDb) |
| **Theme** | Colors, fonts, layouts, effects, animations | `IThemeEngine` | Phase 1 |
| **Invitation** | Templates, PDF, QR, variants | `IInvitationEngine` | Phase 3 |
| **AI** | Admin assistant, tool calling, analysis | `IAIEngine` | Phase 4 |
| **Automation** | Workflows, batch ops, triggers | `IAutomationEngine` | Phase 5 |
| **Media** | Storage abstraction (LOCAL + R2), library | `IMediaEngine` | Phase 7 |
| **Analytics** | Metrics, time series, platform stats | `IAnalyticsEngine` | Phase 7 |
| **Marketplace** | Themes/invitations/components store | `IMarketplaceEngine` | Phase 6 |
| **Penpot** | Design tool integration bridge | `IPenpotEngine` | Phase 2 |

### Pattern d'usage futur

```typescript
// Phase 1+: engines sont injectés, pas importés directement
const themeEngine = getEngine<IThemeEngine>('theme');
const theme = await themeEngine.getTheme(weddingId);
const cssVars = themeEngine.toCssVariables(theme);
// ThemeInjector consomme cssVars → globals.css applique
```

### Event system (foundation pour Automation)

```typescript
// Core Engine émet des events
type EngineEvent =
  | { type: 'wedding.created'; weddingId: string; slug: string }
  | { type: 'guest.added'; weddingId: string; guestId: string }
  | { type: 'guest.rsvp'; weddingId: string; guestId: string; status: string }
  | ...

// Automation Engine subscribe
automationEngine.subscribe('guest.rsvp', async (event) => {
  await sendThankYouEmail(event.guestId);
});
```

---

## Database Schema

### 26 modèles Prisma

**Tenant :** `Wedding` (root)  
**Auth :** `AdminUser` (RBAC 5 rôles)  
**Billing :** `Subscription`, `Invoice`, `UsageCounter`  
**Content :** `Guest`, `Table`, `Media`, `EventTimeline`, `CoupleStory`  
**Config :** `Settings` (KV per-wedding), `Theme`, `MusicTrack`  
**Sessions :** `GuestSession`, `GuestAccessLog`, `AuditLog`  
**Onboarding :** `Invitation`, `Lead`  
**Phase 0 Engines :** `ThemeTemplate`, `InvitationTemplate`, `MarketplaceItem`, `BrandKit`, `MediaLibrary`, `AIConversation`, `AIContext`, `Automation`

### SQLite optimisations (Phase 0)

```sql
PRAGMA journal_mode=WAL;       -- Concurrent reads during writes
PRAGMA busy_timeout=5000;      -- 5s wait instead of SQLITE_BUSY
PRAGMA synchronous=NORMAL;     -- Recommended for WAL
PRAGMA foreign_keys=ON;        -- Enforce onDelete: Cascade
```

### Indexes (Phase 0)

- `Wedding`: status, plan, isDefault, createdAt
- `AdminUser`: weddingId, role
- `Guest`: [weddingId, status], [weddingId, category], [weddingId, tableId], [weddingId, checkedIn], [weddingId, invitationViewed]
- Plus tous les `@@index` existants pré-Phase-0

---

## Security

### Authentification

| Flux | Mécanisme | Token |
|---|---|---|
| Admin | Custom JWT HS256 (8h) | Cookie httpOnly + `Authorization: Bearer` |
| Guest | AES-256-GCM token (30j) | Cookie + URL param |
| Platform | JWT avec `isPlatformAdmin` claim | Cookie httpOnly + localStorage ⚠️ |

### RBAC

```
SUPER_ADMIN (4)  ── alias PLATFORM_ADMIN ── weddingId=null (platform-wide)
ORGANIZER (3)    ── per-wedding owner
CONTROLLER (2)   ── per-wedding staff
RECEPTION (1)    ── per-wedding check-in only
```

### Défense en profondeur

- bcrypt cost 12
- Brute-force bans (10/h → 60min ban)
- One-time lookup tokens (guest auth)
- Search-lock (guest must auth before searching)
- Fingerprinting UA + IP-subnet
- Rate limiting (nginx + app IP + per-email)
- CSP, HSTS, frame-ancestors (nginx)

### Risques sécurité documentés (Phase 1)

- R-01 : Admin JWT en localStorage (XSS-exfiltrable)
- R-02 : `typescript.ignoreBuildErrors: true`
- R-03 : `xlsx@0.18.5` CVE-2023-30533

---

## Observability (Phase 0)

### Logger structuré

```typescript
import { createLogger } from '@/lib/logger';
const log = createLogger('ThemeEngine');

log.info('Theme applied', { weddingId, primaryColor });
log.error('DB query failed', { query }, err);
```

- **Output :** JSON en prod, pretty-print en dev
- **Sanitization :** password, token, secret → `[REDACTED]`
- **Metrics :** `trackError(code)` + `getErrorMetrics()`
- **Future :** swap vers pino/Sentry sans changer les call sites

---

## Roadmap d'évolution

| Phase | Objectif | Engines activés | Prêt ? |
|---|---|---|---|
| **1** | Theme Engine + stabilisation | Theme, Core | ✅ |
| **2** | Penpot Integration | Penpot | ✅ |
| **3** | Invitation Engine | Invitation | ✅ |
| **4** | AI Command Center | AI | ✅ |
| **5** | Automation Engine | Automation | ✅ |
| **6** | Marketplace | Marketplace | ✅ |
| **7** | Wedding OS Enterprise | Media, Analytics | ✅ |

**Toutes les interfaces sont définies. Les implémentations se branchent sur les contracts existants.**

---

## Command Center (Phase 7 — architecture préparée)

Le futur Command Center est le dashboard unifié pour super-admins. Architecture cible :

```
/platform/admin/
├── Shell.tsx              # Layout + nav + auth guard
├── tabs/
│   ├── DashboardTab.tsx   # Global stats (Analytics Engine)
│   ├── WeddingsTab.tsx    # Multi-wedding CRUD (Core Engine)
│   ├── AITab.tsx          # AI assistant chat (AI Engine)
│   ├── ThemesTab.tsx      # Global theme management (Theme Engine)
│   ├── InvitationsTab.tsx # Template library (Invitation Engine)
│   ├── AutomationsTab.tsx # Workflow rules (Automation Engine)
│   ├── MediaTab.tsx       # Global media library (Media Engine)
│   ├── BillingTab.tsx     # ✅ existe (Phase 6)
│   ├── OnboardingTab.tsx  # ✅ existe (Phase 7)
│   ├── PenpotTab.tsx      # Design sync (Penpot Engine)
│   └── MarketplaceTab.tsx # Asset store (Marketplace Engine)
```

**Actuel :** `platform/admin/page.tsx` (2217 LOC monolithique, 7 onglets inline).  
**Phase 1 :** Extraire les 5 onglets restants en composants dédiés (pattern BillingTab/OnboardingTab).  
**Phase 7 :** Ajouter les 5 nouveaux onglets engines.

---

## Dépendances

### Stack core
- next@16.1.1, react@19, prisma@6.11, typescript@5, tailwindcss@4
- framer-motion@12, lucide-react, shadcn/ui (48 primitives)

### Fonctionnel
- qrcode@1.5, jspdf@4, html-to-image + html2canvas-pro (download PNG/JPEG/PDF)
- xlsx@0.18.5 ⚠️ CVE (Phase 1: upgrade)
- bcryptjs@3, jsonwebtoken@9
- sharp@0.34 (image transforms)
- zod@4 (validation — 0 usage actuel, Phase 1: adopter)

### Future
- z-ai-web-dev-sdk@0.0.18 (AI Engine Phase 4)
- @tanstack/react-query@5 (server state Phase 1)

### Supprimées (Phase 0)
- ~~next-auth@4.24.11~~ (custom JWT à la place)
- ~~next-intl@4.3.4~~ (FR-only par design)
