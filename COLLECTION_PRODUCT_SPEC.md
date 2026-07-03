# SPÉCIFICATION FONCTIONNELLE DÉFINITIVE
## COLLECTION PRODUCT ENGINE — AENEWS Wedding OS

> **Nature** : Spécification fonctionnelle (WHAT), pas technique (HOW).
> **Statut** : En attente de validation utilisateur. Aucun code, aucun schéma ne sera écrit avant validation.
> **Rôle** : Cette spécification est la **fondation unique** de toutes les phases d'implémentation suivantes. Toute décision technique future devra s'y conformer.
> **Supplante** : `COLLECTION_ENGINE_PLAN.md` (v1) et `COLLECTION_ENGINE_PLAN_V2.md` (v2) — ces documents techniques seront révisés APRÈS validation de la présente spécification.

---

## 0. PRÉAMBULE — LE CHANGEMENT DE PARADIGME

### 0.1 Ce que Wedding OS n'est plus

Wedding OS n'est **plus** un logiciel qui fabrique des thèmes. Wedding OS ne sait **plus** dessiner. Wedding OS ne construit **plus** de designs.

### 0.2 Ce que Wedding OS devient

Wedding OS devient un **SaaS Enterprise de déploiement** de **Collection Products** — des produits commerciaux finis créés dans Penpot par des designers, que Wedding OS orchestre et déploie automatiquement sur des mariages.

### 0.3 Le répartition des rôles

| Acteur | Fait | Ne fait pas |
|--------|------|-------------|
| **Designer** | Crée le design dans Penpot | Touche au code, à la DB, au deploy |
| **Wedding OS** | Orchestre données, invités, QR, couleurs, photos, textes, accès, permissions, déploiement | Dessine, crée des designs |
| **Développeur** | Maintient le moteur d'orchestration | Crée des designs, intervient sur chaque Collection |
| **IA** | Assiste après sélection (harmonisation, variantes, textes) | Crée des designs, fabrique des thèmes |
| **Commercial** | Choisit une Collection, vend, déploie | Crée des designs |

### 0.4 Principe d'ordonnancement

> *"On conçoit le catalogue avant la base de données."*

Le premier livrable de l'implémentation ne sera **pas** une table Prisma. Ce sera la **première Collection commercialisable**. La technique (schéma, API, composants) viendra **après** cette spécification, et uniquement pour servir le catalogue défini ici.

---

## 1. DÉFINITION D'UN COLLECTION PRODUCT (Réponse Q1)

### 1.1 Définition formelle

Un **Collection Product** est un **actif commercial digital versionné** qui encapsule un design de mariage complet (site web + invitations + supports imprimés + communication + ambiance visuelle), créé dans Penpot par un designer, prêt à être déployé automatiquement et sans modification sur un nombre illimité de mariages.

### 1.2 Ce qu'un Collection Product N'EST PAS

- ❌ Ce n'est **pas un thème** (un thème est un jeu de couleurs/fonts ; un Collection Product est un produit complet)
- ❌ Ce n'est **pas un template** (un template est un squelette à remplir ; un Collection Product est un produit fini)
- ❌ Ce n'est **pas du code** (le Collection Product ne contient aucune ligne de code ; il référence des frames Penpot)
- ❌ Ce n'est **pas éphémère** (un Collection Product est un actif persistant, versionné, qui peut vivre des années)
- ❌ Ce n'est **pas gratuit par défaut** (c'est un produit commercial avec un positionnement, un prix futur, une licence)

### 1.3 Les 16 attributs d'un Collection Product

| # | Attribut | Description | Exemple |
|---|----------|-------------|---------|
| 1 | **Identité (slug)** | Identifiant unique permanent | `royal-gold` |
| 2 | **Nom commercial** | Nom affiché au public | "Royal Gold" |
| 3 | **Auteur** | Designer qui l'a créé | "Designer A — Luxury Division" |
| 4 | **Version** | Version sémantique | `1.0.0`, `1.2.0`, `2.0.0` |
| 5 | **Date de publication** | Date de première mise en commercialisation | 2025-03-15 |
| 6 | **Licence** | Conditions d'usage | STANDARD / EXCLUSIVE / CUSTOM |
| 7 | **Niveau de qualité** | Certification AENEWS | CERTIFIED / PREMIUM / SIGNATURE |
| 8 | **Catégorie** | Famille commerciale | LUXURY / ROYAL / CLASSIC / MINIMAL / AFRICAN / MODERN / CATHOLIC / CIVIL / DESTINATION / BEACH / GARDEN / WINTER |
| 9 | **Prix (futur)** | Positionnement commercial | FREE / PREMIUM / EXCLUSIVE / ENTERPRISE / LIMITED / EVENT / SIGNATURE |
| 10 | **Compatibilité** | Version Wedding OS minimale requise | `>=2.0` |
| 11 | **Historique des versions** | Toutes les versions publiées | [1.0.0, 1.1.0, 1.2.0, 2.0.0] |
| 12 | **Design System** | Langage de design de rattachement | "Luxury Royal" |
| 13 | **Luxury Preset** | Ambiance visuelle (réutilise LuxuryVisualEngine) | `{theme: gold, effects: {...}}` |
| 14 | **État de cycle de vie** | Position dans le workflow | BROUILLON / EN_COURS / VALIDATION / PUBLIE / COMMERCIALISE / ARCHIVE |
| 15 | **Composition (5 packs)** | Les 34+1 modules obligatoires | Voir section 4 |
| 16 | **Métadonnées marketplace** | Stock limité, date événement, thumbnail | `limitedQuantity: 100`, `eventDate: 2025-12-25` |

### 1.4 Modèle conceptuel

```
Collection Product "Royal Gold" v1.2.0
├── Identité : royal-gold
├── Auteur : Designer A — Luxury Division
├── Catégorie : LUXURY (sous-famille ROYAL)
├── Licence : STANDARD
├── Niveau qualité : PREMIUM
├── État : COMMERCIALISE
├── Compatibilité : Wedding OS >=2.0
│
├── Design System : "Luxury Royal"
│   (langage de design partagé avec Royal Black, Royal Emerald)
│
├── Composition :
│   ├── Pack Website (10 modules → 10 frames Penpot)
│   ├── Pack Invitations (8 modules → 8 frames Penpot)
│   ├── Pack Print (8 modules → 8 frames Penpot)
│   ├── Pack Communication (8 modules → 8 frames Penpot)
│   └── Pack Luxury Preset (1 composite → data, pas de frame)
│
├── Variantes :
│   ├── Variante A (par défaut) — Page Penpot A
│   ├── Variante B — Page Penpot B
│   ├── Variante C — Page Penpot C
│   └── Variante D — Page Penpot D
│
├── Versioning :
│   ├── v1.0.0 (publié 2025-01-10)
│   ├── v1.1.0 (publié 2025-02-01 — fix alignement badges)
│   └── v1.2.0 (publié 2025-03-15 — ajout Variante D) ← actuelle
│
└── Marketplace (futur) :
    ├── Prix : PREMIUM
    ├── Stock : illimité
    └── Événement : —
```

### 1.5 Différence essentielle avec un "thème"

