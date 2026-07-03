// ════════════════════════════════════════════════════════════════════════════
// Penpot Auto-Detection Engine — Phase 5 (Penpot Collection Builder)
// ════════════════════════════════════════════════════════════════════════════
// Orchestrator: Penpot URL → file fetch → frame list → registry match
// → DetectionReport (ready to feed autoMapModules()).
//
// This module is the bridge between the Penpot REST client (network) and the
// Collection Engine (DB). It is pure orchestration — no DB writes here.
// DB writes happen in `autoMapModules()` (lib/collections/index.ts).
//
// Design principles:
// - Zero regression: failures return a DetectionReport with `errors`, they
//   never throw out of the orchestrator. Callers can decide how to surface.
// - Idempotent: re-running detect on the same URL gives the same report.
// - Mock-friendly: uses Penpot client's mock mode when no token configured.
// ════════════════════════════════════════════════════════════════════════════

import { parsePenpotUrl } from './config'
import {
  fetchPenpotFile,
  fetchPenpotFrames,
  PenpotApiError,
  isPenpotMockMode,
  type PenpotFile,
  type PenpotFrame,
} from './client'
import {
  matchFrameName,
  totalRegistrySlots,
  type FrameMatchResult,
} from './frameRegistry'
import type { ModulePack } from '@/lib/collections'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single frame → slot mapping decision.
 * Emitted for every Penpot frame we examined, whether matched or not.
 */
export interface DetectionEntry {
  /** Penpot frame id (e.g. "frame-abc-001"). */
  frameId: string
  /** Penpot frame name as authored by the designer (e.g. "A/hero"). */
  frameName: string
  /** Penpot page id where this frame lives. */
  pageId: string | null
  /** Penpot page name (human-readable). */
  pageName: string | null
  /** Match outcome. */
  matched: boolean
  /** Matched (pack, slot) when matched=true. */
  pack?: ModulePack
  slot?: string
  /** Canonical frame name (first alias in registry) when matched=true. */
  canonicalName?: string
  /** Variant prefix (e.g. "A") when the designer used `A/hero` syntax. */
  variant?: string | null
  /** Reason for non-match (only when matched=false). */
  reason?: 'no_match' | 'ambiguous'
  /** Candidates when reason=ambiguous. */
  candidates?: ReadonlyArray<{ pack: ModulePack; slot: string }>
}

/**
 * A slot that was NOT detected in the Penpot file.
 * These are the slots the designer still needs to author before publishing.
 */
export interface MissingSlot {
  pack: ModulePack
  slot: string
  /** Human-readable label (FR) from MODULE_SLOTS. */
  label: string
  /** List of accepted frame names the designer can use. */
  acceptedNames: readonly string[]
}

/**
 * The full result of an auto-detection pass.
 * Designed to be JSON-serializable for API responses + UI rendering.
 */
export interface DetectionReport {
  /** ISO timestamp of detection. */
  detectedAt: string
  /** Source Penpot URL (echoed back for traceability). */
  sourceUrl: string
  /** Parsed Penpot file id. */
  fileId: string | null
  /** Parsed Penpot page id (null = all pages scanned). */
  pageId: string | null
  /** Penpot file name (if fetch succeeded). */
  fileName: string | null
  /** Whether the Penpot client is in mock mode. */
  mockMode: boolean
  /** Total Penpot frames examined. */
  totalFrames: number
  /** Frames that matched a slot. */
  matchedCount: number
  /** Frames that did NOT match any slot (stray frames in the file). */
  unmatchedCount: number
  /** Slots that were detected (= matched frames, deduped by slot). */
  detectedSlotsCount: number
  /** Slots that were NOT detected (still need designer attention). */
  missingSlotsCount: number
  /** Total canonical slots in the registry (34). */
  totalSlots: number
  /** True if all 34 slots were detected. */
  complete: boolean
  /** Per-pack breakdown of detected vs total. */
  byPack: Record<
    ModulePack,
    { detected: number; total: number; missingSlots: readonly MissingSlot[] }
  >
  /** One entry per examined frame (matched or not). */
  entries: readonly DetectionEntry[]
  /** Slots still missing (convenience list for UI). */
  missingSlots: readonly MissingSlot[]
  /** Non-fatal errors encountered during detection (e.g. Penpot unreachable). */
  errors: readonly string[]
  /** Warnings (e.g. ambiguous matches, duplicate frames for same slot). */
  warnings: readonly string[]
}

