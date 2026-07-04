export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { SECURITY_AUDIT_ACTIONS } from '@/lib/audit';

/**
 * Platform ops dashboard data endpoint (P6-4).
 *
 * Returns ops-specific aggregations NOT exposed by /api/health (production
 * health) or /api/platform/dashboard (business KPIs):
 *   - securityEvents.last24h / last7d   — count of AuditLog rows whose action
 *                                         is in SECURITY_AUDIT_ACTIONS, scoped
 *                                         to the last 24h / 7d windows.
 *   - securityEvents.byAction           — per-action-code breakdown for the
 *                                         last 24h (small histogram of which
 *                                         security event types are firing).
 *   - recentSecurityLogs                — 50 most recent security-event rows
 *                                         with user + wedding relations for
 *                                         the ops table.
 *   - auditLogTotal                     — total AuditLog row count (a quick
 *                                         "is the audit trail growing?" signal).
 *   - dbFileSizeBytes                   — SQLite DB file size in bytes, via
 *                                         `pragma_page_count * pragma_page_size`.
 *
 * All queries use the RAW `db` (not `tenantDb`) — this is a cross-tenant
 * platform-admin endpoint, intentionally NOT scoped to a single wedding.
 *
 * SQLite-only assumption: the `pragma_page_count` / `pragma_page_size`
 * pragmas are SQLite-specific. If the DB is ever migrated to Postgres, the
 * dbFileSizeBytes computation will need to be replaced (e.g. with
 * `pg_database_size(current_database())`).
 *
 * Auth: requirePlatformAdmin — admits both PLATFORM_ADMIN and SUPER_ADMIN
 * (the existing helper uses hasPermission which treats both as level 4).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    // ─── Time windows ───────────────────────────────────────────────────────
    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // ─── Parallel queries ───────────────────────────────────────────────────
    // P2-PERF-6: batch independent queries in a single Promise.all so the
    // total latency is the slowest query, not the sum.
    const [
      securityLast24h,
      securityLast7d,
      recentSecurityLogs,
      auditLogTotal,
      dbSizeRows,
    ] = await Promise.all([
      db.auditLog.count({
        where: {
          action: { in: [...SECURITY_AUDIT_ACTIONS] },
          createdAt: { gte: last24h },
        },
      }),

      db.auditLog.count({
        where: {
          action: { in: [...SECURITY_AUDIT_ACTIONS] },
          createdAt: { gte: last7d },
        },
      }),

      db.auditLog.findMany({
        where: {
          action: { in: [...SECURITY_AUDIT_ACTIONS] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: {
            select: { email: true, role: true },
          },
          wedding: {
            select: { slug: true, brideName: true, groomName: true },
          },
        },
      }),

      db.auditLog.count(),

      // SQLite DB file size = page_count * page_size. Both pragmas return
      // integers; Prisma surfaces them as bigint (SQLite's native 64-bit type).
      // We convert to Number once on the result — safe here because DB files
      // are well under Number.MAX_SAFE_INTEGER (a 8 PB SQLite file would be
      // needed to overflow, which is not a realistic concern for this app).
      db.$queryRaw<Array<{ size: bigint }>>`
        SELECT page_count * page_size AS size
        FROM pragma_page_count(), pragma_page_size()
      `,
    ]);

    // ─── Build the per-action breakdown for the last 24h ────────────────────
    // We use the already-fetched recentSecurityLogs (capped at 50) for the
    // breakdown — this avoids a second DB round-trip for a `groupBy` and
    // matches what the operator sees in the table below. If the dashboard
    // ever needs the EXACT per-action counts for the full 24h window (not
    // just the 50 most recent), a `db.auditLog.groupBy({ by: ['action'],
    // where: { ... last24h ... } })` can be added to the Promise.all above.
    const byAction: Record<string, number> = {};
    for (const log of recentSecurityLogs) {
      if (log.createdAt >= last24h) {
        byAction[log.action] = (byAction[log.action] || 0) + 1;
      }
    }

    // ─── Convert recentSecurityLogs to the response shape ───────────────────
    // Prisma returns Date objects for createdAt; we serialise to ISO strings
    // so the JSON response is stable across server/client (no Date.toJSON
    // surprises). The user/wedding relations are already included above.
    const recentSecurityLogsResponse = recentSecurityLogs.map((log) => ({
      id: log.id,
      action: log.action,
      details: log.details,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt.toISOString(),
      user: log.user
        ? { email: log.user.email, role: log.user.role }
        : null,
      wedding: log.wedding
        ? {
            slug: log.wedding.slug,
            brideName: log.wedding.brideName,
            groomName: log.wedding.groomName,
          }
        : null,
    }));

    // ─── dbFileSizeBytes: bigint → Number ───────────────────────────────────
    // The raw query returns `[{ size: bigint }]`. We take the first row's
    // size field and convert. SQLite pragmas always return exactly one row,
    // so `dbSizeRows[0]` is safe; the defensive `?? 0` covers the (impossible)
    // empty-result case.
    const dbFileSizeBytes = dbSizeRows[0]?.size != null
      ? Number(dbSizeRows[0].size)
      : 0;

    return NextResponse.json({
      securityEvents: {
        last24h: securityLast24h,
        last7d: securityLast7d,
        byAction,
      },
      recentSecurityLogs: recentSecurityLogsResponse,
      auditLogTotal,
      dbFileSizeBytes,
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Platform ops dashboard error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
