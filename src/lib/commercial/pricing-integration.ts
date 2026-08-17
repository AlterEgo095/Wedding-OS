// ══════════════════════════════════════════════════════════════════════════════
// src/lib/commercial/pricing-integration.ts — MISSION 5.9.5
// ══════════════════════════════════════════════════════════════════════════════
//
// Bridges the pricing engine + credit ledger into the existing commercial
// module. These helpers are called by:
//   - meterInvitationUsage() — to compute the tiered price + reserve credits
//   - provisionFromOrder()   — to grant credits when a payment is verified
//   - /api/checkout/charow   — to compute the price for an invitation pack
//
// SERVER-SIDE AUTHORITY: the browser NEVER sends a price. The server resolves
// the customer tier from the Customer row and calls computePrice() to get the
// total. This prevents client-side price manipulation.
// ══════════════════════════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { computePrice, resolveCustomerTier, type CustomerTier, type CreditTypeCode, type PriceQuote } from '@/lib/pricing-engine'
import { grantCredits } from '@/lib/credits/ledger'

// ─── computeInvitationPriceForWedding ────────────────────────────────────────
// Resolves the customer tier from the wedding's Customer row, then calls
// computePrice. Used by meterInvitationUsage and the checkout route.
export async function computeInvitationPriceForWedding(
  weddingId: string,
  quantity: number,
): Promise<{ quote: PriceQuote; customerTier: CustomerTier; customerId: string | null }> {
  // Load the wedding + customer in one query
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      customerId: true,
      slug: true,
      customer: true,
    },
  })

  const customerTier = resolveCustomerTier(wedding?.customer || null)
  const quote = await computePrice({
    customerType: customerTier,
    creditType: 'INVITATION',
    quantity,
  })

  return { quote, customerTier, customerId: wedding?.customerId || null }
}

// ─── grantCreditsFromOrder ────────────────────────────────────────────────────
// Called by provisionFromOrder after a payment is VERIFIED. Scans the order
// items and grants credits:
//   - PER_INVITATION items → grant INVITATION credits = quantity
//   - ESSENTIEL/PREMIUM/ELITE plan items → grant base credits per plan
//
// Idempotent: grantCredits dedupes on (sourceOrderId, creditType, reason='PURCHASE').
export async function grantCreditsFromOrder(orderId: string, weddingId: string | null): Promise<{
  granted: Array<{ creditType: CreditTypeCode; quantity: number; skipped: boolean }>
}> {
  if (!weddingId) {
    logger.warn('grantCreditsFromOrder: no weddingId — skipping credit grant', { orderId })
    return { granted: [] }
  }

  const order = await db.commercialOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) {
    logger.warn('grantCreditsFromOrder: order not found', { orderId })
    return { granted: [] }
  }

  const results: Array<{ creditType: CreditTypeCode; quantity: number; skipped: boolean }> = []

  for (const item of order.items) {
    // PER_INVITATION items: grant INVITATION credits = quantity
    if (item.planId === 'PER_INVITATION') {
      const r = await grantCredits({
        weddingId,
        creditType: 'INVITATION',
        quantity: item.quantity,
        sourceOrderId: orderId,
        source: 'ORDER',
        note: `Order ${orderId} — ${item.description}`,
        createdBy: 'charow-webhook',
      })
      results.push({ creditType: 'INVITATION', quantity: item.quantity, skipped: r.skipped })
    }
    // Plan items: grant base credits per plan (in addition to entitlements)
    // ESSENTIEL: 50 base invitations, PREMIUM: 150 base, ELITE: 500 base
    else if (item.planId === 'ESSENTIEL') {
      const r = await grantCredits({
        weddingId,
        creditType: 'INVITATION',
        quantity: 50,
        sourceOrderId: orderId,
        source: 'PLAN',
        note: `ESSENTIEL plan — 50 base invitations`,
        createdBy: 'charow-webhook',
      })
      results.push({ creditType: 'INVITATION', quantity: 50, skipped: r.skipped })
    } else if (item.planId === 'PREMIUM') {
      const r = await grantCredits({
        weddingId,
        creditType: 'INVITATION',
        quantity: 150,
        sourceOrderId: orderId,
        source: 'PLAN',
        note: `PREMIUM plan — 150 base invitations`,
        createdBy: 'charow-webhook',
      })
      results.push({ creditType: 'INVITATION', quantity: 150, skipped: r.skipped })
    } else if (item.planId === 'ELITE') {
      const r = await grantCredits({
        weddingId,
        creditType: 'INVITATION',
        quantity: 500,
        sourceOrderId: orderId,
        source: 'PLAN',
        note: `ELITE plan — 500 base invitations`,
        createdBy: 'charow-webhook',
      })
      results.push({ creditType: 'INVITATION', quantity: 500, skipped: r.skipped })
    }
  }

  logger.info('grantCreditsFromOrder: complete', { orderId, weddingId, items: results.length })
  return { granted: results }
}
