// ══════════════════════════════════════════════════════════════════════════════
// /api/w/share-event/route.ts — Phase 4D (MISSION 5.9.0 §20.6)
// ══════════════════════════════════════════════════════════════════════════════
//
// Public endpoint that records a "wedding share" event in the AuditLog.
// Triggered by the <WhatsAppShare> button (Phase 4D) whenever a guest or
// organizer shares the wedding invitation via WhatsApp. Also accepts
// `email` / `sms` / `copy` channels so future share UIs (email share, copy-
// link, QR-code) can reuse the same endpoint.
//
// CONTRACT
//   POST /api/w/share-event
//   Headers: X-Wedding-Slug: <slug>   (auto-attached by WeddingPageClient's
//                                       fetch interceptor + the admin page's
//                                       fetch interceptor)
//   Body:    { weddingSlug: string,
//              channel:   'whatsapp' | 'email' | 'sms' | 'copy',
//              inviteToken?: string }
//   Returns: 200 { success: true }
//            400 { error: '…' }      (invalid body / missing slug)
//            429 { error: '…' }      (rate-limited — 10 events/IP/minute)
//            500 { error: '…' }      (audit-log write failure — never returned
//                                     to the client; audit failures are
//                                     swallowed per writeAuditLog's contract)
//
// AUTH
//   PUBLIC. Anyone sharing — guest, organizer, anonymous visitor — can log
//   a share event. No CSRF cookie required (added to CSRF_EXEMPT_PATHS).
//   No guest_session required. The X-Wedding-Slug header resolves the
//   tenant via resolvePublicTenant (same path as /api/guest/rsvp +
//   /api/guest/auto-auth).
//
// RATE LIMITING
//   10 share events per IP per minute (in-memory counter via checkRateLimit).
//   Prevents a malicious client from spamming the audit log. The 11th click
//   within the same minute returns 429 — the WhatsApp share UI does NOT
//   block on this response (fire-and-forget), so the user experience is
//   preserved while the audit log stays protected.
//
// AUDIT LOG
//   Writes an AuditLog row with:
//     action:                'wedding.share'
//     details:               'Share via <channel>' (or with token truncated)
//     weddingId:             resolved from the slug (tenant-scoped write)
//     userId:                null (public action — no admin user)
//     ipAddress + userAgent: derived from the request via getClientInfo
//     result:                'SUCCESS'
//     targetType:            'WEDDING'
//     targetResourceId:      the weddingId
//   The inviteToken is NEVER persisted as a free string. If present, it is
//   truncated to its first 8 chars + '***' for forensic identification
//   without leaking the full token.
//
// PRIVACY
//   - The WhatsApp message body is constructed CLIENT-side and goes straight
//     to wa.me. We never receive it.
//   - We log only: weddingSlug, channel, truncated inviteToken (if any),
//     IP, User-Agent, timestamp. No personal data, no recipient info.
//   - Per RGPD: the share event is process-necessary (analytics + abuse
//     prevention) and lawful under legitimate interest (no consent banner
//     required for the data we collect).
// ══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { badRequest, internalError } from '@/lib/api-errors';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_CHANNELS = new Set(['whatsapp', 'email', 'sms', 'copy']);

const RATE_LIMIT_MAX = 10;          // 10 share events
const RATE_LIMIT_WINDOW_MS = 60_000; // per minute per IP

/**
 * Truncate an invite token for safe logging. We keep the first 8 chars so the
 * audit row can be correlated with a specific invitation (forensic value) but
 * the remaining opaque bytes are masked so the audit log itself cannot be used
 * to authenticate as the guest (the truncated tail is the actual entropy).
 */
function truncateTokenForLog(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '***';
  return `${token.substring(0, 8)}***`;
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/w/share-event
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // ─── Resolve the wedding tenant from the X-Wedding-Slug header ────────────
  // resolvePublicTenant returns 404 for unknown slugs, 410 for archived /
  // unpublished, 403 for suspended. The share button should never fire on a
  // DRAFT wedding (the admin wouldn't have a published link to share), but if
  // it does we still want a clean 404 for the audit log.
  const { context, wedding, error: tenantError } = await resolvePublicTenant(request);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
      // ─── Rate limit: 10 share events per IP per minute ────────────────────
      // Uses the shared checkRateLimit (in-memory counter, keyed by IP from
      // x-forwarded-for / x-real-ip). The 429 response includes the canonical
      // French copy so the client can surface it directly if needed.
      //
      // NOTE: we don't need getClientInfo() here — writeAuditLog (called
      // below) derives IP + User-Agent from the request itself, and the rate
      // limit key uses the dedicated getRateLimitKey helper.
      const rateLimitKey = getRateLimitKey(request);
      if (!(await checkRateLimitAsync(`share-event-${rateLimitKey}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)).allowed) {
        return NextResponse.json(
          { error: 'Trop de partages. Veuillez réessayer dans un instant.' },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      }

      // ─── Parse + validate the request body ────────────────────────────────
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return badRequest('Requête invalide.');
      }

      const { channel, inviteToken } = body as {
        channel?: unknown;
        inviteToken?: unknown;
      };

      // The body may also carry `weddingSlug` for redundancy — we ALWAYS trust
      // the server-resolved slug (from the X-Wedding-Slug header) over the
      // client-supplied one to prevent cross-tenant audit-log spoofing. So we
      // ignore body.weddingSlug entirely.

      if (typeof channel !== 'string' || !ALLOWED_CHANNELS.has(channel)) {
        return badRequest('Canal de partage invalide.');
      }

      // inviteToken is optional. If present, must be a string — anything else
      // is a 400 (defensive — the client only ever sends a string or omits it).
      let normalizedToken: string | undefined;
      if (inviteToken !== undefined && inviteToken !== null) {
        if (typeof inviteToken !== 'string') {
          return badRequest('Token d\'invitation invalide.');
        }
        // Cap at a reasonable length to prevent a malicious client from
        // stuffing a 1MB "token" into the audit log. The real encrypted
        // tokens are ~80-120 chars.
        if (inviteToken.length > 256) {
          return badRequest('Token d\'invitation trop long.');
        }
        normalizedToken = inviteToken;
      }

      // ─── Audit log the share event ────────────────────────────────────────
      // writeAuditLog never throws — it wraps the DB write in try/catch and
      // logs the failure via the structured logger. The 200 response is sent
      // regardless of audit-log success so the share UX is never degraded.
      const truncatedToken = normalizedToken
        ? truncateTokenForLog(normalizedToken)
        : '';
      const details = normalizedToken
        ? `Share via ${channel} (token: ${truncatedToken})`
        : `Share via ${channel}`;

      await writeAuditLog({
        weddingId: context.weddingId,
        userId: null, // public action — no admin user
        action: 'wedding.share',
        details,
        request,
        // P5.2 forensic enrichment
        result: 'SUCCESS',
        targetType: 'WEDDING',
        targetResourceId: wedding?.id ?? context.weddingId,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      // P2-SEC-1: NEVER log error.stack — it can leak source paths + secrets
      // captured by async hooks. Log message + name only.
      logger.error('share-event error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return internalError();
    }
  });
}
