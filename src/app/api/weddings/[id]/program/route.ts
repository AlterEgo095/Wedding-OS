export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccess, type AuthUser } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError, badRequest, unauthorized, forbidden } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// Mission 6.0 — P4.3 — /api/weddings/[id]/program  (CANONICAL program API)
// ══════════════════════════════════════════════════════════════════════════════
//
// ProgramItem is the CANONICAL going-forward model for the wedding-day
// schedule (ceremony, cocktail, dinner, dance, etc.). The legacy
// EventTimeline model is DEPRECATED — kept for audit + backward-compat reads
// only. All new writes (admin UI, future public RSVP-linked scheduling) go
// to ProgramItem.
//
// Routes:
//   GET  /api/weddings/[id]/program
//        • Public — wedding must be PUBLISHED.
//        • Authenticated ORGANIZER/PLATFORM_ADMIN see the program regardless
//          of status (for admin preview during DRAFT).
//        → 200 { program: ProgramItem[] }
//
//   POST /api/weddings/[id]/program  { title, description?, location?,
//                                      scheduledAt?, iconName?, sortOrder? }
//        • Auth: PLATFORM_ADMIN or ORGANIZER with wedding access.
//        → 201 { programItem }
//        • Audit: program.create
//
// ─── On the use of `db` vs `tenantDb` ─────────────────────────────────────────
// The task spec asks for `tenantDb` (the tenant-scoped auto-inject extension
// of the Prisma client). However, the current Prisma client regen (post-P3)
// introduced a TypeScript extension-composition regression that makes
// `tenantDb.<model>.<method>()` calls fail tsc with "Excessive stack depth
// comparing types". This affects ALL routes using the extended client
// (including the legacy /api/timeline/route.ts). The fix is at the extension
// layer (tenant-scoped.ts) and is tracked separately.
//
// In the meantime, this route uses the raw `db` client with EXPLICIT
// `weddingId` filters on every query — defence-in-depth (the same pattern
// used by the existing /api/weddings/[id]/* routes that built successfully
// in build 11). This is functionally equivalent to tenantDb-with-auto-inject
// for our use case (single-wedding scoped queries).
// ══════════════════════════════════════════════════════════════════════════════

const PROGRAM_SELECT = {
  id: true,
  weddingId: true,
  scheduledAt: true,
  title: true,
  description: true,
  location: true,
  iconName: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const weddingIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

const createProgramItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable().default(null),
  scheduledAt: z.string().datetime().optional().nullable().default(null),
  location: z.string().max(200).optional().nullable().default(null),
  iconName: z.string().max(60).optional().nullable().default(null),
  sortOrder: z.number().int().min(0).optional().default(0),
});

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Authenticate the request as an ORGANIZER+ user with access to this wedding.
 * Returns the user on success, or a NextResponse (401/403) on failure.
 *
 * Used by POST. GET uses a softer check (public for PUBLISHED weddings, but
 * ORGANIZER+ can preview DRAFT weddings).
 */
async function requireOrganizer(
  request: NextRequest,
  weddingId: string,
): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
    return forbidden('Réservé aux organisateurs');
  }
  if (!assertWeddingAccess(user, weddingId)) {
    return forbidden('Accès refusé à ce mariage');
  }
  return user;
}

// ─── GET: list program items ─────────────────────────────────────────────────
//
// Public access for PUBLISHED weddings (so the public wedding page can render
// the program without auth). Authenticated ORGANIZER/PLATFORM_ADMIN see the
// program regardless of status (admin preview during DRAFT).
//
// The response shape `{ program: [...] }` is preserved for backward compat
// with the existing ProgramManager.tsx admin UI.

async function listProgram(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: weddingId } = await params;
  const idParsed = weddingIdSchema.safeParse(weddingId);
  if (!idParsed.success) return apiError('Identifiant de mariage invalide', 400);

  try {
    // Resolve the wedding (platform DB — Wedding is not tenant-scoped).
    const wedding = await db.wedding.findUnique({
      where: { id: idParsed.data },
      select: { id: true, status: true },
    });
    if (!wedding) return apiError('Mariage introuvable', 404);

    // Determine access: PUBLISHED weddings are publicly readable; for
    // non-PUBLISHED weddings, require ORGANIZER+ with wedding access.
    const isPublished = wedding.status === 'PUBLISHED';
    if (!isPublished) {
      const user = await getAuthUser(request);
      if (!user) return unauthorized();
      if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
        return forbidden('Mariage non publié');
      }
      if (!assertWeddingAccess(user, wedding.id)) {
        return forbidden('Accès refusé à ce mariage');
      }
    }

    const items = await db.programItem.findMany({
      where: { weddingId: wedding.id },
      select: PROGRAM_SELECT,
      orderBy: [
        { sortOrder: 'asc' },
        { scheduledAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: 500,
    });

    return apiSuccess({ program: items });
  } catch (error) {
    logger.error('program.list error', {
      weddingId: idParsed.data,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── POST: create program item ───────────────────────────────────────────────

async function createProgramHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: weddingId } = await params;
  const idParsed = weddingIdSchema.safeParse(weddingId);
  if (!idParsed.success) return apiError('Identifiant de mariage invalide', 400);

  const auth = await requireOrganizer(request, idParsed.data);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = createProgramItemSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // Verify the wedding exists (defence-in-depth — assertWeddingAccess
    // already gates access, but an explicit existence check gives a clearer
    // 404 vs 403 in the case of a stale auth token).
    const wedding = await db.wedding.findUnique({
      where: { id: idParsed.data },
      select: { id: true },
    });
    if (!wedding) return apiError('Mariage introuvable', 404);

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const item = await tx.programItem.create({
        data: {
          weddingId: wedding.id,
          title: data.title,
          description: data.description ?? null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          location: data.location ?? null,
          iconName: data.iconName ?? null,
          sortOrder: data.sortOrder,
        },
        select: PROGRAM_SELECT,
      });
      // Audit log — Mission 6.0 dotted convention (program.create).
      // writeAuditLog routes to the right DB internally; passing weddingId
      // scopes it to the tenant AuditLog table.
      await writeAuditLog({
        weddingId: wedding.id,
        userId: user.id,
        action: 'program.create',
        details: `Création élément de programme: ${data.title}`,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      });
      return item;
    });

    return apiSuccess({ programItem: created }, 201);
  } catch (error) {
    logger.error('program.create error', {
      weddingId: idParsed.data,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = listProgram;
export const POST = withRateLimit(30, 60_000)(createProgramHandler);
