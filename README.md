# AENEWS Wedding OS

> Plateforme SaaS multi-tenant de gestion et déploiement de mariages premium.
> Conçue et opérée par **AENEWS** — déployée en production sur
> [heureuxmariage.aenews.net](https://heureuxmariage.aenews.net).

---

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Fonctionnalités principales](#fonctionnalités-principales)
- [Pile technologique](#pile-technologique)
- [Architecture](#architecture)
- [Structure du projet](#structure-du-projet)
- [Collection Engine (Phase 1)](#collection-engine-phase-1)
- [Développement local](#développement-local)
- [Déploiement production (VPS)](#déploiement-production-vps)
- [Variables d'environnement](#variables-denvironnement)
- [Aperçu de l'API](#aperçu-de-lapi)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Opérations](#opérations)

---

## Vue d'ensemble

**Wedding OS** est une plateforme multi-tenant où chaque mariage est un tenant
isolé. Le couple (et ses organisateurs) gère invités, tables, médias,
programme, thème et ambiance visuelle depuis un admin dédié
(`/w/[slug]/admin`), tandis que les invités accèdent à leur espace personnel
sécurisé par token AES-256-GCM via `/w/[slug]`.

La plateforme ne **fabrique pas** de thèmes — elle **déploie** des
**Collections Premium** créées dans Penpot par des designers. Le moteur
**Collection Engine** orchestre les moteurs existants (Theme Engine,
ThemeInjector, LuxuryVisualEngine, PenpotStudio) sans les remplacer.

### Vision produit

Wedding OS est un **SaaS de déploiement** — pas un constructeur de thèmes.
Le design vit dans Penpot (le Studio du designer), Wedding OS orchestre le
déploiement sur les mariages. Cette séparation permet à un écosystème de
designers de créer des Collections commercialisables sans aucune compétence
de développement.

---

## Fonctionnalités principales

### Côté couple (tenant admin)
- **Dashboard** — vue d'ensemble du mariage (invités, tables, médias, stats)
- **Collections** — catalogue de Collections Premium (Phase 1 : Royal Gold)
- **Invités** — CRUD complet, import en masse, codes d'invitation uniques
- **Tables** — plan de placement drag-and-drop
- **Médias** — galerie photos + uploads (gallerie couple + hero)
- **Musique** — musique d'ambiance avec lecteur intégré
- **Programme** — timeline détaillée du jour J
- **Accès** — logs d'accès invités (fingerprint, device, IP)
- **Apparence** — LuxuryVisualEngine (poussière dorée, halos, respiration)
- **Thème** — ThemeCustomizer (couleurs, polices, layout)
- **Studio** — PenpotStudio (éditeur Penpot intégré par iframe)
- **Utilisateurs** — gestion des organisateurs/contrôleurs
- **Paramètres** — configuration du mariage

### Côté invité
- **Espace personnel sécurisé** — authentification par code unique
- **Invitation digitale** — rendu personnalisé avec QR code
- **Confirmation RSVP** — statut de présence
- **Recherche de table** — finding tool intégré
- **Galerie couple** — photos personnalisées
- **Programme** — timeline du jour
- **Lieu** — carte interactive (OpenStreetMap)

### Côté plateforme (super admin)
- **Command Center** — dashboard global multi-mariages
- **Gestion des mariages** — création, duplication, archivage
- **Leads** — pipeline de prospects (plan, collection)
- **Billing** — subscriptions + factures (4 tiers : TRIAL/ESSENTIEL/PREMIUM/ELITE)
- **Onboarding** — wizard de création de mariage
- **Domaines personnalisés** — custom-domain mapping

---

## Pile technologique

| Couche | Technologie |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Langage** | TypeScript 5 strict |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York) |
| **Icônes** | Lucide React |
| **Base de données** | SQLite + Prisma ORM 6 |
| **Auth** | JWT custom (bcryptjs) — NextAuth disponible |
| **Multi-tenant** | AsyncLocalStorage + Prisma extension (12 modèles tenant-scoped) |
| **State client** | Zustand |
| **State serveur** | TanStack Query |
| **Forms** | React Hook Form + Zod |
| **Drag-and-drop** | @dnd-kit |
| **Canvas/Luxury** | Canvas 2D (LuxuryVisualEngine) |
| **QR codes** | qrcode (AES-256-GCM tokens) |
| **Studio design** | Penpot (iframe embed + token sync) |
| **Production** | Docker multi-stage + docker-compose |
| **Reverse proxy** | Nginx + SSL (sur le VPS) |
| **Runtime** | Node.js 20-alpine (conteneur) / Bun (dev local) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AENEWS Wedding OS                        │
├─────────────────────────────────────────────────────────────┤
│  Multi-tenant (AsyncLocalStorage + Prisma extension)        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /                    → public site (default tenant) │   │
│  │  /w/[slug]            → tenant public site           │   │
│  │  /w/[slug]/admin      → tenant admin (12 tabs)       │   │
│  │  /admin               → platform Command Center      │   │
│  │  /onboarding          → couple onboarding wizard     │   │
│  │  /api/...             → REST API (tenant-scoped)     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Moteurs (orchestrés, jamais remplacés)                     │
│  • Theme Engine (Theme 1:1 Wedding, customizations JSON)    │
│  • ThemeInjector (CSS vars + luxury store hydration)        │
│  • LuxuryVisualEngine (Canvas 2D, 7 effects, 4 thèmes)      │
│  • PenpotStudio (iframe + push/pull tokens)                 │
│  • Collection Engine (Phase 1 : Royal Gold) ← NEW           │
│  • Guest Engine (Guest + GuestSession + AES tokens)         │
│  • QR Engine (src/lib/guest-auth.ts)                        │
│  • Billing (Subscription + Invoice + PLAN_LIMITS)           │
│  • Media Engine (Media + Upload Manager)                    │
│  • Timeline + Couple Story + Settings                       │
└─────────────────────────────────────────────────────────────┘
```

### Modèle multi-tenant

Chaque mariage est un tenant. Le contexte tenant est résolu via :
1. Le subdomain (custom-domain) — optionnel
2. Le segment `/w/[slug]` dans l'URL
3. Le header `X-Wedding-Slug`
4. Fallback : mariage par défaut (`isDefault=true`)

Les middlewares `withPublicTenant` (lectures publiques) et
`withAdminTenantHandler` (mutations authentifiées) résolvent le contexte
automatiquement — aucune logique tenant à écrire dans les routes.

---

## Structure du projet

```
.
├── prisma/
│   └── schema.prisma          # 20 modèles (Wedding, Guest, Theme, Collection, ...)
├── init-db.js                 # Script d'initialisation DB (lancé au démarrage conteneur)
├── docker-compose.prod.yml    # Stack production (app + volumes)
├── Dockerfile                 # Build multi-stage (deps → builder → runner)
├── docker-entrypoint.sh       # Entrypoint (init-db + privilege drop)
├── src/
│   ├── app/
│   │   ├── api/               # Routes API REST
│   │   │   ├── collections/   # Collection Engine (Phase 1)
│   │   │   ├── theme/         # Theme Engine
│   │   │   ├── guests/        # Guest Engine
│   │   │   ├── media/         # Media Engine
│   │   │   ├── platform/      # Platform admin (weddings, leads, billing)
│   │   │   └── ...
│   │   ├── w/[slug]/          # Tenant routes (public + admin)
│   │   ├── admin/             # Platform Command Center
│   │   ├── onboarding/        # Couple onboarding wizard
│   │   └── page.tsx           # Public home (default tenant)
│   ├── components/
│   │   ├── ui/                # shadcn/ui (New York)
│   │   ├── admin/             # ThemeCustomizer, MusicManager, AppearanceManager
│   │   ├── collections/       # CollectionLibrary
│   │   ├── wedding/           # ThemeInjector, InvitationCard, HeroSection, ...
│   │   ├── luxury/            # LuxuryVisualEngine
│   │   ├── penpot/            # PenpotStudio
│   │   └── effects/           # Visual effects
│   ├── lib/
│   │   ├── collections/       # Collection Engine (index.ts)
│   │   ├── penpot/            # Penpot config (tokens, URL parsing)
│   │   ├── themes/            # Theme templates
│   │   ├── auth.ts            # JWT auth
│   │   ├── tenant-context.ts  # Multi-tenant middleware
│   │   ├── db.ts              # Prisma client
│   │   ├── plan-limits.ts     # Billing tiers + quotas
│   │   ├── guest-auth.ts      # AES-256-GCM token system
│   │   └── luxury-engine-store.ts  # Zustand luxury store
│   └── ...
├── COLLECTION_PRODUCT_SPEC.md # Spécification fonctionnelle Collection Product
├── COLLECTION_ENGINE_PLAN.md  # Plan technique v1
├── COLLECTION_ENGINE_PLAN_V2.md # Plan technique v2 (4-level abstraction)
├── deploy-collection-engine.mjs  # Script de déploiement VPS
└── worklog.md                 # Journal de développement détaillé
```

---

## Collection Engine (Phase 1)

Le Collection Engine est le cœur commercial de Wedding OS. Une **Collection
Product** est un actif commercial (pas juste un thème) qui encapsule :

- **Theme seed** — couleurs, polices, layout
- **Luxury preset** — ambiance visuelle (theme gold/rose/champagne/midnight + 7 effects + intensity/density/speed/haloCount)
- **Penpot file reference** — le design source of truth (Penpot est le Studio)
- **Variants** — versions A/B/C/D avec palette overrides

### Phase 1 — livrée

- ✅ Modèles Prisma `Collection` + `CollectionVariant` (+ `Wedding.collectionId`/`variantId` nullable)
- ✅ API `/api/collections` (GET list), `/api/collections/[id]` (GET detail), `/api/collections/apply` (POST deploy)
- ✅ Composant `CollectionLibrary` monté dans l'admin tenant (onglet "Collections")
- ✅ `ThemeInjector` hydrate le luxury store depuis `customizations.luxury`
- ✅ Royal Gold seedé automatiquement (idempotent — `ensureRoyalGoldSeeded`)
- ✅ Tier gating (`canAccessCollection` — additif à `PLAN_LIMITS`)
- ✅ Fix data-leak sur duplication de mariage (sanitization Penpot file refs)
- ✅ Déployé sur VPS + vérifié end-to-end

### Royal Gold — première Collection Product

| Attribut | Valeur |
|---|---|
| Slug | `royal-gold` |
| Catégorie | LUXURY |
| Tier | FREE (Phase 1 — accessible à tous les plans) |
| Couleur primaire | `#D4AF37` (or royal) |
| Couleur accent | `#1a1a2e` (noir nuit) |
| Police display | Cormorant Garamond |
| Police body | Inter |
| Layout | royal |
| Luxury theme | gold |
| Effects activés | starrySky, goldenDust, microSparkles, luminousHalos, globalBreathing |
| Intensity / Density / Speed | 80 / 70 / 50 |
| Halo count | 4 |
| Variantes | A — Or classique (défaut) |

---

## Développement local

### Prérequis

- [Bun](https://bun.sh/) (runtime + package manager)
- Node.js 20+ (pour Prisma CLI)

### Installation

```bash
bun install
bun run db:push     # Crée/migre le schéma SQLite
bun run db:generate # Génère le client Prisma
```

### Démarrage

```bash
bun run dev         # Démarre Next.js sur http://localhost:3000
bun run lint        # Vérifie la qualité du code
```

Le serveur dev écoute sur le port 3000. Les logs sont tee'd dans `dev.log`.

### Comptes par défaut (dev local)

- **Super Admin** : `admin@heureuxmariage.aenews.net` / `HeureuxMariage2026!`
- (Le mariage par défaut `isDefault=true` est servi sur `/`)

---

## Déploiement production (VPS)

### Cible

- **VPS** : `95.111.226.63` (utilisateur `aenews`)
- **Dossier** : `/opt/wedding-platform`
- **Conteneur** : `wedding-app` (Docker, port 3080 interne)
- **Reverse proxy** : Nginx + SSL sur `heureuxmariage.aenews.net`

### Procédure de déploiement

```bash
# 1. Builder le tarball des fichiers modifiés
tar -czf /tmp/bundle.tar.gz src/ prisma/ init-db.js package.json

# 2. Uploader + extraire + rebuild via le script
node deploy-collection-engine.mjs
# (ou un script similaire — SFTP upload + SSH extract + docker compose build --no-cache)
```

Le `Dockerfile` est multi-stage :
1. **deps** — installe les dépendances (`npm i`)
2. **builder** — génère le client Prisma + build Next.js (standalone output)
3. **runner** — image finale minimaliste (node:20-alpine, user nextjs non-root)

Le `docker-entrypoint.sh` :
1. Fixe les permissions des volumes (root)
2. Lance `init-db.js` (crée les tables manquantes + seed admin)
3. Drop de privilèges vers `nextjs`
4. Démarre `node server.js` (standalone)

### Vérification post-déploiement

```bash
# Sur le VPS :
docker ps --filter name=wedding-app           # conteneur healthy
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/  # 200
curl -s http://127.0.0.1:3080/api/collections  # retourne Royal Gold
docker logs wedding-app --tail 20              # init-db OK + Next.js ready
```

---

## Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `DATABASE_URL` | Chemin SQLite | `file:/home/z/my-project/db/custom.db` |
| `ADMIN_EMAIL` | Email super admin | `admin@heureuxmariage.aenews.net` |
| `ADMIN_PASSWORD` | Mot de passe super admin | `HeureuxMariage2026!` |
| `JWT_SECRET` | Secret JWT (signature tokens) | (à définir en prod) |
| `NEXT_TELEMETRY_DISABLED` | Désactive télémétrie Next.js | `1` |
| `NODE_ENV` | Environnement | `production` (VPS) / `development` (dev) |

> ⚠️ En production, `ADMIN_PASSWORD` et `JWT_SECRET` doivent être surchargés
> via le `.env` du VPS (non commité dans le repo).

---

## Aperçu de l'API

### Publiques (avec tenant context)
- `GET /api/collections` — liste des Collections accessibles au plan
- `GET /api/collections/[id]` — détail d'une Collection + variantes
- `GET /api/theme` — thème du mariage courant
- `GET /api/settings` — paramètres du mariage
- `GET /api/guest/me` — espace invité (token-required)
- `GET /api/couple-story` — histoire du couple
- `GET /api/timeline` — programme du jour
- `GET /api/media` — médias (filtrables par type/catégorie)
- `GET /api/music` — configuration musique

### Authentifiées (ORGANIZER+)
- `POST /api/collections/apply` — déploie une Collection sur le mariage
- `PUT /api/theme` — met à jour le thème
- `POST /api/guests` — CRUD invités
- `POST /api/media` — upload médias
- `PUT /api/settings` — met à jour les paramètres

### Plateforme (PLATFORM_ADMIN)
- `GET/POST /api/platform/weddings` — CRUD mariages
- `POST /api/platform/weddings/[id]/duplicate` — duplique un mariage
- `GET/POST /api/platform/leads` — pipeline leads
- `GET/POST /api/platform/billing` — subscriptions + factures

---

## Documentation

| Document | Description |
|---|---|
| [`COLLECTION_PRODUCT_SPEC.md`](./COLLECTION_PRODUCT_SPEC.md) | Spécification fonctionnelle définitive du Collection Product Engine (16 attributs, 5 packs, 6 états lifecycle, 8 invariants designer) |
| [`COLLECTION_ENGINE_PLAN.md`](./COLLECTION_ENGINE_PLAN.md) | Plan technique v1 (audit, modèle de données, sync Penpot→WOS) |
| [`COLLECTION_ENGINE_PLAN_V2.md`](./COLLECTION_ENGINE_PLAN_V2.md) | Plan technique v2 (4-level abstraction, marketplace prep, phases séquentielles) |
| [`worklog.md`](./worklog.md) | Journal de développement détaillé (6800+ lignes) |

---

## Roadmap

### Phase 1 — ✅ Livrée
- Collection Engine fonctionnel
- Royal Gold sélectionnable + associable à un mariage
- Déployé sur VPS

### Phase 2 — À venir
- Attacher les modules à Royal Gold :
  - Website (10 frames)
  - Invitations (8 frames)
  - Print (8 frames)
  - Communication (8 frames)
- Frame registry (34 slots auto-détectés par convention de nommage Penpot)

### Phase 3 — À venir
- Enrichir le catalogue avec de nouvelles Collections :
  - Royal Black, Royal Emerald
  - White Romance, Elegant Beige
  - Kente, Congo Prestige
  - Pure White, Nordic
  - Beach, Garden, Sunset

### Phases futures
- Designer Portal (zone isolée pour designers)
- Lifecycle 6 états complet (BROUILLON → EN_COURS → VALIDATION → PUBLIÉ → COMMERCIALISÉ → ARCHIVÉ)
- Marketplace UI + paiement
- Print & Communication renderers

---

## Opérations

### Commandes utiles

```bash
# Dev local
bun run dev                    # serveur dev port 3000
bun run lint                   # ESLint
bun run db:push                # migrer le schéma
bun run db:generate            # régénérer le client Prisma

# VPS (via SSH)
docker compose -f docker-compose.prod.yml logs -f app   # logs temps réel
docker compose -f docker-compose.prod.yml restart app   # restart
docker compose -f docker-compose.prod.yml build app     # rebuild
docker exec wedding-app sh -c 'cd /app && node init-db.js'  # re-init DB

# Git
git remote -v                  # vérifier le remote
git log --oneline -10          # historique récent
git push origin main           # pousser sur GitHub
```

### Monitoring

- **Healthcheck** : `HEALTHCHECK` Docker sur `http://127.0.0.1:3000/` (30s interval)
- **Logs container** : `json-file` driver, rotation 10MB × 3 files
- **Ressources** : limité à 512M RAM / 1 CPU, réservé 256M / 0.25 CPU

---

## Contributeurs

- **AENEWS** — conception, développement et opérations
- **Dieudonné Matanda** — product owner & vision

---

## Licence

Propriétaire — © AENEWS. Tous droits réservés.
Usage limité à la plateforme `heureuxmariage.aenews.net` et ses tenants.
