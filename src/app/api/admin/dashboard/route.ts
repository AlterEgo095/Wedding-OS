export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const [
        totalGuests, confirmedGuests, pendingGuests, declinedGuests, checkedInGuests,
        totalTables, tables,
      ] = await Promise.all([
        tenantDb.guest.count(),
        tenantDb.guest.count({ where: { status: 'CONFIRMED' } }),
        tenantDb.guest.count({ where: { status: 'PENDING' } }),
        tenantDb.guest.count({ where: { status: 'DECLINED' } }),
        tenantDb.guest.count({ where: { checkedIn: true } }),
        tenantDb.table.count(),
        tenantDb.table.findMany({ include: { _count: { select: { guests: true } } } }),
      ]);

      const totalSeats = tables.reduce((sum, t) => sum + t.capacity, 0);
      const occupiedSeats = tables.reduce((sum, t) => sum + t._count.guests, 0);

      // AuditLog is not in TENANT_SCOPED_MODELS (allows null weddingId for platform events)
      // — filter explicitly by weddingId for the dashboard
      const recentActivity = await db.auditLog.findMany({
        where: { weddingId: context.weddingId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      });

      const categoryStats = await tenantDb.guest.groupBy({
        by: ['category'],
        _count: { category: true },
      });

      const categoryStatsFormatted = categoryStats.map((c) => ({
        category: c.category,
        count: c._count.category,
      }));

      return NextResponse.json({
        totalGuests, totalTables,
        confirmedGuests, pendingGuests, declinedGuests, checkedInGuests,
        totalSeats, occupiedSeats,
        recentActivity,
        categoryStats: categoryStatsFormatted,
        wedding: {
          slug: context.slug,
          isDefault: context.isDefault,
          status: context.status,
          plan: context.plan,
        },
      });
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
