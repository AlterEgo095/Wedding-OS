export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb, db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';

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
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action');
      const guestId = searchParams.get('guestId');
      const limit = parseInt(searchParams.get('limit') || '100');
      const offset = parseInt(searchParams.get('offset') || '0');

      const where: Record<string, unknown> = {};
      if (action) where.action = action;
      if (guestId) where.guestId = guestId;
      // weddingId auto-injected by extension

      const [logs, total] = await Promise.all([
        tenantDb.guestAccessLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit, skip: offset,
          include: {
            guest: {
              select: {
                id: true, firstName: true, lastName: true, invitationCode: true,
                category: true, status: true, checkedIn: true,
              },
            },
          },
        }),
        tenantDb.guestAccessLog.count({ where }),
      ]);

      const [
        totalLogins, totalAccessDenied, totalAuthFailed, totalBruteForce,
        totalFingerprintMismatches, totalLinkVisits, totalQRScans,
        totalSearches, totalSearchBlocked, viewedInvitations,
        totalGuests, confirmedGuests, checkedInGuests, activeSessions,
      ] = await Promise.all([
        tenantDb.guestAccessLog.count({ where: { action: 'LOGIN' } }),
        tenantDb.guestAccessLog.count({ where: { action: 'ACCESS_DENIED' } }),
        tenantDb.guestAccessLog.count({ where: { action: 'AUTH_FAILED' } }),
        tenantDb.guestAccessLog.count({ where: { action: { in: ['BRUTE_FORCE_BLOCKED', 'AUTH_RATE_LIMITED'] } } }),
        tenantDb.guestAccessLog.count({ where: { action: 'FINGERPRINT_MISMATCH' } }),
        tenantDb.guestAccessLog.count({ where: { action: 'LINK_VISIT' } }),
        tenantDb.guestAccessLog.count({ where: { action: 'QR_SCAN' } }),
        tenantDb.guestAccessLog.count({ where: { action: 'SEARCH' } }),
        tenantDb.guestAccessLog.count({ where: { action: 'SEARCH_BLOCKED' } }),
        tenantDb.guest.count({ where: { invitationViewed: true } }),
        tenantDb.guest.count(),
        tenantDb.guest.count({ where: { status: 'CONFIRMED' } }),
        tenantDb.guest.count({ where: { checkedIn: true } }),
        tenantDb.guestSession.count({ where: { isActive: true } }),
      ]);

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentAccessDenied = await tenantDb.guestAccessLog.count({
        where: {
          action: { in: ['ACCESS_DENIED', 'AUTH_FAILED', 'BRUTE_FORCE_BLOCKED'] },
          createdAt: { gte: twentyFourHoursAgo },
        },
      });

      const failedAttempts = await tenantDb.guestAccessLog.findMany({
        where: { action: { in: ['AUTH_FAILED', 'ACCESS_DENIED', 'BRUTE_FORCE_BLOCKED'] } },
        select: { ipAddress: true },
      });

      const ipCounts: Record<string, number> = {};
      failedAttempts.forEach(log => {
        if (log.ipAddress && log.ipAddress !== 'unknown') {
          ipCounts[log.ipAddress] = (ipCounts[log.ipAddress] || 0) + 1;
        }
      });

      const suspiciousIPs = Object.entries(ipCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }));

      // P3: cast groupBy to the base Prisma callable (extension makes it a union).
      const categoryBreakdown = await (tenantDb.guest.groupBy as typeof db.guest.groupBy)({
        by: ['category'],
        _count: { id: true },
      });

      return NextResponse.json({
        logs, total,
        stats: {
          totalLogins, totalAccessDenied, totalAuthFailed, totalBruteForce,
          totalFingerprintMismatches, totalLinkVisits, totalQRScans,
          totalSearches, totalSearchBlocked, viewedInvitations,
          totalGuests, confirmedGuests, checkedInGuests, activeSessions,
          viewRate: totalGuests > 0 ? Math.round((viewedInvitations / totalGuests) * 100) : 0,
          confirmationRate: totalGuests > 0 ? Math.round((confirmedGuests / totalGuests) * 100) : 0,
          checkInRate: totalGuests > 0 ? Math.round((checkedInGuests / totalGuests) * 100) : 0,
          recentAccessDenied, suspiciousIPs,
          categoryBreakdown: categoryBreakdown.map(c => ({ category: c.category, count: c._count.id })),
        },
      });
    });
  } catch (error) {
    console.error('Access logs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
