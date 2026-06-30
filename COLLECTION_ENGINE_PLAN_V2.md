# PLAN V2 — COLLECTION ENGINE (RECADRAGE ARCHITECTURAL)
## Wedding OS = SaaS Enterprise de Déploiement de Collections Premium

> **Statut** : PLANIFICATION ONLY — aucun code écrit. Supplante `COLLECTION_ENGINE_PLAN.md` (v1).
> **Vision figée** : Wedding OS ne fabrique PLUS de thèmes. Il DÉPLOIE des Collections créées dans Penpot.
> **Principe absolu** : Zéro duplication de Penpot. Zéro éditeur graphique. Zéro constructeur de thème.
> **Méthode** : Audit → Réutiliser → Étendre si nécessaire → Vérifier régressions → Tester → Documenter → Gate validation → Étape suivante.

---

## 0. EXECUTIVE SUMMARY — RECADRAGE

Le plan v1 (`COLLECTION_ENGINE_PLAN.md`) était **techniquement correct** mais **architecturalement aligné sur l'ancienne vision** (Wedding OS comme éditeur de thèmes orchestré par Penpot). Le recast exige un **changement de paradigme** :

| Ancienne vision (v1) | Nouvelle vision (v2) |
|----------------------|---------------------|
| Wedding OS manipule des **Thèmes** | Wedding OS manipule des **Collections** |
| Collection = wrapper autour du Theme Engine | Collection = **produit fini commercial** |
| 1 niveau d'abstraction (Collection → Frame) | **2 niveaux** (Collection → DesignSystem → Module → Frame) |
| Admin lie manuellement Penpot files | **Designer publie** → Wedding OS détecte → catalog auto |
| Tier = billing plan (TRIAL/ESSENTIEL/PREMIUM/ELITE) | **2 axes orthogonaux** : billing tier (accès) + marketplace tier (positionnement) |
| Phases parallèles possibles | **STRICTEMENT SÉQUENTIEL** avec gate validation |
| ThemeCustomizer = coexiste comme éditeur | ThemeCustomizer = **subordonné** (palette override seulement, pas création) |

**Ce qui est PRESERVÉ du v1** : le caractère additif/rétrocompatible/réversible, la réutilisation des moteurs existants, le modèle Collection+Variant, le wrapper InvitationRenderer avec fallback, le patch duplicate-wedding.

**Ce qui est AJOUTÉ en v2** : couche DesignSystem, modèle Module, workflow Designer-Publish, préparation Marketplace (data only), phases strictement séquentielles avec gates.

---

## 1. AUDIT DE CONFORMITÉ V1 → V2 (Deliverable obligatoire)

### 1.1 Conformités VALIDÉES (v1 → v2 — conservées telles quelles)

| Décision v1 | Conforme à v2 ? | Raison |
|-------------|-----------------|--------|
| Penpot = Studio officiel (non dupliqué) | ✅ OUI | "Ne développe AUCUN système qui duplique Penpot" |
| IA ajuste seulement, ne crée pas | ✅ OUI | "L'IA n'est PAS le moteur de création" |
| 2 nouveaux models (Collection + CollectionVariant) | ✅ OUI (étendu) | Base conservée, DesignSystem+Module ajoutés |
| Toutes colonnes nullable → zéro breaking | ✅ OUI | "additives, rétrocompatibles, réversibles" |
| InvitationRenderer = wrapper avec fallback InvitationCard | ✅ OUI | "ne jamais réécrire une fonctionnalité existante" |
| `canAccessCollection` helper additif | ✅ OUI (étendu) | Devient `canAccessCollection(billingPlan, marketplaceTier)` |
| Réutilisation Theme Engine, ThemeInjector, Invitation Engine, LuxuryVisualEngine, Media Engine, Billing, Multi-tenant, Wedding Workspace | ✅ OUI | Liste de réusage confirmée et étendue |
| Patch duplicate-wedding (clear collectionId + penpot fileId) | ✅ OUI | Fix data-leak conservé |

### 1.2 DIVERGENCES identifiées (v1 → v2 — CORRIGÉES)

| # | Décision v1 | Divergence vs v2 | Correction v2 |
|---|-------------|------------------|---------------|
| **D1** | 1 niveau d'abstraction (Collection → Frame direct) | v2 exige **Collection → DesignSystem → Module → Frame** | Ajout models `DesignSystem` + `Module` |
| **D2** | Collection = wrapper Theme Engine | v2 : Collection = **produit fini**, Theme Engine est un **moteur d'exécution subordonné** | Reframe mental : Theme row devient un *artifact* généré par le Collection Engine, pas l'objet principal |
| **D3** | Admin lie manuellement Penpot files via CollectionAdmin | v2 : **Designer publie** dans Penpot → Wedding OS **détecte** → catalog auto | Workflow Designer-Publish avec auto-détection frames par convention de nommage |
| **D4** | 1 axe `tier` (= billing plan TRIAL/ESSENTIEL/PREMIUM/ELITE) | v2 exige **2 axes orthogonaux** : billing tier (accès) + marketplace tier (positionnement commercial) + category | Ajout champs `marketplaceTier` + `category` (data only, no UI) |
| **D5** | Phases parallèles possibles (Phase 1 ∥ Phase 4) | v2 : **STRICTEMENT SÉQUENTIEL** avec gate validation | Réécriture du plan en phases strictement séquentielles, gate validation obligatoire entre chaque |
| **D6** | ThemeCustomizer coexiste comme éditeur manuel | v2 : "Wedding OS ne fabrique plus de thèmes" — ThemeCustomizer devient **subordonné** (palette override seulement) | ThemeCustomizer inchangé en code MAIS repositionné en UI : déplacé/relégué, CollectionLibrary devient l'entrée principale |
| **D7** | Packs listés génériques (website/invitation/print/communication) | v2 liste **exacts** les items obligatoires par pack | Structure packs mise à jour avec tous les items nominatifs |
| **D8** | Réusage listait 10 moteurs | v2 ajoute explicitement **Command Center, QR Engine, Guest Engine** | Matrice réusage étendue aux 13 moteurs/concepts |

