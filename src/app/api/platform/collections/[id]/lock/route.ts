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
 * POST /api/platform/collections/[id]/lock
 *
 * Commercial-lock a Collection. Once locked:
 *   - PATCH /api/platform/collections/[id]/governance returns 423 Locked
 *     (Task 2 enforcement — see collections-governance-route.ts.NEW).
 *   - The Collection lifecycle status (BROUILLON/EN_COURS/VALIDATION/PUBLIE/
 *     COMMERCIALISE/ARCHIVE) is NOT touched — the lock is a commercial freeze
 *     on top of the lifecycle.
 *   - GET (read) still works — locked Collections remain visible in the
 *     catalog and on already-bound weddings.
 *
 * Body (all optional):
 *   { reason?: string } — optional rationale written to the audit log.
 *
 * MISSION 5.9.2 P3-A — Tasks 1+2+3 (Collection lock — lighter touch than the
 * theme lock since Collection already has a 6-state lifecycle).
 *
 * Auth: PLATFORM_ADMIN only.
 * CSRF: X-CSRF-Token header.
 *
 * Companion file: collection-unlock-route.ts → /api/platform/collections/[id]/unlock/route.ts
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

async function lockHandler(
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
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: user!.id,
        },
        select: COLLECTION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'COLLECTION_LOCKED',
          details:
            `Locked collection ${existing.slug}` +
            (reason ? ` — reason: ${reason}` : '') +
            (existing.isLocked ? ' (was already locked)' : ''),
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
    logger.error('Lock collection error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(30, 60_000)(lockHandler);
