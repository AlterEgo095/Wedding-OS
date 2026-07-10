// GET /api/design/master-status — Mission 5.7.2 Phase 5
// Returns the current master lifecycle status for a Collection.
// Auth: PLATFORM_ADMIN only.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { getMasterStatus } from '@/lib/design/master-lifecycle';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const collectionId = request.nextUrl.searchParams.get('collectionId');
    if (!collectionId) return badRequest('collectionId requis');

    const status = await getMasterStatus(collectionId);

    return NextResponse.json({ success: true, status });
  } catch (error) {
    return internalError(error instanceof Error ? error.message : undefined);
  }
}
