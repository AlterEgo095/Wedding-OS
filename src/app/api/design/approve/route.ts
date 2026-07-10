// POST /api/design/approve — Mission 5.7.2 Phase 6
// Approve a master for production (VALIDATION → PUBLIE transition).
// Auth: PLATFORM_ADMIN only.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { approveMaster } from '@/lib/design/master-lifecycle';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { collectionId } = body as { collectionId?: string };
    if (!collectionId) return badRequest('collectionId requis');

    const result = await approveMaster(collectionId, user!.id, request);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('Approve error', { errMessage: error instanceof Error ? error.message : String(error) });
    return internalError(error instanceof Error ? error.message : undefined);
  }
}
