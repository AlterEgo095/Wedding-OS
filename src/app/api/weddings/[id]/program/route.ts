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
// /api/weddings/[id]/program — Wedding-day program (CONS-5-CLIENT-BACKEND)
// ══════════════════════════════════════════════════════════════════════════════
// GET  /api/weddings/[id]/program { title, description?, scheduledAt?, location?, iconName?, sortOrder? }
//                                            → 201 { programItem }
//
// Different from EventTimeline (which is the love-story timeline). ProgramItem
// is the schedule of the wedding DAY: ceremony, cocktail, dinner, dance, etc.
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

const createProgramItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable().default(null),
  scheduledAt: z.string().datetime().optional().nullable().default(null),
  location: z.string().max(200).optional().nullable().default(null),
  iconName: z.string().max(60).optional().nullable().default(null),
  sortOrder: z.number().int().min(0).optional().default(0),
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

async function listProgram(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    const items = await db.programItem.findMany({
      where: { weddingId },
      select: PROGRAM_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return NextResponse.json({ program: items });
  } catch (error) {
    logger.error('List program error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

async function createProgramHandler(
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
    const parsed = createProgramItemSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const item = await tx.programItem.create({
        data: {
          weddingId,
          title: data.title,
          description: data.description ?? null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          location: data.location ?? null,
          iconName: data.iconName ?? null,
          sortOrder: data.sortOrder,
        },
        select: PROGRAM_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'CREATE_PROGRAM_ITEM',
          details: `Added program item ${data.title}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return item;
    });

    return NextResponse.json({ programItem: created }, { status: 201 });
  } catch (error) {
    logger.error('Create program item error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

export const GET = listProgram;
export const POST = withRateLimit(30, 60_000)(createProgramHandler);
