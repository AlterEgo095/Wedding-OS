import { NextResponse } from 'next/server'
import { getPackageById, getPackageVersions, extractManifest } from '@/lib/collections/registry'

// GET /api/registry/packages/[id]
//
// Query params:
//   ?manifest=true  — include the full signed manifest in the response
//   ?versions=true  — list all versions of the same collectionId (overrides manifest)
//
// Returns a single compiled package. The manifest is excluded by default
// (it can be large) — request it explicitly with ?manifest=true.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(req.url)
  const includeManifest = url.searchParams.get('manifest') === 'true'
  const includeVersions = url.searchParams.get('versions') === 'true'

  if (includeVersions) {
    const versions = await getPackageVersions(id)
    return NextResponse.json({ collectionId: id, versions })
  }

  const pkg = await getPackageById(id)
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found', id }, { status: 404 })
  }

  if (includeManifest) {
    try {
      const manifest = extractManifest(pkg)
      return NextResponse.json({ package: pkg, manifest })
    } catch (e) {
      return NextResponse.json({
        error: 'Manifest signature verification failed',
        detail: (e as Error).message,
      }, { status: 500 })
    }
  }

  // Strip the manifestJson from the default response (it's large)
  const { manifestJson, ...safePkg } = pkg
  return NextResponse.json({ package: safePkg })
}
