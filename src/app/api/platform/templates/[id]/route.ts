export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Per-template operations (CONS-3-SUPER-ADMIN).
 *
 * GET    /api/platform/templates/{id}
 * PUT    /api/platform/templates/{id}  { name?, description?, thumbnailUrl?, schemaJson?, status? }
 * DELETE /api/platform/templates/{id}
 */

// P3.9: layoutId added (additive — matches P3-Foundation schema column).
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

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  schemaJson: z.string().max(200_000).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  // P3.9 — allow clearing / setting layoutId on existing templates.
  layoutId: z.string().min(1).max(120).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const tpl = await db.template.findUnique({
      where: { id },
      select: TEMPLATE_SELECT,
    });
    if (!tpl) return notFound('Template introuvable');
    return NextResponse.json({ template: tpl });
  } catch (error) {
    logger.error('Get template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function putHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    const existing = await db.template.findUnique({
      where: { id },
      select: { id: true, version: true },
    });
    if (!existing) return notFound('Template introuvable');

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const tpl = await tx.template.update({
        where: { id },
        data: {
          ...parsed.data,
          version: { increment: 1 },
        },
        select: TEMPLATE_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_TEMPLATE',
          details: `Updated template ${tpl.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return tpl;
    });

    return NextResponse.json({ template: updated });
  } catch (error) {
    logger.error('Update template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const existing = await db.template.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) return notFound('Template introuvable');

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.template.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'DELETE_TEMPLATE',
          details: `Deleted template ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Delete template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PUT = withRateLimit(30, 60_000)(putHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);

