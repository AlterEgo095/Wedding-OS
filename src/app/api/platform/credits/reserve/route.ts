/**
 * MISSION 5.9.5 — CREDITS RESERVE
 * POST /api/admin/credits/reserve
 * Body: { weddingId, creditType, quantity, idempotencyKey, jobId?, ttlMinutes? }
 *
 * Reserves N credits (moves them to "reserved"). Idempotent on idempotencyKey.
 * FAIL-CLOSED: rejects if available (balance - reserved) < N.
 *
 * Protected by PLATFORM_ADMIN auth (the bulk invitation generator calls this
 * server-side; for direct admin testing, this route is also exposed).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { reserveCredits, type CreditTypeCode } from '@/lib/credits/ledger'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const body = await req.json().catch(() => ({}))
  const weddingId = String(body.weddingId ?? '')
  const creditType = String(body.creditType ?? 'INVITATION') as CreditTypeCode
  const quantity = Math.max(0, Math.floor(Number(body.quantity) || 0))
  const idempotencyKey = String(body.idempotencyKey ?? '')
  const jobId = body.jobId ? String(body.jobId) : undefined
  const ttlMinutes = body.ttlMinutes ? Math.max(1, Math.floor(Number(body.ttlMinutes))) : 30

  if (!weddingId) return NextResponse.json({ error: 'weddingId requis' }, { status: 400 })
  if (!idempotencyKey) return NextResponse.json({ error: 'idempotencyKey requis' }, { status: 400 })
  if (quantity <= 0) return NextResponse.json({ error: 'quantity doit etre > 0' }, { status: 400 })

  const result = await reserveCredits({ weddingId, creditType, quantity, idempotencyKey, jobId, ttlMinutes, source: 'MANUAL' })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 402 })
  }

  await db.auditLog.create({
    data: {
      weddingId,
      userId: user.id,
      action: 'CREDITS_RESERVED',
      details: JSON.stringify({ creditType, quantity, idempotencyKey, reservationId: result.reservationId }),
      result: 'SUCCESS',
      targetType: 'WEDDING',
      targetResourceId: weddingId,
    },
  }).catch(() => null)

  return NextResponse.json(result)
}
