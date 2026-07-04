import { NextResponse } from 'next/server'
import { listPackages, listLatestMarketplacePackages } from '@/lib/collections/registry'

// GET /api/registry/packages
//
// Query params:
//   ?collectionId=xxx       — filter by collection
//   ?marketplaceOnly=true   — only marketplace-published packages
//   ?passesOnly=true        — only packages that passed validation
//   ?category=LUXURY        — filter by category
//   ?latest=true            — only the latest version per collection (marketplace view)
//   ?limit=50               — max results
//
// Returns the list of compiled packages stored in the Registry.

export async function GET(req: Request) {
  const url = new URL(req.url)
  const collectionId = url.searchParams.get('collectionId') || undefined
  const marketplaceOnly = url.searchParams.get('marketplaceOnly') === 'true'
  const passesOnly = url.searchParams.get('passesOnly') === 'true'
  const category = url.searchParams.get('category') || undefined
  const latest = url.searchParams.get('latest') === 'true'
  const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined

  if (latest) {
    const packages = await listLatestMarketplacePackages({ category, limit })
    return NextResponse.json({ packages, count: packages.length, view: 'latest-marketplace' })
  }

  const packages = await listPackages({ collectionId, marketplaceOnly, passesOnly, category, limit })
  return NextResponse.json({ packages, count: packages.length, view: 'all' })
}
