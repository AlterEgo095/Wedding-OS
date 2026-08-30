// ══════════════════════════════════════════════════════════════════════════════
// Tenant Context — Phase 2 Multi-Tenant Isolation Layer
// ══════════════════════════════════════════════════════════════════════════════
//
// Provides per-request tenant isolation using Node.js AsyncLocalStorage.
// When a request enters a tenant scope (via runWithTenant), all Prisma queries
// against tenant-scoped models are automatically filtered by weddingId through
// the tenant-scoped Prisma extension (see prisma-extensions/tenant-scoped.ts).
//
// Resolution priority for a request's wedding:
//   1. URL path /w/[slug]            → slug from path
//   2. Header  X-Wedding-Slug        → slug from header (SPA on root /)
//   3. Query   ?wedding=slug         → slug from query
//   4. Auth    user.weddingId        → admin user's wedding
//   5. Default                        → DEFAULT_WEDDING_SLUG (josue-hornella)
//
// The default fallback preserves backward compatibility for the legacy client
// served at "/" — all pre-existing fetches continue to operate on the default
// wedding without modification.

import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest } from 'next/server';
import { isPlatformAdmin, isOrgRole } from './types';

// ─── Lazy db getter (breaks circular import) ─────────────────────────────────
// Cycle was: db.ts → tenant-scoped.ts → tenant-context.ts → db.ts
// `db` is only referenced inside async functions (resolveWeddingBySlug,
// resolveAdminTenant), never at module top-level. We therefore defer the
// dynamic import until first use. After the first call, the promise is cached
// so subsequent calls incur only a single microtask hop (negligible compared
// to a DB round-trip).
let _dbPromise: Promise<typeof import('./db').db> | null = null;
function getDb(): Promise<typeof import('./db').db> {
  if (!_dbPromise) {
    _dbPromise = import('./db').then((m) => m.db);
  }
  return _dbPromise;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Mission 6.0 P1.5 — Tenant scope mode.
 *   - 'wedding'   : the request is scoped to a single wedding (default, legacy)
 *   - 'org'       : the request is scoped to an organization (B2B2C agency model)
 *                  — queries against tenant-scoped models are filtered by
 *                    `weddingId IN (orgWeddingIds)` via the dual-scope extension
 *   - 'platform'  : the request is platform-wide (super admin) — NO auto-scoping,
 *                    caller must use `unsafePlatformDb` for cross-tenant queries
 */
export type TenantScope = 'wedding' | 'org' | 'platform';

export interface TenantContext {
  /** Wedding ID (cuid) — never null when context is active. */
  weddingId: string;
  /** URL slug used to resolve this wedding (e.g. "josue-hornella"). */
  slug: string;
  /** Wedding status snapshot at resolution time (for gating PUBLISHED/DRAFT). */
  status: string;
  /** Plan snapshot at resolution time (for billing limits — Phase 6). */
  plan: string;
  /** Whether this is the default wedding (legacy client at "/"). */
  isDefault: boolean;
  /**
   * Mission 6.0 P1.5 — Organization ID for org-scoped requests.
   * Set when scope === 'org' (the user is an ORG_ADMIN/ORG_MEMBER/ORG_VIEWER
   * operating on a wedding under their org). Carries the wedding's
   * organizationId so assertWeddingAccess can do a sync check.
   */
  organizationId?: string | null;
  /**
   * Mission 6.0 P1.5 — Scope mode (default 'wedding' for backward compat).
   */
  scope?: TenantScope;
}

// ─── AsyncLocalStorage — per-request isolation ────────────────────────────────
// Globally cached to survive Next.js dev mode HMR (which can re-instantiate
// modules, creating a new ALS that the Prisma extension's closure doesn't see).
// Without this, runWithTenant sets context on ALS instance A while the Prisma
// extension reads from ALS instance B → TENANT_FAIL_CLOSED on every request.

// P5.3-2 (audit-F M-14): Always cache ALS in globalThis, including in production.
// Previously this was gated on `NODE_ENV !== 'production'`, which left production
// vulnerable to ALS instance divergence if Next.js hot-reloads a route module
// (the new module would create a fresh ALS that the Prisma extension's closure
// doesn't see → all tenant-scoped queries fail-closed with TENANT_FAIL_CLOSED).
// Caching in globalThis is a no-op when the same module instance is reused
// (the common case) and a safety net when it isn't.
const globalForALS = globalThis as unknown as { __tenantAls?: AsyncLocalStorage<TenantContext> };
const tenantAls: AsyncLocalStorage<TenantContext> =
  globalForALS.__tenantAls ?? new AsyncLocalStorage<TenantContext>();
globalForALS.__tenantAls = tenantAls;

/**
 * Run a function within a tenant context. All Prisma queries against
 * tenant-scoped models inside `fn` (and any awaited continuations) will be
 * automatically filtered by `weddingId` via the tenant-scoped extension.
 *
 * @example
 *   await runWithTenant({ weddingId, slug, ... }, async () => {
 *     const guests = await tenantDb.guest.findMany(); // auto-scoped
 *   });
 */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantAls.run(ctx, fn);
}

