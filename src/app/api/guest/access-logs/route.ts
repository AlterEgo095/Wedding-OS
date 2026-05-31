export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const guestId = searchParams.get('guestId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (guestId) where.guestId = guestId;

    const [logs, total] = await Promise.all([
      db.guestAccessLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              invitationCode: true,
              category: true,
              status: true,
              checkedIn: true,
            },
          },
        },
      }),
      db.guestAccessLog.count({ where }),
    ]);

    // Get comprehensive summary stats
    const [
      totalLogins,
      totalAccessDenied,
      totalAuthFailed,
      totalBruteForce,
      totalFingerprintMismatches,
      totalLinkVisits,
      totalQRScans,
      viewedInvitations,
      totalGuests,
      confirmedGuests,
      checkedInGuests,
      activeSessions,
    ] = await Promise.all([
      db.guestAccessLog.count({ where: { action: 'LOGIN' } }),
      db.guestAccessLog.count({ where: { action: 'ACCESS_DENIED' } }),
      db.guestAccessLog.count({ where: { action: 'AUTH_FAILED' } }),
      db.guestAccessLog.count({ where: { action: { in: ['BRUTE_FORCE_BLOCKED', 'AUTH_RATE_LIMITED'] } } }),
      db.guestAccessLog.count({ where: { action: 'FINGERPRINT_MISMATCH' } }),
      db.guestAccessLog.count({ where: { action: 'LINK_VISIT' } }),
      db.guestAccessLog.count({ where: { action: 'QR_SCAN' } }),
      db.guest.count({ where: { invitationViewed: true } }),
      db.guest.count(),
      db.guest.count({ where: { status: 'CONFIRMED' } }),
      db.guest.count({ where: { checkedIn: true } }),
      db.guestSession.count({ where: { isActive: true } }),
    ]);

    // Get recent access denied attempts (last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAccessDenied = await db.guestAccessLog.count({
      where: {
        action: { in: ['ACCESS_DENIED', 'AUTH_FAILED', 'BRUTE_FORCE_BLOCKED'] },
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    // Get top IPs with failed attempts
    const failedAttempts = await db.guestAccessLog.findMany({
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

    // Get category breakdown
    const categoryBreakdown = await db.guest.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    return NextResponse.json({
      logs,
      total,
      stats: {
        totalLogins,
        totalAccessDenied,
        totalAuthFailed,
        totalBruteForce,
        totalFingerprintMismatches,
        totalLinkVisits,
        totalQRScans,
        viewedInvitations,
        totalGuests,
        confirmedGuests,
        checkedInGuests,
        activeSessions,
        viewRate: totalGuests > 0 ? Math.round((viewedInvitations / totalGuests) * 100) : 0,
        confirmationRate: totalGuests > 0 ? Math.round((confirmedGuests / totalGuests) * 100) : 0,
        checkInRate: totalGuests > 0 ? Math.round((checkedInGuests / totalGuests) * 100) : 0,
        recentAccessDenied,
        suspiciousIPs,
        categoryBreakdown: categoryBreakdown.map(c => ({
          category: c.category,
          count: c._count.id,
        })),
      },
    });
  } catch (error) {
    console.error('Access logs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
