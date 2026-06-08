export const dynamic = "force-dynamic";
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  validateGuestSession,
  logGuestAccess,
  getClientInfo,
  encryptId,
} from '@/lib/guest-auth';
import { cleanGuestName } from '@/lib/guest-utils';

/**
 * Guest Lookup API — Name-based search with lookupToken security
 *
 * SECURITY RULES:
 * 1. If the user already has an active guest session, search is BLOCKED
 * 2. Unauthenticated users can search by name to find their invitation
 * 3. Results include an encrypted lookupToken (NOT the guest ID or code)
 * 4. The lookupToken is IP-bound and time-limited (15 min)
 * 5. No invitation codes are ever exposed to the user
 * 6. All search attempts (including blocked ones) are logged
 *
 * FLOW:
 * User types name → This API returns results with lookupTokens
 * User selects their name → Frontend calls /api/guest/auto-auth with lookupToken
 * Backend decrypts token → Verifies IP → Creates session → Guest is authenticated
 */

export async function GET(request: NextRequest) {
  try {
    const clientInfo = getClientInfo(request);

    // ═══════════════════════════════════════════════════════════
    // SECURITY: Search Lock
    // If the user already has an active guest session, they CANNOT
    // search for other guests. This prevents post-authentication
    // enumeration of other invitations.
    // ═══════════════════════════════════════════════════════════
    const guestToken = request.cookies.get('guest_session')?.value;
    if (guestToken) {
      const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
      if (session.valid && session.guestId) {
        await logGuestAccess({
          guestId: session.guestId,
          action: 'SEARCH_BLOCKED',
          details: 'Authenticated guest attempted to search for other guests — blocked by search lock',
          userAgent: clientInfo.userAgent,
          ipAddress: clientInfo.ipAddress,
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

    // ═══════════════════════════════════════════════════════════
    // Normal lookup flow (unauthenticated users only)
    // ═══════════════════════════════════════════════════════════
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length < 2) {
      return NextResponse.json(
        { error: 'La recherche doit contenir au moins 2 caractères' },
        { status: 400 }
      );
    }

    const searchTerm = q.trim();

    // Normalize for accent-insensitive matching
    // "Josue" should match "Josué", "Jerome" should match "Jérôme"
    const normalizeForSearch = (str: string) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const normalizedSearch = normalizeForSearch(searchTerm);

    // Two-pass search strategy:
    // 1. Standard Prisma search (case-insensitive with SQLite LIKE)
    // 2. Accent-insensitive filtering in JavaScript for names with diacritics
    let guests = await db.guest.findMany({
      where: {
        OR: [
          { firstName: { contains: searchTerm } },
          { lastName: { contains: searchTerm } },
          { displayName: { contains: searchTerm } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
        invitationType: true,
        seats: true,
        category: true,
        table: {
          select: {
            name: true,
            number: true,
          },
        },
      },
      take: 30,
    });

    // If no results or few results, try accent-insensitive matching
    // by fetching a broader set and filtering in JavaScript
    if (guests.length < 3) {
      const allPotentialMatches = await db.guest.findMany({
        where: {
          OR: [
            // Try first 2 chars for broader match
            { firstName: { contains: searchTerm.substring(0, 2) } },
            { lastName: { contains: searchTerm.substring(0, 2) } },
            { displayName: { contains: searchTerm.substring(0, 2) } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          invitationType: true,
          seats: true,
          category: true,
          table: {
            select: {
              name: true,
              number: true,
            },
          },
        },
        take: 100,
      });

      // Filter with accent-insensitive matching
      const accentMatches = allPotentialMatches.filter(g => {
        const normalizedFirst = normalizeForSearch(g.firstName);
        const normalizedLast = normalizeForSearch(g.lastName);
        const normalizedDisplay = g.displayName ? normalizeForSearch(g.displayName) : '';
        return normalizedFirst.includes(normalizedSearch) || normalizedLast.includes(normalizedSearch) || normalizedDisplay.includes(normalizedSearch);
      });

      // Merge with existing results (avoid duplicates)
      const existingIds = new Set(guests.map(g => g.id));
      for (const match of accentMatches) {
        if (!existingIds.has(match.id)) {
          guests.push(match);
          existingIds.add(match.id);
        }
      }
    }

    // Create IP hash for binding lookup tokens
    // Use first 3 octets of IP for subnet-based matching
    // This handles mobile network switching and proxy IP changes
    const ipSubnet = clientInfo.ipAddress.split('.').slice(0, 3).join('.');
    const ipHash = crypto.createHash('sha256')
      .update(ipSubnet)
      .digest('hex').substring(0, 16);

    const now = Date.now();

    // Return results with encrypted lookupTokens
    // The lookupToken contains: guestId:ipHash:timestamp (encrypted)
    const results = guests.map((guest) => {
      const tokenPayload = `${guest.id}:${ipHash}:${now}`;
      const lookupToken = encryptId(tokenPayload);
      
      // Use displayName if available (new system: exact text), otherwise fall back to cleanGuestName
      const hasDisplayName = guest.displayName;
      const cleaned = hasDisplayName
        ? null
        : cleanGuestName(guest.firstName, guest.lastName);
      const isCouple = hasDisplayName ? guest.invitationType === 'couple' : cleaned.isCouple;
      const displayText = hasDisplayName ? guest.displayName : cleaned.displayName;
      const greeting = hasDisplayName
        ? (isCouple ? `Invitation exclusive pour le ${guest.displayName}` : `Invitation exclusive pour ${guest.displayName}`)
        : cleaned.greeting;

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

    // Log the search (fire and forget)
    logGuestAccess({
      action: 'SEARCH',
      details: `Name search: "${searchTerm}" → ${results.length} results`,
      ...clientInfo,
    }).catch(() => {});

    return NextResponse.json({
      results,
      total: results.length,
    });
  } catch (error) {
    console.error('Guest lookup error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
