import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyCsrf, CSRF_EXEMPT_PATHS } from '@/lib/csrf'
import { isCustomDomainRequest } from '@/lib/custom-domains'

// Middleware handles:
//   1. HTTPS redirect in production (defense-in-depth)
//   2. Security headers (CSP, X-Frame-Options, etc.)
//   3. CSRF verification on state-changing requests
//   4. Custom domain routing (Slice 5): host → /w/[slug] rewrite
//
// Custom domain routing:
//   When a request arrives on a non-platform domain (e.g. mariage-sophie.fr),
//   the middleware resolves it to a wedding slug via /api/resolve-domain and
//   rewrites the URL to /w/[slug]. The result is cached for 5 minutes to
//   avoid repeated API calls.

const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// ─── Custom domain cache (Slice 5) ────────────────────────────────────────────
const domainCache = new Map<string, { slug: string | null; expires: number }>();
const DOMAIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function resolveCustomDomain(host: string): Promise<string | null> {
  const normalized = host.toLowerCase().trim().split(':')[0];
  if (!isCustomDomainRequest(normalized)) return null;

  // Check cache
  const cached = domainCache.get(normalized);
  if (cached && cached.expires > Date.now()) return cached.slug;

  // Fetch from resolve-domain API
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/resolve-domain?host=${encodeURIComponent(normalized)}`);
    const data = await res.json();
    const slug = data.slug ?? null;
    domainCache.set(normalized, { slug, expires: Date.now() + DOMAIN_CACHE_TTL });
    return slug;
  } catch {
    return null;
  }
}

function isCsrfExempt(pathname: string): boolean {
  const normalized = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
  return CSRF_EXEMPT_PATHS.includes(normalized);
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // ─── Slice 5: Custom domain routing ──────────────────────────────────────
  // Only for non-API, non-static routes on custom domains
  const host = request.headers.get('host') || '';
  if (
    isCustomDomainRequest(host) &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/_next/') &&
    !url.pathname.startsWith('/w/') && // don't double-rewrite
    !url.pathname.startsWith('/platform')
  ) {
    const slug = await resolveCustomDomain(host);
    if (slug) {
      // Rewrite to /w/[slug] + preserve the path
      const rewriteUrl = new URL(`/w/${slug}${url.pathname === '/' ? '' : url.pathname}`, url);
      rewriteUrl.search = url.search;
      return NextResponse.rewrite(rewriteUrl);
    }
  }

  // ─── P1-SEC-10: HTTPS redirect in production ──────────────────────────────
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
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  // Apply to all routes EXCEPT static assets (handled by Next.js directly).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|uploads|manifest.json|robots.txt).*)'],
}
