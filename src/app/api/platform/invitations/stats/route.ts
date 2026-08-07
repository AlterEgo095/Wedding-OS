export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

/**
 * P3.8 — Cross-tenant invitation supervision API.
 *
 * GET /api/platform/invitations/stats?weddingId=&status=&channel=&dateFrom=&dateTo=&page=&limit=
 *
 * Returns aggregated invitation stats across ALL weddings:
 *   - summary.total            — count of Invitation rows
 *   - summary.byStatus         — { PENDING, SENT, DELIVERED, READ, FAILED, CANCELLED }
 *                                (Invitation.status values: PENDING/SENT/DELIVERED/
 *                                FAILED/OPENED — OPENED is reported as READ for
 *                                cross-channel consistency; CANCELLED is sourced
 *                                from DeliveryJob.status=CANCELLED for the same
 *                                invitationId set)
 *   - summary.byChannel        — { LINK, QR, EMAIL, SMS, WHATSAPP }
 *                                (Invitation.channel values: SMS/EMAIL/WHATSAPP/QR.
 *                                LINK is included for shape consistency with
 *                                DeliveryJob.channel — always 0 on Invitation.)
 *   - summary.successRate      — (SENT + DELIVERED + READ) / total, as a percentage
 *   - summary.topWeddings      — top 10 weddings by Invitation count, with
 *                                delivered + read counts + success rate
 *   - failedDeliveries         — last 50 DeliveryJob where status='FAILED',
 *                                with masked destination + lastError
 *   - total, page, limit       — pagination on failedDeliveries
 *
 * Platform-admin only (requirePlatformAdmin). Uses unsafePlatformDb to bypass
 * the tenant-scoped extension — explicit cross-tenant scan.
 */

const VALID_STATUSES = new Set([
  'PENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'CANCELLED',
]);
const VALID_CHANNELS = new Set(['LINK', 'QR', 'EMAIL', 'SMS', 'WHATSAPP']);

