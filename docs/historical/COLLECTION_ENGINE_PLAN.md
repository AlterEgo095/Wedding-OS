# PLAN — COLLECTION ENGINE
## Transformer Penpot en Template Factory (Wedding Collections)

> **Phase**: PLANIFICATION ONLY — aucun code écrit dans cette phase.
> **Principe**: ADDITIF UNIQUEMENT. Aucun moteur existant n'est remplacé.
> **Statut**: En attente de validation utilisateur avant implémentation.

---

## 0. EXECUTIVE SUMMARY

**Vision** : Un nouveau mariage est créé à partir d'une Collection Premium déjà conçue dans Penpot. Le couple ne crée jamais un design — il choisit un modèle professionnel, et Wedding OS adapte automatiquement toutes les données.

**Architecture** : Le Collection Engine est une **couche d'orchestration** au-dessus des moteurs existants. Theme Engine, Invitation Engine, Media Engine, LuxuryVisualEngine deviennent les **moteurs d'exécution** — ils ne sont pas remplacés.

**État actuel** : Penpot integration terminée et validée. 4 templates hardcoded. Billing 4-tier mature. Multi-tenant solide. **Aucun concept "Collection" n'existe** (greenfield — namespace propre).

**Scope** : 7 phases progressives (Phase 0–6), ~19–25h effort total. Phase 7 (Print + Communication packs) différée en v2. **Zéro régression garantie** (toutes les colonnes nouvelles sont nullable, tous les comportements par défaut sont préservés).

---

## 1. AUDIT DE L'EXISTANT (Deliverable 1)

### 1.1 Theme Engine — MATURE ✅

| Élément | Détail |
|---------|--------|
| **Theme model** | 9 champs, relation **1:1** avec Wedding (`weddingId @unique`) |
| **4 champs canoniques** | `primaryColor`, `accentColor`, `fontDisplay`, `fontBody` |
| **`layout` field** | classic / modern / minimalist / royal — **DEAD CODE** au renderer (jamais consommé) |
| **`customizations String?`** | JSON blob. Shape actuelle : `{ penpot: { fileUrl, fileId, pageId, invitationFrameId, saveTheDateFrameId, lastSyncedAt, tokens: {...} } }` |
| **4 THEME_TEMPLATES** | `classic-gold`, `romantic-rose`, `minimal-modern`, `royal-night` (hardcoded dans `src/lib/themes/templates.ts`) |
| **DEFAULT_THEME** | = classic-gold values |
| **/api/theme** | GET retourne DEFAULT_THEME si pas de row ; PUT valide 5 scalaires, ne touche pas customizations |
| **ThemeCustomizer** | 4 champs + layout, `POST /api/theme/apply-template` pour appliquer un preset |
| **ThemeInjector** | Injecte `--theme-*` (4 vars) + `--penpot-*` (11 vars) CSS custom properties + Google Fonts |

**Note critique** : Le schema comment de `customizations` est STALE (claim `{heroStyle, animationIntensity}` mais stocke `{penpot: PenpotIntegration}`). À corriger dans le commentaire uniquement (cosmétique).

### 1.2 Penpot Integration — TERMINÉE ✅

| Élément | Détail |
|---------|--------|
| **`src/lib/penpot/config.ts`** (204 LOC) | 2 interfaces (`PenpotTokens` = 11 clés dotted, `PenpotIntegration` = 7 fields), 6 fonctions |
| **PenpotTokens** | 5 colors + 2 typography + 1 spacing + 3 radius (11 clés optionnelles) — mais **seulement 4 sont auto-populées** par `themeToPenpotTokens` |
| **PenpotStudio** (640 LOC) | iframe embed + URL linker + push/pull token flows. Push = Theme → clipboard JSON. Pull = paste JSON → update BOTH customizations + 4 champs canoniques |
| **Montage** | Tenant admin (tab `studio`) + Platform admin (tab `studio`) |
| **ThemeInjector étendu** | Injecte `--penpot-*` CSS vars défensivement (gère string\|object legacy) |
| **`invitationFrameId` / `saveTheDateFrameId`** | Réservés dans PenpotIntegration mais **NON implémentés** — le Collection Engine peut les activer |

### 1.3 Invitation Engine — FONCTIONNEL MAIS MONOLITHIQUE ⚠️

| Élément | Détail |
|---------|--------|
| **InvitationCard.tsx** (523 LOC) | **SINGLE fixed design**, 8 props (guestName, tableName, tableNumber, seats, category, invitationCode, personalMessage, qrCodeUrl) + 8 settings fetched from `/api/settings` |
| **5 catégories hardcoded** | VIP, FAMILLE, AMIS, SPONSORS, COLLEGUES — **PRESS non supporté** (fallback AMIS) |
| **QR** | Généré server-side via `qrcode` npm, encode URL `${baseUrl}/w/${slug}/invite/${encryptedToken}` |
| **Token** | AES-256-GCM (16-byte IV + 16-byte auth tag), encode `invitationCode` string, clé `SHA-256(ENCRYPTION_KEY)` |
| **Auto-auth** | `GET /api/guest/invite?token=...` → JWT 30d httpOnly cookie |
| **PDF/PNG export** | Vit dans `GuestPersonalSpace.tsx` via `html2canvas-pro` + `jspdf` (hidden off-screen JSX) |
| **`Invitation` Prisma model** | **DEAD** (zéro queries) |
| **`/api/invitations/**`** | **N'EXISTE PAS** — endpoints réels : `/api/guest/invite` + `/api/guests/qrcode/[code]` |

**GAP critique** : `Guest.category` (VIP/FAMILLE/AMIS/SPONSORS/COLLEGUES) **conflit** relationship vs prestige. `Guest.invitationType` (couple/individuel) = seat-type. **Aucun `Guest.tier` dédié**.

### 1.4 Media Engine — FONCTIONNEL ✅

