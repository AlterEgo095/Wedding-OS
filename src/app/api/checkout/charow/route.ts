/**
 * Mission 5.9.4 — WAVE 3: CHAROW CHECKOUT (VPS-adapted)
 * POST /api/checkout/charow
 *
 * The server:
 *   1. authenticates the user (AdminUser session)
 *   2. receives ONLY { planId, currency? } from the browser
 *   3. looks up the plan + price from the DB (NEVER trusts a browser price)
 *   4. finds or creates the Customer (linked by email)
 *   5. creates CommercialOrder + OrderItem via the commercial module
 *   6. creates a unique reference (idempotency key)
 *   7. resolves the Charow product ID for the plan
 *   8. calls Charow via the adapter (real API or sandbox)
 *   9. creates a Payment row (status AWAITING_VERIFICATION)
 *  10. returns ONLY the checkout URL + sale id
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser } from '@/lib/auth'
import { charowProvider, resolveCharowProductId } from '@/lib/payment/charow'
import { createOrder, addOrderItem, recalculateOrderTotals, createPayment } from '@/lib/commercial'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // ── 1. Auth ──────────────────────────────────────────────────────────
  const user = await getServerAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const planId = String(body.planId ?? '')
  const currency = (body.currency === 'fcfa' ? 'fcfa' : 'usd') as 'usd' | 'fcfa'
  if (!planId) {
    return NextResponse.json({ error: 'planId requis.' }, { status: 400 })
  }

  // ── 2. Look up plan + price FROM THE DB ──────────────────────────────
  const dbPlan = await db.plan.findUnique({ where: { id: planId } })
  if (!dbPlan || dbPlan.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Plan invalide.' }, { status: 400 })
  }

  // SERVER determines the price. Browser never sends an amount.
  const amount = currency === 'fcfa' ? dbPlan.priceFcfa : dbPlan.priceUsdCents
  if (amount === 0) {
    return NextResponse.json({ error: 'Ce plan est gratuit. Aucun paiement requis.' }, { status: 400 })
  }

  // ── 3. Find or create Customer (linked by email) ─────────────────────
  let customer = await db.customer.findUnique({ where: { email: user.email } })
  if (!customer) {
    customer = await db.customer.create({
      data: {
        type: 'INDIVIDUAL',
        displayName: user.name || user.email,
        email: user.email,
        status: 'ACTIVE',
        currency,
      },
    })
  }

  // ── 4. Create CommercialOrder + OrderItem ────────────────────────────
  const order = await createOrder({
    customerId: customer.id,
    weddingId: user.weddingId || undefined,
    currency,
  })
  // Set status to PENDING_CONFIRMATION (createOrder defaults to DRAFT)
  await db.commercialOrder.update({
    where: { id: order.id },
    data: { status: 'PENDING_CONFIRMATION', subtotal: amount, total: amount },
  })

  await addOrderItem(order.id, {
    description: `Offre ${dbPlan.name}`,
    planId: dbPlan.code, // store the plan CODE (provisionFromOrder checks code)
    quantity: 1,
    unitPrice: amount,
  })
  await recalculateOrderTotals(order.id)

  // ── 5. Unique reference (idempotency key) ────────────────────────────
  const reference = `WOS-${order.id}-${randomBytes(4).toString('hex')}`

  // ── 6. Resolve Charow product ID ─────────────────────────────────────
  const productId = resolveCharowProductId(dbPlan.code)

  // ── 7. Call Charow via the adapter ───────────────────────────────────
  // Build origin from forwarded headers (behind nginx reverse proxy)
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host
  const fwdProto = req.headers.get('x-forwarded-proto') || 'https'
  const origin = `${fwdProto}://${fwdHost}`
  let checkout
  try {
    checkout = await charowProvider.createCheckout({
      reference,
      amount,
      currency,
      description: `Wedding OS — Offre ${dbPlan.name}`,
      customerEmail: customer.email ?? user.email,
      customerName: customer.displayName,
      customerPhone: customer.phone ?? undefined,
      customerCountryCode: customer.country || 'CD',
      productId,
      successUrl: `${origin}/?view=payment-success&sale={SALE_ID}`,
      cancelUrl: `${origin}/?view=plans&checkout=cancelled`,
      webhookUrl: `${origin}/api/webhooks/charow`,
    })
  } catch (err) {
    console.error('[checkout/charow] createCheckout error:', err)
    return NextResponse.json(
      { error: `Erreur Charow: ${err instanceof Error ? err.message : 'UNKNOWN'}`, code: 'CHAROW_ERROR' },
      { status: 502 }
    )
  }

  // ── 8. Create Payment row ────────────────────────────────────────────
  await createPayment({
    orderId: order.id,
    weddingId: user.weddingId || undefined,
    amount,
    currency,
    method: 'EXTERNAL_PROVIDER',
    reference: `${checkout.saleId}|${reference}`,
    senderName: customer.displayName,
    senderPhone: customer.phone || undefined,
  })

  // ── 9. Audit ─────────────────────────────────────────────────────────
  await db.auditLog.create({
    data: {
      weddingId: user.weddingId || null,
      userId: user.id,
      action: 'CHECKOUT_CREATED',
      details: JSON.stringify({
        orderId: order.id,
        plan: dbPlan.code,
        amount,
        currency,
        saleId: checkout.saleId,
        customer: customer.id,
        mode: charowProvider.mode,
      }),
    },
  }).catch(() => null)

  // ── 10. Return ONLY the checkout URL + sale id ───────────────────────
  // Replace the {SALE_ID} placeholder in the success URL with the real sale id
  const finalSuccessUrl = checkout.checkoutUrl.includes('chariow.com') || checkout.checkoutUrl.startsWith('http')
    ? undefined // real Charow URL — the redirect_url was already sent to Charow
    : checkout.checkoutUrl

  return NextResponse.json({
    checkoutUrl: checkout.checkoutUrl,
    saleId: checkout.saleId,
    orderId: order.id,
    reference,
    mode: charowProvider.mode,
    productId: productId || null,
  })
}
