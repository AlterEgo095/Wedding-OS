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
// Mission 6.0 — P4.3 — /api/weddings/[id]/program/[itemId]  (Item CRUD)
// ══════════════════════════════════════════════════════════════════════════════
//
// PATCH   /api/weddings/[id]/program/[itemId]
//         { title?, description?, scheduledAt?, location?, iconName?, sortOrder? }
//         → 200 { programItem }
//         • Audit: program.update
//
// DELETE  /api/weddings/[id]/program/[itemId]
//         → 200 { message }
//         • Audit: program.delete
//
// PUT is also exposed (alias of PATCH) for backward compat with the existing
// ProgramManager.tsx admin UI which uses PUT. New clients should use PATCH.
//
// Auth: PLATFORM_ADMIN or ORGANIZER with wedding access. Public users cannot
// mutate the program.
//
// ─── On the use of `db` vs `tenantDb` ─────────────────────────────────────────
// Same rationale as /api/weddings/[id]/program/route.ts — the current Prisma
// client regen introduced an extension-composition regression that makes
// `tenantDb.<model>.<method>()` calls fail tsc. We use the raw `db` client
// with EXPLICIT `weddingId` filters on every query (defence-in-depth).
// findFirst (not findUnique) is used so the explicit weddingId filter is
// applied at the SQL level, preventing cross-tenant access by-id.
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

const weddingIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const itemIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

const updateProgramItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  iconName: z.string().max(60).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

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

// ─── PATCH / PUT: update program item ────────────────────────────────────────

async function updateProgramHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  const { id: weddingId, itemId } = await params;
  const idParsed = weddingIdSchema.safeParse(weddingId);
  const itemParsed = itemIdSchema.safeParse(itemId);
  if (!idParsed.success || !itemParsed.success) {
    return apiError('Identifiants invalides', 400);
  }

  const auth = await requireOrganizer(request, idParsed.data);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = updateProgramItemSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // findFirst with explicit weddingId filter — defence-in-depth against
    // cross-tenant access by-id (see file header).
    const existing = await db.programItem.findFirst({
      where: { id: itemParsed.data, weddingId: idParsed.data },
      select: { id: true, title: true },
    });
    if (!existing) return apiError('Élément de programme introuvable', 404);

    const updateData: {
      title?: string;
      description?: string | null;
      scheduledAt?: Date | null;
      location?: string | null;
      iconName?: string | null;
      sortOrder?: number;
    } = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description ?? null;
    if (data.scheduledAt !== undefined) {
      updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
    }
    if (data.location !== undefined) updateData.location = data.location ?? null;
    if (data.iconName !== undefined) updateData.iconName = data.iconName ?? null;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const item = await tx.programItem.update({
        where: { id: existing.id },
        data: updateData,
        select: PROGRAM_SELECT,
      });
      await writeAuditLog({
        weddingId: idParsed.data,
        userId: user.id,
        action: 'program.update',
        details: `Mise à jour élément de programme: ${existing.title}`,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      });
      return item;
    });

    return apiSuccess({ programItem: updated });
  } catch (error) {
    logger.error('program.update error', {
      weddingId: idParsed.data,
      itemId: itemParsed.data,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── DELETE: delete program item ─────────────────────────────────────────────

async function deleteProgramHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  const { id: weddingId, itemId } = await params;
  const idParsed = weddingIdSchema.safeParse(weddingId);
  const itemParsed = itemIdSchema.safeParse(itemId);
  if (!idParsed.success || !itemParsed.success) {
    return apiError('Identifiants invalides', 400);
  }

  const auth = await requireOrganizer(request, idParsed.data);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  try {
    const existing = await db.programItem.findFirst({
      where: { id: itemParsed.data, weddingId: idParsed.data },
      select: { id: true, title: true },
    });
    if (!existing) return apiError('Élément de programme introuvable', 404);

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.programItem.delete({ where: { id: existing.id } });
      await writeAuditLog({
        weddingId: idParsed.data,
        userId: user.id,
        action: 'program.delete',
        details: `Suppression élément de programme: ${existing.title}`,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      });
    });

    return apiSuccess({ message: 'Élément supprimé' });
  } catch (error) {
    logger.error('program.delete error', {
      weddingId: idParsed.data,
      itemId: itemParsed.data,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PATCH = withRateLimit(30, 60_000)(updateProgramHandler);
// PUT alias — the existing ProgramManager.tsx admin UI uses PUT. New clients
// should prefer PATCH (the canonical HTTP method for partial updates).
export const PUT = withRateLimit(30, 60_000)(updateProgramHandler);
export const DELETE = withRateLimit(30, 60_000)(deleteProgramHandler);
