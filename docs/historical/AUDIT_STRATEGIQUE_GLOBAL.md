# AUDIT STRATÉGIQUE GLOBAL — AENEWS WEDDING OS ENTERPRISE

**Plateforme :** Heureux Mariage (AENEWS Wedding OS)
**Date de l'audit :** session courante
**Nature :** Audit stratégique, fonctionnel, technique, architectural et commercial — READ ONLY. Aucune modification du code, de la base de données, du frontend, du backend. Aucun déploiement. Aucun refactoring.
**Périmètre audité :** 18 modèles Prisma, 48 routes API, ~90 composants React, 14 modules lib, configurations Docker/nginx/Caddy, worklog 1243 lignes (Phases 1→8), PLAN_MULTI_TENANT.md.

---

## NOTE GLOBALE DE MATURITÉ (synthèse en fin de rapport)

| Dimension | Note /10 | Statut |
|---|---|---|
| **Architecture** | 6.5 | Solide fondation multi-tenant, dette technique notable |
| **Backend / API** | 6.0 | Noyau tenant-grade, validation fragmentée, 1 route cassée |
| **Base de données** | 5.5 | Schéma correct, SQLite non-WAL = blocage scale |
| **Frontend / UX-UI** | 8.5 | Craft visuel premium, gaps SEO + thème + a11y |
| **Administration** | 6.5 | 18 modules, 3 gaps fonctionnels majeurs |
| **Fonctionnalités métier** | 7.0 | 24 features, 70% Production Ready |
| **Scalabilité multi-tenant** | 7.5 | Isolation OK, caches single-instance |
| **Theme Engine (futur)** | 4.0 | Data model prêt, wiring runtime cassé |
| **Invitation Engine (futur)** | 2.5 | 1 template monolithique, 0 bibliothèque |
| **AI Assistant (futur)** | 2.0 | SDK installé, 0 intégration |
| **Command Center (futur)** | 5.0 | Proto existe (platform admin), monolithique |
| **Automatisations** | 3.0 | 1 seul flow automatisé (onboarding) |
| **Penpot (futur)** | 3.0 | Aucune intégration, faisabilité moyenne |
| **Commercial / SaaS** | 5.5 | Image premium, billing manuel = stopgap |
| **NOTE GLOBALE PONDÉRÉE** | **5.7 / 10** | **Prototype avancé → pré-Enterprise. Pas encore SaaS Premium commercialisable.** |

---

# PARTIE I — AUDIT DE L'ARCHITECTURE

## 1.1 Structure générale du projet

```
src/
├── app/
│   ├── api/              # 48 routes (~7.8k LOC) — 5 namespaces: platform/*, admin/*, onboarding/*, guests/*, guest/*
│   ├── w/[slug]/         # Per-tenant public + admin (server layout → client pages)
│   ├── platform/         # Super-admin (2217 LOC single page)
│   ├── onboarding/       # Public lead capture
│   ├── admin/            # Legacy per-wedding admin (hardcoded default wedding)
│   ├── page.tsx          # Landing + default wedding (505 LOC, 'use client')
│   └── layout.tsx        # Root: fonts, ThemeProvider, PWA, Toaster
├── components/
│   ├── ui/               # 48 shadcn/ui primitives (~30-40% unused)
│   ├── admin/            # 14 admin panels
│   ├── effects/          # 7 visual effects (2 unused: SectionEffects, ScrollReveal)
│   ├── luxury/           # 2 Canvas particle engine
│   ├── wedding/          # 1 ThemeInjector (Phase 8)
│   └── ...               # 18 luxury wedding components
├── lib/                  # 14 modules (db, auth, tenant-context, billing, guest-auth, themes, ...)
├── hooks/                # 2 (use-mobile, use-toast)
└── middleware.ts         # No-op (auth gérée dans chaque route)
```

**Layering :** Pages → API routes → lib (auth + tenant + Prisma) → Prisma client. **Aucune couche service/repository** entre routes et Prisma — chaque route ré-implémente validation + audit log (~30% de boilerplate). Acceptable à cette échelle, mais bloque l'évolution Enterprise.

## 1.2 Next.js 16 App Router

