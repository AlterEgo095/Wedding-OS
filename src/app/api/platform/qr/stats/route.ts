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
 * 5.8.15 FIX — previously `summary.total` counted DeliveryJob rows with
 * channel='QR' (which is 0 because QR codes are generated ON-DEMAND from
 * Invitation rows, not tracked as DeliveryJob). Now the source of truth
 * for "QR codes generated" is the Invitation table (channel='QR').
 *
 * Returns:
 *   - summary.total           — count of Invitation rows where channel='QR'
 *                               (each row = one QR code generated for a guest)
 *   - summary.byStatus        — { USED, UNUSED, EXPIRED } derived from
 *                               Invitation + GuestAccessLog QR_SCAN presence
 *   - summary.byChannel       — Invitation channel distribution platform-wide
 *                               (QR, EMAIL, SMS, WHATSAPP) — reflects how
 *                               invitations were sent across all weddings
 *   - summary.topWeddings     — top 10 weddings by QR-channel Invitation count
 *                               (with used count = guests with ≥1 QR_SCAN log)
 *   - recentEvents            — last 50 GuestAccessLog where action ILIKE '%qr%'
 *                               (QR_SCAN, QR_VIEW, etc.) with wedding + guest labels
 *   - total, page, limit      — pagination on recentEvents
 *
 * Platform-admin only (requirePlatformAdmin). Uses unsafePlatformDb to bypass
 * the tenant-scoped extension — explicit cross-tenant scan.
 */

const VALID_STATUSES = new Set(['USED', 'UNUSED', 'EXPIRED']);
const VALID_CHANNELS = new Set(['LINK', 'QR', 'EMAIL', 'SMS', 'WHATSAPP']);

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

    // ─── Build the shared `where` clause for Invitation channel='QR' ──────
    // 5.8.15 FIX: source of truth is Invitation, not DeliveryJob.
    const qrInvitationWhere: Record<string, unknown> = { channel: 'QR' };
    if (weddingId) qrInvitationWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      qrInvitationWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    // ─── 1. Total QR codes generated (Invitation channel='QR') ───────────
    const totalQrInvitations = await db.invitation.count({ where: qrInvitationWhere });

    // ─── 2. byStatus — USED / UNUSED / EXPIRED ─────────────────────────────
    // USED = count of distinct guests with a QR_SCAN log (within filters)
    // UNUSED = total - USED
    // EXPIRED = 0 (no expiration concept for on-demand QR)
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
    scanLogWhere.guestId = { not: null };

    const scannedGuestRows = await db.guestAccessLog.findMany({
      where: scanLogWhere,
      select: { guestId: true },
      distinct: ['guestId'],
    });
    const usedCount = scannedGuestRows.length;
    const unusedCount = Math.max(0, totalQrInvitations - usedCount);

    const byStatus: Record<string, number> = {
      USED: usedCount,
      UNUSED: unusedCount,
      EXPIRED: 0,
    };

    // ─── 3. byChannel — Invitation channel distribution platform-wide ─────
    // 5.8.15 FIX: reflects how invitations were actually sent.
    const channelWhere: Record<string, unknown> = {};
    if (weddingId) channelWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      channelWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    if (channelFilter) channelWhere.channel = channelFilter;
    const channelGroups = await db.invitation.groupBy({
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
      if (g.channel in byChannel) {
        byChannel[g.channel] = g._count._all;
      } else {
        // Unknown channel — still surface it
        byChannel[g.channel] = g._count._all;
      }
    }

    // ─── 4. topWeddings — top 10 by QR-channel Invitation count ───────────
    const topWeddingGroups = await db.invitation.groupBy({
      by: ['weddingId'],
      where: qrInvitationWhere,
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
        const usedForWedding = scannedCount.length;
        return {
          weddingId: g.weddingId,
          coupleLabel: meta?.coupleLabel || '',
          slug: meta?.slug || '',
          qrCount: totalForWedding,
          usedCount: usedForWedding,
          usageRate: totalForWedding > 0 ? Math.round((usedForWedding / totalForWedding) * 1000) / 10 : 0,
        };
      })
    );

    // ─── 5. recentEvents — last N GuestAccessLog where action contains 'qr' ─
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
    if (statusFilter === 'UNUSED' || statusFilter === 'EXPIRED') {
      recentEvents = [];
    }

    return NextResponse.json({
      summary: {
        total: totalQrInvitations,
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
