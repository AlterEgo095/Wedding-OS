export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { logger } from '@/lib/logger'; // P2-SEC-1
import { internalError } from '@/lib/api-errors'; // P2-CQ-5

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['CONTROLLER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      // P2-PERF-7: collapsed 9 sequential queries (3 Promise.all groups)
      // into 1 Promise.all of 9 queries. The AuditLog findMany was outside
      // the original Promise.all because it uses `db` (not `tenantDb`); both
      // can run in parallel since they don't share state.
      const [
        totalGuests, confirmedGuests, pendingGuests, declinedGuests, checkedInGuests,
        totalTables, tables,
        // P2-PERF-7: moved INTO the Promise.all (were sequential after it).
        recentActivity,
        categoryStats,
      ] = await Promise.all([
        tenantDb.guest.count(),
        tenantDb.guest.count({ where: { status: 'CONFIRMED' } }),
        tenantDb.guest.count({ where: { status: 'PENDING' } }),
        tenantDb.guest.count({ where: { status: 'DECLINED' } }),
        tenantDb.guest.count({ where: { checkedIn: true } }),
        tenantDb.table.count(),
        tenantDb.table.findMany({ include: { _count: { select: { guests: true } } } }),
        // AuditLog is not in TENANT_SCOPED_MODELS (allows null weddingId for
        // platform events) — filter explicitly by weddingId for the dashboard.
        db.auditLog.findMany({
          where: { weddingId: context.weddingId },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, email: true } } },
        }),
        tenantDb.guest.groupBy({
          by: ['category'],
          _count: { category: true },
        }),
      ]);

      const totalSeats = tables.reduce((sum, t) => sum + t.capacity, 0);
      const occupiedSeats = tables.reduce((sum, t) => sum + t._count.guests, 0);

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
    // P2-SEC-1: never log error.stack.
    logger.error('Dashboard error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
