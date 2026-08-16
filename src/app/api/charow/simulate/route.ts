/**
 * Mission 5.9.4 — WAVE 21: SANDBOX SIMULATE PAYMENT (mock adapter)
 * POST /api/charow/simulate
 *
 * ONLY available in SANDBOX mode. Simulates the server-to-server callback
 * that Charow would send when a customer pays. This lets the full commercial
 * flow be exercised end-to-end without real money.
 *
 * In PRODUCTION mode this route returns 403.
 */
import { NextResponse } from 'next/server'
import { getServerAuthUser } from '@/lib/auth'
import { charowProvider, sandboxConfirmPayment } from '@/lib/payment/charow'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getServerAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  if (charowProvider.mode !== 'SANDBOX') {
    return NextResponse.json(
      { error: 'Simulation disponible uniquement en mode SANDBOX.' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const saleId = String(body.saleId ?? '')
  if (!saleId) {
    return NextResponse.json({ error: 'saleId requis.' }, { status: 400 })
  }

  const confirmed = sandboxConfirmPayment(saleId)
  if (!confirmed) {
    return NextResponse.json(
      { error: 'Sale introuvable ou déjà payée.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    ok: true,
    saleId,
    status: 'PAID',
    message: 'Paiement simulé confirmé. Appelez /api/payment/verify pour finaliser.',
  })
}
