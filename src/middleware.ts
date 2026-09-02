import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyCsrf, CSRF_EXEMPT_PATHS } from '@/lib/csrf'
import { isCustomDomainRequest } from '@/lib/custom-domains'
// Phase 4C — auto-expiry check for impersonation sessions.
// `decodeImpersonationToken` is a pure-JS base64 decode (NO signature
// verification — see the security note on the function). It's safe to call
// from middleware regardless of runtime (Edge or Node).
// Imported from impersonation-edge.ts (NOT auth.ts) to avoid pulling
// node:crypto/node:os into the Edge Runtime.
import {
  decodeImpersonationToken,
  IMPERSONATION_COOKIE_NAME,
  isImpersonationExpired,
} from '@/lib/impersonation-edge'

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

  // P1-3 (sprint P1): 2 tentatives (absorbe les blips transitoires), puis
  // FAIL-CLOSED. Le comportement précédent mentait en cas d'échec interne
  // ("exists: true, status: PUBLISHED"), ce qui rouvrait le trou du soft-404
  // et pouvait servir publiquement un mariage DRAFT pendant un incident.
  // Un échec persistant renvoie désormais exists:false -> vraie 404.
  for (let attempt = 0; attempt < 2; attempt++) {
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
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
  return { exists: false, status: null, isDefault: false };
}

// ─── P3-UX — Organization slug validation cache (public page only) ───────────
// Same soft-404 fix as CB-1, extended to the white-label org page
// (/org/{slug}, exact path): Next.js 16 renders notFound() content with an
// HTTP 200 status, so archived/suspended/unknown orgs were soft-404s.
// Mirrors the wedding resolver: 30s in-memory cache, 2 attempts, then
// FAIL-CLOSED (real 404) — the page keeps its own gate as handler of last
// resort. Admin routes and /org/signup are never gated here.
interface CachedOrgStatus {
  exists: boolean;
  status: string | null;
  expires: number;
}
const orgCache = new Map<string, CachedOrgStatus>();

