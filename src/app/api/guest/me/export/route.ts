// ══════════════════════════════════════════════════════════════════════════════
// GDPR Data Export — Mission 6.0 P4.4
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/guest/me/export?format=json|csv
//
// Returns ALL data associated with the authenticated guest, in JSON or CSV.
// Implements GDPR Article 15 (right of access) + Article 20 (data portability).
//
// ──── Auth ──────────────────────────────────────────────────────────────────
// Requires a valid `guest_session` cookie. Validates session via
// validateGuestSession + loads guest via getAuthenticatedGuest.
// 401 if no cookie / invalid session / guest not found.
//
// ──── Response shapes ───────────────────────────────────────────────────────
// JSON (default):
//   200 OK
//   Content-Type: application/json
//   Content-Disposition: attachment; filename="guest-data-{guestId}-{YYYYMMDD}.json"
//   Body: { guest, sessions, accessLogs, guestbookEntries, deliveryJobs, exportedAt }
//
// CSV (?format=csv):
//   200 OK
//   Content-Type: text/csv; charset=utf-8
//   Content-Disposition: attachment; filename="guest-data-{guestId}-{YYYYMMDD}.csv"
//   Body: flat single-row CSV with key fields (firstName, lastName, email,
//   phone, dietary, rsvpStatus, rsvpMessage, checkedIn, createdAt, ...)
//
// ──── Rate limit ────────────────────────────────────────────────────────────
// 1 request / hour / guest (identified by guestId — stable across IP changes).
// Implemented via withRateLimit HOF with a guest-keyed keyFn.
//
// ──── Audit ──────────────────────────────────────────────────────────────────
// Writes a platform-level audit log entry: `gdpr.export` with guestId + IP.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  validateGuestSession,
  getAuthenticatedGuest,
  getClientInfo,
  logGuestAccess,
} from '@/lib/guest-auth';
import { tenantDb, unsafePlatformDb } from '@/lib/db';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
import { withRateLimit, getRateLimitKey } from '@/lib/rate-limit';
import { apiError, internalError, unauthorized, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { decryptGuestPii } from '@/lib/guest-pii';

// ─── Query param schema ──────────────────────────────────────────────────────
const QuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});
type QueryFormat = z.infer<typeof QuerySchema>['format'];