- **Server vs Client :** fortement client-biased. `src/app/page.tsx` (505 LOC), `src/app/w/[slug]/page.tsx` (336 LOC), `src/app/platform/admin/page.tsx` (2217 LOC) sont tous `'use client'`. Seuls les layouts sont server components.
- **Conséquence :** pas de SSR/ISR, pas de bénéfice SEO du server rendering, LCP risque sur mobile 4G.
- **Route groups :** AUCUN (`(platform)`, `(public)`, `(auth)` n'existent pas malgré le PLAN_MULTI_TENANT.md qui les liste). Structure plate.
- **`dynamic = 'force-dynamic'`** sur 47 routes — pas de cache accidentel de données tenant. ✓
- **`typescript.ignoreBuildErrors: true`** (next.config.ts:37) + `noImplicitAny: false` + ESLint désactivé (25+ règles off) = **aucun filet de sécurité statique**. Des bugs typés ship en prod (ex: `/api/music/file` cassé).

## 1.3 Prisma — qualité d'intégration

- **Deux clients** dans `db.ts` : `db` (raw, pour ops platform + auth + audit) et `tenantDb` (avec `$extends(tenantScopedExtension)` auto-injectant `weddingId`). Séparation propre, documentée JSDoc.
- **Aucun `prisma/migrations/`** — schema évolue via `prisma db push` (dev) + `scripts/migrate-phase8-db.cjs` (prod, manuel). Pas de rollback, pas de diff, pas d'historique.
- **Extension tenant-scoped** : injecte `weddingId` pour `findMany/findFirst/count/groupBy/aggregate/create/createMany/updateMany/deleteMany`. N'injecte PAS pour `findUnique/update/delete/upsert` → routes utilisent `findFirst({where:{id}})` (17 occurrences, pattern respecté). ✓
- **Drift de schéma** : `migrate-phase8-db.cjs` ajoute 3 indexes (`Wedding_status_idx`, `Wedding_plan_idx`, `Wedding_isDefault_idx`) **absents** de `schema.prisma`. Dev ≠ prod.

## 1.4 Médias / Stockage

- **Actuel :** filesystem LOCAL sous `/app/public/uploads/{slug}/` (médias) et `/app/public/uploads/{slug}/music/` (audio). Volume Docker `wedding-uploads` monté.
- **Phase 9 (R2) :** NON implémenté. Colonne `Media.storageProvider` existe avec défaut `'LOCAL'`, `'R2'` documenté mais jamais utilisé. Aucun dossier `src/lib/storage/`.
- **Bug critique :** `/api/music/file/route.ts` utilise `db.settings.findUnique({ where: { key: 'music_file' } })` — mais `Settings` a unicité composite `[weddingId, key]`, pas `key` seul. Requête Prisma invalide (silencieusement ignorée par `ignoreBuildErrors`). De plus `UPLOAD_DIR = public/uploads/music` (global) ≠ chemin per-tenant `uploads/{slug}/music/` utilisé par l'upload. **Route cassée en multi-tenant.**

## 1.5 Cache

5 caches en mémoire (tous single-instance) :
1. `weddingCache` (Map slug→CachedWedding, TTL 60s) — `tenant-context.ts:101`
2. `loginAttempts` (Map, 5 tentatives / 15 min) — `auth.ts:297`
3. `rateLimits` (Map) — `rate-limit.ts:4`
4. `bruteForceStore` (Map, 10/h, ban 60min) — `guest-auth.ts:91`
5. `usedLookupTokens` (Set, clear 10min) — `auto-auth/route.ts:16` — **perdu au restart = fenêtre de replay de 10 min**

**Aucun Redis.** Aucun cache HTTP (`Cache-Control` sur API ? non). nginx cache `/_next/static/` (1 an) et `/uploads/` (7-30j) mais PAS les réponses API. Tous ces caches cassent à 2+ replicas.

## 1.6 Docker / VPS

- **Dockerfile :** multi-stage 3 étapes (deps→builder→runner), Node 20 Alpine, user non-root `nextjs` via `su-exec`, healthcheck, `output: 'standalone'`. Hardening raisonnable.
- **docker-compose.prod.yml :** app seule, bind `127.0.0.1:3080:3000` (localhost-only). nginx sur host, vhost `heureuxmariage.aenews.net` → proxy `127.0.0.1:3080`. TLS Let's Encrypt.
- **nginx :** 3 zones de rate limit (`api:30r/m`, `login:5r/m`, `guest_auth:10r/m`), CSP, HSTS, frame-ancestors, gzip, OCSP stapling. ✅ Production-grade.
- **Caddyfile :** gateway sandbox `:81` avec `XTransformPort` — pas production.
- **Ressources :** 512MB RAM, 1 CPU (worklog mentionne upgrade VPS 2GB→11GB pour OOM build).
- **Mine opérationnelle :** `docker-entrypoint.sh` lance `node init-db.js` à chaque start, mais `init-db.js` ne crée que le schéma legacy pré-Phase-1 (pas de `weddingId`, pas de tables multi-tenant). Fresh deploy nécessite `docker exec wedding-app node /app/scripts/migrate-phase8-db.cjs` manuel. **Non documenté = bombe à retardement.**

## 1.7 Dépendances — santé

- **Stack moderne :** Next 16.1.1, React 19, Prisma 6.11, TS 5, Tailwind 4. ✅
- **`xlsx@0.18.5`** : CVE-2023-30533 (prototype pollution + ReDoS). À upgrader vers 0.20.2+.
- **`next-auth@4.24.11`** : présent mais **0 import** dans `src/`. Poids mort.
- **`next-intl@4.3.4`** : présent mais 0 import (FR-only). Poids mort.
- **`@tanstack/react-query@5.82`** : présent mais **0 `useQuery`** dans `src/`. Poids mort.
- **`ssh2@1.17`** : leftover scripts deploy VPS, pas runtime.
- **`z-ai-web-dev-sdk@0.0.18`** : présent mais **0 import** dans `src/`. Aucune intégration AI.
- **`html-to-image` + `html2canvas-pro`** : double fonctionnalité (les deux présents).
- **`react-syntax-highlighter`** : lourd, usage peu clair.
- **`bun.lock` + `package-lock.json`** coexistent = risque reproductibilité.

## 1.8 Architecture — forces

1. **Isolation tenant first-class** — AsyncLocalStorage + Prisma extension + HOC `withPublicTenant`/`withAdminTenantHandler` + `resolveAdminTenant` ignorant `X-Wedding-Slug` pour non-platform admins. Défense en profondeur.
2. **RBAC propre** — 5 rôles (`PLATFORM_ADMIN`, `SUPER_ADMIN` alias, `ORGANIZER`, `RECEPTION`, `CONTROLLER`), hiérarchie 4→1, `hasPermission(requiredRoles[])`, guards last-admin / self-delete / default-wedding.
3. **Guest auth défense en profondeur** — tokens AES-256-GCM, fingerprinting UA+IP-subnet, brute-force bans, one-time lookup tokens, search-lock.
4. **Audit logging omniprésent** — 47 `auditLog.create` sur toutes mutations admin + events guest + billing.
5. **`force-dynamic` partout** — pas de fuite de cache tenant.
6. **Hardening nginx** — CSP, HSTS, rate limiting zones, blocked WP/phpMyAdmin paths.

## 1.9 Architecture — faiblesses & risques

1. **`typescript.ignoreBuildErrors: true` + ESLint désactivé** — bugs typés ship en prod (déjà `/api/music/file` cassé).
2. **Pas de `prisma/migrations/`** + divergence `init-db.js` ↔ `migrate-phase8-db.cjs` — fresh deploys fragiles, pas de rollback.
3. **100% client components** — pas de SSR, SEO cassé pour multi-tenant (tous les weddings partagent le même title).
4. **Admin token en `localStorage`** (`platform/admin/page.tsx:297`, `platform/login/page.tsx:55`) — XSS-readable malgré le cookie httpOnly aussi set. Défait la protection httpOnly.
5. **Caches single-instance** — bloquent scale horizontale (Phase 9).
6. **TanStack Query installé mais inutilisé** — chaque composant re-rolling `useEffect`+`fetch`+`useState`. Pas de cache, pas de dedup, pas d'invalidation.
7. **Pas de couche service** — ~30% de boilerplate API répliqué.
8. **Page admin platform monolithique** (2217 LOC) — inaccessible à la maintenance.
9. **`xlsx@0.18.5`** — CVE connue.
10. **Aucun test, aucun CI** — scripts `test-*.ts` manuels one-offs.

## 1.10 Verdict architecture

**6.5 / 10** — La fondation d'isolation tenant est genuinely enterprise-grade (AsyncLocalStorage + Prisma extension + RBAC + audit). La vision stratégique (PLAN_MULTI_TENANT.md) est claire. MAIS la dette technique accumulée (TS désactivé, pas de migrations, page admin monolithique, caches single-instance, Phase 9 R2 absent, dépendances mortes, CVE) bloque l'évolution vers Enterprise sans d'abord payer le dette : (a) réactiver TS strict, (b) introduire Prisma migrations, (c) extraire couche service, (d) externaliser caches Redis, (e) implémenter R2, (f) splitter page admin. Direction correcte, fondation fissurée.

---

# PARTIE II — AUDIT DU FRONTEND

## 2.1 Inventaire composants

91 composants React + 1 engine TS :
- 18 composants luxury wedding (Hero, OurStory, EventTimeline, PremiumGallery, CoupleGallery, CouplePhotosSection, MapSection, Footer, Navigation, InvitationCard, GuestSearch, GuestAuthForm, GuestAuthProvider, GuestPersonalSpace, AmbientMusicPlayer, PWAInstall, AENEWSBanner, MarketingSection)
- 14 admin panels
- 7 effects (VisualEffectsLayer, SparkleEffect, FloatingParticles, BokehEffect, DynamicLightSweep, ScrollReveal, SectionEffects — **2 derniers dead code**)
- 2 luxury engine (LuxuryVisualEngine + particle-engine)
- 48 shadcn/ui (~12 réellement importés)
- 1 ThemeInjector (Phase 8)

**Dead code confirmé :** `MarketingSection.tsx`, `GuestSearch.tsx` (remplacé par GuestAuthForm), `CoupleGallery.tsx`, `CouplePhotosSection.tsx` (tous 2 hardcodés "Josué & Hornella" et non montés), `SectionEffects.tsx`, `ScrollReveal.tsx`.

## 2.2 Responsive & mobile

- **Mobile-first discipliné** — breakpoints `sm:/md:/lg:` partout. Hero countdown scale `w-20→sm:w-28→md:w-36`. Photos couple `w-32→sm:w-40→md:w-48`. CTAs stack mobile, row `sm:`.
- **Admin shell responsive** — desktop sidebar `hidden md:flex w-64` + mobile slide-in `w-70 z-50` + **mobile bottom tab bar** (5 premiers items, `safe-area-pb`). Excellent.
- **Safe-area iOS** — `.safe-area-pb` (`env(safe-area-inset-bottom)`) + `@supports (padding: max(0px))`. ✅
- **Footer sticky** — `min-h-screen flex flex-col` + `Footer mt-auto`. ✅
- **Zone admin cachée** — dot invisible 24×24px, long-press 3s ou 5 taps. **Hostile au mobile organizer** (pas d'affordance visible).
- **Touch targets** — plupart ≥44px. PWAInstall CTA trop petit (`px-3 py-1.5`).

**Verdict mobile : 8/10**

## 2.3 Animations & effets visuels

- **Framer Motion** partout, compétent : scroll reveals (`useInView`), stagger manuel, hover micro-interactions, page transitions admin (`AnimatePresence mode="wait"`), `layoutId` pour active-tab indicator, hero orchestré 6+ motion divs en 2.8s, envelope reveal 4-phase.
- **Luxury Visual Engine** = Canvas 2D custom, 0 dépendance externe : 3 types particules (stars twinkle+lifecycle, dust Perlin noise drift, sparkles flash), DOM halos, breathing global, 5 tiers perf (ultra→minimal), auto-detect hardware, FPS-based downgrade avec hysteresis (3 lectures <25fps pour downgrade, 5 >50fps pour upgrade, jamais en-dessous de "low"). **Excellent engineering.**
- **Redondance confirmée** — **2 systèmes d'effets parallèles** montés simultanément sur chaque page :
  1. `LuxuryVisualEngine` (Canvas, store `useLuxuryEngine`, tab admin `LuxuryExperienceManager`)
  2. `VisualEffectsLayer` (DOM sparkles+particles+bokeh, store `useVisualEffects`, tab admin `AppearanceManager`)
  
  `LuxuryVisualEngine.starrySky` ≈ `SparkleEffect` ; `goldenDust` ≈ `FloatingParticles` ; `luminousHalos` ≈ `BokehEffect`. **5-7 systèmes de particules se chevauchent** sur une page par défaut (canvas 500+ + DOM 26 + inline particles dans HeroSection/OurStory/EventTimeline/MarketingSection/GuestAuthForm/GuestPersonalSpace).
- **`prefers-reduced-motion`** honoré en CSS (`.globals.css`) mais PAS en JS (Canvas ignore, Framer Motion ignore).
- **`SectionEffects.tsx` et `ScrollReveal.tsx`** : dead code.

**Verdict animations : 7/10** — Craft premium mais redondance architecturelle smell.

## 2.4 UX / UI polish

- **Hero** : crossfade 4 photos 8s, parallax scroll, 3-layer overlay, 8 motion divs séquencés, dual couple photos avec anneaux conic-gradient rotatifs, countdown halos pulsants, 2 CTAs `btn-premium`. **Excellent.** (Faiblesse : les 2 CTAs scrollent vers le même anchor.)
- **InvitationCard** : 3:4.2 aspect, paper texture, gold border+glow, shimmer overlay, flourish SVG, photos couple overlapping, names gold-gradient, guest info + table + category badge + QR code, personal message quoted. **Centre émotionnel.**
- **GuestPersonalSpace** (751 LOC) : envelope reveal 4-phase 3.5s cinématique + RSVP + share (WhatsApp/Messenger/Telegram/Email) + download (PNG/JPEG/PDF via hidden 700px render canvas) + QR + encrypted link copy + access stats. **Genuinely premium.**
- **Onboarding** : hero + 4 plan cards (PREMIUM "Le plus populaire") + 4-feature grid + form react-hook-form+zod + success animated Heart. **9/10.**
- **Footer + AENEWSBanner** : branding fort, **MAIS Footer hardcoded "Josué & Hornella" / "#JosueEtHornella2026"** — fuite multi-tenant.
- **Loading states** : skeletons (EventTimelineSkeleton, MapSectionSkeleton, CoupleGallerySkeleton), toasts sonner, error states per-route. ✅
- **Cohérence graphique** : palette gold `oklch(0.68 0.12 85)` + rose-gold + champagne + cream. 4 fonts via `next/font/google` (Geist, Geist Mono, Playfair Display, Cormorant Garamond). Drift : plusieurs composants hardcodent hex (`#C4A265`, `#8B6914`) au lieu de `var(--gold)`.

**Verdict UX/UI : 8.5/10** — Craft commercial premium. Déductions pour hardcodés Josué/Hornella, double système particules, ThemeInjector non wire.

## 2.5 Accessibilité

- **HTML sémantique** : `<main>`, `<header>`, `<footer>`, `<nav>`, `<section>` avec anchors, `<h1>` unique dans Hero. Pas de `<article>` pour stories/timeline.
- **ARIA sparse** : 51 attributs sur 23 composants / 91. `aria-hidden` ok sur décoratifs. `GuestAuthForm` input n'a pas `<Label htmlFor>` associé. Pas de `aria-live` sur envelope reveal. Pas de `aria-current="page"` sur nav active. **Pas de skip-to-main link.**
- **Alt text** : `HeroSection` dynamique (`alt={groomName}`), `InvitationCard` hardcodé (`alt="Josué"`), `Footer` hardcodé, `PremiumGallery` ok avec fallback.
- **Clavier** : tous interactifs sont `<button>`/`<a>`/shadcn. Lightbox `PremiumGallery` **pas de focus trap, pas de Escape-to-close**. Mobile admin sidebar pas de Escape handler.
- **Contraste** : `text-white/30`, `text-white/40`, `text-muted-foreground/40` probablement sous WCAG AA 4.5:1 sur dark hero.
- **`prefers-reduced-motion`** : CSS only, pas JS.

**Verdict a11y : 5/10** — Basiques présentes, mais échouerait un audit commercial.

## 2.6 SEO / PWA / Performance

- **Métadonnées** : SEULEMENT `src/app/layout.tsx` exporte `metadata`, hardcodé "Mariage Josué & Hornella". **Pas de `generateMetadata` sur `/w/[slug]/layout.tsx`** (qui est server component et pourrait). Tous les weddings partagent le même title/description/OG. **Bloqueur SEO multi-tenant.**
- **`/onboarding`** : pas de metadata → title "Mariage Josué & Hornella" (faux).
- **Routes admin** : pas de `noindex`.
- **`metadataBase`** fallback sandbox URL, pas `heureuxmariage.aenews.net`. OG image = PWA icon, pas vraie preview sociale.
- **Pas de canonical** sur `/w/[slug]` → risque duplicate-content.
- **`robots.txt`** permissif (`Allow: /`), pas de sitemap, pas de `Disallow /admin,/platform,/api`.
- **`manifest.json`** bien formé (8 icons 72-512px, maskable, standalone, portrait, fr) **MAIS hardcodé "Mariage Josué & Hornella"** — PWA install sur autre wedding affiche "J & H 2026".
- **`sw.js`** : cache name `josue-hornella-wedding-v2`, network-first navigation, cache-first static. Hardcodé. Pas de `id`, pas de `shortcuts`, pas de `screenshots`.
- **PWAInstall** : bottom sheet mobile-first, `beforeinstallprompt` géré, SW register dans PWAInstall (pas dans root layout → pas register sur `/onboarding` ou `/admin`).
- **Images** : `next/image` avec `sizes` explicites, `priority` sur hero, `sharp` installé. Mix `next/image` et `<img>` brut (Footer, GuestSearch, GuestPersonalSpace).
- **Fonts** : 4 via `next/font/google` self-hosted (display swap). ThemeInjector injecte Google Fonts CDN pour 8 options Phase 8 — FOUC risk.
- **Bundle** : `output: standalone` ✅. `recharts` que sur platform admin. `html-to-image`+`html2canvas-pro`+`jspdf` chargés sur chaque guest view (devraient être code-split). `next-auth`, `next-intl`, `react-syntax-highlighter` probablement dead weight.

**Verdict SEO/PWA/perf : 5/10**

## 2.7 Dark mode & Theme system

- **next-themes** (v0.4.6) wrapper, `attribute="class"`, `defaultTheme="light"`, `enableSystem`, `suppressHydrationWarning`. Toggle dans Navigation (desktop+mobile) avec animated icon swap. `LuxuryVisualEngine` switch colors sur `resolvedTheme === 'dark'`. ✅
- **ThemeInjector (Phase 8)** : side-effect client component, fetch `/api/theme`, injecte `--theme-primary`, `--theme-accent`, `--theme-font-display`, `--theme-font-body` dans `document.documentElement`. Load Google Fonts dynamic. **GAP CRITIQUE :** ces `--theme-*` ne sont PAS wire dans les tokens Tailwind (`@theme inline` mappe `--gold`/`--champagne`, pas `--theme-*`). **Aucun composant ne consomme `--theme-*`.** Changer de thème = variables CSS injectées mais visuel inchangé. **Phase 8 = data-only, visuellement non-fonctionnelle.**
- **4 templates** (Or Classique gold, Rose Romantique blush, Minimal Moderne gray, Nuit Royale gold+navy) — choix de goût, descriptions FR soignées, bloc preview. **Qualité design haute.**
- **8 fonts** (Cormorant, Playfair, Marcellus, Lora, Inter, Lato, Montserrat, Italiana) + **4 layouts** (classic, modern, minimalist, royal). **MAIS le champ `layout` est stocké et retourné, AUCUN composant ne le lit.** Layout selection = cosmétique.
- **Hardcoded `X-Wedding-Slug: 'josue-hornella'`** dans ThemeInjector fetch — dead code (intercepteur global override via guard `if (!headers.has(...))`).

**Verdict theme system : 4/10** — Data model + API + admin UI bien conçus. Wiring runtime cassé. Framework en place, branchement manquant.

## 2.8 Top findings frontend

**Forces (5) :**
1. Craft visuel genuinely premium (hero, invitation, envelope reveal, admin shell)
2. Canvas particle engine custom avec adaptive perf (5 tiers, hysteresis, hardware detect)
3. Multi-tenant via `useLayoutEffect` fetch interceptor — pattern propre
4. Guest journey complète (lookup → auto-auth → envelope → RSVP → share → download PNG/JPEG/PDF)
5. Admin shell responsive avec mobile bottom tab bar

**Faiblesses (5) :**
1. Theme system non-fonctionnel au runtime (`--theme-*` non consommés, `layout` ignoré)
2. SEO multi-tenant cassé (1 seul title hardcoded, pas de `generateMetadata`)
3. Hardcoded "Josué & Hornella" leak (Footer, CoupleGallery, CouplePhotosSection, InvitationCard alt, Navigation mobile, EventTimeline end marker)
4. 2 systèmes d'effets parallèles redondants + 5+ inline particles
5. A11y gaps (pas de skip link, pas de focus trap lightbox, label non associé, contraste low)

**Quick wins (5) :**
1. Ajouter `generateMetadata` à `/w/[slug]/layout.tsx` (server component, déjà accès au wedding)
2. Supprimer dead code (MarketingSection, GuestSearch, CoupleGallery, CouplePhotosSection, SectionEffects, ScrollReveal — ~1500 LOC)
3. Rendre `Footer.tsx` settings-driven (pattern existe dans HeroSection)
4. Wire `--theme-*` dans `@theme inline` (`--color-gold: var(--theme-primary, oklch(...))`)
5. A11y : `<Label htmlFor>` sur GuestAuthForm + skip-to-main + Escape-to-close lightbox

---

# PARTIE III — AUDIT DU BACKEND / API

## 3.1 Inventaire routes API (48 routes)

| Namespace | Routes | Auth | Tenant-scoped |
|---|---|---|---|
| `/api/platform/*` | 13 (login, logout, dashboard, users, users/[id], weddings, weddings/[id], weddings/[id]/subscription, subscription/whatsapp, weddings/[id]/invoices, invoices, invoices/[id], billing/weddings) | PLATFORM_ADMIN | non (cross-tenant) |
| `/api/onboarding/*` | 5 (leads, leads/[id], leads/[id]/convert, create-wedding, publish) | mixed (public POST lead, PLATFORM_ADMIN le reste) | non |
| `/api/admin/*` | 3 (login, dashboard, users) | CONTROLLER+ / SUPER_ADMIN | partiel (legacy) |
| `/api/guests/*` | 7 (CRUD, search, export, import, import-docx, qrcode/[code]) | mixed | admin-tenant |
| `/api/guest/*` | 8 (auth, auto-auth, logout, me, lookup, invite, rsvp, access-logs) | public / guest-session | public-tenant |
| `/api/{content}` | 8 (media, music, music/file, tables, timeline, couple-story, settings, theme, theme/apply-template, custom-domain) | mixed | both |
| `/api/` | 1 (healthcheck "Hello world") | none | n/a |

## 3.2 Authentification

- **Admin auth** (`lib/auth.ts`) : custom JWT HS256 (`jsonwebtoken`), 8h expiry, claims `{id, email, name, role, weddingId, isPlatformAdmin}`. Token livré via `Authorization: Bearer` ET cookie httpOnly `auth_token` (secure prod, sameSite=lax). `getAuthUser()` re-fetch user DB à chaque request → pas de stale-claim. **`JWT_SECRET` fallback hardcoded dev si env missing** (juste `console.warn`). bcrypt cost 12. ✅
- **Guest auth** (`lib/guest-auth.ts`) : JWT secret dérivé `JWT_SECRET + '-guest-session'`, 30j expiry. Sessions en DB (`GuestSession`), validées à chaque request via `tenantDb.guestSession.findFirst` (auto-scoped wedding → prévient cross-tenant hijack). Fingerprint UA+IP-subnet SHA256. One-time lookup tokens. Cookie `guest_session` httpOnly 30j. ✅
- **Plateform admin shell utilise `localStorage`** pour le MÊME token (`platform/admin/page.tsx:297`) — XSS-readable. Le cookie httpOnly est set mais le client préfère `Authorization: Bearer` depuis localStorage. **Un XSS dans le SPA admin 2217 LOC leak le token platform-admin.**
- **Logout stateless** pour admins (cookie delete only). **JWT irrévocable** avant 8h. Pas de blocklist server-side.

## 3.3 RBAC

5 rôles hiérarchiques (`types.ts:51`) : `PLATFORM_ADMIN`=4, `SUPER_ADMIN`=4 (alias legacy), `ORGANIZER`=3, `RECEPTION`=2, `CONTROLLER`=1. `hasPermission(userRole, requiredRoles[])` + `assertWeddingAccess(user, weddingId)` + `resolveAdminTenant` ignore `X-Wedding-Slug` pour non-platform. Guards last-admin / self-delete / default-wedding. Matrice documentée `auth.ts:119-135`. ✅

**Gap :** `/api/admin/users` (legacy) utilise `'SUPER_ADMIN'` littéral au lieu de `'PLATFORM_ADMIN'` canonique. Coexiste avec `/api/platform/users` — 2 APIs user-management parallèles, confusing.

## 3.4 Multi-tenancy enforcement

- **Solide au data layer** : `TENANT_SCOPED_MODELS` couvre 12 modèles. Auto-injection pour bulk ops. Pattern `findFirst({where:{id}})` respecté pour by-id mutations (17 occ). `AdminUser` et `AuditLog` non-scoped (platform-level, nullable weddingId). ✅
- **Résolution tenant** : `X-Wedding-Slug` header → `?wedding=` query → default wedding. DRAFT→404, SUSPENDED→403. Non-platform admins lock sur `user.weddingId`. ✅
- **IDOR audité** : `/api/guests/[id]` dual-auth avec check `session.guestId !== id` → 403 + audit. `/api/guest/rsvp` utilise `session.guestId` du token (pas du body). `/api/guests/qrcode/[code]` tenant-scoped `findFirst`. **`/api/music/file` = IDOR potentiel** (broken query mais si "fixé" naïvement → cross-tenant leak). ✅ sinon.

## 3.5 Validation

- **Zod 4.0.2 installé mais 0 usage** dans `src/`. 100% hand-rolled (`typeof`, regex `EMAIL_REGEX`, enum-`includes`, length checks manuels).
- **Coverage ~75%**. Plus fort : `/api/onboarding/create-wedding` (13 champs validés). Plus faible : `/api/admin/dashboard` (0 validation), `/api/music/file` (basename only), `/api/guest/access-logs` (limit/offset non bornés), `/api/guests` GET (limit non borné → dump table entière possible), `/api/guests/import` (pas de row-count cap → 100k rows possible), `/api/timeline` + `/api/couple-story` (pas de length limit sur title/description).

## 3.6 Erreurs & logging

- **Try/catch dans 46/48 routes** (sauf `/api/` et `/api/music/file`).
- **Réponses uniformes** : `{ error: 'Internal server error' }` 500 + `console.error`. **Pas de logging structuré** (pas de winston/pino), pas de request ID propagé, pas de corrélation nginx↔app.
- **Pas d'error tracking** (pas de Sentry/Bugsnag). Erreurs prod → `docker logs` only.
- **Audit log excellent** — 47 écritures couvrant toutes mutations + events guest + billing. ✅

## 3.7 Rate limiting — 3 couches

1. **nginx** : `api:30r/m`, `login:5r/m`, `guest_auth:10r/m`
2. **App IP** (`rate-limit.ts`) : admin login 10/15min, platform login 10/15min, guest auth 10/min, auto-auth 5/min, onboarding lead 5/15min
3. **Per-email** (`auth.ts`) : 5 tentatives / 15 min

**Gaps :** `/api/guest/lookup` (name search) **0 rate limit** → enumeration possible. `/api/guest/invite` GET (token validation) 0 rate limit. `/api/guests/import` + `/api/guests/import-docx` 0 rate limit (DoS possible). `/api/media` POST 0 rate limit (10MB cap only). Tous admin CRUD 0 rate limit. **Tous in-memory → cassent à 2+ replicas.**

## 3.8 Vulnérabilités trouvées

| # | Sévé | Vuln | Localisation |
|---|---|---|---|
| 1 | HAUTE | Admin JWT en `localStorage` (XSS-readable) | `platform/admin/page.tsx:297` |
| 2 | HAUTE | `ignoreBuildErrors: true` ship type errors (déjà `/api/music/file` cassé) | `next.config.ts:37` |
| 3 | HAUTE | `xlsx@0.18.5` CVE-2023-30533 (prototype pollution + ReDoS) | `package.json:89` |
| 4 | MOY | JWT irrévocable (stateless, 8h, pas de blocklist) | `lib/auth.ts` |
| 5 | MOY | `JWT_SECRET` fallback hardcoded si env missing | `lib/auth.ts:28` |
| 6 | MOY | `/api/music/file` IDOR potentiel + broken | `api/music/file/route.ts:32` |
| 7 | MOY | `/api/guest/lookup` 0 rate limit → enumeration | `api/guest/lookup/route.ts` |
| 8 | MOY | `usedLookupTokens` perdu au restart (replay 10min) | `api/guest/auto-auth/route.ts:16` |
| 9 | MOY | Rate limits in-memory → N× moins efficace à 2+ replicas | global |
| 10 | MOY | `init-db.js` legacy ↔ `migrate-phase8-db.cjs` divergent | `Dockerfile`, `init-db.js` |
| 11 | BAS | Pas de length limit sur title/description/activity | `api/timeline`, `api/couple-story` |
| 12 | BAS | Pas de upper bound sur `limit` query | `api/guests:24` |
| 13 | BAS | Pas de row cap sur import XLSX | `api/guests/import` |
| 14 | BAS | Pas de CSRF (compensé par sameSite=lax + Bearer) | global |
| 15 | INFO | CSP `'unsafe-inline' 'unsafe-eval'` | `nginx.conf:182` |
| 16 | INFO | 0 risque SQLi (100% Prisma query builder) | global |

## 3.9 Backend — forces

1. Pattern tenant-scoping consistent via HOC (3 lignes de boilerplate par route)
2. Guest auth defense-in-depth (AES-256-GCM + fingerprint + brute-force + one-time tokens + search-lock)
3. Onboarding wizard atomique `db.$transaction` (6 entités + 3 audit logs)
4. Audit trail omniprésent (47 writes)
5. Manual WhatsApp billing bien pensé (amountAgreed override, USD→FCFA, deeplink wa.me E.164)
6. Guards platform-admin (self-delete, last-admin, default-wedding)
7. `force-dynamic` per-route

## 3.10 Backend — faiblesses

1. 0 zod malgré dependency → validation fragmentée
2. Pas de couche service → ~30% boilerplate
3. Pas de logging structuré / error tracking
4. Rate limits single-instance
5. `/api/music/file` cassé
6. `/api/admin/users` legacy duplique `/api/platform/users`
7. JWT localStorage + irrévocable
8. `init-db.js` ↔ `migrate-phase8-db.cjs` divergent
9. 0 test, 0 CI

**Verdict backend : 6/10**

---

# PARTIE IV — AUDIT DE LA BASE DE DONNÉES

## 4.1 Inventaire modèles (18)

| Modèle | Purpose | Tenant | Indexes clés |
|---|---|---|---|
| Wedding | Tenant top-level | n/a | `@unique(slug)`, `@unique(customDomain)` — **manque @@index status/plan/isDefault/createdAt** |
| AdminUser | Staff | partiel (weddingId?) | `@unique(email)`, `@@index([weddingId])` — **manque index role** |
| Subscription | Billing 1:1 | oui | `@unique(weddingId)`, `@unique(stripeCustomerId)` — **manque index status** |
| Invoice | Factures | oui (denorm) | `@@index([weddingId, status])`, `@@index([subscriptionId])` ✅ |
| UsageCounter | Metered | oui | `@@unique([weddingId, metric, period])` ✅ |
| Guest | Invités | oui NOT NULL | `@@unique([weddingId, invitationCode])`, `@@index([weddingId, status])`, `@@index([weddingId, category])`, `@@index([weddingId, tableId])` — **manque checkedIn, invitationViewed, lastAccessAt** |
| Table | Tables | oui NOT NULL | `@@unique([weddingId, number])` ✅ |
| Media | Fichiers | oui NOT NULL | `@@index([weddingId, category])`, `@@index([weddingId, type])` ✅ |
| EventTimeline | Programme | oui NOT NULL | `@@index([weddingId])` — **manque index order** |
| CoupleStory | Histoire | oui NOT NULL | `@@index([weddingId])` — **manque index order** |
| Settings | KV config | oui NOT NULL | `@@unique([weddingId, key])` ✅ |
| Theme | Thème 1:1 | oui | `@unique(weddingId)` ✅ |
| MusicTrack | Musique 1:1 | oui | `@unique(weddingId)` — **DEAD MODEL, jamais utilisé (music stockée dans Settings keys)** |
| GuestSession | Sessions | oui NOT NULL | `@unique(token)`, `@@index([weddingId, guestId])` — **manque isActive, expiresAt** |
| GuestAccessLog | Audit guest | oui NOT NULL | `@@index([weddingId, createdAt])`, `@@index([weddingId, guestId])` — **manque action, ipAddress** |
| AuditLog | Audit admin | partiel | `@@index([weddingId, createdAt])`, `@@index([userId])` — **manque @@index([createdAt]) seul pour cross-tenant** |
| Invitation | Onboarding | oui NOT NULL | `@@index([weddingId, status])` ✅ |
| Lead | Lead capture | NON (platform) | `@@index([status])`, `@@index([createdAt])` ✅ |

## 4.2 Relations & intégrité

- 18 modèles, IDs `cuid()`.
- **Cascade rules** : `Wedding → {toutes entités tenant}` `onDelete: Cascade` ✅ (wedding delete purge tout). `Subscription → Invoice` Cascade ✅. `Guest → GuestSession` Cascade ✅. `Guest → GuestAccessLog` SetNull ✅ (préserve logs). `Table → Guest.tableId` SetNull ✅. `AdminUser → AuditLog.userId` SetNull ✅.
- **Risque orphelin** : `Lead.convertedWeddingId` dénormalisé sans FK (schema:424) → dangling pointer si wedding deleted. `Invoice.confirmedBy` sans FK → dangling si admin deleted.

## 4.3 Index manquants (queries dashboard)

1. `Wedding.status/plan/isDefault/createdAt` — platform dashboard filtre/groupe par là. Migration script les ajoute mais **pas dans schema.prisma** → drift dev/prod.
2. `AdminUser.role` — `groupBy(role)` full scan
3. `Subscription.status` — billing overview
4. `Guest.checkedIn, invitationViewed` — dashboard counts
5. `GuestSession.isActive, expiresAt` — cleanup
6. `GuestAccessLog.action, ipAddress` — dashboard + suspiciousIPs aggregation
7. `AuditLog.createdAt` seul (sans weddingId) — platform recent activity cross-tenant
8. `EventTimeline.order, CoupleStory.order` — toujours `orderBy: order`
9. `Invoice.status` seul — cross-tenant "all OPEN"
10. `Lead.email` — search

## 4.4 Normalisation

1NF/2NF/3NF ✅ avec dénormalisations intentionnelles documentées :
- `Invoice.weddingId` denorm de `Subscription.weddingId` (pour queries cross-tenant sans join)
- `Wedding.coupleLabel` denorm de `brideName & groomName` (sync via `buildCoupleLabel()`)
- `Guest.displayName` denorm de `firstName + lastName`

**Anti-pattern JSON-in-string** (SQLite n'a pas JSON type natif) :
- `Settings.value` (String) — stocke tout en string : booléens `'true'`, nombres `'0.25'`, couleurs `'#D4A853'`, dates. **0 type safety.**
- `Theme.customizations` (String?, JSON stringifié) — `JSON.parse` dans `api/theme/route.ts:22,86,117`. **0 validation du parsed.**
- `Table.location` (String?, JSON `{"x":0,"y":0}`)
- `GuestSession.deviceInfo`, `GuestAccessLog.deviceInfo` — JSON `{browser, os, device, isMobile}`

## 4.5 Multi-tenancy isolation

**Excellente.** Toute table tenant-scoped a `weddingId` NOT NULL (post-Phase-2). Uniqueness scoped : `@@unique([weddingId, invitationCode])`, `@@unique([weddingId, number])`, `@@unique([weddingId, key])`. 1:1 via `weddingId @unique` (Theme, MusicTrack, Subscription). `AdminUser.weddingId` nullable (PLATFORM_ADMIN). `AuditLog.weddingId` nullable (events platform). `Lead` sans weddingId (pre-tenant). `Invoice.weddingId` denorm. ✅

## 4.6 Scalabilité SQLite

- **WAL mode NON activé** malgré ADR-4 du PLAN_MULTI_TENANT.md l'exigeant. `db.ts`, `init-db.js`, `docker-entrypoint.sh` — aucun `PRAGMA journal_mode=WAL` ni `busy_timeout=5000`. SQLite défaut = rollback-journal = single-writer.
- **Risque contention écriture HAUT** : RSVP route fait `findFirst → update` (non-atomique). `guest.update` écrit aussi `GuestSession.lastAccessedAt` et `Guest.lastAccessAt` sur chaque `/api/guest/me` → hot rows. Samedi soir peak RSVP → `SQLITE_BUSY` errors.
- **DB actuelle** : 475 KB. Trivial.
- **Limites pratiques SQLite** : ~50 writers concurrents. 100+ weddings × 200 guests × RSVP peak = collision.
- **Migration PostgreSQL** : schéma portable (types standards, cuid IDs, composites transposent). JSON-in-string → JSONB. Aucun raw SQL en app code. **Effort estimé : 1-2 jours.** Risque faible.

## 4.7 Schema — forces

1. Clean tenant model (NOT NULL weddingId post-Phase-2)
2. Composite uniques scoped
3. Cascade rules sensés
4. 1:1 via `weddingId @unique`
5. `Invoice.weddingId` denorm pragmatic
6. `UsageCounter` design metered billing (prêt Phase 9+)
7. 18 modèles focalisés, pas d'over-engineering

## 4.8 Schema — faiblesses

1. JSON-in-string (5 colonnes) — 0 type safety, bloquerait JSONB migration
2. `MusicTrack` dead model — music stockée dans Settings keys
3. Schema drift `schema.prisma` ↔ `migrate-phase8-db.cjs` (3 indexes)
4. **Pas de `prisma/migrations/`** — pas de rollback
5. **SQLite WAL/busy_timeout non activés** (contention écriture)
6. Indexes manquants dashboard (10 listés)
7. `Lead.convertedWeddingId` sans FK
8. `Invoice.confirmedBy` sans FK
9. `Guest.invitationCode` sans length constraint
10. Pas de `createdBy/updatedBy` au row level
11. `Settings` KV générique sans enum clés / sans namespace → typos = config drift silencieux

**Verdict DB Enterprise scale (100+ weddings, 10k+ guests) : 5.5/10** — Schema correctement modélisé pour multi-tenant. Tiendrait à 1M guest rows. MAIS SQLite sans WAL s'effondre sous RSVP concurrent, indexes manquants = full scans, drift dev/prod, pas de migrations, JSON-in-string bloque JSONB. À 100+ weddings/10k+ guests sur setup actuel : dashboard >5s + `SQLITE_BUSY` RSVP peak.

---

# PARTIE V — AUDIT DE L'ADMINISTRATION

## 5.1 Inventaire modules admin

### Per-wedding admin `/w/[slug]/admin` (10 tabs) + legacy `/admin` (11 tabs avec Luxury)

| Module | Composant | Maturité | Anomalies |
|---|---|---|---|
| Login | LoginForm.tsx | Production Ready | bcrypt, rate limit, audit log |
| Dashboard | Dashboard.tsx | Production Ready | 14 stats, PieChart + BarChart recharts, settings-driven couple display |
| Invités | GuestManager.tsx (1056 LOC) | Production Ready | CRUD + DOCX import (mammoth) + XLSX import/export + QR code + categories (5) + RSVP + check-in + personal message + invitation type (individuel/couple) |
| Tables | TableManager.tsx | À optimiser | CRUD only, **pas de drag-drop** malgré `@dnd-kit` installé. Cascade guard (suppression table avec invités bloqué) |
| Médias | MediaManager.tsx | Production Ready | Upload FormData, 10MB limit, type validation, per-tenant dir `/uploads/{slug}/` |
| Musique | MusicManager.tsx | À optimiser | Upload FormData, 30MB, autoplay/volume. **`/api/music/file` cassé** (composite key + wrong dir) |
| Programme | TimelineManager.tsx | Production Ready | CRUD events, ordre, icon emoji, location |
| Histoire couple | (via couple-story API + page) | Production Ready | CRUD |
| Paramètres | SettingsManager.tsx | Production Ready | 6 groupes de settings, KV upsert. **`primary_color` + `accent_color` duppliqués avec Theme model** |
| Utilisateurs | UserManager.tsx | Production Ready | RBAC 5 rôles, coupling role↔weddingId |
| Apparence | AppearanceManager.tsx | **À repenser** | **CLIENT-ONLY** (Zustand localStorage). 0 API. Config couple ne propage PAS aux guests |
| Luxury | LuxuryExperienceManager.tsx | **À repenser** | **CLIENT-ONLY** (Zustand localStorage). 0 API. Idem |
| Accès | AccessLogManager.tsx | Production Ready | 14-stats dashboard, suspicious IP detection, filters |
| **Theme Customizer** | ThemeCustomizer.tsx | **À terminer** | **ABSENT du per-wedding admin** — seulement sur platform admin. Organisateur ne peut PAS customizer son thème |
| Custom domain | (via ThemeCustomizer) | À terminer | UI + DNS instructions présentes. **Gateway routing non implémenté** (nginx/Caddy ne gèrent pas arbitrary custom domains) |
| QR Code | /api/guests/qrcode/[code] | Production Ready | AES-256-GCM token, tenant-scoped, access-control, QRCode.toDataURL |
| Check-in | (dans GuestManager) | Production Ready | Toggle `checkedIn`, timestamp |
| RSVP | /api/guest/rsvp | Production Ready | CONFIRMED/DECLINED + message + plusOne, stats |
| Export | /api/guests/export | Production Ready | XLSX via SheetJS |
| Import | /api/guests/import + import-docx | Production Ready | XLSX + DOCX (mammoth) avec duplicate detection |

### Platform admin `/platform/admin` (7 tabs, 2217 LOC single page)

| Tab | Composant | Maturité | Anomalies |
|---|---|---|---|
| Vue d'ensemble | DashboardTab | Production Ready | 16-query aggregation: weddings byStatus/byPlan, users byRole, guests, recentWeddings, recentActivity, revenue (MRR/ARPU/byPlan/6-month series), churn, growth. Charts recharts. |
| Mariages | WeddingsTab | Production Ready | CRUD weddings, status (DRAFT/PUBLISHED/ARCHIVED/SUSPENDED), plan, pagination, search. **Activation/désactivation via edit dialog select** (pas de toggle dédié) |
| Facturation | BillingTab.tsx (1201 LOC) | Production Ready | Subscriptions, invoices, WhatsApp deeplink, manual PAID marking, currency USD/FCFA |
| Onboarding | OnboardingTab.tsx (2151 LOC) | Production Ready | Leads list, 5-step wizard (Couple→Plan→Pricing→Organizer→Options), atomic create, publish |
| Utilisateurs | UsersTab | Production Ready | CRUD AdminUser, role↔weddingId coupling, last-admin guard |
| Journal audit | AuditTab | À optimiser | Reutilise `recentActivity` du dashboard (20 entries max). Pas de filtre avancé, pas de pagination, pas d'export |
| Apparence | ThemeCustomizer | À terminer | 4 templates + colors + fonts + layouts + custom domain. **Wiring runtime cassé** (cf. frontend §2.7) |

## 5.2 Anomalies détectées

1. **Theme Customizer inaccessible à l'organisateur** — Le per-wedding admin (`/w/[slug]/admin`) n'a PAS de tab thème. Seul le platform admin a `appearance → ThemeCustomizer`. L'organisateur doit demander au platform admin pour changer son thème. **Gap produit majeur.**
2. **AppearanceManager + LuxuryExperienceManager = CLIENT-ONLY** — Zustand stores persistés en `localStorage`. **0 appel API.** La config couple ne propage PAS aux guests. Les guests voient les valeurs par défaut. **Les 2 tabs admin sont des bacs à sable preview, pas des configs persistées.** Gap fonctionnel critique.
3. **Dual source of truth `primary_color`/`accent_color`** — Stockés dans `Settings` (KV) ET dans `Theme` (model dédié). Lequel gagne ?
4. **`/api/music/file` cassé** — `findUnique({where:{key}})` invalide sur composite unique `[weddingId, key]` + `UPLOAD_DIR = public/uploads/music` ≠ per-tenant `uploads/{slug}/music/`.
5. **`MusicTrack` model dead** — Schema le définit (1:1 Wedding) mais 0 route l'utilise. Music stockée dans Settings keys. 2 sources of truth.
6. **`/api/admin/users` legacy** coexiste avec `/api/platform/users` — validation différente, confusing.
7. **Footer hardcoded "Josué & Hornella"** — fuite multi-tenant.
8. **Per-wedding admin NAV_ITEMS** : `dashboard, guests, tables, access-logs, media, music, timeline, appearance, users, settings` — **pas de tab `couple-story` dédié** (CRUD via API mais pas d'UI). Pas de tab `invitations` (model `Invitation` existe mais 0 UI pour lister/envoyer).
9. **Phase 8 deployment** : per worklog, fichiers uploadés au VPS mais build non rejoué. État incertain (l'audit ne pouvait pas tester le prod).

## 5.3 Sync Frontend ↔ Backend

- **Immédiat** : settings, timeline, gallery, music, guest list, tables — toute mutation admin est lue par le frontend au prochain mount (pas de cache HTTP, `force-dynamic`). ✅
- **Thème** : mutation admin (PUT `/api/theme`) → ThemeInjector fetch au prochain mount. **MAIS wiring cassé** (variables non consommées). Donc "sync" techniquement OK, visuellement nulle.
- **Staleness** : pas de cache HTTP, pas de SWR/React Query. Chaque mount re-fetch. Pas de stale, mais pas d'optimistic updates non plus.
- **Real-time gaps** : **0 WebSocket**. RSVP d'un guest n'apparaît pas en live sur le dashboard admin (re-fetch manuel). Check-in n'update pas le dashboard en temps réel. Pour un mariage samedi soir, c'est un gap UX notable. (exemples/socket.io disponibles mais 0 wiring.)

## 5.4 Admin — forces (5)

1. 18 modules couvrant tout le cycle (lead → publish → manage → bill → archive)
2. Onboarding wizard 5-step atomique (6 entités en 1 transaction)
3. RBAC propre avec guards (last-admin, self-delete, default-wedding)
4. Dashboard platform avec analytics (MRR, ARPU, churn, growth 6-month series)
5. AccessLogManager 14-stats avec suspicious IP detection

## 5.5 Admin — faiblesses (5)

1. **Theme Customizer absent du per-wedding admin** (organisateur dépend du platform admin)
2. **AppearanceManager + LuxuryExperienceManager non persistés** (client-only, ne propagent pas aux guests)
3. **Page platform admin monolithique 2217 LOC** (inmaintenable)
4. **0 WebSocket** — pas de live RSVP/check-in
5. **`/api/music/file` cassé + `MusicTrack` dead model + dual source colors**

## 5.6 Verdict admin

- **Maturité admin : 6.5/10** — 18 modules couvrent le cycle, mais 3 gaps fonctionnels majeurs (thème organisateur, effects non persistés, monolithe platform admin).
- **Complétude fonctionnelle : 7/10** — 24 features, ~70% Production Ready.
- **Opérationnel aujourd'hui par un wedding planner ?** **Partiel.** Un planner peut créer un mariage, importer des invités, configurer programme/lieu/musique/médias, voir stats, encaisser via WhatsApp. **MAIS il ne peut pas customizer le thème lui-même, sa config d'effets ne propage pas aux guests, et la musique est cassée en multi-tenant.** Pour un SaaS multi-clients, ces 3 gaps sont bloquants.

---

# PARTIE VI — AUDIT DES FONCTIONNALITÉS MÉTIER

## 6.1 Matrice de maturité

| Fonctionnalité | Status | Maturité | Notes |
|---|---|---|---|
| Invitation numérique | ✅ | Production Ready | InvitationCard + GuestPersonalSpace avec envelope reveal |
| QR Code sécurisé | ✅ | Production Ready | AES-256-GCM token, tenant-scoped, access-control, QRCode.toDataURL |
| Recherche d'invité (public lookup) | ✅ | Production Ready | GuestAuthForm, debounced 300ms, lookupToken one-time, search-lock |
| Téléchargement (export PDF/Excel) | ✅ | Production Ready | XLSX export (SheetJS), PNG/JPEG/PDF download invitation (html-to-image + jsPDF) |
| Import invités | ✅ | Production Ready | XLSX + DOCX (mammoth) avec duplicate detection, replace/merge modes |
| Programme (timeline) | ✅ | Production Ready | EventTimeline CRUD, vertical alternating, ordre, icon emoji |
| Galerie (media) | ✅ | Production Ready | PremiumGallery masonry + lightbox, MediaManager upload |
| Musique (ambient player) | ⚠️ | À optimiser | Upload OK, **`/api/music/file` cassé multi-tenant**. AmbientMusicPlayer floating UI ok |
| RSVP | ✅ | Production Ready | CONFIRMED/DECLINED + message + plusOne, stats |
| Gestion des tables | ⚠️ | À optimiser | CRUD + cascade guard, **pas de drag-drop** (alors que @dnd-kit installé) |
| Dashboard | ✅ | Production Ready | 14 stats per-wedding + 16-query platform avec MRR/ARPU/churn/growth |
| Statistiques | ✅ | Production Ready | categoryStats, statusStats, suspiciousIPs, accessLogs 14-stats |
| Personnalisation (theme) | ⚠️ | À terminer | Data model + API + admin UI, **wiring runtime cassé** |
| Marketing (landing) | ✅ | Production Ready | `/` avec hero, story, gallery, AENEWSBanner, CTA → /onboarding |
| Bannière AENEWS | ✅ | Production Ready | Cinematic dark gradient, golden halos, 8-feature grid, 2 CTAs |
| Gestion des médias | ✅ | Production Ready | Upload FormData, per-tenant dir, 10MB, type validation |
| Multi-wedding (platform) | ✅ | Production Ready | 18 modèles tenant-scoped, slug routing, platform admin multi-wedding |
| Billing/Subscription | ⚠️ | À optimiser | Manual WhatsApp billing (stopgap SaaS Premium), 4 plans, invoices, Stripe columns reserved |
| Onboarding (leads → wedding) | ✅ | Production Ready | Public lead form + admin 5-step wizard + atomic create + publish |
| Custom domains | ⚠️ | À terminer | UI + DNS instructions + plan gating. **Gateway routing non implémenté** |
| Guest auth & sessions | ✅ | Production Ready | AES-256-GCM tokens, fingerprint, brute-force, 30j sessions DB |
| Access logs / security audit | ✅ | Production Ready | 14-stats, suspiciousIPs, GuestAccessLog + AuditLog |
| Luxury visual engine | ⚠️ | À repenser | Canvas engine excellent, **MAIS admin config client-only ne propage pas** |
| PWA install | ✅ | Production Ready | manifest 8 icons, sw.js, PWAInstall bottom sheet, beforeinstallprompt |
| Couple story | ✅ | Production Ready | CRUD + OurStory fallback 4 chapters |
| Map section | ✅ | Production Ready | venue_lat/lng, MapSection skeleton |

**Total : 25 features. 16 Production Ready (64%), 7 À optimiser/terminer (28%), 2 À repenser (8%).**

---

# PARTIE VII — AUDIT COMMERCIAL

## 7.1 Image de marque

- **AENEWS Banner** : cinematic, golden halos, logo glow, "Conçue par AENEWS", 8-feature grid, 2 CTAs (WhatsApp + Discover). Branding fort, premium. ✅
- **Heureux Mariage** : naming élégant, FR. Logo `aenews-logo.png` + `logo.svg`. ✅
- **Craft visuel** : hero, invitation, envelope reveal = émotionnellement premium. ✅
- **Cohérence** : palette gold/rose-gold/champagne, fonts Playfair+Cormorant, glassmorphism, ornamental dividers. Identité forte. ✅

## 7.2 Pricing & plans

4 plans définis (`types.ts` + `billing.ts`) :
| Plan | Prix USD/mois | FCFA/mois | Invités | Médias | Admins | Custom domain |
|---|---|---|---|---|---|---|
| TRIAL (Essai Libre) | 0 | 0 | 20 | 100MB | 1 | non |
| ESSENTIEL | 49 | 30 000 | 200 | 1GB | 2 | non |
| PREMIUM | 99 | 60 000 | 500 | 5GB | 5 | oui |
| ÉLITE | 199 | 120 000 | illimité | illimité | 10 | oui |

Pricing cohérent pour marché africain (FCFA) + international (USD). Annual = 10× monthly (2 mois offerts). One-time supporté. ✅

## 7.3 Billing flow

**Manual WhatsApp billing** : platform admin négocie prix avec couple → envoie message WhatsApp préfillé (plan + prix + services + instructions paiement Mobile Money/Virement/Espèces + lien wedding) → marque facture PAID manuellement après paiement hors plateforme.

**Crédibilité SaaS Premium :** **stopgap.** Pas de paiement en ligne = pas de self-service signup = pas de scale. Pour SaaS Premium commercialisable, il faut Stripe (colonnes réservées dans schema). Pour marché local DRC, Mobile Money gateway (M-Pesa, Airtel Money, Orange Money) serait plus adapté qu'Stripe. **Le billing actuel est crédible pour un pilote manuel, pas pour un scale SaaS.**

## 7.4 Onboarding funnel

Public `/onboarding` (lead form 5 champs + message) → platform admin review dans OnboardingTab → 5-step wizard (Couple→Plan→Pricing→Organizer→Options) → atomic create (Wedding+Settings+AdminUser+Subscription+Invoice+Lead conversion+3 audit logs) → publish → couple reçoit `/w/{slug}` + login admin. **Funnel complet, bien conçu.** ✅

## 7.5 Custom domains

- UI `ThemeCustomizer` avec validation format domaine, plan gating (Premium/Élite), uniqueness check.
- DNS instructions : CNAME target `heureuxmariage.aenews.net` + TXT `_heureux-mariage.{domain} → hm-verify={slug}`.
- **Gateway routing NON implémenté** : nginx/Caddy configurés uniquement pour `heureuxmariage.aenews.net`. Aucun server block pour arbitrary custom domains. `isCustomDomainRequest()` existe dans `custom-domains.ts` mais n'est appelé nulle part au niveau gateway. **Feature annoncée, pas livrée.**

## 7.6 Différenciation

**Standout :** Luxury Visual Engine (Canvas particle + DOM halos + breathing + 4 luxury themes + 5 perf tiers). Aucun concurrent wedding platform n'a ce niveau de craft cinématique. C'est le USP (Unique Selling Proposition).

## 7.7 Expérience émotionnelle

- Hero crossfade + parallax + sequenced reveal = premium
- InvitationCard avec paper texture + gold border + shimmer = émotionnel
- Envelope reveal 4-phase 3.5s = moment magique
- Ambient music player = immersion
- PremiumGallery masonry + lightbox = qualité

**Verdict émotionnel : 9/10** — Genuinement premium, se démarque.

## 7.8 Trial limits & upgrade friction

- TRIAL = 20 invités, 100MB, 1 admin, pas custom domain. Reasonable pour essai.
- Upgrade = manuel via WhatsApp → friction élevée. Pas de self-service upgrade. Pas de proration automatique.

## 7.9 Verdict commercial

**5.5/10** — Image premium crédible, pricing cohérent, funnel onboarding complet, différentiation luxury engine. **MAIS :** billing manuel = stopgap (pas self-service, pas scale), custom domains annoncés non livrés, SEO multi-tenant cassé (chaque wedding invisible Google), thème non-fonctionnel au runtime. **Vendable TODAY ?** **Partiellement.** On peut vendre 1-5 weddings pilotes manuels. Pas 50+ clients self-service. Pas de MRR scalable sans paiement en ligne.

---

# PARTIE VIII — AUDIT SCALABILITÉ & MULTI-ÉVÉNEMENTS

## 8.1 Scalabilité

- **N weddings aujourd'hui ?** ✅ Oui. `Wedding.slug` unique, toute entité `weddingId`-scoped, slug routing `/w/[slug]`, platform admin multi-wedding.
- **Concurrency SQLite** : single-writer rollback-journal (WAL non activé) → `SQLITE_BUSY` sous RSVP peak.
- **Isolation per-wedding** : excellente au data layer.
- **À 100 weddings** : dashboard platform full scans (indexes manquants), caches single-instance OK si 1 replica.
- **À 1000 weddings** : SQLite s'effondre, nécessite PostgreSQL + Redis + 2+ replicas.
- **À 10k guests/wedding** : `@@index([weddingId, status])` tient, mais `GuestAccessLog` cross-wedding queries full scan.

**Verdict scalabilité : 7.5/10** — Isolation OK, caches single-instance = blocker horizontal scale.

## 8.2 Multi-Events (Wedding 1, 2, … N)

| Capacité par wedding | N-ready ? |
|---|---|
| Frontend propre (`/w/[slug]`) | ✅ |
| Invités propres | ✅ |
| Tables propres | ✅ |
| QR Codes propres | ✅ |
| Galerie propre | ✅ |
| Programme propre | ✅ |
| Statistiques propres | ✅ |
| Paramètres propres | ✅ |
| Médias propres | ✅ |
| Invitations propres | ✅ |
| Thèmes propres | ⚠️ (data OK, wiring runtime cassé) |
| Musique propre | ❌ (`/api/music/file` cassé multi-tenant) |
| Admins propres (RBAC per wedding) | ✅ |
| Luxury engine config propre | ❌ (client-only localStorage, pas per-wedding) |
| Custom domain propre | ⚠️ (data OK, gateway routing non implémenté) |

**Verdict multi-events : 7/10** — Architecture N-ready, 3 caps non-livrées (thème wiring, musique multi-tenant, luxury config per-wedding).

---

# PARTIE IX — AUDIT THEME ENGINE (futur)

## 9.1 État actuel (Phase 8)

- **Data model** : `Theme` model (1:1 Wedding) avec `primaryColor`, `accentColor`, `fontDisplay`, `fontBody`, `layout`, `customizations` (JSON string). ✅
- **API** : `GET /api/theme` (public), `PUT /api/theme` (ORGANIZER+), `POST /api/theme/apply-template`. ✅
- **4 templates** : Or Classique, Rose Romantique, Minimal Moderne, Nuit Royale. ✅
- **8 fonts** : Cormorant, Playfair, Marcellus, Lora, Inter, Lato, Montserrat, Italiana. ✅
- **4 layouts** : classic, modern, minimalist, royal. ✅
- **ThemeInjector** : injecte `--theme-*` CSS variables + Google Fonts. ✅
- **ThemeCustomizer** admin UI : template gallery + color pickers + font selectors + layout selector + live preview + custom domain section. ✅

## 9.2 Manque pour vrai Theme Engine

| Capacité | Présente ? |
|---|---|
| Couleurs | ✅ (mais non wire runtime) |
| Polices | ✅ (mais non wire runtime) |
| Animations | ❌ |
| Hero variants | ❌ |
| Invitation variants | ❌ |
| Galerie layouts | ❌ |
| Footer variants | ❌ |
| Button styles | ❌ |
| Icon sets | ❌ |
| Backgrounds | ❌ |
| Light effects | ❌ (luxury engine existe mais client-only) |
| Per-section theming | ❌ |

## 9.3 Extensibilité

`Theme.customizations` (JSON) pourrait accueillir `heroStyle`, `animationIntensity`, `invitationTemplate`, etc. Pro : flexible. Con : 0 validation, 0 type safety. Pour Enterprise, il faudrait un schéma zod sur `customizations`.

## 9.4 Verdict Theme Engine

**4/10** — Data model + API + admin UI bien conçus. **Wiring runtime cassé** (variables non consommées par Tailwind tokens, layout ignoré). 75% des capacités Theme Engine manquent. Framework en place, branchement et étension nécessaires.

---

# PARTIE X — AUDIT INVITATION ENGINE (futur)

## 10.1 État actuel

- **1 template monolithique** : `InvitationCard.tsx` (1 composant, 1 design). Pas de variante.
- **GuestPersonalSpace** : envelope reveal + invitation + RSVP + share + download. Excellent mais 1 seul design.
- **Page invitation** : `/w/[slug]/invite/[code]` avec auto-auth encrypted token.

## 10.2 Bibliothèque templates visée

Royal, Luxury, Modern, Minimal, Floral, Premium, Classic, Glass, Gold, Black Edition — **0 existent.**

## 10.3 Parameterization

`InvitationCard` est **monolithique** : pas de prop `template`, pas de conditionnel de style. Pour spawning variants, il faudrait soit :
- Refactor en composant paramétré avec `template` prop + sous-composants par variant
- Renderer SVG-driven (Penpot export) consommant design tokens

## 10.4 AI-personalization readiness

Un LLM pourrait : choisir template basé sur couple names + venue + plan, générer copy invitation, suggérer palette. **Faisable** si l'API theme expose `applyTemplate` + un endpoint `/api/ai/suggest-invitation` qui retourne `{template, colors, copy}`. Actuellement 0 infrastructure AI.

**Verdict Invitation Engine : 2.5/10** — 1 template monolithique, 0 bibliothèque, 0 parameterization, 0 AI. Tout reste à construire.

---

# PARTIE XI — AUDIT IA (futur)

## 11.1 État actuel

- `z-ai-web-dev-sdk@0.0.18` dans `package.json` mais **0 import dans `src/`**. Confirmé par grep.
- `/api/route.ts` = "Hello world" healthcheck.
- Aucun chat UI, aucun endpoint AI, aucun assistant.

## 11.2 Ce que ferait un Admin AI Assistant

Per audit brief : analyser plateforme, aider admin, créer mariage, ajouter invités, modifier programme, générer QR, générer invitations, détecter incohérences, effectuer audits, proposer optimisations.

## 11.3 Faisabilité par capacité

| Capacité | Faisabilité | Notes |
|---|---|---|
| Analyser plateforme | Facile | LLM + dashboard data |
| Aider admin (chat) | Facile | z-ai-web-dev-sdk LLM skill |
| Créer mariage | Moyen | Function calling → `/api/onboarding/create-wedding` (déjà atomique) |
| Ajouter invités | Moyen | Function calling → `/api/guests` POST |
| Modifier programme | Moyen | Function calling → `/api/timeline` PUT |
| Générer QR | Facile | Endpoint existe déjà |
| Générer invitations | Moyen | Nécessite Invitation Engine (manque) |
| Détecter incohérences | Moyen | LLM + audit logs + guest data |
| Effectuer audits | Facile | LLM + métriques |
| Proposer optimisations | Facile | LLM + analytics |

## 11.4 Manque infrastructure

- **Function calling / tool registry** : aucun. Il faudrait un registre d'outils (`createWedding`, `addGuest`, `updateTimeline`...) que l'LLM peut invoquer.
- **Audit log for AI actions** : `AuditLog.action` pourrait accueillir `AI_CREATE_WEDDING` etc. mais aucun wiring.
- **Human-in-loop** : pour actions destructives, confirmation admin requise. Pas d'infra.
- **Chat UI** : aucun. Il faudrait un `ChatPanel` component + `/api/ai/chat` endpoint.

**Verdict AI Assistant : 2/10** — SDK installé mais 0 intégration. Toute l'infrastructure manque. Faisable car APIs existent (function calling direct).

---

# PARTIE XII — AUDIT COMMAND CENTER (futur)

## 12.1 État actuel

`/platform/admin` est **déjà un proto-Command Center** avec 7 tabs (dashboard, weddings, billing, onboarding, users, audit, appearance). Multi-wedding overview ✅, search ✅, activate/désactivate (via edit) ✅, global stats ✅, per-wedding drill-in ✅ (edit dialog).

## 12.2 Manque pour vrai Command Center

| Capacité | Présente ? |
|---|---|
| Visualiser tous mariages | ✅ (WeddingsTab paginated) |
| Rechercher mariage | ✅ (search) |
| Activer/désactiver mariage | ✅ (status select) |
| Discuter avec IA | ❌ |
| Stats globales | ✅ (DashboardTab) |
| Accès admin individuelle | ✅ (edit) |
| Superviser performances | ⚠️ (basique, pas de perf monitoring) |
| Lancer automatisations | ❌ |
| Gérer médias globaux | ❌ (per-wedding only) |
| Gérer thèmes globaux | ⚠️ (ThemeCustomizer per-wedding via slug header) |
| Gérer invitations globales | ❌ |
| Gérer modèles Penpot | ❌ |

## 12.3 Fit architectural

Platform admin est déjà wedding-agnostic (raw `db` pour cross-tenant). Bonne fondation. **MAIS monolithique 2217 LOC** — doit être splité en shell + tabs dédiés (comme `BillingTab.tsx` et `OnboardingTab.tsx` le sont déjà).

**Verdict Command Center : 5/10** — Proto existe et fonctionne. Manque AI chat, automatisations, médias/thèmes/invitations globaux, perf monitoring. Monolithe à splitter.

---

# PARTIE XIII — AUDIT AUTOMATISATIONS

## 13.1 Automatisable aujourd'hui

- **Onboarding wizard** : 1 flow atomique créant 6 entités (Wedding+Settings+AdminUser+Subscription+Invoice+Lead). ✅
- **WhatsApp deeplink generation** : auto-built après create-wedding. ✅
- **Audit log auto** : 47 writes automatiques sur mutations. ✅

## 13.2 Automatisable next (per audit brief)

| Capacité | Maturité |
|---|---|
| Création mariage | ✅ déjà auto |
| Création QR Codes | ⚠️ on-demand (1 par request), pas batch |
| Génération invitations | ❌ 1 template, pas batch |
| Génération PDF | ⚠️ on-demand (guest download), pas batch admin |
| Publication | ✅ déjà auto (publish endpoint) |
| Affiches / bannières | ❌ |
| Réseaux sociaux | ❌ |
| Galerie | ❌ pas d'automatisation |
| Vidéos | ❌ |
| Musique | ❌ |
| Statistiques | ✅ déjà auto (dashboard) |

## 13.3 Pipeline recommandé (haut niveau)

1. **Batch QR generation** : admin "Generate all QRs" → ZIP download
2. **Batch invitation send** : admin "Send all invitations" → WhatsApp/SMS/Email (nécessite gateway)
3. **PDF batch** : admin "Export all invitations PDF" → ZIP
4. **Social assets** : admin "Generate social banners" → templates automatiques
5. **AI wedding setup** : lead → AI génère settings + timeline + suggère thème

**Verdict automatisations : 3/10** — 1 flow auto (onboarding). 90% des capacités automatisables manquent.

---

# PARTIE XIV — AUDIT PENPOT (futur)

## 14.1 Qu'est-ce que Penpot

Design tool open-source (alternative Figma), REST API + websocket, export SVG/CSS, component library. Permettrait à des designers de créer thèmes/templates/invitations SANS coder.

## 14.2 Comment Penpot servirait de Design Engine

- **Thèmes** : designer crée palette + typography dans Penpot → export JSON → `/api/theme` consomme
- **Templates invitation** : designer crée layout SVG → export → renderer React consomme
- **Composants** : bibliothèque Penpot → export → composants React
- **Publication modèles** : workflow designer → admin approve → publish

## 14.3 Architecture idéale (haut niveau)

```
Penpot (design) → export API → Penpot Sync Service →
  ├── Theme tokens (JSON) → /api/theme/apply-penpot-template
  ├── Invitation SVG → /api/invitations/templates
  └── Component library → React dynamic renderer
```

## 14.4 Bloqueurs faisabilité

- **Theme schema** : `Theme.customizations` (JSON) pourrait accepter payloads Penpot. ✅ Mais 0 validation.
- **InvitationCard** : React component monolithique, pas SVG-driven. Penpot SVG export ne rendrait pas directement. ❌ Nécessite refacto en renderer token-driven.
- **Component library** : aucun système de dynamic components. ❌
- **Penpot sync** : aucun service. ❌

## 14.5 Verdict Penpot

**3/10** — Aucune intégration. Faisabilité moyenne : Theme tokens facile (JSON), Invitation SVG difficile (refacto renderer). Pour Enterprise, c'est une direction stratégique majeure qui justifierait un workstream dédié.

---

# PARTIE XV — FEUILLE DE ROUTE

## 15.1 État réel de la plateforme

**Prototype avancé pré-Enterprise.** Architecture multi-tenant solide, craft visuel premium, 25 features (16 Production Ready), funnel onboarding complet, billing manuel opérationnel. **MAIS :** 3 gaps fonctionnels majeurs (thème wiring, effects non persistés, musique multi-tenant cassée), SEO multi-tenant cassé, caches single-instance, page admin monolithique, 0 AI, 0 Invitation Engine, 0 automatisation batch, custom domains annoncés non livrés.

## 15.2 Points forts

1. Architecture tenant isolation (AsyncLocalStorage + Prisma extension + RBAC + audit log)
2. Craft visuel luxury (hero, invitation, envelope reveal, canvas particle engine)
3. Onboarding wizard atomique (6 entités en 1 transaction)
4. Guest auth defense-in-depth (AES-256-GCM + fingerprint + brute-force + search-lock)
5. 25 features couvrant tout le cycle mariage

## 15.3 Faiblesses

1. Theme system non-fonctionnel au runtime (Phase 8 data-only)
2. SEO multi-tenant cassé (1 seul title hardcoded)
3. AppearanceManager + LuxuryExperienceManager client-only (ne propagent pas aux guests)
4. `/api/music/file` cassé multi-tenant
5. Caches single-instance (bloque scale horizontal)
6. Page platform admin monolithique 2217 LOC
7. 0 AI, 0 Invitation Engine, 0 automatisation batch
8. Custom domains annoncés, gateway routing non implémenté
9. `typescript.ignoreBuildErrors` + ESLint désactivé
10. Pas de Prisma migrations (init-db.js ↔ migrate-phase8-db.cjs divergent)

## 15.4 Risques

1. **Fresh deploy casse** si `migrate-phase8-db.cjs` non lancé manuellement
2. **XSS platform admin** = token leak 8h irrévocable
3. **`SQLITE_BUSY`** sous RSVP peak (WAL non activé)
4. **Replay attack** 10min post-deploy (usedLookupTokens in-memory)
5. **CVE xlsx@0.18.5** (prototype pollution)
6. **Drift dev/prod** (3 indexes manquants dans schema.prisma)
7. **Dead code** (CoupleGallery, CouplePhotosSection, MarketingSection, GuestSearch, SectionEffects, ScrollReveal) = maintenance drift
8. **Dual source of truth** colors (Settings + Theme) + music (Settings + MusicTrack dead model)

## 15.5 Stratégies thématiques

### 15.5.1 Stratégie intégration Penpot
- Phase A : Définir Penpot Design Tokens schema (palette, typography, spacing)
- Phase B : Penpot Sync Service (webhook Penpot → `/api/theme/apply-penpot-template`)
- Phase C : Invitation SVG renderer (refactor InvitationCard en token-driven + SVG support)
- Phase D : Component library dynamic (Penpot components → React dynamic import)
- Horizon : 3-6 mois pour MVP, 6-12 mois pour production

### 15.5.2 Stratégie Theme Engine
- Phase A : Wire `--theme-*` dans Tailwind tokens (quick win, débloque Phase 8)
- Phase B : Étendre `Theme.customizations` avec zod schema (animations, heroStyle, invitationTemplate)
- Phase C : 10+ templates par esthétique (Royal, Luxury, Modern, Minimal, Floral, Premium, Classic, Glass, Gold, Black Edition)
- Phase D : Per-section theming (hero, gallery, footer, invitation variants)
- Horizon : 1-3 mois

### 15.5.3 Stratégie Invitation Engine
- Phase A : Refactor InvitationCard en composant paramétré (`template` prop)
- Phase B : 5 templates initiaux (Royal, Modern, Minimal, Floral, Gold)
- Phase C : AI suggestion (couple names + venue → template + colors + copy)
- Phase D : Penpot SVG templates integration
- Horizon : 2-4 mois

### 15.5.4 Stratégie Command Center
- Phase A : Splitter platform admin 2217 LOC en shell + 7 tabs dédiés
- Phase B : Ajouter AI chat panel (right sidebar)
- Phase C : Automatisations batch (QR ZIP, invitation send, PDF batch)
- Phase D : Global media/theme/invitation management
- Phase E : Perf monitoring (response times, error rates, uptime)
- Horizon : 2-3 mois

### 15.5.5 Stratégie Multi-Wedding
- **Déjà N-ready** à 90%. Caps restantes :
  - Fix `/api/music/file` multi-tenant
  - Persist luxury engine config per-wedding (API + Settings keys)
  - Wire thème runtime
  - Implémenter custom domain gateway routing (nginx server_name dynamic ou Caddy on-demand TLS)
- Horizon : 2-4 semaines

### 15.5.6 Stratégie commerciale
- Court terme (1-2 mois) : vendre 5-10 weddings pilotes manuels (billing WhatsApp OK pour volume faible)
- Moyen terme (3-6 mois) : intégrer Mobile Money gateway (M-Pesa/Airtel/Orange) pour self-service DRC + Stripe pour international
- Long terme (6-12 mois) : SaaS self-service signup + custom domains live + SEO multi-tenant + AI onboarding

## 15.6 Plan d'évolution priorisé

### Priorité 1 — Stabilisation (2-4 semaines, 0 régression)
1. **Activer SQLite WAL + busy_timeout** (5 lignes `db.ts`) — élimine `SQLITE_BUSY`
2. **Fix `/api/music/file`** multi-tenant (findFirst + per-tenant dir) — débloque musique
3. **Ajouter 3 indexes manquants** `Wedding.status/plan/isDefault/createdAt` à `schema.prisma` + `prisma db push`
4. **Wire `--theme-*` dans Tailwind tokens** `@theme inline` — débloque Phase 8 visuellement
5. **Rendre Footer.tsx settings-driven** — fix fuite multi-tenant
6. **Supprimer dead code** (6 composants ~1500 LOC)
7. **Upgrade `xlsx` 0.18.5 → 0.20.2+** — patch CVE
8. **`generateMetadata` sur `/w/[slug]/layout.tsx`** — SEO multi-tenant
9. **Réactiver `typescript.ignoreBuildErrors: false`** + fix erreurs résultantes — filet statique

### Priorité 2 — Fonctionnalités Enterprise (1-3 mois)
10. **Prisma migrations** (`prisma/migrations/`) + déprecier `init-db.js` + `migrate-phase8-db.cjs`
11. **Persister luxury engine config** via API + Settings keys (per-wedding, propage aux guests)
12. **ThemeCustomizer dans per-wedding admin** (organisateur autonome)
13. **Splitter platform admin 2217 LOC** en shell + 7 tabs
14. **Externaliser caches Redis** (rate limits, brute-force, lookup tokens, wedding cache) — débloque horizontal scale
15. **Couche service** (extraire validation + audit log boilerplate)
16. **Zod sur toutes routes API** (remplacer validation manuelle)
17. **WebSocket** pour live RSVP/check-in dashboard
18. **Custom domain gateway routing** (Caddy on-demand TLS ou nginx dynamic server_name)
19. **PostgreSQL migration** (préparation Enterprise scale)

### Priorité 3 — Différenciation (3-6 mois)
20. **Invitation Engine** : refactor InvitationCard paramétré + 5 templates initiaux
21. **Theme Engine** : 10+ templates + per-section theming + animations
22. **AI Assistant** : chat UI + function calling + tool registry + audit log AI
23. **Automatisations batch** : QR ZIP, invitation send, PDF batch, social assets
24. **Mobile Money gateway** (M-Pesa/Airtel/Orange) pour self-service DRC
25. **Stripe** pour international self-service
26. **Penpot sync** (MVP : Theme tokens JSON import)

### Priorité 4 — Scale Enterprise (6-12 mois)
27. **R2 storage** (médias + music) — débloque scale stockage
28. **Penpot Invitation SVG renderer** — designer-driven templates
29. **Component library dynamic** (Penpot → React)
30. **AI wedding setup** (lead → AI génère settings + timeline + thème)
31. **Multi-language** (next-intl déjà installé)
32. **Sentry / error tracking** + logging structuré (pino)
33. **Tests** (Vitest unit + Playwright E2E) + CI

## 15.7 Fonctionnalités à conserver

- Architecture multi-tenant (AsyncLocalStorage + Prisma extension + RBAC)
- Luxury Visual Engine (Canvas particle + 5 perf tiers)
- Onboarding wizard atomique
- Guest auth defense-in-depth
- Audit logging omniprésent
- AENEWS Banner branding
- Envelope reveal émotionnel
- Mobile bottom tab bar admin
- Manual WhatsApp billing (pour pilote, en attendant gateway)

## 15.8 Fonctionnalités à développer

- Theme Engine wiring + 10 templates
- Invitation Engine + 5 templates
- AI Assistant + function calling
- Command Center split + AI chat
- Automatisations batch
- Custom domain gateway routing
- WebSocket live updates
- Mobile Money / Stripe gateways
- Penpot sync
- R2 storage

## 15.9 Fonctionnalités à automatiser

- QR batch generation (ZIP)
- Invitation batch send (WhatsApp/SMS/Email)
- PDF batch export
- Social assets generation
- AI wedding setup (lead → settings + timeline + thème)
- Audit report auto-generation
- Incohérence detection (guest sans table, table sur-capacity, RSVP en retard)

## 15.10 Fonctionnalités IA

- Chat assistant admin (analyse, aide, création)
- AI wedding setup (génération auto settings + timeline)
- AI thème suggestion (couple → palette + fonts + template)
- AI invitation copy (couple → message d'invitation)
- AI incohérence detection (audit logs + guest data)
- AI audit report (mensuel auto)
- AI optimisation suggestions (analytics → reco)

---

# PARTIE XVI — CONCLUSION

## 16.1 Note globale de maturité

| Dimension | Note |
|---|---|
| Technique | 6.0/10 |
| Fonctionnelle | 7.0/10 |
| UX/UI | 8.5/10 |
| Commerciale | 5.5/10 |
| Scalabilité | 7.5/10 |
| Vision SaaS | 6.0/10 |
| **NOTE GLOBALE PONDÉRÉE** | **5.7/10** |

## 16.2 Diagnostic en une phrase

**Prototype avancé pré-Enterprise** : l'architecture multi-tenant est genuinely enterprise-grade, le craft visuel est premium commercial, mais 3 gaps fonctionnels majeurs (thème runtime, effects persistence, musique multi-tenant) + SEO multi-tenant cassé + caches single-instance + page admin monolithique + 0 AI/Invitation Engine/automatisation bloquent la transformation en SaaS Premium commercialisable sans d'abord payer la dette technique et livrer les features annoncées.

## 16.3 Recommandation stratégique

1. **2-4 semaines :** Exécuter Priorité 1 (stabilisation, 0 régression) — débloque Phase 8 visuellement, fix musique, fix SEO, patch CVE, active WAL.
2. **1-3 mois :** Exécuter Priorité 2 (Enterprise features) — débloque scale horizontal, autonomy organizer, live updates.
3. **3-6 mois :** Exécuter Priorité 3 (différenciation) — Invitation Engine, Theme Engine, AI Assistant, automatisations, Mobile Money gateway.
4. **6-12 mois :** Exécuter Priorité 4 (scale Enterprise) — R2, Penpot, AI wedding setup, tests/CI.

**Ne jamais compromettre la stabilité de la version actuellement en production.** Chaque évolution doit être derrière feature flag + migration atomique + rollback plan.

---

**Fin de l'audit stratégique. Aucune modification effectuée sur le code, la base de données, le frontend, le backend. Aucun déploiement. Aucun refactoring.**
