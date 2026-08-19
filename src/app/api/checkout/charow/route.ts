/**
 * MISSION 5.9.5 — CHAROW CHECKOUT (VPS-adapted, pricing-engine integrated)
 * POST /api/checkout/charow
 *
 * Two checkout modes:
 *   1. PLAN — body: { mode: 'PLAN', planId, currency? }
 *      Buys a subscription plan (TRIAL/ESSENTIEL/PREMIUM/ELITE). Price from DB.
 *   2. INVITATION_PACK — body: { mode: 'INVITATION_PACK', quantity, currency? }
 *      Buys N invitation credits. Price computed server-side by the pricing
 *      engine (tiered for STANDARD, flat $0.50 for AGENCY/RESELLER/WEDDING_PLANNER).
 *
 * SECURITY:
 *   - The browser NEVER sends a price. The server resolves the price from the
 *     DB (PLAN) or the pricing engine (INVITATION_PACK).
 *   - The customer tier is resolved from the Customer row linked to the user's
 *     wedding — the browser can't spoof the tier.
 *   - The OrderItem is created with the SERVER-computed unitPrice + total.
 *
 * Idempotency:
 *   - Each checkout gets a unique reference (WOS-{orderId}-{random}).
 *   - Re-calling with the same body creates a NEW order (intentional — the user
 *     may retry after a failed payment). The Payment.reference dedupes webhook
 *     delivery at the verify step.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser } from '@/lib/auth'
import { charowProvider, resolveCharowProductId } from '@/lib/payment/charow'
import { createOrder, addOrderItem, recalculateOrderTotals, createPayment } from '@/lib/commercial'
import { computeInvitationPriceForWedding } from '@/lib/commercial/pricing-integration'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // ── 1. Auth ──────────────────────────────────────────────────────────
  const user = await getServerAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const mode = body.mode === 'INVITATION_PACK' ? 'INVITATION_PACK' : 'PLAN'
  const currency = (body.currency === 'fcfa' ? 'fcfa' : 'usd') as 'usd' | 'fcfa'

  // ── 2. Resolve the amount + description based on mode ────────────────
  let amount = 0
  let description = ''
  let planCode: string | null = null
  let unitPrice = 0
  let quantity = 1

  if (mode === 'PLAN') {
    const planId = String(body.planId ?? '')
    if (!planId) {
      return NextResponse.json({ error: 'planId requis (mode PLAN).' }, { status: 400 })
    }
    // P595B-P1-5.1 — Accept Plan.id (cuid) OR Plan.code (ESSENTIEL/PREMIUM/ELITE).
    // The frontend CheckoutButton passes the code (more readable + stable across
    // DB reseeds). We try code first, then fall back to id for backward compat.
    let dbPlan = await db.plan.findUnique({ where: { code: planId } })
    if (!dbPlan) {
      dbPlan = await db.plan.findUnique({ where: { id: planId } })
    }
    if (!dbPlan || dbPlan.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Plan invalide.' }, { status: 400 })
    }
    amount = currency === 'fcfa' ? dbPlan.priceFcfa : dbPlan.priceUsdCents
    if (amount === 0) {
      return NextResponse.json({ error: 'Ce plan est gratuit. Aucun paiement requis.' }, { status: 400 })
    }
    description = `Wedding OS — Offre ${dbPlan.name}`
    planCode = dbPlan.code
  } else {
    // INVITATION_PACK mode
    quantity = Math.max(1, Math.floor(Number(body.quantity) || 0))
    if (quantity <= 0) {
      return NextResponse.json({ error: 'quantity doit etre > 0 (mode INVITATION_PACK).' }, { status: 400 })
    }
    if (!user.weddingId) {
      return NextResponse.json({ error: 'Aucun mariage associé à votre compte. Impossible d\'acheter un pack d\'invitations.' }, { status: 400 })
    }
    // Compute the price server-side via the pricing engine
    const { quote, customerTier } = await computeInvitationPriceForWedding(user.weddingId, quantity)
    amount = quote.totalCents
    unitPrice = quote.unitPriceCents
    description = `Wedding OS — Pack ${quantity} invitations (${customerTier})`
    planCode = 'PER_INVITATION'
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
  await db.commercialOrder.update({
    where: { id: order.id },
    data: { status: 'PENDING_CONFIRMATION', subtotal: amount, total: amount },
  })

  await addOrderItem(order.id, {
    description,
    planId: planCode || undefined,
    quantity,
    unitPrice: mode === 'PLAN' ? amount : unitPrice,
  })
  await recalculateOrderTotals(order.id)

  // ── 5. Unique reference (idempotency key) ────────────────────────────
  const reference = `WOS-${order.id}-${randomBytes(4).toString('hex')}`

  // ── 6. Resolve Charow product ID ─────────────────────────────────────
  const productId = mode === 'PLAN'
    ? resolveCharowProductId(planCode!)
    : (process.env.CHAROW_PRODUCT_INVITATION_PACK || undefined)

  // ── 7. Call Charow via the adapter ───────────────────────────────────
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host
  const fwdProto = req.headers.get('x-forwarded-proto') || 'https'
  const origin = `${fwdProto}://${fwdHost}`
  let checkout
  try {
    checkout = await charowProvider.createCheckout({
      reference,
      amount,
      currency,
      description,
      customerEmail: customer.email ?? user.email,
      customerName: customer.displayName,
      customerPhone: customer.phone ?? undefined,
      customerCountryCode: customer.country || 'CD',
      productId,
      // Mission 5.9.5-B Phase 3.2 — successUrl uses `orderId` (which we know
      // BEFORE the createCheckout call) instead of the literal `{SALE_ID}`
      // placeholder (which Charow may or may not substitute — untested).
      // The browser lands on /?view=payment-success&orderId=<orderId> after
      // the customer pays on Charow. The webhook (/api/webhooks/charow) is
      // the canonical provisioning trigger — the successUrl is just UX
      // feedback (PaymentStatusBanner). In sandbox, the GET /api/payment/verify
      // redirect still appends `sale=<saleId>` (which we know after the
      // sandbox ledger mutation), so the banner can re-verify server-side.
      successUrl: `${origin}/?view=payment-success&orderId=${order.id}`,
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
        mode,
        plan: planCode,
        quantity,
        amount,
        currency,
        saleId: checkout.saleId,
        customer: customer.id,
        providerMode: charowProvider.mode,
      }),
    },
  }).catch(() => null)

  // ── 10. Return ONLY the checkout URL + sale id ───────────────────────
  return NextResponse.json({
    checkoutUrl: checkout.checkoutUrl,
    saleId: checkout.saleId,
    orderId: order.id,
    reference,
    mode: charowProvider.mode,
    productId: productId || null,
    pricing: { mode, quantity, unitPriceCents: unitPrice, totalCents: amount, currency },
  })
}
