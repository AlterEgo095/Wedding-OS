export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Platform-wide wedding site templates (CONS-3-SUPER-ADMIN).
 *
 * GET  /api/platform/templates?status=&search=&page=1&limit=20
 *    → { templates, total, page, limit }
 *
 * POST /api/platform/templates  { name, slug, description?, thumbnailUrl?, schemaJson?, status? }
 *    → 201 { template }
 *
 * Platform-admin only. Uses unsafePlatformDb (no tenant scope — these are
 * platform-wide reusable building blocks).
 */

// P3.9: layoutId is additive (P3-Foundation added the column + Layout relation).
const TEMPLATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
  schemaJson: true,
  version: true,
  status: true,
  layoutId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  description: z.string().max(2000).optional().default(''),
  thumbnailUrl: z.string().url().optional().nullable().default(null),
  schemaJson: z.string().max(200_000).optional().default('{}'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('DRAFT'),
  // P3.9 — link template to a Layout row (P3.2 foundation). Optional + nullable
  // so existing templates without a layout remain valid.
  layoutId: z.string().min(1).max(120).optional().nullable().default(null),
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
    const [templates, total] = await Promise.all([
      db.template.findMany({
        where,
        select: TEMPLATE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.template.count({ where }),
    ]);

    return NextResponse.json({ templates, total, page, limit });
  } catch (error) {
    logger.error('List templates error', {
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

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // Slug uniqueness check.
    const existing = await db.template.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un template avec ce slug existe déjà' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const tpl = await tx.template.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          thumbnailUrl: data.thumbnailUrl ?? null,
          schemaJson: data.schemaJson,
          status: data.status,
          // P3.9 — persist layoutId when provided (additive; null = no layout)
          layoutId: data.layoutId ?? null,
        },
        select: TEMPLATE_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_TEMPLATE',
          details: `Created template ${data.slug} (${data.status})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return tpl;
    });

    return NextResponse.json({ template: created }, { status: 201 });
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
    logger.error('Create template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);

