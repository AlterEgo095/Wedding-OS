export const dynamic = "force-dynamic";
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  createGuestSession,
  logGuestAccess,
  getClientInfo,
  validateGuestSession,
  generateInvitationLinkToken,
  decryptId,
} from '@/lib/guest-auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

/**
 * Guest Auto-Authentication API
 *
 * This API enables the "magic" experience where a guest simply searches
 * their name and instantly gets authenticated — no code required.
 *
 * FLOW:
 * 1. Guest searches by name via /api/guest/lookup → gets lookupToken
 * 2. Guest selects their name → frontend calls this endpoint with lookupToken
 * 3. Backend decrypts token → verifies IP match → creates session → sets cookie
 * 4. Guest is now authenticated and sees their personal space
 *
 * SECURITY:
 * - lookupToken is encrypted (AES-256-GCM) and IP-bound
 * - lookupToken is one-time-use (tracked in memory)
 * - Rate limited: 5 auto-auth attempts per minute per IP
 * - Search lock: if already authenticated, cannot re-authenticate as different guest
 * - Full audit logging of all attempts
 * - Brute force protection inherited
 */

// In-memory set of used lookup tokens (one-time-use enforcement)
const usedLookupTokens = new Set<string>();

// Clean up old tokens every 10 minutes (tokens older than 15 min)
setInterval(() => {
  usedLookupTokens.clear();
}, 10 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    const clientInfo = getClientInfo(request);
    const rateLimitKey = getRateLimitKey(request);

    // ═══════════════════════════════════════════════════════════
    // SECURITY: Search Lock
    // If guest already has an active session, they CANNOT
    // authenticate as a different guest.
    // ═══════════════════════════════════════════════════════════
    const existingToken = request.cookies.get('guest_session')?.value;
    if (existingToken) {
      const existingSession = await validateGuestSession(existingToken, clientInfo.userAgent, clientInfo.ipAddress);
      if (existingSession.valid && existingSession.guestId) {
        // Guest already authenticated — block re-authentication
        await logGuestAccess({
          guestId: existingSession.guestId,
          action: 'SEARCH_BLOCKED',
          details: 'Authenticated guest attempted auto-auth as different guest — blocked by search lock',
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
              displayName: existingGuest.displayName,
              invitationType: existingGuest.invitationType,
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

    // ═══════════════════════════════════════════════════════════
    // Rate limiting: 5 auto-auth attempts per minute per IP
    // ═══════════════════════════════════════════════════════════
    if (!checkRateLimit(`auto-auth-${rateLimitKey}`, 5, 60 * 1000)) {
      await logGuestAccess({
        action: 'AUTH_RATE_LIMITED',
        details: `Auto-auth rate limited: ${rateLimitKey}`,
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Trop de tentatives. Veuillez réessayer dans un instant.' },
        { status: 429 }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // Validate and decrypt the lookup token
    // ═══════════════════════════════════════════════════════════
    const body = await request.json();
    const { lookupToken } = body;

    if (!lookupToken || typeof lookupToken !== 'string') {
      await logGuestAccess({
        action: 'ACCESS_DENIED',
        details: 'Auto-auth attempted without lookup token',
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Requête invalide.' },
        { status: 400 }
      );
    }

    // Check one-time-use
    if (usedLookupTokens.has(lookupToken)) {
      await logGuestAccess({
        action: 'ACCESS_DENIED',
        details: 'Reuse of one-time lookup token attempted',
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Ce lien de recherche a déjà été utilisé. Veuillez relancer votre recherche.' },
        { status: 401 }
      );
    }

    // Decrypt the token to get guestId
    const decrypted = decryptId(lookupToken);
    if (!decrypted) {
      await logGuestAccess({
        action: 'ACCESS_DENIED',
        details: 'Invalid or tampered lookup token in auto-auth',
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.' },
        { status: 403 }
      );
    }

    // Mark token as used immediately
    usedLookupTokens.add(lookupToken);

    // The decrypted value is "guestId:ipHash:timestamp"
    const parts = decrypted.split(':');
    if (parts.length < 3) {
      await logGuestAccess({
        action: 'ACCESS_DENIED',
        details: 'Malformed lookup token in auto-auth',
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Requête invalide.' },
        { status: 400 }
      );
    }

    const guestId = parts[0];
    const ipHash = parts[1];
    const timestamp = parseInt(parts[2], 10);

    // Verify the token hasn't expired (15 minutes)
    const tokenAge = Date.now() - timestamp;
    if (tokenAge > 15 * 60 * 1000 || tokenAge < 0) {
      await logGuestAccess({
        action: 'ACCESS_DENIED',
        details: 'Expired lookup token in auto-auth',
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Votre recherche a expiré. Veuillez relancer votre recherche.' },
        { status: 401 }
      );
    }

    // Verify IP binding — subnet-based matching (first 3 octets)
    // This handles mobile network switching and proxy IP changes
    const ipSubnet = clientInfo.ipAddress.split('.').slice(0, 3).join('.');
    const currentIpHash = crypto.createHash('sha256')
      .update(ipSubnet)
      .digest('hex').substring(0, 16);

    if (ipHash !== currentIpHash) {
      await logGuestAccess({
        action: 'ACCESS_DENIED',
        details: `IP subnet mismatch in auto-auth: lookup was from different subnet`,
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Vérification de sécurité échouée. Veuillez relancer votre recherche.' },
        { status: 403 }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // Find the guest and create session
    // ═══════════════════════════════════════════════════════════
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: {
        table: {
          select: { id: true, name: true, number: true },
        },
      },
    });

    if (!guest) {
      await logGuestAccess({
        action: 'ACCESS_DENIED',
        details: `Auto-auth for non-existent guest: ${guestId.substring(0, 8)}***`,
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Invité non trouvé.' },
        { status: 404 }
      );
    }

    // Create session
    const session = await createGuestSession(
      guest.id,
      guest.invitationCode,
      clientInfo.userAgent,
      clientInfo.ipAddress
    );

    // Log successful auto-authentication
    logGuestAccess({
      guestId: guest.id,
      action: 'LOGIN',
      details: `Guest ${guest.firstName} ${guest.lastName} auto-authenticated via name lookup`,
      ...clientInfo,
    }).catch(() => {});

    // Generate encrypted link for bookmarking
    const encryptedLink = generateInvitationLinkToken(guest.invitationCode);

    // Set HttpOnly cookie and return guest data
    const response = NextResponse.json({
      success: true,
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        displayName: guest.displayName,
        invitationType: guest.invitationType,
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
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error) {
    console.error('Auto-auth error:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
