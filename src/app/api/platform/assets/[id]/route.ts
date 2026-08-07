export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * DELETE /api/platform/assets/{id} — remove a platform asset reference.
 * (Does NOT delete the underlying file at `url` — that's the media upload
 * service's responsibility. Only the registry row is removed.)
 */

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const existing = await db.platformAsset.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) return notFound('Asset introuvable');

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.platformAsset.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'DELETE_ASSET',
          details: `Deleted asset ${existing.name}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Delete asset error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const DELETE = withRateLimit(20, 60_000)(deleteHandler);
