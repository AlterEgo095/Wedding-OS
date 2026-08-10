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
 * POST /api/platform/themes/[id]/unlock
 *
 * Remove the commercial lock on a PlatformTheme. After unlock:
 *   - PUT / DELETE work again normally
 *   - lockedAt + lockedBy are cleared back to null
 *
 * Body (all optional):
 *   { reason?: string } — optional rationale written to the audit log.
 *
 * MISSION 5.9.2 P3-A — Tasks 1+2+3.
 *
 * Auth: PLATFORM_ADMIN only.
 * CSRF: X-CSRF-Token header.
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
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  tier: true,
  category: true,
  version: true,
  identity: true,
  configJson: true,
  // P3-A — lock + audit fields
  isLocked: true,
  lockedAt: true,
  lockedBy: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
} as const;

const unlockBodySchema = z.object({
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
    const parsed = unlockBodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const reason = parsed.data.reason?.trim() || '';

    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: { id: true, slug: true, isLocked: true },
    });
    if (!existing) return notFound('Thème introuvable');

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.update({
        where: { id },
        data: {
          isLocked: false,
          lockedAt: null,
          lockedBy: null,
        },
        select: THEME_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'THEME_UNLOCKED',
          details:
            `Unlocked theme ${existing.slug}` +
            (reason ? ` — reason: ${reason}` : '') +
            (!existing.isLocked ? ' (was already unlocked)' : ''),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          targetResourceId: existing.id,
          targetType: 'THEME',
          result: 'SUCCESS',
        },
      });
      return theme;
    });

    return NextResponse.json({ theme: updated });
  } catch (error) {
    logger.error('Unlock theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(30, 60_000)(unlockHandler);