// ─── Internal helpers ───────────────────────────────────────────────────────

import { MODULE_SLOTS } from '@/lib/collections'
import { acceptedFrameNames } from './frameRegistry'

/**
 * Build the per-pack breakdown + missing-slots list from a list of entries.
 */
function buildPackBreakdown(
  entries: readonly DetectionEntry[],
): DetectionReport['byPack'] & { missingSlots: MissingSlot[] } {
  const packs: ModulePack[] = ['WEBSITE', 'INVITATIONS', 'PRINT', 'COMMUNICATION']
  const byPack = {} as DetectionReport['byPack']
  const allMissing: MissingSlot[] = []

  for (const pack of packs) {
    const packSlots = MODULE_SLOTS.filter((s) => s.pack === pack)
    const detectedSlotsInPack = new Set(
      entries
        .filter((e) => e.matched && e.pack === pack)
        .map((e) => e.slot!),
    )
    const missingSlotsInPack: MissingSlot[] = packSlots
      .filter((s) => !detectedSlotsInPack.has(s.slot))
      .map((s) => ({
        pack: s.pack,
        slot: s.slot,
        label: s.label,
        acceptedNames: acceptedFrameNames(s.pack, s.slot),
      }))

    byPack[pack] = {
      detected: detectedSlotsInPack.size,
      total: packSlots.length,
      missingSlots: missingSlotsInPack,
    }
    allMissing.push(...missingSlotsInPack)
  }

  return { ...byPack, missingSlots: allMissing }
}

/**
 * Detect duplicate slot mappings (same slot matched by multiple frames).
 * Emits a warning per duplicate — the last-matching frame wins in autoMapModules,
 * but the designer is notified so they can clean up the Penpot file.
 */
