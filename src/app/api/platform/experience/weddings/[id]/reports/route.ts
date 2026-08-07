export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════════════════════
// GET /api/platform/experience/weddings/[id]/reports
// Mission 6.0 Phase 3.4 — Aggregated experience reports.
// ════════════════════════════════════════════════════════════════════════════
//
// Returns aggregated engagement metrics for a wedding. The aggregation can
// either come from pre-computed ExperienceReport rows (when a scheduled job
// has materialized them) or be computed on-the-fly from ExperienceEvent rows
// (fallback — slower for very large weddings but always available).
//
// Query params:
//   granularity   DAILY | WEEKLY | MONTHLY (default DAILY)
//   periodStart   ISO date (inclusive) — default: 30 days ago
//   periodEnd     ISO date (inclusive) — default: now
//
// Algorithm:
//   1. Look for ExperienceReport rows where:
//        weddingId = weddingId
//        granularity = granularity
//        periodStart >= requestedStart
//        periodStart <= requestedEnd
//      If found, return them directly (fast path).
//   2. Otherwise, aggregate from ExperienceEvent:
//        - Group events by sectionId (or "(none)" for null) AND variantId.
//        - Compute per-section: views (count of SECTION_VIEW), avgTimeSec
//          (mean of TIME_SPENT payloads), bounceRate (1 - (events with > 1
//          section view / total sessions)).
//        - Compute per-variant: conversionRate (RSVP_VIEW / SECTION_VIEW).
//        - Top events by count.
//      Then cache the result as ONE ExperienceReport row per period bucket.
//   3. Return { reports: [...], summary: { totalEvents, topSections,
//      topVariants } }.
//
// Auth: PLATFORM_ADMIN OR wedding admin (ORGANIZER / org-scoped).

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import {
  getAuthUser,
  assertWeddingAccessAsync,
} from '@/lib/auth';
import { internalError, unauthorized, forbidden, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

const GRANULARITIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
type Granularity = (typeof GRANULARITIES)[number];

interface SectionEngagement {
  views: number;
  avgTimeSec: number;
  bounceRate: number; // 0-1
  uniqueGuests: number;
}

interface VariantPerformance {
  impressions: number;
  conversions: number;
  conversionRate: number; // 0-1
}

interface AggregatedMetrics {
  sectionEngagement: Record<string, SectionEngagement>;
  variantPerformance: Record<string, Record<string, VariantPerformance>>;
  topEvents: Array<{ eventType: string; count: number }>;
  totalEvents: number;
  uniqueVisitors: number;
}

function bucketStart(date: Date, granularity: Granularity): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (granularity === 'WEEKLY') {
    // ISO week starts Monday
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
  } else if (granularity === 'MONTHLY') {
    d.setDate(1);
  }
  return d;
}

