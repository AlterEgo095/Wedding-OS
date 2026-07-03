export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { applyCollection, ApplyError, type PaletteOverride } from '@/lib/collections';
import type { Plan } from '@/lib/types';

/**
 * POST /api/collections/apply — deploy a Collection on the resolved wedding.
 *
 * Body: { collectionId: string, variantId?: string, paletteOverride?: PaletteOverride }
 *
 * Auth: ORGANIZER+ only (couples can apply a Collection to their own wedding).
 * Reuses the existing withAdminTenantHandler middleware for tenant resolution
 * + auth — same pattern as PUT /api/theme.
 *
 * Idempotent: re-applying the same Collection + Variant + palette is a no-op.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json()
      const { collectionId, variantId, paletteOverride } = body as {
        collectionId?: string
        variantId?: string | null
        paletteOverride?: PaletteOverride | null
      }

      if (!collectionId || typeof collectionId !== 'string') {
        return NextResponse.json({ error: 'collectionId requis' }, { status: 400 })
      }

      try {
        const result = await applyCollection({
          weddingId: ctx.weddingId,
          collectionId,
          variantId: variantId ?? null,
          paletteOverride: paletteOverride ?? null,
          billingPlan: ctx.plan as Plan,
        })
        return NextResponse.json(result)
      } catch (e) {
        if (e instanceof ApplyError) {
          return NextResponse.json({ error: e.message }, { status: e.statusCode })
        }
        throw e
      }
    })
  } catch (error) {
    console.error('Apply collection error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
