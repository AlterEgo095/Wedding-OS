// ════════════════════════════════════════════════════════════════════════════
// Penpot Frame Name Registry — Phase 5 (Penpot Collection Builder)
// ════════════════════════════════════════════════════════════════════════════
// Mirrors COLLECTION_PRODUCT_SPEC.md §2.3 — Convention de nommage des frames.
//
// The designer names Penpot frames according to a strict convention. Wedding OS
// scans the Penpot file and matches each frame to a MODULE_SLOTS key.
//
// Matching rules (per spec):
// - Case-insensitive
// - Accepts listed aliases (e.g. `hero` OR `website-hero`)
// - Accepts a variant prefix (e.g. `A/hero`, `B/hero`) for designers who prefer
//   1 page + prefixes instead of 4 separate pages per variant
// - If a slot is not found → Collection cannot be published (validation gate)
// - Designer can manually override an auto-detected mapping (rare edge case)
//
// This module is PURE — no DB, no network. It is unit-testable in isolation.
// ════════════════════════════════════════════════════════════════════════════

import type { ModulePack } from '@/lib/collections'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A canonical frame-name entry in the registry.
 * `names` is the list of accepted spellings (lowercase, hyphenated).
 * The first entry is the canonical form (used for display + re-export).
 */
export interface FrameNameEntry {
  pack: ModulePack
  slot: string
  names: readonly string[]
}

/**
 * Result of matching a single Penpot frame against the registry.
 */
export interface FrameMatchResult {
  /** True if a unique slot was matched. */
  matched: boolean
  /** The matched (pack, slot) when matched=true. */
  pack?: ModulePack
  slot?: string
  /** Canonical name (first alias) of the matched slot. */
  canonicalName?: string
  /** Variant prefix if present (e.g. `A`, `B` for `A/hero`). Null if no prefix. */
  variant?: string | null
  /** Reason for non-match (for diagnostics). */
  reason?: 'no_match' | 'ambiguous'
  /** When ambiguous=true, list of candidate (pack, slot) that the name could mean. */
  candidates?: ReadonlyArray<{ pack: ModulePack; slot: string }>
}

// ─── Registry (spec §2.3) ────────────────────────────────────────────────────

export const FRAME_NAME_REGISTRY: ReadonlyArray<FrameNameEntry> = [
  // Pack 1 — WEBSITE (10 slots)
  { pack: 'WEBSITE', slot: 'hero', names: ['hero', 'website-hero'] },
  { pack: 'WEBSITE', slot: 'countdown', names: ['countdown'] },
  { pack: 'WEBSITE', slot: 'story', names: ['story', 'notre-histoire'] },
  { pack: 'WEBSITE', slot: 'gallery', names: ['gallery', 'galerie'] },
  { pack: 'WEBSITE', slot: 'programme', names: ['programme'] },
  { pack: 'WEBSITE', slot: 'rsvp', names: ['rsvp'] },
  { pack: 'WEBSITE', slot: 'footer', names: ['footer'] },
  { pack: 'WEBSITE', slot: 'loader', names: ['loader'] },
  { pack: 'WEBSITE', slot: 'splash', names: ['splash'] },
  { pack: 'WEBSITE', slot: 'systemPages', names: ['system-pages', '404'] },

  // Pack 2 — INVITATIONS (8 slots)
  { pack: 'INVITATIONS', slot: 'standard', names: ['invitation-standard'] },
  { pack: 'INVITATIONS', slot: 'vip', names: ['invitation-vip'] },
  { pack: 'INVITATIONS', slot: 'famille', names: ['invitation-famille'] },
  { pack: 'INVITATIONS', slot: 'couple', names: ['invitation-couple'] },
  { pack: 'INVITATIONS', slot: 'presse', names: ['invitation-presse'] },
  { pack: 'INVITATIONS', slot: 'sponsor', names: ['invitation-sponsor'] },
  { pack: 'INVITATIONS', slot: 'numerique', names: ['invitation-numerique'] },
  { pack: 'INVITATIONS', slot: 'impression', names: ['invitation-impression'] },

  // Pack 3 — PRINT (8 slots)
  { pack: 'PRINT', slot: 'badge', names: ['badge'] },
  { pack: 'PRINT', slot: 'qr', names: ['qr-card', 'qr'] },
  { pack: 'PRINT', slot: 'parking', names: ['parking', 'carte-parking'] },
  { pack: 'PRINT', slot: 'floorPlan', names: ['floor-plan', 'plan-salle'] },
  { pack: 'PRINT', slot: 'tableNumber', names: ['table-number', 'numero-table'] },
  { pack: 'PRINT', slot: 'placeCard', names: ['place-card', 'marque-place'] },
  { pack: 'PRINT', slot: 'remerciement', names: ['remerciement'] },
  { pack: 'PRINT', slot: 'livreOr', names: ['livre-or'] },

  // Pack 4 — COMMUNICATION (8 slots)
  { pack: 'COMMUNICATION', slot: 'whatsapp', names: ['whatsapp'] },
  { pack: 'COMMUNICATION', slot: 'facebook', names: ['facebook'] },
  { pack: 'COMMUNICATION', slot: 'instagram', names: ['instagram'] },
  { pack: 'COMMUNICATION', slot: 'story', names: ['story-comm', 'story-social'] },
  { pack: 'COMMUNICATION', slot: 'email', names: ['email'] },
  { pack: 'COMMUNICATION', slot: 'banner', names: ['banner', 'banniere'] },
  { pack: 'COMMUNICATION', slot: 'affiche', names: ['affiche', 'poster'] },
  { pack: 'COMMUNICATION', slot: 'rollup', names: ['roll-up', 'rollup'] },
] as const

