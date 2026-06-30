// ══════════════════════════════════════════════════════════════════════════════
// Collection Engine — Phase 1 (AENEWS Wedding OS Enterprise)
// ══════════════════════════════════════════════════════════════════════════════
// Orchestrates existing motors (Theme Engine, ThemeInjector, LuxuryVisualEngine,
// PenpotStudio) — does NOT replace any of them.
//
// Phase 1 scope (minimal, immediately useful):
//   - listCollections / getCollection — read catalog
//   - canAccessCollection — billing-tier gating (additive to PLAN_LIMITS)
//   - applyCollection — upsert Theme row + hydrate luxury preset + link Wedding
//   - ROYAL_GOLD_SEED — the first commercial Collection Product
//
// What this module does NOT do (deferred to later phases):
//   - 34 module slots / frame registry (Phase 2)
//   - Designer Portal / lifecycle 6-state (Phase 2+)
//   - Marketplace UI / payment routing (future)
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { themeToPenpotTokens, parsePenpotUrl } from '@/lib/penpot/config'
import type { Plan } from '@/lib/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeSeed {
  primaryColor: string
  accentColor: string
  fontDisplay: string
  fontBody: string
  layout: string
}

export interface LuxuryPreset {
  theme: 'gold' | 'rose' | 'champagne' | 'midnight'
  effects: {
    starrySky: boolean
    goldenDust: boolean
    microSparkles: boolean
    luminousHalos: boolean
    globalBreathing: boolean
    sectionAmbiance: boolean
    scrollReflections: boolean
  }
  intensity: number
  density: number
  speed: number
  haloCount: number
}

export interface PaletteOverride {
  primaryColor?: string
  accentColor?: string
  fontDisplay?: string
  fontBody?: string
}

export interface CollectionPublic {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnailUrl: string | null
  category: string
  tier: string
  sortOrder: number
  themeSeed: ThemeSeed
  luxuryPreset: LuxuryPreset | null
  penpotFileUrl: string | null
  variants: CollectionVariantPublic[]
}

export interface CollectionVariantPublic {
  id: string
  code: string
  name: string
  paletteOverride: PaletteOverride | null
  penpotPageId: string | null
  isDefault: boolean
}

// ─── Phase 2 — Module Slots (5 packs, 34 slots) ──────────────────────────────

export type ModulePack = 'WEBSITE' | 'INVITATIONS' | 'PRINT' | 'COMMUNICATION'

export interface CollectionModulePublic {
  id: string
  pack: ModulePack
  slot: string
  label: string
  frameId: string | null
  penpotPageId: string | null
  guestTier: string | null
  sortOrder: number
}

export interface CompletenessReport {
  collectionId: string
  collectionSlug: string
  collectionName: string
  total: number
  filled: number
  missing: number
  complete: boolean
  byPack: Record<ModulePack, { total: number; filled: number; missing: number; complete: boolean }>
  missingSlots: Array<{ pack: ModulePack; slot: string; label: string }>
}

/**
 * The 34 module slots every Collection Product must declare.
 * Pack 5 (LUXURY) is data-only (stored in Collection.luxuryPreset) — not listed here.
 * Source: COLLECTION_PRODUCT_SPEC.md §4 (Composition d'un Collection Product).
 */
