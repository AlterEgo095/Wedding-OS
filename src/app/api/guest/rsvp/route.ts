export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb, db } from '@/lib/db';
import { validateGuestSession, getClientInfo } from '@/lib/guest-auth';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolvePublicTenant, runWithTenant, resolveAdminTenant } from '@/lib/tenant-context';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError, badRequest } from '@/lib/api-errors';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

/**
 * RSVP API — Guest confirms or declines invitation (tenant-scoped)
 */
export async function POST(request: NextRequest) {
  const { context, error: tenantError } = await resolvePublicTenant(request);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
      // Explicit weddingId (Phase F defense-in-depth) — ALS propagation can
      // break across Next.js async boundaries; the explicit where guarantees
      // scoping even if the extension's getTenantContext() returns undefined.
      const clientInfo = getClientInfo(request);
      const guestToken = request.cookies.get('guest_session')?.value;

      if (!guestToken) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
      }

      const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
      if (!session.valid || !session.guestId) {
        return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
      }

      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { status, message, plusOne } = body;

      if (!status || !['CONFIRMED', 'DECLINED'].includes(status)) {
        return NextResponse.json(
          { error: 'Statut invalide. Utilisez CONFIRMED ou DECLINED.' },
          { status: 400 }
        );
      }

      // findFirst then update — auto-scoped by extension
      const existing = await tenantDb.guest.findFirst({ where: { id: session.guestId, weddingId: context.weddingId } });
      if (!existing) {
        return NextResponse.json({ error: 'Invité non trouvé' }, { status: 404 });
      }

      const updatedGuest = await tenantDb.guest.update({
        where: { id: session.guestId },
        data: {
          status,
          rsvpAt: new Date(),
          rsvpMessage: message || null,
          rsvpPlusOne: plusOne || false,
        },
        select: {
          id: true, firstName: true, lastName: true, status: true,
          rsvpAt: true, rsvpMessage: true, rsvpPlusOne: true,
          category: true, seats: true,
          table: { select: { id: true, name: true, number: true } },
        },
      });

      // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: context.weddingId,
        userId: null, // guest action, not admin
        action: 'GUEST_RSVP',
        details: `Guest ${existing.firstName} ${existing.lastName} RSVP: ${status}`,
        request,
      });

      return NextResponse.json({
        success: true,
        guest: updatedGuest,
        message: status === 'CONFIRMED'
          ? 'Votre présence est confirmée ! Nous sommes ravis de vous compter parmi nos invités.'
          : 'Nous avons bien pris note de votre réponse. Vous nous manquerez !',
      });
    } catch (error) {
      // P2-SEC-1: never log error.stack.
      logger.error('RSVP error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return internalError();
    }
  });
}

/**
 * GET — RSVP stats for admin dashboard (admin only, tenant-scoped)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 401 });
    if (!hasPermission(user.role, ['CONTROLLER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const { searchParams } = new URL(request.url);
      const stats = searchParams.get('stats');

      if (stats === 'true') {
        // Explicit weddingId (Phase F defense-in-depth) — ALS propagation can
        // break across Next.js async boundaries; the explicit where guarantees
        // scoping even if the extension's getTenantContext() returns undefined.
        const [confirmed, pending, declined, total] = await Promise.all([
          tenantDb.guest.count({ where: { weddingId: context.weddingId, status: 'CONFIRMED' } }),
          tenantDb.guest.count({ where: { weddingId: context.weddingId, status: 'PENDING' } }),
          tenantDb.guest.count({ where: { weddingId: context.weddingId, status: 'DECLINED' } }),
          tenantDb.guest.count({ where: { weddingId: context.weddingId } }),
        ]);

        const totalSeats = await tenantDb.guest.aggregate({ _sum: { seats: true }, where: { weddingId: context.weddingId } });
        const confirmedSeats = await tenantDb.guest.aggregate({
          _sum: { seats: true }, where: { weddingId: context.weddingId, status: 'CONFIRMED' },
        });

        // P3: cast groupBy to the base Prisma callable (extension makes it a union).
        const byCategory = await (tenantDb.guest.groupBy as typeof db.guest.groupBy)({
          by: ['category'], where: { weddingId: context.weddingId }, _count: { id: true },
        });

        return NextResponse.json({
          confirmed, pending, declined, total,
          totalSeats: totalSeats._sum.seats || 0,
          confirmedSeats: confirmedSeats._sum.seats || 0,
          byCategory: byCategory.map(c => ({ category: c.category, count: c._count.id })),
        });
      }

      return NextResponse.json({ error: 'Paramètre manquant' }, { status: 400 });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('RSVP stats error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

/**
 * PUT — Reset all RSVPs to PENDING (admin only, tenant-scoped)
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      // Explicit weddingId (Phase F defense-in-depth) — ALS propagation can
      // break across Next.js async boundaries; the explicit where guarantees
      // scoping even if the extension's getTenantContext() returns undefined.
      const result = await tenantDb.guest.updateMany({
        where: { weddingId: context.weddingId }, // extension injects weddingId
        data: { status: 'PENDING', rsvpAt: null, rsvpMessage: null, rsvpPlusOne: false },
      });

      // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: context.weddingId,
        userId: user.id,
        action: 'RESET_RSVP',
        details: `${result.count} RSVPs reset to PENDING`,
        request,
      });

      return NextResponse.json({
        success: true,
        message: `${result.count} invités réinitialisés en attente`,
        count: result.count,
      });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('RSVP reset error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
