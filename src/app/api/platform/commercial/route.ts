export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { internalError, badRequest } from '@/lib/api-errors'
import {
  createCustomer, listCustomers, createDeal, listDeals,
  createOrder, addOrderItem, listOrders, confirmOrder,
  createPayment, verifyPayment, rejectPayment, listPayments,
  createDeliveryJob, listDeliveryJobs, getCommercialDashboard,
  provisionFromOrder,
} from '@/lib/commercial'

/**
 * GET /api/platform/commercial — Commercial dashboard stats + list views
 * POST /api/platform/commercial — Create customer/deal/order/payment/delivery
 *
 * All operations require PLATFORM_ADMIN.
 * Money is always in Int minor units (cents) — NO floats.
 * No fake providers: LINK/QR = REAL, EMAIL/SMS/WHATSAPP = PROVIDER_NOT_CONFIGURED.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const resource = searchParams.get('resource') || 'dashboard'

    switch (resource) {
      case 'dashboard': {
        const stats = await getCommercialDashboard()
        return NextResponse.json(stats)
      }
      case 'customers': {
        const customers = await listCustomers()
        return NextResponse.json({ customers })
      }
      case 'deals': {
        const deals = await listDeals()
        return NextResponse.json({ deals })
      }
      case 'orders': {
        const orders = await listOrders()
        return NextResponse.json({ orders })
      }
      case 'payments': {
        const payments = await listPayments()
        return NextResponse.json({ payments })
      }
      case 'delivery': {
        const weddingId = searchParams.get('weddingId') || undefined
        const jobs = await listDeliveryJobs(weddingId)
        return NextResponse.json({ jobs })
      }
      default:
        return badRequest(`Unknown resource: ${resource}`)
    }
  } catch (error) {
    logger.error('Commercial GET error', { errMessage: error instanceof Error ? error.message : String(error) })
    return internalError()
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const body = await request.json().catch(() => null)
    if (!body) return badRequest('Corps de requête invalide')

    const { action } = body as { action: string }

    switch (action) {
      // ─── Customer ─────────────────────────────────────────
      case 'create_customer': {
        const { displayName, email, phone, type, whatsapp, country, currency, notes } = body
        if (!displayName) return badRequest('displayName requis')
        const customer = await createCustomer({ displayName, email, phone, type, whatsapp, country, currency, notes })
        return NextResponse.json({ success: true, customer }, { status: 201 })
      }

      // ─── Deal ─────────────────────────────────────────────
      case 'create_deal': {
        const { customerId, title, leadId, weddingId, estimatedValue, currency, stage, probability } = body
        if (!customerId || !title) return badRequest('customerId et title requis')
        const deal = await createDeal({ customerId, title, leadId, weddingId, estimatedValue, currency, stage, probability })
        return NextResponse.json({ success: true, deal }, { status: 201 })
      }

      case 'update_deal_stage': {
        const { dealId, stage, lostReason } = body
        if (!dealId || !stage) return badRequest('dealId et stage requis')
        const deal = await db.deal.update({
          where: { id: dealId },
          data: { stage, lostReason: lostReason || null, wonAt: stage === 'WON' ? new Date() : null },
        })
        return NextResponse.json({ success: true, deal })
      }

      // ─── Order ────────────────────────────────────────────
      case 'create_order': {
        const { customerId, dealId, weddingId, currency, notes } = body
        if (!customerId) return badRequest('customerId requis')
        const order = await createOrder({ customerId, dealId, weddingId, currency, notes })
        return NextResponse.json({ success: true, order }, { status: 201 })
      }

      case 'add_order_item': {
        const { orderId, description, planId, quantity, unitPrice } = body
        if (!orderId || !description) return badRequest('orderId et description requis')
        const item = await addOrderItem(orderId, { description, planId, quantity, unitPrice: unitPrice || 0 })
        return NextResponse.json({ success: true, item }, { status: 201 })
      }

      case 'confirm_order': {
        const { orderId } = body
        if (!orderId) return badRequest('orderId requis')
        const order = await confirmOrder(orderId)
        return NextResponse.json({ success: true, order })
      }

      // ─── Payment ──────────────────────────────────────────
      case 'create_payment': {
        const { orderId, amount, currency, method, reference, senderName, senderPhone, proofUrl, weddingId } = body
        if (!orderId || amount === undefined) return badRequest('orderId et amount requis')
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
          return badRequest('amount doit être un entier positif (minor units)')
        }
        const payment = await createPayment({
          orderId, amount, currency, method, reference, senderName, senderPhone, proofUrl, weddingId,
        })
        return NextResponse.json({ success: true, payment }, { status: 201 })
      }

      case 'verify_payment': {
        const { paymentId } = body
        if (!paymentId) return badRequest('paymentId requis')
        const payment = await verifyPayment(paymentId, user!.id)
        return NextResponse.json({ success: true, payment })
      }

      case 'reject_payment': {
        const { paymentId, rejectionReason } = body
        if (!paymentId) return badRequest('paymentId requis')
        const payment = await rejectPayment(paymentId, rejectionReason || 'Rejeté par admin')
        return NextResponse.json({ success: true, payment })
      }

      // ─── Provisioning ─────────────────────────────────────
      case 'provision_order': {
        const { orderId } = body
        if (!orderId) return badRequest('orderId requis')
        const result = await provisionFromOrder(orderId, user!.id)
        return NextResponse.json({ success: true, ...result })
      }

      // ─── Delivery ─────────────────────────────────────────
      case 'create_delivery': {
        const { weddingId, guestId, invitationId, channel } = body
        if (!weddingId || !guestId || !channel) return badRequest('weddingId, guestId, channel requis')
        const result = await createDeliveryJob({ weddingId, guestId, invitationId, channel })
        if ('error' in result) {
          return NextResponse.json(result, { status: 400 })
        }
        return NextResponse.json(result, { status: 201 })
      }

      default:
        return badRequest(`Unknown action: ${action}`)
    }
  } catch (error) {
    logger.error('Commercial POST error', { errMessage: error instanceof Error ? error.message : String(error) })
    return internalError()
  }
}

// db is needed for update_deal_stage
import { db } from '@/lib/db'
