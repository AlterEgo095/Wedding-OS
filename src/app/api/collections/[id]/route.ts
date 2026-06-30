import { NextResponse } from 'next/server'
import { getCollection } from '@/lib/collections/catalog'
import { countModules, countVariants, computeQualityScore } from '@/lib/collections/types'

export const dynamic = 'force-static'

// GET /api/collections/[id] — full Collection detail with all packs/modules/variants
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const collection = getCollection(id)

  if (!collection) {
    return NextResponse.json(
      { error: 'Collection not found', id },
      { status: 404 },
    )
  }

  return NextResponse.json({
    collection,
    stats: {
      packs: collection.packs.length,
      modules: countModules(collection),
      variants: countVariants(collection),
      qualityScore: computeQualityScore(collection),
      completionPct: collection.completionPct,
    },
  })
}
