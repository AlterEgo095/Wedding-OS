export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { internalError, unauthorized, forbidden, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { buildTenantContext, runWithTenant } from '@/lib/tenant-context';
import { getAuthUser, assertWeddingAccessAsync } from '@/lib/auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/guestbook/stats — Admin stats — P4.1
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/weddings/{id}/guestbook/stats
//    → 200 { total, pending, approved, rejected, averageRating }
//
//    Returns moderation queue stats for the wedding's guestbook:
//      - total:        all entries (pending + approved + rejected)
//      - pending:      approved=false AND rejectedAt IS NULL
//      - approved:     approved=true
//      - rejected:     rejectedAt IS NOT NULL
//      - averageRating: average of rating across APPROVED entries with a rating
//                       (null if no approved entries have a rating)
//
// Authorization: PLATFORM_ADMIN (any wedding) OR ORGANIZER+ with wedding access.
// RECEPTION/CONTROLLER are denied — moderation stats are an organizer concern.
// ══════════════════════════════════════════════════════════════════════════════

function canModerate(role: string): boolean {
  return (
    role === 'PLATFORM_ADMIN' ||
    role === 'SUPER_ADMIN' ||
    role === 'ORGANIZER' ||
    role === 'ORG_ADMIN'
  );
}

async function resolveWeddingContext(weddingId: string) {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      slug: true,
      status: true,
      plan: true,
      isDefault: true,
      brideName: true,
      groomName: true,
      coupleLabel: true,
      weddingDate: true,
      venueName: true,
      venueCity: true,
      organizationId: true,
    },
  });
  if (!wedding) return null;
  const cached = { ...wedding, fetchedAt: Date.now() };
  return buildTenantContext(cached);
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
      return forbidden('Statistiques réservées aux organisateurs');
    }
    const hasAccess = await assertWeddingAccessAsync(user, weddingId);
    if (!hasAccess) return forbidden('Accès refusé à ce mariage');

    const ctx = await resolveWeddingContext(weddingId);
    if (!ctx) return notFound('Mariage introuvable');

    return runWithTenant(ctx, async () => {
      const [total, pending, approved, rejected, ratingAgg] = await Promise.all([
        tenantDb.guestbookEntry.count({ where: { weddingId } }),
        tenantDb.guestbookEntry.count({
          where: { weddingId, approved: false, rejectedAt: null },
        }),
        tenantDb.guestbookEntry.count({
          where: { weddingId, approved: true },
        }),
        tenantDb.guestbookEntry.count({
          where: { weddingId, NOT: { rejectedAt: null } },
        }),
        tenantDb.guestbookEntry.aggregate({
          where: {
            weddingId,
            approved: true,
            rating: { not: null },
          },
          _avg: { rating: true },
        }),
      ]);

      return NextResponse.json({
        total,
        pending,
        approved,
        rejected,
        averageRating:
          ratingAgg._avg.rating !== null
            ? Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10
            : null,
      });
    });
  } catch (error) {
    logger.error('Guestbook stats error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
