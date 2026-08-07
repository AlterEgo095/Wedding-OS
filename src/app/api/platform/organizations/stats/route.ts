export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';

/**
 * Mission 6.0 P1.6 — Aggregate organization stats.
 *
 * GET /api/platform/organizations/stats
 *   → { total, byStatus, byPlan, members: { total, active, pending, revoked },
 *       weddings: { total, byStatus }, recentOrganizations, growth }
 *
 * Platform-admin only. Used by the P1.7 OrganizationsTab dashboard.
 *
 * All queries run in parallel via Promise.all — this is the same pattern as
 * the platform dashboard route. Each query is a single Prisma call (count
 * or groupBy) so the total DB roundtrips = number of fields.
 */

const STATUS_VALUES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
const PLAN_VALUES = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'] as const;
const MEMBER_STATUS_VALUES = ['PENDING', 'ACTIVE', 'REVOKED'] as const;

// Initialize all status/plan keys to 0 so the UI always gets a complete
// record even when the DB has zero rows (avoids the "undefined" gap problem
// when the chart tries to render a missing key).
function zeroRecord(keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = 0;
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } }
      );
    }

    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      byStatusRows,
      byPlanRows,
      membersTotal,
      membersByStatusRows,
      weddingsTotalUnderOrgs,
      weddingsByStatusRows,
      recentOrganizations,
      newOrgs30d,
      newMembers30d,
    ] = await Promise.all([
      // Total organizations (including ARCHIVED — they're still rows).
      db.organization.count(),

      // Organizations by status.
      db.organization.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      // Organizations by plan.
      db.organization.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),

      // Total OrganizationMember rows (all statuses).
      db.organizationMember.count(),

      // Members by status.
      db.organizationMember.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      // Total weddings under any organization (organizationId NOT NULL).
      db.wedding.count({ where: { NOT: { organizationId: null } } }),

      // Weddings under orgs, by status.
      db.wedding.groupBy({
        by: ['status'],
        where: { NOT: { organizationId: null } },
        _count: { status: true },
      }),

      // 5 most recent organizations.
      db.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          plan: true,
          createdAt: true,
        },
      }),

      // New organizations in last 30 days.
      db.organization.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),

      // New members in last 30 days (joinedAt, not invitedAt — measures
      // actually-accepted invites).
      db.organizationMember.count({
        where: { joinedAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    // ─── Format grouped results into Record<string, number> ────────────────
    const byStatus: Record<string, number> = zeroRecord(STATUS_VALUES);
    for (const row of byStatusRows) {
      byStatus[row.status] = row._count.status;
    }

    const byPlan: Record<string, number> = zeroRecord(PLAN_VALUES);
    for (const row of byPlanRows) {
      byPlan[row.plan] = row._count.plan;
    }

    const membersByStatus: Record<string, number> = zeroRecord(MEMBER_STATUS_VALUES);
    for (const row of membersByStatusRows) {
      membersByStatus[row.status] = row._count.status;
    }

    const weddingsByStatus: Record<string, number> = {};
    for (const row of weddingsByStatusRows) {
      weddingsByStatus[row.status] = row._count.status;
    }

    return NextResponse.json({
      total,
      byStatus,
      byPlan,
      members: {
        total: membersTotal,
        byStatus: membersByStatus,
      },
      weddings: {
        total: weddingsTotalUnderOrgs,
        byStatus: weddingsByStatus,
      },
      recentOrganizations,
      growth: {
        newOrganizations30d: newOrgs30d,
        newMembers30d: newMembers30d,
      },
    });
  } catch (error) {
    logger.error('Platform organizations stats error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
