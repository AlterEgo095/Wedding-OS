export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, tenantDb } from '@/lib/db';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import {
  getClientInfo,
  validateGuestSession,
} from '@/lib/guest-auth';
import { buildTenantContext, runWithTenant } from '@/lib/tenant-context';
import { getAuthUser, assertWeddingAccessAsync } from '@/lib/auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/guestbook — Public guestbook (Livre d'Or) — P4.1
// ══════════════════════════════════════════════════════════════════════════════
//
// GET  /api/weddings/{id}/guestbook?page=1&limit=20
//    → 200 { entries, total, page, limit, hasMore }
//
//    Public: lists APPROVED entries for the wedding, newest first.
//    Pagination via `page` (1-based) and `limit` (default 20, max 50).
//    Returns `hasMore` flag for client-side "load more" UX.
//
// GET  /api/weddings/{id}/guestbook?admin=1&filter=pending|approved|rejected|all
//    → 200 { entries, total, page, limit, hasMore }
//
//    Admin mode: returns ALL entries (or filtered by status) for the
//    moderation UI. Requires PLATFORM_ADMIN or ORGANIZER+ with wedding
//    access (assertWeddingAccessAsync). Returns full row including
//    ipAddress, userAgent, approvedById, etc.
//
// POST /api/weddings/{id}/guestbook  { authorName, message, rating?, guestToken? }
//    → 201 { entry, message }
//
//    Public: submits a new guestbook entry. Created with approved=false
//    (pending moderation by an ORGANIZER or PLATFORM_ADMIN).
//    Rate-limited at 5/min per IP via withRateLimit (anti-spam).
//    Captures ipAddress + userAgent for abuse tracking.
//
//    Optional guest session: if the visitor is authenticated as a guest
//    (guest_session cookie), the entry is linked to their Guest row via
//    guestId. If not authenticated, the entry is anonymous (guestId=null)
//    but still requires authorName + message in the body.
//
//    The guestToken body field is accepted for compatibility with clients
//    that pass it explicitly (e.g. mobile), but the canonical auth path is
//    the httpOnly cookie. Body guestToken takes precedence if both are set.
//
// Wedding is verified via db.wedding.findUnique (404 if not found).
// Guestbook queries go through tenantDb (wedding-scoped) inside runWithTenant.
// ══════════════════════════════════════════════════════════════════════════════

const ENTRY_PUBLIC_SELECT = {
  id: true,
  authorName: true,
  message: true,
  rating: true,
  createdAt: true,
  // Deliberately NOT selecting: ipAddress, userAgent, approvedById,
  // approvedAt, rejectedAt — these are admin-only / forensic fields.
} as const;

const ENTRY_ADMIN_SELECT = {
  id: true,
  weddingId: true,
  guestId: true,
  authorName: true,
  message: true,
  rating: true,
  approved: true,
  approvedById: true,
  approvedAt: true,
  rejectedAt: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  updatedAt: true,
} as const;

const createEntrySchema = z.object({
  authorName: z
    .string()
    .min(1, 'Le nom est requis')
    .max(80, 'Le nom ne peut pas dépasser 80 caractères')
    .trim(),
  message: z
    .string()
    .min(1, 'Le message est requis')
    .max(2000, 'Le message ne peut pas dépasser 2000 caractères')
    .trim(),
  rating: z
    .number()
    .int('La note doit être un entier')
    .min(1, 'La note minimale est 1')
    .max(5, 'La note maximale est 5')
    .optional()
    .nullable(),
  // Optional guest session token (canonical auth path is the httpOnly cookie,
  // but we accept the body field for non-browser clients).
  guestToken: z.string().optional(),
});

/**
 * Resolve the wedding by ID + return a TenantContext for tenantDb scoping.
 * Returns null if the wedding doesn't exist (caller returns 404).
 *
 * We deliberately do NOT gate by status here — even DRAFT weddings can have
 * a guestbook (organizers preview the page during setup). Public visibility
 * of the wedding itself is enforced at the /w/[slug] page level.
 */
async function resolveWeddingContext(weddingId: string) {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      slug: true,
      status: true,
      plan: true,
      isDefault: true,
      brideName: true,
      groomName: true,
      coupleLabel: true,
      weddingDate: true,
      venueName: true,
      venueCity: true,
      organizationId: true,
    },
  });
  if (!wedding) return null;
  const cached = { ...wedding, fetchedAt: Date.now() };
  return buildTenantContext(cached);
}