### 1.3 Vérification de non-écart

> *"Avant toute implémentation, vérifie que chaque décision technique rapproche la plateforme de cette vision. Si une proposition s'en écarte, arrête-toi, explique pourquoi, et propose une alternative conforme."*

**Conformité globale v2** : ✅ VALIDÉE. Toutes les décisions techniques ci-après sont tracées à la vision. Aucun éditeur graphique, aucun constructeur de thème, aucune duplication de Penpot. Wedding OS orchestre uniquement : données, invités, QR, couleurs, photos, textes, accès, permissions, déploiement.

---

## 2. NOUVELLE ARCHITECTURE : 4 NIVEAUX D'ABSTRACTION

```
┌─────────────────────────────────────────────────────────────┐
│  NIVEAU 1 — COLLECTION (produit commercial fini)            │
│  Exemple : "Royal Gold"                                     │
│  → possède : marketplaceTier, category, designSystemId      │
│  → possède : luxuryPreset, themeSeed, packs registry        │
└───────────────────────────┬─────────────────────────────────┘
                            │ belongs to
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  NIVEAU 2 — DESIGN SYSTEM (langage de design partagé)       │
│  Exemple : "Royal" (partagé par Royal Gold, Royal Emerald)  │
│  → possède : color palette tokens, typography scale,        │
│              spacing scale, component library ref           │
│  → possède : ensemble de Modules réutilisables              │
└───────────────────────────┬─────────────────────────────────┘
                            │ has many
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  NIVEAU 3 — MODULE (bloc fonctionnel réutilisable)          │
│  Exemples : "Invitation VIP", "Badge", "Hero", "Countdown"  │
│  → possède : type (website/invitation/print/communication)  │
│  → possède : slot name (hero, vip, badge, whatsapp...)      │
│  → mappe vers : 1+ Frames Penpot                            │
└───────────────────────────┬─────────────────────────────────┘
                            │ renders via
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  NIVEAU 4 — FRAME PENPOT (rendu concret)                    │
│  Exemple : penpot frame ID "abc123" dans page "Variante A"  │
│  → lu à la volée par les renderers via iframe embed         │
│  → ZÉRO copie : Wedding OS ne stocke pas le rendu, juste ID │
└─────────────────────────────────────────────────────────────┘
```

### Exemple concret (sans modifier le code demain)

```
Design System "Luxury Royal"
├── Module: "Invitation VIP"        → Frame penpot-id-1
├── Module: "Invitation Standard"   → Frame penpot-id-2
├── Module: "Badge"                 → Frame penpot-id-3
├── Module: "Hero"                  → Frame penpot-id-4
└── Module: "Countdown"             → Frame penpot-id-5
        ↓ dérive
Collection "Royal Gold"
├── designSystemId → "Luxury Royal"
├── themeSeed → {primaryColor: #D4AF37, accentColor: #1a1a2e, ...}
├── luxuryPreset → {theme: gold, effects: {...}}
├── packs → {
│     invitation: {vip: module-1, standard: module-2},
│     print: {badge: module-3},
│     website: {hero: module-4, countdown: module-5}
│   }
└── Variant A → penpotPageId "page-a"
    Variant B → penpotPageId "page-b"

        ↓ commercial déploie pour un mariage
Wedding "josue-hornella"
├── collectionId → "Royal Gold"
├── variantId → "Variant A"
└── Theme row (généré) → primaryColor #D4AF37, customizations.penpot.fileId
```

**Bénéfice** : demain, créer "Royal Emerald" = dupliquer "Royal Gold" + changer themeSeed + lier d'autres frames. Zéro code. C'est l'objectif du recast.

---

## 3. STRUCTURE DÉFINITIVE DES COLLECTIONS (5 packs exacts)

Conformément à la directive, chaque Collection contient **obligatoirement** ces 5 packs avec ces items exacts :

### Pack 1 — WEBSITE (10 modules)

| Slot | Module | Frame Penpot |
|------|--------|--------------|
| `hero` | Hero | frame-id |
| `countdown` | Countdown | frame-id |
| `story` | Notre histoire | frame-id |
| `gallery` | Galerie | frame-id |
| `programme` | Programme | frame-id |
| `rsvp` | RSVP | frame-id |
| `footer` | Footer | frame-id |
| `loader` | Loader | frame-id |
| `splash` | Splash | frame-id |
| `systemPages` | Pages système (404, etc.) | frame-id |

### Pack 2 — INVITATIONS (8 modules)

| Slot | Module | Frame Penpot |
|------|--------|--------------|
| `standard` | Invitation Standard | frame-id |
| `vip` | Invitation VIP | frame-id |
| `famille` | Invitation Famille | frame-id |
| `couple` | Invitation Couple | frame-id |
| `presse` | Invitation Presse | frame-id |
| `sponsor` | Invitation Sponsor | frame-id |
| `numerique` | Invitation Numérique (QR) | frame-id |
| `impression` | Invitation PDF Impression | frame-id |

### Pack 3 — SUPPORTS IMPRIMÉS (8 modules)

| Slot | Module | Frame Penpot |
|------|--------|--------------|
| `badge` | Badge | frame-id |
| `qr` | QR Card | frame-id |
| `parking` | Carte parking | frame-id |
| `floorPlan` | Plan de salle | frame-id |
| `tableNumber` | Numéro de table | frame-id |
| `placeCard` | Marque-place | frame-id |
| `remerciement` | Remerciement | frame-id |
| `livreOr` | Livre d'or | frame-id |

### Pack 4 — COMMUNICATION (8 modules)

| Slot | Module | Frame Penpot |
|------|--------|--------------|
| `whatsapp` | WhatsApp | frame-id |
| `facebook` | Facebook | frame-id |
| `instagram` | Instagram | frame-id |
| `story` | Story | frame-id |
| `email` | Email | frame-id |
| `banner` | Bannière | frame-id |
| `affiche` | Affiche | frame-id |
| `rollup` | Roll-up | frame-id |

### Pack 5 — LUXURY PRESET (1 module composite)

