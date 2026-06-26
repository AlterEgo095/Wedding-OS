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
import { db } from './db';
import { DEFAULT_WEDDING_SLUG } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

// ─── AsyncLocalStorage — per-request isolation ────────────────────────────────

const tenantAls = new AsyncLocalStorage<TenantContext>();

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
  fetchedAt: number;
}

const WEDDING_CACHE_TTL_MS = 60 * 1000; // 60 seconds
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

  const wedding = await db.wedding.findUnique({
    where: { slug: normalizedSlug },
    select: {
      id: true, slug: true, status: true, plan: true, isDefault: true,
      brideName: true, groomName: true, coupleLabel: true,
      weddingDate: true, venueName: true, venueCity: true,
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
  const wedding = await resolveWeddingBySlug(DEFAULT_WEDDING_SLUG);
  if (!wedding) {
    throw new Error(
      `Default wedding "${DEFAULT_WEDDING_SLUG}" not found in DB. ` +
      'Run `bun run scripts/migrate-phase1.ts` to create it.'
    );
  }
  return wedding;
}

/**
 * Invalidate the wedding cache for a specific slug (or all weddings).
 * Call this after admin updates wedding identity / status / plan so the
 * next request re-fetches fresh data.
 */
export function invalidateWeddingCache(slug?: string): void {
  if (slug) {
    weddingCache.delete(slug.toLowerCase().trim());
  } else {
    weddingCache.clear();
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
 */
export function buildTenantContext(wedding: CachedWedding): TenantContext {
  return {
    weddingId: wedding.id,
    slug: wedding.slug,
    status: wedding.status,
    plan: wedding.plan,
    isDefault: wedding.isDefault,
  };
}

/**
 * Resolve the tenant context for a public (unauthenticated) request.
 * Falls back to default wedding if no slug is provided.
 *
 * @returns { context, wedding, error }
 *   - On success: context + wedding are set, error is null
 *   - On unknown slug: context + wedding are null, error is a 404 message
 */
export async function resolvePublicTenant(
  request: NextRequest
): Promise<{
  context: TenantContext | null;
  wedding: CachedWedding | null;
  error: { status: number; message: string } | null;
}> {
  const slug = extractSlugFromRequest(request) ?? DEFAULT_WEDDING_SLUG;
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

  return {
    context: buildTenantContext(wedding),
    wedding,
    error: null,
  };
}

/**
 * Resolve the tenant context for an admin/authenticated request.
 *
 * Priority:
 *   1. If user is SUPER_ADMIN: use the X-Wedding-Slug header (or default)
 *      so platform admins can operate on any wedding.
 *   2. If user has a weddingId: use that wedding's slug (ignore header —
 *      prevents cross-tenant access by non-platform admins).
 *   3. Fallback: default wedding (legacy compat for SUPER_ADMIN without header).
 *
 * @returns { context, wedding, error }
 */
export async function resolveAdminTenant(
  request: NextRequest,
  user: { role: string; weddingId?: string | null }
): Promise<{
  context: TenantContext | null;
  wedding: CachedWedding | null;
  error: { status: number; message: string } | null;
}> {
  // Non-platform admin: lock to their own wedding
  if (user.role !== 'SUPER_ADMIN' && user.weddingId) {
    // Need slug for context — fetch wedding by ID
    const wedding = await db.wedding.findUnique({
      where: { id: user.weddingId },
      select: {
        id: true, slug: true, status: true, plan: true, isDefault: true,
        brideName: true, groomName: true, coupleLabel: true,
        weddingDate: true, venueName: true, venueCity: true,
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
    return { context: buildTenantContext(cached), wedding: cached, error: null };
  }

  // SUPER_ADMIN: respect X-Wedding-Slug header or default
  const slug = extractSlugFromRequest(request) ?? DEFAULT_WEDDING_SLUG;
  const wedding = await resolveWeddingBySlug(slug);
  if (!wedding) {
    return {
      context: null,
      wedding: null,
      error: { status: 404, message: `Wedding "${slug}" not found` },
    };
  }
  return { context: buildTenantContext(wedding), wedding, error: null };
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
 */
export function withPublicTenant<TParams = unknown>(handler: Handler): (req: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const { context, error } = await resolvePublicTenant(request);
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
  user: { role: string; weddingId?: string | null },
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
