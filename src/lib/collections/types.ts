// ══════════════════════════════════════════════════════════════════════════════
// PREMIUM COLLECTION FACTORY — Phase 6
// ══════════════════════════════════════════════════════════════════════════════
//
// A Collection is a complete, ready-to-deploy wedding design system.
// Each Collection contains 5 packs (Website / Invitations / Print / Communication / Luxury).
// Each pack contains modules. Each module has one or more design variants (A/B/C/D).
//
// The commercial flow:
//   Royal Collection → Royal Gold → Version C → Import photos → Enter names → Deploy
//
// Designs are REAL React components (not Penpot frame references), so they are
// immediately operational and visually verifiable.

export type PackId = 'website' | 'invitations' | 'print' | 'communication' | 'luxury'

export type CollectionCategory =
  | 'LUXURY'
  | 'ROYAL'
  | 'ROMANTIC'
  | 'CULTURAL'
  | 'BEACH'

export type CollectionTier = 'PREMIUM' | 'EXCLUSIVE'

export type VariantId = 'A' | 'B' | 'C' | 'D'

// ─── Module Types (per pack) ──────────────────────────────────────────────────

export type WebsiteModuleId =
  | 'hero'
  | 'countdown'
  | 'story'
  | 'gallery'
  | 'programme'
  | 'rsvp'
  | 'footer'
  | 'loader'
  | 'splash'

export type InvitationModuleId =
  | 'standard'
  | 'vip'
  | 'famille'
  | 'couple'
  | 'sponsor'
  | 'presse'
  | 'numerique'
  | 'impression'

export type PrintModuleId =
  | 'badge'
  | 'qr'
  | 'parking'
  | 'table-number'
  | 'place-card'
  | 'menu'
  | 'gift'
  | 'remerciement'

export type CommunicationModuleId =
  | 'facebook'
  | 'instagram'
  | 'story'
  | 'email'
  | 'banner'
  | 'affiche'
  | 'rollup'
  | 'whatsapp'

export type LuxuryModuleId =
  | 'animations'
  | 'transitions'
  | 'palette'
  | 'typography'
  | 'effects'

export type ModuleId =
  | WebsiteModuleId
  | InvitationModuleId
  | PrintModuleId
  | CommunicationModuleId
  | LuxuryModuleId

// ─── Design System (colors + fonts shared across a Collection) ────────────────

export interface DesignSystem {
  primary: string       // main accent (gold, black, rose...)
  secondary: string     // supporting accent
  background: string    // dominant background
  surface: string       // card / panel background
  text: string          // primary text
  textMuted: string     // secondary text
  fontDisplay: string   // headings font family
  fontBody: string      // body font family
  decorative?: 'gold-foil' | 'silver-foil' | 'floral' | 'geometric' | 'african' | 'coastal'
}

// ─── Variant (a concrete design for a module) ─────────────────────────────────

export interface DesignVariant {
  id: VariantId
  name: string              // "Version A — Or Royal"
  description: string
  // The renderer key — maps to a real React component in src/components/collections/designs/
  renderer: string
  quality: number           // 0-100 production-readiness score
  tags: string[]            // e.g. ['cinematic', 'centered', 'overlay']
}

// ─── Module (a slot in a pack, with one or more variants) ─────────────────────

export interface CollectionModule {
  id: ModuleId
  name: string              // "Hero", "Invitation Standard", "Badge"...
  description: string
  pack: PackId
  required: boolean         // mandatory for a valid collection
  variants: DesignVariant[]
}

// ─── Pack (a group of modules) ────────────────────────────────────────────────

export interface CollectionPack {
  id: PackId
  name: string              // "Website", "Invitations", "Print"...
  description: string
  icon: string              // lucide icon name
  modules: CollectionModule[]
}

// ─── Collection (the top-level product) ───────────────────────────────────────

export interface PremiumCollection {
  id: string                // 'royal-gold'
  name: string              // 'Royal Gold'
  family: string            // 'Royal Collection'
  category: CollectionCategory
  tier: CollectionTier
  tagline: string
  description: string
  designSystem: DesignSystem
  coverImage: string        // AI-generated cover
  accentImage?: string      // optional secondary image
  completionPct: number     // 0-100 — how production-ready
  version: string           // '1.0.0'
  designer: string          // 'Studio Heureux Mariage'
  publishedAt: string       // ISO date
  packs: CollectionPack[]
  priceFcfa: number
  priceUsd: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function countModules(c: PremiumCollection): number {
  return c.packs.reduce((sum, p) => sum + p.modules.length, 0)
}

export function countVariants(c: PremiumCollection): number {
  return c.packs.reduce(
    (sum, p) => sum + p.modules.reduce((s, m) => s + m.variants.length, 0),
    0,
  )
}

export function getPack(c: PremiumCollection, packId: PackId): CollectionPack | undefined {
  return c.packs.find((p) => p.id === packId)
}

export function getModule(
  c: PremiumCollection,
  packId: PackId,
  moduleId: ModuleId,
): CollectionModule | undefined {
  return getPack(c, packId)?.modules.find((m) => m.id === moduleId)
}

export function getVariant(
  c: PremiumCollection,
  packId: PackId,
  moduleId: ModuleId,
  variantId: VariantId,
): DesignVariant | undefined {
  return getModule(c, packId, moduleId)?.variants.find((v) => v.id === variantId)
}

export function computeQualityScore(c: PremiumCollection): number {
  const totalModules = countModules(c)
  if (totalModules === 0) return 0
  const requiredOk = c.packs.reduce(
    (s, p) => s + p.modules.filter((m) => m.required && m.variants.length > 0).length,
    0,
  )
  const requiredTotal = c.packs.reduce(
    (s, p) => s + p.modules.filter((m) => m.required).length,
    0,
  )
  const variantDensity =
    countVariants(c) / Math.max(totalModules, 1) // average variants per module
  const requiredScore = (requiredOk / Math.max(requiredTotal, 1)) * 70
  const densityScore = Math.min(variantDensity / 2, 1) * 30 // 2 variants avg = full marks
  return Math.round(requiredScore + densityScore)
}