/**
 * Get the currently active tenant context, if any.
 * Returns undefined when called outside a runWithTenant() scope — in that
 * case the Prisma extension will NOT auto-inject weddingId (legacy behavior).
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantAls.getStore();
}

/**
 * Get the weddingId of the currently active tenant context.
 * Convenience accessor — throws if no context is active (fail loud).
 */
export function requireTenantWeddingId(): string {
  const ctx = tenantAls.getStore();
  if (!ctx) {
    throw new Error(
      'requireTenantWeddingId() called outside of runWithTenant() — ' +
      'this is a programming bug. Wrap the calling route in runWithTenant().'
    );
  }
  return ctx.weddingId;
}

// ─── Slug → Wedding resolution + cache ────────────────────────────────────────

interface CachedWedding {
  id: string;
  slug: string;
  status: string;
  plan: string;
  isDefault: boolean;
  brideName: string;
  groomName: string;
  coupleLabel: string;
  weddingDate: Date | null;
  venueName: string | null;
  venueCity: string | null;
  /**
   * Mission 6.0 P1.5 — organizationId of the wedding (nullable for legacy
   * weddings not yet attached to an org).
   */
  organizationId: string | null;
  fetchedAt: number;
}

// Mission 6.0 P0.9 — increased from 60s to 300s (5 min) for better hit rate.
// The cache is invalidated on every write (invalidateWeddingCache), so staleness
// is bounded. For 1M guests hitting the same wedding page, this reduces DB
// queries from ~16k/sec to ~3k/sec (5x reduction).
const WEDDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const weddingCache = new Map<string, CachedWedding>();

/**
 * Resolve a wedding by slug with a 60-second in-memory cache.
 * Cache hit avoids a DB round-trip on every request.
 *
 * Returns null if no wedding exists with this slug.
 */
export async function resolveWeddingBySlug(slug: string): Promise<CachedWedding | null> {
  const normalizedSlug = slug.toLowerCase().trim();
  const cached = weddingCache.get(normalizedSlug);
  if (cached && Date.now() - cached.fetchedAt < WEDDING_CACHE_TTL_MS) {
    return cached;
  }

  const db = await getDb();
  const wedding = await db.wedding.findUnique({
    where: { slug: normalizedSlug },
    select: {
      id: true, slug: true, status: true, plan: true, isDefault: true,
      brideName: true, groomName: true, coupleLabel: true,
      weddingDate: true, venueName: true, venueCity: true,
      // Mission 6.0 P1.5 — carry organizationId so assertWeddingAccess can do
      // a sync check for org-scoped users without an extra DB lookup.
      organizationId: true,
    },
  });

  if (!wedding) return null;

  const entry: CachedWedding = { ...wedding, fetchedAt: Date.now() };
  weddingCache.set(normalizedSlug, entry);
  return entry;
}

/**
 * Resolve the default wedding (served at "/" for backward compatibility).
 * Cached like any other wedding.
 */
export async function resolveDefaultWedding(): Promise<CachedWedding> {
  // V4.8 F-04 - DEFAULT_WEDDING_SLUG is now null. The legacy "default wedding"
  // concept is removed to prevent any real wedding from being implicitly
  // selected for unscoped requests. Callers must pass an explicit slug.
  throw new Error(
    'Default wedding disabled (V4.8 F-04). ' +
    'All tenant resolution requires an explicit slug via header, query, or body.'
  );
}

