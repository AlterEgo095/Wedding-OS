export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

/**
 * GET /api/plans — PUBLIC endpoint
 *
 * Returns active + public Plans for the onboarding form.
 * No auth required. Only returns: code, name, description, priceUsdCents,
 * priceFcfa, currency, sortOrder.
 *
 * Mission 5.2 — replaces hardcoded PLANS_PREVIEW in onboarding form.
 */

export async function GET() {
  try {
    const plans = await db.plan.findMany({
      where: {
        status: 'ACTIVE',
        isPublic: true,
      },
      select: {
        code: true,
        name: true,
        description: true,
        priceUsdCents: true,
        priceFcfa: true,
        currency: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }],
    })
    return NextResponse.json({ plans })
  } catch (error) {
    logger.error('Public plans GET error', {
      errMessage: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ plans: [] }, { status: 200 })
  }
}
