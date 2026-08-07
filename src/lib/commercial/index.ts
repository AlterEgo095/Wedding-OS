// ══════════════════════════════════════════════════════════════════════════════
// src/lib/commercial/index.ts — Commercial OS Service Layer (Mission 5.0)
// ══════════════════════════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { PRICE_PER_INVITATION_USD_CENTS } from '@/lib/constants'
import { autoTransitionToLive, transitionCommercialStatus } from '@/lib/commercial-status'

// ─── Types ────────────────────────────────────────────────────────────────────
export type CustomerType = 'INDIVIDUAL' | 'COUPLE' | 'BUSINESS' | 'AGENCY' | 'ORGANIZATION'
export type CustomerStatus = 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'ARCHIVED'
export type DealStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
export type OrderStatus = 'DRAFT' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'
export type PaymentMethod = 'MANUAL' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'EXTERNAL_PROVIDER'
export type PaymentStatus = 'PENDING' | 'AWAITING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED'
export type EntitlementType = 'BULK_INVITATIONS' | 'CHECK_IN' | 'CUSTOM_DOMAIN' | 'MAX_GUESTS' | 'MAX_INVITATIONS' | 'PREMIUM_COLLECTIONS'
export type EntitlementOrigin = 'PLAN' | 'ADD_ON' | 'MANUAL_OVERRIDE' | 'PROMOTION' | 'LEGACY'
export type DeliveryChannel = 'LINK' | 'QR' | 'EMAIL' | 'SMS' | 'WHATSAPP'
export type DeliveryStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'CANCELLED'

// ─── Customer ─────────────────────────────────────────────────────────────────
export async function createCustomer(data: {
  type?: string; displayName: string; legalName?: string; email?: string
  phone?: string; whatsapp?: string; country?: string; currency?: string; notes?: string
}) {
  return db.customer.create({
    data: {
      type: data.type || 'INDIVIDUAL',
      displayName: data.displayName,
      legalName: data.legalName || null,
      email: data.email || null,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      country: data.country || 'CD',
      currency: data.currency || 'usd',
      notes: data.notes || null,
    },
  })
}

