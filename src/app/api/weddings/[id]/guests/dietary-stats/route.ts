export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { internalError, unauthorized, forbidden, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getAuthUser, assertWeddingAccessAsync } from '@/lib/auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/guests/dietary-stats — Admin dietary stats — P4.2
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/weddings/{id}/guests/dietary-stats
//    → 200 { total, withDietary, breakdown: [{ dietary, count }] }
//
//    Returns aggregated dietary-preference stats for the wedding:
//      - total:        total guests in this wedding
//      - withDietary:  guests whose dietary field is non-null + non-empty
//      - breakdown:    top dietary texts by guest count, descending.
//                       Each entry is { dietary: string, count: number }.
//                       Truncated to top 50 to keep the response small
//                       (a wedding with 1000 distinct free-form texts is
//                       pathological; the organizer UI shows top 5).
//
// Authorization: PLATFORM_ADMIN (any wedding) OR ORGANIZER+ with wedding access.
// RECEPTION/CONTROLLER are denied — dietary info is PII and reserved for the
// organizer (kitchen/catering staff receive it via a different channel).
//
// Uses raw `db` with explicit `weddingId` in all where clauses (same pattern
// as /api/weddings/[id]/stats/route.ts — single-wedding aggregation does not
// need the tenant-scoped extension, and the [id] param IS the weddingId).
// ══════════════════════════════════════════════════════════════════════════════

const MAX_BREAKDOWN_ROWS = 50;

function canModerate(role: string): boolean {
  return (
    role === 'PLATFORM_ADMIN' ||
    role === 'SUPER_ADMIN' ||
    role === 'ORGANIZER' ||
    role === 'ORG_ADMIN'
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const { id: weddingId } = await params;

    if (!canModerate(user.role)) {
      return forbidden('Statistiques alimentaires réservées aux organisateurs');
    }
    const hasAccess = await assertWeddingAccessAsync(user, weddingId);
    if (!hasAccess) return forbidden('Accès refusé à ce mariage');

    // Verify the wedding exists (404 if not — defense-in-depth even though
    // assertWeddingAccessAsync already returned true for platform admins).
    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: { id: true, coupleLabel: true },
    });
    if (!wedding) return notFound('Mariage introuvable');

    const [total, withDietary, groupBy] = await Promise.all([
      db.guest.count({ where: { weddingId } }),
      db.guest.count({
        where: {
          weddingId,
          dietary: { not: null },
          NOT: { dietary: '' },
        },
      }),
      db.guest.groupBy({
        by: ['dietary'],
        where: {
          weddingId,
          dietary: { not: null },
          NOT: { dietary: '' },
        },
        _count: { dietary: true },
        orderBy: { _count: { dietary: 'desc' } },
        take: MAX_BREAKDOWN_ROWS,
      }),
    ]);

    return NextResponse.json({
      total,
      withDietary,
      breakdown: groupBy.map((g) => ({
        dietary: g.dietary ?? '',
        count: g._count.dietary,
      })),
    });
  } catch (error) {
    logger.error('Guests dietary-stats error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