| Thème (ancien concept) | Collection Product (nouveau concept) |
|------------------------|--------------------------------------|
| Jeu de 4 couleurs + 2 fonts | Produit complet (34 modules + ambiance) |
| Éditable par le couple | Non éditable dans sa structure (le couple override uniquement la palette) |
| Pas d'auteur | A un auteur (designer) |
| Pas de version | Versionné (semver) |
| Pas de licence | A une licence |
| Pas de cycle de vie | Suit un workflow de 6 états |
| Pas de prix | Aura un prix (marketplace futur) |
| Vit dans 1 ligne de DB | Vit comme actif commercial complet |
| Code pour le rendre | Frames Penpot pour le rendre |

---

## 2. CRÉATION PAR LE DESIGNER — PENPOT ONLY (Réponse Q2)

### 2.1 Principe fondamental

> *"Le Designer travaille uniquement dans Penpot. Wedding OS ne sait même pas dessiner."*

Le designer **ne touche jamais** :
- Au code de Wedding OS
- À la base de données
- Aux composants React
- Au CSS
- Aux configurations de déploiement

Le designer **travaille uniquement** :
- Dans Penpot (création des frames)
- Dans le Designer Portal de Wedding OS (métadonnées + cycle de vie)

### 2.2 Le workflow de création en 9 étapes

```
Étape 1 — Designer ouvre Penpot
    ↓ crée un nouveau Penpot File "Royal Gold Master"
    ↓
Étape 2 — Designer organise le file par la structure AENEWS
    ↓ crée 4 Pages Penpot : "Variante A", "Variante B", "Variante C", "Variante D"
    ↓ crée dans chaque Page les 34 frames selon la convention de nommage (§2.3)
    ↓
Étape 3 — Designer designe chaque frame
    ↓ utilise le Design System partagé (colors, typography, components)
    ↓ ne code rien — uniquement du visuel Penpot
    ↓
Étape 4 — Designer rend le file Penpot public (share link)
    ↓ copie l'URL publique du file
    ↓
Étape 5 — Designer ouvre Wedding OS → Designer Portal
    ↓ clique "Nouvelle Collection Product"
    ↓
Étape 6 — Designer colle l'URL Penpot
    ↓ Wedding OS parse l'URL (extrait fileId)
    ↓ Wedding OS fetch la structure du file Penpot
    ↓ Wedding OS AUTO-DÉTECTE les 34 frames par convention de nommage (§2.3)
    ↓ pré-remplit le Frame Registry (slot → frameId)
    ↓
Étape 7 — Designer complète les métadonnées
    ↓ nom : "Royal Gold"
    ↓ catégorie : LUXURY
    ↓ design system : "Luxury Royal" (existant ou nouveau)
    ↓ luxury preset : gold + effects profile
    ↓ thème seed : #D4AF37 / #1a1a2e / Cormorant / Inter
    ↓
Étape 8 — Designer sauvegarde en BROUILLON
    ↓ la Collection existe mais invisible du catalog commercial
    ↓ le designer peut itérer dans Penpot pendant des jours
    ↓ les changements Penpot sont visibles immédiatement (frames lues à la volée)
    ↓
Étape 9 — Designer soumet pour VALIDATION
    ↓ l'Art Director / Admin examine
    ↓ approuve → PUBLIÉ → COMMERCIALISÉ
    ↓ la Collection apparaît dans le catalog du commercial
```

### 2.3 Convention de nommage des frames (auto-détection)

Pour que Wedding OS puisse auto-détecter les frames sans intervention du développeur, le designer nomme ses frames Penpot selon une convention stricte. Wedding OS scanne le file Penpot et mappe automatiquement chaque frame au slot correspondant.

**Pack Website (10 frames)**

| Slot | Nom de frame attendu |
|------|---------------------|
| hero | `hero` ou `website-hero` |
| countdown | `countdown` |
| story | `story` ou `notre-histoire` |
| gallery | `gallery` ou `galerie` |
| programme | `programme` |
| rsvp | `rsvp` |
| footer | `footer` |
| loader | `loader` |
| splash | `splash` |
| systemPages | `system-pages` ou `404` |

**Pack Invitations (8 frames)**

| Slot | Nom de frame attendu |
|------|---------------------|
| standard | `invitation-standard` |
| vip | `invitation-vip` |
| famille | `invitation-famille` |
| couple | `invitation-couple` |
| presse | `invitation-presse` |
| sponsor | `invitation-sponsor` |
| numerique | `invitation-numerique` |
| impression | `invitation-impression` |

**Pack Print (8 frames)**

| Slot | Nom de frame attendu |
|------|---------------------|
| badge | `badge` |
| qr | `qr-card` ou `qr` |
| parking | `parking` ou `carte-parking` |
| floorPlan | `floor-plan` ou `plan-salle` |
| tableNumber | `table-number` ou `numero-table` |
| placeCard | `place-card` ou `marque-place` |
| remerciement | `remerciement` |
| livreOr | `livre-or` |

**Pack Communication (8 frames)**

| Slot | Nom de frame attendu |
|------|---------------------|
| whatsapp | `whatsapp` |
| facebook | `facebook` |
| instagram | `instagram` |
| story | `story-comm` ou `story-social` |
| email | `email` |
| banner | `banner` ou `banniere` |
| affiche | `affiche` ou `poster` |
| rollup | `roll-up` ou `rollup` |

**Règles de matching** :
- Insensible à la casse
- Accepte les alias listés ci-dessus
- Accepte un préfixe de variante (ex: `A/hero`, `B/hero`) pour distinguer les variantes si le designer préfère 1 page + préfixes au lieu de 4 pages
- Si un slot n'est pas trouvé → la Collection ne peut pas être publiée (validation bloquée)
- Le designer peut manuellement override un mapping auto-détecté si besoin

### 2.4 Le Designer Portal

Le Designer Portal est une nouvelle zone de Wedding OS (accessible aux utilisateurs avec le rôle `DESIGNER`) où le designer :

- Voit **uniquement ses propres** Collections (par auteur)
- Crée une nouvelle Collection (workflow §2.2)
- Édite une Collection BROUILLON ou EN_COURS
- Soumet une Collection pour VALIDATION
- Voit l'historique des versions
- Voit les statistiques d'usage (combien de mariages utilisent sa Collection — futur marketplace)
- N'a **aucun accès** aux mariages, aux guests, à la billing, au multi-tenant

**Le Designer Portal ne permet JAMAIS** :
- De modifier le code
- De modifier le schéma DB
- De créer un nouveau slot (les 34 slots sont figés — voir §7.2)
- De dessiner dans Wedding OS (le dessin se fait dans Penpot)

### 2.5 Garantie zéro-code

> *"Le Designer peut donc créer demain : Royal Gold V2, Royal Gold Christmas, Royal Gold VIP, Royal Gold Africa — sans qu'un développeur intervienne."*

Cette garantie repose sur 3 invariants :

1. **Invariant structurel** : Les 34 slots sont figés. Toute Collection mappe sur ces 34 slots. Aucun slot nouveau ne peut être requis sans une version majeure de Wedding OS (rare, documenté, planifié).
2. **Invariant de rendu** : Wedding OS ne dessine jamais. Il embedde des frames Penpot via iframe. Un nouveau design = de nouvelles frames Penpot, pas de nouveau code Wedding OS.
3. **Invariant de métadonnées** : Toute la configuration d'une Collection est de la donnée (métadonnées + frame registry), jamais du code. Ajouter une Collection = ajouter une ligne de donnée.

---

## 3. CYCLE DE VIE COMPLET (Réponse Q3)