export async function listCustomers() {
  return db.customer.findMany({
    include: { _count: { select: { weddings: true, deals: true, orders: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── Deal ─────────────────────────────────────────────────────────────────────
export async function createDeal(data: {
  customerId: string; leadId?: string; weddingId?: string; title: string
  estimatedValue?: number; currency?: string; stage?: string; probability?: number
  expectedCloseDate?: Date
}) {
  return db.deal.create({
    data: {
      customerId: data.customerId,
      leadId: data.leadId || null,
      weddingId: data.weddingId || null,
      title: data.title,
      estimatedValue: data.estimatedValue || null,
      currency: data.currency || 'usd',
      stage: data.stage || 'NEW',
      probability: data.probability || 0,
      expectedCloseDate: data.expectedCloseDate || null,
    },
  })
}

export async function listDeals() {
  return db.deal.findMany({
    include: { customer: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── Order ────────────────────────────────────────────────────────────────────
export async function createOrder(data: {
  customerId: string; dealId?: string; weddingId?: string; currency?: string; notes?: string
}) {
  return db.commercialOrder.create({
    data: {
      customerId: data.customerId,
      dealId: data.dealId || null,
      weddingId: data.weddingId || null,
      currency: data.currency || 'usd',
      notes: data.notes || null,
      status: 'DRAFT',
    },
  })
}

export async function addOrderItem(orderId: string, data: {
  description: string; planId?: string; quantity?: number; unitPrice: number
}) {
  const qty = data.quantity || 1
  const total = qty * data.unitPrice
  const item = await db.orderItem.create({
    data: {
      orderId,
      description: data.description,
      planId: data.planId || null,
      quantity: qty,
      unitPrice: data.unitPrice,
      total,
    },
  })
  // Recalculate order totals
  await recalculateOrderTotals(orderId)
  return item
}

export async function recalculateOrderTotals(orderId: string) {
  const items = await db.orderItem.findMany({ where: { orderId } })
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const order = await db.commercialOrder.findUnique({ where: { id: orderId }, select: { discount: true } })
  const discount = order?.discount || 0
  const total = subtotal - discount
  return db.commercialOrder.update({
    where: { id: orderId },
    data: { subtotal, total },
  })
}

export async function listOrders() {
  return db.commercialOrder.findMany({
    include: {
      customer: { select: { displayName: true } },
      items: true,
      payments: { select: { id: true, amount: true, status: true, method: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function confirmOrder(orderId: string) {
  return db.commercialOrder.update({
    where: { id: orderId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  })
}

// ─── Payment ──────────────────────────────────────────────────────────────────
export async function createPayment(data: {
  orderId: string; weddingId?: string; amount: number; currency?: string
  method?: string; reference?: string; senderName?: string; senderPhone?: string; proofUrl?: string
}) {
  const payment = await db.payment.create({
    data: {
      orderId: data.orderId,
      weddingId: data.weddingId || null,
      amount: data.amount,
      currency: data.currency || 'usd',
      method: data.method || 'MANUAL',
      reference: data.reference || null,
      senderName: data.senderName || null,
      senderPhone: data.senderPhone || null,
      proofUrl: data.proofUrl || null,
      status: data.proofUrl || data.reference ? 'AWAITING_VERIFICATION' : 'PENDING',
      submittedAt: data.proofUrl || data.reference ? new Date() : null,
    },
  })
  return payment
}

export async function verifyPayment(paymentId: string, verifiedById: string) {
  // Idempotent: if already verified, return as-is
  const existing = await db.payment.findUnique({ where: { id: paymentId } })
  if (!existing) throw new Error('Payment not found')
  if (existing.status === 'VERIFIED') return existing

  const payment = await db.payment.update({
    where: { id: paymentId },
    data: {
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById,
    },
  })

  // Auto-provision entitlements from the verified payment's order
  await provisionFromOrder(existing.orderId, verifiedById)

  return payment
}

export async function rejectPayment(paymentId: string, rejectionReason: string) {
  return db.payment.update({
    where: { id: paymentId },
    data: {
      status: 'REJECTED',
      rejectionReason,
    },
  })
}

export async function listPayments() {
  return db.payment.findMany({
    include: {
      order: { select: { customer: { select: { displayName: true } }, total: true, currency: true } },
      verifiedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── Provisioning & Entitlements ──────────────────────────────────────────────
export async function provisionFromOrder(orderId: string, provisionedById: string) {
  const order = await db.commercialOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) throw new Error('Order not found')
  if (order.status !== 'CONFIRMED') throw new Error('Order must be CONFIRMED before provisioning')

  // Determine entitlements from order items
  const entitlements: Array<{ type: string; value: string }> = []
  for (const item of order.items) {
    if (item.planId === 'ESSENTIEL') {
      entitlements.push({ type: 'MAX_GUESTS', value: '200' })
      entitlements.push({ type: 'BULK_INVITATIONS', value: 'true' })
      entitlements.push({ type: 'CHECK_IN', value: 'true' })
    } else if (item.planId === 'PREMIUM') {
      entitlements.push({ type: 'MAX_GUESTS', value: '500' })
      entitlements.push({ type: 'BULK_INVITATIONS', value: 'true' })
      entitlements.push({ type: 'CHECK_IN', value: 'true' })
      entitlements.push({ type: 'CUSTOM_DOMAIN', value: 'true' })
      entitlements.push({ type: 'PREMIUM_COLLECTIONS', value: 'true' })
    } else if (item.planId === 'ELITE') {
      entitlements.push({ type: 'MAX_GUESTS', value: '-1' }) // unlimited
      entitlements.push({ type: 'BULK_INVITATIONS', value: 'true' })
      entitlements.push({ type: 'CHECK_IN', value: 'true' })
      entitlements.push({ type: 'CUSTOM_DOMAIN', value: 'true' })
      entitlements.push({ type: 'PREMIUM_COLLECTIONS', value: 'true' })
    }
  }

  // If order has a weddingId, provision entitlements to that wedding
  if (order.weddingId) {
    for (const ent of entitlements) {
      // Idempotent: upsert on (weddingId, type)
      await db.entitlement.upsert({
        where: {
          weddingId_type: { weddingId: order.weddingId, type: ent.type },
        },
        update: {
          value: ent.value,
          origin: 'PLAN',
          sourceOrderId: orderId,
        },
        create: {
          weddingId: order.weddingId,
          type: ent.type,
          value: ent.value,
          origin: 'PLAN',
          sourceOrderId: orderId,
        },
      })
    }

    // P2.6 — Route the commercialStatus='PAID' write through the state
    // machine (transitionCommercialStatus) instead of a direct db update.
    // This (a) validates the transition is legal (e.g. PENDING_PAYMENT → PAID
    // is allowed; CANCELLED → PAID is not), (b) writes an audit-log row,
    // and (c) is idempotent if already PAID.
    await transitionCommercialStatus({
      weddingId: order.weddingId,
      to: 'PAID',
      userId: provisionedById,
      reason: `Order ${orderId} provisioned`,
    })

    // P2.6 — If the wedding is already PUBLISHED, auto-flip PAID → LIVE.
    // Idempotent: no-op if status is not PUBLISHED or commercialStatus is
    // already LIVE / not in [PAID, READY, IN_PRODUCTION].
    await autoTransitionToLive(order.weddingId, provisionedById)
  }

  logger.info('provisionFromOrder: complete', { orderId, entitlements: entitlements.length })
  return { provisioned: entitlements.length, entitlements }
}

// ─── Delivery ─────────────────────────────────────────────────────────────────
// NO FAKE PROVIDERS. LINK and QR are REAL (generated locally).
// EMAIL, SMS, WHATSAPP are DEFER_EXTERNAL — return PROVIDER_NOT_CONFIGURED.

export async function createDeliveryJob(data: {
  weddingId: string; guestId: string; invitationId?: string; channel: string
}) {
  const channel = data.channel as DeliveryChannel

  // Validate: only LINK and QR are REAL (no provider needed)
  if (channel !== 'LINK' && channel !== 'QR') {
    return {
      error: 'PROVIDER_NOT_CONFIGURED',
      message: `Canal ${channel} nécessite un provider externe non configuré. Seuls LINK et QR sont disponibles.`,
      channel,
    }
  }

  // For LINK and QR, mark as SENT immediately (the URL/QR is the delivery)
  const job = await db.deliveryJob.create({
    data: {
      weddingId: data.weddingId,
      guestId: data.guestId,
      invitationId: data.invitationId || null,
      channel,
      provider: 'LOCAL',
      destination: channel === 'LINK' ? 'invitation_url' : 'qr_code',
      status: 'SENT',
      sentAt: new Date(),
      attemptCount: 1,
    },
  })

  // Log the delivery attempt
  await db.deliveryAttempt.create({
    data: {
      deliveryJobId: job.id,
      provider: 'LOCAL',
      status: 'SUCCESS',
      response: channel === 'LINK' ? 'URL generated' : 'QR code generated',
    },
  })

  return { success: true, job }
}

export async function listDeliveryJobs(weddingId?: string) {
  return db.deliveryJob.findMany({
    where: weddingId ? { weddingId } : undefined,
    include: {
      guest: { select: { firstName: true, lastName: true, invitationCode: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── Commercial Dashboard ─────────────────────────────────────────────────────
export async function getCommercialDashboard() {
  const [
    totalCustomers, activeCustomers, totalDeals, openDeals, wonDeals,
    totalOrders, confirmedOrders, pendingPayments, verifiedPayments,
    totalEvents, publishedEvents, totalDeliveryJobs, failedDeliveryJobs
  ] = await Promise.all([
    db.customer.count(),
    db.customer.count({ where: { status: 'ACTIVE' } }),
    db.deal.count(),
    db.deal.count({ where: { stage: { notIn: ['WON', 'LOST'] } } }),
    db.deal.count({ where: { stage: 'WON' } }),
    db.commercialOrder.count(),
    db.commercialOrder.count({ where: { status: 'CONFIRMED' } }),
    db.payment.count({ where: { status: { in: ['PENDING', 'AWAITING_VERIFICATION'] } } }),
    db.payment.count({ where: { status: 'VERIFIED' } }),
    db.wedding.count(),
    db.wedding.count({ where: { status: 'PUBLISHED' } }),
    db.deliveryJob.count(),
    db.deliveryJob.count({ where: { status: 'FAILED' } }),
  ])

  // Verified revenue (sum of verified payments)
  const verifiedRevenueResult = await db.payment.aggregate({
    where: { status: 'VERIFIED' },
    _sum: { amount: true },
  })

  return {
    customers: { total: totalCustomers, active: activeCustomers },
    deals: { total: totalDeals, open: openDeals, won: wonDeals },
    orders: { total: totalOrders, confirmed: confirmedOrders },
    payments: { pending: pendingPayments, verified: verifiedPayments },
    revenue: { verifiedUsdCents: verifiedRevenueResult._sum.amount || 0 },
    events: { total: totalEvents, published: publishedEvents },
    delivery: { total: totalDeliveryJobs, failed: failedDeliveryJobs },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// P2.3 — Per-invitation usage metering
// ══════════════════════════════════════════════════════════════════════════════
//
// When bulk invitations are generated (POST /api/weddings/[id]/invitations/bulk),
// this helper creates (or appends to) an OrderItem on the wedding's most recent
// CommercialOrder. If no order exists, it auto-creates one. The OrderItem has:
//   - description: "Invitations électroniques x N (YYYY-MM-DD)"
//   - planId: 'PER_INVITATION'
//   - quantity: N
//   - unitPrice: PRICE_PER_INVITATION_USD_CENTS (70 cents = $0.70)
//   - total: N * 70
//
// Also auto-creates a Payment(status='AWAITING_VERIFICATION') for the OrderItem
// total, with method='STRIPE' (the Stripe webhook will flip it to VERIFIED when
// the invoice is paid — see src/lib/stripe.ts + /api/stripe/webhook).
//
// Idempotency: this helper is called once per bulk-generation request, NOT per
// invitation. Each call creates a NEW OrderItem (no deduplication) — the audit
// log + the OrderItem.description (which includes a date stamp) provide
// traceability. A re-call with the same count would create a duplicate item,
// which is the intended behavior (each bulk batch is a separate billable event).
//
// Failure modes:
//   - count < 1: returns { orderItem: null, payment: null } (no-op)
//   - wedding not found: logs a warning, returns nulls (does NOT throw — the
//     caller's invitation generation has already happened and should not be
//     rolled back just because the metering failed)
//   - DB error: bubbles up to the caller (the invitation bulk route catches
//     and continues — metering is best-effort, not a hard dependency)
//
// @param weddingId  The wedding generating invitations
// @param count      Number of invitations generated in this bulk batch
// @returns The created OrderItem + Payment, or nulls if count is 0
// ══════════════════════════════════════════════════════════════════════════════
export async function meterInvitationUsage(weddingId: string, count: number): Promise<{
  orderItem: { id: string; total: number } | null;
  payment: { id: string; amount: number } | null;
}> {
  if (!count || count < 1) return { orderItem: null, payment: null };

  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { id: true, customerId: true, slug: true },
  });
  if (!wedding) {
    logger.warn('meterInvitationUsage: wedding not found', { weddingId });
    return { orderItem: null, payment: null };
  }

  // Find the wedding's most recent DRAFT or CONFIRMED order, or create a new one.
  // DRAFT orders are reusable (the customer may add more items before paying).
  // CONFIRMED orders are also reusable for metering (append-only — the existing
  // items are already paid, the new item is a separate Payment).
  let order = await db.commercialOrder.findFirst({
    where: { weddingId, status: { in: ['DRAFT', 'CONFIRMED'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!order) {
    // Auto-create a Customer if the wedding doesn't have one (e.g. a TRIAL
    // wedding whose organizer is generating invitations for the first time).
    let customerId = wedding.customerId;
    if (!customerId) {
      const customer = await db.customer.create({
        data: {
          type: 'INDIVIDUAL',
          displayName: wedding.slug || weddingId,
          country: 'CD',
          currency: 'usd',
        },
      });
      await db.wedding.update({
        where: { id: weddingId },
        data: { customerId: customer.id },
      });
      customerId = customer.id;
    }
    order = await db.commercialOrder.create({
      data: {
        customerId,
        weddingId,
        currency: 'usd',
        status: 'DRAFT',
        notes: 'Auto-generated from invitation usage metering',
      },
    });
  }

  // Create the OrderItem — 1 row per bulk batch, quantity = N
  const unitPrice = PRICE_PER_INVITATION_USD_CENTS; // 70 cents = $0.70
  const total = count * unitPrice;
  const orderItem = await db.orderItem.create({
    data: {
      orderId: order.id,
      description: `Invitations électroniques x${count} (${new Date().toISOString().slice(0, 10)})`,
      planId: 'PER_INVITATION',
      quantity: count,
      unitPrice,
      total,
    },
  });

  // Recalculate order totals (subtotal, total — discount is left untouched)
  await recalculateOrderTotals(order.id);

  // Auto-create a Payment (AWAITING_VERIFICATION — Stripe webhook will flip
  // to VERIFIED when the invoice is paid). method='STRIPE' so the dashboard
  // can distinguish metered payments from manual ones.
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      weddingId,
      amount: total,
      currency: 'usd',
      method: 'STRIPE',
      status: 'AWAITING_VERIFICATION',
      submittedAt: new Date(),
      reference: `metered_invitations_${Date.now()}`,
    },
  });

  logger.info('meterInvitationUsage: OrderItem + Payment created', {
    weddingId,
    count,
    orderItemId: orderItem.id,
    paymentId: payment.id,
    total,
  });

  return {
    orderItem: { id: orderItem.id, total },
    payment: { id: payment.id, amount: total },
  };
}