/**
 * Invalidate the wedding cache for a specific slug (or all weddings).
 * Call this after admin updates wedding identity / status / plan so the
 * next request re-fetches fresh data.
 *
 * Mission 6.0 P0.9 — this now busts BOTH cache layers:
 *   1. The in-memory `weddingCache` Map (L1, per-process) — cleared synchronously.
 *   2. The Next.js `unstable_cache` ISR layer (L2, per-wedding tag) — cleared
 *      via `revalidateTag('wedding-{slug}', 'default')` through a dynamic
 *      import of `next/cache`. Dynamic import avoids pulling the server-only
 *      `next/cache` module into non-server contexts (e.g. scripts, tests).
 *
 * The L2 invalidation is best-effort: if `next/cache` is not available
 * (e.g. called outside a Next.js server context), the dynamic import silently
 * fails and only L1 is cleared. The L2 cache has a 5-min fallback revalidate,
 * so staleness is bounded even if the invalidation call is missed.
 */
export function invalidateWeddingCache(slug?: string): void {
  // Layer 1: clear the in-memory L1 cache (synchronous, always works).
  const normalizedSlug = slug?.toLowerCase().trim();
  if (normalizedSlug) {
    weddingCache.delete(normalizedSlug);
  } else {
    weddingCache.clear();
  }

  // Layer 2: bust the Next.js unstable_cache ISR layer via revalidateTag.
  // Best-effort: if next/cache is unavailable, the 5-min fallback revalidate
  // will eventually refresh the cache.
  if (normalizedSlug) {
    import('next/cache')
      .then(({ revalidateTag }) => {
        // Next.js 16: revalidateTag(tag, profile) — 'default' marks the tag's
        // cache entries as stale immediately.
        revalidateTag(`wedding-${normalizedSlug}`, 'default');
      })
      .catch(() => {
        // Non-fatal: L1 cleared, L2 will expire on its own (5 min).
      });
  }
}

// ─── Request → Tenant Context resolution ──────────────────────────────────────

/**
 * Extract the wedding slug from a Next.js request.
 *
 * Priority:
 *   1. X-Wedding-Slug header (set by SPA on root "/" to scope API calls)
 *   2. ?wedding=slug query parameter
 *   3. undefined → caller should fall back to default wedding or auth user
 */
export function extractSlugFromRequest(request: NextRequest): string | undefined {
  const header = request.headers.get('x-wedding-slug');
  if (header && header.trim()) return header.trim().toLowerCase();

  const query = request.nextUrl.searchParams.get('wedding');
  if (query && query.trim()) return query.trim().toLowerCase();

  return undefined;
}

/**
 * Build a TenantContext object from a resolved CachedWedding.
 * Used by route handlers before calling runWithTenant().
 *
 * Mission 6.0 P1.5 — the context now carries `organizationId` and `scope`
 * so downstream code (assertWeddingAccess, dual-scope Prisma extension)
 * can do org-aware checks without an extra DB lookup.
 */
export function buildTenantContext(
  wedding: CachedWedding,
  scope: TenantScope = 'wedding'
): TenantContext {
  return {
    weddingId: wedding.id,
    slug: wedding.slug,
    status: wedding.status,
    plan: wedding.plan,
    isDefault: wedding.isDefault,
    organizationId: wedding.organizationId,
    scope,
  };
}

/**
 * Resolve the tenant context for a public (unauthenticated) request.
 * Falls back to default wedding if no slug is provided.
 *
 * MISSION 5.9.3 P0-1 FIX — `slugOverride` parameter:
 * The frontend SPA correctly sets the `X-Wedding-Slug` header on all
 * tenant-scoped API calls (via `useTenantFetch()` in wedding-context.tsx),
 * so SPA requests resolve to the right tenant. HOWEVER, two real-world
 * entry points bypass the SPA fetch wrapper:
 *
 *   1. POST /api/guest/auth with `{ code, weddingSlug }` in the JSON body
 *      when the guest lands on the ROOT URL (`/?invite=TOKEN`) — the
 *      default-wedding fallback would authenticate them in the wrong tenant.
 *   2. POST /api/guest/rsvp with `{ weddingSlug }` in the body (same issue).
 *
 * The `slugOverride` parameter lets the route handler peek at the body
 * (via `request.clone().json()`) and pass the slug explicitly, taking
 * precedence over the default-wedding fallback. Resolution priority is now:
 *
 *   1. slugOverride (from body — caller must explicitly pass it)
 *   2. X-Wedding-Slug header (SPA fetch wrapper)
 *   3. ?wedding=slug query param
 *   4. DEFAULT_WEDDING_SLUG (legacy root URL backward compat)
 *
 * @returns { context, wedding, error }
 *   - On success: context + wedding are set, error is null
 *   - On unknown slug: context + wedding are null, error is a 404 message
 */
