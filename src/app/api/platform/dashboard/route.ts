export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';

/**
 * Platform-wide dashboard stats.
 *
 * Aggregates cross-tenant metrics for the super-admin dashboard:
 *   - weddings: total, by status, by plan
 *   - users:    total, by role, # platform admins
 *   - guests:   total, last-7-day growth
 *   - recentWeddings: 5 newest tenants
 *   - recentActivity: 20 latest audit log entries (platform-wide)
 *
 * All queries use the RAW `db` (not `tenantDb`) because platform admins
 * need cross-tenant aggregates — the tenant-scoped extension would
 * incorrectly filter results.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // ─── Parallel aggregation queries ──────────────────────────────────────
    const [
      weddingsTotal,
      weddingsByStatus,
      weddingsByPlan,
      usersTotal,
      platformAdminCount,
      usersByRole,
      guestsTotal,
      guestsLast7Days,
      recentWeddings,
      recentActivity,
    ] = await Promise.all([
      db.wedding.count(),

      db.wedding.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      db.wedding.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),

      db.adminUser.count(),

      db.adminUser.count({
        where: {
          OR: [{ role: 'PLATFORM_ADMIN' }, { role: 'SUPER_ADMIN' }],
        },
      }),

      db.adminUser.groupBy({
        by: ['role'],
        _count: { role: true },
      }),

      db.guest.count(),

      db.guest.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),

      db.wedding.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          slug: true,
          coupleLabel: true,
          status: true,
          plan: true,
          createdAt: true,
        },
      }),

      db.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
    ]);

    // ─── Format grouped results into Record<string, number> ───────────────
    const byStatus: Record<string, number> = {};
    for (const row of weddingsByStatus) {
      byStatus[row.status] = row._count.status;
    }

    const byPlan: Record<string, number> = {};
    for (const row of weddingsByPlan) {
      byPlan[row.plan] = row._count.plan;
    }

    const byRole: Record<string, number> = {};
    for (const row of usersByRole) {
      byRole[row.role] = row._count.role;
    }

    return NextResponse.json({
      weddings: {
        total: weddingsTotal,
        byStatus,
        byPlan,
      },
      users: {
        total: usersTotal,
        byRole,
        platformAdmins: platformAdminCount,
      },
      guests: {
        total: guestsTotal,
        last7days: guestsLast7Days,
      },
      recentWeddings,
      recentActivity,
    });
  } catch (error) {
    console.error('Platform dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
