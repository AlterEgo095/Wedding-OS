export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccess, type AuthUser } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { badRequest, forbidden, internalError, unauthorized } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/groups — Guest group management (CONS-5-CLIENT-BACKEND)
// ══════════════════════════════════════════════════════════════════════════════
// GET  /api/weddings/[id]/groups          → 200 { groups }
// POST /api/weddings/[id]/groups { name, color? } → 201 { group }
//
// A Group is any categorisation useful for seating / messaging / filtering
// (friends, colleagues, VIP, church, etc.). Different from Family which is
// blood-relation based.
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

const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  color: z.string().max(20).optional().nullable().default(null),
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

async function listGroups(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    const groups = await db.guestGroup.findMany({
      where: { weddingId },
      select: GROUP_SELECT,
      orderBy: { name: 'asc' },
      take: 500,
    });
    return NextResponse.json({
      groups: groups.map((g) => ({
        ...g,
        memberCount: g._count.guests,
        _count: undefined,
      })),
    });
  } catch (error) {
    logger.error('List groups error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

async function createGroupHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const existing = await db.guestGroup.findFirst({
      where: { weddingId, name: data.name },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un groupe avec ce nom existe déjà' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const grp = await tx.guestGroup.create({
        data: {
          weddingId,
          name: data.name,
          color: data.color ?? null,
        },
        select: GROUP_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'CREATE_GROUP',
          details: `Created group ${data.name}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return grp;
    });

    return NextResponse.json(
      { group: { ...created, memberCount: created._count.guests, _count: undefined } },
      { status: 201 }
    );
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
    logger.error('Create group error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

export const GET = listGroups;
export const POST = withRateLimit(30, 60_000)(createGroupHandler);
