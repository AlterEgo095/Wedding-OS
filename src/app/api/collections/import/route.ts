import { NextRequest, NextResponse } from 'next/server'
import { getCollection, saveDetectedCollection } from '@/lib/collections/catalog'
import {
  detectCollection,
  applyDetection,
  fetchPenpotRegistry,
  parsePastedRegistry,
} from '@/lib/collections/penpot-builder'
import { validateCollection, computeVersionBump, bumpVersion } from '@/lib/collections/validator'
import { countVariants, countDetectedFrames } from '@/lib/collections/types'
import { parsePenpotUrl } from '@/lib/penpot/config'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'

// POST /api/collections/import
//
// Body:
//   { collectionId: string,
//     penpotUrl: string,
//     registryJson?: string  // optional: designer-pasted frame registry (fallback)
//   }
//
// This is the DETECTION engine. Wedding OS:
//   1. Parses the Penpot URL (extracts fileId)
//   2. Attempts to fetch the frame tree from the Penpot API
//   3. If the API isn't reachable, uses the designer-pasted registryJson
//   4. Matches frames by naming convention
//   5. Validates completeness
//   6. Stamps frameIds onto the Collection
//   7. Returns the sync report
//
// Wedding OS NEVER creates designs. It only detects + validates + catalogs.
//
// AUTH: PLATFORM_ADMIN only — Penpot detection mutates the in-memory catalog.

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const body = await req.json()
    const { collectionId, penpotUrl, registryJson } = body as {
      collectionId: string
      penpotUrl: string
      registryJson?: string
    }

    if (!collectionId || !penpotUrl) {
      return NextResponse.json(
        { error: 'collectionId et penpotUrl sont requis' },
        { status: 400 },
      )
    }

    const collection = getCollection(collectionId)
    if (!collection) {
      return NextResponse.json({ error: 'Collection inconnue', collectionId }, { status: 404 })
    }

    // Validate the Penpot URL
    const { fileId } = parsePenpotUrl(penpotUrl)
    if (!fileId) {
      return NextResponse.json(
        { error: 'URL Penpot invalide. Format attendu : https://design.penpot.app/#/view?file-id=...&page-id=...' },
        { status: 400 },
      )
    }

    // Obtain a frame registry — try the Penpot API first, fall back to pasted JSON
    let registry = null as Awaited<ReturnType<typeof fetchPenpotRegistry>>
    let fetchError: string | null = null

    try {
      registry = await fetchPenpotRegistry(penpotUrl)
    } catch (e) {
      fetchError = (e as Error).message
    }

    if (!registry) {
      // API not reachable — use the pasted JSON if provided
      if (!registryJson) {
        return NextResponse.json({
          error: 'Impossible de récupérer le fichier Penpot via l\'API (fichier privé ou non accessible).',
          hint: 'Collez un registry JSON exporté depuis Penpot (champ registryJson).',
          fetchError,
          // Provide the expected frame names so the designer knows what to create
          expectedFrames: collection.packs.flatMap((p) =>
            p.modules.flatMap((m) =>
              m.variants.map((v) => v.frame.expectedFrameName),
            ),
          ),
        }, { status: 422 })
      }
      try {
        registry = parsePastedRegistry(penpotUrl, registryJson)
      } catch (e) {
        return NextResponse.json(
          { error: 'Registry JSON invalide', detail: (e as Error).message },
          { status: 400 },
        )
      }
    }

    // Run detection
    const detection = detectCollection(collection, registry)

    // Apply detection to the Collection (stamps frameIds, pageIds, syncReport)
    const prevVariantCount = countVariants(collection)
    const prevDetected = countDetectedFrames(collection)
    let updated = applyDetection(collection, detection)
    const newDetected = countDetectedFrames(updated)
    void prevVariantCount; void prevDetected; void newDetected

    // Bump version based on what changed
    const prevReport = collection.penpot.lastSyncReport
    const bump = computeVersionBump(
      prevReport,
      detection.report,
      prevVariantCount,
      countVariants(updated),
    )
    const newVersion = collection.version === '0.0.0'
      ? '1.0.0'
      : bumpVersion(collection.version, bump)
    updated = { ...updated, version: newVersion, publishedAt: updated.publishedAt || new Date().toISOString() }

    // Validate
    const validation = validateCollection(updated)

    // Persist
    saveDetectedCollection(updated)

    return NextResponse.json({
      success: true,
      collectionId: updated.id,
      version: updated.version,
      syncStatus: updated.penpot.lastSyncStatus,
      report: detection.report,
      validation,
      registrySource: registry.source,
      matchedFrames: detection.report.matchedFrames,
      totalFramesFound: detection.report.totalFramesFound,
      completenessPct: detection.report.completenessPct,
      qualityScore: detection.report.qualityScore,
      passes: validation.passes,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Erreur lors de l\'import', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
