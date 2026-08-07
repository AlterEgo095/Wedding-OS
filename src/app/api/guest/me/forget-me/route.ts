// ══════════════════════════════════════════════════════════════════════════════
// GDPR Forget-Me (Right to Erasure) — Mission 6.0 P4.5
// ══════════════════════════════════════════════════════════════════════════════
//
// POST /api/guest/me/forget-me
//   body: { confirm: 'DELETE' }
//
// Anonymizes the authenticated guest's PII. Implements GDPR Article 17
// (right to erasure). The guest row is KEPT (for audit + RSVP stats) but
// all identifying fields are scrubbed.
//
// ──── Auth ──────────────────────────────────────────────────────────────────
// Requires a valid `guest_session` cookie. 401 if not authenticated.
//
// ──── Body validation (Zod) ──────────────────────────────────────────────────
// { confirm: 'DELETE' } — the literal string 'DELETE' must be sent. This
// prevents accidental triggers (e.g. a confused user clicking a button
// labeled "Delete my data" without confirming). 400 if missing or wrong.
//
// ──── What gets anonymized ──────────────────────────────────────────────────
// On the Guest row (via anonymizeGuestPii):
//   - firstName → 'Anonymized'
//   - lastName  → 'User'
//   - displayName, phone, email, personalMessage, dietary, rsvpMessage → null
//   - invitationCode → SHA-256 hash (preserves uniqueness constraint)
//
// ──── Related data ───────────────────────────────────────────────────────────
//   - GuestSession: ALL deleted (session tokens can no longer be used).
//   - GuestAccessLog: KEPT AS-IS (security audit trail — needed for incident
//     investigation. The guestId reference remains valid because the Guest
//     row is preserved).
//   - GuestbookEntry: anonymized (authorName → 'Anonymized', guestId set to
//     null). The messages themselves remain visible (they were published
//     content authored by the guest — erasure right under GDPR Art. 17(3)(a)
//     may not apply if keeping them is necessary for freedom of expression).
//     A stricter future implementation could delete them entirely.
//   - DeliveryJob: KEPT AS-IS (operational records — billing audit trail).
//
// ──── Session invalidation ──────────────────────────────────────────────────
// After forget-me, the guest's session cookie is cleared via Set-Cookie.
// They can no longer access /api/guest/me/* (no valid session token).
// Re-authentication with the original invitationCode is IMPOSSIBLE because
// the code is now hashed and the invitation-link login compares the code
// against the DB's stored value (the hashed form).
//
// ──── Rate limit ────────────────────────────────────────────────────────────
// 1 request / hour / IP. Forget-me is irreversible — the rate limit
// prevents abuse (e.g. a malicious actor with a stolen session token
// anonymizing many guests in parallel).
//
// ──── Audit ──────────────────────────────────────────────────────────────────
// Platform-level audit log: `gdpr.forget_me` with guestId + IP.
// Also logs to GuestAccessLog (wedding-scoped) for the wedding admin.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  validateGuestSession,
  getClientInfo,
  logGuestAccess,
  getGuestCookieName,
} from '@/lib/guest-auth';
import { tenantDb, unsafePlatformDb } from '@/lib/db';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
import { withRateLimit, getRateLimitKey } from '@/lib/rate-limit';
import { apiError, internalError, unauthorized, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { anonymizeGuestPii } from '@/lib/guest-pii';

// ─── Body schema ──────────────────────────────────────────────────────────────
// `confirm` must be the literal string 'DELETE'. This is a typed safety
// check — accidental POSTs (e.g. from a fetch without body, or with
// `confirm: true`) are rejected.
const BodySchema = z.object({
  confirm: z.literal('DELETE'),
});
type ForgetBody = z.infer<typeof BodySchema>;

// ─── Main handler (wrapped in withRateLimit) ─────────────────────────────────
async function forgetMeHandler(request: NextRequest) {
  // ─── 1. Resolve tenant ────────────────────────────────────────────────────
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

      // ─── 3. Parse + validate body ─────────────────────────────────────────
      // `confirm` must be the literal string 'DELETE'. This is a typed safety
      // check — accidental POSTs (e.g. from a fetch without body, or with
      // `confirm: true`) are rejected.
      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return badRequest(
          'Corps de requête invalide. Envoyez { "confirm": "DELETE" } pour confirmer.'
        );
      }
      const parsed = BodySchema.safeParse(rawBody);
      if (!parsed.success) {
        return badRequest(
          'Confirmation requise. Envoyez { "confirm": "DELETE" } pour confirmer l\'anonymisation.'
        );
      }
      // parsed.data.confirm === 'DELETE' is guaranteed by Zod's literal().
      // We don't need to reference it again — validation IS the safety check.

      // ─── 4. Load the guest ────────────────────────────────────────────────
      const existingGuest = await tenantDb.guest.findFirst({
        where: { id: guestId },
      });
      if (!existingGuest) {
        return apiError('Invité non trouvé', 404);
      }

      // ─── 5. Anonymize the Guest row ───────────────────────────────────────
      const anonymized = anonymizeGuestPii(
        existingGuest as unknown as Record<string, unknown>
      );

      // Prisma's update `data` payload accepts partial objects. We pass the
      // anonymized fields explicitly. The anonymizeGuestPii output includes
      // all preserved fields too — Prisma will ignore unchanged values.
      await tenantDb.guest.update({
        where: { id: guestId },
        data: {
          firstName: anonymized.firstName as string,
          lastName: anonymized.lastName as string,
          displayName: anonymized.displayName as string | null,
          phone: anonymized.phone as string | null,
          email: anonymized.email as string | null,
          personalMessage: anonymized.personalMessage as string | null,
          dietary: anonymized.dietary as string | null,
          rsvpMessage: anonymized.rsvpMessage as string | null,
          invitationCode: anonymized.invitationCode as string,
        },
      });

      // ─── 6. Delete GuestSessions (invalidate all logins) ─────────────────
      // The guest can no longer authenticate — the invitationCode is hashed
      // now, so the auth lookup will fail. Sessions are deleted (not just
      // deactivated) to fully purge the session tokens from the DB.
      await tenantDb.guestSession.deleteMany({
        where: { guestId },
      });

      // ─── 7. Anonymize GuestbookEntries ───────────────────────────────────
      // Keep the entries (published content), but unlink from the guest and
      // replace the authorName with 'Anonymized'. The message text remains.
      // (Future: provide a `delete_entries=true` option for full erasure.)
      await tenantDb.guestbookEntry.updateMany({
        where: { guestId },
        data: {
          guestId: null,
          authorName: 'Anonymized',
        },
      });

      // ─── 8. GuestAccessLogs: KEPT AS-IS ──────────────────────────────────
      // Per task spec: keep for security audit / incident investigation.
      // The guestId FK on GuestAccessLog has onDelete: SetNull in the schema,
      // but since the Guest row is PRESERVED (not deleted), the FK stays
      // valid. This is correct behavior — we want the audit trail to remain
      // linked to the (anonymized) guest for incident correlation.

      // ─── 9. Audit logs ────────────────────────────────────────────────────
      // Platform-level audit log (per task spec: use unsafePlatformDb.auditLog.create).
      unsafePlatformDb.auditLog
        .create({
          data: {
            weddingId: context.weddingId,
            userId: null,
            action: 'gdpr.forget_me',
            details: `Guest ${guestId} anonymized their PII (self-service GDPR Art. 17)`,
            ipAddress: clientInfo.ipAddress ?? null,
            userAgent: clientInfo.userAgent ?? null,
          },
        })
        .catch((err) => {
          logger.warn('gdpr.forget_me audit log failed', {
            guestId,
            errMessage: err instanceof Error ? err.message : String(err),
          });
        });

      // Wedding-scoped access log (for the wedding admin's security view).
      logGuestAccess({
        guestId,
        action: 'GDPR_FORGET_ME',
        details: 'Guest anonymized their PII',
        ...clientInfo,
      }).catch(() => {});

      // ─── 10. Build response + clear session cookie ───────────────────────
      // The guest's session is now invalid (sessions deleted, cookie cleared).
      // They will need a new invitationCode to re-authenticate — but the code
      // is hashed, so re-authentication is impossible. This is the intended
      // behavior of forget-me.
      const response = NextResponse.json(
        {
          success: true,
          message: 'Vos données personnelles ont été anonymisées.',
        },
        { status: 200 }
      );

      // Clear the guest_session cookie. Use the same attributes as
      // setGuestSessionCookie (httpOnly, secure in prod, sameSite strict,
      // path '/') so the browser actually deletes it. Setting maxAge: 0
      // (or expires in the past) instructs the browser to remove the cookie.
      const cookieName = getGuestCookieName();
      response.cookies.set(cookieName, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      });

      return response;
    } catch (error) {
      logger.error('gdpr.forget_me error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return internalError();
    }
  });
}

// ─── Rate-limited POST ────────────────────────────────────────────────────────
// 1 request / hour / IP. Forget-me is irreversible — strict limit.
function forgetMeRateLimitKey(request: NextRequest): string {
  return `gdpr-forget-me:${getRateLimitKey(request)}`;
}

export const POST = withRateLimit(1, 60 * 60 * 1000, forgetMeRateLimitKey)(forgetMeHandler);
