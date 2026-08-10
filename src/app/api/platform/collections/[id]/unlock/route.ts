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
 * POST /api/platform/collections/[id]/unlock
 *
 * Remove the commercial lock on a Collection. After unlock:
 *   - PATCH /api/platform/collections/[id]/governance works again normally
 *   - lockedAt + lockedBy are cleared back to null
 *   - The Collection lifecycle status is unchanged
 *
 * Body (all optional):
 *   { reason?: string } — optional rationale written to the audit log.
 *
 * MISSION 5.9.2 P3-A — Tasks 1+2+3.
 *
 * Auth: PLATFORM_ADMIN only.
 * CSRF: X-CSRF-Token header.
 *
 * Companion file: collection-lock-route.ts → /api/platform/collections/[id]/lock/route.ts
 */

const COLLECTION_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  thumbnailUrl: true,
  isActive: true,
  isPublished: true,
  sortOrder: true,
  category: true,
  tier: true,
  status: true,
  version: true,
  // P3-A — lock + audit fields
  isLocked: true,
  lockedAt: true,
  lockedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

const bodySchema = z.object({
  reason: z.string().max(500).optional(),
});

async function unlockHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const reason = parsed.data.reason?.trim() || '';

    const existing = await db.collection.findUnique({
      where: { id },
      select: { id: true, slug: true, isLocked: true },
    });
    if (!existing) return notFound('Collection introuvable');

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const collection = await tx.collection.update({
        where: { id },
        data: {
          isLocked: false,
          lockedAt: null,
          lockedBy: null,
        },
        select: COLLECTION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'COLLECTION_UNLOCKED',
          details:
            `Unlocked collection ${existing.slug}` +
            (reason ? ` — reason: ${reason}` : '') +
            (!existing.isLocked ? ' (was already unlocked)' : ''),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          targetResourceId: existing.id,
          targetType: 'COLLECTION',
          result: 'SUCCESS',
        },
      });
      return collection;
    });

    return NextResponse.json({ collection: updated });
  } catch (error) {
    logger.error('Unlock collection error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(30, 60_000)(unlockHandler);
