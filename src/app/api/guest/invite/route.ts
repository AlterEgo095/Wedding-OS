export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import {
  decryptInvitationLinkToken,
  generateInvitationLinkToken,
  logGuestAccess,
  getClientInfo,
  createGuestSession,
  setGuestSessionCookie, // P2-SEC-4 + P2-CQ-21
} from '@/lib/guest-auth';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolvePublicTenant, runWithTenant, resolveAdminTenant } from '@/lib/tenant-context';
import { logger } from '@/lib/logger'; // P2-SEC-1 — never log error.stack
import { internalError, badRequest } from '@/lib/api-errors'; // P2-CQ-5

// GET /api/guest/invite?token=ENCRYPTED_TOKEN
// Public: Validates an encrypted invitation link token and auto-authenticates the guest
//
// P2-SEC-5 (token in URL): the token is now accepted from EITHER the
// `invite_token` short-lived cookie (preferred — never logged in access
// logs) OR the URL query param `?token=...` (kept for backwards compat
// with invitation links already sent by email/SMS). The response always
// carries `Referrer-Policy: no-referrer` so the token in the URL (if any)
// is not leaked to third-party sites via the Referer header.
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

      // ── P2-SEC-5: accept token from cookie OR URL query ───────────────────
      // Priority: cookie > query. Cookie is read synchronously; query is
      // kept for backwards compat with invitation links already sent.
      const cookieToken = request.cookies.get('invite_token')?.value;
      const queryToken = searchParams.get('token');
      const linkToken = cookieToken || queryToken;

      if (!linkToken) {
        const response = NextResponse.json(
          { error: 'Token d\'invitation requis', authenticated: false },
          { status: 400 }
        );
        // P2-SEC-5: don't leak a potential token via Referer on a redirect.
        response.headers.set('Referrer-Policy', 'no-referrer');
        return response;
      }

      const clientInfo = getClientInfo(request);

      const invitationCode = decryptInvitationLinkToken(linkToken);

      if (!invitationCode) {
        await logGuestAccess({
          action: 'ACCESS_DENIED',
          details: 'Invalid or tampered invitation link token',
          ...clientInfo,
        });
        const response = NextResponse.json(
          { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.', authenticated: false },
          { status: 403 }
        );
        response.headers.set('Referrer-Policy', 'no-referrer');
        response.cookies.delete('invite_token');
        return response;
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
        const response = NextResponse.json(
          { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.', authenticated: false },
          { status: 403 }
        );
        response.headers.set('Referrer-Policy', 'no-referrer');
        response.cookies.delete('invite_token');
        return response;
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
        response.headers.set('Referrer-Policy', 'no-referrer');
        response.cookies.delete('invite_token');
        return response;
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

      // P2-SEC-4 + P2-CQ-21: shared cookie helper ensures sameSite='strict'.
      setGuestSessionCookie(response, session.token);
      // P2-SEC-5: never leak the token via Referer on subsequent navigations.
      response.headers.set('Referrer-Policy', 'no-referrer');
      // Clear the short-lived invite_token cookie — the guest now has a
      // proper guest_session cookie; the invite_token is no longer needed.
      response.cookies.delete('invite_token');

      return response;
    } catch (error) {
      // P2-SEC-1: NEVER log error.stack — it can leak source paths +
      // secrets captured by async hooks. Log message + name only.
      logger.error('Invite link error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      const response = internalError();
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
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
      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
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
    // P2-SEC-1: never log error.stack. Use structured logger instead of console.error.
    logger.error('Generate invite link error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
