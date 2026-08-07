export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccess, type AuthUser } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/program/[itemId] — Single program-item mutations
// ══════════════════════════════════════════════════════════════════════════════
// PUT    /api/weddings/[id]/program/[itemId] { title?, description?, scheduledAt?, location?, iconName?, sortOrder? }
// DELETE /api/weddings/[id]/program/[itemId]
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

const updateProgramItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  iconName: z.string().max(60).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

async function checkAuth(request: NextRequest, weddingId: string): Promise<NextResponse | AuthUser> {
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: weddingId, itemId } = await params;
  const auth = await checkAuth(request, weddingId);
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

    const existing = await db.programItem.findFirst({
      where: { id: itemId, weddingId },
      select: { id: true, title: true },
    });
    if (!existing) return notFound('Élément de programme introuvable');

    const updateData: Record<string, unknown> = {};
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
        where: { id: itemId },
        data: updateData,
        select: PROGRAM_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'UPDATE_PROGRAM_ITEM',
          details: `Updated program item ${existing.title}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return item;
    });

    return NextResponse.json({ programItem: updated });
  } catch (error) {
    logger.error('Update program item error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      itemId,
    });
    return internalError();
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
): Promise<NextResponse> {
  const { id: weddingId, itemId } = await params;
  const auth = await checkAuth(request, weddingId);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  try {
    const existing = await db.programItem.findFirst({
      where: { id: itemId, weddingId },
      select: { id: true, title: true },
    });
    if (!existing) return notFound('Élément de programme introuvable');

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.programItem.delete({ where: { id: itemId } });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'DELETE_PROGRAM_ITEM',
          details: `Deleted program item ${existing.title}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ message: 'Élément supprimé' });
  } catch (error) {
    logger.error('Delete program item error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      itemId,
    });
    return internalError();
  }
}

export const DELETE = withRateLimit(30, 60_000)(deleteHandler);