| Slot | Contenu |
|------|---------|
| `luxuryPreset` | JSON : `{theme: gold\|rose\|champagne\|midnight, effects: {starrySky, goldenDust, microSparkles, luminousHalos, globalBreathing, sectionAmbiance, scrollReflections}, intensity, density, speed, haloCount}` |

**Réutilisation LuxuryVisualEngine existant** — aucun nouveau moteur. Le luxuryPreset hydrate le `luxury-engine-store` via ThemeInjector (additif, défensif).

**Total** : 34 modules obligatoires par Collection + 1 luxuryPreset. Une Collection **incomplète** ne peut pas être publiée (validation au publish).

---

## 4. MODÈLE DE DONNÉES RÉVISÉ (ADDITIF)

### 4.1 Nouveaux modèles Prisma

```prisma
// NIVEAU 2 — Design System
model DesignSystem {
  id              String   @id @default(cuid())
  slug            String   @unique              // "luxury-royal", "minimal-clean"
  name            String                        // "Luxury Royal"
  description     String?
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)

  // Langage de design (tokens partagés)
  colorPalette    Json     // {primary, accent, secondary, background, text}
  typographyScale Json     // {display, body, scale: {h1, h2, body, small}}
  spacingScale    Json?    // {unit, ratios}
  componentLibRef String?  // Penpot component library URL

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  collections     Collection[]
  modules         Module[]
}

// NIVEAU 3 — Module (bloc réutilisable)
model Module {
  id              String   @id @default(cuid())
  designSystemId  String
  designSystem    DesignSystem @relation(fields: [designSystemId], references: [id], onDelete: Cascade)

  slug            String                        // "invitation-vip", "hero", "badge"
  name            String                        // "Invitation VIP"
  packType        String                        // "website" | "invitation" | "print" | "communication"
  slotName        String                        // "vip", "hero", "badge" (clé dans packs registry)
  description     String?
  isRequired      Boolean  @default(true)       // true pour les 34 modules obligatoires

  // Frame Penpot par défaut (peut être overridé par Collection)
  defaultFrameId  String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([designSystemId, slotName])
}

// NIVEAU 1 — Collection (produit fini)
model Collection {
  id              String   @id @default(cuid())
  slug            String   @unique              // "royal-gold"
  name            String                        // "Royal Gold"
  description     String?
  thumbnailUrl    String?
  isActive        Boolean  @default(true)       // visible dans le catalog si true
  isPublished     Boolean  @default(false)      // false = draft, true = publié par designer
  sortOrder       Int      @default(0)

  // Hiérarchie
  designSystemId  String
  designSystem    DesignSystem @relation(fields: [designSystemId], references: [id])

  // Marketplace architecture (DATA ONLY — no UI, no payment routing)
  marketplaceTier String   @default("FREE")     // FREE|PREMIUM|EXCLUSIVE|ENTERPRISE|LIMITED|EVENT|SIGNATURE
  category        String   @default("LUXURY")   // LUXURY|ROYAL|CLASSIC|MINIMAL|AFRICAN|MODERN|CATHOLIC|CIVIL|DESTINATION|BEACH|GARDEN|WINTER

  // Lien Penpot master file (source of truth = Penpot)
  penpotFileUrl   String?
  penpotFileId    String?

  // Seed thème (appliqué au Theme row du wedding au déploiement)
  themeSeed       Json     // {primaryColor, accentColor, fontDisplay, fontBody, layout}

  // Luxury preset (hydrate luxury-engine-store via ThemeInjector)
  luxuryPreset    Json?    // {theme, effects, intensity, density, speed, haloCount}

  // Packs registry : map slotName → {moduleId, frameId}
  // FrameId peut override le defaultFrameId du Module
  packs           Json     // voir structure §3 — 4 packs × 8-10 slots

  // Metadata marketplace (préparé, non codé)
  priceFcfa       Int?
  priceUsd        Float?
  limitedQuantity Int?     // null = illimité, sinon nombre max de ventes
  eventDate       DateTime? // pour collections EVENT (ex: Noël, Saint-Valentin)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  publishedAt     DateTime?

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

### 4.2 Additions aux modèles existants (toutes NULLABLE)

```prisma
model Wedding {
  // ... champs existants inchangés ...
  collectionId    String?
  variantId       String?
  collection      Collection? @relation(fields: [collectionId], references: [id])
}

model Lead {
  // ... champs existants inchangés ...
  collectionId    String?
  collection      Collection? @relation(fields: [collectionId], references: [id])
}

model Guest {
  // ... champs existants inchangés ...
  tier            String? @default("STANDARD")
  // valeurs: STANDARD | VIP | FAMILLE | COUPLE | PRESSE | SPONSOR
  // nullable pour rétrocompatibilité
}
```

### 4.3 Stratégie de migration

1. Éditer `prisma/schema.prisma` — ajouter 3 nouveaux models + 3 colonnes nullable
2. `bun run db:push` — SQLite
3. **Seed initial** :
   - 1 DesignSystem "luxury-royal" (dérivé de royal-night template)
   - 1 DesignSystem "classic-gold" (dérivé de classic-gold template)
   - 34 Modules par DesignSystem (les slots obligatoires × 2 design systems = 68 modules seed, avec defaultFrameId null pour l'instant — le designer les remplira au publish)
   - 4 Collections (mappées depuis les 4 THEME_TEMPLATES existants) + 1 Variante default chacune
4. **Aucune donnée existante modifiée** — tous les weddings existants ont `collectionId = null`

### 4.4 Pourquoi PAS de ThemeVariant model

Confirmé (comme v1) : les variantes vivent au niveau **Collection**, pas Theme. Le Theme row reste **1:1** avec Wedding (inchangé). La variante choisie est stockée dans `Wedding.variantId` et ses overrides sont mergés dans le Theme row au moment du `apply`. Pas de nouvelle cardinalité Theme.

---

## 5. WORKFLOW DESIGNER-PUBLISH (Auto-détection)

### 5.1 Vision

```
Designer
  ↓ ouvre Penpot
  ↓ crée une nouvelle Collection (master file)
  ↓     ├── Page "Variante A" avec frames nommées par convention
  ↓     ├── Page "Variante B" (optionnel)
  ↓     └── Page "Variante C" (optionnel)
  ↓ rend le file public (Penpot share link)
  ↓
