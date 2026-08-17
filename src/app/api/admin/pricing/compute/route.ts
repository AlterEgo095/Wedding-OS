/**
 * MISSION 5.9.5 — PRICING COMPUTE (test endpoint)
 * POST /api/admin/pricing/compute
 * Body: { customerType, creditType, quantity }
 *
 * Returns the price quote WITHOUT creating any order or payment. Useful for:
 *   - the admin UI to preview prices before publishing
 *   - the checkout page to display the total before redirecting to Charow
 *   - testing the pricing engine after a config change
 *
 * Protected by PLATFORM_ADMIN auth (so external callers can't probe prices).
 */
import { NextResponse } from 'next/server'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { computePrice, type CustomerTier, type CreditTypeCode } from '@/lib/pricing-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const body = await req.json().catch(() => ({}))
  const customerType = (body.customerType || 'STANDARD') as CustomerTier
  const creditType = (body.creditType || 'INVITATION') as CreditTypeCode
  const quantity = Math.max(0, Math.floor(Number(body.quantity) || 0))

  if (quantity <= 0) {
    return NextResponse.json({ error: 'quantity doit etre > 0' }, { status: 400 })
  }

  const quote = await computePrice({ customerType, creditType, quantity })
  return NextResponse.json({ quote })
}
