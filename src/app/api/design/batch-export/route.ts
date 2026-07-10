// POST /api/design/batch-export — Mission 5.7.2 Phase 9
// Batch export invitations for multiple guests from the same master.
// Auth: PLATFORM_ADMIN only.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { reloadDesignFromDb } from '@/lib/design/master-lifecycle';
import { batchExportInvitations } from '@/lib/design/export-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { collectionId, weddingId, guestIds, formats } = body as {
      collectionId?: string;
      weddingId?: string;
      guestIds?: string[];
      formats?: string[];
    };

    if (!collectionId) return badRequest('collectionId requis');
    if (!weddingId) return badRequest('weddingId requis');
    if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
      return badRequest('guestIds (array non-vide) requis');
    }
    if (guestIds.length > 10) {
      return badRequest('Maximum 10 invités par batch (small batch proof)');
    }

    const pkg = await reloadDesignFromDb(collectionId);
    if (!pkg) {
      return badRequest('Aucun design ingéré pour cette collection');
    }

    const fmts = (formats || ['PNG', 'PDF']).filter((f) => f === 'PNG' || f === 'PDF') as ('PNG' | 'PDF')[];
    const result = await batchExportInvitations(pkg, {
      weddingId,
      collectionId,
      guestIds,
      formats: fmts,
      userId: user!.id,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('Batch export error', { errMessage: error instanceof Error ? error.message : String(error) });
    return internalError(error instanceof Error ? error.message : undefined);
  }
}
