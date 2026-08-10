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
 * POST /api/platform/themes/[id]/lock
 *
 * Commercial-lock a PlatformTheme. Once locked:
 *   - PUT /api/platform/themes/[id] returns 423 Locked (Task 2 enforcement)
 *   - DELETE /api/platform/themes/[id] returns 423 Locked
 *   - The theme can still be APPLIED to weddings (lock is commercial freeze,
 *     not unpublish — the theme stays visible in the catalog).
 *
 * Body (all optional):
 *   { reason?: string } — optional rationale written to the audit log.
 *
 * MISSION 5.9.2 P3-A — Tasks 1+2+3.
 *
 * Auth: PLATFORM_ADMIN only.
 * CSRF: X-CSRF-Token header (validated by the auth middleware — all
 *       /api/platform/* mutations require it).
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

const lockBodySchema = z.object({
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
    const parsed = lockBodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const reason = parsed.data.reason?.trim() || '';

    // Fetch existing to confirm existence + capture pre-state for audit.
    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: { id: true, slug: true, isLocked: true },
    });
    if (!existing) return notFound('Thème introuvable');

    // Idempotent: if already locked, no-op (still write audit log so the
    // re-lock attempt is recorded — useful for security review).
    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.update({
        where: { id },
        data: {
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: user!.id,
        },
        select: THEME_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'THEME_LOCKED',
          details:
            `Locked theme ${existing.slug}` +
            (reason ? ` — reason: ${reason}` : '') +
            (existing.isLocked ? ' (was already locked)' : ''),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          // P5.2 enrichment fields
          targetResourceId: existing.id,
          targetType: 'THEME',
          result: 'SUCCESS',
        },
      });
      return theme;
    });

    return NextResponse.json({ theme: updated });
  } catch (error) {
    logger.error('Lock theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(30, 60_000)(lockHandler);
