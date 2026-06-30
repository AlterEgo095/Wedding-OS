import { NextResponse } from 'next/server'
import { listCollections, listFamilies } from '@/lib/collections/catalog'
import { countModules, countVariants, computeQualityScore } from '@/lib/collections/types'

export const dynamic = 'force-static'

// GET /api/collections — list all Premium Collections (catalog)
export async function GET() {
  const collections = listCollections().map((c) => ({
    id: c.id,
    name: c.name,
    family: c.family,
    category: c.category,
    tier: c.tier,
    tagline: c.tagline,
    description: c.description,
    coverImage: c.coverImage,
    completionPct: c.completionPct,
    version: c.version,
    designer: c.designer,
    publishedAt: c.publishedAt,
    priceFcfa: c.priceFcfa,
    priceUsd: c.priceUsd,
    designSystem: c.designSystem,
    stats: {
      packs: c.packs.length,
      modules: countModules(c),
      variants: countVariants(c),
      qualityScore: computeQualityScore(c),
    },
  }))

  const families = listFamilies().map((f) => ({
    family: f.family,
    count: f.collections.length,
    collectionIds: f.collections.map((c) => c.id),
  }))

  return NextResponse.json({
    collections,
    families,
    total: collections.length,
  })
}
