export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccess } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { badRequest, forbidden, internalError, unauthorized } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/gifts — Wedding gift tracker (CONS-5-CLIENT-BACKEND)
// ══════════════════════════════════════════════════════════════════════════════
// GET  /api/weddings/[id]/gifts             → 200 { gifts }
// POST /api/weddings/[id]/gifts { giverName, giftDescription?, amount?, currency?, receivedAt?, thankYouSent?, note? }
//                                           → 201 { gift }
//
// amount is in cents (Int) to avoid float rounding issues.
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

const createGiftSchema = z.object({
  giverName: z.string().min(1).max(200),
  giftDescription: z.string().max(2000).optional().nullable().default(null),
  amount: z.number().int().min(0).optional().default(0),
  currency: z.string().min(3).max(3).optional().default('USD'),
  receivedAt: z.string().datetime().optional().nullable().default(null),
  thankYouSent: z.boolean().optional().default(false),
  note: z.string().max(2000).optional().nullable().default(null),
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

async function listGifts(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    const gifts = await db.gift.findMany({
      where: { weddingId },
      select: GIFT_SELECT,
      orderBy: { receivedAt: 'desc' },
      take: 1000,
    });
    return NextResponse.json({ gifts });
  } catch (error) {
    logger.error('List gifts error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

async function createGiftHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = createGiftSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const gift = await tx.gift.create({
        data: {
          weddingId,
          giverName: data.giverName,
          giftDescription: data.giftDescription ?? null,
          amount: data.amount,
          currency: data.currency,
          receivedAt: data.receivedAt ? new Date(data.receivedAt) : null,
          thankYouSent: data.thankYouSent,
          note: data.note ?? null,
        },
        select: GIFT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'CREATE_GIFT',
          details: `Recorded gift from ${data.giverName} (${data.amount} ${data.currency})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return gift;
    });

    return NextResponse.json({ gift: created }, { status: 201 });
  } catch (error) {
    logger.error('Create gift error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

export const GET = listGifts;
export const POST = withRateLimit(30, 60_000)(createGiftHandler);
