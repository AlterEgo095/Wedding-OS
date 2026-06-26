export const dynamic = "force-dynamic";
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import {
  createGuestSession,
  logGuestAccess,
  getClientInfo,
  validateGuestSession,
  generateInvitationLinkToken,
  decryptId,
} from '@/lib/guest-auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';

const usedLookupTokens = new Set<string>();
setInterval(() => { usedLookupTokens.clear(); }, 10 * 60 * 1000);

export async function POST(request: NextRequest) {
  const { context, error: tenantError } = await resolvePublicTenant(request);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
      const clientInfo = getClientInfo(request);
      const rateLimitKey = getRateLimitKey(request);

      // Search Lock
      const existingToken = request.cookies.get('guest_session')?.value;
      if (existingToken) {
        const existingSession = await validateGuestSession(existingToken, clientInfo.userAgent, clientInfo.ipAddress);
        if (existingSession.valid && existingSession.guestId) {
          await logGuestAccess({
            guestId: existingSession.guestId, action: 'SEARCH_BLOCKED',
            details: 'Authenticated guest attempted auto-auth as different guest — blocked by search lock',
            ...clientInfo,
          });

          const existingGuest = await tenantDb.guest.findFirst({
            where: { id: existingSession.guestId },
            include: { table: { select: { id: true, name: true, number: true } } },
          });

          if (existingGuest) {
            const encryptedLink = generateInvitationLinkToken(existingGuest.invitationCode);
            return NextResponse.json({
              success: true, alreadyAuthenticated: true,
              guest: {
                id: existingGuest.id, firstName: existingGuest.firstName, lastName: existingGuest.lastName,
                displayName: existingGuest.displayName, invitationType: existingGuest.invitationType,
                invitationCode: existingGuest.invitationCode, seats: existingGuest.seats,
                category: existingGuest.category, status: existingGuest.status,
                personalMessage: existingGuest.personalMessage, checkedIn: existingGuest.checkedIn,
                table: existingGuest.table, encryptedLink,
              },
            });
          }
        }
      }

      if (!checkRateLimit(`auto-auth-${rateLimitKey}`, 5, 60 * 1000)) {
        await logGuestAccess({ action: 'AUTH_RATE_LIMITED', details: `Auto-auth rate limited: ${rateLimitKey}`, ...clientInfo });
        return NextResponse.json({ error: 'Trop de tentatives. Veuillez réessayer dans un instant.' }, { status: 429 });
      }

      const body = await request.json();
      const { lookupToken } = body;

      if (!lookupToken || typeof lookupToken !== 'string') {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Auto-auth attempted without lookup token', ...clientInfo });
        return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
      }

      if (usedLookupTokens.has(lookupToken)) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Reuse of one-time lookup token attempted', ...clientInfo });
        return NextResponse.json({ error: 'Ce lien de recherche a déjà été utilisé. Veuillez relancer votre recherche.' }, { status: 401 });
      }

      const decrypted = decryptId(lookupToken);
      if (!decrypted) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Invalid or tampered lookup token in auto-auth', ...clientInfo });
        return NextResponse.json({ error: 'Cette invitation est privée et exclusivement réservée à son titulaire.' }, { status: 403 });
      }

      usedLookupTokens.add(lookupToken);

      const parts = decrypted.split(':');
      if (parts.length < 3) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Malformed lookup token in auto-auth', ...clientInfo });
        return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
      }

      const guestId = parts[0];
      const ipHash = parts[1];
      const timestamp = parseInt(parts[2], 10);

      const tokenAge = Date.now() - timestamp;
      if (tokenAge > 15 * 60 * 1000 || tokenAge < 0) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Expired lookup token in auto-auth', ...clientInfo });
        return NextResponse.json({ error: 'Votre recherche a expiré. Veuillez relancer votre recherche.' }, { status: 401 });
      }

      const ipSubnet = clientInfo.ipAddress.split('.').slice(0, 3).join('.');
      const currentIpHash = crypto.createHash('sha256').update(ipSubnet).digest('hex').substring(0, 16);

      if (ipHash !== currentIpHash) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: `IP subnet mismatch in auto-auth: lookup was from different subnet`, ...clientInfo });
        return NextResponse.json({ error: 'Vérification de sécurité échouée. Veuillez relancer votre recherche.' }, { status: 403 });
      }

      // findFirst is auto-scoped by tenant extension — cross-tenant guestId lookups return null
      const guest = await tenantDb.guest.findFirst({
        where: { id: guestId },
        include: { table: { select: { id: true, name: true, number: true } } },
      });

      if (!guest) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: `Auto-auth for non-existent guest: ${guestId.substring(0, 8)}***`, ...clientInfo });
        return NextResponse.json({ error: 'Invité non trouvé.' }, { status: 404 });
      }

      const session = await createGuestSession(guest.id, guest.invitationCode, clientInfo.userAgent, clientInfo.ipAddress);

      logGuestAccess({
        guestId: guest.id, action: 'LOGIN',
        details: `Guest ${guest.firstName} ${guest.lastName} auto-authenticated via name lookup`,
        ...clientInfo,
      }).catch(() => {});

      const encryptedLink = generateInvitationLinkToken(guest.invitationCode);

      const response = NextResponse.json({
        success: true,
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
      console.error('Auto-auth error:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
      return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
    }
  });
}