### 3.1 Les 6 états

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  BROUILLON  │────▶│  EN_COURS   │────▶│  VALIDATION  │
│  (Draft)    │     │ (In Progress)│     │  (In Review) │
└─────────────┘     └─────────────┘     └──────┬───────┘
       ▲                  ▲                     │
       │                  │                     ▼
       │                  │              ┌──────────────┐
       └──────────────────┘              │   PUBLIE     │
       (revert possible)                 │  (Published) │
                                         └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────────┐
                                         │  COMMERCIALISE   │
                                         │ (Commercialized) │
                                         └──────┬───────────┘
                                                │
                                                ▼
                                         ┌──────────────────┐
                                         │     ARCHIVE      │
                                         │   (Archived)     │
                                         └──────────────────┘
```

### 3.2 Description des états

| État | Description | Visibilité | Éditable par | Déployable sur mariage |
|------|-------------|------------|--------------|------------------------|
| **BROUILLON** | Designer démarre une Collection, structure non finalisée | Designer + Admin uniquement | Designer | ❌ Non |
| **EN_COURS** | Designer travaille activement, design en cours d'itération | Designer + Admin uniquement | Designer | ❌ Non |
| **VALIDATION** | Designer a soumis, en attente de revue Art Director | Designer + Admin + Art Director | Verrouillé (snapshot) | ❌ Non |
| **PUBLIÉ** | Validé par Art Director, prêt à être commercialisé | Designer + Admin + Sales | Verrouillé (snapshot) | ❌ Pas encore |
| **COMMERCIALISÉ** | Disponible pour le déploiement sur mariages | Catalog du Sales + Couple | Verrouillé (snapshot) | ✅ Oui |
| **ARCHIVÉ** | Retiré du catalog, nouveaux déploiements interdits | Admin uniquement | Verrouillé | ❌ Non (mariages existants conservent leur déploiement) |

### 3.3 Matrice des transitions

| De → Vers | Déclencheur | Rôle | Effet |
|-----------|-------------|------|-------|
| BROUILLON → EN_COURS | Designer commence l'itération active | Designer | — |
| EN_COURS → BROUILLON | Designer veut repartir de zéro | Designer | — |
| EN_COURS → VALIDATION | Designer soumet pour revue | Designer | Snapshot version créé |
| VALIDATION → EN_COURS | Art Director demande des changements | Art Director | Snapshot conservé, designer reprend |
| VALIDATION → PUBLIÉ | Art Director approuve | Art Director | Date de publication stampée |
| PUBLIÉ → COMMERCIALISÉ | Admin/Sales active la commercialisation | Admin | Apparaît dans le catalog couple |
| PUBLIÉ → ARCHIVÉ | Admin retire sans commercialiser | Admin | — |
| COMMERCIALISÉ → ARCHIVÉ | Admin retire du catalog | Admin | Mariages existants inchangés |
| ARCHIVÉ → PUBLIÉ | Admin réactive (rare) | Admin | Repart en validation si modifications |

### 3.4 Versionning

**Chaque transition vers VALIDATION crée un snapshot versionné.**

- Format semver : `MAJEUR.MINEUR.PATCH`
  - `MAJEUR` : changement de Design System ou rupture de compatibilité
  - `MINEUR` : ajout de variante, nouveau luxury preset, amélioration design
  - `PATCH` : fix visuel, correction frame, ajustement mineur
- Les versions **PUBLIÉES** sont **immuables** (snapshot complet : frame registry + métadonnées + luxury preset)
- Un mariage déployé est **lié à une version spécifique** (ex: Royal Gold v1.2.0)
- Upgrade de version sur un mariage existant = **action explicite** du couple/admin (jamais automatique)
- L'historique des versions est consultable dans le Designer Portal

### 3.5 Règles d'immutabilité

| État | Immutable ? | Raison |
|------|-------------|--------|
| BROUILLON | ❌ Non | Designer itère libreement |
| EN_COURS | ❌ Non | Designer itère libreement |
| VALIDATION | ✅ Oui (snapshot) | La revue doit porter sur un état figé |
| PUBLIÉ | ✅ Oui (snapshot) | L'approbation porte sur un état figé |
| COMMERCIALISÉ | ✅ Oui (snapshot) | Les mariages déployés doivent être stables |
| ARCHIVÉ | ✅ Oui (snapshot) | Conservation historique |

**Pour modifier une Collection COMMERCIALISÉE** : le designer crée une nouvelle version (BROUILLON v1.3.0) qui repasse par le cycle. La v1.2.0 reste déployée jusqu'à upgrade explicite.

### 3.6 Exemple de cycle de vie réel

```
Jour 1   : Designer crée "Royal Gold" → BROUILLON
Jour 1-5: Designer itère dans Penpot → EN_COURS
Jour 5  : Designer soumet → VALIDATION (v1.0.0-rc.1 snapshot)
Jour 6  : Art Director demande ajustement couleurs → retour EN_COURS
Jour 7  : Designer resoumet → VALIDATION (v1.0.0-rc.2 snapshot)
Jour 8  : Art Director approuve → PUBLIÉ (v1.0.0 publié, immutable)
Jour 8  : Admin active → COMMERCIALISÉ (visible catalog)
Jour 8+ : 12 mariages déployés sur Royal Gold v1.0.0

Mois 3  : Designer veut ajouter Variante D
         → crée v1.1.0 BROUILLON (la v1.0.0 reste COMMERCIALISÉE)
         → itère → VALIDATION → PUBLIÉ v1.1.0
         → Admin active v1.1.0 → COMMERCIALISÉ (remplace v1.0.0 dans catalog)
         → Les 12 mariages existants restent sur v1.0.0 jusqu'à upgrade explicite
         → Les nouveaux mariages utilisent v1.1.0

Année 2 : Designer crée "Royal Gold V2" (nouveau Design System)
         → Nouvelle Collection séparée "royal-gold-v2"
         → "Royal Gold" v1.x peut être ARCHIVÉ quand v2 est mature
