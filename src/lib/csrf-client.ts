// ══════════════════════════════════════════════════════════════════════════════
// CSRF client-side helper — P1-SEC-7
// ══════════════════════════════════════════════════════════════════════════════
//
// Client-side companion to src/lib/csrf.ts. Provides:
//   - getCsrfToken(): reads `csrf_token` from document.cookie (the cookie is
//     intentionally httpOnly=false so JS can read it). If absent, fetches a
//     fresh token from /api/csrf-token (which sets the cookie). Caches in
//     memory for the cookie's lifetime (1h).
//   - authedFetch(): thin wrapper around fetch() that:
//       * Calls credentials: 'include' (so the httpOnly auth_token cookie is
//         sent automatically — works with the P1-SEC-3 cookie migration).
//       * On POST/PUT/DELETE/PATCH, fetches the CSRF token and attaches it
//         as the `X-CSRF-Token` header.
//       * Forwards all other options verbatim.
//
// Future: this will be wrapped by src/hooks/use-authed-fetch.ts (Subagent A)
// to add: 401 → redirect-to-login, 403 session-expiry handling, etc. The CSRF
// logic stays here so it can be unit-tested in isolation and reused by both
// the hook and ad-hoc fetch calls.
//
// All functions are client-only — they touch `document` and `window`. Guard
// with `typeof window !== 'undefined'` if importing from a server component.

import { CSRF_COOKIE, CSRF_HEADER } from './csrf';

// In-memory cache of the CSRF token. The cookie maxAge is 1h; we cache for
// 50min to refresh slightly before expiry. A failed CSRF check on a 403
// response will clear this cache (see authedFetch).
let cachedToken: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CSRF_COOKIE}=`));
  return match ? match.split('=').slice(1).join('=') : null;
}

function isCacheFresh(): boolean {
  return cachedToken !== null && Date.now() - cachedAt < CACHE_TTL_MS;
}

/**
 * Get a CSRF token for use in the X-CSRF-Token header.
 *
 * 1. Return the cached token if still fresh.
 * 2. Otherwise, read the `csrf_token` cookie (set by /api/csrf-token or by
 *    the login endpoint).
 * 3. If the cookie is missing, fetch /api/csrf-token (sets the cookie + body).
 *
 * Returns the token, or null if both the cookie and the fetch fail (very
 * unlikely — the fetch will only fail on network errors).
 */
export async function getCsrfToken(): Promise<string | null> {
  if (isCacheFresh()) return cachedToken;

  // Try cookie first (cheap — no network round-trip).
  const cookieToken = readCsrfCookie();
  if (cookieToken) {
    cachedToken = cookieToken;
    cachedAt = Date.now();
    return cookieToken;
  }

  // Cookie missing — fetch a fresh one. /api/csrf-token sets the cookie AND
  // returns the token in the body, so we can use either; we use the body
  // for the immediate return value and let the cookie be set automatically
  // for subsequent requests.
  try {
    const res = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === 'object' &&
      'token' in data &&
      typeof (data as { token: unknown }).token === 'string'
    ) {
      const token = (data as { token: string }).token;
      cachedToken = token;
      cachedAt = Date.now();
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the in-memory CSRF cache. Called when the server rejects a request
 * with 403 "Token CSRF invalide" — the next call to authedFetch will re-fetch
 * a fresh token.
 */
export function invalidateCsrfToken(): void {
  cachedToken = null;
  cachedAt = 0;
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Authenticated + CSRF-protected fetch wrapper.
 *
 * - Always sends credentials: 'include' (the httpOnly auth_token cookie is
 *   attached automatically — required by P1-SEC-3 cookie migration).
 * - For POST/PUT/DELETE/PATCH, fetches a CSRF token via getCsrfToken() and
 *   attaches it as the `X-CSRF-Token` header. On 403 response with the
 *   canonical CSRF error message, invalidates the cached token and retries
 *   once (handles the case where the cookie expired mid-session).
 * - Merges caller-supplied headers (caller headers take precedence — but
 *   setting X-CSRF-Token manually bypasses the automatic refresh, so don't).
 *
 * @example
 *   const res = await authedFetch('/api/guests', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(guest),
 *   });
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const needsCsrf = STATE_CHANGING_METHODS.has(method);

  // Build merged headers.
  const headers = new Headers(init.headers || {});

  // Ensure credentials are included (cookie auth).
  const finalInit: RequestInit = {
    ...init,
    credentials: 'include',
    headers,
  };

  if (needsCsrf) {
    const token = await getCsrfToken();
    if (token && !headers.has(CSRF_HEADER)) {
      headers.set(CSRF_HEADER, token);
    }
  }

  let response = await fetch(input as RequestInfo, finalInit);

  // If we got a CSRF rejection, refresh the token and retry once.
  if (response.status === 403 && needsCsrf) {
    try {
      const body: unknown = await response.clone().json();
      if (
        body &&
        typeof body === 'object' &&
        'error' in body &&
        (body as { error: unknown }).error === 'Token CSRF invalide'
      ) {
        invalidateCsrfToken();
        const freshToken = await getCsrfToken();
        if (freshToken) {
          headers.set(CSRF_HEADER, freshToken);
          response = await fetch(input as RequestInfo, finalInit);
        }
      }
    } catch {
      // response wasn't JSON — return the original 403.
    }
  }

  return response;
}
