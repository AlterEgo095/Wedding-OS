export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
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
  setGuestSessionCookie, // P2-SEC-4 + P2-CQ-21
} from '@/lib/guest-auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError, badRequest } from '@/lib/api-errors';

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

      // SECURITY: Search Lock
      const existingToken = request.cookies.get('guest_session')?.value;
      if (existingToken) {
        const existingSession = await validateGuestSession(existingToken, clientInfo.userAgent, clientInfo.ipAddress);
        if (existingSession.valid && existingSession.guestId) {
          await logGuestAccess({
            guestId: existingSession.guestId,
            action: 'SEARCH_BLOCKED',
            details: 'Authenticated guest attempted to re-authenticate as a different guest — blocked by search lock',
            ...clientInfo,
          });

          const existingGuest = await tenantDb.guest.findFirst({
            where: { id: existingSession.guestId },
            include: { table: { select: { id: true, name: true, number: true } } },
          });

          if (existingGuest) {
            const encryptedLink = generateInvitationLinkToken(existingGuest.invitationCode);
            return NextResponse.json({
              success: true,
              alreadyAuthenticated: true,
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

      // Rate limit
      if (!checkRateLimit(`guest-auth-${rateLimitKey}`, 10, 60 * 1000)) {
        await logGuestAccess({
          action: 'AUTH_RATE_LIMITED',
          details: `Rate limited: ${rateLimitKey}`,
          ...clientInfo,
        });
        return NextResponse.json({ error: 'Trop de tentatives. Veuillez réessayer dans un instant.' }, { status: 429 });
      }

      // Brute force
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

      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { code, firstName, lastName, linkToken } = body;
      let invitationCode = '';

      if (linkToken && typeof linkToken === 'string') {
        const decrypted = decryptInvitationLinkToken(linkToken);
        if (!decrypted) {
          await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Invalid or tampered invitation link token', ...clientInfo });
          return NextResponse.json({ error: 'Lien d\'invitation invalide ou expiré.' }, { status: 401 });
        }
        invitationCode = decrypted;
        await logGuestAccess({ action: 'LINK_VISIT', details: `Invitation link used: ${invitationCode.substring(0, 2)}***`, ...clientInfo });
      } else if (code && typeof code === 'string' && code.trim().length >= 3) {
        invitationCode = code.trim().toUpperCase();
      } else {
        return NextResponse.json({ error: 'Code d\'invitation requis (minimum 3 caractères)' }, { status: 400 });
      }

      // findFirst is auto-scoped by tenant extension
      const whereClause: Record<string, unknown> = { invitationCode };
      if (firstName) whereClause.firstName = { contains: firstName.trim() };
      if (lastName) whereClause.lastName = { contains: lastName.trim() };

      const guest = await tenantDb.guest.findFirst({
        where: whereClause,
        include: { table: { select: { id: true, name: true, number: true } } },
      });

      if (!guest) {
        recordFailedAttempt(rateLimitKey);
        await logGuestAccess({ action: 'AUTH_FAILED', details: `Failed auth with code: ${invitationCode.substring(0, 2)}***`, ...clientInfo });
        const remaining = checkBruteForce(rateLimitKey).remainingAttempts;
        return NextResponse.json(
          { error: 'Code d\'invitation ou nom invalide. Vérifiez vos informations.', remainingAttempts: remaining },
          { status: 401 }
        );
      }

      clearBruteForce(rateLimitKey);

      const session = await createGuestSession(guest.id, guest.invitationCode, clientInfo.userAgent, clientInfo.ipAddress);

      logGuestAccess({
        guestId: guest.id, action: 'LOGIN',
        details: `Guest ${guest.firstName} authenticated via ${linkToken ? 'link' : 'code'}`,
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

      // P2-SEC-4 + P2-CQ-21: shared cookie helper ensures sameSite='strict'.
      setGuestSessionCookie(response, session.token);

      return response;
    } catch (error) {
      // P2-SEC-1: never log error.stack.
      logger.error('Guest auth error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return internalError();
    }
  });
}
