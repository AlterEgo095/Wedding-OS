export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { generateInvitationLinkToken } from '@/lib/guest-auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

/**
 * POST /api/weddings/[id]/invitations/bulk
 *
 * Bulk-generate Invitation records for multiple guests in one call.
 *
 * Body: {
 *   guestIds: string[],      // list of guest IDs to generate invitations for
 *   channel?: 'QR'           // currently only QR is REAL; other channels are DEFER_EXTERNAL
 * }
 *
 * Response: {
 *   generated: [{ guest, invitation, invitationUrl, qrCodeUrl }],
 *   errors: [{ guestId, error }],
 *   summary: { total, success, failed }
 * }
 *
 * Tenant-scoped: all guestIds are verified against the current wedding via
 * tenantDb (auto-injected weddingId). Guests from other tenants are silently
 * skipped (counted as "not found" in errors — no cross-tenant leak).
 *
 * Auth: ORGANIZER+ only.
 *
 * Mission 4.0 Phase 6.2 — bulk generation with per-guest error isolation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const { id: weddingId } = await params;
      if (weddingId !== ctx.weddingId) {
        return NextResponse.json({ error: 'Wedding mismatch' }, { status: 403 });
      }

      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Corps de requête invalide');

      const { guestIds, channel = 'QR' } = body as {
        guestIds?: string[];
        channel?: string;
      };

      if (!Array.isArray(guestIds) || guestIds.length === 0) {
        return badRequest('guestIds doit être un tableau non vide');
      }
      if (guestIds.length > 500) {
        return badRequest('Maximum 500 invités par lot (utilisez plusieurs appels)');
      }
      if (channel !== 'QR') {
        return NextResponse.json(
          { error: `Canal "${channel}" non supporté en génération automatique. QR est le seul canal REAL actuellement. WHATSAPP/EMAIL/SMS sont DEFER_EXTERNAL.` },
          { status: 400 }
        );
      }

      const weddingSlug = ctx.slug;
      const generated: Array<Record<string, unknown>> = [];
      const errors: Array<Record<string, unknown>> = [];

      // Fetch all guests in one query (tenant-scoped — auto-filtered by weddingId)
      const guests = await tenantDb.guest.findMany({
        where: { id: { in: guestIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          invitationCode: true,
          phone: true,
          email: true,
        },
      });
      const foundIds = new Set(guests.map((g) => g.id));

      // Guests in the request but not found (cross-tenant or non-existent)
      for (const gid of guestIds) {
        if (!foundIds.has(gid)) {
          errors.push({ guestId: gid, error: 'Guest not found in this wedding' });
        }
      }

      // Process each found guest
      for (const guest of guests) {
        try {
          const linkToken = generateInvitationLinkToken(guest.invitationCode);
          const invitationUrl = `/w/${weddingSlug}/?invite=${linkToken}`;
          const qrCodeUrl = `/api/guests/qrcode/${guest.invitationCode}?wedding=${weddingSlug}`;

          // Upsert Invitation row
          const existing = await tenantDb.invitation.findFirst({
            where: { guestId: guest.id, channel: 'QR' },
            select: { id: true },
          });
          let invitation;
          if (existing) {
            invitation = await tenantDb.invitation.update({
              where: { id: existing.id },
              data: { status: 'PENDING', sentAt: null },
            });
          } else {
            invitation = await tenantDb.invitation.create({
              data: {
                weddingId: ctx.weddingId,
                guestId: guest.id,
                channel: 'QR',
                recipient: guest.email || guest.phone || `${weddingSlug}/${guest.invitationCode}`,
                status: 'PENDING',
              },
            });
          }

          generated.push({
            guest: {
              id: guest.id,
              firstName: guest.firstName,
              lastName: guest.lastName,
              invitationCode: guest.invitationCode,
            },
            invitation: { id: invitation.id, status: invitation.status },
            invitationUrl,
            qrCodeUrl,
          });
        } catch (err) {
          errors.push({
            guestId: guest.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'INVITATIONS_BULK_GENERATED',
        details: `Bulk generated ${generated.length} invitations (${errors.length} errors)`,
        request,
      });

      return NextResponse.json({
        success: true,
        generated,
        errors,
        summary: {
          total: guestIds.length,
          success: generated.length,
          failed: errors.length,
        },
      });
    });
  } catch (error) {
    logger.error('Bulk invitation generation error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
