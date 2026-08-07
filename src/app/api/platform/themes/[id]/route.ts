export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

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

const updateThemeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  paletteJson: z.string().max(50_000).optional(),
  fontDisplay: z.string().max(200).nullable().optional(),
  fontBody: z.string().max(200).nullable().optional(),
  isBuiltIn: z.boolean().optional(),
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
    const theme = await db.platformTheme.findUnique({
      where: { id },
      select: THEME_SELECT,
    });
    if (!theme) return notFound('Thème introuvable');
    return NextResponse.json({ theme });
  } catch (error) {
    logger.error('Get theme error', {
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

    const parsed = updateThemeSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) return notFound('Thème introuvable');

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.update({
        where: { id },
        data: parsed.data,
        select: THEME_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_THEME',
          details: `Updated theme ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return theme;
    });

    return NextResponse.json({ theme: updated });
  } catch (error) {
    logger.error('Update theme error', {
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
    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: { id: true, slug: true, isBuiltIn: true },
    });
    if (!existing) return notFound('Thème introuvable');

    // Protect built-in themes from deletion.
    if (existing.isBuiltIn) {
      return NextResponse.json(
        { error: 'Les thèmes intégrés ne peuvent pas être supprimés' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.platformTheme.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'DELETE_THEME',
          details: `Deleted theme ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Delete theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PUT = withRateLimit(30, 60_000)(putHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);
