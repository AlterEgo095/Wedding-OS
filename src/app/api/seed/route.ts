/**
 * Mission 5.9.4 — WAVE 1: PLAN CATALOG SEED (PRODUCTION-ADAPTED)
 * POST /api/seed
 *
 * Idempotently upserts the 4 commercial plans (TRIAL, ESSENTIEL, PREMIUM, ELITE)
 * into the production Plan table. Uses the production Plan model fields:
 *   priceUsdCents, priceFcfa, maxGuests, maxMediaBytes, maxAdmins,
 *   customDomainAllowed, bulkInvitationsAllowed, checkInAllowed,
 *   designerAllowed, premiumCollectionsAllowed.
 *
 * Safe to call multiple times — upsert by unique `code`.
 *
 * Auth: requires PLATFORM_ADMIN (production auth).
 */
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

// ─── Plan definitions (aligned with PLAN_LIMITS + PLAN_METADATA in types.ts) ──
const PLANS = [
  {
    code: 'TRIAL',
    name: 'Essai Libre',
    description: 'Pour découvrir la plateforme. Limité à 20 invités.',
    priceUsdCents: 0,
    priceFcfa: 0,
    currency: 'usd',
    maxGuests: 20,
    maxMediaBytes: 100 * 1024 * 1024, // 100 MB
    maxAdmins: 1,
    customDomainAllowed: false,
    bulkInvitationsAllowed: false,
    checkInAllowed: true,
    designerAllowed: false,
    premiumCollectionsAllowed: false,
    sortOrder: 1,
    isPublic: true,
  },
  {
    code: 'ESSENTIEL',
    name: 'Essentiel',
    description: 'Pour les petits mariages jusqu’à 200 invités.',
    priceUsdCents: 4900, // $49
    priceFcfa: 30000,
    currency: 'usd',
    maxGuests: 200,
    maxMediaBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    maxAdmins: 2,
    customDomainAllowed: false,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: false,
    sortOrder: 2,
    isPublic: true,
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: 'Pour les mariages jusqu’à 500 invités avec domaine personnalisé.',
    priceUsdCents: 9900, // $99
    priceFcfa: 60000,
    currency: 'usd',
    maxGuests: 500,
    maxMediaBytes: 2000000000, // 2 GB (fits Int32; 5 GB overflowed SQLite INT)
    maxAdmins: 5,
    customDomainAllowed: true,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: true,
    sortOrder: 3,
    isPublic: true,
  },
  {
    code: 'ELITE',
    name: 'Élite',
    description: 'Illimité. Pour les grands mariages et événements premium.',
    priceUsdCents: 19900, // $199
    priceFcfa: 120000,
    currency: 'usd',
    maxGuests: -1, // unlimited
    maxMediaBytes: -1,
    maxAdmins: 10,
    customDomainAllowed: true,
    bulkInvitationsAllowed: true,
    checkInAllowed: true,
    designerAllowed: true,
    premiumCollectionsAllowed: true,
    sortOrder: 4,
    isPublic: true,
  },
] as const

export async function POST(req: NextRequest) {
  // ── Auth: require PLATFORM_ADMIN ────────────────────────────────────
  const user = await getAuthUser(req)
  if (!user || (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Accès réservé au Super Admin.' }, { status: 403 })
  }

  const results: Array<{ code: string; action: 'created' | 'updated'; id: string }> = []

  for (const plan of PLANS) {
    const existing = await db.plan.findUnique({ where: { code: plan.code } })
    if (existing) {
      const updated = await db.plan.update({
        where: { code: plan.code },
        data: { ...plan },
      })
      results.push({ code: plan.code, action: 'updated', id: updated.id })
    } else {
      const created = await db.plan.create({ data: { ...plan } })
      results.push({ code: plan.code, action: 'created', id: created.id })
    }
  }

  await writeAuditLog({
    action: 'PLANS_SEEDED',
    userId: user.id,
    details: JSON.stringify({ count: results.length, codes: results.map(r => r.code) }),
    result: 'SUCCESS',
    request: req,
  }).catch(() => null)

  return NextResponse.json({
    ok: true,
    seeded: results.length,
    plans: results,
  })
}

export async function GET(req: NextRequest) {
  // Convenience: GET also seeds (useful for first-time setup via browser).
  return POST(req)
}
