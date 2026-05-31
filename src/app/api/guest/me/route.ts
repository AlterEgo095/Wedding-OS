import { NextRequest, NextResponse } from 'next/server';
import { validateGuestSession, getAuthenticatedGuest, logGuestAccess, getClientInfo } from '@/lib/guest-auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('guest_session')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Non authentifié', authenticated: false },
        { status: 401 }
      );
    }

    const session = await validateGuestSession(token);

    if (!session.valid || !session.guestId) {
      const clientInfo = getClientInfo(request);
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

    return NextResponse.json({
      authenticated: true,
      guest,
    });
  } catch (error) {
    console.error('Guest me error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