export async function resolvePublicTenant(
  request: NextRequest,
  slugOverride?: string | null
): Promise<{
  context: TenantContext | null;
  wedding: CachedWedding | null;
  error: { status: number; message: string } | null;
}> {
  // P0-1 FIX: explicit slugOverride (from body) takes precedence over header/query.
  // This closes the cross-wedding auth leak where a guest POSTing to /api/guest/auth
  // from the root URL (no header) would be authenticated in the DEFAULT wedding
  // instead of their own — potentially returning a different wedding's guest.
  let slug: string;
  if (slugOverride && slugOverride.trim()) {
    slug = slugOverride.trim().toLowerCase();
  } else {
    const headerOrQuery = extractSlugFromRequest(request);
    // V4.8 F-04 - fail closed when no explicit slug is provided.
    // Previously fell back to DEFAULT_WEDDING_SLUG ('josue-hornella'), which
    // caused unscoped requests (e.g. root URL with no header) to silently
    // authenticate against the wrong (real) wedding.
    if (!headerOrQuery) {
      return {
        context: null,
        wedding: null,
        error: {
          status: 404,
          message: 'No wedding specified. Provide X-Wedding-Slug header, ?wedding= query, or weddingSlug in body.',
        },
      };
    }
    slug = headerOrQuery;
  }
  const wedding = await resolveWeddingBySlug(slug);

  if (!wedding) {
    return {
      context: null,
      wedding: null,
      error: {
        status: 404,
        message: `Wedding "${slug}" not found`,
      },
    };
  }

  // Gate by status — DRAFT weddings are only visible to authenticated admins
  if (wedding.status === 'DRAFT' && !wedding.isDefault) {
    return {
      context: null,
      wedding: null,
      error: {
        status: 404,
        message: `Wedding "${slug}" not found`,
      },
    };
  }

  // SUSPENDED weddings show a holding page (Phase 6 will add billing gating)
  if (wedding.status === 'SUSPENDED') {
    return {
      context: null,
      wedding: null,
      error: {
        status: 403,
        message: `Wedding "${slug}" is currently suspended. Please contact support.`,
      },
    };
  }

  // P5.1 H-UNPUB-1 — UNPUBLISHED weddings' public APIs are blocked.
  // Super Admin can unpublish a wedding (PUBLISHED → UNPUBLISHED) to take it
  // offline intentionally without deleting data. The frontend shows a 410 Gone
  // page (layout.tsx), and /api/* endpoints return 410 to prevent guest data
  // access. Admin routes use resolveAdminTenant (not this function) so the
  // organizer retains full management access via /admin/*.
  if (wedding.status === 'UNPUBLISHED') {
    return {
      context: null,
      wedding: null,
      error: {
        status: 410,
        message: `Wedding "${slug}" is no longer published.`,
      },
    };
  }

  // P5.0 H-ARCH-1 — ARCHIVED weddings' public APIs are blocked.
  // The memorial page (rendered by layout.tsx for non-admin routes) still
  // shows, but /api/* endpoints (guest data, photos, guestbook, QR) return
  // 410 Gone. This prevents guests with valid tokens from fetching fresh
  // data from an archived wedding. Admin routes use resolveAdminTenant
  // (not this function) so organizers retain full management access.
  if (wedding.status === 'ARCHIVED') {
    return {
      context: null,
      wedding: null,
      error: {
        status: 410,
        message: `Wedding "${slug}" has been archived.`,
      },
    };
  }

  return {
    context: buildTenantContext(wedding),
    wedding,
    error: null,
  };
}

