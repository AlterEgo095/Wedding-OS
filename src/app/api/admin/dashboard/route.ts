import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [
      totalGuests,
      confirmedGuests,
      pendingGuests,
      declinedGuests,
      checkedInGuests,
      totalTables,
      tables,
    ] = await Promise.all([
      db.guest.count(),
      db.guest.count({ where: { status: 'CONFIRMED' } }),
      db.guest.count({ where: { status: 'PENDING' } }),
      db.guest.count({ where: { status: 'DECLINED' } }),
      db.guest.count({ where: { checkedIn: true } }),
      db.table.count(),
      db.table.findMany({ include: { _count: { select: { guests: true } } } }),
    ]);

    const totalSeats = tables.reduce((sum, t) => sum + t.capacity, 0);
    const occupiedSeats = tables.reduce(
      (sum, t) => sum + t._count.guests,
      0
    );

    // Recent activity from audit logs
    const recentActivity = await db.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    // Category stats
    const categoryStats = await db.guest.groupBy({
      by: ['category'],
      _count: { category: true },
    });

    const categoryStatsFormatted = categoryStats.map((c) => ({
      category: c.category,
      count: c._count.category,
    }));

    return NextResponse.json({
      totalGuests,
      totalTables,
      confirmedGuests,
      pendingGuests,
      declinedGuests,
      checkedInGuests,
      totalSeats,
      occupiedSeats,
      recentActivity,
      categoryStats: categoryStatsFormatted,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
