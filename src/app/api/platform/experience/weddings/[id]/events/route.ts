export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════════════════════
// GET /api/platform/experience/weddings/[id]/events
// Mission 6.0 Phase 3.4 — Experience event stream (paginated).
// ════════════════════════════════════════════════════════════════════════════
//
// Returns the raw ExperienceEvent stream for a wedding — used by the
// ExperienceManager "Event Stream" panel.
//
// Query params:
//   page          1-based page index (default 1)
//   limit         page size, max 100 (default 20)
//   eventType     filter by exact eventType (e.g. "SECTION_VIEW")
//   sectionId     filter by exact sectionId
//   variantId     filter by exact variantId (variant code, e.g. "A")
//   startDate     ISO date — events with createdAt >= startDate
//   endDate       ISO date — events with createdAt <= endDate
//
// Response: { events: [...], total, page, limit, hasMore }
//
// Auth: PLATFORM_ADMIN OR wedding admin (ORGANIZER / org-scoped).

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import {
  getAuthUser,
  assertWeddingAccessAsync,
} from '@/lib/auth';
import { internalError, unauthorized, forbidden } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

const EVENT_SELECT = {
  id: true,
  weddingId: true,
  guestId: true,
  eventType: true,
  sectionId: true,
  variantId: true,
  payloadJson: true,
  createdAt: true,
} as const;

async function listEvents(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: weddingId } = await params;
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const hasAccess = await assertWeddingAccessAsync(user, weddingId);
    if (!hasAccess) return forbidden();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const eventType = searchParams.get('eventType')?.trim() || '';
    const sectionId = searchParams.get('sectionId')?.trim() || '';
    const variantId = searchParams.get('variantId')?.trim() || '';
    const startDate = searchParams.get('startDate')?.trim() || '';
    const endDate = searchParams.get('endDate')?.trim() || '';

    const where: Record<string, unknown> = { weddingId };
    if (eventType) where.eventType = eventType;
    if (sectionId) where.sectionId = sectionId;
    if (variantId) where.variantId = variantId;
    if (startDate || endDate) {
      const created: Record<string, Date> = {};
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) created.gte = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d.getTime())) created.lte = d;
      }
      if (Object.keys(created).length > 0) where.createdAt = created;
    }

    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      db.experienceEvent.findMany({
        where,
        select: EVENT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.experienceEvent.count({ where }),
    ]);

    const hasMore = skip + events.length < total;

    return NextResponse.json({
      events,
      total,
      page,
      limit,
      hasMore,
    });
  } catch (error) {
    logger.error('experience.events.list error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = listEvents;
