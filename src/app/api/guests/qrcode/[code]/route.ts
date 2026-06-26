export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { validateGuestSession, logGuestAccess, getClientInfo, generateInvitationLinkToken } from '@/lib/guest-auth';
import { resolvePublicTenant, resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import QRCode from 'qrcode';

/**
 * QR Code Generation API — with access control (tenant-scoped since Phase 2)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const clientInfo = getClientInfo(request);

    if (!code) return NextResponse.json({ error: 'Invitation code is required' }, { status: 400 });

    // Resolve tenant — admin or public (for guest sessions)
    // First try admin auth
    const adminUser = await getAuthUser(request);
    const isAdmin = adminUser && hasPermission(adminUser.role, ['ORGANIZER']);

    let context;
    if (isAdmin) {
      const result = await resolveAdminTenant(request, adminUser!);
      if (result.error || !result.context) {
        return NextResponse.json({ error: result.error?.message }, { status: result.error?.status ?? 500 });
      }
      context = result.context;
    } else {
      const result = await resolvePublicTenant(request);
      if (result.error || !result.context) {
        return NextResponse.json({ error: result.error?.message }, { status: result.error?.status ?? 500 });
      }
      context = result.context;
    }

    return runWithTenant(context, async () => {
      // findFirst auto-scoped by tenant extension
      const guest = await tenantDb.guest.findFirst({
        where: { invitationCode: code },
        include: { table: { select: { id: true, name: true, number: true } } },
      });

      if (!guest) {
        return NextResponse.json({ error: 'Guest not found with this invitation code' }, { status: 404 });
      }

      // ACCESS CONTROL
      let authorized = isAdmin;

      // Guest session check
      if (!authorized) {
        const guestToken = request.cookies.get('guest_session')?.value;
        if (guestToken) {
          const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
          if (session.valid && session.guestId === guest.id) {
            authorized = true;
          } else if (session.valid && session.guestId !== guest.id) {
            await logGuestAccess({
              guestId: session.guestId, action: 'ACCESS_DENIED',
              details: `Guest attempted to access QR code for another guest (${code.substring(0, 3)}***)`,
              ...clientInfo,
            });
            return NextResponse.json(
              { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.' },
              { status: 403 }
            );
          }
        }
      }

      if (!authorized) {
        return NextResponse.json(
          { error: 'Authentification requise pour accéder au QR code' },
          { status: 401 }
        );
      }

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
        `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host') || 'localhost:3000'}`;

      const encryptedToken = generateInvitationLinkToken(code);
      // For multi-tenant, encode the wedding slug in the QR URL so it lands on /w/{slug}/invite/{token}
      // The legacy /?invite= path continues working (default wedding fallback) for backward compat.
      const qrUrl = context.isDefault
        ? `${baseUrl}/?invite=${encryptedToken}`
        : `${baseUrl}/w/${context.slug}/invite/${encryptedToken}`;

      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 300, margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      await logGuestAccess({
        guestId: guest.id, action: 'QR_SCAN',
        details: `QR code generated for ${guest.firstName} ${guest.lastName}`,
        ...clientInfo,
      });

      return NextResponse.json({
        guest: {
          id: guest.id, firstName: guest.firstName, lastName: guest.lastName,
          invitationCode: guest.invitationCode, status: guest.status,
          category: guest.category, seats: guest.seats, checkedIn: guest.checkedIn,
          table: guest.table,
        },
        qrCode: qrDataUrl, qrUrl,
      });
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
