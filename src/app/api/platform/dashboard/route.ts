export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { PLAN_METADATA, type Plan } from '@/lib/types';
import { logger } from '@/lib/logger'; // P2-SEC-1
import { internalError } from '@/lib/api-errors'; // P2-CQ-5

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
    // P2-PERF-6: replaced the full-table scan `publishedWeddingsForMrr`
    // (findMany of every PUBLISHED wedding's createdAt+plan, reduced in JS)
    // with a single `groupBy` that returns per-plan counts. MRR is then
    // sum(plan_count * plan_price). The 6-month mrrSeries still needs
    // per-wedding createdAt, so it gets its own scoped findMany (6-mo window
    // only) — much cheaper than fetching all PUBLISHED weddings.
    const sixMonthsAgo = sixMonthsAgoStart; // alias for the scoped fetch

    const [weddingsTotal, weddingsByStatus, weddingsByPlan, usersTotal, platformAdminCount, usersByRole, guestsTotal, guestsLast7Days, recentWeddings, recentActivity, // ── Phase 5-a: revenue / churn / growth inputs ──
      // P2-PERF-6: groupBy replaces the full-array findMany for current MRR.
      publishedWeddingsByPlanForMrr, // P2-PERF-6: scoped 6-month findMany for the mrrSeries only.
      publishedWeddingsLast6Mo, weddingsCreatedSince6Mo, suspended30d, archived30d, newWeddings30d, newGuests30d, pendingLeadsCount, recentLeads, pendingPaymentsCount, recentPendingPayments, draftWeddingsCount, recentDrafts] = await Promise.all([
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

      // ── P2-PERF-6: Revenue — per-plan counts of currently-PUBLISHED weddings.
      // Single groupBy query; MRR = sum(plan_count * plan_price).
      db.wedding.groupBy({
        by: ['plan'],
        where: { status: 'PUBLISHED' },
        _count: { _all: true },
      }),

      // ── P2-PERF-6: 6-month scoped findMany for the mrrSeries only.
      // Replaces the full-table findMany that was being reduced twice.
      db.wedding.findMany({
        where: {
          status: 'PUBLISHED',
          createdAt: { gte: sixMonthsAgo },
        },
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

      // Mission 5.5: pending actions for the unified Actions Requises view
      db.lead.count({
        where: { status: { in: ['NEW', 'CONTACTED'] } },
      }),
      db.lead.findMany({
        where: { status: { in: ['NEW', 'CONTACTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, brideName: true, groomName: true, coupleLabel: true, email: true, phone: true, plan: true, status: true, createdAt: true },
      }),
      db.payment.count({
        where: { status: 'AWAITING_VERIFICATION' },
      }),
      db.payment.findMany({
        where: { status: 'AWAITING_VERIFICATION' },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        include: {
          order: {
            select: {
              wedding: { select: { id: true, slug: true, coupleLabel: true } },
              customer: { select: { displayName: true } },
            },
          },
        },
      }),
      db.wedding.count({
        where: { status: 'DRAFT', isDefault: false },
      }),
      db.wedding.findMany({
        where: { status: 'DRAFT', isDefault: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, slug: true, coupleLabel: true, plan: true, commercialStatus: true, createdAt: true },
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
    // P2-PERF-6: MRR is now computed from the per-plan groupBy result
    // (single query) rather than reducing a findMany of every PUBLISHED wedding.
    const planPriceOf = (plan: string): number =>
      PLAN_METADATA[plan as Plan]?.priceUsd ?? 0;

    const planCounts: Record<string, number> = {};
    let mrr = 0;
    let activeCount = 0;
    for (const row of publishedWeddingsByPlanForMrr) {
      const count = row._count._all;
      planCounts[row.plan] = count;
      mrr += count * planPriceOf(row.plan);
      activeCount += count;
    }
    const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

    // Per-plan breakdown (only plans with count > 0, ordered by tier desc).
    const revenueByPlan = PLAN_TIER_ORDER
      .filter((p) => (planCounts[p] || 0) > 0)
      .map((p) => ({
        plan: p,
        count: planCounts[p],
        mrr: planCounts[p] * PLAN_METADATA[p].priceUsd,
      }));

    // 6-month MRR series — for each month, sum current plan price of all
    // PUBLISHED weddings created on or before end-of-month.
    // P2-PERF-6: uses the scoped 6-month findMany (not the full-table fetch).
    // Note: weddings created > 6 months ago contribute to every month's MRR.
    // We approximate by also fetching the count of PUBLISHED weddings older
    // than 6 months, per plan, from the groupBy above (those weddings are
    // included in `planCounts` but NOT in `publishedWeddingsLast6Mo`).
    //
    // For correctness: the mrrSeries for month M should include:
    //   - all weddings created <= M.monthEnd (whether in 6-mo window or older)
    //
    // Since publishedWeddingsLast6Mo only contains weddings in the 6-mo
    // window, we need the older ones too. We compute the older-plan-counts
    // by subtracting the in-window per-plan counts from the global per-plan
    // counts (planCounts). This is exact for the current snapshot.
    const inWindowPlanCounts: Record<string, number> = {};
    for (const w of publishedWeddingsLast6Mo) {
      inWindowPlanCounts[w.plan] = (inWindowPlanCounts[w.plan] || 0) + 1;
    }
    const olderThanWindowPlanCounts: Record<string, number> = {};
    for (const p of Object.keys(planCounts)) {
      olderThanWindowPlanCounts[p] =
        (planCounts[p] || 0) - (inWindowPlanCounts[p] || 0);
    }

    const mrrSeries = monthSeries.map((m) => {
      // For month M, include older-than-window weddings (always count) +
      // in-window weddings whose createdAt <= M.monthEnd.
      const inWindowMatching = publishedWeddingsLast6Mo.filter(
        (w) => w.createdAt <= m.monthEnd,
      );
      const inWindowMrr = inWindowMatching.reduce(
        (sum, w) => sum + planPriceOf(w.plan),
        0,
      );
      const olderMrr = Object.entries(olderThanWindowPlanCounts).reduce(
        (sum, [p, c]) => sum + c * planPriceOf(p),
        0,
      );
      const monthMrr = inWindowMrr + olderMrr;
      return {
        month: m.monthKey,
        label: m.label,
        mrr: monthMrr,
        weddings: inWindowMatching.length + activeCount - publishedWeddingsLast6Mo.length,
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

      // Mission 5.5: unified pending actions view
      pendingActions: {
        newLeadsCount: pendingLeadsCount,
        recentLeads: recentLeads,
        pendingPaymentsCount: pendingPaymentsCount,
        recentPendingPayments: recentPendingPayments,
        draftWeddingsCount: draftWeddingsCount,
        recentDrafts: recentDrafts,
      },
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Platform dashboard error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
