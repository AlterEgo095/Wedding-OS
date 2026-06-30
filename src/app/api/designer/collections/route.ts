export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getAuthUser } from '@/lib/auth';
import { listAllCollectionsForDesigner } from '@/lib/collections';

/**
 * GET /api/designer/collections — list ALL Collections across all lifecycle
 * statuses, for the Designer Portal workspace.
 *
 * Auth: DESIGNER, ART_DIRECTOR, PLATFORM_ADMIN, SUPER_ADMIN only.
 * Couples and wedding-scoped staff (ORGANIZER, RECEPTION, CONTROLLER) cannot
 * see Collections that are not yet COMMERCIALISE — they use the regular
 * /api/collections endpoint instead.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const allowedRoles = ['DESIGNER', 'ART_DIRECTOR', 'PLATFORM_ADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden — accès réservé aux designers et directeurs artistiques' },
        { status: 403 }
      );
    }

    return withAdminTenantHandler(request, user, async () => {
      const collections = await listAllCollectionsForDesigner();
      // Phase 5 — for each Collection, also return qualityScore (cached) + lastFrameSyncAt + penpotFileUrl
      const { db } = await import('@/lib/db');
      const enriched = await Promise.all(
        collections.map(async (c) => {
          const row = await db.collection.findUnique({
            where: { id: c.id },
            select: { qualityScore: true, lastFrameSyncAt: true, penpotFileUrl: true },
          });
          return {
            ...c,
            qualityScore: row?.qualityScore ?? null,
            lastFrameSyncAt: row?.lastFrameSyncAt ? row.lastFrameSyncAt.toISOString() : null,
            penpotFileUrl: row?.penpotFileUrl ?? null,
          };
        })
      );
      return NextResponse.json({ collections: enriched, count: enriched.length });
    });
  } catch (error) {
    console.error('Designer collections list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
