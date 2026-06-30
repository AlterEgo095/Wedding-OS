export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withPublicTenant } from '@/lib/tenant-context';
import { getCollection } from '@/lib/collections';
import type { Plan } from '@/lib/types';

/**
 * GET /api/collections/[id] — public detail (with variants), filtered by plan.
 *
 * Returns the Collection + its variants, or 404 if not found / not accessible.
 */
export const GET = withPublicTenant(async (req: NextRequest, ctx) => {
  try {
    const id = req.nextUrl.pathname.split('/').pop() as string
    const plan = ctx.plan as Plan
    const collection = await getCollection(id, plan)
    if (!collection) {
      return NextResponse.json({ error: 'Collection introuvable' }, { status: 404 })
    }
    return NextResponse.json({ collection })
  } catch (error) {
    console.error('Get collection error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