```

---

## 4. COMPOSITION D'UN COLLECTION PRODUCT (Réponse Q4)

### 4.1 Les 5 packs obligatoires

Chaque Collection Product contient **obligatoirement** 5 packs. Une Collection incomplète ne peut pas passer en VALIDATION.

```
Collection Product
├── Pack 1 — Website (10 modules)
├── Pack 2 — Invitations (8 modules)
├── Pack 3 — Supports Imprimés (8 modules)
├── Pack 4 — Communication (8 modules)
└── Pack 5 — Luxury Preset (1 composite, data-only)
```

**Total : 34 modules Penpot + 1 luxury preset data = 35 éléments obligatoires.**

### 4.2 Pack 1 — WEBSITE (10 modules)

Le site web public du mariage.

| # | Slot | Description | Frame Penpot |
|---|------|-------------|--------------|
| 1 | `hero` | Section héros (titre, photo couple, date) | Obligatoire |
| 2 | `countdown` | Compte à rebours | Obligatoire |
| 3 | `story` | Notre histoire (timeline couple) | Obligatoire |
| 4 | `gallery` | Galerie photos | Obligatoire |
| 5 | `programme` | Programme de la journée | Obligatoire |
| 6 | `rsvp` | Formulaire de confirmation présence | Obligatoire |
| 7 | `footer` | Pied de page | Obligatoire |
| 8 | `loader` | Écran de chargement | Obligatoire |
| 9 | `splash` | Splash screen d'entrée | Obligatoire |
| 10 | `systemPages` | Pages système (404, erreur, maintenance) | Obligatoire |

### 4.3 Pack 2 — INVITATIONS (8 modules)

Les invitations déployées selon le tier du guest.

| # | Slot | Tier Guest | Frame Penpot |
|---|------|------------|--------------|
| 1 | `standard` | STANDARD | Obligatoire |
| 2 | `vip` | VIP | Obligatoire |
| 3 | `famille` | FAMILLE | Obligatoire |
| 4 | `couple` | COUPLE | Obligatoire |
| 5 | `presse` | PRESSE | Obligatoire |
| 6 | `sponsor` | SPONSOR | Obligatoire |
| 7 | `numerique` | (tous — version QR numérique) | Obligatoire |
| 8 | `impression` | (tous — version PDF imprimable) | Obligatoire |

**Rôle du moteur d'exécution** : Quand un guest ouvre son invitation, Wedding OS lit `guest.tier`, trouve le slot correspondant dans le Pack Invitations, et embedde la frame Penpot correspondante. Si la frame n'existe pas (fallback), Wedding OS utilise l'InvitationCard existant (compatibilité arrière).

### 4.4 Pack 3 — SUPPORTS IMPRIMÉS (8 modules)

Les supports physiques pour le jour J.

| # | Slot | Description | Frame Penpot |
|---|------|-------------|--------------|
| 1 | `badge` | Badge d'accès invité | Obligatoire |
| 2 | `qr` | Carte QR (code d'authentification) | Obligatoire |
| 3 | `parking` | Carte de parking | Obligatoire |
| 4 | `floorPlan` | Plan de salle | Obligatoire |
| 5 | `tableNumber` | Numéro de table | Obligatoire |
| 6 | `placeCard` | Marque-place individuel | Obligatoire |
| 7 | `remerciement` | Carte de remerciement | Obligatoire |
| 8 | `livreOr` | Page livre d'or | Obligatoire |

### 4.5 Pack 4 — COMMUNICATION (8 modules)

Les supports de communication marketing.

| # | Slot | Description | Frame Penpot |
|---|------|-------------|--------------|
| 1 | `whatsapp` | Message WhatsApp save-the-date | Obligatoire |
| 2 | `facebook` | Post Facebook | Obligatoire |
| 3 | `instagram` | Post Instagram (carré + story) | Obligatoire |
| 4 | `story` | Story animée | Obligatoire |
| 5 | `email` | Template email | Obligatoire |
| 6 | `banner` | Bannière web | Obligatoire |
| 7 | `affiche` | Affiche A3/A2 | Obligatoire |
| 8 | `rollup` | Roll-up 85×200cm | Obligatoire |

### 4.6 Pack 5 — LUXURY PRESET (1 composite, data-only)

L'ambiance visuelle, **sans frame Penpot** (c'est de la data qui configure le LuxuryVisualEngine existant).

| Slot | Contenu | Source |
|------|---------|--------|
| `luxuryPreset` | `{theme: gold\|rose\|champagne\|midnight, effects: {starrySky, goldenDust, microSparkles, luminousHalos, globalBreathing, sectionAmbiance, scrollReflections}, intensity, density, speed, haloCount}` | Data JSON |

**Réutilisation stricte du LuxuryVisualEngine existant** — aucun nouveau moteur. Le luxuryPreset est injecté dans le store au déploiement.

### 4.7 Variantes

Chaque Collection peut avoir jusqu'à **4 variantes** (A, B, C, D). Une variante = une Page Penpot dans le même file.

- **Variante A** (par défaut) : design principal
- **Variante B** : variation chromatique (ex: plus sombre)
- **Variante C** : variation structurelle (ex: hero différent)
- **Variante D** : variation saisonnière (ex: Christmas edition)

Chaque variante peut avoir un **paletteOverride** (couleurs/fonts alternatifs pour la même structure de frames).

**Exemple concret** :
- "Royal Gold" Variante A = version Or classique
- "Royal Gold" Variante B = version Or + Noir (plus sombre)
- "Royal Gold" Variante C = version Or + Blanc (plus lumineux)
- "Royal Gold" Variante D = version Or + Vert Émeraude (Christmas)

**Tout cela sans modifier le code** — le designer crée 4 Pages Penpot, Wedding OS lit les 4.

### 4.8 Validation de complétude

Au moment de la transition VALIDATION → PUBLIÉ, Wedding OS vérifie :

- ✅ Les 34 frames sont mappées (chaque slot a un frameId)
- ✅ Le themeSeed est complet (4 champs)
- ✅ Le luxuryPreset est valide
- ✅ Le file Penpot est accessible (URL valide)
- ✅ Au moins 1 variante est définie (A par défaut)
- ✅ Les métadonnées obligatoires sont présentes (nom, catégorie, auteur, licence, niveau qualité)

Si un élément manque → **publish bloqué** avec message explicite au designer.

---

## 5. DÉPLOIEMENT AUTOMATIQUE (Réponse Q5)

### 5.1 Le pipeline commercial en 5 étapes

> *"Lorsqu'un commercial crée un mariage : Étape 1 Choisir une Collection. Étape 2 Choisir une variante. Étape 3 Importer les photos. Étape 4 Choisir les couleurs. Étape 5 Entrer les informations."*

```
Étape 1 — Choisir une Collection Product
    ↓ le commercial parcourt le catalog (filtre par catégorie, tier)
    ↓ sélectionne "Royal Gold"
    ↓
Étape 2 — Choisir une variante
    ↓ A / B / C / D
    ↓ sélectionne "Variante A"
    ↓
Étape 3 — Importer les photos
    ↓ upload via Media Engine (existant)
    ↓ photos couple, galerie, story
    ↓
Étape 4 — Choisir les couleurs (optionnel, IA-assisted)
    ↓ palette override (peut garder les couleurs de la Collection)
    ↓ IA suggère harmonisation basée sur les photos (optionnel)
    ↓
Étape 5 — Entrer les informations
    ↓ noms couple, date, lieu, programme, textes
    ↓
═══════════════════════════════════════════
   DÉPLOIEMENT AUTOMATIQUE PAR WEDDING OS
═══════════════════════════════════════════
    ↓
✔ Site web créé
    (ThemeInjector + frames website)
✔ Invitations créées (par tier guest)
    (InvitationRenderer + frames invitations)
✔ Badges créés
    (PrintPackRenderer + frames print — v2)
✔ QR Codes créés
    (QR Engine existant — AES-256-GCM, inchangé)
✔ Publications créées
    (CommunicationPackRenderer + frames comm — v2)
✔ Affiches créées
    (CommunicationPackRenderer — v2)
✔ Bannières créées
    (CommunicationPackRenderer — v2)
✔ Supports imprimés créés
    (PrintPackRenderer — v2)