Designer ouvre Wedding OS → Platform Admin → "Collections"
  ↓ clique "Publier une Collection depuis Penpot"
  ↓ colle le Penpot share URL
  ↓
Wedding OS DÉTECTE automatiquement :
  ↓     ├── parse fileId via parsePenpotUrl() (existant)
  ↓     ├── fetch Penpot file structure (v1: manuel, v2: Penpot API auto)
  ↓     ├── auto-suggest frame mappings par convention de nommage :
  ↓     │     frame "invitation-vip" → Module slot "vip"
  ↓     │     frame "badge" → Module slot "badge"
  ↓     │     frame "hero" → Module slot "hero"
  ↓     ├── designer confirme/ajuste les mappings
  ↓     ├── designer set marketplaceTier + category
  ↓     └── designer clique "Publier"
  ↓
Collection.isPublished = true
Collection.isActive = true
Collection.publishedAt = now()
  ↓
La Collection apparaît AUTOMATIQUEMENT dans le catalog
  ↓
Le commercial peut immédiatement la vendre
```

### 5.2 Convention de nommage des frames (recommandée au designer)

Pour permettre l'auto-détection, le designer nomme ses frames Penpot selon la convention :

| Pack | Slot | Frame name attendu |
|------|------|-------------------|
| website | hero | `hero` ou `website-hero` |
| website | countdown | `countdown` |
| website | story | `story` |
| website | gallery | `gallery` |
| website | programme | `programme` |
| website | rsvp | `rsvp` |
| website | footer | `footer` |
| invitation | standard | `invitation-standard` |
| invitation | vip | `invitation-vip` |
| invitation | famille | `invitation-famille` |
| invitation | couple | `invitation-couple` |
| invitation | presse | `invitation-presse` |
| invitation | sponsor | `invitation-sponsor` |
| invitation | numerique | `invitation-numerique` |
| invitation | impression | `invitation-impression` |
| print | badge | `badge` |
| print | qr | `qr-card` |
| print | parking | `parking` |
| print | floorPlan | `floor-plan` |
| print | tableNumber | `table-number` |
| print | placeCard | `place-card` |
| print | remerciement | `remerciement` |
| print | livreOr | `livre-or` |
| communication | whatsapp | `whatsapp` |
| communication | facebook | `facebook` |
| communication | instagram | `instagram` |
| communication | story | `story-comm` |
| communication | email | `email` |
| communication | banner | `banner` |
| communication | affiche | `affiche` |
| communication | rollup | `roll-up` |

**v1 (manuel)** : le designer mappe manuellement chaque frame via dropdown UI.
**v2 (auto-detect)** : Wedding OS fetch la Penpot file structure via API et auto-suggère les mappings. Le designer confirme.

### 5.3 Validation au publish

Un publish est rejeté si :
- `themeSeed` incomplet (4 champs obligatoires)
- `packs` registry incomplet (les 34 slots obligatoires non mappés)
- `penpotFileUrl` invalide (parsePenpotUrl échoue)
- `marketplaceTier` ou `category` non set

Cela garantit qu'aucune Collection incomplète n'apparaît dans le catalog.

---

## 6. ARCHITECTURE MARKETPLACE (PRÉPARATION DATA ONLY)

### 6.1 Directive respectée

> *"Ne coder aucun Marketplace pour l'instant. Préparer uniquement l'architecture."*

**DONC** : seuls les champs data sont ajoutés au modèle `Collection`. **AUCUNE UI marketplace**, **AUCUN endpoint de paiement**, **AUCUN routing commercial**. La structure est prête pour une future phase marketplace sans modification du schema.

### 6.2 Champs préparés (déjà dans le modèle §4.1)

| Champ | Type | Rôle futur |
|-------|------|------------|
| `marketplaceTier` | String (enum soft) | FREE / PREMIUM / EXCLUSIVE / ENTERPRISE / LIMITED / EVENT / SIGNATURE |
| `category` | String (enum soft) | LUXURY / ROYAL / CLASSIC / MINIMAL / AFRICAN / MODERN / CATHOLIQUE / CIVIL / DESTINATION / BEACH / GARDEN / WINTER |
| `priceFcfa` | Int? | Prix en FCFA (null = gratuit) |
| `priceUsd` | Float? | Prix en USD (null = gratuit) |
| `limitedQuantity` | Int? | Stock limité (null = illimité) |
| `eventDate` | DateTime? | Pour collections EVENT (date d'expiration) |

### 6.3 Différence cruciale : 2 axes orthogonaux

| Axe | Champ | Valeurs | Rôle |
|-----|-------|---------|------|
| **Billing tier** (existant) | `Subscription.plan` | TRIAL / ESSENTIEL / PREMIUM / ELITE | Accès au feature set quantitatif (quotas guests/media/admins) |
| **Marketplace tier** (nouveau) | `Collection.marketplaceTier` | FREE / PREMIUM / EXCLUSIVE / ENTERPRISE / LIMITED / EVENT / SIGNATURE | Positionnement commercial de la Collection |
| **Category** (nouveau) | `Collection.category` | LUXURY / ROYAL / ... / WINTER | Catégorisation pour discovery future |

**Fonction de gating** (additive) :

```typescript
canAccessCollection(billingPlan: Plan, collectionMarketplaceTier: string): boolean
// FREE → accessible à tous les billing plans
// PREMIUM → accessible à PREMIUM + ELITE
// EXCLUSIVE → accessible à ELITE seulement
// ENTERPRISE → accessible à ELITE seulement (nécessite contrat)
// LIMITED → accessible selon stock + billing plan
// EVENT → accessible selon date + billing plan
// SIGNATURE → accessible à ELITE seulement (collections signature designer)
```

Cette fonction **coexiste** avec les helpers existants (`checkGuestLimit`, `checkMediaLimit`, etc.) — elle ne les remplace pas.

---

## 7. DÉPLOIEMENT AUTOMATIQUE (5 STEPS)

### 7.1 Pipeline utilisateur (conforme à la directive)

```
Étape 1 — Choisir une Collection     (CollectionLibrary grid)
Étape 2 — Choisir une variante       (VariantPicker A/B/C/D)
Étape 3 — Importer les photos        (Media Engine — existant)
Étape 4 — Choisir les couleurs       (PalettePicker — override optionnel, IA-assisted)
Étape 5 — Entrer les informations    (Settings — existant)
       ↓
