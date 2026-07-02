export const dynamic = "force-dynamic";
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import {
  validateGuestSession,
  logGuestAccess,
  getClientInfo,
  encryptId,
} from '@/lib/guest-auth';
import { cleanGuestName } from '@/lib/guest-utils';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

/**
 * Guest Lookup API — Name-based search with lookupToken security
 * Tenant-aware since Phase 2: only searches guests in the resolved wedding.
 *
 * SECURITY (P0-SEC-5): Previously had NO rate limit, allowing unauthenticated
 * attackers to enumerate the entire guest list (PII: names, table numbers,
 * seats, category) by firing thousands of name searches. Now rate-limited to
 * 5 searches/minute per IP — matches the auto-auth rate limit and allows
 * legitimate use (a guest typically searches 1-3 times to find their name)
 * while blocking mass enumeration.
 */

export async function GET(request: NextRequest) {
  // Resolve tenant (public — uses header/query/default)
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

      // P0-SEC-5: Rate limit guest lookups to prevent PII enumeration.
      // 5 searches/minute per IP — same ceiling as auto-auth.
      if (!checkRateLimit(`guest-lookup-${rateLimitKey}`, 5, 60 * 1000)) {
        await logGuestAccess({
          action: 'LOOKUP_RATE_LIMITED',
          details: `Guest lookup rate limited: ${rateLimitKey}`,
          ...clientInfo,
        }).catch(() => {});
        return NextResponse.json(
          { error: 'Trop de recherches. Veuillez r\u00e9essayer dans un instant.' },
          { status: 429 }
        );
      }

      // SECURITY: Search Lock — If guest already has an active session, block
      const guestToken = request.cookies.get('guest_session')?.value;
      if (guestToken) {
        const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
        if (session.valid && session.guestId) {
          await logGuestAccess({
            guestId: session.guestId,
            action: 'SEARCH_BLOCKED',
            details: 'Authenticated guest attempted to search for other guests — blocked by search lock',
            ...clientInfo,
          });

          return NextResponse.json(
            {
              error: 'Vous êtes déjà connecté à votre espace personnel. La recherche est désactivée.',
              searchLocked: true,
            },
            { status: 403 }
          );
        }
      }

      const { searchParams } = new URL(request.url);
      const q = searchParams.get('q');

      if (!q || q.trim().length < 2) {
        return NextResponse.json(
          { error: 'La recherche doit contenir au moins 2 caractères' },
          { status: 400 }
        );
      }

      const searchTerm = q.trim();
      const normalizeForSearch = (str: string) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const normalizedSearch = normalizeForSearch(searchTerm);

      // findMany is auto-scoped by tenant extension — only returns guests in current wedding
      let guests = await tenantDb.guest.findMany({
        where: {
          OR: [
            { firstName: { contains: searchTerm } },
            { lastName: { contains: searchTerm } },
            { displayName: { contains: searchTerm } },
          ],
        },
        select: {
          id: true, firstName: true, lastName: true, displayName: true,
          invitationType: true, seats: true, category: true,
          table: { select: { name: true, number: true } },
        },
        take: 30,
      });

      // Accent-insensitive fallback
      if (guests.length < 3) {
        const allPotentialMatches = await tenantDb.guest.findMany({
          where: {
            OR: [
              { firstName: { contains: searchTerm.substring(0, 2) } },
              { lastName: { contains: searchTerm.substring(0, 2) } },
              { displayName: { contains: searchTerm.substring(0, 2) } },
            ],
          },
          select: {
            id: true, firstName: true, lastName: true, displayName: true,
            invitationType: true, seats: true, category: true,
            table: { select: { name: true, number: true } },
          },
          take: 100,
        });

        const accentMatches = allPotentialMatches.filter(g => {
          const normalizedFirst = normalizeForSearch(g.firstName);
          const normalizedLast = normalizeForSearch(g.lastName);
          const normalizedDisplay = g.displayName ? normalizeForSearch(g.displayName) : '';
          return normalizedFirst.includes(normalizedSearch) || normalizedLast.includes(normalizedSearch) || normalizedDisplay.includes(normalizedSearch);
        });

        const existingIds = new Set(guests.map(g => g.id));
        for (const match of accentMatches) {
          if (!existingIds.has(match.id)) {
            guests.push(match);
            existingIds.add(match.id);
          }
        }
      }

      const ipSubnet = clientInfo.ipAddress.split('.').slice(0, 3).join('.');
      const ipHash = crypto.createHash('sha256').update(ipSubnet).digest('hex').substring(0, 16);
      const now = Date.now();

      const results = guests.map((guest) => {
        const tokenPayload = `${guest.id}:${ipHash}:${now}`;
        const lookupToken = encryptId(tokenPayload);

        const hasDisplayName = guest.displayName;
        // P3: `cleaned` is only non-null when !hasDisplayName, but TS can't
        // narrow across the ternary. Compute once and assert non-null in the
        // branch that uses it.
        const cleaned = hasDisplayName ? null : cleanGuestName(guest.firstName, guest.lastName);
        const isCouple = hasDisplayName ? guest.invitationType === 'couple' : cleaned!.isCouple;
        const displayText = hasDisplayName ? guest.displayName : cleaned!.displayName;
        const greeting = hasDisplayName
          ? (isCouple ? `Invitation exclusive pour le ${guest.displayName}` : `Invitation exclusive pour ${guest.displayName}`)
          : cleaned!.greeting;

        return {
          name: displayText,
          firstName: guest.firstName,
          lastName: guest.lastName,
          isCouple,
          greeting,
          table: guest.table ? guest.table.name : null,
          tableNumber: guest.table?.number ?? null,
          seats: guest.seats,
          category: guest.category,
          lookupToken,
        };
      });

      logGuestAccess({
        action: 'SEARCH',
        details: `Name search: "${searchTerm}" → ${results.length} results`,
        ...clientInfo,
      }).catch(() => {});

      return NextResponse.json({ results, total: results.length });
    } catch (error) {
      console.error('Guest lookup error:', error);
      return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
    }
  });
}
