export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccessAsync } from '@/lib/auth';
import { forbidden, internalError, unauthorized } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/stats — Aggregated event statistics (CONS-5-CLIENT-BACKEND)
// ══════════════════════════════════════════════════════════════════════════════
// GET /api/weddings/[id]/stats → 200 { stats }
//
// Returns a read-only dashboard bundle:
//   - RSVP counts (confirmed/declined/pending)
//   - Check-in stats (checked-in / total / attendance rate)
//   - Guests per table (with capacity)
//   - Guests per category
//   - Guests per family + per group
//   - Gift totals (count + sum by currency)
//   - Media count
//   - Program items count
//
// Authorization: ORGANIZER+. Tenant-scoped via [id] URL param.
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: weddingId } = await params;

  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER', 'RECEPTION', 'CONTROLLER'])) {
      return forbidden('Accès réservé à l’équipe de l’événement');
    }
    if (!(await assertWeddingAccessAsync(user, weddingId))) {
      return forbidden('Accès refusé à ce mariage');
    }

    // ─── Parallel aggregation ───────────────────────────────────────────────
    // All queries are wedding-scoped via explicit `where: { weddingId }`.
    const [
      totalGuests,
      confirmedGuests,
      pendingGuests,
      declinedGuests,
      checkedInGuests,
      totalSeats,
      tables,
      categoryStats,
      familyStats,
      groupStats,
      giftAgg,
      mediaCount,
      programCount,
      invitationCount,
    ] = await Promise.all([
      db.guest.count({ where: { weddingId } }),
      db.guest.count({ where: { weddingId, status: 'CONFIRMED' } }),
      db.guest.count({ where: { weddingId, status: 'PENDING' } }),
      db.guest.count({ where: { weddingId, status: 'DECLINED' } }),
      db.guest.count({ where: { weddingId, checkedIn: true } }),
      db.table.aggregate({ where: { weddingId }, _sum: { capacity: true } }),
      db.table.findMany({
        where: { weddingId },
        select: {
          id: true, name: true, number: true, capacity: true,
          _count: { select: { guests: true } },
        },
        orderBy: { number: 'asc' },
      }),
      db.guest.groupBy({
        by: ['category'],
        where: { weddingId },
        _count: { category: true },
      }),
      db.family.findMany({
        where: { weddingId },
        select: {
          id: true, name: true, side: true,
          _count: { select: { guests: true } },
        },
        orderBy: { name: 'asc' },
      }),
      db.guestGroup.findMany({
        where: { weddingId },
        select: {
          id: true, name: true, color: true,
          _count: { select: { guests: true } },
        },
        orderBy: { name: 'asc' },
      }),
      db.gift.aggregate({
        where: { weddingId },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      db.media.count({ where: { weddingId } }),
      db.programItem.count({ where: { weddingId } }),
      db.invitation.count({ where: { weddingId } }),
    ]);

    const rsvpRate = totalGuests > 0
      ? Math.round(((confirmedGuests + declinedGuests) / totalGuests) * 100)
      : 0;
    const attendanceRate = confirmedGuests > 0
      ? Math.round((checkedInGuests / confirmedGuests) * 100)
      : 0;
    const seatsTotal = totalSeats._sum.capacity ?? 0;
    const seatsOccupied = tables.reduce((sum, t) => sum + t._count.guests, 0);
    const seatsRemaining = Math.max(0, seatsTotal - seatsOccupied);

    // Group gift totals by currency
    const giftTotalsByCurrency = await db.gift.groupBy({
      by: ['currency'],
      where: { weddingId },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return NextResponse.json({
      stats: {
        weddingId,
        rsvp: {
          total: totalGuests,
          confirmed: confirmedGuests,
          pending: pendingGuests,
          declined: declinedGuests,
          responseRate: rsvpRate,
        },
        checkIn: {
          checkedIn: checkedInGuests,
          attendanceRate,
        },
        seating: {
          totalTables: tables.length,
          totalSeats: seatsTotal,
          occupiedSeats: seatsOccupied,
          remainingSeats: seatsRemaining,
          tables: tables.map((t) => ({
            id: t.id,
            name: t.name,
            number: t.number,
            capacity: t.capacity,
            guestCount: t._count.guests,
            occupancyRate: t.capacity > 0
              ? Math.round((t._count.guests / t.capacity) * 100)
              : 0,
          })),
        },
        categories: categoryStats.map((c) => ({
          category: c.category,
          count: c._count.category,
        })),
        families: familyStats.map((f) => ({
          id: f.id,
          name: f.name,
          side: f.side,
          memberCount: f._count.guests,
        })),
        groups: groupStats.map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          memberCount: g._count.guests,
        })),
        gifts: {
          total: giftAgg._count._all,
          totalAmountCents: giftAgg._sum.amount ?? 0,
          byCurrency: giftTotalsByCurrency.map((g) => ({
            currency: g.currency,
            amountCents: g._sum.amount ?? 0,
            count: g._count._all,
          })),
        },
        media: {
          total: mediaCount,
        },
        program: {
          total: programCount,
        },
        invitations: {
          total: invitationCount,
        },
      },
    });
  } catch (error) {
    logger.error('Get wedding stats error', {
      errMessage: error instanceof Error ? error.message : String(error),
      weddingId,
    });
    return internalError();
  }
}
