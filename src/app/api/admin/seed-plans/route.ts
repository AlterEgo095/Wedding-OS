/**
 * Mission 5.9.5 — PLAN SEED
 * POST /api/admin/seed-plans
 *
 * Seeds the Wedding OS plans into the database. Idempotent — uses upsert.
 *
 * Public surface: 3 plans (Starter / Pro / Studio) matching the homepage
 * PricingSection. PREMIUM is kept for backward compatibility with existing
 * subscriptions but is NOT public (isPublic=false, status=INACTIVE).
 *
 * Currency: EUR (€). priceUsdCents field stores EUR cents numerically
 * (4900 = €49.00, 19900 = €199.00). The `currency` column is set to 'eur'.
 *
 * Protected by PLATFORM_ADMIN auth.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const PLANS = [
  {
    code: 'TRIAL',
    name: 'Starter',
    description: "Pour les mariages intimes — jusqu'à 50 invités, thème de base.",
    sortOrder: 0,
    priceUsdCents: 0,
    priceFcfa: 0,
    currency: 'eur',
    maxGuests: 50,
    maxMediaBytes: 104857600, // 100 MB
    maxAdmins: 1,
    customDomainAllowed: false,
    bulkInvitationsAllowed: false,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: false,
    isPublic: true,
    status: 'ACTIVE',
  },
  {
    code: 'ESSENTIEL',
    name: 'Pro',
    description: "Pour la plupart des couples — 1 mariage, jusqu'à 300 invités, thèmes premium, QR codes & check-in.",
    sortOrder: 1,
    priceUsdCents: 4900, // €49
    priceFcfa: 30000, // 30 000 FCFA
    currency: 'eur',
    maxGuests: 300,
    maxMediaBytes: 1073741824, // 1 GB
    maxAdmins: 2,
    customDomainAllowed: false,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: false,
    isPublic: true,
    status: 'ACTIVE',
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: "L'expérience complète — 500 invités, domaine personnalisé, collections premium. (Plan hérité — non public)",
    sortOrder: 2,
    priceUsdCents: 9900, // €99
    priceFcfa: 60000, // 60 000 FCFA
    currency: 'usd',
    maxGuests: 500,
    maxMediaBytes: 5368709120, // 5 GB
    maxAdmins: 5,
    customDomainAllowed: true,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: true,
    isPublic: false,
    status: 'INACTIVE',
  },
  {
    code: 'ELITE',
    name: 'Studio',
    description: "Pour les wedding planners — mariages illimités, invités illimités, white-label, API & intégrations.",
    sortOrder: 3,
    priceUsdCents: 19900, // €199
    priceFcfa: 120000, // 120 000 FCFA
    currency: 'eur',
    maxGuests: -1, // unlimited
    maxMediaBytes: -1, // unlimited
    maxAdmins: 20,
    customDomainAllowed: true,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: true,
    isPublic: true,
    status: 'ACTIVE',
  },
]

export async function POST() {
  const user = await getServerAuthUser()
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const results: Array<{ code: string; action: 'created' | 'updated'; id: string }> = []

  for (const plan of PLANS) {
    const existing = await db.plan.findUnique({ where: { code: plan.code } })
    if (existing) {
      const updated = await db.plan.update({
        where: { code: plan.code },
        data: {
          name: plan.name,
          description: plan.description,
          sortOrder: plan.sortOrder,
          priceUsdCents: plan.priceUsdCents,
          priceFcfa: plan.priceFcfa,
          currency: plan.currency,
          maxGuests: plan.maxGuests,
          maxMediaBytes: plan.maxMediaBytes,
          maxAdmins: plan.maxAdmins,
          customDomainAllowed: plan.customDomainAllowed,
          bulkInvitationsAllowed: plan.bulkInvitationsAllowed,
          checkInAllowed: plan.checkInAllowed,
          designerAllowed: plan.designerAllowed,
          premiumCollectionsAllowed: plan.premiumCollectionsAllowed,
          status: plan.status,
          isPublic: plan.isPublic,
        },
      })
      results.push({ code: plan.code, action: 'updated', id: updated.id })
    } else {
      const created = await db.plan.create({ data: plan })
      results.push({ code: plan.code, action: 'created', id: created.id })
    }
  }

  return NextResponse.json({
    ok: true,
    seeded: results.length,
    plans: results,
  })
}
