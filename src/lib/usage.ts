/**
 * P2.4 — Usage metering module.
 *
 * Reactivates the previously-inert UsageCounter model. Provides atomic
 * increment helpers for the 9 supported metrics + read helpers for
 * dashboard quota/usage displays.
 *
 * Design rules:
 *   - Uses the RAW `db` client (NOT `tenantDb`). UsageCounter is tenant-
 *     scoped at the schema level (registered in tenant-scoped.ts), but the
 *     writes here are explicit-weddingId by design — metering must work
 *     even outside runWithTenant() (e.g. in background jobs, audit hooks,
 *     org-level aggregation). The raw client never auto-injects.
 *   - The composite unique `@@unique([weddingId, metric, period])` lets us
 *     `upsert` atomically — concurrent increments on the same row become a
 *     serialized increment+increment, no lost updates.
 *   - incrementUsage SWALLOWS errors: a failed counter must NEVER break
 *     the primary operation it's metering (invitation send, upload, ...).
 *     Returns the new value on success, 0 on error.
 *   - `period` is the YYYY-MM (UTC) prefix of the row's updatedAt —
 *     monthly metering granularity matches the spec.
 */
import { db } from './db';
import { logger } from './logger';

/** All 9 supported usage metrics. Mirrors the spec P2.4 requirement. */
export const USAGE_METRICS = [
  'GUESTS',
  'MEDIA_BYTES',
  'ADMINS',
  'QR_SCANS',
  'INVITATIONS_SENT',
  'SMS',
  'WHATSAPP',
  'EMAILS',
  'EXPORTS',
] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number];

/**
 * Get the current month period string (YYYY-MM) in UTC.
 * Used as the `period` field for monthly-metered UsageCounter rows.
 *
 * Examples:
 *   new Date('2026-07-15T10:30:00Z') → '2026-07'
 *   new Date('2026-12-31T23:59:59Z') → '2026-12'
 */
export function getCurrentPeriod(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7); // "2026-07"
}

/**
 * P2.4 — Atomic usage counter increment.
 *
 * Upserts the UsageCounter row for (weddingId, metric, currentPeriod) and
 * increments its value by `delta` (default 1).
 *
 * Uses upsert to be idempotent: if the row doesn't exist for this period,
 * create it with value=delta. If it exists, increment by delta.
 *
 * The unique constraint @@unique([weddingId, metric, period]) guarantees
 * one row per metric per period per wedding.
 *
 * Errors are SWALLOWED and logged — usage metering MUST NEVER break the
 * primary operation (a failed counter increment should not fail an invitation
 * send). Returns the new value on success, or 0 on error.
 */
