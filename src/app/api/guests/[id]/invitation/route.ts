export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { generateInvitationLinkToken } from '@/lib/guest-auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

/**
 * POST /api/guests/[id]/invitation
 *
 * Generate (or regenerate) an Invitation record for a single guest.
 * Creates a row in the Invitation table (channel=QR, status=PENDING) linked
 * to the guest + wedding, and returns the invitation URL + QR code URL.
 *
 * Tenant-scoped: the guest must belong to the current wedding (enforced by
 * tenantDb which auto-injects weddingId). Cross-tenant guest IDs are rejected
 * with 404 (fail-closed — no leak that the guest exists in another tenant).
 *
 * Auth: ORGANIZER+ (couples + staff can generate invitations).
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

    const { id: guestId } = await params;
    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json(
        { error: tenantError?.message },
        { status: tenantError?.status ?? 500 }
      );
    }

    return runWithTenant(context, async () => {
      // Fetch the guest (tenant-scoped — auto-filtered by weddingId)
      const guest = await tenantDb.guest.findFirst({
        where: { id: guestId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          invitationCode: true,
          phone: true,
          email: true,
          weddingId: true,
        },
      });
      if (!guest) {
        return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
      }

      // Generate the invitation link token (AES-256-GCM encrypted invitationCode)
      const linkToken = generateInvitationLinkToken(guest.invitationCode);
      const weddingSlug = context.slug;
      const invitationUrl = `/w/${weddingSlug}/?invite=${linkToken}`;
      const qrCodeUrl = `/api/guests/qrcode/${guest.invitationCode}?wedding=${weddingSlug}`;

      // Upsert an Invitation row (channel=QR). If one already exists for this
      // guest + channel=QR, reset status to PENDING so it can be re-sent.
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
            weddingId: context.weddingId,
            guestId: guest.id,
            channel: 'QR',
            recipient: guest.email || guest.phone || `${weddingSlug}/${guest.invitationCode}`,
            status: 'PENDING',
          },
        });
      }

      await writeAuditLog({
        weddingId: context.weddingId,
        userId: user.id,
        action: 'INVITATION_GENERATED',
        details: `Generated QR invitation for ${guest.firstName} ${guest.lastName} (code ${guest.invitationCode.slice(0, 4)}…)`,
        request,
      });

      return NextResponse.json({
        success: true,
        invitation,
        guest: {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          invitationCode: guest.invitationCode,
        },
        invitationUrl,
        qrCodeUrl,
        channel: 'QR',
      });
    });
  } catch (error) {
    logger.error('Generate invitation error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
