/**
 * MISSION 5.9.5 — USAGE API
 * GET /api/admin/usage/[weddingId]
 *
 * Returns the current usage counters + plan limits for a wedding. Used by
 * the admin dashboard to show "X / Y used" progress bars.
 *
 * Protected by PLATFORM_ADMIN auth.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ weddingId: string }> }) {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const { weddingId } = await params
  if (!weddingId) {
    return NextResponse.json({ error: 'weddingId requis' }, { status: 400 })
  }

  // Load the wedding + its subscription + plan
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      slug: true,
      status: true,
      commercialStatus: true,
      customerId: true,
      organizationId: true,
    },
  })
  if (!wedding) {
    return NextResponse.json({ error: 'Mariage introuvable' }, { status: 404 })
  }

  const subscription = await db.subscription.findUnique({
    where: { weddingId },
    select: { plan: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, amountAgreed: true, currency: true, billingCycle: true },
  })

  const planCode = subscription?.plan || 'TRIAL'
  const plan = await db.plan.findUnique({ where: { code: planCode } })

  // Current period (monthly)
  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Load all usage counters for this wedding
  const counters = await db.usageCounter.findMany({
    where: { weddingId },
  })
  const usageMap: Record<string, { value: number; period: string }> = {}
  for (const c of counters) {
    usageMap[c.metric] = { value: c.value, period: c.period }
  }

  // Compute limits from the plan
  const limits = plan ? {
    maxGuests: plan.maxGuests,
    maxMediaBytes: plan.maxMediaBytes,
    maxAdmins: plan.maxAdmins,
    bulkInvitationsAllowed: plan.bulkInvitationsAllowed,
    checkInAllowed: plan.checkInAllowed,
    designerAllowed: plan.designerAllowed,
    premiumCollectionsAllowed: plan.premiumCollectionsAllowed,
    customDomainAllowed: plan.customDomainAllowed,
  } : null

  // Count guests + admins + media bytes directly (for accuracy vs. counters)
  const [guestCount, adminCount, mediaBytesAgg, invitationCount] = await Promise.all([
    db.guest.count({ where: { weddingId } }),
    db.adminUser.count({ where: { weddingId } }),
    db.media.aggregate({ where: { weddingId }, _sum: { sizeBytes: true } }),
    db.invitation.count({ where: { weddingId } }),
  ])

  return NextResponse.json({
    weddingId,
    wedding: { slug: wedding.slug, status: wedding.status, commercialStatus: wedding.commercialStatus },
    subscription: subscription || { plan: 'TRIAL', status: 'TRIALING' },
    plan: plan ? { code: plan.code, name: plan.name, priceUsdCents: plan.priceUsdCents, priceFcfa: plan.priceFcfa } : null,
    limits,
    usage: {
      guests: { current: guestCount, limit: plan?.maxGuests ?? -1, period: null },
      admins: { current: adminCount, limit: plan?.maxAdmins ?? 1, period: null },
      mediaBytes: { current: mediaBytesAgg._sum.sizeBytes || 0, limit: plan?.maxMediaBytes ?? -1, period: null },
      invitations: { current: invitationCount, limit: plan?.bulkInvitationsAllowed ? -1 : 0, period },
    },
    rawCounters: usageMap,
  })
}
