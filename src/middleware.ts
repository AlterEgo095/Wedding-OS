import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyCsrf, CSRF_EXEMPT_PATHS } from '@/lib/csrf'
import { isCustomDomainRequest } from '@/lib/custom-domains'

// Middleware handles:
//   1. HTTPS redirect in production (defense-in-depth)
//   2. Security headers (CSP, X-Frame-Options, etc.)
//   3. CSRF verification on state-changing requests
//   4. Custom domain routing (Slice 5 + P1.10):
//        a. Wedding customDomain  → /w/[slug]   (Slice 5)
//        b. Organization customDomain → /org/[slug]  (P1.10 — white label)
//
// Custom domain routing:
//   When a request arrives on a non-platform domain (e.g. mariage-sophie.fr
//   for a wedding, or agence-mariage.fr for an organization), the middleware
//   resolves it via /api/resolve-domain and rewrites the URL to /w/[slug] or
//   /org/[slug] based on the resolver's `type` field. The result is cached
//   for 5 minutes to avoid repeated API calls.
//
// White-label signal (P1.10):
//   When a custom-domain rewrite happens, the response is tagged with
//   `x-white-label: true`. Server Components can read this header via
//   `headers()` from `next/headers` to:
//     - Hide the AENEWSBanner (the platform marketing CTA — the white-label
//       customer paid to remove AENEWS branding from their domain).
//     - Apply the org's brandColor via the <ThemeInjector> server component.
//   On the default platform domain (wedding.hpph.net) the header is absent
//   and the AENEWSBanner renders normally — backward compatibility preserved.

const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// ─── P5.0 CB-1 — Wedding slug validation cache ────────────────────────────────
// Fixes the soft-404 bug where Next.js 16's layout-level notFound() renders the
// 404 content with HTTP 200 status. The middleware validates the slug BEFORE
// the request reaches the layout and returns a real HTTP 404 if the slug
// doesn't exist or is DRAFT (on non-admin routes).
interface CachedWeddingStatus {
  exists: boolean;
  status: string | null;
  isDefault: boolean;
  expires: number;
}
const slugCache = new Map<string, CachedWeddingStatus>();
const SLUG_CACHE_TTL = 30 * 1000; // 30 seconds