export const MODULE_SLOTS: ReadonlyArray<{
  pack: ModulePack
  slot: string
  label: string
  guestTier?: string
  sortOrder: number
}> = [
  // Pack 1 — WEBSITE (10 slots)
  { pack: 'WEBSITE', slot: 'hero', label: 'Section héros (titre, photo couple, date)', sortOrder: 1 },
  { pack: 'WEBSITE', slot: 'countdown', label: 'Compte à rebours', sortOrder: 2 },
  { pack: 'WEBSITE', slot: 'story', label: 'Notre histoire (timeline couple)', sortOrder: 3 },
  { pack: 'WEBSITE', slot: 'gallery', label: 'Galerie photos', sortOrder: 4 },
  { pack: 'WEBSITE', slot: 'programme', label: 'Programme de la journée', sortOrder: 5 },
  { pack: 'WEBSITE', slot: 'rsvp', label: 'Formulaire de confirmation présence', sortOrder: 6 },
  { pack: 'WEBSITE', slot: 'footer', label: 'Pied de page', sortOrder: 7 },
  { pack: 'WEBSITE', slot: 'loader', label: 'Écran de chargement', sortOrder: 8 },
  { pack: 'WEBSITE', slot: 'splash', label: 'Splash screen d\'entrée', sortOrder: 9 },
  { pack: 'WEBSITE', slot: 'systemPages', label: 'Pages système (404, erreur, maintenance)', sortOrder: 10 },
  // Pack 2 — INVITATIONS (8 slots, guest-tier scoped)
  { pack: 'INVITATIONS', slot: 'standard', label: 'Invitation STANDARD', guestTier: 'STANDARD', sortOrder: 11 },
  { pack: 'INVITATIONS', slot: 'vip', label: 'Invitation VIP', guestTier: 'VIP', sortOrder: 12 },
  { pack: 'INVITATIONS', slot: 'famille', label: 'Invitation FAMILLE', guestTier: 'FAMILLE', sortOrder: 13 },
  { pack: 'INVITATIONS', slot: 'couple', label: 'Invitation COUPLE', guestTier: 'COUPLE', sortOrder: 14 },
  { pack: 'INVITATIONS', slot: 'presse', label: 'Invitation PRESSE', guestTier: 'PRESSE', sortOrder: 15 },
  { pack: 'INVITATIONS', slot: 'sponsor', label: 'Invitation SPONSOR', guestTier: 'SPONSOR', sortOrder: 16 },
  { pack: 'INVITATIONS', slot: 'numerique', label: 'Invitation numérique (QR)', sortOrder: 17 },
  { pack: 'INVITATIONS', slot: 'impression', label: 'Invitation imprimable (PDF)', sortOrder: 18 },
  // Pack 3 — PRINT (8 slots)
  { pack: 'PRINT', slot: 'badge', label: 'Badge d\'accès invité', sortOrder: 19 },
  { pack: 'PRINT', slot: 'qr', label: 'Carte QR (code d\'authentification)', sortOrder: 20 },
  { pack: 'PRINT', slot: 'parking', label: 'Carte de parking', sortOrder: 21 },
  { pack: 'PRINT', slot: 'floorPlan', label: 'Plan de salle', sortOrder: 22 },
  { pack: 'PRINT', slot: 'tableNumber', label: 'Numéro de table', sortOrder: 23 },
  { pack: 'PRINT', slot: 'placeCard', label: 'Marque-place individuel', sortOrder: 24 },
  { pack: 'PRINT', slot: 'remerciement', label: 'Carte de remerciement', sortOrder: 25 },
  { pack: 'PRINT', slot: 'livreOr', label: 'Page livre d\'or', sortOrder: 26 },
  // Pack 4 — COMMUNICATION (8 slots)
  { pack: 'COMMUNICATION', slot: 'whatsapp', label: 'Message WhatsApp save-the-date', sortOrder: 27 },
  { pack: 'COMMUNICATION', slot: 'facebook', label: 'Post Facebook', sortOrder: 28 },
  { pack: 'COMMUNICATION', slot: 'instagram', label: 'Post Instagram (carré + story)', sortOrder: 29 },
  { pack: 'COMMUNICATION', slot: 'story', label: 'Story animée', sortOrder: 30 },
  { pack: 'COMMUNICATION', slot: 'email', label: 'Template email', sortOrder: 31 },
  { pack: 'COMMUNICATION', slot: 'banner', label: 'Bannière web', sortOrder: 32 },
  { pack: 'COMMUNICATION', slot: 'affiche', label: 'Affiche A3/A2', sortOrder: 33 },
  { pack: 'COMMUNICATION', slot: 'rollup', label: 'Roll-up 85×200cm', sortOrder: 34 },
] as const

export const MODULE_PACK_LABELS: Record<ModulePack, string> = {
  WEBSITE: 'Pack 1 — Website',
  INVITATIONS: 'Pack 2 — Invitations',
  PRINT: 'Pack 3 — Supports Imprimés',
  COMMUNICATION: 'Pack 4 — Communication',
}

// ─── Tier gating (additive — coexists with PLAN_LIMITS) ──────────────────────

const TIER_ACCESS: Record<string, Plan[]> = {
  FREE: ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'],
  PREMIUM: ['PREMIUM', 'ELITE'],
  EXCLUSIVE: ['ELITE'],
  ENTERPRISE: ['ELITE'],
  LIMITED: ['PREMIUM', 'ELITE'],
  EVENT: ['PREMIUM', 'ELITE'],
  SIGNATURE: ['ELITE'],
}

/**
 * Check if a billing plan can access a Collection with the given marketplace tier.
 * Additive helper — does NOT replace the existing PLAN_LIMITS quantitative checks.
 */
export function canAccessCollection(billingPlan: Plan, collectionTier: string): boolean {
  const allowed = TIER_ACCESS[collectionTier] ?? TIER_ACCESS.FREE
  return allowed.includes(billingPlan)
}

// ─── Catalog seeds (12 Collections across 5 categories) ──────────────────────
// Phase 3: enriched catalog per COLLECTION_PRODUCT_SPEC.md §8.
// 5 categories: LUXURY (3) + CLASSIC (2) + AFRICAN (2) + MINIMAL (2) + DESTINATION (3)
// Tier distribution: FREE (7) + PREMIUM (3) + EXCLUSIVE (2) = 12

