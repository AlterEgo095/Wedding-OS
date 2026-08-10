export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';
import {
  createThemeSnapshot,
  listThemeSnapshots,
} from '@/lib/themes/snapshots';

/**
 * MISSION 5.9.2 P1 — PlatformTheme snapshot endpoints.
 *
 * POST /api/platform/themes/[id]/snapshot
 *   Creates an immutable snapshot of the PlatformTheme's current state.
 *   Body (optional): { triggeredBy?: string }
 *   Returns: { snapshot: ThemeSnapshotResult }
 *
 * GET /api/platform/themes/[id]/snapshot
 *   Lists all snapshots for the PlatformTheme (newest first).
 *   Returns: { snapshots: ThemeSnapshotResult[] }
 */

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) return notFound('Thème introuvable');

    const body = await request.json().catch(() => ({}));
    const triggeredBy =
      typeof body?.triggeredBy === 'string' ? body.triggeredBy : user?.id ?? null;

    const snapshot = await createThemeSnapshot(id, triggeredBy);

    const client = getClientInfo(request);
    await db.auditLog.create({
      data: {
        weddingId: null,
        userId: user!.id,
        action: 'CREATE_THEME_SNAPSHOT',
        details: `Snapshot ${snapshot.id} (theme=${existing.slug} v${snapshot.version}) created`,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      },
    });

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    logger.error('Create theme snapshot error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return notFound('Thème introuvable');

    const snapshots = await listThemeSnapshots(id);
    return NextResponse.json({ snapshots });
  } catch (error) {
    logger.error('List theme snapshots error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(20, 60_000)(postHandler);
export const GET = getHandler;
