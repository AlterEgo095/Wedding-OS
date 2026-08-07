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
// /api/weddings/[id]/gifts/[giftId] — Single-gift mutations
// ══════════════════════════════════════════════════════════════════════════════
// PUT    /api/weddings/[id]/gifts/[giftId] { giverName?, giftDescription?, amount?, currency?, receivedAt?, thankYouSent?, note? }
// DELETE /api/weddings/[id]/gifts/[giftId]
// ══════════════════════════════════════════════════════════════════════════════

const GIFT_SELECT = {
  id: true,
  weddingId: true,
  giverName: true,
  giftDescription: true,
  amount: true,
  currency: true,
  receivedAt: true,
  thankYouSent: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const;

const updateGiftSchema = z.object({
  giverName: z.string().min(1).max(200).optional(),
  giftDescription: z.string().max(2000).optional().nullable(),
  amount: z.number().int().min(0).optional(),
  currency: z.string().min(3).max(3).optional(),
  receivedAt: z.string().datetime().optional().nullable(),
  thankYouSent: z.boolean().optional(),
  note: z.string().max(2000).optional().nullable(),
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
  { params }: { params: Promise<{ id: string; giftId: string }> }
): Promise<NextResponse> {
  const { id: weddingId, giftId } = await params;
  const auth = await checkAuth(request, weddingId);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = updateGiftSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const existing = await db.gift.findFirst({
      where: { id: giftId, weddingId },
      select: { id: true, giverName: true },
    });
    if (!existing) return notFound('Cadeau introuvable');

    const updateData: Record<string, unknown> = {};
    if (data.giverName !== undefined) updateData.giverName = data.giverName;
    if (data.giftDescription !== undefined) updateData.giftDescription = data.giftDescription ?? null;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.receivedAt !== undefined) {
      updateData.receivedAt = data.receivedAt ? new Date(data.receivedAt) : null;
    }
    if (data.thankYouSent !== undefined) updateData.thankYouSent = data.thankYouSent;
    if (data.note !== undefined) updateData.note = data.note ?? null;

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const gift = await tx.gift.update({
        where: { id: giftId },
        data: updateData,
        select: GIFT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'UPDATE_GIFT',
          details: `Updated gift from ${existing.giverName}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return gift;
    });

    return NextResponse.json({ gift: updated });
  } catch (error) {
    logger.error('Update gift error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      giftId,
    });
    return internalError();
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; giftId: string }> }
): Promise<NextResponse> {
  const { id: weddingId, giftId } = await params;
  const auth = await checkAuth(request, weddingId);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  try {
    const existing = await db.gift.findFirst({
      where: { id: giftId, weddingId },
      select: { id: true, giverName: true },
    });
    if (!existing) return notFound('Cadeau introuvable');

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.gift.delete({ where: { id: giftId } });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'DELETE_GIFT',
          details: `Deleted gift from ${existing.giverName}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ message: 'Cadeau supprimé' });
  } catch (error) {
    logger.error('Delete gift error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
      giftId,
    });
    return internalError();
  }
}

export const DELETE = withRateLimit(30, 60_000)(deleteHandler);
