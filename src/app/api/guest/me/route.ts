import { NextRequest, NextResponse } from 'next/server';
import {
  validateGuestSession,
  getAuthenticatedGuest,
  logGuestAccess,
  getClientInfo,
  generateInvitationLinkToken,
} from '@/lib/guest-auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('guest_session')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Non authentifié', authenticated: false },
        { status: 401 }
      );
    }

    const clientInfo = getClientInfo(request);

    // Validate session with fingerprint verification
    const session = await validateGuestSession(token, clientInfo.userAgent, clientInfo.ipAddress);

    if (!session.valid || !session.guestId) {
      await logGuestAccess({
        action: 'INVALID_SESSION',
        details: 'Attempted to access /me with invalid session',
        ...clientInfo,
      });

      const response = NextResponse.json(
        { error: 'Session invalide ou expirée', authenticated: false },
        { status: 401 }
      );
      response.cookies.delete('guest_session');
      return response;
    }

    // SECURITY: Only return THIS guest's data — no cross-access possible
    const guest = await getAuthenticatedGuest(session.guestId);

    if (!guest) {
      return NextResponse.json(
        { error: 'Invité non trouvé', authenticated: false },
        { status: 404 }
      );
    }

    // Log invitation view (fire and forget, rate-limited to once per session per 5 min)
    logGuestAccess({
      guestId: session.guestId,
      action: 'VIEW_INVITATION',
      details: `Guest viewed invitation (${session.fingerprintMismatch ? 'fingerprint mismatch' : 'verified'})`,
      ...clientInfo,
    }).catch(() => {});

    // Generate encrypted link for sharing/bookmarking
    const encryptedLink = generateInvitationLinkToken(guest.invitationCode);

    return NextResponse.json({
      authenticated: true,
      guest: {
        ...guest,
        encryptedLink,
      },
      security: {
        fingerprintVerified: !session.fingerprintMismatch,
        sessionActive: true,
      },
    });
  } catch (error) {
    console.error('Guest me error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
