import { NextResponse } from 'next/server'
import { getCollection } from '@/lib/collections/catalog'
import { countModules, countVariants } from '@/lib/collections/types'

// POST /api/collections/deploy — register a deployment plan
// Body: { collectionId, weddingId?, couple: {bride,groom,date,venue}, variantSelections: {moduleId: variantId} }
// This produces a deployment manifest (the actual application to a Wedding happens
// via the existing Theme apply endpoint — this route validates the selection).
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { collectionId, couple, variantSelections } = body as {
      collectionId: string
      couple?: { bride?: string; groom?: string; date?: string; venue?: string }
      variantSelections?: Record<string, string>
    }

    const collection = getCollection(collectionId)
    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found', collectionId },
        { status: 404 },
      )
    }

    // Build deployment manifest
    const manifest = {
      collectionId: collection.id,
      collectionName: collection.name,
      designSystem: collection.designSystem,
      couple: {
        bride: couple?.bride || 'Hornella',
        groom: couple?.groom || 'Josué',
        date: couple?.date || '',
        venue: couple?.venue || '',
      },
      selections: collection.packs.flatMap((p) =>
        p.modules.map((m) => {
          const chosen = variantSelections?.[m.id] || m.variants[0]?.id || 'A'
          const variant = m.variants.find((v) => v.id === chosen) || m.variants[0]
          return {
            pack: p.id,
            packName: p.name,
            moduleId: m.id,
            moduleName: m.name,
            variantId: variant?.id,
            variantName: variant?.name,
            renderer: variant?.renderer,
            required: m.required,
          }
        }),
      ),
      stats: {
        packs: collection.packs.length,
        modules: countModules(collection),
        variants: countVariants(collection),
        completionPct: collection.completionPct,
      },
      deployedAt: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      manifest,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Invalid request', detail: (e as Error).message },
      { status: 400 },
    )
  }
}
