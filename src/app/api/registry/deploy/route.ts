import { NextRequest, NextResponse } from 'next/server'
import { deployToWedding } from '@/lib/collections/registry'
import type { ModuleId, VariantId } from '@/lib/collections/types'
import { getAuthUser, requireRole, assertWeddingAccess } from '@/lib/auth'

// POST /api/registry/deploy
//
// Body:
//   { packageId, weddingId, variantSelections?: { moduleId: 'A'|'B'|'C'|'D' }, overrides?: {} }
//
// Deploys a CompiledPackage to a Wedding by creating/updating the
// WeddingCollectionBinding (the new "reference-only" theme binding).
//
// Per the architectural directive #7: the Theme does NOT copy the full token set.
// It references the CompiledPackage + stores only the couple's OVERRIDES.
//
// The response includes a `legacyPenpotIntegration` blob for backward compat
// with the existing ThemeInjector + PenpotStudio components. The caller should
// write this onto Theme.customizations.penpot via PUT /api/theme.
//
// AUTH: PLATFORM_ADMIN (any wedding) or ORGANIZER (own wedding only).

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    const denied = requireRole(user, ['PLATFORM_ADMIN', 'ORGANIZER'])
    if (denied) return denied

    const body = await req.json()
    const { packageId, weddingId, variantSelections, overrides } = body as {
      packageId: string
      weddingId: string
      variantSelections?: Partial<Record<ModuleId, VariantId>>
      overrides?: Record<string, unknown>
    }

    if (!packageId || !weddingId) {
      return NextResponse.json(
        { error: 'packageId and weddingId are required' },
        { status: 400 },
      )
    }

    // Tenant lock: ORGANIZER can only deploy to their own wedding
    if (!assertWeddingAccess(user!, weddingId)) {
      return NextResponse.json(
        { error: 'Forbidden — you can only deploy to your own wedding' },
        { status: 403 },
      )
    }

    const result = await deployToWedding({ packageId, weddingId, variantSelections, overrides })

    return NextResponse.json({
      success: true,
      ...result,
      instructions: 'Écrivez legacyPenpotIntegration sur Theme.customizations.penpot via PUT /api/theme pour activer le rendu PenpotStudio.',
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Deploy failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