| Élément | Détail |
|---------|--------|
| **Media model** | 14 champs. `type` enum : PHOTO, VIDEO, LOGO, DOCUMENT. `category` enum : GALLERY, COUPLE_STORY, DOCUMENT, OTHER |
| **Stockage** | `public/uploads/${slug}/${uniqueName}`, URL `/uploads/${slug}/${uniqueName}` |
| **/api/media** | GET (public, filtres type+category) + POST (admin, multipart, 10MB, plan-limit) + DELETE |
| **PremiumGallery** | Self-fetch `/api/media?type=PHOTO&category=GALLERY`, fallback 8 default photos |

**GAP** : `Media.category` manque les valeurs `INVITATION_BG`, `HERO`, `SAVE_THE_DATE`, `PRINT_PACK` nécessaires aux Collections.

### 1.5 LuxuryVisualEngine — OVERLAY COEXISTANT ✅

| Élément | Détail |
|---------|--------|
| **Mécanisme** | Canvas 2D, `position:fixed; z-index:0; pointer-events:none` — coexiste avec Penpot designs |
| **7 effects déclarés** | starrySky, goldenDust, microSparkles, luminousHalos, globalBreathing, sectionAmbiance, scrollReflections — **mais 5 rendus seulement** (sectionAmbiance + scrollReflections = store-only) |
| **4 themes** | gold, rose, champagne, midnight |
| **Config source** | localStorage via `luxury-engine-store` (key `wedding_luxury_engine_${slug}`) — **PAS DB, PAS Theme** |
| **2 stores parallèles** | `luxury-engine-store` (7 effects + 4 themes + 5 tiers) + `visual-effects-store` (12 effects + 3 sliders) — **ni l'un ni l'autre syncés à DB** |
| **AppearanceManager** | Gère effects uniquement (pas thème) — confirmé |

### 1.6 Wedding Workspace & Multi-tenant — SOLIDE ✅

| Élément | Détail |
|---------|--------|
| **Tenant admin — 12 tabs** | dashboard, guests, tables, access-logs, media, music, timeline, **theme** (Palette), **studio** (PenTool), appearance, users, settings |
| **Multi-tenant** | `AsyncLocalStorage<TenantContext>` + Prisma extension auto-inject `weddingId` sur 12 models tenant-scoped + 2 billing + 2 nullable |
| **Auth** | Custom JWT (8h) + bcrypt (12 rounds). `admin_token` localStorage + Bearer auto-attach via fetch interceptor |
| **3 routes création mariage** | `/api/platform/weddings` (bare), `/api/onboarding/create-wedding` (transactional: Wedding + 15 Settings + AdminUser + Subscription + Invoice + AuditLogs, **NO Theme row**), `/api/platform/weddings/[id]/duplicate` |
| **Theme row creation** | **LAZY** — créé au premier `PUT /api/theme` ou `apply-template`. Pas de row à la création du mariage |
| **Onboarding wizard** | 5 steps (Couple → Plan → Tarifs → Organisateur → Vérification) — **PAS de step thème/collection** |
| **Duplicate-wedding** | Copie Settings + Theme + MusicTrack + EventTimeline + CoupleStory. **Copie Penpot integration verbatim** (data-leak risk à patcher) |

### 1.7 Billing — MATURE ✅

| Élément | Détail |
|---------|--------|
| **Models** | `Subscription` + `Invoice` + `UsageCounter` (dead) |
| **4-tier plan** | TRIAL / ESSENTIEL / PREMIUM / ELITE |
| **PLAN_LIMITS** | guests, media, admins, customDomain (quotas quantitatifs) |
| **PLAN_METADATA** | label, priceFcfa, priceUsd |
| **7 billing API endpoints** | `/api/platform/billing/weddings`, `/api/platform/weddings/[id]/subscription{,/whatsapp}`, `/api/platform/weddings/[id]/invoices`, `/api/platform/invoices{,/[id]}` |
| **Tier-gating helpers** | `checkGuestLimit`, `checkMediaLimit`, `checkAdminLimit`, `canUseCustomDomain` (quotas seulement) |
| **Stripe** | **NON intégré** (manual WhatsApp billing) — colonnes réservées dans schema |
| **Lead model** | Avec `plan` field, transactionally converted via `/api/onboarding/create-wedding` |

**GAP** : Pas de tier-gating **esthétique** (seulement quantitatif). Pas de `canAccessCollection(plan, collectionTier)`.

### 1.8 Existing Templates — 4 PRESETS HARDCODED

| Slug | primaryColor | accentColor | fontDisplay | fontBody | layout |
|------|-------------|-------------|-------------|----------|--------|
| `classic-gold` | #D4A853 | #C8785A | Cormorant Garamond | Inter | classic |
| `romantic-rose` | #E8A5B5 | #D4A5A5 | Playfair Display | Lato | modern |
| `minimal-modern` | #2C2C2C | #8B8B8B | Inter | Inter | minimalist |
| `royal-night` | #1a1a2e | #D4AF37 | Cormorant Garamond | Inter | royal |

Ces 4 presets deviennent les **4 premières Collections** seed.

### 1.9 Patterns UI réutilisables

| Pattern | Source | Réutilisation |
|---------|--------|---------------|
| **Grid 4-col + live swatches + active checkmark** | `ThemeCustomizer.tsx` | CollectionLibrary card grid |
| **Grid 2-col + popular badge + selected ring** | `OnboardingTab.tsx` PlanStep | VariantPicker + PalettePicker |
| **Iframe embed + URL linker** | `PenpotStudio.tsx` | CollectionAdmin Penpot linking |

---

## 2. RÉUTILISATION DIRECTE (Deliverable 2)

### Matrice de réutilisation

