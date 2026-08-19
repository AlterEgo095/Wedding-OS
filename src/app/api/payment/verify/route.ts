/**
 * Mission 5.9.4 — WAVE 4: PAYMENT VERIFICATION (SERVER-SIDE TRUTH)
 * POST /api/payment/verify
 *
 * After the browser redirect back to /?view=payment-success&sale=XXX the
 * frontend calls this endpoint. The server:
 *   1. finds the Payment by sale id (encoded in Payment.reference as "saleId|ref")
 *   2. queries Charow SERVER-SIDE for the real sale status
 *   3. verifies sale_id, amount, currency, status
 *   4. if PAID → confirmOrder + verifyPayment (which auto-provisions)
 *   5. if already VERIFIED → does NOT re-provision (idempotent)
 *
 * The browser redirect is NEVER considered proof of payment.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser } from '@/lib/auth'
import { charowProvider } from '@/lib/payment/charow'
import { confirmOrder, verifyPayment, rejectPayment } from '@/lib/commercial'

export const dynamic = 'force-dynamic'


/**
 * Mission 5.9.4 — GET /api/payment/verify?sale=<saleId>
 *
 * Browser redirect handler (sandbox flow). The simulate-callback route
 * redirects here via GET after the customer "pays". This handler:
 *   1. reads saleId from query string
 *   2. runs the same server-side verification as POST
 *   3. redirects to /?view=payment-success or /?view=payment-failed
 *
 * This is safe because the server still queries Charow for the real status
 * — the GET request itself is never trusted as proof of payment.
 */
export async function GET(req: Request) {
  // Build origin from forwarded headers (behind nginx reverse proxy)
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'wedding.hpph.net'
  const fwdProto = req.headers.get('x-forwarded-proto') || 'https'
  const origin = `${fwdProto}://${fwdHost}`
  const url = new URL(req.url)
  const saleId = url.searchParams.get('sale') ?? ''
  if (!saleId) {
    return NextResponse.redirect(new URL('/?view=payment-failed&reason=no_sale', origin))
  }

  // Find the payment by sale id
  const payment = await db.payment.findFirst({
    where: { reference: { startsWith: `${saleId}|` } },
    include: { order: { include: { items: true } } },
  })
  if (!payment) {
    return NextResponse.redirect(new URL('/?view=payment-failed&reason=no_payment', origin))
  }

  // Idempotency: already verified?
  if (payment.status === 'VERIFIED') {
    return NextResponse.redirect(
      new URL(`/?view=payment-success&sale=${encodeURIComponent(saleId)}&idempotent=1`, origin)
    )
  }

  // Query Charow SERVER-SIDE
  let sale
  try {
    sale = await charowProvider.verifyPayment(saleId)
  } catch (err) {
    console.error('[payment/verify GET] Charow verify error:', err)
    return NextResponse.redirect(new URL('/?view=payment-failed&reason=verify_error', origin))
  }

  if (sale.status !== 'PAID') {
    return NextResponse.redirect(
      new URL(`/?view=payment-pending&sale=${encodeURIComponent(saleId)}&status=${sale.status}`, origin)
    )
  }

  // Amount cross-check
  if (sale.amount > 0 && sale.amount !== payment.amount) {
    return NextResponse.redirect(new URL('/?view=payment-failed&reason=amount_mismatch', origin))
  }

  // ── P595B-P2-1 — Currency cross-check (GET path) ──────────────────
  // Mirrors the POST path: if Charow reports a currency different from the
  // Payment row, the customer may have been charged in a different currency
  // than the platform recorded — refuse to provision.
  if (sale.currency && payment.currency && sale.currency !== payment.currency) {
    console.error(`[payment/verify GET] Currency mismatch: sale=${sale.currency} payment=${payment.currency} saleId=${saleId}`)
    await db.auditLog.create({
      data: {
        weddingId: payment.order.weddingId || null,
        userId: null,
        action: 'PAYMENT_REJECTED',
        details: JSON.stringify({
          reason: 'currency_mismatch_get',
          saleId,
          saleCurrency: sale.currency,
          paymentCurrency: payment.currency,
          paymentId: payment.id,
        }),
      },
    }).catch(() => null)
    return NextResponse.redirect(new URL('/?view=payment-failed&reason=currency_mismatch', origin))
  }

  // PAID → confirm + verify (auto-provision)
  try {
    if (payment.order.status !== 'CONFIRMED') {
      await confirmOrder(payment.orderId)
    }
    await verifyPayment(payment.id, payment.verifiedById || null)
  } catch (err) {
    console.error('[payment/verify GET] provisioning error:', err)
    return NextResponse.redirect(new URL('/?view=payment-failed&reason=provisioning', origin))
  }

  return NextResponse.redirect(
    new URL(`/?view=payment-success&sale=${encodeURIComponent(saleId)}&orderId=${payment.orderId}`, origin)
  )
}