```

### 5.2 Ce que Wedding OS orchestre automatiquement

| Élément | Moteur d'exécution | Réutilisé | Nouveau |
|---------|-------------------|-----------|---------|
| Site web | ThemeInjector + Penpot frames website | ThemeInjector (inchangé) | Frame embed website |
| Invitations | InvitationRenderer (wrapper) + Penpot frames invitation | InvitationCard (fallback), QR Engine (inchangé), Guest Engine (inchangé) | InvitationRenderer wrapper |
| Badges | PrintPackRenderer (v2 deferred) | — | Nouveau renderer |
| QR Codes | QR Engine (AES-256-GCM + qrcode) | Inchangé | — |
| Publications | CommunicationPackRenderer (v2 deferred) | — | Nouveau renderer |
| Affiches | CommunicationPackRenderer (v2 deferred) | — | Nouveau renderer |
| Bannières | CommunicationPackRenderer (v2 deferred) | — | Nouveau renderer |
| Supports imprimés | PrintPackRenderer (v2 deferred) | — | Nouveau renderer |
| Ambiance visuelle | LuxuryVisualEngine | Inchangé (hydraté par luxuryPreset) | Hydratation additive |
| Données couple | Settings + Theme Engine | Inchangés | — |
| Multi-tenant | AsyncLocalStorage + Prisma extension | Inchangés | — |

### 5.3 Atomicité du déploiement

Le déploiement d'une Collection sur un mariage est **atomique** :

- Soit toutes les étapes réussissent → mariage entièrement configuré
- Soit une étape échoue → rollback complet (le mariage retombe sur DEFAULT_THEME, comportement actuel)

**Aucun état intermédiaire partiel** n'est jamais visible publiquement.

### 5.4 Idempotency

| Scénario | Comportement |
|----------|--------------|
| Re-apply même Collection + même Variante + même palette | No-op (détection par hash) |
| Re-apply avec paletteOverride différent | Update Theme row uniquement |
| Switch de Collection | Full re-seed (Theme + customizations + Wedding.collectionId + version) |
| Switch de Variante | Update pageId + merge paletteOverride variante |

### 5.5 Cycle de vie d'un mariage vs cycle de vie d'une Collection

| Événement Collection | Effet sur mariages existants |
|----------------------|------------------------------|
| Collection upgrade v1.0 → v1.1 | Mariages existants restent sur v1.0 jusqu'à upgrade explicite |
| Collection ARCHIVÉE | Mariages existants conservent leur déploiement (immutable) |
| Collection supprimée | Interdit si des mariages l'utilisent (soft-delete uniquement) |
| Nouvelle variante ajoutée (v1.1) | Mariages existants peuvent upgrade pour accéder à la nouvelle variante |

---

## 6. PRÉPARATION DU MARKETPLACE FUTUR (Réponse Q6)

### 6.1 Principe

> *"Ne coder aucun Marketplace pour l'instant. Préparer uniquement l'architecture."*

Le marketplace sera une **phase future** (post-Collection Engine v1). La présente spécification prépare **uniquement la structure de données** qui permettra ce marketplace sans modification de l'architecture.

**Aucun** de ces éléments ne sera codé maintenant :
- ❌ UI marketplace (search, cart, checkout)
- ❌ Endpoint de paiement (Stripe)
- ❌ Routing commercial
- ❌ Revenue share designer
- ❌ Reviews/ratings
- ❌ Bundles

### 6.2 Les 2 axes orthogonaux de positionnement

Un Collection Product est positionné sur **2 axes indépendants** :

#### Axe 1 — Billing tier (existant, quantitatif)

L'abonnement du couple détermine les **quotas** (combien de guests, de médias, d'admins).

| Plan | Quotas |
|------|--------|
| TRIAL | Limité |
| ESSENTIEL | Moyen |
| PREMIUM | Élevé |
| ELITE | Illimité |

#### Axe 2 — Marketplace tier (nouveau, qualitatif)

Le Collection Product a un positionnement commercial qui détermine **son accessibilité** selon le billing tier du couple.

| Marketplace tier | Accessibilité |
|------------------|---------------|
| FREE | Tous les billing plans |
| PREMIUM | PREMIUM + ELITE |
| EXCLUSIVE | ELITE uniquement |
| ENTERPRISE | ELITE + contrat spécifique |
| LIMITED | Selon stock + billing plan |
| EVENT | Selon date + billing plan |
| SIGNATURE | ELITE uniquement, collections signature designer |

**Fonction de gating** : `canAccessCollection(billingPlan, marketplaceTier)` — additive, ne remplace pas les helpers quantitatifs existants.

### 6.3 Catégories marketplace (discovery future)

| Catégorie | Description | Exemples |
|-----------|-------------|----------|
| LUXURY | Luxe premium | Royal Gold, Royal Black |
| ROYAL | Sous-famille royale | Royal Gold, Royal Emerald |
| CLASSIC | Classique intemporel | White Romance, Elegant Beige |
| MINIMAL | Minimaliste | Pure White, Nordic |
| AFRICAN | Inspirations africaines | Kente Prestige, Congo Prestige |
| MODERN | Moderne | (futur) |
| CATHOLIC | Cérémonie catholique | (futur) |
| CIVIL | Mariage civil | (futur) |
| DESTINATION | Mariage destination | Beach, Garden, Sunset |
| BEACH | Plage | Beach |
| GARDEN | Jardin | Garden |
| WINTER | Hiver | (futur) |

Une Collection a **une catégorie principale** mais peut apparaître dans plusieurs filtres (ex: "Beach" est à la fois dans DESTINATION et BEACH).

### 6.4 Champs data préparés (sans UI)

| Champ | Type | Rôle futur | Codé maintenant ? |
|-------|------|------------|-------------------|
| `marketplaceTier` | Enum soft | Positionnement commercial | Data seulement |
| `category` | Enum soft | Catégorisation discovery | Data seulement |
| `priceFcfa` | Int? | Prix FCFA | Data seulement |
| `priceUsd` | Float? | Prix USD | Data seulement |
| `limitedQuantity` | Int? | Stock limité | Data seulement |
| `eventDate` | DateTime? | Date d'expiration (EVENT) | Data seulement |
| `license` | Enum | STANDARD/EXCLUSIVE/CUSTOM | Data seulement |
| `author` | String | Designer identity | Data seulement |
| `version` | String (semver) | Version actuelle | Data seulement |
| `compatibility` | String | Version WOS min requise | Data seulement |

### 6.5 Futures phases marketplace (HORS SCOPE actuel)

Ces phases seront spécifiées ultérieurement, **sans modification** de l'architecture Collection Product :

- **Phase M1** : UI discovery catalog (search, filtres, preview)
- **Phase M2** : Panier + checkout + Stripe
- **Phase M3** : Revenue share designer (commissions)
- **Phase M4** : Reviews, ratings, testimonials
- **Phase M5** : Bundles (pack de Collections)
- **Phase M6** : Limited drops (collections limitées avec countdown)
- **Phase M7** : Event collections (collections saisonnières)

---

## 7. AUTONOMIE DU DESIGNER — ZÉRO DÉVELOPPEUR (Réponse Q7)

### 7.1 La question fondamentale

> *"Comment garantir qu'un nouveau designer puisse ajouter des Collections pendant des années sans intervention d'un développeur ?"*

### 7.2 Les 8 invariants de l'autonomie designer

#### Invariant 1 — Taxonomie de slots figée

Les **34 slots** (10 website + 8 invitation + 8 print + 8 communication) sont **figés**. Ils constituent le **contrat stable** entre Wedding OS et Penpot.

- Un designer mappe toujours ses frames sur ces 34 slots
- Ajouter un 35ème slot nécessite une **version majeure** de Wedding OS (rare, planifié, documenté)
- Ce contrat est versionné (compatibility field)

**Conséquence** : un designer peut créer 1000 Collections différentes, toutes mapperont sur les mêmes 34 slots. Zéro développeur requis.

#### Invariant 2 — Rendu par embed, jamais par code

Wedding OS ne **dessine jamais**. Il **embedde** des frames Penpot via iframe.

- Nouveau design = nouvelles frames Penpot (pas de nouveau code Wedding OS)
- Nouvelle variante = nouvelle Page Penpot (pas de nouveau code)
- Nouveau luxury preset = nouvelle data JSON (pas de nouveau code)

**Conséquence** : le moteur de rendu de Wedding OS est **stable**. Il n'évolue pas avec le nombre de Collections.

#### Invariant 3 — Métadonnées data-driven

Toute la configuration d'une Collection est de la **donnée** (métadonnées + frame registry + luxury preset), jamais du code.

- Ajouter une Collection = ajouter une ligne de donnée
- Modifier une Collection = modifier une ligne de donnée
- Aucune génération de code, aucune compilation, aucun deploy

**Conséquence** : le Designer Portal peut créer une Collection en self-service.

#### Invariant 4 — Convention over configuration

Les frames Penpot sont auto-détectées par convention de nommage (§2.3). Le designer n'a pas à configurer manuellement chaque mapping (sauf override explicite).

**Conséquence** : le workflow designer est rapide et standardisé.

#### Invariant 5 — Rôle Designer isolé

Le designer a un rôle **DESIGNER** dédié qui :
- Voit uniquement ses propres Collections
- Ne voit aucun mariage, aucun guest, aucune billing
- Ne peut pas modifier le code, le schéma, les configurations système
- Peut créer/éditer/soumettre ses Collections en self-service

**Conséquence** : un nouveau designer peut être onboardé en quelques minutes (compte + accès Penpot team + accès Designer Portal).

#### Invariant 6 — Cycle de vie découplé du déploiement

Le cycle de vie d'une Collection (BROUILLON → COMMERCIALISÉ) est **découplé** du déploiement Wedding OS.

- Publier une Collection = changer un état en DB (pas de deploy, pas de restart)
- Le commercial voit la nouvelle Collection immédiatement après COMMERCIALISÉ
- Zéro intervention développeur pour "mettre en production" une Collection

**Conséquence** : le time-to-market d'une Collection est de l'ordre de minutes (après validation Art Director).

#### Invariant 7 — Versionning non-breaking

Une nouvelle version d'une Collection ne casse jamais les mariages existants :
- Les mariages sont liés à une version spécifique (immutable)
- Upgrade = action explicite du couple/admin
- Pas d'upgrade automatique

**Conséquence** : un designer peut itérer sur sa Collection sans risquer de casser 50 mariages en production.

#### Invariant 8 — Compatibilité déclarée

Chaque Collection déclare sa compatibilité Wedding OS (ex: `>=2.0`). Wedding OS vérifie cette compatibilité au déploiement.

- Si une Collection nécessite Wedding OS 2.5 et que la plateforme est en 2.0 → déploiement bloqué avec message
- Le designer peut déclarer une compatibilité large pour maximiser l'accessibilité

**Conséquence** : pas de regression surprise liée à une évolution Wedding OS.

### 7.3 Scénario d'autonomie — Designer 2 crée "African Division"

```
Jour 0 : Designer 2 est recruté pour la division African
         ↓ Admin crée un compte DESIGNER dans Wedding OS
         ↓ Admin donne accès Designer 2 au team Penpot "AENEWS African"
         ↓ Designer 2 ouvre Penpot → crée "Kente Prestige Master"
         ↓
