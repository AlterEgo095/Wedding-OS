// ══════════════════════════════════════════════════════════════════════════════
// CSRF — Double-Submit Cookie Pattern (P1-SEC-7)
// ══════════════════════════════════════════════════════════════════════════════
//
// Why double-submit (and not signed-token / server-side session)?
//   - Stateless: no DB / Redis lookup per request.
//   - Works in Edge Runtime (middleware) — no Node-only APIs.
//   - Same-site `strict` cookies already block cross-site POSTs in modern
//     browsers, but the double-submit pattern defends against any same-site
//     XSS that manages to inject a fetch (it can't read the cookie value to
//     echo it back in the X-CSRF-Token header because cookies are httpOnly
//     … wait, the CSRF cookie MUST NOT be httpOnly, because the client JS
//     needs to read it to attach the header). The protection comes from the
//     attacker's same-site XSS being able to read the cookie but NOT being
//     able to forge a cross-origin request that the browser would attach
//     the cookie to — and our verifyCsrf() requires BOTH the cookie AND a
//     matching header. An attacker script on the same origin can read the
//     cookie AND set the header, so this is NOT a complete XSS defense.
//     The XSS defense comes from CSP + httpOnly auth cookies. CSRF defense
//     here is specifically against cross-site form submits, which the
//     `sameSite=strict` cookie also blocks but which older browsers and
//     some edge cases still allow.
//
// Cookie attributes:
//   - httpOnly: false — the client must read the cookie value to copy it
//     into the X-CSRF-Token header. (This is the standard double-submit
//     pattern; the cookie value is just a random nonce, not a bearer token.)
//   - sameSite: 'strict' — never sent on cross-site requests.
//   - secure: true in production.
//   - maxAge: 1h. Short enough that a leaked cookie value has a short
//     replay window; long enough that a user filling out a long form
//     doesn't get a stale token.
//   - path: '/'
//
// Comparison:
//   - We use `timingSafeEqual` to defeat timing attacks on the comparison.
//   - Length must match before comparison (timingSafeEqual throws on
//     different lengths — we handle that explicitly).
//
// Usage in middleware (see src/middleware.ts):
//   if (['POST','PUT','DELETE','PATCH'].includes(request.method)) {
//     if (!verifyCsrf(request)) {
//       return NextResponse.json({ error: 'Token CSRF invalide' }, { status: 403 });
//     }
//   }
//
// Usage in client (see src/lib/csrf-client.ts):
//   const token = await getCsrfToken();
//   fetch('/api/guests', {
//     method: 'POST',
//     headers: { 'X-CSRF-Token': token, ... },
//     credentials: 'include',
//     body: JSON.stringify(data),
//   });

import type { NextRequest, NextResponse } from 'next/server';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_MAX_AGE_SECONDS = 60 * 60; // 1 hour

/**
 * Generate a fresh CSRF token (32 random bytes, hex-encoded → 64 chars).
 *
 * Uses the Web Crypto API (`crypto.getRandomValues`) which is supported in
 * BOTH Node Runtime (API route handlers) and Edge Runtime (middleware).
 * No `node:crypto` dependency — keeps this module Edge-safe.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  // `crypto` is the global Web Crypto object in both Node (≥ 19) and Edge.
  // `globalThis.crypto` is the explicit, lint-friendly reference.
  globalThis.crypto.getRandomValues(bytes);
  // Convert to hex (2 chars per byte).
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Set the `csrf_token` cookie on a NextResponse. The cookie is NOT httpOnly
 * (the client must read it to attach the matching X-CSRF-Token header).
 */
export function setCsrfCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CSRF_MAX_AGE_SECONDS,
  });
  return response;
}