export async function POST(req: Request) {
  const user = await getServerAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const saleId = String(body.saleId ?? '')
  if (!saleId) {
    return NextResponse.json({ error: 'saleId requis.' }, { status: 400 })
  }

  // ── 1. Find the payment by sale id ───────────────────────────────────
  const payment = await db.payment.findFirst({
    where: { reference: { startsWith: `${saleId}|` } },
    include: { order: { include: { items: true } } },
  })
  if (!payment) {
    return NextResponse.json({ error: 'Paiement introuvable pour cette référence.' }, { status: 404 })
  }

  // ── 2. Idempotency: already verified? ────────────────────────────────
  if (payment.status === 'VERIFIED') {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      status: 'VERIFIED',
      orderId: payment.orderId,
      message: 'Paiement déjà vérifié. Aucun doublon créé.',
    })
  }

  // ── 3. Query Charow SERVER-SIDE ──────────────────────────────────────
  let sale
  try {
    sale = await charowProvider.verifyPayment(saleId)
  } catch (err) {
    console.error('[payment/verify] Charow verify error:', err)
    return NextResponse.json(
      { ok: false, status: 'ERROR', message: 'Erreur lors de la vérification Charow.' },
      { status: 502 }
    )
  }

  // ── 4. Not paid yet? ─────────────────────────────────────────────────
  if (sale.status !== 'PAID') {
    // Keep the payment in PENDING (awaiting customer payment)
    if (payment.status !== 'PENDING') {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'PENDING' },
      })
    }
    return NextResponse.json({
      ok: false,
      status: sale.status,
      message: `Le paiement n'est pas encore confirmé par Charow (statut: ${sale.status}).`,
    })
  }

  // ── 5. Amount + currency cross-check (server is truth) ──────────────
  if (sale.amount > 0 && sale.amount !== payment.amount) {
    await rejectPayment(payment.id, `AMOUNT_MISMATCH expected=${payment.amount} got=${sale.amount}`)
    await db.auditLog.create({
      data: {
        weddingId: payment.order.weddingId || null,
        userId: user.id,
        action: 'PAYMENT_REJECTED',
        details: JSON.stringify({ paymentId: payment.id, reason: 'AMOUNT_MISMATCH', expected: payment.amount, got: sale.amount }),
      },
    }).catch(() => null)
    return NextResponse.json({ error: 'Écart de montant détecté. Paiement rejeté.' }, { status: 400 })
  }

  // ── P595B-P2-1 — Currency cross-check (POST path) ───────────────────
  // Refuse to provision if the currency reported by Charow differs from the
  // Payment row. A mismatch could indicate the customer was charged in a
  // different currency than the platform expected, or a Charow payload bug.
  if (sale.currency && payment.currency && sale.currency !== payment.currency) {
    await rejectPayment(payment.id, `CURRENCY_MISMATCH expected=${payment.currency} got=${sale.currency}`)
    await db.auditLog.create({
      data: {
        weddingId: payment.order.weddingId || null,
        userId: user.id,
        action: 'PAYMENT_REJECTED',
        details: JSON.stringify({
          paymentId: payment.id,
          reason: 'CURRENCY_MISMATCH',
          expected: payment.currency,
          got: sale.currency,
        }),
      },
    }).catch(() => null)
    return NextResponse.json({ error: 'Écart de devise détecté. Paiement rejeté.' }, { status: 400 })
  }

  // ── 6. PAID → confirm order + verify payment (auto-provisions) ──────
  try {
    // Order must be CONFIRMED before provisionFromOrder will run
    if (payment.order.status !== 'CONFIRMED') {
      await confirmOrder(payment.orderId)
    }
    // verifyPayment sets status=VERIFIED + calls provisionFromOrder internally
    await verifyPayment(payment.id, user.id)
  } catch (err) {
    console.error('[payment/verify] provisioning error:', err)
    return NextResponse.json(
      { ok: false, status: 'PROVISIONING_ERROR', message: `Erreur lors du provisioning: ${err instanceof Error ? err.message : 'UNKNOWN'}` },
      { status: 500 }
    )
  }

  // ── 7. Audit ─────────────────────────────────────────────────────────
  await db.auditLog.create({
    data: {
      weddingId: payment.order.weddingId || null,
      userId: user.id,
      action: 'PAYMENT_VERIFIED',
      details: JSON.stringify({ paymentId: payment.id, orderId: payment.orderId, saleId, amount: payment.amount }),
    },
  }).catch(() => null)

  return NextResponse.json({
    ok: true,
    status: 'VERIFIED',
    orderId: payment.orderId,
    weddingId: payment.order.weddingId,
    message: 'Paiement vérifié et provisioning effectué.',
  })
}