interface CollectionSeed {
  slug: string
  name: string
  description: string
  thumbnailUrl: string | null
  category: string
  tier: string
  sortOrder: number
  penpotFileUrl: string | null
  themeSeed: ThemeSeed
  luxuryPreset: LuxuryPreset | null
  variants: ReadonlyArray<{
    code: string
    name: string
    paletteOverride: PaletteOverride | null
    penpotPageId: string | null
    isDefault: boolean
  }>
}

export const COLLECTION_SEEDS: readonly CollectionSeed[] = [
  // ═══ LUXURY (sortOrder 0-2) ═══════════════════════════════════════════════
  {
    slug: 'royal-gold',
    name: 'Royal Gold',
    description:
      'Collection signature de la division Luxury. Or royal, noir nuit, typographie Cormorant Garamond. Ambiance cinematic avec poussière dorée, halos lumineux et respiration globale.',
    thumbnailUrl: null,
    category: 'LUXURY',
    tier: 'FREE',
    sortOrder: 0,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#D4AF37',
      accentColor: '#1a1a2e',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
      layout: 'royal',
    },
    luxuryPreset: {
      theme: 'gold',
      effects: {
        starrySky: true,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: true,
        globalBreathing: true,
        sectionAmbiance: false,
        scrollReflections: false,
      },
      intensity: 80,
      density: 70,
      speed: 50,
      haloCount: 4,
    },
    variants: [
      { code: 'A', name: 'Version A — Or classique', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
  {
    slug: 'royal-black',
    name: 'Royal Black',
    description:
      'Élégance dramatique. Noir profond et or vieilli, typographie Playfair Display. Ambiance nocturne avec étoiles scintillantes et halos subtils.',
    thumbnailUrl: null,
    category: 'LUXURY',
    tier: 'PREMIUM',
    sortOrder: 1,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#0a0a0a',
      accentColor: '#C9A961',
      fontDisplay: 'Playfair Display',
      fontBody: 'Montserrat',
      layout: 'royal',
    },
    luxuryPreset: {
      theme: 'midnight',
      effects: {
        starrySky: true,
        goldenDust: false,
        microSparkles: true,
        luminousHalos: true,
        globalBreathing: true,
        sectionAmbiance: false,
        scrollReflections: true,
      },
      intensity: 90,
      density: 60,
      speed: 40,
      haloCount: 3,
    },
    variants: [
      { code: 'A', name: 'Version A — Noir profond', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
  {
    slug: 'royal-emerald',
    name: 'Royal Emerald',
    description:
      'Luxe émeraude. Vert profond et or, inspiration jewel tone. Ambiance cinematic maximale avec halos étendus et poussière dorée dense.',
    thumbnailUrl: null,
    category: 'LUXURY',
    tier: 'EXCLUSIVE',
    sortOrder: 2,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#0F4C3A',
      accentColor: '#D4AF37',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
      layout: 'royal',
    },
    luxuryPreset: {
      theme: 'gold',
      effects: {
        starrySky: true,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: true,
        globalBreathing: true,
        sectionAmbiance: true,
        scrollReflections: true,
      },
      intensity: 85,
      density: 75,
      speed: 45,
      haloCount: 5,
    },
    variants: [
      { code: 'A', name: 'Version A — Émeraude royal', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },

  // ═══ CLASSIC (sortOrder 10-11) ════════════════════════════════════════════
  {
    slug: 'white-romance',
    name: 'White Romance',
    description:
      'Romance intemporelle. Crème et bronze, typographie élégante Cormorant Garamond. Ambiance champagne douce et feutrée, parfaite pour cérémonies classiques.',
    thumbnailUrl: null,
    category: 'CLASSIC',
    tier: 'FREE',
    sortOrder: 10,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#F5E6D3',
      accentColor: '#8B6F47',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Lato',
      layout: 'classic',
    },
    luxuryPreset: {
      theme: 'champagne',
      effects: {
        starrySky: false,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: false,
        globalBreathing: true,
        sectionAmbiance: false,
        scrollReflections: false,
      },
      intensity: 50,
      density: 40,
      speed: 30,
      haloCount: 2,
    },
    variants: [
      { code: 'A', name: 'Version A — Crème romantique', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
  {
    slug: 'elegant-beige',
    name: 'Elegant Beige',
    description:
      'Élégance beige chaleureuse. Tons neutres et naturels, typographie raffinée. Ambiance champagne légère pour un mariage sophistiqué et discret.',
    thumbnailUrl: null,
    category: 'CLASSIC',
    tier: 'FREE',
    sortOrder: 11,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#D4C5B0',
      accentColor: '#5C4033',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Open Sans',
      layout: 'classic',
    },
    luxuryPreset: {
      theme: 'champagne',
      effects: {
        starrySky: false,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: false,
        globalBreathing: true,
        sectionAmbiance: false,
        scrollReflections: false,
      },
      intensity: 45,
      density: 35,
      speed: 35,
      haloCount: 2,
    },
    variants: [
      { code: 'A', name: 'Version A — Beige naturel', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },

  // ═══ AFRICAN (sortOrder 20-21) ════════════════════════════════════════════
  {
    slug: 'kente',
    name: 'Kente',
    description:
      'Héritage kente. Orange et vert profond, inspiration tissu traditionnel ghanéen. Ambiance dorée vibrante célébrant la richesse culturelle africaine.',
    thumbnailUrl: null,
    category: 'AFRICAN',
    tier: 'PREMIUM',
    sortOrder: 20,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#E8A53D',
      accentColor: '#1B5E20',
      fontDisplay: 'Playfair Display',
      fontBody: 'Montserrat',
      layout: 'royal',
    },
    luxuryPreset: {
      theme: 'gold',
      effects: {
        starrySky: false,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: true,
        globalBreathing: true,
        sectionAmbiance: true,
        scrollReflections: false,
      },
      intensity: 70,
      density: 80,
      speed: 60,
      haloCount: 4,
    },
    variants: [
      { code: 'A', name: 'Version A — Kente royal', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
  {
    slug: 'congo-prestige',
    name: 'Congo Prestige',
    description:
      'Prestige congolais. Rouge et or ciel, inspiration drapeau RDC. Ambiance dorée intense, luxe africain signé pour célébrations grandioses.',
    thumbnailUrl: null,
    category: 'AFRICAN',
    tier: 'EXCLUSIVE',
    sortOrder: 21,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#C41E3A',
      accentColor: '#FFD700',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
      layout: 'royal',
    },
    luxuryPreset: {
      theme: 'gold',
      effects: {
        starrySky: true,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: true,
        globalBreathing: true,
        sectionAmbiance: true,
        scrollReflections: true,
      },
      intensity: 85,
      density: 85,
      speed: 55,
      haloCount: 5,
    },
    variants: [
      { code: 'A', name: 'Version A — Prestige RDC', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },

  // ═══ MINIMAL (sortOrder 30-31) ════════════════════════════════════════════
  {
    slug: 'pure-white',
    name: 'Pure White',
    description:
      'Pureté minimale. Blanc et gris anthracite, typographie Montserrat. Ambiance champagne ultra-subtile, focus sur le contenu et la simplicité.',
    thumbnailUrl: null,
    category: 'MINIMAL',
    tier: 'FREE',
    sortOrder: 30,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#FFFFFF',
      accentColor: '#2C2C2C',
      fontDisplay: 'Montserrat',
      fontBody: 'Inter',
      layout: 'minimal',
    },
    luxuryPreset: {
      theme: 'champagne',
      effects: {
        starrySky: false,
        goldenDust: false,
        microSparkles: true,
        luminousHalos: false,
        globalBreathing: true,
        sectionAmbiance: false,
        scrollReflections: false,
      },
      intensity: 25,
      density: 20,
      speed: 20,
      haloCount: 1,
    },
    variants: [
      { code: 'A', name: 'Version A — Blanc pur', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
  {
    slug: 'nordic',
    name: 'Nordic',
    description:
      'Sérénité nordique. Bleu pâle et blanc, inspiration scandinave. Ambiance midnight légère, fraîcheur boréale pour mariages modernes et épurés.',
    thumbnailUrl: null,
    category: 'MINIMAL',
    tier: 'FREE',
    sortOrder: 31,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#B0C4DE',
      accentColor: '#FFFFFF',
      fontDisplay: 'Montserrat',
      fontBody: 'Inter',
      layout: 'minimal',
    },
    luxuryPreset: {
      theme: 'midnight',
      effects: {
        starrySky: true,
        goldenDust: false,
        microSparkles: true,
        luminousHalos: false,
        globalBreathing: false,
        sectionAmbiance: false,
        scrollReflections: false,
      },
      intensity: 40,
      density: 30,
      speed: 25,
      haloCount: 2,
    },
    variants: [
      { code: 'A', name: 'Version A — Bleu nordique', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },

  // ═══ DESTINATION (sortOrder 40-42) ════════════════════════════════════════
  {
    slug: 'beach',
    name: 'Beach',
    description:
      'Évasion plage. Turquoise et sable, typographie Pacifico décontractée. Ambiance rose douce, brise marine pour célébrations en bord de mer.',
    thumbnailUrl: null,
    category: 'DESTINATION',
    tier: 'FREE',
    sortOrder: 40,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#4FC3F7',
      accentColor: '#F5E6D3',
      fontDisplay: 'Pacifico',
      fontBody: 'Lato',
      layout: 'destination',
    },
    luxuryPreset: {
      theme: 'rose',
      effects: {
        starrySky: false,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: false,
        globalBreathing: true,
        sectionAmbiance: true,
        scrollReflections: false,
      },
      intensity: 50,
      density: 40,
      speed: 45,
      haloCount: 2,
    },
    variants: [
      { code: 'A', name: 'Version A — Turquoise plage', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
  {
    slug: 'garden',
    name: 'Garden',
    description:
      'Jardin fleuri. Vert jardin et crème florale, inspiration botanique. Ambiance champagne naturelle, pétales virtuels pour célébrations en pleine nature.',
    thumbnailUrl: null,
    category: 'DESTINATION',
    tier: 'FREE',
    sortOrder: 41,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#558B2F',
      accentColor: '#FFF8E1',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Lato',
      layout: 'destination',
    },
    luxuryPreset: {
      theme: 'champagne',
      effects: {
        starrySky: false,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: false,
        globalBreathing: true,
        sectionAmbiance: true,
        scrollReflections: false,
      },
      intensity: 55,
      density: 50,
      speed: 35,
      haloCount: 3,
    },
    variants: [
      { code: 'A', name: 'Version A — Vert jardin', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
  {
    slug: 'sunset',
    name: 'Sunset',
    description:
      'Coucher de soleil. Orange et jaune doré, ambiance golden hour. Luxe rose vibrante, chaleur crépusculaire pour mariages en extérieur au coucher du soleil.',
    thumbnailUrl: null,
    category: 'DESTINATION',
    tier: 'PREMIUM',
    sortOrder: 42,
    penpotFileUrl: null,
    themeSeed: {
      primaryColor: '#FF6B6B',
      accentColor: '#FFD93D',
      fontDisplay: 'Playfair Display',
      fontBody: 'Montserrat',
      layout: 'destination',
    },
    luxuryPreset: {
      theme: 'rose',
      effects: {
        starrySky: false,
        goldenDust: true,
        microSparkles: true,
        luminousHalos: true,
        globalBreathing: true,
        sectionAmbiance: true,
        scrollReflections: true,
      },
      intensity: 75,
      density: 65,
      speed: 50,
      haloCount: 4,
    },
    variants: [
      { code: 'A', name: 'Version A — Golden hour', paletteOverride: null, penpotPageId: null, isDefault: true },
    ],
  },
] as const

/** Backward-compat export — Royal Gold is the first seed (Phase 1 reference). */
export const ROYAL_GOLD_SEED = COLLECTION_SEEDS[0]

/**
 * Idempotent seed: creates all catalog Collections that don't exist yet.
 * Called by GET /api/collections on first request — zero manual migration step.
 *
 * Phase 3: iterates COLLECTION_SEEDS (12 entries across 5 categories).
 * Existing Collections (e.g. Royal Gold from Phase 1) are skipped — their
 * data is NOT overwritten, preserving any manual edits.
 */
export async function ensureCollectionsSeeded(): Promise<void> {
  for (const seed of COLLECTION_SEEDS) {
    const existing = await db.collection.findUnique({
      where: { slug: seed.slug },
      select: { id: true },
    })

    if (existing) {
      // Phase 2 backfill: ensure the 34 module slots exist for Collections seeded
      // before Phase 2 (e.g. Royal Gold from Phase 1, 11 others from Phase 3).
      // Idempotent — only creates slots that are missing.
      const existingModuleCount = await db.collectionModule.count({
        where: { collectionId: existing.id },
      })
      if (existingModuleCount < MODULE_SLOTS.length) {
        const existingSlots = await db.collectionModule.findMany({
          where: { collectionId: existing.id },
          select: { pack: true, slot: true },
        })
        const existingKeys = new Set(existingSlots.map((m) => `${m.pack}|${m.slot}`))
        const missing = MODULE_SLOTS.filter(
          (s) => !existingKeys.has(`${s.pack}|${s.slot}`)
        )
        if (missing.length > 0) {
          await db.collectionModule.createMany({
            data: missing.map((s) => ({
              collectionId: existing.id,
              pack: s.pack,
              slot: s.slot,
              label: s.label,
              frameId: null,
              penpotPageId: null,
              guestTier: s.guestTier ?? null,
              sortOrder: s.sortOrder,
            })),
          })
        }
      }
      continue
    }

    const { fileId, pageId } = seed.penpotFileUrl
      ? parsePenpotUrl(seed.penpotFileUrl)
      : { fileId: null, pageId: null }

    await db.collection.create({
      data: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        thumbnailUrl: seed.thumbnailUrl,
        category: seed.category,
        tier: seed.tier,
        sortOrder: seed.sortOrder,
        isActive: true,
        isPublished: true,
        penpotFileUrl: seed.penpotFileUrl,
        penpotFileId: fileId,
        themeSeed: JSON.stringify(seed.themeSeed),
        luxuryPreset: seed.luxuryPreset ? JSON.stringify(seed.luxuryPreset) : null,
        variants: {
          create: seed.variants.map((v) => ({
            code: v.code,
            name: v.name,
            paletteOverride: v.paletteOverride ? JSON.stringify(v.paletteOverride) : null,
            penpotPageId: v.penpotPageId ?? pageId,
            isDefault: v.isDefault,
          })),
        },
        // Phase 2 — seed all 34 module slots (frameId null = unmapped, falls back to existing component)
        modules: {
          create: MODULE_SLOTS.map((s) => ({
            pack: s.pack,
            slot: s.slot,
            label: s.label,
            frameId: null,
            penpotPageId: null,
            guestTier: s.guestTier ?? null,
            sortOrder: s.sortOrder,
          })),
        },
      },
    })
  }
}

// ─── Read API (catalog) ──────────────────────────────────────────────────────

function toPublicCollection(row: {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnailUrl: string | null
  category: string
  tier: string
  sortOrder: number
  themeSeed: string
  luxuryPreset: string | null
  penpotFileUrl: string | null
  variants: Array<{
    id: string
    code: string
    name: string
    paletteOverride: string | null
    penpotPageId: string | null
    isDefault: boolean
  }>
}): CollectionPublic {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    thumbnailUrl: row.thumbnailUrl,
    category: row.category,
    tier: row.tier,
    sortOrder: row.sortOrder,
    themeSeed: JSON.parse(row.themeSeed) as ThemeSeed,
    luxuryPreset: row.luxuryPreset ? (JSON.parse(row.luxuryPreset) as LuxuryPreset) : null,
    penpotFileUrl: row.penpotFileUrl,
    variants: row.variants.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      paletteOverride: v.paletteOverride ? (JSON.parse(v.paletteOverride) as PaletteOverride) : null,
      penpotPageId: v.penpotPageId,
      isDefault: v.isDefault,
    })),
  }
}

/**
 * List all active + published Collections, filtered by the caller's billing plan.
 * Auto-seeds the catalog on first call (idempotent — creates missing Collections).
 */
export async function listCollections(billingPlan: Plan): Promise<CollectionPublic[]> {
  await ensureCollectionsSeeded()

  const rows = await db.collection.findMany({
    where: { isActive: true, isPublished: true },
    include: { variants: { orderBy: { code: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  })

  return rows
    .filter((c) => canAccessCollection(billingPlan, c.tier))
    .map(toPublicCollection)
}

/**
 * Get a single Collection by id (must be active + published + accessible by plan).
 */
export async function getCollection(
  id: string,
  billingPlan: Plan
): Promise<CollectionPublic | null> {
  await ensureCollectionsSeeded()

  const row = await db.collection.findUnique({
    where: { id },
    include: { variants: { orderBy: { code: 'asc' } } },
  })
  if (!row || !row.isActive || !row.isPublished) return null
  if (!canAccessCollection(billingPlan, row.tier)) return null
  return toPublicCollection(row)
}

// ─── Apply API (deploy a Collection on a wedding) ────────────────────────────

export interface ApplyResult {
  success: boolean
  theme: {
    primaryColor: string
    accentColor: string
    fontDisplay: string
    fontBody: string
    layout: string
  }
  collectionSlug: string
  variantCode: string
  alreadyApplied?: boolean
}

/**
 * Apply a Collection + Variant on a wedding.
 *
 * This ORCHESTRATES the existing Theme Engine (upsert Theme row with merged
 * themeSeed + variant.paletteOverride + couple paletteOverride) and stores the
 * luxury preset + Penpot file reference in Theme.customizations so ThemeInjector
 * can hydrate the LuxuryVisualEngine.
 *
 * Idempotent: re-applying the same Collection + Variant + palette is a no-op.
 */
export async function applyCollection(params: {
  weddingId: string
  collectionId: string
  variantId?: string | null
  paletteOverride?: PaletteOverride | null
  billingPlan: Plan
}): Promise<ApplyResult> {
  const { weddingId, collectionId, paletteOverride, billingPlan } = params

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: { variants: { orderBy: { code: 'asc' } } },
  })
  if (!collection || !collection.isActive || !collection.isPublished) {
    throw new ApplyError('Collection introuvable ou non publiée', 404)
  }
  if (!canAccessCollection(billingPlan, collection.tier)) {
    throw new ApplyError('Votre plan ne permet pas d\'accéder à cette Collection', 403)
  }

  // Resolve variant (default variant if not specified)
  const variant = params.variantId
    ? collection.variants.find((v) => v.id === params.variantId)
    : collection.variants.find((v) => v.isDefault) ?? collection.variants[0]
  if (!variant) {
    throw new ApplyError('Aucune variante disponible pour cette Collection', 400)
  }

  // Merge theme: Collection.themeSeed > Variant.paletteOverride > Couple.paletteOverride
  const baseSeed = JSON.parse(collection.themeSeed) as ThemeSeed
  const variantOverride: PaletteOverride | null = variant.paletteOverride
    ? JSON.parse(variant.paletteOverride)
    : null
  const finalTheme: ThemeSeed = {
    ...baseSeed,
    ...(variantOverride ?? {}),
    ...(paletteOverride ?? {}),
  }

  // Build customizations blob (additive — preserves existing penpot integration
  // shape, adds luxury + collectionMeta keys)
  const luxuryPreset = collection.luxuryPreset
    ? (JSON.parse(collection.luxuryPreset) as LuxuryPreset)
    : null

  // Fetch existing customizations to merge (don't clobber a manually-pushed
  // Penpot token set from PenpotStudio)
  const existingTheme = await db.theme.findUnique({
    where: { weddingId },
    select: { customizations: true },
  })
  let existingCustomizations: Record<string, unknown> = {}
  if (existingTheme?.customizations) {
    try {
      existingCustomizations = JSON.parse(existingTheme.customizations) as Record<string, unknown>
    } catch {
      existingCustomizations = {}
    }
  }

  // Merge: keep existing penpot.tokens if present (couple may have pushed from Studio),
  // but update the file reference to the Collection's master file.
  const penpotIntegration = {
    ...(typeof existingCustomizations.penpot === 'object' && existingCustomizations.penpot
      ? (existingCustomizations.penpot as Record<string, unknown>)
      : {}),
    fileUrl: collection.penpotFileUrl ?? existingCustomizations.penpot?.fileUrl ?? null,
    fileId: collection.penpotFileId ?? existingCustomizations.penpot?.fileId ?? null,
    pageId: variant.penpotPageId ?? existingCustomizations.penpot?.pageId ?? null,
    tokens: themeToPenpotTokens(finalTheme),
    lastSyncedAt: new Date().toISOString(),
  }

  const customizations = {
    ...existingCustomizations,
    penpot: penpotIntegration,
    luxury: luxuryPreset,
    collectionMeta: {
      collectionId: collection.id,
      collectionSlug: collection.slug,
      collectionName: collection.name,
      variantId: variant.id,
      variantCode: variant.code,
      appliedAt: new Date().toISOString(),
    },
  }

  // Idempotency check: if the wedding already has this exact Collection + Variant
  // + no couple override, and the theme already matches, it's a no-op.
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { collectionId: true, variantId: true },
  })
  const currentTheme = await db.theme.findUnique({
    where: { weddingId },
    select: { primaryColor: true, accentColor: true, fontDisplay: true, fontBody: true, layout: true },
  })
  const sameTarget =
    wedding?.collectionId === collection.id &&
    wedding?.variantId === variant.id &&
    !paletteOverride
  const sameTheme =
    currentTheme &&
    currentTheme.primaryColor === finalTheme.primaryColor &&
    currentTheme.accentColor === finalTheme.accentColor &&
    currentTheme.fontDisplay === finalTheme.fontDisplay &&
    currentTheme.fontBody === finalTheme.fontBody &&
    currentTheme.layout === finalTheme.layout
  if (sameTarget && sameTheme) {
    return {
      success: true,
      theme: finalTheme,
      collectionSlug: collection.slug,
      variantCode: variant.code,
      alreadyApplied: true,
    }
  }

  // Upsert Theme row (1:1 with Wedding — unchanged cardinality)
  await db.theme.upsert({
    where: { weddingId },
    update: {
      primaryColor: finalTheme.primaryColor,
      accentColor: finalTheme.accentColor,
      fontDisplay: finalTheme.fontDisplay,
      fontBody: finalTheme.fontBody,
      layout: finalTheme.layout,
      customizations: JSON.stringify(customizations),
    },
    create: {
      weddingId,
      primaryColor: finalTheme.primaryColor,
      accentColor: finalTheme.accentColor,
      fontDisplay: finalTheme.fontDisplay,
      fontBody: finalTheme.fontBody,
      layout: finalTheme.layout,
      customizations: JSON.stringify(customizations),
    },
  })

  // Link the wedding to the Collection + Variant
  await db.wedding.update({
    where: { id: weddingId },
    data: { collectionId: collection.id, variantId: variant.id },
  })

  // Audit log (existing AuditLog model — unchanged)
  await db.auditLog.create({
    data: {
      weddingId,
      action: 'APPLY_COLLECTION',
      details: `Collection "${collection.slug}" variant "${variant.code}" applied`,
    },
  })

  return {
    success: true,
    theme: finalTheme,
    collectionSlug: collection.slug,
    variantCode: variant.code,
  }
}

// ─── Error helper ────────────────────────────────────────────────────────────

export class ApplyError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    this.name = 'ApplyError'
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2 — Module Slots API
// ══════════════════════════════════════════════════════════════════════════════

function toPublicModule(row: {
  id: string
  pack: string
  slot: string
  label: string
  frameId: string | null
  penpotPageId: string | null
  guestTier: string | null
  sortOrder: number
}): CollectionModulePublic {
  return {
    id: row.id,
    pack: row.pack as ModulePack,
    slot: row.slot,
    label: row.label,
    frameId: row.frameId,
    penpotPageId: row.penpotPageId,
    guestTier: row.guestTier,
    sortOrder: row.sortOrder,
  }
}

/**
 * List all module slots for a Collection, grouped by pack.
 * Auto-seeds missing slots if needed (defensive — ensureCollectionsSeeded should
 * have already done this, but this guards against manually-created Collections).
 */
export async function listModules(
  collectionId: string
): Promise<CollectionModulePublic[]> {
  await ensureCollectionsSeeded()

  const rows = await db.collectionModule.findMany({
    where: { collectionId },
    orderBy: { sortOrder: 'asc' },
  })
  return rows.map(toPublicModule)
}

/**
 * Update the Penpot frameId mapping for a single module slot.
 * Used by the CollectionModulesManager admin UI to let designers/admins map
 * Penpot frames to module slots.
 *
 * Setting frameId to null "unmaps" the slot — the renderer falls back to the
 * existing component (zero regression).
 */
export async function updateModule(params: {
  collectionId: string
  pack: ModulePack
  slot: string
  frameId: string | null
  penpotPageId?: string | null
}): Promise<CollectionModulePublic> {
  const { collectionId, pack, slot, frameId } = params

  // Validate the slot exists in the canonical MODULE_SLOTS registry
  const canonical = MODULE_SLOTS.find(
    (s) => s.pack === pack && s.slot === slot
  )
  if (!canonical) {
    throw new ApplyError(
      `Slot "${slot}" in pack "${pack}" n'existe pas dans le registre des modules`,
      400
    )
  }

  // Verify the Collection exists
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  })
  if (!collection) {
    throw new ApplyError('Collection introuvable', 404)
  }

  const updated = await db.collectionModule.update({
    where: {
      collectionId_pack_slot: { collectionId, pack, slot },
    },
    data: {
      frameId: frameId && frameId.trim() !== '' ? frameId.trim() : null,
      penpotPageId: params.penpotPageId ?? null,
    },
  })

  // Audit log
  await db.auditLog.create({
    data: {
      weddingId: null,
      action: 'UPDATE_COLLECTION_MODULE',
      details: `Module ${pack}/${slot} → frameId=${frameId || '(unmapped)'}`,
    },
  })

  return toPublicModule(updated)
}

/**
 * Completeness validation per §4.8 of the spec.
 * A Collection is "complete" when all 34 module slots have a frameId mapped.
 *
 * Returns a detailed report: total/filled/missing counts, per-pack breakdown,
 * and the list of missing slots (for the admin UI to highlight).
 *
 * Note: Pack 5 (LUXURY) is data-only and validated separately via the
 * Collection.luxuryPreset field — not included in this report's `total`.
 */
export async function validateCompleteness(
  collectionId: string
): Promise<CompletenessReport> {
  await ensureCollectionsSeeded()

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, slug: true, name: true },
  })
  if (!collection) {
    throw new ApplyError('Collection introuvable', 404)
  }

  const modules = await db.collectionModule.findMany({
    where: { collectionId },
    orderBy: { sortOrder: 'asc' },
  })

  // Build per-pack breakdown
  const packs: ModulePack[] = ['WEBSITE', 'INVITATIONS', 'PRINT', 'COMMUNICATION']
  const byPack = {} as CompletenessReport['byPack']
  const missingSlots: CompletenessReport['missingSlots'] = []

  for (const pack of packs) {
    const packModules = modules.filter((m) => m.pack === pack)
    const filled = packModules.filter((m) => m.frameId !== null && m.frameId !== '')
    const missing = packModules.filter((m) => !m.frameId || m.frameId === '')
    byPack[pack] = {
      total: packModules.length,
      filled: filled.length,
      missing: missing.length,
      complete: missing.length === 0 && packModules.length > 0,
    }
    for (const m of missing) {
      missingSlots.push({ pack: m.pack as ModulePack, slot: m.slot, label: m.label })
    }
  }

  const total = modules.length
  const filled = modules.filter((m) => m.frameId !== null && m.frameId !== '').length

  return {
    collectionId: collection.id,
    collectionSlug: collection.slug,
    collectionName: collection.name,
    total,
    filled,
    missing: total - filled,
    complete: total > 0 && filled === total,
    byPack,
    missingSlots,
  }
}
