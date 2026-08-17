/**
 * MISSION 5.9.5 — CREDITS SWEEP (expired reservations)
 * POST /api/admin/credits/sweep
 *
 * Auto-releases any RESERVED reservations whose expiresAt is in the past.
 * Can be called manually or by a cron job. Returns the count of swept
 * reservations.
 *
 * Protected by PLATFORM_ADMIN auth.
 */
import { NextResponse } from 'next/server'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { sweepExpiredReservations } from '@/lib/credits/ledger'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await getServerAuthUser()
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const swept = await sweepExpiredReservations()
  return NextResponse.json({ ok: true, swept })
}
