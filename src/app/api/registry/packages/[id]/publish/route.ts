import { NextRequest, NextResponse } from 'next/server'
import { publishToMarketplace, unpublishFromMarketplace } from '@/lib/collections/registry'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'

// POST /api/registry/packages/[id]/publish
// Toggles marketplace publication. A package can only be published if it passed
// structural validation (passesValidation=true).
//
// Body: { publish: boolean }
//
// AUTH: PLATFORM_ADMIN only.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(req)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const { id } = await params
    const body = await req.json()
    const publish = body?.publish !== false // default true

    if (publish) {
      await publishToMarketplace(id)
      return NextResponse.json({ success: true, id, publishedToMarketplace: true })
    } else {
      await unpublishFromMarketplace(id)
      return NextResponse.json({ success: true, id, publishedToMarketplace: false })
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'Publish failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
