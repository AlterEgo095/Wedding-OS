// ══════════════════════════════════════════════════════════════════════════════
// REGISTRY SEED — generates simulated Penpot registries for demo Collections
// ══════════════════════════════════════════════════════════════════════════════
//
// In production, the designer creates real frames in Penpot and pastes the
// file URL. Wedding OS then fetches the real PenpotFrameRegistry.
//
// For DEMO / FIRST-BOOT purposes (no real Penpot file available yet), this
// module generates a SIMULATED registry where every expected frame (per the
// naming convention) has a corresponding PenpotFrame with a deterministic UUID.
// This produces real signed CompiledPackages with real hashes, real validation
// reports, and real visual-validation scores — so the marketplace has real
// content end-to-end.
//
// The simulated frames have realistic dimensions per MODULE_DIMENSION_SPEC
// (the visual validator checks these). A few optional variants are intentionally
// omitted to make the demo realistic (no Collection is "100% perfect" — the
// validator's WARNING/INFO checks should fire).

import { createHash } from 'node:crypto'
import type { PenpotFrameRegistry, PenpotFrame } from './penpot-builder'
import { buildExpectedFrames } from './naming-convention'
import { MODULE_DIMENSION_SPEC } from './visual-validator'
import type { PremiumCollection, PackId, ModuleId } from './types'

// ─── Deterministic UUID generator (stable across runs) ────────────────────────
// Penpot frame IDs are UUIDs. We generate deterministic ones from the frame
// name so re-seeding produces the same IDs (idempotent compile).
function deterministicUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex')
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-')
}

// ─── Pick a realistic dimension for a frame, given its module ─────────────────
function pickDimensions(pack: PackId, module: ModuleId): { width: number; height: number } {
  // Try the exact key (pack.module)
  const key = `${pack}.${module}` as keyof typeof MODULE_DIMENSION_SPEC
  const spec = MODULE_DIMENSION_SPEC[key]
  if (spec) {
    // Snap to gridMultiple
    const grid = spec.gridMultiple || 4
    const w = Math.round((spec.minWidth + (spec.maxWidth - spec.minWidth) * 0.6) / grid) * grid
    const h = Math.round((spec.minHeight + (spec.maxHeight - spec.minHeight) * 0.6) / grid) * grid
    return { width: w, height: h }
  }
  // Fallback (luxury modules — free-form)
  return { width: 1200, height: 800 }
}

// ─── Should this optional variant be omitted? (realism) ───────────────────────
// We omit ~15% of OPTIONAL variants to trigger WARNING-level validation issues.
// Required modules always have at least variant A present (so the Collection passes).
function shouldOmitOptionalVariant(
  collectionId: string,
  pack: PackId,
  module: ModuleId,
  variant: string,
  required: boolean,
): boolean {
  // Never omit variant A — it's the default
  if (variant === 'A') return false
  // Never omit a required module's only variant
  if (required) return false
  // Deterministic pseudo-random based on the frame name seed
  const seed = `${collectionId}:${pack}:${module}:${variant}`
  const h = createHash('sha256').update(seed).digest('hex')
  const score = parseInt(h.slice(0, 4), 16) % 100
  return score < 25 // omit ~25% of optional non-A variants
}

// ─── MAIN: build a simulated registry for a Collection ────────────────────────
export function buildSimulatedRegistry(collection: PremiumCollection): PenpotFrameRegistry {
  const expected = buildExpectedFrames(collection.id, collection.packs)
  const frames: PenpotFrame[] = []
  const pagesMap = new Map<string, string>()

  // Build one page per pack
  for (const pack of collection.packs) {
    const pageId = deterministicUuid(`${collection.id}:${pack.id}:page`)
    pagesMap.set(pack.id, pageId)
  }

  for (const exp of expected) {
    if (shouldOmitOptionalVariant(collection.id, exp.pack, exp.module, exp.variant, exp.required)) {
      continue
    }
    const pageId = pagesMap.get(exp.pack)!
    const { width, height } = pickDimensions(exp.pack, exp.module)
    const frameId = deterministicUuid(`${collection.id}:${exp.expectedFrameName}`)
    frames.push({
      id: frameId,
      name: exp.expectedFrameName,
      pageId,
      pageName: packName(exp.pack),
      width,
      height,
      thumbnailUrl: null,
    })
  }

  const pages = Array.from(pagesMap.entries()).map(([packId, id]) => ({
    id,
    name: packName(packId as PackId),
  }))

  return {
    fileId: deterministicUuid(`${collection.id}:file`),
    fileUrl: `https://design.penpot.app/#/view?file-id=${deterministicUuid(`${collection.id}:file`)}`,
    pages,
    frames,
    exportedAt: new Date().toISOString(),
    source: 'designer-paste',
  }
}

function packName(pack: PackId): string {
  return {
    website: 'Website',
    invitations: 'Invitations',
    print: 'Print',
    communication: 'Communication',
    luxury: 'Luxury',
  }[pack]
}