| Moteur / Composant existant | Rôle actuel | Rôle dans Collection Engine | Modification |
|----------------------------|-------------|----------------------------|--------------|
| **Theme Engine** (`/api/theme`, Theme model) | CRUD thème 4 champs + customizations | **Moteur d'exécution** — reçoit themeSeed de la Collection | AUCUNE (upsert existant) |
| **ThemeCustomizer** | Édition manuelle 4 champs | Coexiste — couple peut affiner après apply | AUCUNE |
| **ThemeInjector** | Injecte `--theme-*` + `--penpot-*` CSS vars | Inchangé + **hydrate luxury-engine-store** depuis `customizations.luxury` | Additive (1 nouveau bloc de hydration) |
| **PenpotStudio** | Studio admin (push/pull tokens) | Inchangé — réservé admins/designers | AUCUNE |
| **Penpot config.ts** (`themeToPenpotTokens`, etc.) | Conversion bidirectionnelle | Réutilisé tel quel par Collection Engine | AUCUNE |
| **Theme.customizations JSON** | Stocke `{penpot: PenpotIntegration}` | Étendu : `{penpot, luxury, collectionMeta}` | Additive (nouvelles clés) |
| **Invitation Engine** (InvitationCard, QR, AES-256-GCM) | Single fixed design | **Moteur d'exécution** — wrapper par `InvitationRenderer` | AUCUNE (nouveau wrapper au-dessus) |
| **Media Engine** (`/api/media`, Media model) | CRUD médias | Inchangé — Collection peut référencer des media URLs | AUCUNE |
| **LuxuryVisualEngine** | Overlay ambiance (localStorage) | Hydrate depuis `Theme.customizations.luxury` si présent | Additive (hydration optionnelle) |
| **Billing** (Subscription, PLAN_LIMITS) | 4-tier quotas | Étendu : `canAccessCollection(plan, tier)` helper | Additive (1 nouvelle fonction) |
| **Wedding Workspace** (tenant admin) | 12 tabs | +1 tab `collections` (CollectionLibrary) | Additive (1 nav item + 1 case) |
| **Multi-tenant** (AsyncLocalStorage + Prisma ext) | Auto-inject weddingId | Inchangé — Collection Engine respecte le tenant context | AUCUNE |
| **Onboarding wizard** | 5 steps | +1 step "Choisir une Collection" | Additive (1 step insérée) |
| **4 THEME_TEMPLATES** | Hardcoded presets | Deviennent 4 Collection rows (seed) | Migration seed uniquement |

### Ce qui N'EST PAS réutilisé (greenfield)

| Nouveau | Pourquoi |
|---------|----------|
| `Collection` Prisma model | Aucun concept Collection existe |
| `CollectionVariant` Prisma model | Aucun concept Variante existe |
| `CollectionLibrary.tsx` | Aucun catalog UI existe |
| `InvitationRenderer.tsx` | Aucun dispatcher d'invitation existe |
| `/api/collections/**` routes | Aucun endpoint Collection existe |
| `src/lib/collections/` | Aucune logique Collection existe |

---

## 3. STRUCTURE DES COLLECTIONS (Deliverable 3)

### 3.1 Anatomie d'une Collection

Une Collection = un pack complet **prêt-à-déployer** contenant 5 sous-packs :

```
Collection
├── 1. Theme Pack
│   ├── couleurs (primaryColor, accentColor)
│   ├── typographies (fontDisplay, fontBody)
│   ├── layout (classic/modern/minimalist/royal)
│   ├── ambiance (luxuryTheme: gold|rose|champagne|midnight)
│   ├── effets (luxury effects profile)
│   └── composants (penpot component library ref)
│
├── 2. Website Pack
│   ├── Landing / Hero
│   ├── Countdown
│   ├── Story
│   ├── Programme
│   ├── Gallery
│   ├── RSVP
│   ├── Footer
│   ├── Loader
│   ├── 404
│   └── Splash
│
├── 3. Invitation Pack
│   ├── Invitation Standard
│   ├── Invitation VIP
│   ├── Invitation Couple
│   ├── Invitation Famille
│   ├── Invitation Presse
│   ├── Invitation Sponsor
│   ├── Invitation Numérique (QR)
│   └── Invitation PDF
│
├── 4. Print Pack
│   ├── Badge
│   ├── QR Card
│   ├── Place Card
│   ├── Table Card
│   ├── Parking
│   ├── Gift Card
│   └── Remerciement
│
└── 5. Communication Pack
    ├── WhatsApp
    ├── Facebook
    ├── Instagram
    ├── Story
    ├── Banner
    └── Email
```

### 3.2 Implémentation pratique

Chaque sous-pack = un **Frame Registry** stocké dans `Collection.packs` JSON :

```json
{
  "website": {
    "frames": {
      "hero": "penpot-frame-id-1",
      "countdown": "penpot-frame-id-2",
      "story": "penpot-frame-id-3",
      "programme": "penpot-frame-id-4",
      "gallery": "penpot-frame-id-5",
      "rsvp": "penpot-frame-id-6",
      "footer": "penpot-frame-id-7"
    }
  },
  "invitation": {
    "frames": {
      "standard": "penpot-frame-id-10",
      "vip": "penpot-frame-id-11",
      "couple": "penpot-frame-id-12",
      "famille": "penpot-frame-id-13",
      "presse": "penpot-frame-id-14",
      "sponsor": "penpot-frame-id-15"
    }
  },
  "print": {
    "frames": {
      "badge": "penpot-frame-id-20",
      "placeCard": "penpot-frame-id-21",
      "tableCard": "penpot-frame-id-22",
      "parking": "penpot-frame-id-23",
      "giftCard": "penpot-frame-id-24"
    }
  },
  "communication": {
    "frames": {
      "whatsapp": "penpot-frame-id-30",
      "facebook": "penpot-frame-id-31",
      "instagram": "penpot-frame-id-32",
      "email": "penpot-frame-id-33"
    }
  }
}
```

**Les frames ne sont pas copiées** — elles sont lues à la volée par les renderers via Penpot iframe embed (pattern existant de PenpotStudio).

### 3.3 Catalog Library — 12 Collections × 4 Variantes

| # | Collection | Tier | Ambiance |
|---|-----------|------|----------|
| 1 | **Luxury** | PREMIUM | gold |
| 2 | **Royal Gold** | ELITE | gold |
| 3 | **Black Diamond** | ELITE | midnight |
| 4 | **Rose Gold** | PREMIUM | rose |
| 5 | **White Prestige** | PREMIUM | champagne |
| 6 | **Emerald** | PREMIUM | gold |
| 7 | **Ivory** | ESSENTIEL | champagne |
| 8 | **Classic** | TRIAL | gold |
| 9 | **Modern** | ESSENTIEL | gold |
| 10 | **Minimal** | ESSENTIEL | champagne |
| 11 | **African Luxury** | ELITE | gold |
| 12 | **Night Edition** | PREMIUM | midnight |