/**
 * Resolve the tenant context for an admin/authenticated request.
 *
 * Mission 6.0 P1.4 + P1.5 — now supports 3 access paths:
 *
 *   1. PLATFORM_ADMIN / SUPER_ADMIN: use the X-Wedding-Slug header (or default)
 *      so platform admins can operate on any wedding. scope = 'platform'.
 *   2. ORG_ADMIN / ORG_MEMBER / ORG_VIEWER (org-scoped): use the X-Wedding-Slug
 *      header if provided AND verify the wedding belongs to the user's org.
 *      If no slug is provided, pick the first wedding in the org. scope = 'org'.
 *   3. ORGANIZER / RECEPTION / CONTROLLER (per-wedding): lock to their own
 *      weddingId. The X-Wedding-Slug header is IGNORED. scope = 'wedding'.
 *
 * SECURITY (P0-SEC-4): non-platform-admin users with NO weddingId AND NO
 * organizationId are rejected with 403 (prevents privilege escalation via
 * misconfigured accounts falling through to the platform-admin path).
 *
 * @returns { context, wedding, error }
 */
export async function resolveAdminTenant(
  request: NextRequest,
  user: { role: string; weddingId?: string | null; organizationId?: string | null }
): Promise<{
  context: TenantContext | null;
  wedding: CachedWedding | null;
  error: { status: number; message: string } | null;
}> {
  // ─── Path 1: Platform admin ────────────────────────────────────────────
  if (isPlatformAdmin(user.role)) {
    // V4.8 F-04 - platform admin must pass an explicit slug. No default.
    const extractedSlug = extractSlugFromRequest(request);
    if (!extractedSlug) {
      return {
        context: null,
        wedding: null,
        error: { status: 400, message: 'X-Wedding-Slug header required for platform admin requests.' },
      };
    }
    const slug = extractedSlug;
    const wedding = await resolveWeddingBySlug(slug);
    if (!wedding) {
      return {
        context: null,
        wedding: null,
        error: { status: 404, message: `Wedding "${slug}" not found` },
      };
    }
    return {
      context: buildTenantContext(wedding, 'platform'),
      wedding,
      error: null,
    };
  }

  // ─── Path 2: Org-scoped user (ORG_ADMIN / ORG_MEMBER / ORG_VIEWER) ─────
  // Mission 6.0 P1.4 — org-scoped users access weddings through their org.
  // The X-Wedding-Slug header is RESPECTED (unlike per-wedding roles) because
  // org members can legitimately work on any wedding under their org — but we
  // verify the wedding's organizationId matches the user's before granting.
  if (isOrgRole(user.role)) {
    if (!user.organizationId) {
      return {
        context: null,
        wedding: null,
        error: {
          status: 403,
          message:
            'Votre compte n\u2019est rattach\u00e9 \u00e0 aucune organisation. Contactez un administrateur de la plateforme.',
        },
      };
    }

    const db = await getDb();
    const requestedSlug = extractSlugFromRequest(request);

    if (requestedSlug) {
      // Verify the requested wedding belongs to the user's org.
      const wedding = await db.wedding.findUnique({
        where: { slug: requestedSlug },
        select: {
          id: true, slug: true, status: true, plan: true, isDefault: true,
          brideName: true, groomName: true, coupleLabel: true,
          weddingDate: true, venueName: true, venueCity: true,
          organizationId: true,
        },
      });
      if (!wedding) {
        return {
          context: null,
          wedding: null,
          error: { status: 404, message: `Wedding "${requestedSlug}" not found` },
        };
      }
      if (wedding.organizationId !== user.organizationId) {
        // Cross-org access attempt — return 404 to avoid leaking existence.
        return {
          context: null,
          wedding: null,
          error: { status: 404, message: `Wedding "${requestedSlug}" not found` },
        };
      }
      const cached: CachedWedding = { ...wedding, fetchedAt: Date.now() };
      return {
        context: buildTenantContext(cached, 'org'),
        wedding: cached,
        error: null,
      };
    }

    // No slug provided: pick the first wedding in the user's org.
    const firstWedding = await db.wedding.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, slug: true, status: true, plan: true, isDefault: true,
        brideName: true, groomName: true, coupleLabel: true,
        weddingDate: true, venueName: true, venueCity: true,
        organizationId: true,
      },
    });
    if (!firstWedding) {
      return {
        context: null,
        wedding: null,
        error: {
          status: 403,
          message:
            'Votre organisation n\u2019a pas encore de mariage. Cr\u00e9ez-en un depuis votre espace organisation.',
        },
      };
    }
    const cached: CachedWedding = { ...firstWedding, fetchedAt: Date.now() };
    return {
      context: buildTenantContext(cached, 'org'),
      wedding: cached,
      error: null,
    };
  }

  // ─── Path 3: Per-wedding user (ORGANIZER / RECEPTION / CONTROLLER) ─────
  // Lock to their own weddingId — ignore X-Wedding-Slug header to prevent
  // cross-tenant access. SECURITY (P0-SEC-4): reject if no weddingId.
  if (!user.weddingId) {
    return {
      context: null,
      wedding: null,
      error: {
        status: 403,
        message:
          'Votre compte n\u2019est rattach\u00e9 \u00e0 aucun mariage. Contactez un administrateur de la plateforme.',
      },
    };
  }
  const db = await getDb();
  const wedding = await db.wedding.findUnique({
    where: { id: user.weddingId },
    select: {
      id: true, slug: true, status: true, plan: true, isDefault: true,
      brideName: true, groomName: true, coupleLabel: true,
      weddingDate: true, venueName: true, venueCity: true,
      organizationId: true,
    },
  });
  if (!wedding) {
    return {
      context: null,
      wedding: null,
      error: { status: 403, message: 'Your assigned wedding no longer exists' },
    };
  }
  const cached: CachedWedding = { ...wedding, fetchedAt: Date.now() };
  return {
    context: buildTenantContext(cached, 'wedding'),
    wedding: cached,
    error: null,
  };
}

