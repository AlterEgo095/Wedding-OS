export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

/**
 * P3.8 — Cross-tenant QR code supervision API.
 *
 * GET /api/platform/qr/stats?weddingId=&status=&channel=&dateFrom=&dateTo=&page=&limit=
 *
 * Returns aggregated QR-code stats across ALL weddings:
 *   - summary.total           — count of DeliveryJob rows where channel='QR'
 *                               (each row = one QR code generated + delivered)
 *   - summary.byStatus        — { USED, UNUSED, EXPIRED } derived from
 *                               DeliveryJob.status + GuestAccessLog QR_SCAN presence
 *   - summary.byChannel       — platform-wide DeliveryJob channel mix
 *                               (LINK, QR, EMAIL, SMS, WHATSAPP) so admin sees
 *                               the overall delivery landscape, with QR being the
 *                               relevant slice for "QR codes generated"
 *   - summary.topWeddings     — top 10 weddings by QR-channel DeliveryJob count
 *                               (with used count = guests with ≥1 QR_SCAN log)
 *   - recentEvents            — last 50 GuestAccessLog where action ILIKE '%qr%'
 *                               (QR_SCAN, QR_VIEW, etc.) with wedding + guest labels
 *   - total, page, limit      — pagination on recentEvents
 *
 * Platform-admin only (requirePlatformAdmin). Uses unsafePlatformDb to bypass
 * the tenant-scoped extension — explicit cross-tenant scan.
 *
 * NOTE: Guest has no `qrCode` column (verified in schema.prisma line 396-443).
 * Each Guest has an `invitationCode` (NOT NULL) that can be rendered as a QR,
 * and the actual QR-code generation/delivery is tracked via DeliveryJob rows
 * with channel='QR'. We use that as the source of truth for "QR codes generated".
 */

const VALID_STATUSES = new Set(['USED', 'UNUSED', 'EXPIRED']);
const VALID_CHANNELS = new Set(['LINK', 'QR', 'EMAIL', 'SMS', 'WHATSAPP']);

