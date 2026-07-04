import { NextRequest, NextResponse } from 'next/server'
import { migrateWedding } from '@/lib/collections/registry'
import { getAuthUser, requireRole, assertWeddingAccess } from '@/lib/auth'

// POST /api/registry/migrate
//
// Body:
//   { weddingId, toPackageId, frameRemapping?: { businessId: replacementBusinessId } }
//
// Migrates a Wedding's binding from its current Collection version to a new one.
// Uses the stored CollectionMigration record (compareManifests diff).
// - patch + minor bumps: auto-migratable (defaults applied for removed frames)
// - major bumps: require manual approval (status='APPROVED') + explicit frameRemapping
//
// AUTH: PLATFORM_ADMIN (any wedding) or ORGANIZER (own wedding only).

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    const denied = requireRole(user, ['PLATFORM_ADMIN', 'ORGANIZER'])
    if (denied) return denied

    const body = await req.json()
    const { weddingId, toPackageId, frameRemapping } = body as {
      weddingId: string
      toPackageId: string
      frameRemapping?: Record<string, string>
    }

    if (!weddingId || !toPackageId) {
      return NextResponse.json(
        { error: 'weddingId and toPackageId are required' },
        { status: 400 },
      )
    }

    // Tenant lock
    if (!assertWeddingAccess(user!, weddingId)) {
      return NextResponse.json(
        { error: 'Forbidden — you can only migrate your own wedding' },
        { status: 403 },
      )
    }

    const result = await migrateWedding({ weddingId, toPackageId, frameRemapping })

    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: 'Migration failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