DÉPLOIEMENT AUTOMATIQUE
       ↓
✔ site créé              (ThemeInjector + Collection website frames)
✔ invitations créées     (InvitationRenderer + Collection invitation frames)
✔ badges créés           (PrintPackRenderer — v2 deferred)
✔ QR créés               (QR Engine existant — AES-256-GCM, inchangé)
✔ publications créées    (CommunicationPackRenderer — v2 deferred)
✔ affiches créées        (CommunicationPackRenderer — v2 deferred)
✔ bannières créées       (CommunicationPackRenderer — v2 deferred)
✔ supports imprimés créés (PrintPackRenderer — v2 deferred)
```

### 7.2 Step-by-step du déploiement (POST /api/collections/apply)

```
1. Auth check + tenant context (AsyncLocalStorage — existant)
2. Fetch Collection + Variant + DesignSystem from DB
3. Tier gate: canAccessCollection(wedding.subscription.plan, collection.marketplaceTier)
   → 403 si non accessible
4. Validate completeness: Collection.isPublished && packs registry complet
   → 400 si incomplète
5. Merge theme (3 couches) :
   finalTheme = {
     ...collection.themeSeed,           // couche 1: base Collection
     ...variant.paletteOverride,        // couche 2: override Variante
     ...body.paletteOverride,           // couche 3: override Couple (optionnel)
   }
6. Upsert Theme row (1:1 Wedding — inchangé) :
   - primaryColor, accentColor, fontDisplay, fontBody, layout = finalTheme
   - customizations = {
       penpot: {
         fileUrl: collection.penpotFileUrl,
         fileId: collection.penpotFileId,
         pageId: variant?.penpotPageId,
         tokens: themeToPenpotTokens(finalTheme),  // fn existante
         lastSyncedAt: now(),
         packs: collection.packs,  // NOUVEAU : frame registry injecté pour renderers
       },
       luxury: collection.luxuryPreset,
       collectionMeta: { collectionId, variantId, designSystemId, appliedAt: now() },
     }
