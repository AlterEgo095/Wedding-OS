export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

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

const updateComponentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(VALID_TYPES).optional(),
  schemaJson: z.string().max(200_000).optional(),
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
    const comp = await db.componentRegistry.findUnique({
      where: { id },
      select: COMPONENT_SELECT,
    });
    if (!comp) return notFound('Composant introuvable');
    return NextResponse.json({ component: comp });
  } catch (error) {
    logger.error('Get component error', {
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

    const parsed = updateComponentSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    const existing = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) return notFound('Composant introuvable');

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const comp = await tx.componentRegistry.update({
        where: { id },
        data: {
          ...parsed.data,
          version: { increment: 1 },
        },
        select: COMPONENT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_COMPONENT',
          details: `Updated component ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return comp;
    });

    return NextResponse.json({ component: updated });
  } catch (error) {
    logger.error('Update component error', {
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
    const existing = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) return notFound('Composant introuvable');

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.componentRegistry.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'DELETE_COMPONENT',
          details: `Deleted component ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Delete component error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PUT = withRateLimit(30, 60_000)(putHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);
