export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccess } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/groups/[groupId] — Single-group mutations
// ══════════════════════════════════════════════════════════════════════════════
// PUT    /api/weddings/[id]/groups/[groupId] { name?, color? }
// DELETE /api/weddings/[id]/groups/[groupId]
// ══════════════════════════════════════════════════════════════════════════════

const GROUP_SELECT = {
  id: true,
  weddingId: true,
  name: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { guests: true } },
} as const;

const updateGroupSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().max(20).optional().nullable(),
});

async function checkAuth(request: NextRequest, weddingId: string) {
  const user = await getAuthUser(request);
  if (!user) return { error: unauthorized() };
  if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
    return { error: forbidden('Réservé aux organisateurs') };
  }
  if (!assertWeddingAccess(user, weddingId)) {
    return { error: forbidden('Accès refusé à ce mariage') };
  }
  return { user };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const { id: weddingId, groupId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = updateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const existing = await db.guestGroup.findFirst({
      where: { id: groupId, weddingId },
      select: { id: true, name: true },
    });
    if (!existing) return notFound('Groupe introuvable');

    if (data.name && data.name !== existing.name) {
      const dup = await db.guestGroup.findFirst({
        where: { weddingId, name: data.name, NOT: { id: groupId } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: 'Un groupe avec ce nom existe déjà' },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.color !== undefined) updateData.color = data.color ?? null;

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const grp = await tx.guestGroup.update({
        where: { id: groupId },
        data: updateData,
        select: GROUP_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'UPDATE_GROUP',
          details: `Updated group ${existing.name}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return grp;
    });

    return NextResponse.json({
      group: { ...updated, memberCount: updated._count.guests, _count: undefined },
    });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Un groupe avec ce nom existe déjà' },
        { status: 409 }
      );
    }
    logger.error('Update group error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      groupId,
    });
    return internalError();
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const { id: weddingId, groupId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const existing = await db.guestGroup.findFirst({
      where: { id: groupId, weddingId },
      select: { id: true, name: true, _count: { select: { guests: true } } },
    });
    if (!existing) return notFound('Groupe introuvable');

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.guest.updateMany({
        where: { groupId },
        data: { groupId: null },
      });
      await tx.guestGroup.delete({ where: { id: groupId } });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'DELETE_GROUP',
          details: `Deleted group ${existing.name} (${existing._count.guests} guests detached)`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ message: 'Groupe supprimé' });
  } catch (error) {
    logger.error('Delete group error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      groupId,
    });
    return internalError();
  }
}

export const DELETE = withRateLimit(30, 60_000)(deleteHandler);