/**
 * Build a fast lookup map: lowercased-name → FrameNameEntry.
 * Used by matchFrameName() for O(1) resolution.
 */
const NAME_INDEX: ReadonlyMap<string, FrameNameEntry> = (() => {
  const m = new Map<string, FrameNameEntry>()
  for (const entry of FRAME_NAME_REGISTRY) {
    for (const n of entry.names) m.set(n.toLowerCase(), entry)
  }
  return m
})()

// ─── Public helpers ──────────────────────────────────────────────────────────

/**
 * Strip a variant prefix from a Penpot frame name.
 * Spec §2.3: designers may use `A/hero`, `B/hero` etc. to distinguish variants
 * on a single page (instead of 4 separate pages per variant).
 *
 * Returns `{ variant, base }` where `variant` is null when no prefix present.
 *
 * Examples:
 *   `A/hero`           → { variant: 'A', base: 'hero' }
 *   `B/invitation-vip` → { variant: 'B', base: 'invitation-vip' }
 *   `hero`             → { variant: null, base: 'hero' }
 *   `a/hero/b`         → { variant: 'A', base: 'hero/b' }  (only first segment)
 */
export function stripVariantPrefix(frameName: string): {
  variant: string | null
  base: string
} {
  const trimmed = frameName.trim()
  // Only treat as variant prefix if the part before '/' is 1-3 chars
  // (avoids false positives on paths like `page/section/hero`).
  const slashIdx = trimmed.indexOf('/')
  if (slashIdx <= 0 || slashIdx > 3) return { variant: null, base: trimmed }
  const prefix = trimmed.slice(0, slashIdx)
  // Variant prefix must be alphanumeric (A, B, V1, V2, etc.)
  if (!/^[A-Za-z0-9]+$/.test(prefix)) return { variant: null, base: trimmed }
  return {
    variant: prefix.toUpperCase(),
    base: trimmed.slice(slashIdx + 1),
  }
}

