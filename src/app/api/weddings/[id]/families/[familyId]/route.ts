export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccess } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/families/[familyId] — Single-family mutations
// ══════════════════════════════════════════════════════════════════════════════
// PUT    /api/weddings/[id]/families/[familyId] { name?, side?, contactPhone?, contactEmail? }
// DELETE /api/weddings/[id]/families/[familyId]
// ══════════════════════════════════════════════════════════════════════════════

const FAMILY_SELECT = {
  id: true,
  weddingId: true,
  name: true,
  side: true,
  contactPhone: true,
  contactEmail: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { guests: true } },
} as const;

const updateFamilySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  side: z.enum(['BRIDE', 'GROOM', 'COMMON']).optional(),
  contactPhone: z.string().max(40).optional().nullable(),
  contactEmail: z.string().email().max(200).optional().nullable(),
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
  { params }: { params: Promise<{ id: string; familyId: string }> }
) {
  const { id: weddingId, familyId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = updateFamilySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const existing = await db.family.findFirst({
      where: { id: familyId, weddingId },
      select: { id: true, name: true },
    });
    if (!existing) return notFound('Famille introuvable');

    // If renaming, check for duplicate name in same wedding
    if (data.name && data.name !== existing.name) {
      const dup = await db.family.findFirst({
        where: { weddingId, name: data.name, NOT: { id: familyId } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: 'Une famille avec ce nom existe déjà' },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.side !== undefined) updateData.side = data.side;
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone ?? null;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail ?? null;

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const fam = await tx.family.update({
        where: { id: familyId },
        data: updateData,
        select: FAMILY_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'UPDATE_FAMILY',
          details: `Updated family ${existing.name}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return fam;
    });

    return NextResponse.json({
      family: { ...updated, memberCount: updated._count.guests, _count: undefined },
    });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Une famille avec ce nom existe déjà' },
        { status: 409 }
      );
    }
    logger.error('Update family error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      familyId,
    });
    return internalError();
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; familyId: string }> }
) {
  const { id: weddingId, familyId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const existing = await db.family.findFirst({
      where: { id: familyId, weddingId },
      select: { id: true, name: true, _count: { select: { guests: true } } },
    });
    if (!existing) return notFound('Famille introuvable');

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      // Detach guests explicitly (FK has onDelete: SetNull but be explicit)
      await tx.guest.updateMany({
        where: { familyId },
        data: { familyId: null },
      });
      await tx.family.delete({ where: { id: familyId } });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'DELETE_FAMILY',
          details: `Deleted family ${existing.name} (${existing._count.guests} guests detached)`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ message: 'Famille supprimée' });
  } catch (error) {
    logger.error('Delete family error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      familyId,
    });
    return internalError();
  }
}

export const DELETE = withRateLimit(30, 60_000)(deleteHandler);
