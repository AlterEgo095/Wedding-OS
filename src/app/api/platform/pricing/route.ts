/**
 * MISSION 5.9.5 — PRICING CONFIG API
 * GET  /api/admin/pricing        → list all pricing rules
 * PUT  /api/admin/pricing        → update a pricing rule (no-code admin)
 *
 * Protected by PLATFORM_ADMIN auth. The browser NEVER sends a price for a
 * checkout — this endpoint only configures the rule that the SERVER uses to
 * compute prices server-side.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { invalidatePricingCache } from '@/lib/pricing-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const rows = await db.pricingConfig.findMany({
    orderBy: [{ creditType: 'asc' }, { customerType: 'asc' }],
  })
  return NextResponse.json({ rules: rows })
}

export async function PUT(req: Request) {
  const user = await getServerAuthUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  const adminCheck = requirePlatformAdmin(user)
  if (adminCheck) return adminCheck

  const body = await req.json().catch(() => ({}))
  const { id, code, name, customerType, creditType, pricingModel, flatPriceCents, tiersJson, currency, status } = body as Record<string, unknown>

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'code requis' }, { status: 400 })
  }

  // Validate pricingModel
  const model = pricingModel === 'FLAT' ? 'FLAT' : pricingModel === 'TIERED' ? 'TIERED' : null
  if (!model) {
    return NextResponse.json({ error: 'pricingModel invalide (FLAT | TIERED)' }, { status: 400 })
  }

  // Validate tiers if TIERED
  let finalTiersJson = typeof tiersJson === 'string' ? tiersJson : '[]'
  if (model === 'TIERED') {
    try {
      const parsed = JSON.parse(finalTiersJson)
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ error: 'tiersJson doit etre un tableau' }, { status: 400 })
      }
      finalTiersJson = JSON.stringify(parsed)
    } catch {
      return NextResponse.json({ error: 'tiersJson JSON invalide' }, { status: 400 })
    }
  }

  const data = {
    name: typeof name === 'string' ? name : code,
    customerType: typeof customerType === 'string' ? customerType : 'STANDARD',
    creditType: typeof creditType === 'string' ? creditType : 'INVITATION',
    pricingModel: model,
    flatPriceCents: typeof flatPriceCents === 'number' ? flatPriceCents : 70,
    tiersJson: finalTiersJson,
    currency: typeof currency === 'string' ? currency : 'usd',
    status: typeof status === 'string' ? status : 'ACTIVE',
  }

  const row = await db.pricingConfig.upsert({
    where: { code: String(code) },
    update: { ...data, ...(id ? undefined : {}) },
    create: { code: String(code), ...data },
  })

  // Invalidate the in-memory cache so the new prices take effect immediately
  invalidatePricingCache()

  // Audit log
  await db.auditLog.create({
    data: {
      weddingId: null,
      userId: user.id,
      action: 'PRICING_CONFIG_UPDATED',
      details: JSON.stringify({ code: row.code, pricingModel: row.pricingModel, flatPriceCents: row.flatPriceCents }),
      result: 'SUCCESS',
      targetType: 'PRICING',
      targetResourceId: row.id,
    },
  }).catch(() => null)

  return NextResponse.json({ ok: true, rule: row })
}
