/**
 * MISSION 5.9.5 — PRICING SEED
 * POST /api/admin/pricing/seed
 *
 * Seeds the default pricing rules per the Mission 5.9.5 spec:
 *   - STANDARD  | INVITATION  | TIERED  | $0.70 ≤250, $0.50 >250
 *   - AGENCY    | INVITATION  | FLAT    | $0.50
 *   - RESELLER  | INVITATION  | FLAT    | $0.50
 *   - WEDDING_PLANNER | INVITATION | FLAT | $0.50
 *   - STANDARD  | SMS         | FLAT    | $0.07
 *   - STANDARD  | WHATSAPP    | FLAT    | $0.05
 *   - STANDARD  | EXPORT      | FLAT    | $0.50
 *   - STANDARD  | QR          | FLAT    | $0.00
 *
 * Idempotent — uses upsert on the `code` unique key. Safe to re-run.
 * Protected by PLATFORM_ADMIN auth.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { invalidatePricingCache } from '@/lib/pricing-engine'

export const dynamic = 'force-dynamic'

const DEFAULT_RULES = [
  {
    code: 'INVITATION_STANDARD',
    name: 'Invitations électroniques — Standard (B2C)',
    customerType: 'STANDARD',
    creditType: 'INVITATION',
    pricingModel: 'TIERED',
    flatPriceCents: 70,
    tiersJson: JSON.stringify([
      { upTo: 250, priceCents: 70 }, // $0.70 for the first 250
      { upTo: null, priceCents: 50 }, // $0.50 above 250
    ]),
    currency: 'usd',
    status: 'ACTIVE',
  },
  {
    code: 'INVITATION_AGENCY',
    name: 'Invitations électroniques — Agence',
    customerType: 'AGENCY',
    creditType: 'INVITATION',
    pricingModel: 'FLAT',
    flatPriceCents: 50, // $0.50 flat
    tiersJson: '[]',
    currency: 'usd',
    status: 'ACTIVE',
  },
  {
    code: 'INVITATION_RESELLER',
    name: 'Invitations électroniques — Revendeur (White-label)',
    customerType: 'RESELLER',
    creditType: 'INVITATION',
    pricingModel: 'FLAT',
    flatPriceCents: 50,
    tiersJson: '[]',
    currency: 'usd',
    status: 'ACTIVE',
  },
  {
    code: 'INVITATION_WEDDING_PLANNER',
    name: 'Invitations électroniques — Wedding Planner',
    customerType: 'WEDDING_PLANNER',
    creditType: 'INVITATION',
    pricingModel: 'FLAT',
    flatPriceCents: 50,
    tiersJson: '[]',
    currency: 'usd',
    status: 'ACTIVE',
  },
  {
    code: 'SMS_STANDARD',
    name: 'SMS — Standard',
    customerType: 'STANDARD',
    creditType: 'SMS',
    pricingModel: 'FLAT',
    flatPriceCents: 7, // $0.07
    tiersJson: '[]',
    currency: 'usd',
    status: 'ACTIVE',
  },
  {
    code: 'WHATSAPP_STANDARD',
    name: 'WhatsApp — Standard',
    customerType: 'STANDARD',
    creditType: 'WHATSAPP',
    pricingModel: 'FLAT',
    flatPriceCents: 5, // $0.05
    tiersJson: '[]',
    currency: 'usd',
    status: 'ACTIVE',
  },
  {
    code: 'EXPORT_STANDARD',
    name: 'Export (PDF/CSV) — Standard',
    customerType: 'STANDARD',
    creditType: 'EXPORT',
    pricingModel: 'FLAT',
    flatPriceCents: 50, // $0.50
    tiersJson: '[]',
    currency: 'usd',
    status: 'ACTIVE',
  },
  {
    code: 'QR_STANDARD',
    name: 'QR codes — Standard (gratuit, suivi seulement)',
    customerType: 'STANDARD',
    creditType: 'QR',
    pricingModel: 'FLAT',
    flatPriceCents: 0,
    tiersJson: '[]',
    currency: 'usd',
    status: 'ACTIVE',
  },
]

export async function POST() {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const results: Array<{ code: string; action: 'created' | 'updated'; id: string }> = []

  for (const rule of DEFAULT_RULES) {
    const existing = await db.pricingConfig.findUnique({ where: { code: rule.code } })
    if (existing) {
      const updated = await db.pricingConfig.update({
        where: { code: rule.code },
        data: {
          name: rule.name,
          customerType: rule.customerType,
          creditType: rule.creditType,
          pricingModel: rule.pricingModel,
          flatPriceCents: rule.flatPriceCents,
          tiersJson: rule.tiersJson,
          currency: rule.currency,
          status: rule.status,
        },
      })
      results.push({ code: rule.code, action: 'updated', id: updated.id })
    } else {
      const created = await db.pricingConfig.create({ data: rule })
      results.push({ code: rule.code, action: 'created', id: created.id })
    }
  }

  invalidatePricingCache()

  await db.auditLog.create({
    data: {
      weddingId: null,
      userId: user.id,
      action: 'PRICING_CONFIG_SEEDED',
      details: JSON.stringify({ count: results.length, codes: results.map((r) => r.code) }),
      result: 'SUCCESS',
      targetType: 'PRICING',
    },
  }).catch(() => null)

  return NextResponse.json({ ok: true, seeded: results.length, results })
}