**Seed initial** : Les 4 THEME_TEMPLATES existants mappent sur Classic (#8), Modern (#9), Minimal (#10), + 1 nouvelle "Royal" (= royal-night → Royal Gold #2). Les 8 autres Collections sont créées progressivement par le designer dans Penpot.

Chaque Collection possède jusqu'à **4 variantes** (A, B, C, D) = 4 pages Penpot dans le même file.

---

## 4. MODÈLE DE DONNÉES (Deliverable 4)

### 4.1 Nouveaux modèles Prisma (ADDITIF)

```prisma
model Collection {
  id              String   @id @default(cuid())
  slug            String   @unique
  name            String
  description     String?
  tier            Plan     @default(TRIAL)  // gate d'accès: TRIAL|ESSENTIEL|PREMIUM|ELITE
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  thumbnailUrl    String?

  // Lien Penpot master file
  penpotFileUrl   String?
  penpotFileId    String?

  // Seed thème (appliqué au Theme row du wedding)
  themeSeed       Json     // {primaryColor, accentColor, fontDisplay, fontBody, layout}

  // Preset ambiance (hydrate luxury-engine-store)
  luxuryPreset    Json?    // {theme: "gold"|"rose"|"champagne"|"midnight", effects: {...}}

  // Frame registries par pack
  packs           Json     // {website, invitation, print, communication} — voir §3.2

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  variants        CollectionVariant[]
  weddings        Wedding[]
  leads           Lead[]
}

model CollectionVariant {
  id              String   @id @default(cuid())
  collectionId    String
  collection      Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  code            String   // "A" | "B" | "C" | "D"
  name            String   // "Version A — Soirée"
  paletteOverride Json?    // {primaryColor?, accentColor?, fontDisplay?, fontBody?}
  penpotPageId    String?  // page Penpot spécifique à cette variante
  isDefault       Boolean  @default(false)
  createdAt       DateTime @default(now())

  @@unique([collectionId, code])
}
```

### 4.2 Additions aux modèles existants (toutes NULLABLE — zéro breaking change)

```prisma
model Wedding {
  // ... champs existants inchangés ...
  collectionId    String?   // nullable — rétrocompatible
  variantId       String?   // nullable
  collection      Collection? @relation(fields: [collectionId], references: [id])
}

model Lead {
  // ... champs existants inchangés ...
  collectionId    String?   // nullable — pré-sélection onboarding
  collection      Collection? @relation(fields: [collectionId], references: [id])
}

model Guest {
  // ... champs existants inchangés ...
  tier            String? @default("STANDARD")
  // valeurs: STANDARD | VIP | FAMILLE | COUPLE | PRESSE | SPONSOR
  // nullable pour rétrocompatibilité — les guests existants restent null
}
```

### 4.3 Stratégie de migration

1. **Éditer** `prisma/schema.prisma` — ajouter les 2 nouveaux models + 3 nouvelles colonnes (toutes nullable)
2. **`bun run db:push`** — SQLite, pas de migration formelle nécessaire
3. **Seed** : les 4 `THEME_TEMPLATES` existants → 4 `Collection` rows + 1 `CollectionVariant` default (code "A", isDefault true) chacune
4. **Aucune donnée existante modifiée** — tous les weddings existants ont `collectionId = null` → comportement inchangé (DEFAULT_THEME)

### 4.4 Pourquoi pas de `ThemeVariant` model ?

Le résumé de l'audit a soulevé : "1:1 cardinality blocks multi-variant without ThemeVariant model". **Décision : NON**. Les variantes sont gérées au niveau **Collection**, pas au niveau Theme. Le Theme row d'un wedding reste **1:1** (inchangé). La variante choisie est stockée dans `Wedding.variantId` et ses overrides sont mergés dans le Theme row au moment du `apply`. Pas de nouvelle cardinalité Theme.

---

## 5. SYNCHRONISATION PENPOT → WEDDING OS (Deliverable 5)

### 5.1 Architecture de sync

```
┌──────────────────────────────────────────────────────────────┐
│  PENPOT (design source of truth)                             │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  File: "Royal Gold Master"                           │    │
│  │  ├── Page A (Variante A)                             │    │
│  │  │   ├── Frame: hero                                 │    │
│  │  │   ├── Frame: invitation-vip                       │    │
│  │  │   ├── Frame: badge                                │    │
│  │  │   └── ...                                         │    │
│  │  ├── Page B (Variante B)                             │    │
│  │  └── Page C (Variante C)                             │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────┘
                           │ (admin link + frame mapping)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  COLLECTION ENGINE (orchestration layer)                     │
│  Collection row:                                             │
│    penpotFileUrl, penpotFileId                               │
│    themeSeed = {colors, fonts, layout}                       │
│    luxuryPreset = {theme, effects}                           │
│    packs = {website, invitation, print, communication}       │
│  CollectionVariant rows:                                     │
│    code A/B/C/D, paletteOverride, penpotPageId               │
└──────────────────────────┬───────────────────────────────────┘
                           │ (couple applies collection)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  EXECUTION ENGINES (existing, unchanged)                     │
│  Theme row (1:1 Wedding):                                    │
│    primaryColor, accentColor, fontDisplay, fontBody, layout  │
│    customizations.penpot = {fileId, pageId, tokens}          │
│    customizations.luxury = {theme, effects}                  │
│  → ThemeInjector injects --theme-* + --penpot-* CSS vars     │
│  → LuxuryVisualEngine hydrates from customizations.luxury    │
│  → InvitationRenderer reads packs.invitation.frames[tier]    │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Token mapping (RÉUTILISÉ — déjà existant)

- `themeToPenpotTokens(theme)` — convertit 4 champs Theme → PenpotTokens (déjà dans `config.ts`)
- `penpotTokensToTheme(tokens)` — convertit PenpotTokens → 4 champs Theme (déjà dans `config.ts`)
- `penpotTokensToCssVars(tokens)` — mappe → `--penpot-*` CSS vars (déjà injecté par ThemeInjector)

**Aucune nouvelle logique de token** — le Collection Engine appelle ces fonctions existantes.

### 5.3 Frame Registry sync flow

1. **Designer** crée la Collection master dans Penpot (1 file, N pages par variante, M frames par page)
2. **Admin** lie le Penpot file URL à la Collection via `CollectionAdmin` UI (parse auto du fileId via `parsePenpotUrl`)
3. **Admin** mappe chaque frame ID → pack slot via UI de mapping (dropdown par slot)
4. **Persistance** : le mapping est stocké dans `Collection.packs` JSON
5. **Au apply** : le Collection Engine copie `penpotFileId` + `penpotPageId` (variante) dans `Theme.customizations.penpot` — les frames individuelles sont lues à la volée par les renderers

### 5.4 Sync directionnel

| Direction | Mécanisme | Déclenchement |
|-----------|-----------|---------------|
| **Penpot → Collection** (design → catalog) | Admin link + frame mapping | Manuel (CollectionAdmin) |
| **Collection → Wedding** (catalog → instance) | `POST /api/collections/apply` | Couple choisit dans CollectionLibrary |
| **Wedding → Penpot** (instance → studio) | PenpotStudio push (existant) | Admin affinage manuel |
| **Penpot → Wedding** (studio → instance) | PenpotStudio pull (existant) | Admin import tokens |

Le Collection Engine n'intervient que dans la 2ème direction. Les 3ème et 4ème sont **inchangées** (PenpotStudio existant).

---

## 6. DÉPLOIEMENT AUTOMATIQUE D'UNE COLLECTION (Deliverable 6)

### 6.1 Pipeline utilisateur

```
1. Créer un mariage (onboarding wizard)
   ↓
2. Choisir une Collection (CollectionLibrary grid)
   ↓
3. Choisir une Variante (A/B/C/D)
   ↓
4. Choisir la Palette (override colors/fonts — optionnel, AI-assisted)
   ↓
5. Importer les photos (Media Engine — existant)
   ↓
6. Compléter les informations (Settings — existant)
   ↓
7. Déployer automatiquement (POST /api/collections/apply)
```

### 6.2 Step-by-step du déploiement (POST /api/collections/apply)

```typescript
// PSEUDO-CODE — pour illustration, pas d'implémentation dans cette phase
POST /api/collections/apply
Body: { collectionId, variantId?, paletteOverride?, weddingId }

1. Auth check + tenant context (AsyncLocalStorage)
2. Fetch Collection + Variant from DB
3. Tier gate: canAccessCollection(wedding.subscription.plan, collection.tier)
   → 403 si pas accessible
4. Merge theme:
   finalTheme = {
     ...collection.themeSeed,
     ...variant?.paletteOverride,    // override variante
     ...body.paletteOverride,        // override couple (optionnel)
   }
5. Upsert Theme row (1:1 Wedding):
   - primaryColor = finalTheme.primaryColor
   - accentColor = finalTheme.accentColor
   - fontDisplay = finalTheme.fontDisplay
   - fontBody = finalTheme.fontBody
   - layout = finalTheme.layout
   - customizations = {
       penpot: {
         fileUrl: collection.penpotFileUrl,
         fileId: collection.penpotFileId,
         pageId: variant?.penpotPageId,
         tokens: themeToPenpotTokens(finalTheme),  // existing fn
         lastSyncedAt: now(),
       },
       luxury: collection.luxuryPreset,
       collectionMeta: { collectionId, variantId, appliedAt: now() },
     }
6. Update Wedding: collectionId, variantId
7. ThemeInjector picks up automatically (existing behavior, ZERO change)
8. LuxuryVisualEngine hydrates from customizations.luxury (new hydration, additive)
9. Return { success: true, theme: finalTheme }
```

### 6.3 Idempotency

| Scénario | Comportement |
|----------|--------------|
| Re-apply même Collection + même Variante + même palette | No-op (détection par `collectionMeta.appliedAt` + hash) |
| Re-apply avec paletteOverride différent | Update Theme uniquement (4 champs + tokens) |
| Switch de Collection | Full re-seed (Theme + customizations + Wedding.collectionId) |
| Switch de Variante | Update pageId + merge paletteOverride variante |

### 6.4 Post-déploiement — ce qui est AUTOMATIQUE

| Moteur | Comportement | Modification |
|--------|-------------|--------------|
| **ThemeInjector** | Lit Theme → injecte `--theme-*` + `--penpot-*` | AUCUNE (existant) |
| **LuxuryVisualEngine** | Lit `customizations.luxury` → hydrate store | Additive (nouveau bloc hydration) |
| **InvitationRenderer** | Lit `customizations.penpot.packs.invitation.frames[tier]` | Nouveau component (wrapper) |
| **PremiumGallery** | Lit `/api/media` (existant) | AUCUNE |
| **Site web public** | Rendu via ThemeInjector CSS vars | AUCUNE |

---

## 7. MÉCANISME DE VARIANTES (Deliverable 7)

### 7.1 Concept

- Une **Collection** a N **variantes** (A, B, C, D)
- Chaque variante = une **page Penpot** dans le même file
- Chaque variante peut avoir un **paletteOverride** (couleurs/fonts alternatifs pour la même structure)
- Le couple choisit : Collection → Variante → Palette (personnalisé)

### 7.2 Data model (cf. §4.1)

```
CollectionVariant {
  code: "A" | "B" | "C" | "D"
  name: "Version A — Soirée"
  paletteOverride: { primaryColor?, accentColor?, fontDisplay?, fontBody? }
  penpotPageId: "page-penpot-id"
  isDefault: boolean
}
```

### 7.3 Merge logic (3 couches d'override)

```
finalTheme = {
  ...collection.themeSeed,           // couche 1: base Collection
  ...variant.paletteOverride,        // couche 2: override Variante
  ...couplePaletteOverride,          // couche 3: override Couple (optionnel, AI-assisted)
}
```

**Priorité** : Couple > Variante > Collection. Le couple peut toujours personnaliser, mais le design principal reste celui de la Collection.

### 7.4 Rôle de l'IA dans les variantes

Conformément à la directive utilisateur : **l'IA ne crée PAS de thème**. Elle intervient uniquement **après** le choix d'une Collection :

| Action IA | Mécanisme |
|-----------|-----------|
| Ajuster les couleurs | Suggère paletteOverride basé sur les photos importées (extraction palette) |
| Harmoniser les typographies | Suggère font pairing compatible avec le themeSeed |
| Améliorer les textes | Suggère wording pour story/programme/invitation |
| Adapter les espacements | Suggère luxuryPreset.effects tweaks |
| Optimiser les images | Suggère crop/recolor pour cohérence Collection |
| Proposer variantes mineures | Suggère paletteOverride alternatifs (A/B/C/D) |

**Implémentation** : Utilise `z-ai-web-dev-sdk` (déjà installé, dormant). Backend-only. Optionnel — le couple peut skipper l'IA et garder le design Collection tel quel.

---

## 8. FONCTIONNEMENT DU CATALOGUE (Deliverable 8)

### 8.1 Catalog UI — CollectionLibrary

**Nouveau component** : `src/components/collections/CollectionLibrary.tsx`

- Clone le pattern grid de `ThemeCustomizer` (4-col grid + live swatches + active checkmark)
- Chaque card :
  - Thumbnail (preview visuel)
  - Nom de la Collection
  - Tier badge (TRIAL / ESSENTIEL / PREMIUM / ELITE)
  - Lock overlay si non-accessible (plan insuffisant)
  - Active ring si c'est la Collection actuellement appliquée
- Click sur card accessible → ouvre **VariantPicker** (A/B/C/D)
- Sélection variante → ouvre **PalettePicker** (override optionnel)
- Confirmation → `POST /api/collections/apply`

### 8.2 Tier gating

**Nouveau helper** : `src/lib/collections/index.ts`

```typescript
canAccessCollection(plan: Plan, collectionTier: Plan): boolean
// TRIAL → TRIAL collections seulement
// ESSENTIEL → TRIAL + ESSENTIEL
// PREMIUM → + PREMIUM
// ELITE → all
```

Ce helper s'ajoute aux `PLAN_LIMITS` existants (quotas quantitatifs). **Aucune modification** aux helpers existants (`checkGuestLimit`, etc.).

### 8.3 Vues différenciées

| Acteur | Voit | Action |
|--------|------|--------|
| **Couple** (tenant admin) | CollectionLibrary (filtré par plan) | Choisit Collection + Variante + Palette |
| **Couple** | NE VOIT PAS Penpot | — |
| **Admin / Designer** (platform admin) | CollectionAdmin (CRUD + Penpot linking + frame mapping) | Crée/édite Collections, lie Penpot files, mappe frames |
| **Admin / Designer** | PenpotStudio (existant) | Push/pull tokens, affinage manuel |

### 8.4 Mount points

| Location | Component | Tab |
|----------|-----------|-----|
| Tenant admin (`/w/[slug]/admin`) | `CollectionLibrary` | Nouveau tab `collections` (entre `dashboard` et `theme`) |
| Platform admin (`/platform/admin`) | `CollectionAdmin` | Nouveau tab `collections` |
| Onboarding wizard (`OnboardingTab`) | `CollectionLibrary` (embedded) | Nouveau step "Choisir une Collection" |

---

## 9. VÉRIFICATION ZÉRO RÉGRESSION (Deliverable 9)

### 9.1 Risk matrix

| Risk | Probabilité | Impact | Mitigation |
|------|-------------|--------|------------|
| Theme row corruption au apply | Faible | Élevé | Upsert (pas de delete) + idempotency check |
| LuxuryVisualEngine casse si customizations.luxury absent | Faible | Moyen | Hydration défensive (si absent → fallback localStorage existant) |
| InvitationRenderer casse si packs.invitation absent | Faible | Élevé | Fallback vers InvitationCard existant (wrapper pattern) |
| Guest.tier null sur guests existants | Certain | Faible | Default "STANDARD" au niveau renderer |
| Duplicate-wedding copie collectionId | Moyen | Faible | Patcher duplicate route : clear collectionId + variantId (le nouveau wedding doit re-choisir) |
| Onboarding wizard casse si collectionId absent | Faible | Moyen | Step Collection optionnel (peut skipper → DEFAULT_THEME) |
| Billing tier check incorrect | Faible | Élevé | canAccessCollection réutilise la même enum Plan existante |
| Theme.customizations shape change | Faible | Élevé | Additive uniquement — `{penpot, luxury, collectionMeta}` ne supprime jamais `penpot` |

### 9.2 Safeguards (garanties techniques)

1. **Toutes nouvelles colonnes sont NULLABLE** → weddings existants ont `collectionId = null` → comportement inchangé
2. **Theme row créé lazily** (inchangé) — `Collection.apply` fait un upsert, pas un create forcé
3. **Default behavior si `collectionId` null** = comportement actuel (DEFAULT_THEME + localStorage luxury)
4. **ThemeCustomizer inchangé** — coexiste avec Collection (le couple peut affiner manuellement après apply)
5. **PenpotStudio inchangé** — coexiste avec Collection (admin peut toujours push/pull manuellement)
6. **InvitationCard inchangé** — `InvitationRenderer` est un nouveau wrapper, pas un remplacement (fallback vers InvitationCard si pas de Penpot frame lié)
7. **Aucune modification aux routes API existantes** — seulement ajout de `/api/collections/**`
8. **Aucune modification au schema existant** — que des additions (nouveaux models + colonnes nullable)
9. **Aucune modification au multi-tenant** — Collection Engine respecte AsyncLocalStorage + Prisma extension
10. **Aucune modification au billing** — `canAccessCollection` est une nouvelle fonction additive

### 9.3 Rollback plan

Si régression détectée après implémentation :

1. **Drop** `Collection` + `CollectionVariant` models
2. **Drop** `Wedding.collectionId` + `Wedding.variantId` + `Lead.collectionId` + `Guest.tier`
3. **`bun run db:push`** — SQLite refait le schema
4. **Tous les weddings retombent** sur DEFAULT_THEME (comportement actuel)
5. **Zéro donnée perdue** — les Theme rows existants sont préservés (la colonne customizations garde son contenu)
6. **Supprimer** les nouveaux fichiers : `src/lib/collections/`, `src/components/collections/`, `src/components/wedding/InvitationRenderer.tsx`
7. **Revert** les additions aux fichiers modifiés (nav items, onboarding step, ThemeInjector hydration block)

**Rollback time estimé** : < 30 minutes.

### 9.4 Tests de non-régression (vérification post-implémentation)

| Test | Attendu |
|------|---------|
| Homepage `/` sans collectionId | Rendu DEFAULT_THEME (inchangé) |
| Tenant wedding `/w/[slug]` sans collectionId | Rendu Theme row existant (inchangé) |
| `/api/theme` GET sans Theme row | Retourne DEFAULT_THEME (inchangé) |
| `PenpotStudio` push/pull | Fonctionne (inchangé) |
| `ThemeCustomizer` save | Fonctionne (inchangé) |
| `InvitationCard` rendu direct | Fonctionne (fallback si pas de Penpot frame) |
| `PremiumGallery` self-fetch | Fonctionne (inchangé) |
| `LuxuryVisualEngine` sans customizations.luxury | Lit localStorage (inchangé) |
| Onboarding sans Collection step | Crée wedding avec DEFAULT_THEME (inchangé) |
| Duplicate wedding | Ne copie PAS collectionId (patché) |

---

## 10. PLAN D'IMPLÉMENTATION PROGRESSIF (Deliverable 10)

> **Ordre strict** : chaque phase dépend de la précédente. Aucune phase ne modifie le code existant de façon breaking.

### Phase 0 — Schema & Seed (3–4h)

| Tâche | Détail |
|-------|--------|
| Éditer `prisma/schema.prisma` | Ajouter `Collection` + `CollectionVariant` models + 3 colonnes nullable (Wedding.collectionId, Wedding.variantId, Lead.collectionId, Guest.tier) |
| `bun run db:push` | Push schema |
| Créer `src/lib/collections/seed.ts` | Les 4 THEME_TEMPLATES → 4 Collection rows + 1 variante default chacune |
| Exécuter seed | One-time script |

**Livrables** : Schema + seed. **Zéro impact runtime** (colonnes nullable).

### Phase 1 — Collection Library API (2–3h)

| Tâche | Détail |
|-------|--------|
| Créer `src/lib/collections/index.ts` | `canAccessCollection(plan, tier)`, `applyCollection(weddingId, collectionId, variantId?, paletteOverride?)`, `listCollections(plan?)`, `getCollection(id)` |
| Créer `src/app/api/collections/route.ts` | GET list (filtre par tier accessible) |
| Créer `src/app/api/collections/[id]/route.ts` | GET detail + variants |
| Créer `src/app/api/collections/apply/route.ts` | POST apply (gated by plan, tenant-scoped) |

**Livrables** : 4 nouveaux fichiers. **Aucune modification** aux routes existantes.

### Phase 2 — Collection Library UI (3–4h)

| Tâche | Détail |
|-------|--------|
| Créer `src/components/collections/CollectionLibrary.tsx` | Grid 4-col + tier badges + lock overlay + active ring |
| Créer `src/components/collections/VariantPicker.tsx` | Modal A/B/C/D selector |
| Créer `src/components/collections/PalettePicker.tsx` | Override optionnel (color/font pickers) |
| Modifier `src/app/w/[slug]/admin/page.tsx` | +1 nav item `collections` + 1 case render `<CollectionLibrary slug={slug} />` |

**Livrables** : 3 nouveaux components + 1 modification additive (nav item). **Existant inchangé**.

### Phase 3 — Onboarding Integration (2–3h)

| Tâche | Détail |
|-------|--------|
| Modifier `src/app/api/onboarding/create-wedding/route.ts` | Accepter `collectionId?` + `variantId?` optionnels. Après création wedding, si collectionId → appeler `applyCollection()` |
| Modifier `OnboardingTab` wizard | +1 step "Choisir une Collection" (optionnel, peut skipper) |
| Modifier `Lead` form | Ajouter collectionId hidden field (pré-sélection depuis landing) |

**Livrables** : 2 modifications additives. **Comportement sans collectionId inchangé**.

### Phase 4 — Luxury Preset Sync (2h)

| Tâche | Détail |
|-------|--------|
| Modifier `src/components/wedding/ThemeInjector.tsx` | +1 bloc : lire `customizations.luxury` → hydrate `luxury-engine-store` (merge non-destructif avec localStorage) |
| Test | Si `customizations.luxury` absent → comportement localStorage (inchangé) |

**Livrables** : 1 modification additive. **Fallback défensif**.

### Phase 5 — Invitation Renderer (4–5h)

| Tâche | Détail |
|-------|--------|
| Créer `src/components/wedding/InvitationRenderer.tsx` | Dispatcher par `guest.tier` : si Penpot frame lié → `<PenpotInvitationCard>`, sinon → `<InvitationCard>` (fallback) |
| Créer `src/components/wedding/PenpotInvitationCard.tsx` | Wrapper iframe Penpot frame (pattern PenpotStudio) + data injection via URL params |
| Modifier `src/components/wedding/GuestPersonalSpace.tsx` | Remplacer `<InvitationCard>` par `<InvitationRenderer>` (le fallback garantit le comportement existant) |

**Livrables** : 2 nouveaux components + 1 modification (swap par wrapper). **InvitationCard inchangé**.

### Phase 6 — Collection Admin (3–4h)

| Tâche | Détail |
|-------|--------|
| Créer `src/components/admin/CollectionAdmin.tsx` | CRUD Collections + Penpot file linking + frame mapping UI |
| Créer `src/app/api/collections/route.ts` (POST) | Admin-only create |
| Créer `src/app/api/collections/[id]/route.ts` (PUT, DELETE) | Admin-only update/delete |
| Modifier `src/app/platform/admin/page.tsx` | +1 nav item `collections` + 1 case render `<CollectionAdmin />` |

**Livrables** : 1 nouveau component + 2 nouveaux endpoints + 1 modification additive. **Platform admin existant inchangé**.

### Phase 7 — Print & Communication Packs (DEFERRED v2, ~10–15h)

| Tâche | Détail |
|-------|--------|
| `PrintPackRenderer.tsx` | Badge, Place Card, Table Card, Parking, Gift Card, Remerciement |
| `CommunicationPackRenderer.tsx` | WhatsApp, Facebook, Instagram, Story, Banner, Email templates |
| Export pipeline refactor | Extraire `handleDownload` de GuestPersonalSpace → utilitaire partagé |

**Dépendance** : Phase 5 (renderer infrastructure). **Peut être différée** sans impacter le core Collection Engine.

### Patch concomitant — Duplicate-wedding fix (30 min)

| Tâche | Détail |
|-------|--------|
| Modifier `src/app/api/platform/weddings/[id]/duplicate/route.ts` | Clear `collectionId` + `variantId` sur le wedding dupliqué. Clear `customizations.penpot.fileId` + `fileUrl` (keep tokens). Garde `customizations.luxury` (ambiance transférable). |

**Pourquoi** : Évite que le wedding dupliqué pointe vers le même Penpot file master (data-leak risk identifié dans l'audit).

---

### Synthèse effort & dépendances

| Phase | Effort | Dépend de | Risque |
|-------|--------|-----------|--------|
| 0 — Schema & Seed | 3–4h | — | Faible (additif) |
| 1 — Collection API | 2–3h | Phase 0 | Faible (nouveaux endpoints) |
| 2 — Collection UI | 3–4h | Phase 1 | Faible (nouveaux components) |
| 3 — Onboarding | 2–3h | Phase 1 | Moyen (modifie wizard existant) |
| 4 — Luxury Sync | 2h | Phase 0 | Faible (additif défensif) |
| 5 — Invitation Renderer | 4–5h | Phase 1 | Moyen (wrapper pattern) |
| 6 — Collection Admin | 3–4h | Phase 1 | Faible (platform admin only) |
| 7 — Print & Comms (v2) | 10–15h | Phase 5 | Faible (deferred) |
| Patch — Duplicate fix | 0.5h | — | Faible (2 lignes) |

**Total Phase 0–6 + Patch : ~19.5–25.5h**

### Ordre d'exécution recommandé

```
Phase 0 (Schema & Seed)
    ↓
Phase 1 (Collection API)  ←─ en parallèle ─→  Phase 4 (Luxury Sync)
    ↓
Phase 2 (Collection UI)
    ↓
Phase 3 (Onboarding)  ←─ en parallèle ─→  Phase 5 (Invitation Renderer)
    ↓
Phase 6 (Collection Admin)
    ↓
[STOP — validation complète]
    ↓
Phase 7 (v2, deferred)
```

---

## ANNEXE A — Fichiers créés (preview)

```
src/lib/collections/
├── seed.ts                      (Phase 0)
└── index.ts                     (Phase 1)

src/app/api/collections/
├── route.ts                     (Phase 1 — GET list)
├── [id]/route.ts                (Phase 1 — GET detail)
├── apply/route.ts               (Phase 1 — POST apply)
└── (Phase 6 — POST/PUT/DELETE admin)

src/components/collections/
├── CollectionLibrary.tsx        (Phase 2)
├── VariantPicker.tsx            (Phase 2)
└── PalettePicker.tsx            (Phase 2)

src/components/admin/
└── CollectionAdmin.tsx          (Phase 6)

src/components/wedding/
├── InvitationRenderer.tsx       (Phase 5)
└── PenpotInvitationCard.tsx     (Phase 5)
```

## ANNEXE B — Fichiers modifiés (preview)

| Fichier | Phase | Modification |
|---------|-------|--------------|
| `prisma/schema.prisma` | 0 | +2 models, +4 colonnes nullable |
| `src/app/w/[slug]/admin/page.tsx` | 2 | +1 nav item, +1 case |
| `src/app/api/onboarding/create-wedding/route.ts` | 3 | +collectionId param optionnel |
| `src/components/admin/OnboardingTab.tsx` | 3 | +1 step Collection |
| `src/components/wedding/ThemeInjector.tsx` | 4 | +1 bloc hydration luxury |
| `src/components/wedding/GuestPersonalSpace.tsx` | 5 | swap InvitationCard → InvitationRenderer |
| `src/app/platform/admin/page.tsx` | 6 | +1 nav item, +1 case |
| `src/app/api/platform/weddings/[id]/duplicate/route.ts` | Patch | clear collectionId + penpot fileId |

**Total** : 8 fichiers modifiés (tous additifs sauf le swap GuestPersonalSpace qui a un fallback garantissant le comportement existant).

---

## CONCLUSION

Ce plan transforme Penpot en **Template Factory** sans reconstruire aucun moteur existant. Le Collection Engine est une **couche d'orchestration pure** qui :

1. **Réutilise** Theme Engine, ThemeCustomizer, ThemeInjector, PenpotStudio, Theme.customizations, Invitation Engine, Media Engine, LuxuryVisualEngine, Billing, Wedding Workspace, Multi-tenant — **tous inchangés ou étendus additivement**
2. **Ajoute** 2 nouveaux models Prisma (Collection + CollectionVariant) + 4 colonnes nullable + 8 nouveaux fichiers + 8 modifications additives
3. **Garantit zéro régression** via : colonnes nullable, fallback défensif, wrapper pattern, rollback < 30 min
4. **Respecte la directive IA** : l'IA n'intervient qu'après le choix de Collection (ajustements, pas création)

**En attente de validation utilisateur pour débuter la Phase 0.**
