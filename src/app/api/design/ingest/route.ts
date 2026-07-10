// POST /api/design/ingest — Mission 5.7.2 Phase 2
// Ingests the golden fixture into a Collection through the real ingestion pipeline.
// Auth: PLATFORM_ADMIN only.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { ingestFixtureIntoCollection } from '@/lib/design/master-lifecycle';

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

    const result = await ingestFixtureIntoCollection(collectionId, user!.id, request);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('Ingest error', { errMessage: error instanceof Error ? error.message : String(error) });
    return internalError(error instanceof Error ? error.message : undefined);
  }
}
