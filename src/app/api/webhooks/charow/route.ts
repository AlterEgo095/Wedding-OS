/**
 * Mission 5.9.4 — WAVE 13: CHAROW WEBHOOK (server-to-server callback)
 * POST /api/webhooks/charow
 *
 * Charow sends a server-to-server callback when a payment status changes.
 * The server:
 *   1. reads the raw body + signature header
 *   2. verifies the HMAC signature (production) / trusts (sandbox)
 *   3. extracts the sale id from the payload
 *   4. re-queries Charow SERVER-SIDE (never trusts the webhook body alone)
 *   5. if PAID → confirmOrder + verifyPayment (auto-provisions, idempotent)
 *
 * Returns 200 immediately if the signature is valid (idempotent processing).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { charowProvider } from '@/lib/payment/charow'
import { confirmOrder, verifyPayment } from '@/lib/commercial'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // ── 1. Read raw body + signature ────────────────────────────────────
  const rawBody = await req.text()
  const signature = req.headers.get('x-charow-signature') || req.headers.get('x-charow-hmac-sha256') || ''

  // ── 2. Verify HMAC signature ────────────────────────────────────────
  if (!charowProvider.verifyWebhookSignature(rawBody, signature)) {
    console.warn('[webhooks/charow] Invalid signature — rejecting')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── 3. Parse the payload ────────────────────────────────────────────
  let payload: { sale_id?: string; event?: string; status?: string; data?: { id?: string; status?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const saleId = payload.sale_id || payload.data?.id || ''
  if (!saleId) {
    return NextResponse.json({ error: 'No sale_id in payload' }, { status: 400 })
  }

  console.log(`[webhooks/charow] Received event=${payload.event || 'unknown'} sale=${saleId}`)

  // ── 4. Find the payment ─────────────────────────────────────────────
  const payment = await db.payment.findFirst({
    where: { reference: { startsWith: `${saleId}|` } },
    include: { order: true },
  })
  if (!payment) {
    // Unknown sale — could be from another system. Acknowledge but don't act.
    console.warn(`[webhooks/charow] No payment found for sale ${saleId}`)
    return NextResponse.json({ ok: true, message: 'Sale not tracked' })
  }

  // Idempotent: already verified
  if (payment.status === 'VERIFIED') {
    return NextResponse.json({ ok: true, idempotent: true })
  }

  // ── 5. Re-query Charow SERVER-SIDE (source of truth) ────────────────
  let sale
  try {
    sale = await charowProvider.verifyPayment(saleId)
  } catch (err) {
    console.error('[webhooks/charow] Verify error:', err)
    return NextResponse.json({ ok: false, error: 'Verify failed' }, { status: 502 })
  }

  if (sale.status !== 'PAID') {
    return NextResponse.json({ ok: true, status: sale.status, message: 'Not paid yet' })
  }

  // ── 5.5. Cross-check amount + currency (P595B-P1-1, P595B-P2-1) ────
  // The webhook must NOT trust the sale payload alone — it must verify the
  // amount matches the Payment row. Otherwise a compromised key or a Charow
  // bug could provision $99 entitlements for a $1 payment.
  if (sale.amount > 0 && sale.amount !== payment.amount) {
    console.error(`[webhooks/charow] Amount mismatch: sale=${sale.amount} payment=${payment.amount} saleId=${saleId}`)
    await db.auditLog.create({
      data: {
        weddingId: payment.weddingId || null,
        userId: null,
        action: 'PAYMENT_REJECTED',
        details: JSON.stringify({
          reason: 'amount_mismatch_webhook',
          saleId,
          saleAmount: sale.amount,
          paymentAmount: payment.amount,
          paymentId: payment.id,
        }),
      },
    }).catch(() => null)
    return NextResponse.json(
      { ok: false, error: 'Amount mismatch', saleAmount: sale.amount, paymentAmount: payment.amount },
      { status: 400 }
    )
  }
  if (sale.currency && payment.currency && sale.currency !== payment.currency) {
    console.error(`[webhooks/charow] Currency mismatch: sale=${sale.currency} payment=${payment.currency} saleId=${saleId}`)
    await db.auditLog.create({
      data: {
        weddingId: payment.weddingId || null,
        userId: null,
        action: 'PAYMENT_REJECTED',
        details: JSON.stringify({
          reason: 'currency_mismatch_webhook',
          saleId,
          saleCurrency: sale.currency,
          paymentCurrency: payment.currency,
          paymentId: payment.id,
        }),
      },
    }).catch(() => null)
    return NextResponse.json(
      { ok: false, error: 'Currency mismatch', saleCurrency: sale.currency, paymentCurrency: payment.currency },
      { status: 400 }
    )
  }

  // ── 6. PAID → confirm + verify (auto-provision) ─────────────────────
  try {
    if (payment.order.status !== 'CONFIRMED') {
      await confirmOrder(payment.orderId)
    }
    await verifyPayment(payment.id, payment.verifiedById || 'charow-webhook')
  } catch (err) {
    console.error('[webhooks/charow] Provisioning error:', err)
    return NextResponse.json({ ok: false, error: 'Provisioning failed' }, { status: 500 })
  }

  console.log(`[webhooks/charow] Sale ${saleId} verified + provisioned`)
  return NextResponse.json({ ok: true, status: 'VERIFIED' })
}
