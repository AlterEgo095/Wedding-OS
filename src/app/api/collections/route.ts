export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withPublicTenant } from '@/lib/tenant-context';
import { listCollections } from '@/lib/collections';
import type { Plan } from '@/lib/types';

/**
 * GET /api/collections — public catalog list, filtered by the resolved wedding's plan.
 *
 * Returns all active + published Collections accessible to the caller's billing plan.
 * Auto-seeds Royal Gold on first call (idempotent — zero manual migration).
 *
 * Reuses the existing withPublicTenant middleware (multi-tenant context resolution),
 * so the same endpoint works on root / (default wedding) and /w/[slug] (tenant).
 */
export const GET = withPublicTenant(async (_req, ctx) => {
  try {
    const plan = ctx.plan as Plan
    const collections = await listCollections(plan)
    return NextResponse.json({ collections })
  } catch (error) {
    console.error('List collections error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
