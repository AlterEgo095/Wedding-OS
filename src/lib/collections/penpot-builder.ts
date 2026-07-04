// ══════════════════════════════════════════════════════════════════════════════
// PENPOT COLLECTION BUILDER — the detection engine
// ══════════════════════════════════════════════════════════════════════════════
//
// This is the core of Wedding OS's role: DETECT, not CREATE.
//
// Flow:
//   Designer publishes a Penpot file → pastes its URL in the Designer Portal
//   → Wedding OS parses the URL (extracts fileId + pageIds)
//   → fetches the file's frame tree (via Penpot export API or a registry JSON
//     the designer pastes as a fallback when the API isn't reachable)
//   → matches each frame NAME against the naming convention
//   → validates completeness (all required modules have ≥1 variant)
//   → produces a SyncReport + stamps frameIds onto the Collection
//
// Wedding OS NEVER renders designs. It only references Penpot frames.

import { parsePenpotUrl, buildPenpotViewUrl, PENPOT_BASE_URL } from '@/lib/penpot/config'
import {
  parseFrameName,
  buildExpectedFrames,
  type ExpectedFrame,
  type ParsedFrameName,
} from './naming-convention'
import type {
  PremiumCollection,
  PackId,
  ModuleId,
  VariantId,
  SyncReport,
  CollectionPack,
  DesignVariant,
} from './types'

// ─── Penpot frame descriptor (what the engine receives from Penpot) ───────────
// This is the shape of a frame as returned by the Penpot export API, or as
// pasted by the designer in the registry-JSON fallback mode.
export interface PenpotFrame {
  id: string                 // Penpot frame UUID
  name: string               // the frame's name (must match convention)
  pageId: string             // the Penpot page containing this frame
  pageName?: string          // optional human-readable page name
  width?: number
  height?: number
  thumbnailUrl?: string      // optional Penpot render URL (PNG export)
}

// ─── A frame registry (the input to the builder) ──────────────────────────────
// Two ways to obtain it:
//   (a) Auto-fetch from Penpot API (when the file is public / token available)
//   (b) Designer pastes a JSON export (fallback — always available)
export interface PenpotFrameRegistry {
  fileId: string
  fileUrl: string
  pages: { id: string; name: string }[]
  frames: PenpotFrame[]
  exportedAt: string
  source: 'penpot-api' | 'designer-paste'
}