// ─── Higher-Order route wrappers ──────────────────────────────────────────────
// These wrap a Next.js API route handler so that:
//   1. The tenant context is resolved from the request (header/query/default)
//   2. The handler runs inside runWithTenant() so tenantDb auto-scopes queries
//   3. A 404 is returned if the wedding slug is unknown
//
// Usage:
//   export const GET = withPublicTenant(async (req, ctx) => {
//     const guests = await tenantDb.guest.findMany(); // auto-scoped by ctx.weddingId
//     return NextResponse.json({ guests });
//   });

type Handler<T = unknown> = (req: NextRequest, ctx: TenantContext) => Promise<Response> | Response;

/**
 * Wrap a public (unauthenticated) route handler with tenant context resolution.
 * Uses resolvePublicTenant which gates by wedding status (DRAFT/SUSPENDED).
 *
 * MISSION 5.9.3 P0-1 FIX — accepts an optional `slugOverride` (typically
 * extracted from the request body by the caller) so POST routes that receive
 * `{ weddingSlug }` in the body can resolve the correct tenant even when no
 * `X-Wedding-Slug` header is set (e.g. guest auth from the root URL).
 */
export function withPublicTenant<TParams = unknown>(
  handler: Handler,
  slugOverride?: string | null
): (req: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const { context, error } = await resolvePublicTenant(request, slugOverride);
    if (error || !context) {
      return Response.json(
        { error: error?.message ?? 'Tenant resolution failed' },
        { status: error?.status ?? 500 }
      );
    }
    return runWithTenant(context, () => handler(request, context));
  };
}

/**
 * Wrap an admin (authenticated) route handler with tenant context resolution.
 * Requires the caller to first authenticate the user and pass it in.
 *
 * @example
 *   export const GET = withAdminTenant(async (req, ctx, user) => {
 *     // user.weddingId === ctx.weddingId (or user is SUPER_ADMIN)
 *     ...
 *   });
 *
 *   // In the route file:
 *   const user = await getAuthUser(request);
 *   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   return withAdminTenantHandler(request, user, async (req, ctx) => { ... });
 */
export async function withAdminTenantHandler(
  request: NextRequest,
  user: { role: string; weddingId?: string | null; organizationId?: string | null },
  handler: (req: NextRequest, ctx: TenantContext) => Promise<Response> | Response
): Promise<Response> {
  const { context, error } = await resolveAdminTenant(request, user);
  if (error || !context) {
    return Response.json(
      { error: error?.message ?? 'Tenant resolution failed' },
      { status: error?.status ?? 500 }
    );
  }
  return runWithTenant(context, () => handler(request, context));
}

