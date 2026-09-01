/**
 * MISSION 5.9.5 — CREDITS LEDGER (transactions)
 * GET /api/admin/credits/[weddingId]/transactions?type=X&limit=200
 *
 * Returns the credit transaction history for the wedding (newest first).
 * Protected by PLATFORM_ADMIN auth.
 */
import { NextResponse } from 'next/server'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { getTransactions, type CreditTypeCode } from '@/lib/credits/ledger'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ weddingId: string }> }) {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const { weddingId } = await params
  if (!weddingId) {
    return NextResponse.json({ error: 'weddingId requis' }, { status: 400 })
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type') as CreditTypeCode | null
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200))

  const transactions = await getTransactions(weddingId, type ? { creditType: type, limit } : { limit })
  return NextResponse.json({ weddingId, transactions })
}
