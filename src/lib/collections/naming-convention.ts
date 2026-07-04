// ══════════════════════════════════════════════════════════════════════════════
// PENPOT NAMING CONVENTION — the contract between the designer and Wedding OS
// ══════════════════════════════════════════════════════════════════════════════
//
// The designer works entirely in Penpot. Wedding OS NEVER creates designs.
// Wedding OS auto-detects frames by their NAMES, following this convention:
//
//   {COLLECTION}/{PACK}/{MODULE}/{VARIANT}
//
// Examples:
//   RG/Website/Hero/A          → Royal Gold, Website pack, Hero module, Variant A
//   RG/Website/Hero/B          → Royal Gold, Website pack, Hero module, Variant B
//   RG/Invitations/Standard/A  → Royal Gold, Invitations pack, Standard module, Variant A
//   RG/Print/Badge/A           → Royal Gold, Print pack, Badge module, Variant A
//
// The designer also organizes Penpot PAGES — one page per pack is recommended:
//   Page "Website"     → contains all RG/Website/* frames
//   Page "Invitations" → contains all RG/Invitations/* frames
//   etc.
//
// This module is the single source of truth for the convention. The builder,
// the validator, the catalog seed, and the Designer Portal UI all import from here.

import type { ModuleId, PackId, VariantId } from './types'

// ─── Collection short codes (the first segment of the frame name) ─────────────
// The designer MUST use these exact codes as the first path segment.
export const COLLECTION_CODES: Record<string, string> = {
  'royal-gold': 'RG',
  'royal-black': 'RB',
  'white-romance': 'WR',
  'kente-prestige': 'KP',
  'beach-luxury': 'BL',
}

export function getCollectionCode(collectionId: string): string {
  return COLLECTION_CODES[collectionId] || collectionId.slice(0, 2).toUpperCase()
}

// ─── Pack name tokens (the second segment) ────────────────────────────────────
export const PACK_TOKENS: Record<PackId, string> = {
  website: 'Website',
  invitations: 'Invitations',
  print: 'Print',
  communication: 'Communication',
  luxury: 'Luxury',
}

// Reverse lookup: token → packId
export const TOKEN_TO_PACK: Record<string, PackId> = Object.entries(PACK_TOKENS).reduce(
  (acc, [packId, token]) => {
    acc[token.toLowerCase()] = packId as PackId
    return acc
  },
  {} as Record<string, PackId>,
)

// ─── Module name tokens (the third segment) — per pack ────────────────────────
export const MODULE_TOKENS: Record<PackId, Record<string, ModuleId>> = {
  website: {
    Hero: 'hero', Countdown: 'countdown', Story: 'story', Gallery: 'gallery',
    Programme: 'programme', RSVP: 'rsvp', Footer: 'footer', Loader: 'loader', Splash: 'splash',
  },
  invitations: {
    Standard: 'standard', VIP: 'vip', Famille: 'famille', Couple: 'couple',
    Sponsor: 'sponsor', Presse: 'presse', Numerique: 'numerique', Impression: 'impression',
  },
  print: {
    Badge: 'badge', QR: 'qr', Parking: 'parking', 'Table-Number': 'table-number',
    'Place-Card': 'place-card', Menu: 'menu', Gift: 'gift', Remerciement: 'remerciement',
  },
  communication: {
    Facebook: 'facebook', Instagram: 'instagram', Story: 'story', Email: 'email',
    Banner: 'banner', Affiche: 'affiche', Rollup: 'rollup', WhatsApp: 'whatsapp',
  },
  luxury: {
    Animations: 'animations', Transitions: 'transitions', Palette: 'palette',
    Typography: 'typography', Effects: 'effects',
  },
}

// ─── Build the expected frame name for a (collection, pack, module, variant) ──
export function buildFrameName(
  collectionId: string,
  pack: PackId,
  module: ModuleId,
  variant: VariantId,
): string {
  const code = getCollectionCode(collectionId)
  const packToken = PACK_TOKENS[pack]
  const moduleToken = findModuleToken(pack, module)
  return `${code}/${packToken}/${moduleToken}/${variant}`
}

// Reverse: find the module token for a given (pack, moduleId)
function findModuleToken(pack: PackId, moduleId: ModuleId): string {
  const tokens = MODULE_TOKENS[pack]
  const entry = Object.entries(tokens).find(([, id]) => id === moduleId)
  return entry?.[0] || String(moduleId)
}

// ─── Parse a frame name back into (pack, module, variant) ─────────────────────
// Returns null if the name doesn't match the convention.
export interface ParsedFrameName {
  collectionCode: string
  pack: PackId
  module: ModuleId
  variant: VariantId
}

export function parseFrameName(frameName: string): ParsedFrameName | null {
  // Strip leading/trailing whitespace and any Penpot auto-suffix (e.g. " copy 3")
  const clean = frameName.trim().replace(/\s+copy.*$/i, '')
  // Split by "/" — expects exactly 4 segments
  const parts = clean.split('/')
  if (parts.length !== 4) return null
  const [code, packToken, moduleToken, variantToken] = parts
  const pack = TOKEN_TO_PACK[packToken.toLowerCase()]
  if (!pack) return null
  const moduleTokens = MODULE_TOKENS[pack]
  const moduleId = moduleTokens[moduleToken]
  if (!moduleId) return null
  const variant = (['A', 'B', 'C', 'D'] as const).find((v) => v === variantToken.toUpperCase())
  if (!variant) return null
  return { collectionCode: code, pack, module: moduleId, variant }
}

// ─── The complete frame registry (expected frames) for a Collection ───────────
// Given a Collection's module/variant structure, returns the list of every
// frame name the designer MUST create in Penpot for the Collection to be complete.
export interface ExpectedFrame {
  pack: PackId
  module: ModuleId
  variant: VariantId
  expectedFrameName: string
  required: boolean
}

export function buildExpectedFrames(
  collectionId: string,
  packs: { id: PackId; modules: { id: ModuleId; required: boolean; variants: { id: VariantId }[] }[] }[],
): ExpectedFrame[] {
  const out: ExpectedFrame[] = []
  for (const pack of packs) {
    for (const mod of pack.modules) {
      for (const v of mod.variants) {
        out.push({
          pack: pack.id,
          module: mod.id,
          variant: v.id,
          expectedFrameName: buildFrameName(collectionId, pack.id, mod.id, v.id),
          required: mod.required,
        })
      }
    }
  }
  return out
}
