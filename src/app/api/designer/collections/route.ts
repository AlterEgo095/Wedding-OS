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
      return NextResponse.json({ collections, count: collections.length });
    });
  } catch (error) {
    console.error('Designer collections list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