// Invitation.status values that count as "successful" for the success rate.
// OPENED is treated as READ (cross-channel naming alignment).
const SUCCESS_INVITATION_STATUSES = new Set(['SENT', 'DELIVERED', 'OPENED']);

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
      return badRequest(
        'Statut invalide (PENDING, SENT, DELIVERED, READ, FAILED, CANCELLED)'
      );
    }
    if (channelFilter && !VALID_CHANNELS.has(channelFilter)) {
      return badRequest('Canal invalide (LINK, QR, EMAIL, SMS, WHATSAPP)');
    }

    // ─── Build the shared `where` clause for Invitation rows ──────────────
    // Date range applies to createdAt per the task spec.
    const invWhere: Record<string, unknown> = {};
    if (weddingId) invWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      invWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    // status filter on Invitation.status — note 'READ' maps to 'OPENED'.
    if (statusFilter && statusFilter !== 'CANCELLED') {
      const mapped = statusFilter === 'READ' ? 'OPENED' : statusFilter;
      invWhere.status = mapped;
    }
    if (channelFilter) {
      // LINK is not a valid Invitation.channel — empty result.
      if (channelFilter === 'LINK') {
        return NextResponse.json({
          summary: {
            total: 0,
            byStatus: { PENDING: 0, SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0, CANCELLED: 0 },
            byChannel: { LINK: 0, QR: 0, EMAIL: 0, SMS: 0, WHATSAPP: 0 },
            successRate: 0,
            topWeddings: [],
          },
          failedDeliveries: [],
          total: 0,
          page,
          limit,
        });
      }
      invWhere.channel = channelFilter;
    }

    // ─── 1. Total invitations ─────────────────────────────────────────────
    const totalInvitations = await db.invitation.count({ where: invWhere });

    // ─── 2. byStatus — group Invitation.status, rename OPENED → READ ───────
    // We drop the status filter temporarily to get the full breakdown.
    const invWhereNoStatus: Record<string, unknown> = {};
    if (weddingId) invWhereNoStatus.weddingId = weddingId;
    if (dateFrom || dateTo) {
      invWhereNoStatus.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    if (channelFilter && channelFilter !== 'LINK') {
      invWhereNoStatus.channel = channelFilter;
    }
    const statusGroups = await db.invitation.groupBy({
      by: ['status'],
      where: invWhereNoStatus,
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {
      PENDING: 0,
      SENT: 0,
      DELIVERED: 0,
      READ: 0,
      FAILED: 0,
      CANCELLED: 0,
    };
    for (const g of statusGroups) {
      const key = g.status === 'OPENED' ? 'READ' : g.status;
      if (key in byStatus) {
        byStatus[key] += g._count._all;
      } else {
        // Unknown status — keep it under its own key for forward-compat.
        byStatus[g.status] = g._count._all;
      }
    }

    // CANCELLED — sourced from DeliveryJob.status=CANCELLED for the same
    // invitationId set (Invitation itself has no CANCELLED status).
    const cancelledJobs = await db.deliveryJob.count({
      where: {
        ...invWhereNoStatus,
        status: 'CANCELLED',
        invitationId: { not: null },
      },
    });
    byStatus.CANCELLED = cancelledJobs;

    // ─── 3. byChannel — Invitation.channel breakdown (LINK stays 0) ───────
    const channelGroups = await db.invitation.groupBy({
      by: ['channel'],
      where: invWhereNoStatus,
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
        byChannel[g.channel] = g._count._all;
      }
    }

    // ─── 4. successRate — (SENT + DELIVERED + READ) / total ───────────────
    let successCount = 0;
    for (const g of statusGroups) {
      if (SUCCESS_INVITATION_STATUSES.has(g.status)) {
        successCount += g._count._all;
      }
    }
    const successRate =
      totalInvitations > 0 ? Math.round((successCount / totalInvitations) * 1000) / 10 : 0;

    // ─── 5. topWeddings — top 10 by Invitation count ──────────────────────
    const topWeddingGroups = await db.invitation.groupBy({
      by: ['weddingId'],
      where: invWhereNoStatus,
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

    // Per-wedding status breakdown for the top 10.
    const topWeddings = await Promise.all(
      topWeddingGroups.map(async (g) => {
        const meta = metaById.get(g.weddingId);
        const totalForWedding = g._count._all;
        const perStatus = await db.invitation.groupBy({
          by: ['status'],
          where: { weddingId: g.weddingId, ...((dateFrom || dateTo) ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          } : {}) },
          _count: { _all: true },
        });
        let delivered = 0;
        let read = 0;
        let failed = 0;
        for (const s of perStatus) {
          if (s.status === 'DELIVERED') delivered = s._count._all;
          else if (s.status === 'OPENED') read = s._count._all;
          else if (s.status === 'FAILED') failed = s._count._all;
        }
        const succ = (perStatus
          .filter((s) => SUCCESS_INVITATION_STATUSES.has(s.status))
          .reduce((acc, s) => acc + s._count._all, 0));
        return {
          weddingId: g.weddingId,
          coupleLabel: meta?.coupleLabel || '',
          slug: meta?.slug || '',
          invitationsSent: totalForWedding,
          delivered,
          read,
          failed,
          successRate:
            totalForWedding > 0 ? Math.round((succ / totalForWedding) * 1000) / 10 : 0,
        };
      })
    );

    // ─── 6. failedDeliveries — last N DeliveryJob where status='FAILED' ───
    const failedWhere: Record<string, unknown> = {
      status: 'FAILED',
    };
    if (weddingId) failedWhere.weddingId = weddingId;
    if (dateFrom || dateTo) {
      failedWhere.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    if (channelFilter && channelFilter !== 'LINK') {
      failedWhere.channel = channelFilter;
    }

    const [totalFailed, failedRows] = await Promise.all([
      db.deliveryJob.count({ where: failedWhere }),
      db.deliveryJob.findMany({
        where: failedWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          weddingId: true,
          guestId: true,
          invitationId: true,
          channel: true,
          destination: true,
          lastError: true,
          attemptCount: true,
          createdAt: true,
        },
      }),
    ]);

    // Hydrate wedding + guest labels for the failed deliveries.
    const failedWeddingIds = Array.from(new Set(failedRows.map((r) => r.weddingId))).filter(Boolean);
    const failedGuestIds = Array.from(
      new Set(failedRows.map((r) => r.guestId).filter(Boolean) as string[])
    );
    const [failedWeddings, failedGuests] = await Promise.all([
      failedWeddingIds.length
        ? db.wedding.findMany({
            where: { id: { in: failedWeddingIds } },
            select: { id: true, slug: true, coupleLabel: true },
          })
        : [],
      failedGuestIds.length
        ? db.guest.findMany({
            where: { id: { in: failedGuestIds } },
            select: { id: true, firstName: true, lastName: true, displayName: true },
          })
        : [],
    ]);
    const failedWeddingById = new Map(failedWeddings.map((w) => [w.id, w] as const));
    const failedGuestById = new Map(failedGuests.map((g) => [g.id, g] as const));

    const failedDeliveries = failedRows.map((r) => {
      const w = failedWeddingById.get(r.weddingId);
      const g = failedGuestById.get(r.guestId);
      // Mask the destination if it's not already masked (defensive — DB should
      // already store masked values per schema comment, but we double-check).
      let maskedDest = r.destination || '—';
      if (maskedDest && maskedDest.includes('@') && !maskedDest.startsWith('*')) {
        const [local, domain] = maskedDest.split('@');
        if (local && domain) {
          maskedDest = `${local.slice(0, 2)}***@${domain}`;
        }
      } else if (maskedDest && maskedDest.startsWith('+') && !maskedDest.includes('*')) {
        maskedDest = `${maskedDest.slice(0, 4)}***${maskedDest.slice(-2)}`;
      }
      return {
        id: r.id,
        weddingId: r.weddingId,
        weddingLabel: w?.coupleLabel || w?.slug || r.weddingId,
        guestId: r.guestId,
        guestLabel: g
          ? g.displayName || `${g.firstName} ${g.lastName}`.trim()
          : (r.guestId || '—'),
        channel: r.channel,
        destination: maskedDest,
        lastError: r.lastError,
        attemptCount: r.attemptCount,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      summary: {
        total: totalInvitations,
        byStatus,
        byChannel,
        successRate,
        topWeddings,
      },
      failedDeliveries,
      total: totalFailed,
      page,
      limit,
    });
  } catch (err) {
    logger.error('platform.invitations.stats failed', { err });
    return internalError('Échec du calcul des statistiques d\'invitations');
  }
}
