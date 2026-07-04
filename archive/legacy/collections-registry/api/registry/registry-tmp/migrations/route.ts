import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'

// GET /api/registry/migrations
//
// Query params:
//   ?collectionId=xxx  — filter by collection
//   ?status=PENDING    — filter by status (PENDING, APPROVED, APPLIED)
//
// Lists all migration records. Used by the admin Migration Dashboard.
//
// AUTH: PLATFORM_ADMIN only — migration records are platform-level metadata.

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  const denied = requirePlatformAdmin(user)
  if (denied) return denied

  const url = new URL(req.url)
  const collectionId = url.searchParams.get('collectionId') || undefined
  const status = url.searchParams.get('status') || undefined

  const where: Record<string, unknown> = {}
  if (collectionId) where.collectionId = collectionId
  if (status) where.status = status

  const migrations = await db.collectionMigration.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      fromPackage: { select: { id: true, collectionVersion: true, packageHash: true } },
      toPackage: { select: { id: true, collectionVersion: true, packageHash: true, qualityScore: true, visualScore: true, passesValidation: true } },
    },
  })

  return NextResponse.json({ migrations, count: migrations.length })
}
