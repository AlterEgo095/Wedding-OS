export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { internalError, badRequest } from '@/lib/api-errors'
import { writeAuditLog } from '@/lib/audit'

/**
 * GET /api/platform/plans — List all plans (PLATFORM_ADMIN)
 * POST /api/platform/plans — Create or update a plan (PLATFORM_ADMIN)
 *
 * Plan OS — DB-backed plans replacing hardcoded PLAN_LIMITS + PLAN_METADATA.
 * All prices in Int minor units (cents) — NO floats.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const plans = await db.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }],
    })
    return NextResponse.json({ plans })
  } catch (error) {
    logger.error('Plans GET error', { errMessage: error instanceof Error ? error.message : String(error) })
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

    const { action } = body

    switch (action) {
      case 'create_plan': {
        const { code, name, description, priceUsdCents, priceFcfa, currency, maxGuests, maxMediaBytes, maxAdmins, customDomainAllowed, bulkInvitationsAllowed, checkInAllowed, designerAllowed, premiumCollectionsAllowed, isPublic, sortOrder } = body
        if (!code || !name) return badRequest('code et name requis')
        const plan = await db.plan.create({
          data: {
            code: code.toUpperCase(),
            name,
            description: description || null,
            priceUsdCents: priceUsdCents || 0,
            priceFcfa: priceFcfa || 0,
            currency: currency || 'usd',
            maxGuests: maxGuests ?? -1,
            maxMediaBytes: maxMediaBytes ?? -1,
            maxAdmins: maxAdmins ?? 1,
            customDomainAllowed: customDomainAllowed ?? false,
            bulkInvitationsAllowed: bulkInvitationsAllowed ?? true,
            checkInAllowed: checkInAllowed ?? true,
            designerAllowed: designerAllowed ?? true,
            premiumCollectionsAllowed: premiumCollectionsAllowed ?? false,
            isPublic: isPublic ?? true,
            sortOrder: sortOrder ?? 99,
            status: 'ACTIVE',
          },
        })
        await writeAuditLog({ weddingId: null, userId: user!.id, action: 'PLAN_CREATED', details: `Created plan ${code}`, request })
        return NextResponse.json({ success: true, plan }, { status: 201 })
      }

      case 'update_plan': {
        const { planId, ...updates } = body
        if (!planId) return badRequest('planId requis')
        // Filter to only allowed fields
        const allowed = ['name', 'description', 'status', 'isPublic', 'sortOrder', 'priceUsdCents', 'priceFcfa', 'currency', 'maxGuests', 'maxMediaBytes', 'maxAdmins', 'customDomainAllowed', 'bulkInvitationsAllowed', 'checkInAllowed', 'designerAllowed', 'premiumCollectionsAllowed']
        const data: Record<string, unknown> = {}
        for (const key of allowed) {
          if (updates[key] !== undefined) data[key] = updates[key]
        }
        const plan = await db.plan.update({ where: { id: planId }, data })
        await writeAuditLog({ weddingId: null, userId: user!.id, action: 'PLAN_UPDATED', details: `Updated plan ${plan.code}: ${JSON.stringify(data)}`, request })
        return NextResponse.json({ success: true, plan })
      }

      case 'delete_plan': {
        const { planId } = body
        if (!planId) return badRequest('planId requis')
        // Don't delete if weddings use this plan code
        const plan = await db.plan.findUnique({ where: { id: planId }, select: { code: true } })
        if (!plan) return badRequest('Plan introuvable')
        const weddingCount = await db.wedding.count({ where: { plan: plan.code } })
        if (weddingCount > 0) return badRequest(`Impossible de supprimer: ${weddingCount} événement(s) utilisent ce plan. Archivez-le à la place.`)
        await db.plan.delete({ where: { id: planId } })
        await writeAuditLog({ weddingId: null, userId: user!.id, action: 'PLAN_DELETED', details: `Deleted plan ${plan.code}`, request })
        return NextResponse.json({ success: true })
      }

      default:
        return badRequest(`Unknown action: ${action}`)
    }
  } catch (error) {
    logger.error('Plans POST error', { errMessage: error instanceof Error ? error.message : String(error) })
    return internalError()
  }
}