function detectDuplicateSlots(
  entries: readonly DetectionEntry[],
): string[] {
  const warnings: string[] = []
  const slotToFrames = new Map<string, string[]>()
  for (const e of entries) {
    if (!e.matched || !e.pack || !e.slot) continue
    const key = `${e.pack}/${e.slot}`
    const list = slotToFrames.get(key) || []
    list.push(e.frameName)
    slotToFrames.set(key, list)
  }
  for (const [key, names] of slotToFrames.entries()) {
    if (names.length > 1) {
      warnings.push(
        `Slot ${key} détecté ${names.length}× dans le fichier Penpot: ${names.join(', ')}. Le dernier frame gagne.`,
      )
    }
  }
  return warnings
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Auto-detect Collection module slots from a Penpot file URL.
 *
 * Pipeline:
 * 1. Parse the URL → extract fileId + optional pageId
 * 2. Fetch Penpot file metadata (name, pages)
 * 3. Fetch all frames (filtered to pageId if specified)
 * 4. For each frame, run `matchFrameName()` against the FRAME_NAME_REGISTRY
 * 5. Build a DetectionReport with:
 *    - matched entries (frame → slot)
 *    - unmatched entries (stray frames in the file)
 *    - missing slots (slots not found in the file)
 *    - per-pack breakdown
 *    - errors / warnings
 *
 * The function NEVER throws — network errors and Penpot API errors are caught
 * and surfaced as `report.errors[]`. This makes it safe to call from API
 * routes without try/catch gymnastics.
 *
 * @param fileUrl Penpot URL (view/share/editor — anything parsePenpotUrl accepts)
 * @param options.forcePageId Optional override for the pageId (ignores URL's page-id)
 *
 * @example
 * const report = await detectFramesFromPenpotFile(
 *   'https://design.penpot.app/#/view?file-id=abc&page-id=def',
 * );
 * if (report.complete) {
 *   await autoMapModules(collectionId, report);
 * }
 */
export async function detectFramesFromPenpotFile(
  fileUrl: string,
  options: { forcePageId?: string | null } = {},
): Promise<DetectionReport> {
  const detectedAt = new Date().toISOString()
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Parse URL
  const { fileId: parsedFileId, pageId: parsedPageId } = parsePenpotUrl(fileUrl)
  const fileId = parsedFileId
  const pageId = options.forcePageId !== undefined ? options.forcePageId : parsedPageId

  if (!fileId) {
    return {
      detectedAt,
      sourceUrl: fileUrl,
      fileId: null,
      pageId: null,
      fileName: null,
      mockMode: isPenpotMockMode(),
      totalFrames: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      detectedSlotsCount: 0,
      missingSlotsCount: totalRegistrySlots(),
      totalSlots: totalRegistrySlots(),
      complete: false,
      byPack: emptyByPack(),
      entries: [],
      missingSlots: allSlotsMissing(),
      errors: [
        'URL Penpot invalide — fileId introuvable. Format attendu: https://design.penpot.app/#/view?file-id=abc123&page-id=def456',
      ],
      warnings,
    }
  }

  // 2. Fetch file metadata
  let file: PenpotFile | null = null
  try {
    file = await fetchPenpotFile(fileId)
  } catch (err) {
    if (err instanceof PenpotApiError) {
      errors.push(`${err.message} (code: ${err.code || 'UNKNOWN'})`)
    } else {
      errors.push(`Erreur inattendue lors du fetch du fichier Penpot: ${String(err)}`)
    }
  }

  // 3. Fetch frames
  let frames: PenpotFrame[] = []
  if (file) {
    try {
      frames = await fetchPenpotFrames(fileId, pageId)
    } catch (err) {
      if (err instanceof PenpotApiError) {
        errors.push(`${err.message} (code: ${err.code || 'UNKNOWN'})`)
      } else {
        errors.push(`Erreur inattendue lors du fetch des frames: ${String(err)}`)
      }
    }
  }

  // 4. Match each frame against the registry
  const entries: DetectionEntry[] = frames.map((frame) => {
    const match: FrameMatchResult = matchFrameName(frame.name)
    return {
      frameId: frame.id,
      frameName: frame.name,
      pageId: frame.pageId,
      pageName: frame.pageName ?? null,
      matched: match.matched,
      pack: match.pack,
      slot: match.slot,
      canonicalName: match.canonicalName,
      variant: match.variant ?? null,
      reason: match.reason,
      candidates: match.candidates,
    }
  })

  // 5. Detect duplicate slot mappings
  warnings.push(...detectDuplicateSlots(entries))

  // 6. Build per-pack breakdown
  const { missingSlots, ...byPack } = buildPackBreakdown(entries)

  const matchedCount = entries.filter((e) => e.matched).length
  const unmatchedCount = entries.length - matchedCount
  // Dedupe matched entries by (pack, slot) — duplicates collapse into 1 detected slot
  const detectedSlotsSet = new Set(
    entries.filter((e) => e.matched).map((e) => `${e.pack}/${e.slot}`),
  )
  const detectedSlotsCount = detectedSlotsSet.size
  const totalSlots = totalRegistrySlots()
  const missingSlotsCount = totalSlots - detectedSlotsCount

  return {
    detectedAt,
    sourceUrl: fileUrl,
    fileId,
    pageId,
    fileName: file?.name ?? null,
    mockMode: isPenpotMockMode(),
    totalFrames: frames.length,
    matchedCount,
    unmatchedCount,
    detectedSlotsCount,
    missingSlotsCount,
    totalSlots,
    complete: missingSlotsCount === 0 && errors.length === 0,
    byPack,
    entries,
    missingSlots,
    errors,
    warnings,
  }
}

// ─── Helpers for empty / full-missing reports ───────────────────────────────

function emptyByPack(): DetectionReport['byPack'] {
  const packs: ModulePack[] = ['WEBSITE', 'INVITATIONS', 'PRINT', 'COMMUNICATION']
  const byPack = {} as DetectionReport['byPack']
  for (const pack of packs) {
    byPack[pack] = {
      detected: 0,
      total: MODULE_SLOTS.filter((s) => s.pack === pack).length,
      missingSlots: [],
    }
  }
  return byPack
}

function allSlotsMissing(): MissingSlot[] {
  return MODULE_SLOTS.map((s) => ({
    pack: s.pack,
    slot: s.slot,
    label: s.label,
    acceptedNames: acceptedFrameNames(s.pack, s.slot),
  }))
}
