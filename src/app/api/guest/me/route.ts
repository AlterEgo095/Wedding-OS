export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import {
  validateGuestSession,
  getAuthenticatedGuest,
  logGuestAccess,
  getClientInfo,
  generateInvitationLinkToken,
} from '@/lib/guest-auth';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
import { logger } from '@/lib/logger';

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
      const token = request.cookies.get('guest_session')?.value;
      if (!token) {
        return NextResponse.json(
          { error: 'Non authentifié', authenticated: false },
          { status: 401 }
        );
      }

      const clientInfo = getClientInfo(request);
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

      // getAuthenticatedGuest uses tenantDb.findFirst — auto-scoped to current wedding
      const guest = await getAuthenticatedGuest(session.guestId);

      if (!guest) {
        return NextResponse.json(
          { error: 'Invité non trouvé', authenticated: false },
          { status: 404 }
        );
      }

      logGuestAccess({
        guestId: session.guestId, action: 'VIEW_INVITATION',
        details: `Guest viewed invitation (${session.fingerprintMismatch ? 'fingerprint mismatch' : 'verified'})`,
        ...clientInfo,
      }).catch(() => {});

      const encryptedLink = generateInvitationLinkToken(guest.invitationCode);

      return NextResponse.json({
        authenticated: true,
        guest: { ...guest, encryptedLink, weddingSlug: context.slug },
        security: { fingerprintVerified: !session.fingerprintMismatch, sessionActive: true },
      });
    } catch (error) {
      logger.error('Guest me error', { err: error });
      return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
    }
  });
}
