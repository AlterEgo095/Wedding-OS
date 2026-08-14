export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { internalError, badRequest, notFound } from '@/lib/api-errors'
import {
  createCustomer,
  createOrder,
  addOrderItem,
  confirmOrder,
  createPayment,
  verifyPayment,
} from '@/lib/commercial'

/**
 * POST /api/platform/weddings/[id]/activate-trial
 *
 * MISSION 5.8.16 — P1-01 FIX: No-code TRIAL activation.
 *
 * A wedding created directly via the Weddings tab ("Créer un mariage") has
 * plan=TRIAL but NO linked commercial records (customer/order/payment). The
 * publish gate (Mission 5.5 invariant) requires commercialStatus=PAID before
 * transitioning DRAFT → PUBLISHED.
 *
 * This endpoint creates the full commercial chain for a TRIAL ($0) wedding in
 * one transactional call so the Super Admin can publish with a single click
 * from the Weddings tab dropdown — no need to navigate to Commercial OS.
 *
 * Flow (all functions REUSED from src/lib/commercial):
 *   1. Create Customer (displayName = couple label, linked to wedding)
 *   2. Create Order (customerId + weddingId, status DRAFT)
 *   3. addOrderItem (planId='TRIAL', unitPrice=0, description='Essai Libre')
 *   4. confirmOrder (status → CONFIRMED)
 *   5. createPayment ($0, MANUAL, reference → AWAITING_VERIFICATION)
 *   6. verifyPayment → provisionFromOrder → wedding.commercialStatus = PAID
 *
 * Idempotent: if commercialStatus is already PAID/LIVE, returns 200 with a
 * "already active" message instead of re-creating records.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const { id: weddingId } = await params

    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: {
        id: true,
        slug: true,
        brideName: true,
        groomName: true,
        coupleLabel: true,
        plan: true,
        status: true,
        commercialStatus: true,
        isDefault: true,
      },
    })

    if (!wedding) return notFound('Mariage introuvable')

    // Guard: only TRIAL plan can be activated via this shortcut.
    if (wedding.plan !== 'TRIAL') {
      return badRequest(
        `Activation rapide réservée au plan Essai Libre. Pour le plan ${wedding.plan}, utilisez Commercial OS → Payments → ✓.`
      )
    }

    // Idempotent: already activated.
    if (wedding.commercialStatus === 'PAID' || wedding.commercialStatus === 'LIVE') {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        message: 'Ce mariage est déjà activé (commercialStatus=' + wedding.commercialStatus + ').',
        weddingId: wedding.id,
        commercialStatus: wedding.commercialStatus,
      })
    }

    // 1. Create Customer (linked to the wedding via coupleLabel)
    const customer = await createCustomer({
      type: 'COUPLE',
      displayName: wedding.coupleLabel || `${wedding.brideName} & ${wedding.groomName}`,
      country: 'CD',
      currency: 'usd',
      notes: `Auto-created by ${user?.name || 'Super Admin'} via activate-trial (5.8.16)`,
    })

    // 2. Create Order (linked to customer + wedding)
    const order = await createOrder({
      customerId: customer.id,
      weddingId: wedding.id,
      currency: 'usd',
      notes: `Trial activation for ${wedding.slug}`,
    })

    // 3. Add OrderItem (TRIAL plan, $0)
    await addOrderItem(order.id, {
      description: 'Plan Essai Libre — activation',
      planId: 'TRIAL',
      quantity: 1,
      unitPrice: 0,
    })

    // 4. Confirm the order
    await confirmOrder(order.id)

    // 5. Create Payment ($0, MANUAL, with reference → AWAITING_VERIFICATION)
    const payment = await createPayment({
      orderId: order.id,
      weddingId: wedding.id,
      amount: 0,
      currency: 'usd',
      method: 'MANUAL',
      reference: `TRIAL-AUTO-${wedding.slug}-${Date.now()}`,
      senderName: wedding.coupleLabel || wedding.slug,
    })

    // 6. Verify the payment → provisionFromOrder → commercialStatus=PAID
    await verifyPayment(payment.id, user!.id)

    // Audit log
    await writeAuditLog({
      action: 'WEDDING_TRIAL_ACTIVATED',
      userId: user!.id,
      weddingId: wedding.id,
      request,
      details: JSON.stringify({
        slug: wedding.slug,
        customerId: customer.id,
        orderId: order.id,
        paymentId: payment.id,
      }),
    })

    logger.info('5.8.16 TRIAL activated', {
      weddingId: wedding.id,
      slug: wedding.slug,
      customerId: customer.id,
      orderId: order.id,
    })

    return NextResponse.json({
      ok: true,
      activated: true,
      message: `Essai activé pour ${wedding.coupleLabel}. Vous pouvez maintenant publier le mariage.`,
      weddingId: wedding.id,
      commercialStatus: 'PAID',
      customerId: customer.id,
      orderId: order.id,
      paymentId: payment.id,
    })
  } catch (error) {
    logger.error('activate-trial failed', { error: String(error) })
    return internalError(`Erreur lors de l'activation de l'essai`)
  }
}
