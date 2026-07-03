// ════════════════════════════════════════════════════════════════════════════
// Collection Quality Score — Phase 5 (Penpot Collection Builder)
// ════════════════════════════════════════════════════════════════════════════
// Computes a 0-100 quality score for a Collection, per COLLECTION_PRODUCT_SPEC
// §4.8 (Validation de complétude) + Phase 5 mission:
//
//   ✓ Website complet (10 slots)
//   ✓ Invitations complètes (8 slots)
//   ✓ Print complet (8 slots)
//   ✓ Communication complète (8 slots)
//   ✓ Luxury Preset présent
//   ✓ Assets présents (penpotFileUrl)
//   ✓ Version valide (semver)
//
// Weighting (sums to 100):
//   - Website      : 25  (10 slots × 2.5 pts each)
//   - Invitations  : 20  (8 slots × 2.5 pts each)
//   - Print        : 20  (8 slots × 2.5 pts each)
//   - Communication: 20  (8 slots × 2.5 pts each)
//   - Luxury       : 10  (binary: present = 10, absent = 0)
//   - Assets       : 3   (binary: penpotFileUrl present = 3, absent = 0)
//   - Version      : 2   (binary: valid semver >= 0.1.0 = 2, else 0)
//
// Publish gate: a Collection can transition to PUBLIE only when:
//   - overall score >= 80
//   - All 4 module packs are complete (40/40 module slots filled)
//   - Luxury preset is present
//
// Design principles:
// - Zero regression: existing Phase 1-4 Collections have qualityScore=null until
//   first compute. Their COMMERCIALISE status is preserved.
// - Idempotent: re-computing the same Collection returns the same score.
// - Cached: result is persisted to Collection.qualityScore after each compute.
// ════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { ensureCollectionsSeeded, MODULE_SLOTS, type ModulePack } from '@/lib/collections'

// ─── Types ───────────────────────────────────────────────────────────────────

export type QualitySection = 'WEBSITE' | 'INVITATIONS' | 'PRINT' | 'COMMUNICATION' | 'LUXURY' | 'ASSETS' | 'VERSION'

export interface QualitySectionReport {
  /** Section name. */
  name: QualitySection
  /** Human-readable label (FR). */
  label: string
  /** Section score (0-100). */
  score: number
  /** Maximum points this section contributes to overall. */
  maxPoints: number
  /** Achieved points. */
  points: number
  /** Whether this section is fully satisfied. */
  passed: boolean
  /** Optional: detail counts (e.g. 8/8 slots). */
  detail?: string
  /** Missing items (slot names, etc.) — empty when passed. */
  missingItems: string[]
}

export interface QualityReport {
  collectionId: string
  collectionSlug: string
  collectionName: string
  /** Overall score (0-100). */
  overall: number
  /** Per-section breakdown. */
  sections: Record<QualitySection, QualitySectionReport>
  /** All missing items across all sections (for UI display). */
  missingItems: string[]
  /** Warnings (non-blocking issues). */
  warnings: string[]
  /** True when overall >= 80 AND all 4 module packs complete AND luxury present. */
  validForPublish: boolean
  /** Reasons the Collection is NOT publishable (empty when validForPublish=true). */
  publishBlockers: string[]
  /** ISO timestamp of computation. */
  computedAt: string
}

// ─── Internal helpers ───────────────────────────────────────────────────────

const SECTION_WEIGHTS: Record<QualitySection, number> = {
  WEBSITE: 25,
  INVITATIONS: 20,
  PRINT: 20,
  COMMUNICATION: 20,
  LUXURY: 10,
  ASSETS: 3,
  VERSION: 2,
}

const SECTION_LABELS: Record<QualitySection, string> = {
  WEBSITE: 'Pack Website',
  INVITATIONS: 'Pack Invitations',
  PRINT: 'Pack Print',
  COMMUNICATION: 'Pack Communication',
  LUXURY: 'Luxury Preset',
  ASSETS: 'Assets Penpot',
  VERSION: 'Version',
}

const PACK_TO_SECTION: Record<ModulePack, QualitySection> = {
  WEBSITE: 'WEBSITE',
  INVITATIONS: 'INVITATIONS',
  PRINT: 'PRINT',
  COMMUNICATION: 'COMMUNICATION',
}

/**
 * Validate a semver string. Accepts X.Y.Z (with optional pre-release suffix).
 * Examples: "1.0.0", "0.1.0", "2.3.1-beta.1".
 */