7. Update Wedding: collectionId, variantId
8. ThemeInjector picks up automatically (ZERO changement — existant)
9. LuxuryVisualEngine hydrate from customizations.luxury (additif, défensif)
10. InvitationRenderer reads customizations.penpot.packs.invitation[tier] (nouveau wrapper)
11. Return { success: true, theme: finalTheme, packs: collection.packs }
```

### 7.3 Rôle de l'IA (conforme à la directive)

> *"L'IA n'est PAS le moteur de création. L'IA intervient uniquement après la sélection d'une Collection."*

| Action IA | Mécanisme | Quand |
|-----------|-----------|-------|
| Harmoniser les couleurs | Suggère paletteOverride basé sur photos importées | Étape 4 (optionnel) |
| Proposer variantes | Suggère paletteOverride alternatifs A/B/C/D | Étape 4 (optionnel) |
| Améliorer les textes | Suggère wording story/programme/invitation | Étape 5 (optionnel) |
| Aider le designer | Suggère ajustements frame mappings | Designer-Publish (optionnel) |

**Implémentation** : `z-ai-web-dev-sdk` (déjà installé, dormant). Backend-only. **TOUJOURS optionnel** — le couple peut skipper l'IA et garder le design Collection tel quel.

---

## 8. MATRICE DE RÉUTILISATION OBLIGATOIRE (13 moteurs/concepts)

| # | Moteur / Concept | Rôle actuel | Rôle dans Collection Engine v2 | Modification |
|---|------------------|-------------|-------------------------------|--------------|
| 1 | **Theme Engine** (`/api/theme`, Theme model) | CRUD thème 4 champs + customizations | **Moteur d'exécution subordonné** — reçoit themeSeed de la Collection | AUCUNE (upsert existant) |
| 2 | **ThemeCustomizer** | Édition manuelle 4 champs | **Repositionné** : subordonné à CollectionLibrary (palette override après apply) | AUCUNE en code, repositionnement UI |
| 3 | **ThemeInjector** | Injecte `--theme-*` + `--penpot-*` CSS vars | + hydrate luxury-engine-store depuis `customizations.luxury` | Additif (1 bloc) |
| 4 | **PenpotStudio** | Studio admin (push/pull tokens) | Inchangé — réservé admins/designers | AUCUNE |
| 5 | **Penpot config.ts** | Conversion bidirectionnelle tokens | Réutilisé tel quel | AUCUNE |
| 6 | **Theme.customizations JSON** | Stocke `{penpot}` | Étendu : `{penpot, luxury, collectionMeta}` | Additif |
| 7 | **Invitation Engine** (InvitationCard, QR, AES-256-GCM) | Single fixed design | **Moteur d'exécution** — wrapper par InvitationRenderer | AUCUNE (nouveau wrapper) |
| 8 | **Media Engine** (`/api/media`, Media model) | CRUD médias | Inchangé — Collection référence des media URLs | AUCUNE |
| 9 | **LuxuryVisualEngine** | Overlay ambiance (localStorage) | Hydrate depuis `Theme.customizations.luxury` | Additif (hydration optionnelle) |
| 10 | **Billing** (Subscription, PLAN_LIMITS) | 4-tier quotas | + `canAccessCollection(billingPlan, marketplaceTier)` | Additif (1 fonction) |
| 11 | **Multi-tenant** (AsyncLocalStorage + Prisma ext) | Auto-inject weddingId | Inchangé — Collection Engine respecte le tenant context | AUCUNE |
| 12 | **Wedding Workspace** (tenant admin) | 12 tabs | +1 tab `collections` (CollectionLibrary) | Additif (1 nav + 1 case) |
| 13 | **Command Center** (platform admin `/platform/admin`) | 8 tabs | +1 tab `collections` (CollectionAdmin pour designer-publish) | Additif (1 nav + 1 case) |
| 14 | **QR Engine** (`src/lib/guest-auth.ts`, AES-256-GCM + qrcode) | Génération tokens + QR codes | Inchangé — InvitationRenderer passe `?pack={slot}` au URL QR | AUCUNE |
| 15 | **Guest Engine** (Guest model + `/api/guests/**` + `/api/guest/**` + GuestPersonalSpace) | CRUD guests + sessions + export PDF/PNG | + `Guest.tier` (nullable) pour dispatcher vers la bonne frame Invitation | Additif (1 colonne nullable) |

**Aucun des 15 n'est remplacé. Tous sont étendus additivement ou inchangés.**

---

## 9. SÉCURITÉ ZÉRO RÉGRESSION

### 9.1 Safeguards (10 garanties techniques)

1. **Toutes nouvelles colonnes NULLABLE** → weddings existants `collectionId = null` → comportement inchangé
2. **Theme row créé lazily** (inchangé) — `Collection.apply` fait un upsert
3. **Default behavior si `collectionId` null** = comportement actuel (DEFAULT_THEME + localStorage luxury)
4. **ThemeCustomizer inchangé** en code — repositionné en UI seulement
5. **PenpotStudio inchangé** — coexiste avec Collection
6. **InvitationCard inchangé** — `InvitationRenderer` est un nouveau wrapper avec fallback
7. **Aucune modification aux routes API existantes** — seulement ajout `/api/collections/**`
8. **Aucune modification au schema existant** — que des additions
9. **Aucune modification au multi-tenant** — Collection Engine respecte AsyncLocalStorage
10. **Aucune modification au QR Engine / Guest Engine** — seul `Guest.tier` ajouté (nullable)

### 9.2 Rollback plan

Si régression détectée :
1. Drop models `DesignSystem`, `Module`, `Collection`, `CollectionVariant`
2. Drop colonnes `Wedding.collectionId`, `Wedding.variantId`, `Lead.collectionId`, `Guest.tier`
3. `bun run db:push` — SQLite refait le schema
4. Tous les weddings retombent sur DEFAULT_THEME (comportement actuel)
5. Zéro donnée perdue (Theme rows existants préservés)
6. Supprimer nouveaux fichiers (`src/lib/collections/`, `src/components/collections/`, `src/components/wedding/InvitationRenderer.tsx`, etc.)
7. Revert additions aux fichiers modifiés

**Rollback time** : < 30 minutes.

### 9.3 Tests de non-régression (validation post-chaque-phase)

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
| QR code génération | Fonctionne (inchangé) |
| Guest auto-auth | Fonctionne (inchangé) |

---

## 10. PLAN D'IMPLÉMENTATION STRICTEMENT SÉQUENTIEL

> **RÈGLE ABSOLUE** : *"Aucune étape suivante ne doit commencer tant que la précédente n'est pas validée."*

Chaque phase a un **gate de validation** explicite. Le gate doit être validé (lint + dev server + browser test + worklog) AVANT de passer à la phase suivante.

### Phase 0 — Schema & Seed (4–5h)

| Tâche | Détail |
|-------|--------|
| Éditer `prisma/schema.prisma` | +3 models (DesignSystem, Module, Collection, CollectionVariant) +3 colonnes nullable (Wedding.collectionId, Wedding.variantId, Lead.collectionId, Guest.tier) |
| `bun run db:push` | Push schema |
| Créer `src/lib/collections/seed.ts` | 2 DesignSystems + 68 Modules (34 slots × 2 DS) + 4 Collections (mappées THEME_TEMPLATES) + 4 Variants default |
| Exécuter seed | One-time script |

**GATE VALIDATION Phase 0** :
- [ ] `bun run lint` — 0 nouvelle erreur
- [ ] Dev server démarre — GET / 200, GET /w/[slug] 200, GET /api/theme 200
- [ ] Browser : homepage rend normalement (DEFAULT_THEME)
- [ ] Browser : tenant admin 12 tabs accessibles
- [ ] Prisma Studio : 4 Collections + 2 DesignSystems + 68 Modules visibles
- [ ] Worklog mis à jour

### Phase 1 — Collection Library API (3–4h)

> **DÉBLOQUE SEULEMENT APRÈS** gate Phase 0 validé.

| Tâche | Détail |
|-------|--------|
| Créer `src/lib/collections/index.ts` | `canAccessCollection(billingPlan, marketplaceTier)`, `applyCollection()`, `listCollections(billingPlan?)`, `getCollection(id)` |
| Créer `src/app/api/collections/route.ts` | GET list (filtre par tier accessible + isPublished) |
| Créer `src/app/api/collections/[id]/route.ts` | GET detail + variants + designSystem + modules |
| Créer `src/app/api/collections/apply/route.ts` | POST apply (gated by plan, tenant-scoped, idempotent) |

**GATE VALIDATION Phase 1** :
- [ ] `bun run lint` — 0 nouvelle erreur
- [ ] `GET /api/collections` retourne 4 Collections seed
- [ ] `GET /api/collections/[id]` retourne detail avec packs registry
- [ ] `POST /api/collections/apply` (sur wedding test) → upsert Theme + update Wedding.collectionId
- [ ] Re-apply même collection = no-op (idempotent)
- [ ] Apply sur wedding avec billing plan insuffisant → 403
- [ ] Homepage toujours rendue normalement (pas d'apply sur wedding défaut)
- [ ] Worklog mis à jour

### Phase 2 — Collection Library UI (4–5h)

> **DÉBLOQUE SEULEMENT APRÈS** gate Phase 1 validé.

| Tâche | Détail |
|-------|--------|
| Créer `src/components/collections/CollectionLibrary.tsx` | Grid + tier badges + lock overlay + active ring |
| Créer `src/components/collections/VariantPicker.tsx` | Modal A/B/C/D |
| Créer `src/components/collections/PalettePicker.tsx` | Override optionnel (IA-assisted) |
| Modifier `src/app/w/[slug]/admin/page.tsx` | +1 nav item `collections` + 1 case |

**GATE VALIDATION Phase 2** :
- [ ] `bun run lint` — 0 nouvelle erreur
- [ ] Browser : tenant admin → nouveau tab "Collections" visible
- [ ] Click tab → grid des 4 Collections seed
- [ ] Click Collection accessible → VariantPicker s'ouvre
- [ ] Sélection variante + palette override → apply → toast succès
- [ ] Vérifier Theme row mis à jour (couleurs changent sur le site)
- [ ] Vérifier Wedding.collectionId set
- [ ] Collection non-accessible = lock overlay, click = toast "Plan insuffisant"
- [ ] Tous les autres tabs fonctionnent toujours (zéro régression)
- [ ] Worklog mis à jour

### Phase 3 — Luxury Preset Sync (2–3h)

> **DÉBLOQUE SEULEMENT APRÈS** gate Phase 2 validé.

| Tâche | Détail |
|-------|--------|
| Modifier `src/components/wedding/ThemeInjector.tsx` | +1 bloc : lire `customizations.luxury` → hydrate `luxury-engine-store` (merge non-destructif) |
| Test | Si `customizations.luxury` absent → comportement localStorage (inchangé) |

**GATE VALIDATION Phase 3** :
- [ ] `bun run lint` — 0 nouvelle erreur
- [ ] Apply une Collection avec luxuryPreset gold → LuxuryVisualEngine hydrate gold
- [ ] Apply une Collection sans luxuryPreset → LuxuryVisualEngine lit localStorage (inchangé)
- [ ] Re-apply change ambiance (gold → midnight par exemple) → store mis à jour
- [ ] Pas de regression sur les weddings sans collectionId
- [ ] Worklog mis à jour

### Phase 4 — Invitation Renderer (5–6h)

> **DÉBLOQUE SEULEMENT APRÈS** gate Phase 3 validé.

| Tâche | Détail |
|-------|--------|
| Créer `src/components/wedding/InvitationRenderer.tsx` | Dispatcher par `guest.tier` : si Penpot frame lié → `<PenpotInvitationCard>`, sinon → `<InvitationCard>` (fallback) |
| Créer `src/components/wedding/PenpotInvitationCard.tsx` | Wrapper iframe Penpot frame + data injection via URL params |
| Modifier `src/components/wedding/GuestPersonalSpace.tsx` | Swap `<InvitationCard>` par `<InvitationRenderer>` (fallback garantit comportement existant) |

**GATE VALIDATION Phase 4** :
- [ ] `bun run lint` — 0 nouvelle erreur
- [ ] Guest sans tier (null) → InvitationRenderer fallback → InvitationCard (inchangé)
- [ ] Guest tier "VIP" + Collection avec packs.invitation.vip frame → InvitationRenderer render Penpot frame
- [ ] Guest tier "VIP" + Collection sans frame vip → fallback InvitationCard
- [ ] Export PDF/PNG fonctionne toujours (html2canvas-pro + jspdf existants)
- [ ] QR code généré correctement (AES-256-GCM inchangé)
- [ ] Auto-auth guest fonctionne
- [ ] Worklog mis à jour

### Phase 5 — Onboarding Integration (3–4h)

> **DÉBLOQUE SEULEMENT APRÈS** gate Phase 4 validé.

| Tâche | Détail |
|-------|--------|
| Modifier `src/app/api/onboarding/create-wedding/route.ts` | Accepter `collectionId?` + `variantId?` optionnels. Après création, si collectionId → applyCollection() |
| Modifier `OnboardingTab` wizard | +1 step "Choisir une Collection" (optionnel, peut skipper) |
| Modifier `Lead` form | +collectionId hidden field (pré-sélection depuis landing) |

**GATE VALIDATION Phase 5** :
- [ ] `bun run lint` — 0 nouvelle erreur
- [ ] Onboarding sans collectionId → wedding créé avec DEFAULT_THEME (inchangé)
- [ ] Onboarding avec collectionId → wedding créé + Theme row + Wedding.collectionId set
- [ ] Lead form : pré-sélection collection → transmis au wizard
- [ ] Wizard : step Collection peut être skippé
- [ ] Pas de regression sur onboarding existant
- [ ] Worklog mis à jour

### Phase 6 — Designer-Publish (Collection Admin) (5–6h)

> **DÉBLOQUE SEULEMENT APRÈS** gate Phase 5 validé.

| Tâche | Détail |
|-------|--------|
| Créer `src/components/admin/CollectionAdmin.tsx` | CRUD Collections + Penpot file linking + frame mapping UI + marketplace tier/category + publish flow |
| Créer `src/app/api/collections/route.ts` (POST) | Admin-only create |
| Créer `src/app/api/collections/[id]/route.ts` (PUT, DELETE) | Admin-only update/delete |
| Créer `src/app/api/collections/publish/route.ts` (POST) | Admin-only publish (validate completeness → set isPublished + isActive + publishedAt) |
| Modifier `src/app/platform/admin/page.tsx` | +1 nav item `collections` + 1 case |

**GATE VALIDATION Phase 6** :
- [ ] `bun run lint` — 0 nouvelle erreur
- [ ] Platform admin → nouveau tab "Collections" visible
- [ ] Click "Publier une Collection" → form URL Penpot + mappings + tier + category
- [ ] Publish Collection incomplète → erreur validation
- [ ] Publish Collection complète → isPublished=true, apparaît dans tenant catalog
- [ ] Edit Collection existante → update packs registry
- [ ] Delete Collection (soft) → isActive=false, disparaît catalog
- [ ] Pas de regression sur platform admin existant
- [ ] Worklog mis à jour

### Phase 7 — Print & Communication Packs (DEFERRED v2, ~15–20h)

> **DÉBLOQUE SEULEMENT APRÈS** gate Phase 6 validé ET validation utilisateur explicite.

| Tâche | Détail |
|-------|--------|
| `PrintPackRenderer.tsx` | Badge, QR Card, Parking, Plan de salle, Numéro table, Marque-place, Remerciement, Livre d'or |
| `CommunicationPackRenderer.tsx` | WhatsApp, Facebook, Instagram, Story, Email, Bannière, Affiche, Roll-up |
| Export pipeline refactor | Extraire `handleDownload` de GuestPersonalSpace → utilitaire partagé |

**Dépendance** : Phase 4 (renderer infrastructure). **Peut être différée** sans impacter le core Collection Engine.

### Patch concomitant Phase 0 — Duplicate-wedding fix (30 min)

| Tâche | Détail |
|-------|--------|
| Modifier `src/app/api/platform/weddings/[id]/duplicate/route.ts` | Clear `collectionId` + `variantId` sur wedding dupliqué. Clear `customizations.penpot.fileId` + `fileUrl` (keep tokens). Garde `customizations.luxury`. |

---

### Synthèse effort & séquence STRICTE

```
Phase 0 (Schema & Seed)  ──gate──▶  VALIDER
        ↓
Phase 1 (Collection API) ──gate──▶  VALIDER
        ↓
Phase 2 (Collection UI)  ──gate──▶  VALIDER
        ↓
Phase 3 (Luxury Sync)    ──gate──▶  VALIDER
        ↓
Phase 4 (Invitation Renderer) ──gate──▶  VALIDER
        ↓
Phase 5 (Onboarding)     ──gate──▶  VALIDER
        ↓
Phase 6 (Designer-Publish) ──gate──▶  VALIDER
        ↓
[STOP — validation complète utilisateur]
        ↓
Phase 7 (Print & Comms, v2 deferred) — requires explicit user unlock
```

| Phase | Effort | Gate obligatoire |
|-------|--------|------------------|
| 0 — Schema & Seed | 4–5h | lint + dev + browser + Prisma Studio |
| 1 — Collection API | 3–4h | lint + API tests (curl/browser) |
| 2 — Collection UI | 4–5h | lint + browser end-to-end |
| 3 — Luxury Sync | 2–3h | lint + browser (ambiance change) |
| 4 — Invitation Renderer | 5–6h | lint + browser (guest tiers) |
| 5 — Onboarding | 3–4h | lint + browser (wizard) |
| 6 — Designer-Publish | 5–6h | lint + browser (publish flow) |
| 7 — Print & Comms (v2) | 15–20h | deferred |
| Patch — Duplicate fix | 0.5h | concomitant Phase 0 |

**Total Phase 0–6 + Patch : ~26.5–33.5h** (vs 19.5–25.5h en v1 — l'écart vient de DesignSystem+Module + Designer-Publish workflow + gates stricts)

---

## ANNEXE A — Fichiers créés (preview)

```
src/lib/collections/
├── seed.ts                      (Phase 0)
└── index.ts                     (Phase 1)

src/app/api/collections/
├── route.ts                     (Phase 1 GET + Phase 6 POST)
├── [id]/route.ts                (Phase 1 GET + Phase 6 PUT/DELETE)
├── apply/route.ts               (Phase 1 POST)
└── publish/route.ts             (Phase 6 POST)

src/components/collections/
├── CollectionLibrary.tsx        (Phase 2)
├── VariantPicker.tsx            (Phase 2)
└── PalettePicker.tsx            (Phase 2)

src/components/admin/
└── CollectionAdmin.tsx          (Phase 6)

src/components/wedding/
├── InvitationRenderer.tsx       (Phase 4)
└── PenpotInvitationCard.tsx     (Phase 4)
```

## ANNEXE B — Fichiers modifiés (preview)

| Fichier | Phase | Modification |
|---------|-------|--------------|
| `prisma/schema.prisma` | 0 | +4 models, +4 colonnes nullable |
| `src/app/w/[slug]/admin/page.tsx` | 2 | +1 nav item, +1 case |
| `src/components/wedding/ThemeInjector.tsx` | 3 | +1 bloc hydration luxury |
| `src/components/wedding/GuestPersonalSpace.tsx` | 4 | swap InvitationCard → InvitationRenderer |
| `src/app/api/onboarding/create-wedding/route.ts` | 5 | +collectionId param optionnel |
| `src/components/admin/OnboardingTab.tsx` | 5 | +1 step Collection |
| `src/app/platform/admin/page.tsx` | 6 | +1 nav item, +1 case |
| `src/app/api/platform/weddings/[id]/duplicate/route.ts` | Patch | clear collectionId + penpot fileId |

**Total** : 8 fichiers modifiés (tous additifs sauf le swap GuestPersonalSpace qui a un fallback garantissant le comportement existant).

---

## CONCLUSION — VÉRIFICATION DE CONFORMITÉ À LA VISION

> *"Avant toute implémentation, vérifie que chaque décision technique rapproche la plateforme de cette vision."*

| Principe vision | Conformité v2 |
|-----------------|---------------|
| Wedding OS ne fabrique plus de thèmes | ✅ Collection = produit fini, Theme Engine subordonné |
| Déployer automatiquement des Collections Premium créées dans Penpot | ✅ Pipeline 5 steps + POST /api/collections/apply |
| Penpot = moteur graphique principal | ✅ Zéro duplication, frames lues à la volée via iframe |
| IA = assistant seulement, après sélection | ✅ IA optionnelle étape 4/5, jamais création |
| Ne développe AUCUN éditeur graphique / constructeur de thème | ✅ ThemeCustomizer repositionné (pas supprimé, pas étendu) |
| Collection → Design System → Modules → Frames | ✅ 4 niveaux d'abstraction, 4 models Prisma |
| Designer publie → Wedding OS détecte → catalog auto | ✅ Workflow Designer-Publish Phase 6 |
| Marketplace préparé (architecture only, no code) | ✅ Champs data only, aucun endpoint paiement/UI |
| Réutiliser 13 moteurs existants | ✅ Matrice §8 — aucun remplacé |
| Additif, rétrocompatible, réversible | ✅ Colonnes nullable, fallback, rollback < 30 min |
| Strictement séquentiel avec gates | ✅ Phase 0→1→2→3→4→5→6, gate validation obligatoire |
| Ne casser frontend/backend/Prisma/QR/invitations/URLs/multi-tenant/API/data | ✅ 10 safeguards + 13 tests non-régression |

**CONFORMITÉ GLOBALE : ✅ VALIDÉE**

**En attente de validation utilisateur pour débuter la Phase 0 (Schema & Seed).**
