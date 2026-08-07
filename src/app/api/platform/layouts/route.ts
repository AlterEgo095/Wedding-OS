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
 * Platform-wide Layout Manager (P3.2 — Layouts stage UI + API).
 *
 * Layouts are platform-level design primitives (section orderings + default
 * props per section) that the pipeline's `resolveLayouts` stage attaches to a
 * PublishedConfig. They are NOT tenant-scoped — every wedding can use any
 * PUBLISHED layout.
 *
 * GET  /api/platform/layouts?status=&search=&isBuiltIn=&page=1&limit=20
 *    → { layouts, total, page, limit }
 *
 * POST /api/platform/layouts  { name, slug, description?, thumbnailUrl?, sectionsJson?, propsJson?, status? }
 *    → 201 { layout }
 *
 * sectionsJson / propsJson are accepted as STRUCTURED values (array / object)
 * and stored as JSON strings in the DB (Layout.sectionsJson / propsJson),
 * matching the Layout Prisma model (P3-Foundation migration).
 *
 * Platform-admin only. Uses unsafePlatformDb (Layout is platform-wide, not
 * tenant-scoped). AuditLog entries are written inside the same $transaction.
 */

const LAYOUT_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
  sectionsJson: true,
  propsJson: true,
  version: true,
  status: true,
  isBuiltIn: true,
  createdAt: true,
  updatedAt: true,
} as const;

// sectionsJson shape: ManifestSection[] (matches src/lib/wedding/manifest.ts).
// We redeclare the schema here to keep the API layer self-contained — the
// pipeline + manifest layer remains the canonical TypeScript source.
const sectionSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(['hero', 'story', 'gallery', 'timeline', 'map', 'guest-auth']),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
  props: z.record(z.string(), z.unknown()).optional(),
});

const createLayoutSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  description: z.string().max(2000).optional().default(''),
  thumbnailUrl: z.string().url().optional().nullable().default(null),
  sectionsJson: z.array(sectionSchema).optional().default([]),
  propsJson: z.record(z.string(), z.unknown()).optional().default({}),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('DRAFT'),
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
    const isBuiltInParam = searchParams.get('isBuiltIn')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (isBuiltInParam === 'true') where.isBuiltIn = true;
    else if (isBuiltInParam === 'false') where.isBuiltIn = false;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [layouts, total] = await Promise.all([
      db.layout.findMany({
        where,
        select: LAYOUT_SELECT,
        orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      db.layout.count({ where }),
    ]);

    return NextResponse.json({ layouts, total, page, limit });
  } catch (error) {
    logger.error('List layouts error', {
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

    const parsed = createLayoutSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // Slug uniqueness check (defensive — the DB @@unique constraint is the
    // last line of defense and surfaces as Prisma P2002 below).
    const existing = await db.layout.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un layout avec ce slug existe déjà' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const layout = await tx.layout.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          thumbnailUrl: data.thumbnailUrl ?? null,
          sectionsJson: JSON.stringify(data.sectionsJson),
          propsJson: JSON.stringify(data.propsJson),
          status: data.status,
          // isBuiltIn defaults to false in schema — platform-created layouts
          // are NEVER built-in (only the 5 seeded P3-Foundation rows are).
        },
        select: LAYOUT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_LAYOUT',
          details: `Created layout ${data.slug} (${data.status})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return layout;
    });

    return NextResponse.json({ layout: created }, { status: 201 });
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
    logger.error('Create layout error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);