/**
 * Match a single Penpot frame name against the registry.
 *
 * Algorithm:
 * 1. Strip variant prefix (e.g. `A/hero` → variant=A, base=`hero`)
 * 2. Lowercase + trim the base name
 * 3. Direct lookup in NAME_INDEX
 * 4. If no direct match, try fuzzy match (collapse spaces, hyphens vs underscores)
 * 5. If multiple slots match the same name → ambiguous (rare; only happens if
 *    the registry itself is broken — defensive guard)
 *
 * @example matchFrameName('hero')                // → { matched: true, pack: 'WEBSITE', slot: 'hero', canonicalName: 'hero' }
 * @example matchFrameName('A/invitation-vip')    // → { matched: true, pack: 'INVITATIONS', slot: 'vip', variant: 'A', canonicalName: 'invitation-vip' }
 * @example matchFrameName('Galerie')             // → { matched: true, pack: 'WEBSITE', slot: 'gallery' } (case-insensitive)
 * @example matchFrameName('unknown-frame')       // → { matched: false, reason: 'no_match' }
 */
export function matchFrameName(frameName: string): FrameMatchResult {
  if (!frameName || typeof frameName !== 'string') {
    return { matched: false, reason: 'no_match' }
  }

  const { variant, base } = stripVariantPrefix(frameName)
  const normalized = base.trim().toLowerCase()

  if (!normalized) return { matched: false, reason: 'no_match' }

  // 1. Direct match
  const direct = NAME_INDEX.get(normalized)
  if (direct) {
    return {
      matched: true,
      pack: direct.pack,
      slot: direct.slot,
      canonicalName: direct.names[0],
      variant,
    }
  }

  // 2. Fuzzy: replace underscores/spaces with hyphens
  const hyphenated = normalized.replace(/[\s_]+/g, '-')
  if (hyphenated !== normalized) {
    const fuzzy = NAME_INDEX.get(hyphenated)
    if (fuzzy) {
      return {
        matched: true,
        pack: fuzzy.pack,
        slot: fuzzy.slot,
        canonicalName: fuzzy.names[0],
        variant,
      }
    }
  }

  // 3. Fuzzy: strip hyphens entirely (e.g. `floorplan` → `floor-plan`)
  const collapsed = normalized.replace(/[-\s_]+/g, '')
  for (const entry of FRAME_NAME_REGISTRY) {
    for (const n of entry.names) {
      if (n.replace(/[-\s_]+/g, '') === collapsed) {
        return {
          matched: true,
          pack: entry.pack,
          slot: entry.slot,
          canonicalName: entry.names[0],
          variant,
        }
      }
    }
  }

  // 4. Defensive: detect ambiguity (only triggers if the registry has duplicate
  //    names — which would be a bug). We list candidates so callers can log.
  const candidates: Array<{ pack: ModulePack; slot: string }> = []
  for (const entry of FRAME_NAME_REGISTRY) {
    if (entry.names.some((n) => n.toLowerCase() === normalized)) {
      candidates.push({ pack: entry.pack, slot: entry.slot })
    }
  }
  if (candidates.length > 1) {
    return { matched: false, reason: 'ambiguous', candidates }
  }

  return { matched: false, reason: 'no_match' }
}

/**
 * Get the canonical frame name for a (pack, slot) pair.
 * Returns null if the (pack, slot) is not in the registry.
 *
 * @example canonicalFrameName('WEBSITE', 'hero') // → 'hero'
 * @example canonicalFrameName('COMMUNICATION', 'rollup') // → 'roll-up'
 */
export function canonicalFrameName(
  pack: ModulePack,
  slot: string,
): string | null {
  const entry = FRAME_NAME_REGISTRY.find(
    (e) => e.pack === pack && e.slot === slot,
  )
  return entry ? entry.names[0] : null
}

/**
 * List all accepted names for a (pack, slot) pair (for documentation / UI hints).
 */
export function acceptedFrameNames(
  pack: ModulePack,
  slot: string,
): readonly string[] {
  const entry = FRAME_NAME_REGISTRY.find(
    (e) => e.pack === pack && e.slot === slot,
  )
  return entry ? entry.names : []
}

/**
 * Returns the total number of canonical slots in the registry (= 34).
 */
export function totalRegistrySlots(): number {
  return FRAME_NAME_REGISTRY.length
}
