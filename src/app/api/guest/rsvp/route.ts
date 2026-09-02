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
// P2-UX (sprint premium): RSVP confirmation email via the SSOT transport.
import { sendEmail } from '@/lib/email';

/**
 * P2-UX — fire-and-forget RSVP confirmation email.
 * NEVER blocks or fails the RSVP: void-ed promise + full try/catch. When no
 * email provider is configured the SSOT transport falls back to the operator
 * log stub (no guest PII beyond the envelope; no secret in the body).
 */
function sendRsvpConfirmation(params: {
  to: string;
  guestName: string;
  status: 'CONFIRMED' | 'DECLINED';
  weddingTitle: string;
  weddingDateText: string;
  venueText: string;
}): void {
  void (async () => {
    try {
      const confirmed = params.status === 'CONFIRMED';
      const subject = confirmed
        ? `Présence confirmée — Mariage de ${params.weddingTitle}`
        : `Réponse enregistrée — Mariage de ${params.weddingTitle}`;
      const text =
        `Bonjour ${params.guestName},\n\n` +
        (confirmed
          ? `Nous avons bien enregistré votre présence au mariage de ${params.weddingTitle}.\n`
          : `Nous avons bien enregistré votre réponse (absence) pour le mariage de ${params.weddingTitle}.\n`) +
        (params.weddingDateText ? `\nDate : ${params.weddingDateText}\n` : '') +
        (params.venueText ? `Lieu : ${params.venueText}\n` : '') +
        `\nMerci !\n— ${params.weddingTitle} & l'équipe Heureux Mariage`;
      await sendEmail({ to: params.to, subject, text, kind: 'rsvp-confirmation' });
    } catch (err) {
      logger.error('RSVP confirmation email failed (non-blocking)', {
        errMessage: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

/**
 * RSVP API — Guest confirms or declines invitation (tenant-scoped)
 *
 * MISSION 5.9.3 P0-1 FIX — peek at body `weddingSlug` before tenant resolution
 * (defense-in-depth; the guest_session cookie is already wedding-scoped, but
 * explicit slug override prevents any ambiguity when the SPA fetch wrapper
 * is bypassed). Mirrors the guest-auth route fix.
 */
export async function POST(request: NextRequest) {
  let bodySlugOverride: string | null = null;
  try {
    const cloned = request.clone();
    const peekedBody = await cloned.json().catch(() => null);
    if (peekedBody && typeof peekedBody === 'object' && 'weddingSlug' in peekedBody) {
      const candidate = (peekedBody as { weddingSlug?: unknown }).weddingSlug;
      if (typeof candidate === 'string' && candidate.trim()) {
        bodySlugOverride = candidate.trim().toLowerCase();
      }
    }
  } catch {
    // Body peek is best-effort.
  }

  const { context, error: tenantError } = await resolvePublicTenant(request, bodySlugOverride);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
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
      const existing = await tenantDb.guest.findFirst({ where: { id: session.guestId } });
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

      // P2-UX: confirmation email when the guest has an address on file.
      // Best-effort wedding context (settings read must never fail the RSVP).
      if (existing.email) {
        let weddingTitle = 'Mariage';
        let weddingDateText = '';
        let venueText = '';
        try {
          const [weddingRow, settingRows] = await Promise.all([
            db.wedding.findUnique({
              where: { id: context.weddingId },
              select: { coupleLabel: true, brideName: true, groomName: true, weddingDate: true, venueName: true, venueCity: true },
            }),
            db.settings.findMany({
              where: { weddingId: context.weddingId, key: { in: ['site_title', 'wedding_date'] } },
              select: { key: true, value: true },
            }),
          ]);
          const sMap: Record<string, string> = {};
          for (const r of settingRows) sMap[r.key] = r.value;
          weddingTitle =
            weddingRow?.coupleLabel ||
            [weddingRow?.brideName, weddingRow?.groomName].filter(Boolean).join(' & ') ||
            sMap.site_title ||
            'Mariage';
          const rawDate = weddingRow?.weddingDate
            ? weddingRow.weddingDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : sMap.wedding_date || '';
          weddingDateText = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
          venueText = [weddingRow?.venueName, weddingRow?.venueCity].filter(Boolean).join(', ');
        } catch {
          // Envelope without venue/date still confirms the RSVP.
        }
        sendRsvpConfirmation({
          to: existing.email,
          guestName: `${existing.firstName} ${existing.lastName}`.trim(),
          status,
          weddingTitle,
          weddingDateText,
          venueText,
        });
      }

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
        const [confirmed, pending, declined, total] = await Promise.all([
          tenantDb.guest.count({ where: { status: 'CONFIRMED' } }),
          tenantDb.guest.count({ where: { status: 'PENDING' } }),
          tenantDb.guest.count({ where: { status: 'DECLINED' } }),
          tenantDb.guest.count(),
        ]);

        const totalSeats = await tenantDb.guest.aggregate({ _sum: { seats: true } });
        const confirmedSeats = await tenantDb.guest.aggregate({
          _sum: { seats: true }, where: { status: 'CONFIRMED' },
        });

        // P3: cast groupBy to the base Prisma callable (extension makes it a union).
        const byCategory = await (tenantDb.guest.groupBy as typeof db.guest.groupBy)({
          by: ['category'], _count: { id: true },
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
      const result = await tenantDb.guest.updateMany({
        where: {}, // extension injects weddingId
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