// ─── GET — public list of approved entries (OR admin list with ?admin=1) ────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: weddingId } = await params;
    const ctx = await resolveWeddingContext(weddingId);
    if (!ctx) return notFound('Mariage introuvable');

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const adminMode = searchParams.get('admin') === '1';
    const filterRaw = searchParams.get('filter') || 'pending';

    // ─── Admin mode authorization ────────────────────────────────────────
    // If `admin=1` is set, require PLATFORM_ADMIN or ORGANIZER+ with wedding
    // access. If the caller is not authorized, fall back to the public path
    // (which returns only approved entries) rather than 403 — this lets the
    // public widget silently ignore the admin flag if a malicious visitor
    // tries to set it without auth.
    let isAdmin = false;
    if (adminMode) {
      const user = await getAuthUser(request);
      if (user) {
        const hasAccess = await assertWeddingAccessAsync(user, weddingId);
        if (
          hasAccess &&
          (user.role === 'PLATFORM_ADMIN' ||
            user.role === 'SUPER_ADMIN' ||
            user.role === 'ORGANIZER' ||
            user.role === 'ORG_ADMIN')
        ) {
          isAdmin = true;
        }
      }
    }

    return runWithTenant(ctx, async () => {
      const skip = (page - 1) * limit;

      // Build the where clause based on mode + filter.
      const where: Record<string, unknown> = { weddingId };
      if (isAdmin) {
        if (filterRaw === 'pending') {
          where.approved = false;
          where.rejectedAt = null;
        } else if (filterRaw === 'approved') {
          where.approved = true;
        } else if (filterRaw === 'rejected') {
          where.NOT = { rejectedAt: null };
        }
        // 'all' → no extra filter
      } else {
        // Public path: only approved, non-rejected entries.
        where.approved = true;
        where.rejectedAt = null;
      }

      // Cast findMany to the base Prisma signature — the tenant-scoped
      // extension produces a union type for findMany that TypeScript can't
      // reconcile ("Excessive stack depth comparing types"). The runtime
      // behavior is identical (extension auto-injects weddingId into the
      // where clause, which we already set explicitly). Same pattern as
      // /api/weddings/[id]/stats/route.ts:134 for tenantDb.guest.groupBy.
      const [entries, total] = await Promise.all([
        (tenantDb.guestbookEntry.findMany as typeof db.guestbookEntry.findMany)({
          where,
          select: isAdmin ? ENTRY_ADMIN_SELECT : ENTRY_PUBLIC_SELECT,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        tenantDb.guestbookEntry.count({ where }),
      ]);

      return NextResponse.json({
        entries,
        total,
        page,
        limit,
        hasMore: skip + entries.length < total,
      });
    });
  } catch (error) {
    logger.error('Guestbook list error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── POST — public submission (rate-limited 5/min per IP) ───────────────────

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: weddingId } = await params;
    const ctx = await resolveWeddingContext(weddingId);
    if (!ctx) return notFound('Mariage introuvable');

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = createEntrySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const clientInfo = getClientInfo(request);

    // ─── Optional guest auth ──────────────────────────────────────────────
    // The canonical auth path is the httpOnly `guest_session` cookie. We also
    // accept a body `guestToken` for non-browser clients (mobile, etc.).
    // If a valid guest session is resolved, link the entry to that guestId;
    // otherwise, the entry is anonymous (guestId=null) but still accepted.
    let guestId: string | null = null;
    const tokenFromCookie = request.cookies.get('guest_session')?.value;
    const token = data.guestToken || tokenFromCookie;
    if (token) {
      const session = await validateGuestSession(
        token,
        clientInfo.userAgent,
        clientInfo.ipAddress
      );
      if (session.valid && session.guestId) {
        guestId = session.guestId;
      }
      // If the token is invalid/expired, we silently fall through to anonymous
      // submission rather than rejecting — the visitor may still sign the
      // guestbook without an active guest session.
    }

    return runWithTenant(ctx, async () => {
      // Same cast pattern as the GET handler — the tenant extension's union
      // type for `create` is not callable per TypeScript. Runtime behavior
      // is unchanged (extension auto-injects weddingId into the data payload,
      // which we already set explicitly above).
      const entry = await (tenantDb.guestbookEntry.create as typeof db.guestbookEntry.create)({
        data: {
          weddingId,
          guestId,
          authorName: data.authorName,
          message: data.message,
          rating: data.rating ?? null,
          approved: false, // pending moderation by default
          ipAddress: clientInfo.ipAddress ?? null,
          userAgent: clientInfo.userAgent ?? null,
        },
        select: {
          id: true,
          authorName: true,
          message: true,
          rating: true,
          approved: true,
          createdAt: true,
        },
      });

      return NextResponse.json(
        {
          entry,
          message: 'Message soumis ! En attente de modération.',
        },
        { status: 201 }
      );
    });
  } catch (error) {
    logger.error('Guestbook submit error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(5, 60_000)(postHandler);
