export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { hashPassword } from '@/lib/auth'
import { buildCoupleLabel, isValidSlug } from '@/lib/types'
import { provisionWedding } from '@/lib/services/wedding-provisioning'
import { writeAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { internalError, badRequest } from '@/lib/api-errors'

/**
 * POST /api/platform/commercial/converge
 *
 * CONVERGENCE ENDPOINT — Mission 5.2
 *
 * Connects the full commercial flow in one transactional call:
 *   Lead → Customer → Deal (WON) → Order (+Plan item) → Wedding → Payment (AWAITING_VERIFICATION)
 *
 * This is the "Convert + Activate" button that a PLATFORM_ADMIN clicks
 * when a lead is ready to become a client. It creates:
 *   1. Customer (from Lead info)
 *   2. Deal (stage=WON, linked to Lead + Customer)
 *   3. CommercialOrder (status=CONFIRMED, linked to Deal + Customer)
 *   4. OrderItem (Plan from DB, price from DB)
 *   5. Wedding (DRAFT, linked to Customer + Order)
 *   6. Provisioning (settings, theme, couple story)
 *   7. AdminUser (role=ORGANIZER, linked to Wedding)
 *   8. Payment (MANUAL, AWAITING_VERIFICATION)
 *   9. Lead status → CONVERTED
 *
 * After this, the admin needs to:
 *   - Verify the payment (POST /api/platform/commercial action=verify_payment)
 *   - This auto-provisions entitlements
 *
 * The new client can then log in with the organizer credentials
 * and access /w/[slug]/admin
 *
 * Body:
 *   leadId: string (required — the lead to convert)
 *   slug: string (required — the wedding slug)
 *   organizerName: string (required)
 *   organizerEmail: string (required)
 *   organizerPassword: string (required, min 8 chars)
 *   planCode: string (required — TRIAL/ESSENTIEL/PREMIUM/ELITE)
 *   amountOverride?: number (optional — custom price in cents)
 *   publish?: boolean (default false)
 */

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const body = await request.json().catch(() => null)
    if (!body) return badRequest('Corps de requête invalide')

    const { leadId, slug, organizerName, organizerEmail, organizerPassword, planCode, amountOverride } = body as {
      leadId?: string; slug?: string; organizerName?: string; organizerEmail?: string
      organizerPassword?: string; planCode?: string; amountOverride?: number
    }

    // ─── Validation ────────────────────────────────────────────────────────
    if (!leadId) return badRequest('leadId requis')
    if (!slug || !isValidSlug(slug.toLowerCase().trim())) return badRequest('slug invalide')
    if (!organizerName) return badRequest('organizerName requis')
    if (!organizerEmail || typeof organizerEmail !== 'string') return badRequest('organizerEmail requis')
    if (!organizerPassword || organizerPassword.length < 8) return badRequest('organizerPassword requis (min 8 chars)')
    if (!planCode) return badRequest('planCode requis')

    const normalizedSlug = slug.toLowerCase().trim()
    const normalizedEmail = organizerEmail.trim().toLowerCase()
    const planCodeUpper = planCode.toUpperCase()

    // ─── Fetch Lead + Plan ─────────────────────────────────────────────────
    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) return badRequest('Lead introuvable')
    if (lead.status === 'CONVERTED') return badRequest('Ce lead a déjà été converti')

    const plan = await db.plan.findUnique({ where: { code: planCodeUpper } })
    if (!plan) return badRequest(`Plan "${planCodeUpper}" introuvable en DB`)
    if (plan.status !== 'ACTIVE') return badRequest(`Plan "${planCodeUpper}" n'est pas actif`)

    // ─── Pre-flight uniqueness checks ──────────────────────────────────────
    const existingSlug = await db.wedding.findUnique({ where: { slug: normalizedSlug }, select: { id: true } })
    if (existingSlug) return badRequest(`Le slug "${normalizedSlug}" existe déjà`)

    const existingEmail = await db.adminUser.findUnique({ where: { email: normalizedEmail }, select: { id: true } })
    if (existingEmail) return badRequest(`L'email "${normalizedEmail}" est déjà utilisé`)

    // ─── Hash password before transaction ──────────────────────────────────
    const hashedPassword = await hashPassword(organizerPassword)

    // ─── Resolve price ─────────────────────────────────────────────────────
    const price = amountOverride !== undefined ? Math.round(Number(amountOverride)) : plan.priceUsdCents

    // ─── Transactional convergence ─────────────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      // 1. Create Customer
      const customer = await tx.customer.create({
        data: {
          type: 'COUPLE',
          displayName: lead.coupleLabel,
          email: lead.email,
          phone: lead.phone || null,
          status: 'ACTIVE',
        },
      })

      // 2. Create Deal (WON — the admin is converting because deal is won)
      const deal = await tx.deal.create({
        data: {
          customerId: customer.id,
          leadId: lead.id,
          title: `${lead.coupleLabel} — ${plan.name}`,
          estimatedValue: price,
          currency: plan.currency,
          stage: 'WON',
          probability: 100,
          wonAt: new Date(),
        },
      })

      // 3. Create Order (CONFIRMED)
      const order = await tx.commercialOrder.create({
        data: {
          customerId: customer.id,
          dealId: deal.id,
          status: 'CONFIRMED',
          currency: plan.currency,
          confirmedAt: new Date(),
        },
      })

      // 4. Add Order Item (Plan from DB)
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          description: `${plan.name} — ${plan.description || ''}`,
          planId: plan.code,
          quantity: 1,
          unitPrice: price,
          total: price,
        },
      })

      // 5. Recalculate totals
      await tx.commercialOrder.update({
        where: { id: order.id },
        data: { subtotal: price, total: price },
      })

      // 6. Create Wedding (DRAFT, linked to Customer)
      const coupleLabel = buildCoupleLabel(lead.brideName, lead.groomName)
      const wedding = await tx.wedding.create({
        data: {
          slug: normalizedSlug,
          brideName: lead.brideName,
          groomName: lead.groomName,
          coupleLabel,
          weddingDate: lead.weddingDate,
          timezone: 'Africa/Kinshasa',
          venueCity: lead.venueCity || null,
          status: 'DRAFT',
          plan: plan.code,
          isDefault: false,
          customerId: customer.id,
          commercialStatus: 'PENDING_PAYMENT',
          publishedAt: null,
        },
      })

      // 7. Link Order to Wedding
      await tx.commercialOrder.update({
        where: { id: order.id },
        data: { weddingId: wedding.id },
      })

      // 8. Create AdminUser (ORGANIZER)
      const organizer = await tx.adminUser.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: organizerName,
          role: 'ORGANIZER',
          weddingId: wedding.id,
        },
        select: { id: true, email: true, name: true, role: true, weddingId: true },
      })

      // 9. Create Payment (MANUAL, AWAITING_VERIFICATION)
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          weddingId: wedding.id,
          amount: price,
          currency: plan.currency,
          method: 'MANUAL',
          status: 'AWAITING_VERIFICATION',
          submittedAt: new Date(),
        },
      })

      // 10. Update Lead status
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: 'CONVERTED',
          convertedWeddingId: wedding.id,
          convertedAt: new Date(),
        },
      })

      return { customer, deal, order, item, wedding, organizer, payment }
    })

    // ─── Post-transaction: provision the wedding ───────────────────────────
    try {
      await provisionWedding({
        id: result.wedding.id,
        slug: result.wedding.slug,
        brideName: result.wedding.brideName,
        groomName: result.wedding.groomName,
        coupleLabel: result.wedding.coupleLabel,
        weddingDate: result.wedding.weddingDate,
        timezone: result.wedding.timezone,
        venueName: null,
        venueAddress: null,
        venueCity: result.wedding.venueCity,
        venueReference: null,
      })
    } catch (provError) {
      logger.error('Convergence provisioning failed (non-fatal)', {
        weddingId: result.wedding.id,
        errMessage: provError instanceof Error ? provError.message : String(provError),
      })
    }

    await writeAuditLog({
      weddingId: null,
      userId: user!.id,
      action: 'CONVERGE_LEAD_TO_EVENT',
      details: `Converted lead ${lead.email} → customer ${result.customer.id}, wedding ${normalizedSlug}, plan ${plan.code}`,
      request,
    })

    return NextResponse.json({
      success: true,
      customer: { id: result.customer.id, displayName: result.customer.displayName },
      deal: { id: result.deal.id, stage: result.deal.stage },
      order: { id: result.order.id, status: result.order.status, total: result.order.total },
      wedding: { id: result.wedding.id, slug: result.wedding.slug, status: result.wedding.status },
      organizer: result.organizer,
      payment: { id: result.payment.id, status: result.payment.status, amount: result.payment.amount },
      nextStep: 'Verify payment via POST /api/platform/commercial action=verify_payment',
    }, { status: 201 })
  } catch (error) {
    logger.error('Convergence error', { errMessage: error instanceof Error ? error.message : String(error) })
    return internalError()
  }
}