async function checkWeddingSlug(
  slug: string
): Promise<{ exists: boolean; status: string | null; isDefault: boolean }> {
  const cached = slugCache.get(slug);
  if (cached && cached.expires > Date.now()) {
    return { exists: cached.exists, status: cached.status, isDefault: cached.isDefault };
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const res = await fetch(
      `${baseUrl}/api/public/wedding-status?slug=${encodeURIComponent(slug)}`,
      { cache: 'no-store' }
    );
    const data = (await res.json()) as {
      exists: boolean;
      status: string | null;
      isDefault: boolean;
    };
    slugCache.set(slug, {
      exists: data.exists,
      status: data.status,
      isDefault: data.isDefault,
      expires: Date.now() + SLUG_CACHE_TTL,
    });
    return data;
  } catch {
    // On fetch failure, fail open (let the layout handle it)
    return { exists: true, status: 'PUBLISHED', isDefault: false };
  }
}

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mariage introuvable — 404</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf7f2;color:#1a1a1a;padding:1.5rem}
.c{max-width:28rem;text-align:center}
.n{font-size:6rem;color:rgba(26,26,26,0.12);line-height:1;font-weight:700}
h1{font-size:1.75rem;margin-top:0.5rem;margin-bottom:0.5rem}
p{font-size:0.875rem;color:#666;line-height:1.6;margin-bottom:1.5rem}
a{display:inline-flex;align-items:center;gap:0.5rem;padding:0.625rem 1.25rem;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:0.375rem;font-size:0.875rem;font-family:system-ui,sans-serif;min-height:44px}
</style>
</head>
<body>
<div class="c">
<div class="n">404</div>
<h1>Mariage introuvable</h1>
<p>Ce mariage n&rsquo;existe pas, n&rsquo;est pas encore publi&eacute;, ou a &eacute;t&eacute; retir&eacute;. Si vous pensez qu&rsquo;il s&rsquo;agit d&rsquo;une erreur, v&eacute;rifiez l&rsquo;adresse ou contactez les organisateurs.</p>
<a href="/">Retour &agrave; l&rsquo;accueil</a>
</div>
</body>
</html>`;

function notFoundResponse(): NextResponse {
  return new NextResponse(NOT_FOUND_HTML, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// ─── Custom domain cache (Slice 5 + P1.10) ────────────────────────────────────
// Cached entry now carries the resolver `type` so the middleware can dispatch
// to /w/[slug] vs /org/[slug] without a second API call.
interface CachedResolution {
  slug: string | null;
  type: 'wedding' | 'org' | null;
  expires: number;
}
const domainCache = new Map<string, CachedResolution>();
const DOMAIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function resolveCustomDomain(
  host: string
): Promise<{ slug: string | null; type: 'wedding' | 'org' | null }> {
  const normalized = host.toLowerCase().trim().split(':')[0];
  if (!isCustomDomainRequest(normalized)) return { slug: null, type: null };

  // Check cache
  const cached = domainCache.get(normalized);
  if (cached && cached.expires > Date.now()) {
    return { slug: cached.slug, type: cached.type };
  }

  // Fetch from resolve-domain API
  try {
    const res = await fetch(
      `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/resolve-domain?host=${encodeURIComponent(normalized)}`
    );
    const data = (await res.json()) as {
      slug: string | null;
      type: 'wedding' | 'org' | null;
    };
    const slug = data.slug ?? null;
    const type = data.type ?? null;
    domainCache.set(normalized, { slug, type, expires: Date.now() + DOMAIN_CACHE_TTL });
    return { slug, type };
  } catch {
    // Network / parse failure — do NOT cache (so the next request retries).
    return { slug: null, type: null };
  }
}

function isCsrfExempt(pathname: string): boolean {
  const normalized = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
  return CSRF_EXEMPT_PATHS.includes(normalized);
}

// ─── P1.10 helper: tag a rewrite response for white-label mode ───────────────
// Sets `x-white-label: true` on BOTH:
//   1. The downstream REQUEST headers (so Server Components can read it via
//      `headers()` from `next/headers`). This is the canonical Next.js pattern
//      for passing middleware signals to server code — see:
//      https://nextjs.org/docs/app/api-reference/functions/next-response#nextresponserewrew
//   2. The outgoing RESPONSE headers (so the browser + client-side fetch
//      responses can observe it for debugging / client-side feature gating).
//
// On the default platform domain this header is absent (the middleware falls
// through to `NextResponse.next()` below without setting it) — so server
// components can simply check `headers().get('x-white-label') === 'true'`
// to detect white-label mode.
function whiteLabelRewrite(
  request: NextRequest,
  rewriteUrl: URL
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-white-label', 'true');
  const response = NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });
  // Also set on the outgoing response — useful for client-side observability
  // (e.g. fetch() responses can read this header) and for DevTools inspection.
  response.headers.set('x-white-label', 'true');
  return response;
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // ─── Slice 5 + P1.10: Custom domain routing ─────────────────────────────
  // Only for non-API, non-static routes on custom domains.
  // /w/, /org/, and /platform are excluded to avoid double-rewrites.
  const host = request.headers.get('host') || '';
  if (
    isCustomDomainRequest(host) &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/_next/') &&
    !url.pathname.startsWith('/w/') && // don't double-rewrite wedding pages
    !url.pathname.startsWith('/org/') && // don't double-rewrite org pages (P1.10)
    !url.pathname.startsWith('/platform')
  ) {
    const { slug, type } = await resolveCustomDomain(host);
    if (slug && type === 'wedding') {
      // Existing Slice 5 behaviour: rewrite to /w/[slug] + preserve the path
      const rewriteUrl = new URL(
        `/w/${slug}${url.pathname === '/' ? '' : url.pathname}`,
        url
      );
      rewriteUrl.search = url.search;
      // P1.10: tag the request + response so server components can detect
      // white-label mode via `headers().get('x-white-label')`.
      return whiteLabelRewrite(request, rewriteUrl);
    }
    if (slug && type === 'org') {
      // P1.10 NEW: rewrite to /org/[slug] — the org-level white-label landing
      // page (the /org/[slug] route tree is created in P1.8). Until P1.8 ships,
      // this rewrite will resolve to Next.js' default 404 — that's fine because
      // no organizations have customDomain set yet (P1.6 hasn't shipped either).
      const rewriteUrl = new URL(
        `/org/${slug}${url.pathname === '/' ? '' : url.pathname}`,
        url
      );
      rewriteUrl.search = url.search;
      return whiteLabelRewrite(request, rewriteUrl);
    }
    // No match — fall through to normal routing (the request will likely 404
    // since the custom domain doesn't resolve to any entity). We do NOT set
    // x-white-label here because there's no white-label context to honour.
  }

  // ─── P5.0 CB-1 — Wedding slug validation for /w/[slug] routes ────────────
  // Fixes the soft-404 bug where Next.js 16's layout-level notFound() renders
  // 404 content with HTTP 200 status. The middleware validates the slug BEFORE
  // the request reaches the layout and returns a real HTTP 404 if:
  //   1. The slug doesn't exist (unknown wedding)
  //   2. The slug is DRAFT and this is a public (non-admin) route
  // Admin routes (/w/[slug]/admin/*) are allowed through for DRAFT weddings
  // so organizers can configure before publishing.
  const wMatch = url.pathname.match(/^\/w\/([^/]+)/);
  if (wMatch && !url.pathname.startsWith('/api/')) {
    const slug = decodeURIComponent(wMatch[1]);
    const isAdminRoute = url.pathname.includes('/admin');
    const weddingInfo = await checkWeddingSlug(slug);

    if (!weddingInfo.exists) {
      return notFoundResponse();
    }
    if (
      weddingInfo.status === 'DRAFT' &&
      !weddingInfo.isDefault &&
      !isAdminRoute
    ) {
      return notFoundResponse();
    }
    // SUSPENDED and ARCHIVED are handled by the layout (holding/memorial pages)
    // — the middleware only blocks non-existent and DRAFT-public. This keeps
    // the middleware fast (no admin auth check needed) while the layout
    // handles the richer status-based UX.
  }

  // ─── P1-SEC-10: HTTPS redirect in production ──────────────────────────────
  // P5.0: Skip for internal requests (localhost / 127.0.0.1 / 0.0.0.0) so the
  // middleware's own fetch() calls to /api/public/* don't get redirected.
  const isInternalRequest =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '0.0.0.0';
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol === 'http:' &&
    request.headers.get('x-forwarded-proto') !== 'https' &&
    !isInternalRequest
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
