import { NextResponse } from 'next/server'
import { listLatestMarketplacePackages } from '@/lib/collections/registry'

// GET /api/marketplace
//
// Query params:
//   ?category=LUXURY  — filter by category
//   ?limit=50         — max results
//
// The public Marketplace view. Returns only the LATEST version of each
// Collection that has been published to the marketplace (publishedToMarketplace=true
// AND passesValidation=true).

export async function GET(req: Request) {
  const url = new URL(req.url)
  const category = url.searchParams.get('category') || undefined
  const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined

  const packages = await listLatestMarketplacePackages({ category, limit })

  // Group by family for the UI
  const byFamily = new Map<string, typeof packages>()
  for (const p of packages) {
    const fam = p.collectionFamily
    if (!byFamily.has(fam)) byFamily.set(fam, [])
    byFamily.get(fam)!.push(p)
  }

  return NextResponse.json({
    packages,
    count: packages.length,
    families: Array.from(byFamily.entries()).map(([family, items]) => ({ family, count: items.length })),
  })
}
