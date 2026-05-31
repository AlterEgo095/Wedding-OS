export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateGuestSession, logGuestAccess, getClientInfo } from '@/lib/guest-auth';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('guest_session')?.value;
    const clientInfo = getClientInfo(request);

    if (token) {
      const session = await validateGuestSession(token);

      if (session.valid && session.guestId) {
        // Deactivate session
        if (session.sessionId) {
          await db.guestSession.update({
            where: { id: session.sessionId },
            data: { isActive: false },
          });
        }

        await logGuestAccess({
          guestId: session.guestId,
          action: 'LOGOUT',
          details: 'Guest logged out',
          ...clientInfo,
        });
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete('guest_session');
    return response;
  } catch (error) {
    console.error('Guest logout error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
