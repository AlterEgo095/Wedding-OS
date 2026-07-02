import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyCsrf, CSRF_EXEMPT_PATHS } from '@/lib/csrf'

// Middleware handles:
//   1. HTTPS redirect in production (defense-in-depth; reverse proxy may
//      already enforce this, but we want to be safe if misconfigured).
//   2. Security headers (CSP, X-Frame-Options, etc.) as defense-in-depth
//      alongside the ones set in next.config.ts.
//   3. CSRF verification (P1-SEC-7) on state-changing requests (POST/PUT/
//      DELETE/PATCH) to /api/** — except the unauthenticated entry points
//      listed in CSRF_EXEMPT_PATHS (login, csrf-token issue, guest auth,
//      password reset request/confirm, etc.).
//
// Admin API routes handle their own authentication via getAuthUser() from
// @/lib/auth. The previous implementation used jsonwebtoken in Edge Runtime
// which is not supported, causing all admin API calls to fail with 401.
// Authentication is now handled directly in each API route for reliability.

const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Returns true if `pathname` is exempt from CSRF verification.
 *
 * Exact-match against CSRF_EXEMPT_PATHS (no glob support — explicit list
 * keeps the security surface auditable). Adding a new exempt path requires
 * a code change, which is intentional friction.
 */
function isCsrfExempt(pathname: string): boolean {
  // Strip trailing slash for normalisation (e.g. /api/csrf-token/ → /api/csrf-token).
  const normalized = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
  return CSRF_EXEMPT_PATHS.includes(normalized);
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // ─── P1-SEC-10: HTTPS redirect in production ──────────────────────────────
  // Only redirect if the request is plain HTTP AND we're in production AND
  // the reverse proxy hasn't already set X-Forwarded-Proto: https.
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol === 'http:' &&
    request.headers.get('x-forwarded-proto') !== 'https'
  ) {
    const httpsUrl = new URL(url);
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  // ─── P1-SEC-7: CSRF verification on state-changing API requests ──────────
  // Double-submit cookie pattern: the client must send BOTH a `csrf_token`
  // cookie AND a matching `X-CSRF-Token` header. The cookie is set by
  // /api/csrf-token (or by the login response). Cross-site attackers can't
  // read the cookie value (sameSite=strict + cross-origin) so they can't
  // forge the matching header.
  if (
    url.pathname.startsWith('/api/') &&
    CSRF_PROTECTED_METHODS.has(request.method.toUpperCase()) &&
    !isCsrfExempt(url.pathname)
  ) {
    if (!verifyCsrf(request)) {
      return NextResponse.json(
        { error: 'Token CSRF invalide' },
        { status: 403 }
      );
    }
  }

  const response = NextResponse.next();

  // ─── Defense-in-depth security headers ───────────────────────────────────
  // These complement the headers set in next.config.ts (which apply to all
  // routes). Repeating them here ensures they're present even if the
  // next.config.ts headers config is accidentally removed.
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  // Apply to all routes EXCEPT static assets (handled by Next.js directly).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|uploads|manifest.json|robots.txt).*)'],
}