Jour 1-7 : Designer 2 crée les 34 frames (convention AENEOS)
          ↓ utilise des motifs kente, couleurs traditionnelles
          ↓ crée 2 variantes (A classique, B moderne)
          ↓
Jour 7   : Designer 2 ouvre Designer Portal → "Nouvelle Collection"
          ↓ colle URL Penpot → auto-détection 34 frames ✓
          ↓ remplit métadonnées (nom, catégorie AFRICAN, luxuryPreset gold)
          ↓ sauvegarde BROUILLON
          ↓
Jour 8-10: Designer 2 itère dans Penpot (changes visibles immédiatement)
          ↓
Jour 10  : Designer 2 soumet VALIDATION
          ↓ Art Director examine → approuve → PUBLIÉ
          ↓ Admin active → COMMERCIALISÉ
          ↓
Jour 10+ : "Kente Prestige" apparaît dans le catalog couple
          ↓ Les commerciaux peuvent le vendre immédiatement
          ↓ 5 mariages déployés sur Kente Prestige en semaine 1
          ↓
ZÉRO intervention développeur sur toute la séquence.
```

### 7.4 Modèle de scaling multi-designer

```
AENEWS Wedding Collections (catalog)
├── Designer 1 — Luxury Division
│   ├── Royal Gold (v1.2.0 — COMMERCIALISÉ)
│   ├── Royal Black (v1.0.0 — COMMERCIALISÉ)
│   └── Royal Emerald (v0.9.0 — VALIDATION)
│
├── Designer 2 — African Division
│   ├── Kente Prestige (v1.0.0 — COMMERCIALISÉ)
│   └── Congo Prestige (v0.5.0 — EN_COURS)
│
├── Designer 3 — Catholic Division
│   └── Notre Dame Sacrament (v0.3.0 — BROUILLON)
│
├── Designer 4 — Beach Division
│   ├── Beach Sunset (v1.0.0 — COMMERCIALISÉ)
│   ├── Beach Tropical (v0.8.0 — VALIDATION)
│   └── Beach Garden (v0.2.0 — BROUILLON)
│
└── Designer 5 — Minimal Division
    ├── Pure White (v1.1.0 — COMMERCIALISÉ)
    └── Nordic (v1.0.0 — COMMERCIALISÉ)

Chaque designer est autonome sur sa division.
Le développeur ne maintient que le moteur (stable).
Le catalogue grandit indéfiniment sans intervention développeur.
```

### 7.5 Ce qui nécessite TOUJOURS un développeur

Pour être transparent, voici ce qui ne peut **pas** être fait par un designer seul :

| Action | Nécessite développeur ? | Raison |
|--------|------------------------|--------|
| Ajouter un 35ème slot | ✅ Oui | Rupture du contrat stable — version majeure WOS |
| Changer le moteur de rendu (iframe → autre) | ✅ Oui | Évolution technique du moteur |
| Ajouter un nouveau moteur (ex: 3D) | ✅ Oui | Nouvelle infrastructure |
| Modifier le cycle de vie (ajouter un 7ème état) | ✅ Oui | Évolution du workflow |
| Modifier la convention de nommage | ✅ Oui | Rupture compatibilité — version majeure |
| Créer une Collection standard | ❌ Non | Invariants 1-8 |
| Créer une variante | ❌ Non | Invariant 3 |
| Itérer sur un design | ❌ Non | Invariant 2 |
| Publier une Collection | ❌ Non | Invariant 6 |
| Archiver une Collection | ❌ Non | Invariant 6 |

**Ratio cible** : 95% des actions Collection = zéro développeur. 5% = évolutions majeures planifiées.

---

## 8. CATALOGUE INITIAL — AENEWS WEDDING COLLECTIONS

### 8.1 Le premier livrable commercial

Conformément à la directive (*"Le premier livrable ne devrait pas être une table Prisma. Le premier livrable devrait être la première Collection commercialisable"*), le catalogue initial est défini **avant** toute implémentation technique.

### 8.2 Catalogue seed — 5 catégories, 13 Collections

```
AENEWS Wedding Collections
│
├── LUXURY
│   ├── Royal Gold        (Designer 1 — v1.0.0 — SIGNATURE)
│   ├── Royal Black       (Designer 1 — v1.0.0 — EXCLUSIVE)
│   └── Royal Emerald     (Designer 1 — v0.9.0 — EXCLUSIVE)
│
├── CLASSIC
│   ├── White Romance     (Designer 5 — v1.0.0 — PREMIUM)
│   └── Elegant Beige     (Designer 5 — v1.0.0 — PREMIUM)
│
├── AFRICAN
│   ├── Kente Prestige    (Designer 2 — v1.0.0 — SIGNATURE)
│   └── Congo Prestige    (Designer 2 — v0.5.0 — PREMIUM)
│
├── MINIMAL
│   ├── Pure White        (Designer 5 — v1.1.0 — FREE)
│   └── Nordic            (Designer 5 — v1.0.0 — PREMIUM)
│
└── DESTINATION
    ├── Beach             (Designer 4 — v1.0.0 — PREMIUM)
    ├── Garden            (Designer 4 — v0.8.0 — PREMIUM)
    └── Sunset            (Designer 4 — v0.2.0 — PREMIUM)
