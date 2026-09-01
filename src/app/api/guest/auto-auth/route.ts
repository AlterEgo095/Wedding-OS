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
  setGuestSessionCookie,
  consumeLookupToken, // P2-SEC-12 — replaces module-scope usedLookupTokens Set
} from '@/lib/guest-auth';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
import { logger } from '@/lib/logger'; // P2-SEC-1 — never log error.stack
import { internalError, badRequest, unauthorized } from '@/lib/api-errors'; // P2-CQ-5

// P2-SEC-12 + P2-PERF-15: the module-scope `usedLookupTokens` Set +
// `setInterval` were deleted. One-time-use lookup tokens are now consumed
// via `consumeLookupToken(token, issuedAt)` from @/lib/guest-auth, which
// stores them in a TTL-bound Map pruned by the shared brute-force cleanup
// interval (registered via instrumentation-node.ts). This closes the 5-min
// replay window that existed when the Set was cleared wholesale every 10 min.

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

      // Mission 6.0 P0.7 — rate limit review: this route already enforces a
      // 5 req/min IP-based rate limit below (stricter than the 10 req/min
      // target). Per task instructions, left as-is. The existing check uses
      // the sync in-memory `checkRateLimit` (not Redis-backed); a future
      // hardening pass could swap it for `checkRateLimitAsync` for multi-
      // instance parity, but the per-IP gate is already in place.
      if (!(await checkRateLimitAsync(`auto-auth-${rateLimitKey}`, 5, 60 * 1000)).allowed) {
        await logGuestAccess({ action: 'AUTH_RATE_LIMITED', details: `Auto-auth rate limited: ${rateLimitKey}`, ...clientInfo });
        return NextResponse.json({ error: 'Trop de tentatives. Veuillez réessayer dans un instant.' }, { status: 429 });
      }

      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Auto-auth attempted with invalid JSON body', ...clientInfo });
        return badRequest('Requête invalide.');
      }
      const { lookupToken } = body;

      if (!lookupToken || typeof lookupToken !== 'string') {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Auto-auth attempted without lookup token', ...clientInfo });
        return badRequest('Requête invalide.');
      }

      // P2-SEC-12: decrypt FIRST so we can extract the token's issuedAt
      // timestamp. The one-time-use check then uses (token, issuedAt) so the
      // shared TTL cache can also reject tokens whose 15-min timestamp has
      // expired — even if they're not yet in the cache.
      const decrypted = decryptId(lookupToken);
      if (!decrypted) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Invalid or tampered lookup token in auto-auth', ...clientInfo });
        return NextResponse.json({ error: 'Cette invitation est privée et exclusivement réservée à son titulaire.' }, { status: 403 });
      }

      const parts = decrypted.split(':');
      if (parts.length < 3) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Malformed lookup token in auto-auth', ...clientInfo });
        return badRequest('Requête invalide.');
      }

      const guestId = parts[0];
      const ipHash = parts[1];
      const timestamp = parseInt(parts[2], 10);

      // P2-SEC-12: timestamp expiry check — also enforced inside
      // consumeLookupToken, but kept here so we can log a distinct
      // 'expired' access-denied reason before consuming the token.
      const tokenAge = Date.now() - timestamp;
      if (tokenAge > 15 * 60 * 1000 || tokenAge < 0 || Number.isNaN(timestamp)) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Expired lookup token in auto-auth', ...clientInfo });
        return unauthorized('Votre recherche a expiré. Veuillez relancer votre recherche.');
      }

      // P2-SEC-12: one-time-use enforcement — atomic check + record.
      // Returns false on (a) reuse or (b) timestamp older than TTL.
      if (!consumeLookupToken(lookupToken, timestamp)) {
        await logGuestAccess({ action: 'ACCESS_DENIED', details: 'Reuse of one-time lookup token attempted', ...clientInfo });
        return unauthorized('Ce lien de recherche a déjà été utilisé. Veuillez relancer votre recherche.');
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

      // P2-SEC-4 + P2-CQ-21: use the shared cookie helper so the cookie
      // attributes (httpOnly, secure, sameSite='strict', maxAge=30d) stay in
      // sync with the other guest-session cookie sites.
      setGuestSessionCookie(response, session.token);

      return response;
    } catch (error) {
      // P2-SEC-1: NEVER log error.stack — it can leak source paths +
      // secrets captured by async hooks. Log message + name only.
      logger.error('Auto-auth error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return internalError();
    }
  });
}
