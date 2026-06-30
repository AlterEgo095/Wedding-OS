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

// ─── Royal Gold seed (the first commercial Collection Product) ────────────────

export const ROYAL_GOLD_SEED = {
  slug: 'royal-gold',
  name: 'Royal Gold',
  description:
    'Collection signature de la division Luxury. Or royal, noir nuit, typographie Cormorant Garamond. Ambiance cinematic avec poussière dorée, halos lumineux et respiration globale.',
  thumbnailUrl: null,
  category: 'LUXURY',
  tier: 'FREE', // Phase 1: accessible à tous les plans pour validation
  sortOrder: 0,
  penpotFileUrl: null, // Designer liera le file Penpot via le Studio (Phase 2)
  themeSeed: {
    primaryColor: '#D4AF37', // or royal
    accentColor: '#1a1a2e', // noir nuit
    fontDisplay: 'Cormorant Garamond',
    fontBody: 'Inter',
    layout: 'royal',
  } satisfies ThemeSeed,
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
  } satisfies LuxuryPreset,
  variants: [
    {
      code: 'A',
      name: 'Version A — Or classique',
      paletteOverride: null,
      penpotPageId: null,
      isDefault: true,
    },
  ],
} as const

/**
 * Idempotent seed: creates the Royal Gold Collection if it doesn't exist yet.
 * Called by GET /api/collections on first request — zero manual migration step.
 */
export async function ensureRoyalGoldSeeded(): Promise<void> {
  const existing = await db.collection.findUnique({
    where: { slug: ROYAL_GOLD_SEED.slug },
    select: { id: true },
  })
  if (existing) return

  const { fileId, pageId } = ROYAL_GOLD_SEED.penpotFileUrl
    ? parsePenpotUrl(ROYAL_GOLD_SEED.penpotFileUrl)
    : { fileId: null, pageId: null }

  await db.collection.create({
    data: {
      slug: ROYAL_GOLD_SEED.slug,
      name: ROYAL_GOLD_SEED.name,
      description: ROYAL_GOLD_SEED.description,
      thumbnailUrl: ROYAL_GOLD_SEED.thumbnailUrl,
      category: ROYAL_GOLD_SEED.category,
      tier: ROYAL_GOLD_SEED.tier,
      sortOrder: ROYAL_GOLD_SEED.sortOrder,
      isActive: true,
      isPublished: true,
      penpotFileUrl: ROYAL_GOLD_SEED.penpotFileUrl,
      penpotFileId: fileId,
      themeSeed: JSON.stringify(ROYAL_GOLD_SEED.themeSeed),
      luxuryPreset: JSON.stringify(ROYAL_GOLD_SEED.luxuryPreset),
      variants: {
        create: ROYAL_GOLD_SEED.variants.map((v) => ({
          code: v.code,
          name: v.name,
          paletteOverride: v.paletteOverride ? JSON.stringify(v.paletteOverride) : null,
          penpotPageId: v.penpotPageId ?? pageId,
          isDefault: v.isDefault,
        })),
      },
    },
  })
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
 * Auto-seeds Royal Gold on first call (idempotent).
 */
export async function listCollections(billingPlan: Plan): Promise<CollectionPublic[]> {
  await ensureRoyalGoldSeeded()

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
  await ensureRoyalGoldSeeded()

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
