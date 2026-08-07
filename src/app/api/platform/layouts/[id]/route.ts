export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Per-layout operations (P3.2 — Layouts stage UI + API).
 *
 * GET    /api/platform/layouts/{id}
 * PATCH  /api/platform/layouts/{id}  { name?, description?, thumbnailUrl?,
 *                                      sectionsJson?, propsJson?, status? }
 * DELETE /api/platform/layouts/{id}  (soft delete → status=ARCHIVED;
 *                                     403 for isBuiltIn layouts — designers
 *                                     must clone them to make edits)
 *
 * PATCH auto-increments `version` (optimistic concurrency signal — the UI
 * displays it so reviewers can tell which revision is live).
 *
 * Platform-admin only. Uses unsafePlatformDb. AuditLog entries are written
 * inside the same $transaction.
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

const sectionSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(['hero', 'story', 'gallery', 'timeline', 'map', 'guest-auth']),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
  props: z.record(z.string(), z.unknown()).optional(),
});

const updateLayoutSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  sectionsJson: z.array(sectionSchema).optional(),
  propsJson: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
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
    const layout = await db.layout.findUnique({
      where: { id },
      select: LAYOUT_SELECT,
    });
    if (!layout) return notFound('Layout introuvable');
    return NextResponse.json({ layout });
  } catch (error) {
    logger.error('Get layout error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function patchHandler(
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

    const parsed = updateLayoutSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    const existing = await db.layout.findUnique({
      where: { id },
      select: { id: true, slug: true, isBuiltIn: true },
    });
    if (!existing) return notFound('Layout introuvable');

    // Serialize structured JSON fields to strings for the DB.
    const { sectionsJson, propsJson, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest };
    if (sectionsJson !== undefined) patch.sectionsJson = JSON.stringify(sectionsJson);
    if (propsJson !== undefined) patch.propsJson = JSON.stringify(propsJson);

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const layout = await tx.layout.update({
        where: { id },
        data: {
          ...patch,
          version: { increment: 1 },
        },
        select: LAYOUT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_LAYOUT',
          details: `Updated layout ${layout.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return layout;
    });

    return NextResponse.json({ layout: updated });
  } catch (error) {
    logger.error('Update layout error', {
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
    const existing = await db.layout.findUnique({
      where: { id },
      select: { id: true, slug: true, isBuiltIn: true, status: true },
    });
    if (!existing) return notFound('Layout introuvable');

    // Built-in layouts cannot be deleted — they are part of the platform's
    // canonical layout catalog (the 5 seeded in P3-Foundation: royal, classic,
    // minimal, destination, modern). Designers must clone them to make edits.
    if (existing.isBuiltIn) {
      return NextResponse.json(
        {
          error:
            'Les layouts natifs ne peuvent pas être supprimés. Clonez-les pour personnaliser.',
        },
        { status: 403 }
      );
    }

    // Soft-delete: archive instead of hard delete so historical deployments
    // can still resolve the layout by id.
    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.layout.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'ARCHIVE_LAYOUT',
          details: `Archived layout ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Archive layout error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PATCH = withRateLimit(30, 60_000)(patchHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);
