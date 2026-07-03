export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken, setCsrfCookie, CSRF_MAX_AGE } from '@/lib/csrf';
import { withSecurityHeaders } from '@/lib/rate-limit';

/**
 * GET /api/csrf-token — issue a CSRF double-submit token.
 *
 * Returns `{ token, expiresIn }` AND sets the matching `csrf_token` cookie
 * (httpOnly=false, sameSite=strict, maxAge=1h) so the client can copy the
 * token into the `X-CSRF-Token` header on subsequent POST/PUT/DELETE calls.
 *
 * The cookie + header pair is verified by `verifyCsrf()` in middleware (see
 * src/middleware.ts) on every state-changing request to /api/** except the
 * unauthenticated entry points listed in CSRF_EXEMPT_PATHS.
 *
 * This endpoint is public (no auth required) — by design, the CSRF token is
 * a random nonce with no PII or auth value. Its only purpose is to prove
 * that the client can read a cookie set by this origin (i.e. the request
 * is same-origin, not cross-site CSRF).
 */
export async function GET(_request: NextRequest) {
  const token = generateCsrfToken();
  const response = NextResponse.json({ token, expiresIn: CSRF_MAX_AGE });
  setCsrfCookie(response, token);
  return withSecurityHeaders(response);
}
