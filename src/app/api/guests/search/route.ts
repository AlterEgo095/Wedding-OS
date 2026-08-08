export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { logger } from '@/lib/logger';

// Admin-only guest search — tenant-scoped
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Accès non autorisé. Utilisez votre code d\'invitation pour accéder à votre espace personnel.' },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, ['CONTROLLER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const { searchParams } = new URL(request.url);
      const q = searchParams.get('q');

      if (!q || q.trim().length < 2) {
        return NextResponse.json(
          { error: 'Search query must be at least 2 characters' },
          { status: 400 }
        );
      }

      const searchTerm = q.trim();

      const guests = await tenantDb.guest.findMany({
        where: {
          OR: [
            { firstName: { contains: searchTerm } },
            { lastName: { contains: searchTerm } },
            { displayName: { contains: searchTerm } },
            { invitationCode: { contains: searchTerm } },
          ],
        },
        select: {
          id: true, firstName: true, lastName: true, displayName: true,
          invitationType: true, invitationCode: true,
          phone: true, email: true, seats: true, category: true, status: true,
          personalMessage: true, checkedIn: true,
          invitationViewed: true, invitationViewCount: true, lastAccessAt: true,
          table: { select: { id: true, name: true, number: true } },
        },
        take: 50,
      });

      return NextResponse.json({ guests });
    });
  } catch (error) {
    logger.error('Guest search error', { err: error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
