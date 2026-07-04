// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION VALIDATOR + VERSION MANAGER
// ══════════════════════════════════════════════════════════════════════════════
//
// The validation gate. Before a Collection can be published to the catalog,
// it must pass this validator. The validator runs the detection engine, checks
// completeness, and produces a pass/fail report.
//
// Versioning: each re-publish of a Penpot file bumps the Collection version
// (semver patch for frame tweaks, minor for new variants, major for restructure).

import type { PremiumCollection, SyncReport, PackId, ModuleId } from './types'
import { countDetectedFrames, countVariants } from './types'

// ─── Validation levels ────────────────────────────────────────────────────────

export type ValidationLevel = 'ERROR' | 'WARNING' | 'INFO'

export interface ValidationIssue {
  level: ValidationLevel
  code: string                  // e.g. "MISSING_REQUIRED_MODULE"
  message: string
  pack?: PackId
  module?: ModuleId
}

export interface ValidationResult {
  passes: boolean
  issues: ValidationIssue[]
  summary: {
    totalChecks: number
    errors: number
    warnings: number
    infos: number
    qualityScore: number        // 0-100
    completenessPct: number     // 0-100
    detectedFrames: number
    expectedFrames: number
  }
}

// ─── Required modules per pack (the minimum viable Collection) ────────────────
// A Collection can only be PUBLISHED if every required module has ≥1 detected variant.
export const REQUIRED_MODULES: Record<PackId, ModuleId[]> = {
  website: ['hero', 'countdown', 'story', 'gallery', 'programme', 'rsvp'],
  invitations: ['standard', 'vip', 'famille', 'numerique'],
  print: ['badge', 'qr', 'table-number', 'place-card'],
  communication: ['facebook', 'instagram', 'story', 'whatsapp'],
  luxury: ['animations', 'transitions', 'palette', 'typography'],
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN: validate a Collection (after detection has stamped frameIds)
// ══════════════════════════════════════════════════════════════════════════════

export function validateCollection(collection: PremiumCollection): ValidationResult {
  const issues: ValidationIssue[] = []
  const report = collection.penpot.lastSyncReport

  // 1. Penpot file must be linked
  if (!collection.penpot.fileUrl || !collection.penpot.fileId) {
    issues.push({
      level: 'ERROR',
      code: 'NO_PENPOT_FILE',
      message: 'Aucun fichier Penpot lié. Le designer doit publier un fichier et coller son URL.',
    })
  }

  // 2. Sync must have run
  if (!report) {
    issues.push({
      level: 'ERROR',
      code: 'NO_SYNC_RUN',
      message: 'La détection n\'a jamais été lancée. Exécutez l\'import Penpot.',
    })
  } else {
    // 3. Check required modules
    for (const [packId, moduleIds] of Object.entries(REQUIRED_MODULES)) {
      for (const moduleId of moduleIds) {
        const pack = collection.packs.find((p) => p.id === packId)
        const mod = pack?.modules.find((m) => m.id === moduleId)
        if (!mod) continue
        const detected = mod.variants.filter((v) => v.frame.frameId).length
        if (detected === 0) {
          issues.push({
            level: 'ERROR',
            code: 'MISSING_REQUIRED_MODULE',
            message: `Module requis manquant : ${pack?.name} / ${mod.name}. Aucune frame détectée.`,
            pack: packId as PackId,
            module: moduleId as ModuleId,
          })
        } else if (detected < mod.variants.length) {
          issues.push({
            level: 'WARNING',
            code: 'INCOMPLETE_VARIANTS',
            message: `${mod.name} : ${detected}/${mod.variants.length} variantes détectées.`,
            pack: packId as PackId,
            module: moduleId as ModuleId,
          })
        }
      }
    }

    // 4. Check for extra/unmatched frames
    if (report.extraFrames.length > 0) {
      issues.push({
        level: 'INFO',
        code: 'EXTRA_FRAMES',
        message: `${report.extraFrames.length} frame(s) non reconnue(s) par la convention de nommage.`,
      })
    }

    // 5. Check page organization (one page per pack recommended)
    const pageIds = Object.values(collection.penpot.pageIds).filter(Boolean)
    if (pageIds.length < collection.packs.length) {
      issues.push({
        level: 'INFO',
        code: 'PAGE_ORGANIZATION',
        message: `${pageIds.length} page(s) Penpot détectée(s) pour ${collection.packs.length} packs. Recommandation : une page par pack.`,
      })
    }
  }

  // 6. Version check
  if (!collection.version) {
    issues.push({ level: 'WARNING', code: 'NO_VERSION', message: 'Aucune version définie.' })
  }

  // Compute summary
  const errors = issues.filter((i) => i.level === 'ERROR').length
  const warnings = issues.filter((i) => i.level === 'WARNING').length
  const infos = issues.filter((i) => i.level === 'INFO').length
  const detectedFrames = countDetectedFrames(collection)
  const expectedFrames = countVariants(collection)

  return {
    passes: errors === 0 && (report?.passes ?? false),
    issues,
    summary: {
      totalChecks: issues.length,
      errors,
      warnings,
      infos,
      qualityScore: report?.qualityScore ?? 0,
      completenessPct: report?.completenessPct ?? 0,
      detectedFrames,
      expectedFrames,
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VERSION MANAGER
// ══════════════════════════════════════════════════════════════════════════════

export type VersionBump = 'patch' | 'minor' | 'major'

/**
 * Bump a Collection's version based on what changed between two sync reports.
 * - patch: frame tweaks (same structure, same variant count, frames re-edited)
 * - minor: new variants added (variant count increased)
 * - major: restructure (modules added/removed, required modules changed)
 */
export function computeVersionBump(
  prevReport: SyncReport | undefined,
  newReport: SyncReport,
  prevVariantCount: number,
  newVariantCount: number,
): VersionBump {
  if (!prevReport) return 'major' // first publish
  if (newVariantCount > prevVariantCount) return 'minor'
  if (newReport.matchedFrames !== prevReport.matchedFrames) return 'minor'
  return 'patch'
}

export function bumpVersion(current: string, bump: VersionBump): string {
  const [major, minor, patch] = current.split('.').map((n) => parseInt(n, 10) || 0)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/**
 * Produce a human-readable changelog entry from a sync report diff.
 */
export function buildChangelogEntry(
  bump: VersionBump,
  prev: SyncReport | undefined,
  next: SyncReport,
): string {
  const lines: string[] = []
  if (!prev) {
    lines.push(`Première publication. ${next.matchedFrames} frames détectées.`)
  } else {
    const delta = next.matchedFrames - prev.matchedFrames
    if (delta > 0) lines.push(`+${delta} frame(s) ajoutée(s).`)
    if (delta < 0) lines.push(`${delta} frame(s) supprimée(s).`)
    if (next.qualityScore !== prev.qualityScore) {
      lines.push(`Qualité : ${prev.qualityScore}% → ${next.qualityScore}%`)
    }
  }
  if (next.missingRequired.length > 0) {
    lines.push(`⚠ ${next.missingRequired.length} module(s) requis toujours manquants.`)
  }
  return `[${bump}] ${lines.join(' ')}`
}
