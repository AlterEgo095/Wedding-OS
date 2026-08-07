export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccess, type AuthUser } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/families — Guest family management (CONS-5-CLIENT-BACKEND)
// ══════════════════════════════════════════════════════════════════════════════
// GET  /api/weddings/[id]/families            → 200 { families }
// POST /api/weddings/[id]/families { name, side?, contactPhone?, contactEmail? }
//                                             → 201 { family }
//
// Authorization: ORGANIZER+. Tenant-scoped via [id] URL param + assertWeddingAccess.
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

const createFamilySchema = z.object({
  name: z.string().min(1).max(120),
  side: z.enum(['BRIDE', 'GROOM', 'COMMON']).optional().default('COMMON'),
  contactPhone: z.string().max(40).optional().nullable().default(null),
  contactEmail: z.string().email().max(200).optional().nullable().default(null),
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

async function listFamilies(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if (auth instanceof NextResponse) return auth;

  try {
    const families = await db.family.findMany({
      where: { weddingId },
      select: FAMILY_SELECT,
      orderBy: { name: 'asc' },
      take: 500,
    });
    return NextResponse.json({
      families: families.map((f) => ({
        ...f,
        memberCount: f._count.guests,
        _count: undefined,
      })),
    });
  } catch (error) {
    logger.error('List families error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

async function createFamilyHandler(
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
    const parsed = createFamilySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // Composite unique [weddingId, name] check
    const existing = await db.family.findFirst({
      where: { weddingId, name: data.name },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Une famille avec ce nom existe déjà' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const fam = await tx.family.create({
        data: {
          weddingId,
          name: data.name,
          side: data.side,
          contactPhone: data.contactPhone ?? null,
          contactEmail: data.contactEmail ?? null,
        },
        select: FAMILY_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'CREATE_FAMILY',
          details: `Created family ${data.name} (${data.side})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return fam;
    });

    return NextResponse.json(
      { family: { ...created, memberCount: created._count.guests, _count: undefined } },
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
        { error: 'Une famille avec ce nom existe déjà' },
        { status: 409 }
      );
    }
    logger.error('Create family error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}

export const GET = listFamilies;
export const POST = withRateLimit(30, 60_000)(createFamilyHandler);