async function checkOrgSlug(slug: string): Promise<{ exists: boolean; status: string | null }> {
  const cached = orgCache.get(slug);
  if (cached && cached.expires > Date.now()) {
    return { exists: cached.exists, status: cached.status };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const res = await fetch(
        `${baseUrl}/api/public/org-status?slug=${encodeURIComponent(slug)}`,
        { cache: 'no-store' }
      );
      const data = (await res.json()) as { exists: boolean; status: string | null };
      orgCache.set(slug, {
        exists: data.exists,
        status: data.status,
        expires: Date.now() + SLUG_CACHE_TTL,
      });
      return data;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
  return { exists: false, status: null };
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
    // P3-UX: /setup (guided setup wizard, PX-2/PX-6) is a configuration
    // surface like /admin/* — the P2 creation flow redirects fresh DRAFT
    // weddings straight into it. Without this exception the middleware
    // 404'd the wizard's first step for every new wedding (caught live by
    // the P3 E2E). The wizard shell enforces auth client-side and every
    // data API it calls keeps its own gate — fail-closed posture preserved.
    const isAdminRoute =
      url.pathname.includes('/admin') || url.pathname.endsWith('/setup');
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

  // ─── P3-UX — Organization public page: real 404 for unknown / non-ACTIVE ──
  // Exact single-segment match: /org/{slug} ONLY. /org/signup (reserved static
  // segment — caught live by the P3 E2E: the slug check 404'd the signup
  // page), /org/{slug}/admin/* and other sub-routes pass untouched (operators
  // are never locked out), and custom-domain rewrites already returned earlier
  // (white-label path).
  const orgMatch = url.pathname.match(/^\/org\/([^/]+)$/);
  if (orgMatch && orgMatch[1] !== 'signup') {
    const slug = decodeURIComponent(orgMatch[1]);
    const orgInfo = await checkOrgSlug(slug);

    if (!orgInfo.exists || orgInfo.status !== 'ACTIVE') {
      return notFoundResponse();
    }
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
      // 5.8.18 P2-1/P2-3 — structured CSRF error with machine-readable code.
      // The frontend can switch on `code='CSRF_INVALID'` to silently refresh
      // the CSRF token and retry, instead of showing a scary error.
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CSRF_INVALID',
            message: 'Session expirée ou requête invalide. Veuillez réessayer.',
          },
        },
        { status: 403 }
      );
    }
  }

  // ─── Phase 4C — Impersonation session auto-expiry ──────────────────────
  // On EVERY request, check the httpOnly `impersonation_session` cookie.
  // If it's present AND the embedded `expiresAt` has elapsed (30-min hard
  // limit), we auto-cleanup:
  //   1. Restore the `auth_token` cookie from the embedded `originalToken`
  //      (the admin's pre-impersonation JWT — still valid for 8h).
  //   2. Clear the `impersonation_session` cookie.
  //   3. Redirect navigations to /platform/admin?impersonation_expired=1
  //      OR return a 401 JSON for API requests (so the client can re-auth).
  //
  // SECURITY: `decodeImpersonationToken` does NOT verify the JWT signature
  // (Edge runtime doesn't load JWT_SECRET). The originalToken restored
  // here is itself a signed JWT — server-side `getAuthUser()` verifies
  // its signature on the next request. A tampered impersonation_session
  // cookie thus self-DoSes the user (originalToken won't verify →
  // redirected to login) with NO privilege escalation. See the security
  // note on `decodeImpersonationToken` in src/lib/auth.ts.
  //
  // Skip the check entirely for the impersonate endpoints themselves:
  //   - POST /api/platform/impersonate      (start) — sets a NEW cookie
  //   - POST /api/platform/impersonate/stop (stop)  — clears the cookie
  //   - GET  /api/platform/impersonate/status — returns expired state
  // Otherwise the auto-cleanup would race with the stop endpoint (which
  // also clears the cookie + restores the originalToken).
  const isImpersonateRoute =
    url.pathname === '/api/platform/impersonate' ||
    url.pathname === '/api/platform/impersonate/stop' ||
    url.pathname === '/api/platform/impersonate/status';
  if (!isImpersonateRoute) {
    const impersonationCookie = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (impersonationCookie) {
      const payload = decodeImpersonationToken(impersonationCookie);
      if (payload && isImpersonationExpired(payload)) {
        // ── Auto-cleanup: restore + clear + redirect ──────────────────
        // Restore the admin's original auth_token. The originalToken is a
        // signed JWT captured at impersonation start (still valid 8h).
        const restoredResponse = url.pathname.startsWith('/api/')
          ? NextResponse.json(
              { error: "Session d'impersonation expirée", impersonationExpired: true },
              { status: 401 },
            )
          : NextResponse.redirect(
              new URL('/platform/admin?impersonation_expired=1', url),
            );
        restoredResponse.cookies.set('auth_token', payload.originalToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 8 * 60 * 60, // 8h — matches generateToken's JWT expiry
        });
        restoredResponse.cookies.delete(IMPERSONATION_COOKIE_NAME);
        // Preserve the security headers that would otherwise be applied
        // by the `NextResponse.next()` path below.
        restoredResponse.headers.set('X-Content-Type-Options', 'nosniff');
        restoredResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
        restoredResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        return restoredResponse;
      }
      // If payload is null (malformed cookie), let the request through —
      // the stop endpoint + status endpoint will handle cleanup. The
      // auth_token cookie alone is enough for normal auth flow.
    }
  }

  // ─── 5.8.16 P0-01: pass pathname to server components ──────────────────
  // The layout.tsx for /w/[slug] needs to know if the current request is an
  // admin route (/w/[slug]/admin/*) to allow DRAFT weddings through. The old
  // x-invoke-path header is unreliable for direct navigations. We set
  // x-pathname here so `headers().get('x-pathname')` works in server comps.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', url.pathname);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ─── Defense-in-depth security headers ───────────────────────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // ─── P5.3-4 (audit-A + audit-F M-4): Cache-Control + Vary headers ────────
  //
  // Two concerns addressed:
  //
  // 1. CDN cross-wedding contamination (audit-A): without `Vary: Host`, a CDN
  //    could serve a cached response from wedding A (on wedding.hpph.net) to a
  //    visitor of wedding B (on mariage-sophie.fr) if both resolve to the same
  //    /w/[slug] path. Adding `Vary: Host` forces CDNs to keep separate cache
  //    entries per Host header. `Vary: Accept-Encoding` is the standard
  //    companion (prevents serving a Brotli response to a gzip-only client).
  //    `Vary: X-White-Label` ensures white-label vs platform responses are
  //    cached separately (the same wedding renders differently on its custom
  //    domain vs the default platform domain due to ThemeInjector).
  //
  // 2. Authenticated content caching (audit-F M-4): admin routes
  //    (/platform/*, /w/[slug]/admin/*) MUST NOT be cached by any shared cache.
  //    They render user-specific data (admin names, KPIs, audit logs) that must
  //    never leak between users. `Cache-Control: private, no-store,
  //    must-revalidate` is the strongest possible directive.
  //
  // Public wedding pages (/w/[slug] non-admin) use ISR with `revalidate = 300`
  // — Next.js sets appropriate `Cache-Control: s-maxage=300,
  // stale-while-revalidate=300` automatically. We DON'T override that here; we
  // only append Vary headers to make CDN caching safe.
  // P5.3-4 note: Next.js 16 middleware's `headers.append()` for `Vary` does
  // not reliably propagate to the final response (Next.js overwrites Vary with
  // its own RSC-related values: `rsc, next-router-state-tree, ...`). Using
  // `set()` with a comma-joined string ensures our CDN-safety directives are
  // present as a distinct Vary header line (HTTP allows multiple Vary headers;
  // the effective meaning is the union of all values).
  response.headers.set('Vary', 'Host, Accept-Encoding, X-White-Label');

  const isAdminOrAuthRoute =
    url.pathname.startsWith('/platform') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.includes('/admin/') ||
    url.pathname.startsWith('/api/admin') ||
    url.pathname.startsWith('/api/platform') ||
    url.pathname.startsWith('/api/org') ||
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/api/guest/me') ||
    url.pathname.startsWith('/api/onboarding');

  if (isAdminOrAuthRoute) {
    response.headers.set(
      'Cache-Control',
      'private, no-store, must-revalidate'
    );
  }

  return response;
}

export const config = {
  // Apply to all routes EXCEPT static assets (handled by Next.js directly).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|uploads|manifest.json|robots.txt).*)'],
}