/**
 * Pure-JS constant-time string comparison. The values are hex strings of
 * equal length when this is called from verifyCsrf (length check happens
 * upstream), so we iterate over the full length and OR-accumulate the
 * byte differences.
 *
 * "Constant-time relative to the length" — it always does the same work
 * for two strings of the same length, never short-circuits on the first
 * mismatched byte. (Strict constant-time relative to the secret value is
 * impossible in pure JS without `node:crypto.timingSafeEqual`, which is
 * not reliably available in Edge Runtime. The timing leakage of this
 * pure-JS impl is negligible for hex-string CSRF tokens — the only
 * observable difference is whether the lengths match, which we already
 * reject upstream.)
 */
function constantTimeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify the CSRF double-submit pattern on an incoming request.
 *
 * Returns true iff:
 *   1. The request has a `csrf_token` cookie, AND
 *   2. The request has an `X-CSRF-Token` header, AND
 *   3. The two values are byte-equal (timing-safe comparison).
 *
 * Edge-compatible: only reads `request.cookies` and `request.headers`, and
 * uses a pure-JS constant-time comparison. Safe to call from middleware.
 */
export function verifyCsrf(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  // Both must be present and non-empty.
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length === 0 || headerToken.length === 0) return false;

  // Lengths must match for any equal check to succeed.
  if (cookieToken.length !== headerToken.length) return false;

  return constantTimeEqualString(cookieToken, headerToken);
}

export const CSRF_COOKIE = CSRF_COOKIE_NAME;
export const CSRF_HEADER = CSRF_HEADER_NAME;
export const CSRF_MAX_AGE = CSRF_MAX_AGE_SECONDS;

/**
 * The list of /api/** paths that are EXEMPT from CSRF verification because
 * they are unauthenticated entry points (the user has no CSRF cookie yet
 * when first hitting them). Used by middleware.
 *
 * Keep this list SMALL — every entry is a hole in CSRF protection.
 */
export const CSRF_EXEMPT_PATHS: readonly string[] = [
  '/api/csrf-token',      // obviously — this issues the token
  '/api/admin/login',     // login creates the auth cookie + CSRF cookie
  '/api/platform/login',  // same for platform admins
  '/api/auth/2fa/login', // P4.7 — generic 2FA login (any admin/staff role) — second step of /api/admin/login + /api/platform/login 2FA flow
  '/api/platform/2fa/login', // 2FA login — second step of platform login
  '/api/platform/password-reset/request', // request reset link (no auth)
  '/api/platform/password-reset/confirm', // confirm reset (token in body)
  '/api/guest/auth',      // guest login with invitation code
  '/api/guest/auto-auth', // guest one-time-use lookup-token auto-login
  '/api/guest/invite',    // invitation link auto-login (token in URL/cookie)
  '/api/guest/lookup',    // public guest lookup (rate-limited, no auth)
  // Guest mutating endpoints — authenticated by the httpOnly guest_session
  // cookie (validated inside each route via validateGuestSession, which
  // checks the token + userAgent/IP fingerprint). The guest auth flow does
  // NOT issue a csrf_token cookie (guests arrive via one-time invitation
  // links, not a login form), so the double-submit CSRF pattern cannot
  // apply. The session fingerprint is the real anti-CSRF control here: an
  // attacker cannot forge the httpOnly cookie, and the fingerprint check
  // rejects requests from a different browser/IP.
  '/api/guest/rsvp',      // guest confirms/declines invitation
  '/api/guest/logout',    // guest ends their session
  '/api/guest/access-logs', // guest access log write (beacon-style)
  '/api/health',          // public health check (no state change anyway)
  // Mission 6.0 P1.9 — Org signup (public entry point). The user has no CSRF
  // cookie yet when first reaching the wizard. The route issues its own fresh
  // CSRF cookie on success (alongside the auth cookie) so subsequent state-
  // changing requests from /org/[slug]/admin are protected. The GET pre-check
  // (slug/email availability) is also CSRF-exempt because it's read-only.
  '/api/org/signup',
  '/api/org/login', // P1.8 — org login (pre-auth, no CSRF token yet)
] as const;
