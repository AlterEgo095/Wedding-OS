export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import {
  decryptInvitationLinkToken,
  generateInvitationLinkToken,
  logGuestAccess,
  getClientInfo,
  createGuestSession,
} from '@/lib/guest-auth';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolvePublicTenant, runWithTenant, resolveAdminTenant } from '@/lib/tenant-context';

// GET /api/guest/invite?token=ENCRYPTED_TOKEN
// Public: Validates an encrypted invitation link token and auto-authenticates the guest
export async function GET(request: NextRequest) {
  const { context, error: tenantError } = await resolvePublicTenant(request);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const linkToken = searchParams.get('token');

      if (!linkToken) {
        return NextResponse.json(
          { error: 'Token d\'invitation requis', authenticated: false },
          { status: 400 }
        );
      }

      const clientInfo = getClientInfo(request);

      const invitationCode = decryptInvitationLinkToken(linkToken);

      if (!invitationCode) {
        await logGuestAccess({
          action: 'ACCESS_DENIED',
          details: 'Invalid or tampered invitation link token',
          ...clientInfo,
        });
        return NextResponse.json(
          { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.', authenticated: false },
          { status: 403 }
        );
      }

      // findFirst auto-scoped by tenant extension
      const guest = await tenantDb.guest.findFirst({
        where: { invitationCode },
        include: { table: { select: { id: true, name: true, number: true } } },
      });

      if (!guest) {
        await logGuestAccess({
          action: 'ACCESS_DENIED',
          details: `Invitation link for non-existent code: ${invitationCode.substring(0, 2)}***`,
          ...clientInfo,
        });
        return NextResponse.json(
          { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.', authenticated: false },
          { status: 403 }
        );
      }

      // Check if guest already has an active session
      const existingSession = await tenantDb.guestSession.findFirst({
        where: { guestId: guest.id, isActive: true },
      });

      if (existingSession && new Date() < existingSession.expiresAt) {
        await logGuestAccess({
          guestId: guest.id, action: 'LINK_VISIT',
          details: 'Returning guest via invitation link (existing session)',
          ...clientInfo,
        });

        const encryptedLink = generateInvitationLinkToken(guest.invitationCode);
        return NextResponse.json({
          success: true, authenticated: true,
          guest: {
            id: guest.id, firstName: guest.firstName, lastName: guest.lastName,
            displayName: guest.displayName, invitationType: guest.invitationType,
            invitationCode: guest.invitationCode, seats: guest.seats,
            category: guest.category, status: guest.status,
            personalMessage: guest.personalMessage, checkedIn: guest.checkedIn,
            table: guest.table, encryptedLink,
          },
        });
      }

      const session = await createGuestSession(guest.id, guest.invitationCode, clientInfo.userAgent, clientInfo.ipAddress);

      await logGuestAccess({
        guestId: guest.id, action: 'LINK_VISIT',
        details: `Guest auto-authenticated via invitation link`,
        ...clientInfo,
      });

      await logGuestAccess({
        guestId: guest.id, action: 'LOGIN',
        details: `Auto-login via invitation link`,
        ...clientInfo,
      });

      const encryptedLink = generateInvitationLinkToken(guest.invitationCode);

      const response = NextResponse.json({
        success: true, authenticated: true,
        guest: {
          id: guest.id, firstName: guest.firstName, lastName: guest.lastName,
          displayName: guest.displayName, invitationType: guest.invitationType,
          invitationCode: guest.invitationCode, seats: guest.seats,
          category: guest.category, status: guest.status,
          personalMessage: guest.personalMessage, checkedIn: guest.checkedIn,
          table: guest.table, encryptedLink,
        },
      });

      response.cookies.set({
        name: 'guest_session', value: session.token,
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60,
      });

      return response;
    } catch (error) {
      console.error('Invite link error:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
      return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
    }
  });
}

// POST /api/guest/invite — Admin-only: Generate encrypted invitation link token for a guest
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const body = await request.json();
      const { invitationCode, guestId } = body;

      let code = invitationCode;
      if (!code && guestId) {
        const guest = await tenantDb.guest.findFirst({
          where: { id: guestId },
          select: { invitationCode: true },
        });
        if (!guest) return NextResponse.json({ error: 'Invité non trouvé' }, { status: 404 });
        code = guest.invitationCode;
      }

      if (!code || typeof code !== 'string') {
        return NextResponse.json({ error: 'Code d\'invitation requis' }, { status: 400 });
      }

      const guest = await tenantDb.guest.findFirst({
        where: { invitationCode: code },
        select: { id: true, firstName: true, lastName: true, invitationCode: true },
      });

      if (!guest) return NextResponse.json({ error: 'Invité non trouvé' }, { status: 404 });

      const encryptedToken = generateInvitationLinkToken(code);

      return NextResponse.json({
        encryptedToken,
        guest: {
          id: guest.id, firstName: guest.firstName, lastName: guest.lastName,
          invitationCode: guest.invitationCode,
        },
      });
    });
  } catch (error) {
    console.error('Generate invite link error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