```

### 8.3 Détail Collection — Royal Gold (exemple référence)

```
Collection Product : Royal Gold
├── Identité : royal-gold
├── Nom commercial : "Royal Gold"
├── Auteur : Designer 1 — Luxury Division
├── Version : 1.0.0
├── Date publication : (à définir au lancement)
├── Licence : STANDARD
├── Niveau qualité : SIGNATURE
├── Catégorie : LUXURY (sous-famille ROYAL)
├── Marketplace tier : SIGNATURE (accessible ELITE uniquement)
├── Prix futur : sur devis
├── Compatibilité : Wedding OS >=2.0
├── État : COMMERCIALISE
│
├── Design System : "Luxury Royal"
│   (palette or/noir, Cormorant Garamond + Inter, motifs royaux)
│
├── Theme Seed :
│   ├── primaryColor : #D4AF37 (or royal)
│   ├── accentColor : #1a1a2e (noir nuit)
│   ├── fontDisplay : Cormorant Garamond
│   └── fontBody : Inter
│
├── Luxury Preset :
│   ├── theme : gold
│   ├── effects : starrySky + goldenDust + luminousHalos + globalBreathing
│   ├── intensity : 0.8
│   ├── density : 0.7
│   └── speed : 0.5
│
├── Composition (34 frames + 1 preset) :
│   ├── Website : 10 frames (hero, countdown, story, gallery, programme, rsvp, footer, loader, splash, system-pages)
│   ├── Invitations : 8 frames (standard, vip, famille, couple, presse, sponsor, numerique, impression)
│   ├── Print : 8 frames (badge, qr, parking, floor-plan, table-number, place-card, remerciement, livre-or)
│   ├── Communication : 8 frames (whatsapp, facebook, instagram, story-comm, email, banner, affiche, roll-up)
│   └── Luxury Preset : data JSON
│
├── Variantes :
│   ├── A (par défaut) : Or classique — Page Penpot A
│   ├── B : Or + Noir — Page Penpot B
│   ├── C : Or + Blanc — Page Penpot C
│   └── D : Or + Émeraude (Christmas) — Page Penpot D
│
├── Penpot Master File :
│   └── URL : https://design.penpot.app/#/view?file-id=royal-gold-master
│
└── Historique versions :
    └── v1.0.0 (publié au lancement)
```

### 8.4 Roadmap catalogue (vision long terme)

| Horizon | Collections cibles | Designers |
|---------|-------------------|-----------|
| **Lancement (T0)** | 4 Collections (Royal Gold, White Romance, Pure White, Beach) | 3 designers |
| **T0 + 3 mois** | 13 Collections (catalog seed complet) | 5 designers |
| **T0 + 6 mois** | 25 Collections (ajout MODERN, CATHOLIC, CIVIL, WINTER) | 7 designers |
| **T0 + 12 mois** | 50+ Collections (marketplace ouvert) | 10+ designers |
| **T0 + 24 mois** | 100+ Collections (signature designers invités) | 15+ designers |

**Toute cette croissance se fait sans intervention développeur** (invariants §7.2).

---

## 9. MODÈLE DE RÔLES

### 9.1 Les 6 rôles de la plateforme

| Rôle | Accès principal | Peut créer Collection ? | Peut déployer mariage ? |
|------|----------------|------------------------|------------------------|
| **DESIGNER** | Designer Portal | ✅ (ses Collections) | ❌ |
| **ART_DIRECTOR** | Designer Portal + Validation queue | ❌ | ❌ (valide les Collections) |
| **ADMIN** | Platform Admin (Command Center) | ❌ (mais peut gérer le catalogue) | ✅ |
| **SALES** | Catalog commercial + Onboarding | ❌ | ✅ |
| **COUPLE** (tenant admin) | Wedding Workspace | ❌ | ❌ (son mariage seulement) |
| **GUEST** | Invitation + espace personnel | ❌ | ❌ |

### 9.2 Matrice de permissions détaillée

| Action | DESIGNER | ART_DIRECTOR | ADMIN | SALES | COUPLE | GUEST |
|--------|----------|--------------|-------|-------|--------|-------|
| Créer Collection (BROUILLON) | ✅ (ses propres) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Éditer Collection (BROUILLON/EN_COURS) | ✅ (ses propres) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Soumettre VALIDATION | ✅ (ses propres) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Valider Collection (→ PUBLIÉ) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Commercialiser Collection (→ COMMERCIALISÉ) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Archiver Collection | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Voir catalog commercial | ❌ | ❌ | ✅ | ✅ | ✅ (filtré par plan) | ❌ |
| Déployer Collection sur mariage | ❌ | ❌ | ✅ | ✅ | ✅ (son mariage) | ❌ |
| Choisir variante | ❌ | ❌ | ✅ | ✅ | ✅ (son mariage) | ❌ |
| Override palette | ❌ | ❌ | ✅ | ✅ | ✅ (son mariage) | ❌ |
| Voir ses invités | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (soi-même) |
| Voir stats marketplace (futur) | ✅ (ses Collections) | ✅ | ✅ | ❌ | ❌ | ❌ |

### 9.3 Onboarding d'un nouveau designer

```
1. Admin crée un compte DESIGNER dans Wedding OS (email + mot de passe)
2. Admin ajoute le designer au team Penpot "AENEWS" (accès aux Design Systems partagés)
3. Designer reçoit ses credentials (email)
4. Designer se connecte au Designer Portal
5. Designer crée sa première Collection (workflow §2.2)
6. Designer soumet pour VALIDATION
7. Art Director examine → approuve → PUBLIÉ
8. Admin commercialise
9. Designer voit sa Collection dans le catalog

