// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/impersonate/stop/route.ts — Phase 4C View-as / Impersonate (STOP)
// ══════════════════════════════════════════════════════════════════════════════
//
// POST /api/platform/impersonate/stop
//
// Body: (empty)
//
// Restores the original admin's session by:
//   1. Reading the `impersonation_session` cookie (signed JWT).
//   2. Verifying its signature. If invalid / missing → 400 (no active
//      impersonation to stop).
//   3. Reading the embedded `originalToken` (the admin's auth_token JWT).
//   4. Setting `auth_token` back to the originalToken.
//   5. Clearing the `impersonation_session` cookie.
//   6. Writing an audit-log entry: action='impersonate.stop'.
//   7. Returning `{ success: true, redirectUrl: '/platform/admin' }`.
//
// NOTE: this endpoint accepts the request even if the impersonation has
// expired (the 30-min window has elapsed) — the user might click "Arrêter"
// in the banner right after expiry, before the middleware's auto-cleanup
// has run. We still restore the originalToken and clear the cookie. The
// audit log records the stop action with `result: 'SUCCESS'` regardless.
//
// NOTE on auth: we do NOT call `requirePlatformAdmin` here, because the
// `auth_token` cookie currently contains the TARGET user's JWT (a
// wedding-admin role), not the admin's. We instead authenticate via the
// `impersonation_session` cookie itself: if it's signed with our secret
// and contains a valid `adminUserId`, that's proof the caller is the
// admin who started the session (or someone who hijacked the admin's
// browser session — which is the same threat model as the rest of the
// auth system). This is the same pattern as /api/platform/logout (which
// trusts the auth_token cookie as proof of identity).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyImpersonationToken,
  setAuthCookie,
  clearImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
} from '@/lib/auth';
import { withSecurityHeaders } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

export async function POST(request: NextRequest) {
  try {
    // ── 1. Read the impersonation_session cookie ────────────────────────
    const impersonationToken = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!impersonationToken) {
      return badRequest("Aucune session d'impersonation active");
    }

    // ── 2. Verify the JWT signature (ignoreExpiration so we can still
    //      restore the originalToken after the 30-min window has elapsed). ──
    const payload = verifyImpersonationToken(impersonationToken);
    if (!payload) {
      // Invalid signature or malformed — clear the cookie and bail.
      const response = badRequest("Session d'impersonation invalide");
      clearImpersonationCookie(response);
      return response;
    }

    // ── 3. Restore the original admin auth_token ────────────────────────
    // The originalToken was the admin's JWT captured at impersonation start.
    // It has its own 8h expiry — well past the 30-min impersonation window.
    const { originalToken, adminUserId, adminEmail, targetUserId, targetName, targetRole, targetEmail } = payload;

    // ── 4. Write audit log (best-effort — never throws) ─────────────────
    await writeAuditLog({
      weddingId: null, // platform-level event (admin returning to platform)
      userId: adminUserId,
      action: 'impersonate.stop',
      details: `Admin plateforme ${adminEmail} a terminé la session d'impersonation sur ${targetEmail} (${targetRole}).`,
      request,
      result: 'SUCCESS',
      targetUserId,
      targetType: 'USER',
    });

    // ── 5. Set auth_token back to the original + clear impersonation ─────
    const response = NextResponse.json({
      success: true,
      redirectUrl: '/platform/admin',
      stoppedTarget: {
        id: targetUserId,
        name: targetName,
        role: targetRole,
      },
    });
    setAuthCookie(response, originalToken);
    clearImpersonationCookie(response);
    return withSecurityHeaders(response);
  } catch (error) {
    logger.error('impersonate.stop API error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
