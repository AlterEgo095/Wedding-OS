export const dynamic = 'force-dynamic';

// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/audit — P3.12 (Mission 6.0 Phase 3)
// Real audit log explorer API (paginated, filterable, exportable).
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the "faux ami" pattern of the old AuditTab UI (which only consumed
// the `recentActivity` field of /api/platform/dashboard — last 20 entries, no
// filters, no pagination, no export). This route is the platform-wide audit
// log explorer backend.
//
// Contract:
//   GET /api/platform/audit
//     ?userId=<AdminUser.id>      — filter by acting user
//     ?weddingId=<Wedding.id>     — filter by tenant
//     ?action=<code|prefix.*>     — exact action OR prefix wildcard (e.g.
//                                    `action=guest.*` matches `guest.create`,
//                                    `guest.update`, `guest.delete`, ...)
//     ?dateFrom=<ISO8601>         — createdAt >= dateFrom
//     ?dateTo=<ISO8601>           — createdAt <= dateTo
//     ?search=<text>              — LIKE %search% on the `details` field
//     ?page=<int>                 — 1-based page (default 1)
//     ?limit=<int>                — page size (default 50, max 200)
//     ?sortBy=createdAt|action    — sort field (default createdAt)
//     ?sortOrder=asc|desc         — sort direction (default desc)
//     ?export=csv|json            — when set, return the FULL result set
//                                    (no pagination) as a downloadable file
//
//   Response (normal, 200):
//     {
//       entries: AuditLog[],     // joined with AdminUser (email) + Wedding (coupleLabel)
//       total: number,           // total matching rows (pre-pagination)
//       page: number,
//       limit: number,
//       totalPages: number,
//       filters: {               // echo of applied filters (for UI display)
//         userId, weddingId, action, dateFrom, dateTo, search, sortBy, sortOrder
//       }
//     }
//
//   Response (export=csv, 200):
//     Content-Type: text/csv
//     Content-Disposition: attachment; filename="audit-export-<ts>.csv"
//     Body: CSV with columns: timestamp, user, action, wedding, ipAddress, details
//
//   Response (export=json, 200):
//     Content-Type: application/json
//     Content-Disposition: attachment; filename="audit-export-<ts>.json"
//     Body: pretty-printed JSON array (full result set, no pagination wrapper)
//
// Auth: PLATFORM_ADMIN only (requirePlatformAdmin).
// Rate limit: 30 req/min for normal reads, 5 req/min for exports (large queries).
//
// Uses `unsafePlatformDb` (raw Prisma client) — AuditLog is platform-level
// (weddingId may be null for platform events), so the tenant-scoped extension
// must NOT be applied. The "unsafe" name makes that intentional cross-tenant
// access visible in code review (per the contract in src/lib/db.ts).

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const EXPORT_MAX_ROWS = 10_000; // safety cap to avoid OOM on huge exports

const ALLOWED_SORT_BY = ['createdAt', 'action'] as const;
type SortBy = (typeof ALLOWED_SORT_BY)[number];

const ALLOWED_SORT_ORDER = ['asc', 'desc'] as const;
type SortOrder = (typeof ALLOWED_SORT_ORDER)[number];

const ALLOWED_EXPORT = ['csv', 'json'] as const;
type ExportFormat = (typeof ALLOWED_EXPORT)[number];

// ─── Select clause (shared between paginated + export paths) ──────────────────

const AUDIT_SELECT = {
  id: true,
  action: true,
  details: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  weddingId: true,
  userId: true,
  user: {
    select: { id: true, email: true, name: true, role: true },
  },
  wedding: {
    select: { id: true, slug: true, coupleLabel: true },
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse an int query param with a default + min + max clamping.
 */
function parseIntParam(
  value: string | null,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (value === null || value === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Convert the `?action=` query param into a Prisma `where.action` filter.
 *
 * Supports two modes:
 *   1. Wildcard suffix: `action=guest.*` → `{ startsWith: 'guest.' }`
 *      Matches `guest.create`, `guest.update`, etc.
 *   2. Exact match: `action=login` → `'login'`
 *
 * The wildcard form is the only glob currently supported — it covers the
 * documented use cases (e.g. filtering all guest.* or wedding.* events).
 * A bare `*` is treated as "no filter" (matches everything).
 */
function buildActionFilter(action: string): string | { startsWith: string } | undefined {
  if (!action) return undefined;
  if (action === '*') return undefined;
  if (action.endsWith('.*')) {
    return { startsWith: action.slice(0, -1) }; // keep the trailing dot
  }
  return action;
}

/**
 * Build the Prisma `where` clause from the applied filters.
 */
function buildWhere(filters: {
  userId: string;
  weddingId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.weddingId) where.weddingId = filters.weddingId;

  const actionFilter = buildActionFilter(filters.action);
  if (actionFilter !== undefined) where.action = actionFilter;

  // Date range — both bounds inclusive (dateTo is interpreted as end-of-day
  // if no time component, but we accept full ISO 8601 from the client).
  const createdAt: Record<string, Date> = {};
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime())) createdAt.gte = from;
  }
  if (filters.dateTo) {
    // If dateTo is a bare date (YYYY-MM-DD), interpret as end-of-day.
    let to = new Date(filters.dateTo);
    if (
      !Number.isNaN(to.getTime()) &&
      /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)
    ) {
      to = new Date(filters.dateTo + 'T23:59:59.999Z');
    }
    if (!Number.isNaN(to.getTime())) createdAt.lte = to;
  }
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

  if (filters.search) {
    where.details = { contains: filters.search };
  }

  return where;
}

/**
 * Build the Prisma `orderBy` clause from sortBy + sortOrder.
 */
function buildOrderBy(sortBy: SortBy, sortOrder: SortOrder): Record<string, 'asc' | 'desc'> {
  return { [sortBy]: sortOrder };
}

/**
 * CSV cell escaping per RFC 4180: wrap in double quotes if the value contains
 * a comma, double-quote, or newline; escape embedded double-quotes by doubling.
 */
function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Format a Date as YYYY-MM-DD HH:mm:ss (UTC) — matches the UI's display format.
 */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/**
 * Build a CSV export from audit entries.
 * Columns: timestamp, user, action, wedding, ipAddress, details.
 */
function buildCsv(entries: Array<{
  createdAt: Date | string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  user: { email: string; name: string } | null;
  wedding: { coupleLabel: string } | null;
}>): string {
  const header = ['timestamp', 'user', 'action', 'wedding', 'ipAddress', 'details'];
  const rows = entries.map((e) => {
    const ts = e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt);
    return [
      csvEscape(formatTimestamp(ts)),
      csvEscape(e.user ? `${e.user.email}` : ''),
      csvEscape(e.action),
      csvEscape(e.wedding ? e.wedding.coupleLabel : ''),
      csvEscape(e.ipAddress),
      csvEscape(e.details),
    ].join(',');
  });
  return [header.join(','), ...rows].join('\r\n');
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    // ── Parse query params ──
    const { searchParams } = new URL(request.url);
    const filters = {
      userId: searchParams.get('userId')?.trim() || '',
      weddingId: searchParams.get('weddingId')?.trim() || '',
      action: searchParams.get('action')?.trim() || '',
      dateFrom: searchParams.get('dateFrom')?.trim() || '',
      dateTo: searchParams.get('dateTo')?.trim() || '',
      search: searchParams.get('search')?.trim() || '',
    };

    const sortByRaw = (searchParams.get('sortBy')?.trim() || 'createdAt') as SortBy;
    const sortBy: SortBy = (ALLOWED_SORT_BY as readonly string[]).includes(sortByRaw)
      ? sortByRaw
      : 'createdAt';

    const sortOrderRaw = (searchParams.get('sortOrder')?.trim() || 'desc') as SortOrder;
    const sortOrder: SortOrder = (ALLOWED_SORT_ORDER as readonly string[]).includes(sortOrderRaw)
      ? sortOrderRaw
      : 'desc';

    const exportFmtRaw = searchParams.get('export')?.trim().toLowerCase() || '';
    const exportFmt: ExportFormat | null = (
      ALLOWED_EXPORT as readonly string[]
    ).includes(exportFmtRaw)
      ? (exportFmtRaw as ExportFormat)
      : null;

    // ── Rate limit (5/min for exports — they scan the full table) ──
    const rlKey = getRateLimitKey(request);
    const rlMax = exportFmt ? 5 : 30;
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, rlMax, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds ?? 60) },
        }
      );
    }

    // ── Build query ──
    const where = buildWhere(filters);
    const orderBy = buildOrderBy(sortBy, sortOrder);

    // ── Export path: full result set, downloadable file ──
    if (exportFmt) {
      // Cap to EXPORT_MAX_ROWS to protect the server — exports beyond this
      // should be done via a background job (out of scope for P3.12).
      const entries = await unsafePlatformDb.auditLog.findMany({
        where,
        select: AUDIT_SELECT,
        orderBy,
        take: EXPORT_MAX_ROWS,
      });

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-export-${ts}.${exportFmt}`;

      if (exportFmt === 'csv') {
        const csv = buildCsv(entries);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
            'X-Export-Row-Count': String(entries.length),
            'X-Export-Truncated': entries.length >= EXPORT_MAX_ROWS ? '1' : '0',
          },
        });
      }

      // JSON export — pretty-printed array (no pagination wrapper).
      const json = JSON.stringify(entries, null, 2);
      return new NextResponse(json, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
          'X-Export-Row-Count': String(entries.length),
          'X-Export-Truncated': entries.length >= EXPORT_MAX_ROWS ? '1' : '0',
        },
      });
    }

    // ── Normal paginated path ──
    const page = parseIntParam(searchParams.get('page'), 1, 1, 100_000);
    const limit = parseIntParam(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      unsafePlatformDb.auditLog.findMany({
        where,
        select: AUDIT_SELECT,
        orderBy,
        skip,
        take: limit,
      }),
      unsafePlatformDb.auditLog.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      entries,
      total,
      page,
      limit,
      totalPages,
      filters: {
        userId: filters.userId,
        weddingId: filters.weddingId,
        action: filters.action,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        sortBy,
        sortOrder,
      },
    });
  } catch (err) {
    logger.error('audit-list failed', { err: err instanceof Error ? err.message : String(err) });
    return internalError();
  }
}
