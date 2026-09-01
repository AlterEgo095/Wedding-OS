/**
 * MISSION 5.9.5 — CREDITS CONSUME
 * POST /api/admin/credits/consume
 * Body: { reservationId, note? }
 *
 * Finalizes a reservation (decrements reserved + balance, writes CONSUMPTION tx).
 * Idempotent on reservationId.
 *
 * Protected by PLATFORM_ADMIN auth.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { consumeCredits } from '@/lib/credits/ledger'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const body = await req.json().catch(() => ({}))
  const reservationId = String(body.reservationId ?? '')
  const note = body.note ? String(body.note) : undefined

  if (!reservationId) return NextResponse.json({ error: 'reservationId requis' }, { status: 400 })

  const result = await consumeCredits(reservationId, { createdBy: user.id, note })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, status: result.status }, { status: 400 })
  }

  await db.auditLog.create({
    data: {
      action: 'CREDITS_CONSUMED',
      details: JSON.stringify({ reservationId, consumed: result.consumed }),
      result: 'SUCCESS',
      userId: user.id,
      targetType: 'PRICING',
      targetResourceId: reservationId,
    },
  }).catch(() => null)

  return NextResponse.json(result)
}