function bucketEnd(start: Date, granularity: Granularity): Date {
  const end = new Date(start);
  if (granularity === 'DAILY') {
    end.setDate(end.getDate() + 1);
  } else if (granularity === 'WEEKLY') {
    end.setDate(end.getDate() + 7);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  // end is exclusive; subtract 1ms for the stored periodEnd (inclusive).
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

function safeJsonParse(str: string, fallback: unknown): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Aggregate ExperienceEvent rows in [start, end] into the metrics shape.
 * Pure function — does not touch the DB. Tested implicitly via the route.
 */
function aggregateEvents(
  events: Array<{
    guestId: string | null;
    eventType: string;
    sectionId: string | null;
    variantId: string | null;
    payloadJson: string;
    createdAt: Date;
  }>,
  _periodStart: Date,
  _periodEnd: Date
): AggregatedMetrics {
  const sectionEngagement: Record<string, SectionEngagement> = {};
  const variantPerf: Record<string, Record<string, VariantPerformance>> = {};
  const eventCounts: Record<string, number> = {};
  const uniqueGuests = new Set<string>();
  const uniqueAnonymousSessions = new Set<string>();

  // For bounce rate: a "session" = unique guestId (or anonymous IP/hash).
  // We track per-section the set of sessions that viewed it, and how many
  // sections each session viewed (a bounce = viewed only 1 section).
  const sessionSections: Map<string, Set<string>> = new Map();

  for (const ev of events) {
    // Count event types
    eventCounts[ev.eventType] = (eventCounts[ev.eventType] || 0) + 1;

    // Track unique visitors
    const sessionKey = ev.guestId || `anon:${ev.payloadJson.slice(0, 32)}`;
    if (ev.guestId) uniqueGuests.add(ev.guestId);
    else uniqueAnonymousSessions.add(sessionKey);

    // Section engagement
    const secKey = ev.sectionId || '(none)';
    if (!sectionEngagement[secKey]) {
      sectionEngagement[secKey] = {
        views: 0,
        avgTimeSec: 0,
        bounceRate: 0,
        uniqueGuests: 0,
      };
    }
    const sec = sectionEngagement[secKey];

    if (ev.eventType === 'SECTION_VIEW' || ev.eventType === 'VIEW') {
      sec.views += 1;
      sec.uniqueGuests += 1; // approximation (counted per event, not per unique guest)

      // Track session→section for bounce rate
      if (!sessionSections.has(sessionKey)) {
        sessionSections.set(sessionKey, new Set());
      }
      sessionSections.get(sessionKey)!.add(secKey);
    }

    if (ev.eventType === 'TIME_SPENT' || ev.eventType === 'DWELL') {
      const payload = safeJsonParse(ev.payloadJson, {}) as Record<string, unknown>;
      const secs = Number(payload.seconds ?? payload.duration ?? payload.timeSpent ?? 0);
      if (secs > 0) {
        // Running average — accumulate total then divide at the end.
        // We use a simple rolling update: avg = avg + (value - avg) / n.
        // For simplicity here we sum + count via payload injection.
        const current = sec.avgTimeSec;
        const newCount = (sec as SectionEngagement & { _timeCount?: number })._timeCount ?? 0;
        const newAvg = newCount === 0 ? secs : (current * newCount + secs) / (newCount + 1);
        sec.avgTimeSec = newAvg;
        (sec as SectionEngagement & { _timeCount?: number })._timeCount = newCount + 1;
      }
    }

    // Variant performance
    if (ev.variantId) {
      const vKey = secKey;
      if (!variantPerf[vKey]) variantPerf[vKey] = {};
      if (!variantPerf[vKey][ev.variantId]) {
        variantPerf[vKey][ev.variantId] = {
          impressions: 0,
          conversions: 0,
          conversionRate: 0,
        };
      }
      const vp = variantPerf[vKey][ev.variantId];
      if (ev.eventType === 'SECTION_VIEW' || ev.eventType === 'VIEW') {
        vp.impressions += 1;
      }
      if (
        ev.eventType === 'RSVP_VIEW' ||
        ev.eventType === 'RSVP_SUBMIT' ||
        ev.eventType === 'CONVERSION' ||
        ev.eventType === 'CTA_CLICK'
      ) {
        vp.conversions += 1;
      }
    }
  }

  // Compute conversion rates + bounce rate
  for (const vKey of Object.keys(variantPerf)) {
    for (const vCode of Object.keys(variantPerf[vKey])) {
      const vp = variantPerf[vKey][vCode];
      vp.conversionRate = vp.impressions > 0 ? vp.conversions / vp.impressions : 0;
    }
  }

  let totalSessions = 0;
  let bouncedSessions = 0;
  for (const sections of sessionSections.values()) {
    totalSessions += 1;
    if (sections.size <= 1) bouncedSessions += 1;
  }
  // Apply bounce rate to each section (overall bounce rate — per-section
  // bounce would require more granular session tracking, deferred to a
  // future iteration).
  const overallBounce = totalSessions > 0 ? bouncedSessions / totalSessions : 0;
  for (const sec of Object.values(sectionEngagement)) {
    sec.bounceRate = overallBounce;
  }

  const topEvents = Object.entries(eventCounts)
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    sectionEngagement,
    variantPerformance: variantPerf,
    topEvents,
    totalEvents: events.length,
    uniqueVisitors: uniqueGuests.size + uniqueAnonymousSessions.size,
  };
}

async function listReports(
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
    const granularityParam = (searchParams.get('granularity')?.trim().toUpperCase() || 'DAILY') as Granularity;
    if (!GRANULARITIES.includes(granularityParam)) {
      return badRequest(`granularity doit être l'un de: ${GRANULARITIES.join(', ')}`);
    }
    const granularity = granularityParam;

    const now = new Date();
    const periodEndParam = searchParams.get('periodEnd')?.trim();
    const periodStartParam = searchParams.get('periodStart')?.trim();
    const periodEnd = periodEndParam ? new Date(periodEndParam) : now;
    const periodStart = periodStartParam
      ? new Date(periodStartParam)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return badRequest('periodStart / periodEnd doivent être des dates ISO valides');
    }

    // ─── Fast path: check for pre-computed reports covering [periodStart, periodEnd] ─
    const cached = await db.experienceReport.findMany({
      where: {
        weddingId,
        granularity,
        periodStart: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { periodStart: 'asc' },
    });

    // If cached reports cover the entire requested range, use them.
    // We consider the coverage sufficient if at least 1 report exists
    // (the UI will display whatever buckets we have).
    if (cached.length > 0) {
      // Build summary from cached reports
      const allMetrics: AggregatedMetrics[] = cached.map((r) =>
        safeJsonParse(r.metricsJson, {
          sectionEngagement: {},
          variantPerformance: {},
          topEvents: [],
          totalEvents: 0,
          uniqueVisitors: 0,
        }) as AggregatedMetrics
      );

      const summary = mergeMetrics(allMetrics);
      return NextResponse.json({ reports: cached, summary, source: 'cache' });
    }

    // ─── Slow path: aggregate from raw events ───────────────────────────────
    const events = await db.experienceEvent.findMany({
      where: {
        weddingId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        guestId: true,
        eventType: true,
        sectionId: true,
        variantId: true,
        payloadJson: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group events into time buckets per granularity
    const buckets = new Map<string, { start: Date; end: Date; events: typeof events }>();
    for (const ev of events) {
      const bStart = bucketStart(ev.createdAt, granularity);
      const key = bStart.toISOString();
      if (!buckets.has(key)) {
        buckets.set(key, { start: bStart, end: bucketEnd(bStart, granularity), events: [] });
      }
      buckets.get(key)!.events.push(ev);
    }

    // Build + persist report rows for each bucket
    const reports: Array<{
      id: string;
      weddingId: string;
      periodStart: string;
      periodEnd: string;
      granularity: string;
      metricsJson: string;
      createdAt: string;
    }> = [];
    const allMetrics: AggregatedMetrics[] = [];

    for (const { start, end, events: bucketEvents } of buckets.values()) {
      const metrics = aggregateEvents(bucketEvents, start, end);
      allMetrics.push(metrics);
      try {
        const row = await db.experienceReport.create({
          data: {
            weddingId,
            periodStart: start,
            periodEnd: end,
            granularity,
            metricsJson: JSON.stringify(metrics),
          },
        });
        reports.push({
          id: row.id,
          weddingId: row.weddingId,
          periodStart: row.periodStart.toISOString(),
          periodEnd: row.periodEnd.toISOString(),
          granularity: row.granularity,
          metricsJson: row.metricsJson,
          createdAt: row.createdAt.toISOString(),
        });
      } catch (cacheErr) {
        // Unique constraint violation = another request cached it concurrently.
        // Not fatal — just skip caching this bucket and use the in-memory metrics.
        if (
          cacheErr instanceof Error &&
          'code' in cacheErr &&
          (cacheErr as { code?: string }).code === 'P2002'
        ) {
          // Re-fetch the cached row
          const existing = await db.experienceReport.findUnique({
            where: {
              weddingId_periodStart_granularity: {
                weddingId,
                periodStart: start,
                granularity,
              },
            },
          });
          if (existing) {
            reports.push({
              id: existing.id,
              weddingId: existing.weddingId,
              periodStart: existing.periodStart.toISOString(),
              periodEnd: existing.periodEnd.toISOString(),
              granularity: existing.granularity,
              metricsJson: existing.metricsJson,
              createdAt: existing.createdAt.toISOString(),
            });
          }
        } else {
          logger.warn('experience.reports: cache write failed (non-fatal)', {
            weddingId,
            errMessage: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        }
      }
    }

    const summary = mergeMetrics(allMetrics);
    return NextResponse.json({ reports, summary, source: 'live' });
  } catch (error) {
    logger.error('experience.reports.list error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

function mergeMetrics(all: AggregatedMetrics[]): {
  totalEvents: number;
  topSections: Array<{ sectionId: string; views: number; avgTimeSec: number; bounceRate: number }>;
  topVariants: Array<{ sectionId: string; variantCode: string; impressions: number; conversions: number; conversionRate: number }>;
  uniqueVisitors: number;
} {
  const sectionAgg: Record<string, { views: number; totalTime: number; timeCount: number; bounceRateSum: number; bounceCount: number }> = {};
  const variantAgg: Record<string, VariantPerformance & { sectionId: string; variantCode: string }> = {};
  let totalEvents = 0;
  let uniqueVisitors = 0;

  for (const m of all) {
    totalEvents += m.totalEvents;
    uniqueVisitors += m.uniqueVisitors;

    for (const [secId, sec] of Object.entries(m.sectionEngagement)) {
      if (!sectionAgg[secId]) {
        sectionAgg[secId] = { views: 0, totalTime: 0, timeCount: 0, bounceRateSum: 0, bounceCount: 0 };
      }
      const agg = sectionAgg[secId];
      agg.views += sec.views;
      if (sec.avgTimeSec > 0) {
        agg.totalTime += sec.avgTimeSec * (sec.views || 1);
        agg.timeCount += sec.views || 1;
      }
      if (sec.bounceRate > 0) {
        agg.bounceRateSum += sec.bounceRate;
        agg.bounceCount += 1;
      }
    }

    for (const [secId, variants] of Object.entries(m.variantPerformance)) {
      for (const [vCode, vp] of Object.entries(variants)) {
        const key = `${secId}::${vCode}`;
        if (!variantAgg[key]) {
          variantAgg[key] = {
            sectionId: secId,
            variantCode: vCode,
            impressions: 0,
            conversions: 0,
            conversionRate: 0,
          };
        }
        variantAgg[key].impressions += vp.impressions;
        variantAgg[key].conversions += vp.conversions;
      }
    }
  }

  const topSections = Object.entries(sectionAgg)
    .map(([sectionId, agg]) => ({
      sectionId,
      views: agg.views,
      avgTimeSec: agg.timeCount > 0 ? agg.totalTime / agg.timeCount : 0,
      bounceRate: agg.bounceCount > 0 ? agg.bounceRateSum / agg.bounceCount : 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const topVariants = Object.values(variantAgg)
    .map((v) => ({
      sectionId: v.sectionId,
      variantCode: v.variantCode,
      impressions: v.impressions,
      conversions: v.conversions,
      conversionRate: v.impressions > 0 ? v.conversions / v.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  return { totalEvents, topSections, topVariants, uniqueVisitors };
}

export const GET = listReports;