// DeliveryJob.status values that map to "EXPIRED" QR code (no longer usable).
const EXPIRED_DELIVERY_STATUSES = new Set(['FAILED', 'CANCELLED']);
// DeliveryJob.status values that mean the QR was successfully delivered
// (so it's "UNUSED" until scanned, or "USED" if a QR_SCAN log exists).
const DELIVERED_DELIVERY_STATUSES = new Set(['SENT', 'DELIVERED', 'READ']);

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: NextRequest) {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const user = await getAuthUser(req);
  const forbidden = requirePlatformAdmin(user);
  if (forbidden) return forbidden;

  try {
    const sp = req.nextUrl.searchParams;
    const weddingId = sp.get('weddingId')?.trim() || undefined;
    const statusFilter = (sp.get('status')?.trim() || '').toUpperCase();
    const channelFilter = (sp.get('channel')?.trim() || '').toUpperCase();
    const dateFrom = parseDateParam(sp.get('dateFrom'));
    const dateTo = parseDateParam(sp.get('dateTo'));
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));

    if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
      return badRequest('Statut invalide (valeurs attendues: USED, UNUSED, EXPIRED)');
    }
    if (channelFilter && !VALID_CHANNELS.has(channelFilter)) {
      return badRequest('Canal invalide (LINK, QR, EMAIL, SMS, WHATSAPP)');
    }

    // ─── Build the shared `where` clause for DeliveryJob channel='QR' ──────
    // Date range applies to createdAt per the task spec.
    const qrWhere: Record<string, unknown> = { channel: 'QR' };
    if (weddingId) qrWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      qrWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    // ─── 1. Total QR codes generated (DeliveryJob channel='QR') ───────────
    const totalQrJobs = await db.deliveryJob.count({ where: qrWhere });

    // ─── 2. byStatus — USED / UNUSED / EXPIRED ─────────────────────────────
    // Fetch the QR-channel DeliveryJobs grouped by raw status, then derive the
    // USED/UNUSED/EXPIRED buckets. USED requires a GuestAccessLog QR_SCAN entry
    // for the same guest — we resolve that with a single guestId IN (...) probe.
    const qrJobsByRawStatus = await db.deliveryJob.groupBy({
      by: ['status'],
      where: qrWhere,
      _count: { _all: true },
    });

    // Collect guestIds from SENT/DELIVERED/READ QR-channel jobs (candidates
    // for USED status — those need a QR_SCAN log lookup).
    // Fetch guestIds for delivered QR jobs (distinct, for the scan-log filter).
    const deliveredQrJobs = await db.deliveryJob.findMany({
      where: { ...qrWhere, status: { in: Array.from(DELIVERED_DELIVERY_STATUSES) } },
      select: { guestId: true },
      distinct: ['guestId'],
    });
    const candidateGuestIds: string[] = deliveredQrJobs.map((j) => j.guestId);

    // Set of guestIds that have at least one QR_SCAN log (within the same
    // weddingId filter if provided, within the same date range if provided).
    const scanLogWhere: Record<string, unknown> = {
      action: { contains: 'qr' },
    };
    if (weddingId) scanLogWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      scanLogWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    if (candidateGuestIds.length > 0) {
      scanLogWhere.guestId = { in: candidateGuestIds };
    } else {
      // No delivered QR jobs → no candidates, skip the scan-log lookup.
    }
    const scannedGuestRows = candidateGuestIds.length
      ? await db.guestAccessLog.findMany({
          where: scanLogWhere,
          select: { guestId: true },
          distinct: ['guestId'],
        })
      : [];
    const scannedGuestIds = new Set<string>(
      scannedGuestRows.map((r) => r.guestId || '').filter(Boolean)
    );

    // Now compute USED / UNUSED / EXPIRED from the raw status buckets.
    // USED = count of QR-channel DeliveryJobs where guest has a QR_SCAN log
    //        AND the job status is in DELIVERED_DELIVERY_STATUSES.
    // UNUSED = count of QR-channel DeliveryJobs with status in DELIVERED_DELIVERY_STATUSES
    //          but the guest has NO QR_SCAN log.
    // EXPIRED = count of QR-channel DeliveryJobs with status in EXPIRED_DELIVERY_STATUSES.
    let used = 0;
    let unused = 0;
    let expired = 0;
    // We need per-row guestId to know which delivered jobs are USED vs UNUSED,
    // so re-fetch delivered jobs with guestId (not distinct) and count manually.
    const deliveredJobsWithGuest = await db.deliveryJob.findMany({
      where: { ...qrWhere, status: { in: Array.from(DELIVERED_DELIVERY_STATUSES) } },
      select: { guestId: true },
    });
    for (const j of deliveredJobsWithGuest) {
      if (scannedGuestIds.has(j.guestId)) used++;
      else unused++;
    }
    for (const row of qrJobsByRawStatus) {
      if (EXPIRED_DELIVERY_STATUSES.has(row.status)) {
        expired += row._count._all;
      }
    }

    const byStatus: Record<string, number> = { USED: used, UNUSED: unused, EXPIRED: expired };

    // ─── 3. byChannel — platform-wide DeliveryJob channel mix ─────────────
    const channelWhere: Record<string, unknown> = {};
    if (weddingId) channelWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      channelWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    if (channelFilter) channelWhere.channel = channelFilter;
    const channelGroups = await db.deliveryJob.groupBy({
      by: ['channel'],
      where: channelWhere,
      _count: { _all: true },
    });
    const byChannel: Record<string, number> = {
      LINK: 0,
      QR: 0,
      EMAIL: 0,
      SMS: 0,
      WHATSAPP: 0,
    };
    for (const g of channelGroups) {
      byChannel[g.channel] = g._count._all;
    }

    // ─── 4. topWeddings — top 10 by QR-channel DeliveryJob count ──────────
    const topWeddingGroups = await db.deliveryJob.groupBy({
      by: ['weddingId'],
      where: qrWhere,
      _count: { _all: true },
      orderBy: { _count: { weddingId: 'desc' } },
      take: 10,
    });
    const topWeddingIds = topWeddingGroups.map((g) => g.weddingId);
    const topWeddingsMeta = topWeddingIds.length
      ? await db.wedding.findMany({
          where: { id: { in: topWeddingIds } },
          select: { id: true, slug: true, coupleLabel: true, brideName: true, groomName: true },
        })
      : [];
    const metaById = new Map(topWeddingsMeta.map((w) => [w.id, w] as const));
    // For each top wedding, also count "used" (guests with QR_SCAN logs).
    const topWeddings = await Promise.all(
      topWeddingGroups.map(async (g) => {
        const meta = metaById.get(g.weddingId);
        const totalForWedding = g._count._all;
        // Count scanned guests for this wedding.
        const scannedCount = await db.guestAccessLog.findMany({
          where: {
            weddingId: g.weddingId,
            action: { contains: 'qr' },
            guestId: { not: null },
          },
          select: { guestId: true },
          distinct: ['guestId'],
        });
        const usedCount = scannedCount.length;
        return {
          weddingId: g.weddingId,
          coupleLabel: meta?.coupleLabel || '',
          slug: meta?.slug || '',
          qrCount: totalForWedding,
          usedCount,
          usageRate: totalForWedding > 0 ? Math.round((usedCount / totalForWedding) * 1000) / 10 : 0,
        };
      })
    );

    // ─── 5. recentEvents — last N GuestAccessLog where action contains 'qr' ─
    // Apply the same filters (weddingId, date range). status/channel don't
    // apply directly to GuestAccessLog — but channel filter is interpreted as
    // "show events for QR-channel deliveries" which we approximate by only
    // filtering on action containing 'qr' (the channel='QR' concept overlaps
    // with the QR_SCAN action). When statusFilter is set, we post-filter events
    // to those whose guest matches the requested status bucket.
    const eventsWhere: Record<string, unknown> = {
      action: { contains: 'qr' },
    };
    if (weddingId) eventsWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      eventsWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    const [totalEvents, eventRows] = await Promise.all([
      db.guestAccessLog.count({ where: eventsWhere }),
      db.guestAccessLog.findMany({
        where: eventsWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          weddingId: true,
          guestId: true,
          action: true,
          details: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    // Hydrate wedding + guest labels for the events.
    const eventWeddingIds = Array.from(new Set(eventRows.map((r) => r.weddingId))).filter(Boolean);
    const eventGuestIds = Array.from(new Set(eventRows.map((r) => r.guestId).filter(Boolean) as string[]));
    const [eventWeddings, eventGuests] = await Promise.all([
      eventWeddingIds.length
        ? db.wedding.findMany({
            where: { id: { in: eventWeddingIds } },
            select: { id: true, slug: true, coupleLabel: true },
          })
        : [],
      eventGuestIds.length
        ? db.guest.findMany({
            where: { id: { in: eventGuestIds } },
            select: { id: true, firstName: true, lastName: true, displayName: true },
          })
        : [],
    ]);
    const eventWeddingById = new Map(eventWeddings.map((w) => [w.id, w] as const));
    const eventGuestById = new Map(eventGuests.map((g) => [g.id, g] as const));

    let recentEvents = eventRows.map((r) => {
      const w = eventWeddingById.get(r.weddingId);
      const g = r.guestId ? eventGuestById.get(r.guestId) : null;
      return {
        id: r.id,
        weddingId: r.weddingId,
        weddingLabel: w?.coupleLabel || w?.slug || r.weddingId,
        guestId: r.guestId,
        guestLabel: g
          ? g.displayName || `${g.firstName} ${g.lastName}`.trim()
          : (r.guestId || '—'),
        action: r.action,
        details: r.details,
        userAgent: r.userAgent,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt.toISOString(),
      };
    });

    // If statusFilter is set, post-filter recentEvents by the corresponding bucket.
    // USED → only events where the guest has a QR_SCAN log (always true here since
    //        the action contains 'qr').
    // UNUSED → events whose guest has a delivered QR job but no scan log — these
    //          won't appear in the QR scan events stream by definition, so UNUSED
    //          filter yields empty list (documented behaviour).
    // EXPIRED — not applicable to scan events.
    if (statusFilter === 'UNUSED' || statusFilter === 'EXPIRED') {
      recentEvents = [];
    }

    return NextResponse.json({
      summary: {
        total: totalQrJobs,
        byStatus,
        byChannel,
        topWeddings,
      },
      recentEvents,
      total: totalEvents,
      page,
      limit,
    });
  } catch (err) {
    logger.error('platform.qr.stats failed', { err });
    return internalError('Échec du calcul des statistiques QR');
  }
}
