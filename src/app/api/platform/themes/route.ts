export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Platform-wide visual theme presets (CONS-3-SUPER-ADMIN).
 *
 * GET  /api/platform/themes?status=&search=&page=1&limit=20
 * POST /api/platform/themes  { name, slug, paletteJson?, fontDisplay?, fontBody?, isBuiltIn?, status? }
 */

const THEME_SELECT = {
  id: true,
  name: true,
  slug: true,
  paletteJson: true,
  fontDisplay: true,
  fontBody: true,
  isBuiltIn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const createThemeSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  paletteJson: z.string().max(50_000).optional().default('{}'),
  fontDisplay: z.string().max(200).optional().nullable().default(null),
  fontBody: z.string().max(200).optional().nullable().default(null),
  isBuiltIn: z.boolean().optional().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('PUBLISHED'),
});

async function getList(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [themes, total] = await Promise.all([
      db.platformTheme.findMany({
        where,
        select: THEME_SELECT,
        orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      db.platformTheme.count({ where }),
    ]);

    return NextResponse.json({ themes, total, page, limit });
  } catch (error) {
    logger.error('List themes error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function createHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = createThemeSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const existing = await db.platformTheme.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un thème avec ce slug existe déjà' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.create({
        data: {
          name: data.name,
          slug: data.slug,
          paletteJson: data.paletteJson,
          fontDisplay: data.fontDisplay ?? null,
          fontBody: data.fontBody ?? null,
          isBuiltIn: data.isBuiltIn,
          status: data.status,
        },
        select: THEME_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_THEME',
          details: `Created theme ${data.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return theme;
    });

    return NextResponse.json({ theme: created }, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Ce slug est déjà utilisé' },
        { status: 409 }
      );
    }
    logger.error('Create theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);