Temps total (hors design) : ~30 minutes
Zéro intervention développeur.
```

---

## 10. GLOSSAIRE

| Terme | Définition |
|-------|------------|
| **Collection Product** | Actif commercial digital versionné encapsulant un design de mariage complet créé dans Penpot |
| **Pack** | Regroupement fonctionnel de modules (Website, Invitations, Print, Communication, Luxury Preset) |
| **Module** | Bloc fonctionnel réutilisable mappé à une frame Penpot (ex: "Invitation VIP") |
| **Slot** | Position nommée dans un pack (ex: `vip` dans le pack Invitations) — figé par contrat stable |
| **Frame Registry** | Table de mapping slot → frameId pour une Collection donnée |
| **Design System** | Langage de design partagé par plusieurs Collections (palette, typographie, components) |
| **Variante** | Variation d'une Collection (A/B/C/D) = une Page Penpot dans le même file |
| **Palette Override** | Override optionnel des couleurs/fonts par le couple ou la variante |
| **Theme Seed** | Les 4 champs canoniques (primaryColor, accentColor, fontDisplay, fontBody) issus de la Collection |
| **Luxury Preset** | Configuration data-only du LuxuryVisualEngine (theme + effects + sliders) |
| **Lifecycle** | Cycle de vie d'une Collection (6 états : BROUILLON → ARCHIVÉ) |
| **Snapshot** | État immuable d'une Collection au moment de VALIDATION/PUBLICATION |
| **Billing tier** | Plan d'abonnement du couple (TRIAL/ESSENTIEL/PREMIUM/ELITE) — axe quantitatif |
| **Marketplace tier** | Positionnement commercial de la Collection (FREE/PREMIUM/EXCLUSIVE/...) — axe qualitatif |
| **Category** | Famille commerciale de la Collection (LUXURY/AFRICAN/BEACH/...) |
| **Compatibility** | Version minimale de Wedding OS requise par une Collection |
| **Designer Portal** | Zone de Wedding OS dédiée aux designers (création/édition/lifecycle des Collections) |
| **Convention de nommage** | Règle de nommage des frames Penpot pour auto-détection (§2.3) |
| **Auto-détection** | Mécanisme par lequel Wedding OS mappe automatiquement les frames Penpot aux slots |
| **Invariant** | Principe technique garantissant l'autonomie designer (§7.2) |
| **Moteur d'exécution** | Moteur existant (Theme Engine, Invitation Engine, etc.) qui rend la Collection |
| **Penpot Studio** | Zone admin existante pour push/pull tokens (coexiste avec Collection Engine) |

---

## 11. NON-GOALS

Cette spécification NE couvre PAS :

- ❌ L'implémentation technique (schéma Prisma, API routes, composants React) — fera l'objet d'un plan technique séparé APRÈS validation
- ❌ Le code de l'UI marketplace (search, cart, checkout)
- ❌ L'intégration Stripe / paiement
- ❌ Le revenue share designer
- ❌ Les reviews/ratings marketplace
- ❌ Le moteur de rendu 3D (futur)
- ❌ L'IA générative de designs (interdit par principe)
- ❌ L'éditeur graphique in-app (interdit par principe)
- ❌ Le constructeur de thème (interdit par principe)
- ❌ Les PrintPackRenderer et CommunicationPackRenderer complets (deferred v2)
- ❌ La migration des weddings existants vers des Collections (optionnel, case par case)

---

## 12. CHECKLIST DE VALIDATION

### 12.1 Les 7 questions couvertes ?

| # | Question | Section | ✅ |
|---|----------|---------|---|
| 1 | Qu'est-ce qu'un Collection Product dans Wedding OS ? | §1 | ✅ |
| 2 | Comment un designer crée-t-il une Collection Product uniquement avec Penpot ? | §2 | ✅ |
| 3 | Quel est le cycle de vie complet d'une Collection Product ? | §3 | ✅ |
| 4 | Comment une Collection Product est-elle composée ? | §4 | ✅ |
| 5 | Comment Wedding OS déploie-t-il automatiquement une Collection Product sur un nouveau mariage ? | §5 | ✅ |
| 6 | Comment préparer dès maintenant un futur Marketplace de Collections sans modifier l'architecture ? | §6 | ✅ |
| 7 | Comment garantir qu'un nouveau designer puisse ajouter des Collections pendant des années sans intervention d'un développeur ? | §7 | ✅ |

### 12.2 Conformité à la vision

| Principe vision | Conformité |
|-----------------|------------|
| Wedding OS ne fabrique plus de thèmes | ✅ §1.2 — Collection Product ≠ thème |
| Déployer automatiquement des Collections Premium créées dans Penpot | ✅ §5 — pipeline 5 steps |
| Penpot = moteur graphique principal | ✅ §2.1 — designer travaille uniquement dans Penpot |
| IA = assistant seulement, après sélection | ✅ §5.1 étape 4 (optionnel) |
| Aucun éditeur graphique / constructeur de thème | ✅ §11 non-goals |
| 4 niveaux d'abstraction (Collection → Design System → Modules → Frames) | ✅ §1.4 modèle conceptuel |
| Designer publie → Wedding OS détecte → catalog auto | ✅ §2.2 workflow + §2.3 auto-détection |
| Marketplace préparé (architecture only, no code) | ✅ §6 data-only |
| Designer peut créer Royal Gold V2/Christmas/VIP/Africa sans développeur | ✅ §7 invariants |
| Cycle de vie complet (BROUILLON → ARCHIVÉ) | ✅ §3 — 6 états |
| Collection Product = actif commercial (nom, auteur, version, licence, qualité, catégorie, prix, compatibilité, historique) | ✅ §1.3 — 16 attributs |
| Réutiliser moteurs existants (Theme Engine, ThemeInjector, Invitation Engine, LuxuryVisualEngine, Media Engine, Billing, Multi-tenant, Wedding Workspace, Command Center, QR Engine, Guest Engine) | ✅ §5.2 matrice d'exécution |
| Additif, rétrocompatible, réversible | ✅ §5.3 atomicité + §5.4 idempotency + rollback |
| On conçoit le catalogue avant la base de données | ✅ §8 catalogue défini avant implémentation |

### 12.3 Décisions à valider par l'utilisateur

Avant de passer au plan technique d'implémentation, les décisions suivantes nécessitent validation explicite :

1. ✅ Les **34 slots figés** (10+8+8+8) comme contrat stable
2. ✅ Les **6 états du cycle de vie** (BROUILLON, EN_COURS, VALIDATION, PUBLIÉ, COMMERCIALISÉ, ARCHIVÉ)
3. ✅ Les **16 attributs** du Collection Product
4. ✅ Le **catalogue seed** (5 catégories, 13 Collections, 5 designers)
5. ✅ Les **8 invariants** d'autonomie designer
6. ✅ Le **rôle DESIGNER** dédié (isolé des mariages/guests/billing)
7. ✅ Le **rôle ART_DIRECTOR** pour la validation
8. ✅ Les **2 axes orthogonaux** (billing tier + marketplace tier)
9. ✅ La **convention de nommage** des frames Penpot
10. ✅ Le **découplage** cycle de vie Collection ↔ déploiement mariage

---

## CONCLUSION

Cette spécification fonctionnelle définit le **Collection Product Engine** comme le cœur commercial d'AENEWS Wedding OS. Elle transforme Wedding OS d'un logiciel technique en une **plateforme SaaS Enterprise** où :

- Les **designers** créent des Collections Premium dans Penpot, sans toucher au code
- Les **commerciaux** choisissent une Collection et vendent une solution complète
- Les **administrateurs** déploient un mariage en quelques minutes
- L'**IA** intervient uniquement comme assistant d'optimisation
- **Wedding OS** orchestre automatiquement site web, invitations, QR Codes, supports imprimés, communication et expérience visuelle à partir d'une Collection validée

Le catalogue est défini **avant** la base de données. Le premier livrable sera la **première Collection commercialisable** (Royal Gold), pas une table Prisma.

**En attente de validation utilisateur de cette spécification fonctionnelle.**

Une fois validée, un **plan technique d'implémentation** sera produit (dérivé de cette spec, conformément à ses principes), puis l'implémentation commencera par le catalogue (les Collections en tant que produits) avant la technique (schéma, API, composants).
