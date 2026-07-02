import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Middleware handles:
//   1. HTTPS redirect in production (defense-in-depth; reverse proxy may
//      already enforce this, but we want to be safe if misconfigured).
//   2. Security headers (CSP, X-Frame-Options, etc.) as defense-in-depth
//      alongside the ones set in next.config.ts.
//
// Admin API routes handle their own authentication via getAuthUser() from
// @/lib/auth. The previous implementation used jsonwebtoken in Edge Runtime
// which is not supported, causing all admin API calls to fail with 401.
// Authentication is now handled directly in each API route for reliability.

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