export async function incrementUsage(
  weddingId: string,
  metric: UsageMetric,
  delta: number = 1,
): Promise<number> {
  try {
    const period = getCurrentPeriod();
    // Defensive: negative or NaN deltas are clamped to 0 to avoid corrupting
    // counters. NaN happens if a caller passes `file.size` from a malformed
    // multipart payload. We don't throw — metering is best-effort.
    const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.floor(delta) : 0;
    if (safeDelta === 0) return 0;

    const row = await db.usageCounter.upsert({
      where: {
        weddingId_metric_period: { weddingId, metric, period },
      },
      update: {
        value: { increment: safeDelta },
      },
      create: {
        weddingId,
        metric,
        period,
        value: safeDelta,
      },
      select: { value: true },
    });
    return row.value;
  } catch (err) {
    // P2-SEC-1: structured logger; no stack leak.
    logger.error('incrementUsage failed', {
      weddingId,
      metric,
      delta,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Get the current usage for a metric in the current period (or a provided
 * period). Returns 0 if no row exists.
 */
export async function getUsage(
  weddingId: string,
  metric: UsageMetric,
  period?: string,
): Promise<number> {
  try {
    const p = period ?? getCurrentPeriod();
    const row = await db.usageCounter.findUnique({
      where: {
        weddingId_metric_period: { weddingId, metric, period: p },
      },
      select: { value: true },
    });
    return row?.value ?? 0;
  } catch (err) {
    logger.error('getUsage failed', {
      weddingId,
      metric,
      period,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Get all 9 metrics for a wedding in the current period (or a provided one).
 * Returns an object keyed by metric name. Missing rows are 0.
 */
export async function getAllUsage(
  weddingId: string,
  period?: string,
): Promise<Record<UsageMetric, number>> {
  const p = period ?? getCurrentPeriod();
  // Initialise all 9 metrics to 0 so callers get a stable shape even when no
  // rows exist yet (fresh wedding, start of month, ...).
  const result = {} as Record<UsageMetric, number>;
  for (const m of USAGE_METRICS) result[m] = 0;
  try {
    const rows = await db.usageCounter.findMany({
      where: { weddingId, period: p },
      select: { metric: true, value: true },
    });
    for (const r of rows) {
      // Defensive: only fill keys that are known metrics (the DB column is a
      // free-form string, so a stray legacy value must not corrupt the typed
      // result).
      if (r.metric in result) {
        result[r.metric as UsageMetric] = r.value;
      }
    }
  } catch (err) {
    logger.error('getAllUsage failed', {
      weddingId,
      period: p,
      errMessage: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}

/**
 * Get the lifetime usage for a metric (sum across all periods).
 * Used for dashboard "lifetime stats" displays.
 */
export async function getLifetimeUsage(
  weddingId: string,
  metric: UsageMetric,
): Promise<number> {
  try {
    const result = await db.usageCounter.aggregate({
      where: { weddingId, metric },
      _sum: { value: true },
    });
    return result._sum.value ?? 0;
  } catch (err) {
    logger.error('getLifetimeUsage failed', {
      weddingId,
      metric,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Get usage for a metric across a date range (sums multiple periods).
 *
 * Periods are YYYY-MM strings, which sort lexicographically in chronological
 * order, so a string comparison `>= startPeriod && <= endPeriod` correctly
 * selects the inclusive range. We slice the inputs to 7 chars so callers can
 * safely pass full ISO strings (or Date objects, which we convert).
 *
 * @param startDate ISO string or Date
 * @param endDate   ISO string or Date
 */
export async function getUsageInRange(
  weddingId: string,
  metric: UsageMetric,
  startDate: Date | string,
  endDate: Date | string,
): Promise<number> {
  try {
    const startStr =
      startDate instanceof Date ? startDate.toISOString() : String(startDate);
    const endStr =
      endDate instanceof Date ? endDate.toISOString() : String(endDate);
    const startPeriod = startStr.slice(0, 7);
    const endPeriod = endStr.slice(0, 7);

    // Guard against inverted ranges — return 0 rather than throwing, since
    // metering is best-effort.
    if (startPeriod > endPeriod) return 0;

    const result = await db.usageCounter.aggregate({
      where: {
        weddingId,
        metric,
        period: { gte: startPeriod, lte: endPeriod },
      },
      _sum: { value: true },
    });
    return result._sum.value ?? 0;
  } catch (err) {
    logger.error('getUsageInRange failed', {
      weddingId,
      metric,
      startDate: startDate instanceof Date ? startDate.toISOString() : startDate,
      endDate: endDate instanceof Date ? endDate.toISOString() : endDate,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Get the current period usage for all weddings in an organization.
 * Used for org-level quota checks (e.g. max invitations/month per org).
 *
 * Joins through Wedding.organizationId (Wedding ← UsageCounter.wedding).
 */
export async function getOrgUsageForPeriod(
  organizationId: string,
  metric: UsageMetric,
  period?: string,
): Promise<number> {
  try {
    const p = period ?? getCurrentPeriod();
    const result = await db.usageCounter.aggregate({
      where: {
        wedding: { organizationId },
        metric,
        period: p,
      },
      _sum: { value: true },
    });
    return result._sum.value ?? 0;
  } catch (err) {
    logger.error('getOrgUsageForPeriod failed', {
      organizationId,
      metric,
      period,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