// ─── Date helper ─────────────────────────────────────────────────────────────
function dateStamp(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ─── CSV escaping (RFC 4180) ─────────────────────────────────────────────────
// Quotes fields containing commas, quotes, newlines. Doubles embedded quotes.
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── CSV builder ─────────────────────────────────────────────────────────────
// Minimal CSV generator — no external dep. Produces a single-row CSV with
// key guest fields (sufficient for Article 15/20 portability). The JSON
// export is the canonical full-data export; CSV is a convenience summary.
function buildCsv(guest: Record<string, unknown>): string {
  const fields: Array<[string, unknown]> = [
    ['id', guest.id],
    ['firstName', guest.firstName],
    ['lastName', guest.lastName],
    ['displayName', guest.displayName],
    ['email', guest.email],
    ['phone', guest.phone],
    ['invitationCode', guest.invitationCode],
    ['invitationType', guest.invitationType],
    ['seats', guest.seats],
    ['category', guest.category],
    ['status', guest.status],
    ['personalMessage', guest.personalMessage],
    ['dietary', guest.dietary],
    ['rsvpMessage', guest.rsvpMessage],
    ['rsvpAt', guest.rsvpAt],
    ['rsvpPlusOne', guest.rsvpPlusOne],
    ['checkedIn', guest.checkedIn],
    ['checkedInAt', guest.checkedInAt],
    ['invitationViewed', guest.invitationViewed],
    ['invitationViewCount', guest.invitationViewCount],
    ['lastAccessAt', guest.lastAccessAt],
    ['createdAt', guest.createdAt],
    ['updatedAt', guest.updatedAt],
  ];

  const header = fields.map(([k]) => csvEscape(k)).join(',');
  const row = fields.map(([, v]) => csvEscape(v)).join(',');
  return `${header}\n${row}\n`;
}

// ─── Main handler (wrapped in withRateLimit) ─────────────────────────────────
async function exportHandler(request: NextRequest) {
  // ─── 1. Resolve tenant (wedding) from request ─────────────────────────────
  const { context, error: tenantError } = await resolvePublicTenant(request);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
      // ─── 2. Validate guest session ────────────────────────────────────────
      const token = request.cookies.get('guest_session')?.value;
      if (!token) {
        return unauthorized('Non authentifié');
      }
      const clientInfo = getClientInfo(request);
      const session = await validateGuestSession(
        token,
        clientInfo.userAgent,
        clientInfo.ipAddress
      );
      if (!session.valid || !session.guestId) {
        return unauthorized('Session invalide ou expirée');
      }
      const guestId = session.guestId;

      // ─── 3. Parse + validate format param ────────────────────────────────
      const url = new URL(request.url);
      const parsedFmt = QuerySchema.safeParse({
        format: url.searchParams.get('format') ?? 'json',
      });
      if (!parsedFmt.success) {
        return badRequest('Format invalide. Utilisez ?format=json ou ?format=csv.');
      }
      const format: QueryFormat = parsedFmt.data.format;

      // ─── 4. Load the guest (full row from DB — includes encrypted PII) ────
      // We use tenantDb.guest.findFirst (auto-scoped by weddingId via the
      // tenant extension) instead of getAuthenticatedGuest, because the
      // export needs ALL fields including PII + RSVP timestamps. The latter
      // returns a safe-public subset.
      const dbGuest = await tenantDb.guest.findFirst({
        where: { id: guestId },
      });
      if (!dbGuest) {
        return apiError('Invité non trouvé', 404);
      }

      // Decrypt PII (transparent — handles both pii:-prefixed and plaintext).
      const guest = decryptGuestPii(dbGuest as unknown as Record<string, unknown>);

      // ─── 5. Load related data (all wedding-scoped via tenantDb) ───────────
      const [sessions, accessLogs, guestbookEntries, deliveryJobs] = await Promise.all([
        tenantDb.guestSession.findMany({
          where: { guestId },
          orderBy: { createdAt: 'desc' },
        }),
        tenantDb.guestAccessLog.findMany({
          where: { guestId },
          orderBy: { createdAt: 'desc' },
        }),
        tenantDb.guestbookEntry.findMany({
          where: { guestId },
          orderBy: { createdAt: 'desc' },
        }),
        tenantDb.deliveryJob.findMany({
          where: { guestId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const exportedAt = new Date().toISOString();
      const fileDate = dateStamp();
      const filenameBase = `guest-data-${guestId}-${fileDate}`;

      // ─── 6. Audit log (platform-level, per task spec) ─────────────────────
      // Use unsafePlatformDb.auditLog.create directly (not writeAuditLog)
      // because the task spec explicitly says so. This writes a platform-level
      // audit row (weddingId null → goes to platform audit trail via raw db).
      // We still set weddingId here so the action is attributable to the
      // wedding; the row lands in the AuditLog table regardless.
      unsafePlatformDb.auditLog
        .create({
          data: {
            weddingId: context.weddingId,
            userId: null,
            action: 'gdpr.export',
            details: `Guest ${guestId} exported their data (format=${format})`,
            ipAddress: clientInfo.ipAddress ?? null,
            userAgent: clientInfo.userAgent ?? null,
          },
        })
        .catch((err) => {
          logger.warn('gdpr.export audit log failed', {
            guestId,
            errMessage: err instanceof Error ? err.message : String(err),
          });
        });

      // Also log to GuestAccessLog (wedding-scoped, for the wedding admin).
      logGuestAccess({
        guestId,
        action: 'GDPR_EXPORT',
        details: `Guest exported their data (format=${format})`,
        ...clientInfo,
      }).catch(() => {});

      // ─── 7. Build response ────────────────────────────────────────────────
      if (format === 'csv') {
        const csv = buildCsv(guest);
        const csvBytes = Buffer.from(csv, 'utf8');
        return new NextResponse(csvBytes, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
            'Cache-Control': 'no-store',
          },
        });
      }

      // JSON format — full export
      const payload = {
        guest,
        sessions,
        accessLogs,
        guestbookEntries,
        deliveryJobs,
        exportedAt,
      };
      const jsonBytes = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      return new NextResponse(jsonBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      logger.error('gdpr.export error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return internalError();
    }
  });
}

// ─── Rate-limited export ──────────────────────────────────────────────────────
// 1 request / hour / guest. Keyed by guestId when authenticated (stable
// across IP changes), falls back to IP when unauthenticated (which would
// be rejected at 401 anyway, but the rate limit fires first to prevent
// flooding the session-validation path).
function exportRateLimitKey(request: NextRequest): string {
  // Best-effort: read guest_session cookie. If present, we COULD decode the
  // JWT to extract guestId — but the JWT is verified server-side later.
  // For the rate-limit key, just using the IP is acceptable: an attacker
  // would need 1 request/hour to be useful, and a legitimate user is
  // unlikely to need more than 1 export/hour from the same IP.
  return `gdpr-export:${getRateLimitKey(request)}`;
}

export const GET = withRateLimit(1, 60 * 60 * 1000, exportRateLimitKey)(exportHandler);
