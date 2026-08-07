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
 * Platform-wide UI component registry (CONS-3-SUPER-ADMIN).
 *
 * GET  /api/platform/components?type=&status=&search=&page=1&limit=20
 * POST /api/platform/components  { name, slug, type, schemaJson?, version?, status? }
 */

const COMPONENT_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  schemaJson: true,
  version: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const VALID_TYPES = [
  'hero', 'gallery', 'timeline', 'rsvp-form', 'story',
  'countdown', 'map', 'guestbook', 'music-player', 'section', 'other',
] as const;

const createComponentSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  type: z.enum(VALID_TYPES),
  schemaJson: z.string().max(200_000).optional().default('{}'),
  version: z.number().int().min(1).optional().default(1),
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
    const type = searchParams.get('type')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [components, total] = await Promise.all([
      db.componentRegistry.findMany({
        where,
        select: COMPONENT_SELECT,
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      db.componentRegistry.count({ where }),
    ]);

    return NextResponse.json({ components, total, page, limit });
  } catch (error) {
    logger.error('List components error', {
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

    const parsed = createComponentSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const existing = await db.componentRegistry.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un composant avec ce slug existe déjà' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const comp = await tx.componentRegistry.create({
        data,
        select: COMPONENT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_COMPONENT',
          details: `Created component ${data.slug} (${data.type})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return comp;
    });

    return NextResponse.json({ component: created }, { status: 201 });
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
    logger.error('Create component error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);
