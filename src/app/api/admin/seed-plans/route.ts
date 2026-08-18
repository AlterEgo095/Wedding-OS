/**
 * Mission 5.9.4 — PLAN SEED
 * POST /api/admin/seed-plans
 *
 * Seeds the 4 Wedding OS plans (TRIAL, ESSENTIEL, PREMIUM, ELITE) into the
 * database if they don't already exist. Idempotent — uses upsert.
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
    name: 'Essai Gratuit',
    description: 'Découvrez Wedding OS sans engagement — 14 jours, 50 invités.',
    sortOrder: 0,
    priceUsdCents: 0,
    priceFcfa: 0,
    currency: 'usd',
    maxGuests: 50,
    maxMediaBytes: 104857600, // 100 MB
    maxAdmins: 1,
    customDomainAllowed: false,
    bulkInvitationsAllowed: false,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: false,
  },
  {
    code: 'ESSENTIEL',
    name: 'Essentiel',
    description: 'Pour les mariages intimes — jusqu\'à 200 invités, invitations en masse.',
    sortOrder: 1,
    priceUsdCents: 4900, // $49
    priceFcfa: 29000, // 29 000 FCFA
    currency: 'usd',
    maxGuests: 200,
    maxMediaBytes: 1073741824, // 1 GB
    maxAdmins: 2,
    customDomainAllowed: false,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: false,
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: 'L\'expérience complète — 500 invités, domaine personnalisé, collections premium.',
    sortOrder: 2,
    priceUsdCents: 9900, // $99
    priceFcfa: 59000, // 59 000 FCFA
    currency: 'usd',
    maxGuests: 500,
    maxMediaBytes: 5368709120, // 5 GB
    maxAdmins: 5,
    customDomainAllowed: true,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: true,
  },
  {
    code: 'ELITE',
    name: 'Élite',
    description: 'Sans limites — invités illimités, tout inclus, support prioritaire.',
    sortOrder: 3,
    priceUsdCents: 19900, // $199
    priceFcfa: 119000, // 119 000 FCFA
    currency: 'usd',
    maxGuests: -1, // unlimited
    maxMediaBytes: -1, // unlimited
    maxAdmins: 20,
    customDomainAllowed: true,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: true,
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
          status: 'ACTIVE',
          isPublic: true,
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
