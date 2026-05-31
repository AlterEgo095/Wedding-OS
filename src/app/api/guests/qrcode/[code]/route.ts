export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { validateGuestSession, logGuestAccess, getClientInfo, generateInvitationLinkToken } from '@/lib/guest-auth';
import QRCode from 'qrcode';

/**
 * QR Code Generation API — with access control
 *
 * SECURITY:
 * - Admin users can generate QR codes for any guest
 * - Authenticated guests can only generate their own QR code
 * - Unauthenticated requests are denied
 * - All access attempts are logged
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const clientInfo = getClientInfo(request);

    if (!code) {
      return NextResponse.json(
        { error: 'Invitation code is required' },
        { status: 400 }
      );
    }

    const guest = await db.guest.findUnique({
      where: { invitationCode: code },
      include: {
        table: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
      },
    });

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest not found with this invitation code' },
        { status: 404 }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // ACCESS CONTROL: Verify the requester is authorized
    // ═══════════════════════════════════════════════════════════

    let authorized = false;

    // Check 1: Admin user
    const adminUser = await getAuthUser(request);
    if (adminUser && hasPermission(adminUser.role, ['ORGANIZER'])) {
      authorized = true;
    }

    // Check 2: Guest session — can only access their own QR code
    if (!authorized) {
      const guestToken = request.cookies.get('guest_session')?.value;
      if (guestToken) {
        const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
        if (session.valid && session.guestId === guest.id) {
          authorized = true;
        } else if (session.valid && session.guestId !== guest.id) {
          // Guest trying to access another guest's QR code
          await logGuestAccess({
            guestId: session.guestId,
            action: 'ACCESS_DENIED',
            details: `Guest attempted to access QR code for another guest (${code.substring(0, 3)}***)`,
            userAgent: clientInfo.userAgent,
            ipAddress: clientInfo.ipAddress,
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

    // Build the URL that the QR code will encode
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host') || 'localhost:3000'}`;

    // Use encrypted invitation link for maximum security
    const encryptedToken = generateInvitationLinkToken(code);
    const qrUrl = `${baseUrl}/?invite=${encryptedToken}`;

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // Log QR code access
    await logGuestAccess({
      guestId: guest.id,
      action: 'QR_SCAN',
      details: `QR code generated for ${guest.firstName} ${guest.lastName}`,
      userAgent: clientInfo.userAgent,
      ipAddress: clientInfo.ipAddress,
    });

    return NextResponse.json({
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        invitationCode: guest.invitationCode,
        status: guest.status,
        category: guest.category,
        seats: guest.seats,
        checkedIn: guest.checkedIn,
        table: guest.table,
      },
      qrCode: qrDataUrl,
      qrUrl,
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