function isValidSemver(version: string | null | undefined): boolean {
  if (!version) return false
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute the quality score for a Collection.
 *
 * Reads: Collection row + all 34 CollectionModule rows.
 * Writes: caches the overall score to Collection.qualityScore (idempotent).
 *
 * @param collectionId Target Collection
 * @param options.skipCache When true, do NOT write to Collection.qualityScore
 *   (useful for dry-run previews). Default false (caches).
 */
export async function computeQualityScore(
  collectionId: string,
  options: { skipCache?: boolean } = {},
): Promise<QualityReport> {
  await ensureCollectionsSeeded()

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: {
      modules: { select: { pack: true, slot: true, frameId: true } },
    },
  })
  if (!collection) {
    throw new Error(`Collection introuvable: ${collectionId}`)
  }

  const sections = {} as Record<QualitySection, QualitySectionReport>
  const allMissing: string[] = []
  const warnings: string[] = []
  const publishBlockers: string[] = []

  // ─── Per-pack sections (WEBSITE / INVITATIONS / PRINT / COMMUNICATION) ─────
  const packs: ModulePack[] = ['WEBSITE', 'INVITATIONS', 'PRINT', 'COMMUNICATION']
  for (const pack of packs) {
    const section = PACK_TO_SECTION[pack]
    const packSlots = MODULE_SLOTS.filter((s) => s.pack === pack)
    const packModules = collection.modules.filter((m) => m.pack === pack)
    const filled = packModules.filter((m) => m.frameId !== null && m.frameId !== '')
    const missingSlots = packSlots.filter(
      (s) => !packModules.some((m) => m.slot === s.slot && m.frameId && m.frameId !== ''),
    )
    const ratio = packSlots.length > 0 ? filled.length / packSlots.length : 0
    const maxPoints = SECTION_WEIGHTS[section]
    const points = Math.round(ratio * maxPoints)
    const passed = filled.length === packSlots.length

    sections[section] = {
      name: section,
      label: SECTION_LABELS[section],
      score: Math.round(ratio * 100),
      maxPoints,
      points,
      passed,
      detail: `${filled.length}/${packSlots.length} slots mappés`,
      missingItems: missingSlots.map((s) => `${pack}/${s.slot}`),
    }

    if (!passed) {
      publishBlockers.push(`${SECTION_LABELS[section]} incomplet: ${filled.length}/${packSlots.length} slots`)
    }
    allMissing.push(...missingSlots.map((s) => `${pack}/${s.slot}`))
  }

  // ─── Luxury Preset section ────────────────────────────────────────────────
  let luxuryParsed: any = null
  try {
    luxuryParsed = collection.luxuryPreset ? JSON.parse(collection.luxuryPreset) : null
  } catch {
    luxuryParsed = null
    warnings.push('luxuryPreset n\'est pas un JSON valide')
  }
  const luxuryPresent =
    luxuryParsed !== null &&
    typeof luxuryParsed === 'object' &&
    typeof luxuryParsed.theme === 'string' &&
    ['gold', 'rose', 'champagne', 'midnight'].includes(luxuryParsed.theme)
  const luxuryMaxPoints = SECTION_WEIGHTS.LUXURY
  sections.LUXURY = {
    name: 'LUXURY',
    label: SECTION_LABELS.LUXURY,
    score: luxuryPresent ? 100 : 0,
    maxPoints: luxuryMaxPoints,
    points: luxuryPresent ? luxuryMaxPoints : 0,
    passed: luxuryPresent,
    detail: luxuryPresent ? `Thème: ${luxuryParsed.theme}` : 'Aucun luxury preset',
    missingItems: luxuryPresent ? [] : ['luxuryPreset (JSON avec theme: gold|rose|champagne|midnight)'],
  }
  if (!luxuryPresent) {
    publishBlockers.push('Luxury preset absent ou invalide')
    allMissing.push('luxuryPreset')
  }

  // ─── Assets section (penpotFileUrl) ───────────────────────────────────────
  const assetsPresent = !!collection.penpotFileUrl
  const assetsMaxPoints = SECTION_WEIGHTS.ASSETS
  sections.ASSETS = {
    name: 'ASSETS',
    label: SECTION_LABELS.ASSETS,
    score: assetsPresent ? 100 : 0,
    maxPoints: assetsMaxPoints,
    points: assetsPresent ? assetsMaxPoints : 0,
    passed: assetsPresent,
    detail: assetsPresent ? 'URL Penpot liée' : 'Aucune URL Penpot',
    missingItems: assetsPresent ? [] : ['penpotFileUrl'],
  }
  if (!assetsPresent) {
    warnings.push('Aucun fichier Penpot lié — auto-détection impossible')
    allMissing.push('penpotFileUrl')
  }

  // ─── Version section (semver) ─────────────────────────────────────────────
  const versionValid = isValidSemver(collection.version)
  const versionMaxPoints = SECTION_WEIGHTS.VERSION
  sections.VERSION = {
    name: 'VERSION',
    label: SECTION_LABELS.VERSION,
    score: versionValid ? 100 : 0,
    maxPoints: versionMaxPoints,
    points: versionValid ? versionMaxPoints : 0,
    passed: versionValid,
    detail: versionValid ? `v${collection.version}` : `Version invalide: "${collection.version}"`,
    missingItems: versionValid ? [] : [`version (semver attendu, got: "${collection.version}")`],
  }
  if (!versionValid) {
    warnings.push(`Version "${collection.version}" n'est pas un semver valide`)
  }

  // ─── Overall score ────────────────────────────────────────────────────────
  const overall = Object.values(sections).reduce((sum, s) => sum + s.points, 0)

  // ─── Publish gate (spec §4.8) ─────────────────────────────────────────────
  const allPacksComplete = packs.every((p) => sections[PACK_TO_SECTION[p]].passed)
  const validForPublish = overall >= 80 && allPacksComplete && luxuryPresent

  const report: QualityReport = {
    collectionId: collection.id,
    collectionSlug: collection.slug,
    collectionName: collection.name,
    overall,
    sections,
    missingItems: allMissing,
    warnings,
    validForPublish,
    publishBlockers: validForPublish ? [] : publishBlockers,
    computedAt: new Date().toISOString(),
  }

  // Cache the score (unless dry-run)
  if (!options.skipCache) {
    try {
      await db.collection.update({
        where: { id: collectionId },
        data: { qualityScore: overall },
      })
    } catch (err) {
      // Non-fatal — caching is best-effort
      console.warn(`Failed to cache quality score for ${collectionId}:`, err)
    }
  }

  return report
}

/**
 * Convenience: returns just the overall score (0-100), or null if never computed.
 * Reads the cached value from Collection.qualityScore (no recompute).
 */
export async function getCachedQualityScore(
  collectionId: string,
): Promise<number | null> {
  const c = await db.collection.findUnique({
    where: { id: collectionId },
    select: { qualityScore: true },
  })
  return c?.qualityScore ?? null
}
