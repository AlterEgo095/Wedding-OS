/**
 * MISSION 5.9.5 — CREDITS BALANCE API
 * GET /api/admin/credits/[weddingId]           → all balances for the wedding
 * GET /api/admin/credits/[weddingId]?type=X    → balance for a specific type
 *
 * Protected by PLATFORM_ADMIN auth.
 */
import { NextResponse } from 'next/server'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { getBalance, getBalances, type CreditTypeCode } from '@/lib/credits/ledger'

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

  if (type) {
    const balance = await getBalance(weddingId, type)
    return NextResponse.json({ weddingId, creditType: type, balance })
  }

  const balances = await getBalances(weddingId)
  return NextResponse.json({ weddingId, balances })
}
