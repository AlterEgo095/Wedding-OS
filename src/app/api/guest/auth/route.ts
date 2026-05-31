export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  createGuestSession,
  logGuestAccess,
  getClientInfo,
  checkBruteForce,
  recordFailedAttempt,
  clearBruteForce,
  decryptInvitationLinkToken,
  generateInvitationLinkToken,
  validateGuestSession,
} from '@/lib/guest-auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const clientInfo = getClientInfo(request);
    const rateLimitKey = getRateLimitKey(request);

    // ═══════════════════════════════════════════════════════════
    // SECURITY: Search Lock — If guest already has an active session,
    // they CANNOT authenticate as a different guest.
    // ═══════════════════════════════════════════════════════════
    const existingToken = request.cookies.get('guest_session')?.value;
    if (existingToken) {
      const existingSession = await validateGuestSession(existingToken, clientInfo.userAgent, clientInfo.ipAddress);
      if (existingSession.valid && existingSession.guestId) {
        // Guest already has an active session — block re-authentication
        await logGuestAccess({
          guestId: existingSession.guestId,
          action: 'SEARCH_BLOCKED',
          details: 'Authenticated guest attempted to re-authenticate as a different guest — blocked by search lock',
          ...clientInfo,
        });

        // Return their existing session info instead
        const existingGuest = await db.guest.findUnique({
          where: { id: existingSession.guestId },
          include: {
            table: { select: { id: true, name: true, number: true } },
          },
        });

        if (existingGuest) {
          const encryptedLink = generateInvitationLinkToken(existingGuest.invitationCode);
          return NextResponse.json({
            success: true,
            alreadyAuthenticated: true,
            guest: {
              id: existingGuest.id,
              firstName: existingGuest.firstName,
              lastName: existingGuest.lastName,
              invitationCode: existingGuest.invitationCode,
              seats: existingGuest.seats,
              category: existingGuest.category,
              status: existingGuest.status,
              personalMessage: existingGuest.personalMessage,
              checkedIn: existingGuest.checkedIn,
              table: existingGuest.table,
              encryptedLink,
            },
          });
        }
      }
    }

    // Rate limit: 10 attempts per minute per IP
    if (!checkRateLimit(`guest-auth-${rateLimitKey}`, 10, 60 * 1000)) {
      await logGuestAccess({
        action: 'AUTH_RATE_LIMITED',
        details: `Rate limited: ${rateLimitKey}`,
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Trop de tentatives. Veuillez réessayer dans un instant.' },
        { status: 429 }
      );
    }

    // Brute force protection: check if IP is banned
    const bruteForceCheck = checkBruteForce(rateLimitKey);
    if (!bruteForceCheck.allowed) {
      await logGuestAccess({
        action: 'BRUTE_FORCE_BLOCKED',
        details: `IP banned for ${process.env.BRUTE_FORCE_BAN_MINUTES || 60} minutes`,
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Accès temporairement bloqué pour des raisons de sécurité. Veuillez réessayer plus tard.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { code, firstName, lastName, linkToken } = body;

    let invitationCode = '';

    // Support encrypted link token authentication
    if (linkToken && typeof linkToken === 'string') {
      const decrypted = decryptInvitationLinkToken(linkToken);
      if (!decrypted) {
        await logGuestAccess({
          action: 'ACCESS_DENIED',
          details: 'Invalid or tampered invitation link token',
          ...clientInfo,
        });

        return NextResponse.json(
          { error: 'Lien d\'invitation invalide ou expiré.' },
          { status: 401 }
        );
      }
      invitationCode = decrypted;

      // Log link visit
      await logGuestAccess({
        action: 'LINK_VISIT',
        details: `Invitation link used: ${invitationCode.substring(0, 2)}***`,
        ...clientInfo,
      });
    } else if (code && typeof code === 'string' && code.trim().length >= 3) {
      invitationCode = code.trim().toUpperCase();
    } else {
      return NextResponse.json(
        { error: 'Code d\'invitation requis (minimum 3 caractères)' },
        { status: 400 }
      );
    }

    // Find guest by invitation code (exact match for security)
    const whereClause: Record<string, unknown> = {
      invitationCode: invitationCode,
    };

    // If firstName is provided, verify it matches (case-insensitive partial match)
    if (firstName) {
      whereClause.firstName = { contains: firstName.trim() };
    }
    // If lastName is also provided, add it as additional verification
    if (lastName) {
      whereClause.lastName = { contains: lastName.trim() };
    }

    const guest = await db.guest.findFirst({
      where: whereClause,
      include: {
        table: {
          select: { id: true, name: true, number: true },
        },
      },
    });

    if (!guest) {
      // Record failed attempt for brute force protection
      recordFailedAttempt(rateLimitKey);

      // Log failed attempt
      await logGuestAccess({
        action: 'AUTH_FAILED',
        details: `Failed auth with code: ${invitationCode.substring(0, 2)}***`,
        ...clientInfo,
      });

      const remaining = checkBruteForce(rateLimitKey).remainingAttempts;

      return NextResponse.json(
        {
          error: 'Code d\'invitation ou nom invalide. Vérifiez vos informations.',
          remainingAttempts: remaining,
        },
        { status: 401 }
      );
    }

    // Clear brute force counter on successful auth
    clearBruteForce(rateLimitKey);

    // Create session
    const session = await createGuestSession(
      guest.id,
      guest.invitationCode,
      clientInfo.userAgent,
      clientInfo.ipAddress
    );

    // Log successful login (fire and forget)
    logGuestAccess({
      guestId: guest.id,
      action: 'LOGIN',
      details: `Guest ${guest.firstName} authenticated via ${linkToken ? 'link' : 'code'}`,
      ...clientInfo,
    }).catch(() => {});

    // Generate encrypted link token for this guest
    const encryptedLink = generateInvitationLinkToken(guest.invitationCode);

    // Set HttpOnly cookie
    const response = NextResponse.json({
      success: true,
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        invitationCode: guest.invitationCode,
        seats: guest.seats,
        category: guest.category,
        status: guest.status,
        personalMessage: guest.personalMessage,
        checkedIn: guest.checkedIn,
        table: guest.table,
        encryptedLink,
      },
    });

    response.cookies.set({
      name: 'guest_session',
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Guest auth error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
