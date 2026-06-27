export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { PLAN_METADATA, type Plan } from '@/lib/types';

/**
 * Platform-wide dashboard stats.
 *
 * Aggregates cross-tenant metrics for the super-admin dashboard:
 *   - weddings: total, by status, by plan
 *   - users:    total, by role, # platform admins
 *   - guests:   total, last-7-day growth
 *   - recentWeddings: 5 newest tenants
 *   - recentActivity: 20 latest audit log entries (platform-wide)
 *   - revenue:  MRR, ARPU, byPlan breakdown, 6-month MRR series
 *   - churn:    suspended/archived last 30d + churn rate
 *   - growth:   new weddings/guests last 30d + 6-month weddings series
 *
 * All queries use the RAW `db` (not `tenantDb`) because platform admins
 * need cross-tenant aggregates — the tenant-scoped extension would
 * incorrectly filter results.
 */

// ─── Plan tier ordering (highest first) for byPlan breakdown ───────────
const PLAN_TIER_ORDER: Plan[] = ['ELITE', 'PREMIUM', 'ESSENTIEL', 'TRIAL'];

/**
 * Build the last 6 calendar months (including the current partial month),
 * oldest first. Each entry exposes the month's start/end Date boundaries,
 * a 'YYYY-MM' key, and a French short-month label (e.g. "janv.").
 */
function getMonthSeries(): Array<{
  monthStart: Date;
  monthEnd: Date;
  monthKey: string; // 'YYYY-MM'
  label: string;    // fr-FR short month, e.g. "janv."
}> {
  const now = new Date();
  const series: Array<{
    monthStart: Date;
    monthEnd: Date;
    monthKey: string;
    label: string;
  }> = [];

  for (let i = 5; i >= 0; i--) {
    // First day of the target month, local time.
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth(); // 0-11

    // Start = first day 00:00:00.000; End = day 0 of next month = last day 23:59:59.999
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    // Use fr-FR short-month output directly (e.g. "janv.", "févr.", "déc.").
    const label = monthDate.toLocaleDateString('fr-FR', { month: 'short' });

    series.push({ monthStart, monthEnd, monthKey, label });
  }

  return series;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Pre-compute the 6-month series boundaries once — reused by both
    // the MRR series (revenue.mrrSeries) and the growth series
    // (growth.newWeddingsSeries).
    const monthSeries = getMonthSeries();
    // Start of the oldest month in the series — used to scope the
    // "weddings created in last 6 months" fetch.
    const sixMonthsAgoStart = monthSeries[0].monthStart;

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
      // ── Phase 5-a: revenue / churn / growth inputs ──
      publishedWeddingsForMrr,
      weddingsCreatedSince6Mo,
      suspended30d,
      archived30d,
      newWeddings30d,
      newGuests30d,
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

      // ── Revenue: every PUBLISHED wedding's createdAt + plan ──
      // Used for: mrr, arpu, byPlan, mrrSeries (single fetch, bucketed in JS).
      db.wedding.findMany({
        where: { status: 'PUBLISHED' },
        select: { createdAt: true, plan: true },
      }),

      // ── Growth: weddings created in the last 6 months ──
      // Used for: newWeddingsSeries (single fetch, bucketed in JS).
      db.wedding.findMany({
        where: { createdAt: { gte: sixMonthsAgoStart } },
        select: { createdAt: true },
      }),

      // ── Churn counts (last 30 days, by updatedAt) ──
      db.wedding.count({
        where: { status: 'SUSPENDED', updatedAt: { gte: thirtyDaysAgo } },
      }),

      db.wedding.count({
        where: { status: 'ARCHIVED', updatedAt: { gte: thirtyDaysAgo } },
      }),

      // ── Growth 30-day counts ──
      db.wedding.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),

      db.guest.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
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

    // ─── Revenue analytics (MRR, ARPU, byPlan, 6-month MRR series) ────────
    // Active weddings = status='PUBLISHED'. MRR = sum of current plan price.
    // NOTE: this is a point-in-time snapshot — we don't track historical plan
    // changes, so mrrSeries uses an approximation (count currently-PUBLISHED
    // weddings whose createdAt <= end of each month, sum their current price).
    const planPriceOf = (plan: string): number =>
      PLAN_METADATA[plan as Plan]?.priceUsd ?? 0;

    const mrr = publishedWeddingsForMrr.reduce(
      (sum, w) => sum + planPriceOf(w.plan),
      0,
    );
    const activeCount = publishedWeddingsForMrr.length;
    const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

    // Per-plan breakdown (only plans with count > 0, ordered by tier desc).
    const planCounts: Record<string, number> = {};
    for (const w of publishedWeddingsForMrr) {
      planCounts[w.plan] = (planCounts[w.plan] || 0) + 1;
    }
    const revenueByPlan = PLAN_TIER_ORDER
      .filter((p) => (planCounts[p] || 0) > 0)
      .map((p) => ({
        plan: p,
        count: planCounts[p],
        mrr: planCounts[p] * PLAN_METADATA[p].priceUsd,
      }));

    // 6-month MRR series — for each month, sum current plan price of all
    // PUBLISHED weddings created on or before end-of-month.
    const mrrSeries = monthSeries.map((m) => {
      const matching = publishedWeddingsForMrr.filter(
        (w) => w.createdAt <= m.monthEnd,
      );
      const monthMrr = matching.reduce(
        (sum, w) => sum + planPriceOf(w.plan),
        0,
      );
      return {
        month: m.monthKey,
        label: m.label,
        mrr: monthMrr,
        weddings: matching.length,
      };
    });

    // ─── Churn metrics (last 30 days, % of total weddings) ────────────────
    const churnRate = weddingsTotal > 0
      ? Math.round(((suspended30d + archived30d) / weddingsTotal) * 100 * 10) / 10
      : 0;

    // ─── Growth trends (30-day counts + 6-month weddings series) ──────────
    const newWeddingsSeries = monthSeries.map((m) => {
      const count = weddingsCreatedSince6Mo.filter(
        (w) => w.createdAt >= m.monthStart && w.createdAt <= m.monthEnd,
      ).length;
      return {
        month: m.monthKey,
        label: m.label,
        count,
      };
    });

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

      // ── Phase 5-a additions ──
      revenue: {
        mrr,
        arpu,
        byPlan: revenueByPlan,
        mrrSeries,
      },
      churn: {
        suspended30d,
        archived30d,
        churnRate,
      },
      growth: {
        newWeddings30d,
        newGuests30d,
        newWeddingsSeries,
      },
    });
  } catch (error) {
    console.error('Platform dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
