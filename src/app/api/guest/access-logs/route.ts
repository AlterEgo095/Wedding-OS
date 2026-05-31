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
            },
          },
        },
      }),
      db.guestAccessLog.count({ where }),
    ]);

    // Get summary stats
    const [totalLogins, totalAccessDenied, viewedInvitations, totalGuests] = await Promise.all([
      db.guestAccessLog.count({ where: { action: 'LOGIN' } }),
      db.guestAccessLog.count({ where: { action: 'ACCESS_DENIED' } }),
      db.guest.count({ where: { invitationViewed: true } }),
      db.guest.count(),
    ]);

    return NextResponse.json({
      logs,
      total,
      stats: {
        totalLogins,
        totalAccessDenied,
        viewedInvitations,
        totalGuests,
        viewRate: totalGuests > 0 ? Math.round((viewedInvitations / totalGuests) * 100) : 0,
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
