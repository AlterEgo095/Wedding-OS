// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/impersonate/status/route.ts — Phase 4C View-as / Impersonate (STATUS)
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/platform/impersonate/status
//
// Returns the current impersonation state, used by the wedding-admin page
// to decide whether to render the <ImpersonationBanner>.
//
// Response (200, NOT impersonating):
//   { impersonating: false }
//
// Response (200, impersonating):
//   {
//     impersonating: true,
//     targetUser: { id, name, email, role },
//     adminUser:  { id, email, name },
//     expiresAt:  <epoch-ms>,
//     expiresAtIso: <ISO string>,
//     remainingMs: <ms until expiry>
//   }
//
// Response (200, expired):
//   { impersonating: false, expired: true }
//   (The middleware auto-cleanup will have already redirected, but in case
//   the client polls this endpoint directly, we return expired=true so the
//   banner can show a "session expired" message before the redirect fires.)
//
// NOTE: this endpoint does NOT require auth. The impersonation_session
// cookie is signed and self-contained — if it's present and valid, we
// return the impersonation state. If absent, we return not-impersonating.
// This mirrors the pattern of /api/me (which returns 401 if not authed
// rather than requiring a specific role). The actual auth_token cookie
// during impersonation contains the TARGET's JWT — we don't need to
// verify it here, since the impersonation_session cookie is the source
// of truth for "is this an impersonation session?".

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyImpersonationToken,
  isImpersonationExpired,
  IMPERSONATION_COOKIE_NAME,
} from '@/lib/auth';
import { withSecurityHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { internalError } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!token) {
      return withSecurityHeaders(
        NextResponse.json({ impersonating: false }),
      );
    }

    const payload = verifyImpersonationToken(token);
    if (!payload) {
      // Invalid signature / malformed — treat as not impersonating. The
      // middleware's auto-cleanup will clear the cookie on the next request.
      return withSecurityHeaders(
        NextResponse.json({ impersonating: false, invalid: true }),
      );
    }

    if (isImpersonationExpired(payload)) {
      // Expired — the middleware will handle the auto-cleanup on the next
      // navigation, but we surface the expired state so the banner can
      // display a transient message before the redirect.
      return withSecurityHeaders(
        NextResponse.json({
          impersonating: false,
          expired: true,
          targetUser: {
            id: payload.targetUserId,
            name: payload.targetName,
            email: payload.targetEmail,
            role: payload.targetRole,
          },
        }),
      );
    }

    return withSecurityHeaders(
      NextResponse.json({
        impersonating: true,
        targetUser: {
          id: payload.targetUserId,
          name: payload.targetName,
          email: payload.targetEmail,
          role: payload.targetRole,
        },
        adminUser: {
          id: payload.adminUserId,
          email: payload.adminEmail,
        },
        expiresAt: payload.expiresAt,
        expiresAtIso: new Date(payload.expiresAt).toISOString(),
        remainingMs: Math.max(0, payload.expiresAt - Date.now()),
      }),
    );
  } catch (error) {
    logger.error('impersonate.status API error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