// ─── Detection result ─────────────────────────────────────────────────────────
export interface DetectionResult {
  registry: PenpotFrameRegistry
  report: SyncReport
  // The frame map: expectedFrameName → matched PenpotFrame (or null if missing)
  matchedFrames: Record<string, PenpotFrame | null>
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN: detect a Collection from a Penpot registry
// ══════════════════════════════════════════════════════════════════════════════

export function detectCollection(
  collection: PremiumCollection,
  registry: PenpotFrameRegistry,
): DetectionResult {
  const expected = buildExpectedFrames(collection.id, collection.packs)
  const matchedFrames: Record<string, PenpotFrame | null> = {}

  // Build an index of all frames by name (lowercased, stripped of suffixes)
  const frameIndex = new Map<string, PenpotFrame>()
  for (const f of registry.frames) {
    const key = normalizeFrameName(f.name)
    if (!frameIndex.has(key)) frameIndex.set(key, f)
  }

  // Match each expected frame
  let matchedCount = 0
  const missingRequired: { pack: PackId; module: ModuleId }[] = []
  const missingVariants: { pack: PackId; module: ModuleId; expectedVariants: number }[] = []
  const matchedModuleVariants = new Map<string, number>()

  for (const exp of expected) {
    const key = normalizeFrameName(exp.expectedFrameName)
    const found = frameIndex.get(key) || null
    matchedFrames[exp.expectedFrameName] = found
    if (found) {
      matchedCount++
      const mk = `${exp.pack}:${exp.module}`
      matchedModuleVariants.set(mk, (matchedModuleVariants.get(mk) || 0) + 1)
    }
  }

  // Check required modules have ≥1 matched variant
  for (const pack of collection.packs) {
    for (const mod of pack.modules) {
      const mk = `${pack.id}:${mod.id}`
      const matched = matchedModuleVariants.get(mk) || 0
      if (mod.required && matched === 0) {
        missingRequired.push({ pack: pack.id, module: mod.id })
      }
      const expectedVariants = mod.variants.length
      if (matched < expectedVariants) {
        missingVariants.push({ pack: pack.id, module: mod.id, expectedVariants })
      }
    }
  }

  // Detect extra frames (didn't match any expected name)
  const expectedKeys = new Set(expected.map((e) => normalizeFrameName(e.expectedFrameName)))
  const extraFrames: string[] = []
  for (const f of registry.frames) {
    const key = normalizeFrameName(f.name)
    if (!expectedKeys.has(key)) {
      // Only flag frames that look like they're trying to follow the convention
      // (start with the collection code and have a "/")
      const code = collection.id.slice(0, 2).toUpperCase()
      if (f.name.toUpperCase().startsWith(code) && f.name.includes('/')) {
        extraFrames.push(f.name)
      }
    }
  }

  // Compute scores
  const totalExpected = expected.length
  const matchedPct = totalExpected > 0 ? (matchedCount / totalExpected) * 100 : 0
  const requiredTotal = collection.packs.reduce(
    (s, p) => s + p.modules.filter((m) => m.required).length,
    0,
  )
  const requiredOk = collection.packs.reduce(
    (s, p) => s + p.modules.filter((m) => m.required && (matchedModuleVariants.get(`${p.id}:${m.id}`) || 0) > 0).length,
    0,
  )
  const requiredScore = requiredTotal > 0 ? (requiredOk / requiredTotal) * 70 : 0
  const densityScore = Math.min(matchedPct / 100, 1) * 30
  const qualityScore = Math.round(requiredScore + densityScore)
  const completenessPct = Math.round(matchedPct)

  const report: SyncReport = {
    detectedAt: new Date().toISOString(),
    totalFramesFound: registry.frames.length,
    matchedFrames: matchedCount,
    missingRequired,
    missingVariants,
    extraFrames,
    qualityScore,
    completenessPct,
    // A Collection passes validation when ALL required modules have ≥1 detected variant.
    // Completeness % is informational (optional modules/variants boost the score but
    // aren't blocking — a Collection with all required modules is deployable).
    passes: missingRequired.length === 0,
    errors: missingRequired.length > 0
      ? [`${missingRequired.length} module(s) requis sans frame correspondante`]
      : [],
    warnings: [
      ...(missingVariants.length > 0 ? [`${missingVariants.length} module(s) avec variantes manquantes`] : []),
      ...(extraFrames.length > 0 ? [`${extraFrames.length} frame(s) non reconnue(s)`] : []),
    ],
  }

  return { registry, report, matchedFrames }
}

// ══════════════════════════════════════════════════════════════════════════════
// Apply detection result to a Collection — stamps frameIds + pageIds + syncReport
// ══════════════════════════════════════════════════════════════════════════════

export function applyDetection(
  collection: PremiumCollection,
  detection: DetectionResult,
): PremiumCollection {
  const { registry, report, matchedFrames } = detection
  const expected = buildExpectedFrames(collection.id, collection.packs)

  // Build a lookup: (pack, module, variant) → PenpotFrame
  const frameLookup = new Map<string, PenpotFrame>()
  for (const exp of expected) {
    const f = matchedFrames[exp.expectedFrameName]
    if (f) frameLookup.set(`${exp.pack}:${exp.module}:${exp.variant}`, f)
  }

  // Stamp frameIds onto variants, and pageIds onto packs
  const newPacks: CollectionPack[] = collection.packs.map((pack) => {
    const packFrames = expected.filter((e) => e.pack === pack.id)
    const packPageId = packFrames
      .map((e) => frameLookup.get(`${e.pack}:${e.module}:${e.variant}`)?.pageId)
      .find((p) => p) || null

    return {
      ...pack,
      pageId: packPageId,
      modules: pack.modules.map((mod) => ({
        ...mod,
        variants: mod.variants.map((v) => {
          const f = frameLookup.get(`${pack.id}:${mod.id}:${v.id}`)
          return {
            ...v,
            frame: {
              pageId: f?.pageId || packPageId || null,
              frameId: f?.id || null,
              expectedFrameName: v.frame.expectedFrameName,
              thumbnailUrl: f?.thumbnailUrl || null,
            },
            quality: f ? Math.min(95, v.quality) : 0,
          } as DesignVariant
        }),
      })),
    }
  })

  // Build pageIds map
  const pageIds: Partial<Record<PackId, string>> = {}
  for (const pack of newPacks) {
    if (pack.pageId) pageIds[pack.id] = pack.pageId
  }

  return {
    ...collection,
    packs: newPacks,
    penpot: {
      fileUrl: registry.fileUrl,
      fileId: registry.fileId,
      pageIds,
      lastSyncedAt: report.detectedAt,
      lastSyncStatus: report.passes ? 'DETECTED' : report.completenessPct > 0 ? 'INCOMPLETE' : 'FAILED',
      lastSyncReport: report,
    },
    completionPct: report.completenessPct,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Registry fetch — attempts the Penpot API, falls back to manual paste
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Attempt to fetch a Penpot file's frame registry from the Penpot export API.
 * Returns null if the file isn't publicly accessible or the API isn't reachable.
 * The caller should fall back to asking the designer to paste a registry JSON.
 */
export async function fetchPenpotRegistry(fileUrl: string): Promise<PenpotFrameRegistry | null> {
  const { fileId, pageId } = parsePenpotUrl(fileUrl)
  if (!fileId) return null

  try {
    // Penpot's public export endpoint. This works for shared/public files.
    // For private files, the designer must paste a registry JSON instead.
    const exportUrl = `${PENPOT_BASE_URL}/api/export/frames?file-id=${fileId}${pageId ? `&page-id=${pageId}` : ''}`
    const res = await fetch(exportUrl, {
      headers: { Accept: 'application/json' },
      // Short timeout — we don't want to block the API on an unreachable Penpot
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.frames || !Array.isArray(data.frames)) return null

    return {
      fileId,
      fileUrl,
      pages: data.pages || [],
      frames: data.frames as PenpotFrame[],
      exportedAt: new Date().toISOString(),
      source: 'penpot-api',
    }
  } catch {
    // Network error, CORS, timeout, or non-public file → null (caller falls back)
    return null
  }
}

/**
 * Validate a manually-pasted registry JSON (the fallback when the API isn't reachable).
 * Returns a normalized registry or throws on malformed input.
 */
export function parsePastedRegistry(
  fileUrl: string,
  rawJson: string,
): PenpotFrameRegistry {
  const { fileId } = parsePenpotUrl(fileUrl)
  if (!fileId) throw new Error('URL Penpot invalide — fileId introuvable')

  const parsed = JSON.parse(rawJson)
  if (!Array.isArray(parsed.frames)) {
    throw new Error('JSON invalide — champ "frames" manquant ou non-tableau')
  }

  const frames: PenpotFrame[] = parsed.frames.map((f: Record<string, unknown>, i: number) => ({
    id: String(f.id || `frame-${i}`),
    name: String(f.name || ''),
    pageId: String(f.pageId || f.page_id || ''),
    pageName: f.pageName ? String(f.pageName) : undefined,
    width: typeof f.width === 'number' ? f.width : undefined,
    height: typeof f.height === 'number' ? f.height : undefined,
    thumbnailUrl: f.thumbnailUrl ? String(f.thumbnailUrl) : undefined,
  }))

  const pages = Array.isArray(parsed.pages)
    ? parsed.pages.map((p: Record<string, unknown>) => ({ id: String(p.id), name: String(p.name || '') }))
    : []

  return {
    fileId,
    fileUrl,
    pages,
    frames,
    exportedAt: new Date().toISOString(),
    source: 'designer-paste',
  }
}

// ─── Helper: normalize a frame name for matching ──────────────────────────────
function normalizeFrameName(name: string): string {
  return name
    .trim()
    .replace(/\s+copy.*$/i, '')   // strip Penpot's " copy 3" suffix
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// ─── Helper: build the expected frame name list for display ───────────────────
export function listExpectedFrameNames(collection: PremiumCollection): ExpectedFrame[] {
  return buildExpectedFrames(collection.id, collection.packs)
}

// ─── Helper: build a Penpot embed URL for a detected Collection ───────────────
export function getCollectionEmbedUrl(collection: PremiumCollection): string | null {
  if (!collection.penpot.fileId) return null
  // Embed the first detected page, or the file root
  const firstPageId = Object.values(collection.penpot.pageIds)[0] || null
  return buildPenpotViewUrl(collection.penpot.fileId, firstPageId)
}

// ─── Helper: build an "open in Penpot editor" URL ─────────────────────────────
export function getCollectionEditUrl(collection: PremiumCollection): string | null {
  if (!collection.penpot.fileId) return null
  const firstPageId = Object.values(collection.penpot.pageIds)[0] || null
  const params = new URLSearchParams({ 'file-id': collection.penpot.fileId })
  if (firstPageId) params.set('page-id', firstPageId)
  return `${PENPOT_BASE_URL}/#/workspace?${params.toString()}`
}
