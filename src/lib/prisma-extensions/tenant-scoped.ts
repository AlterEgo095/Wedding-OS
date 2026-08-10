// ══════════════════════════════════════════════════════════════════════════════
// Tenant-Scoped Prisma Extension — Phase 2 Anti-Leak Safety Net
// ══════════════════════════════════════════════════════════════════════════════
//
// Wraps the Prisma client to AUTOMATICALLY inject `weddingId` into queries
// against tenant-scoped models, when a tenant context is active (set via
// runWithTenant() from tenant-context.ts).
//
// ──── Mission 6.0 P1.5 — Dual-Scope Design ────────────────────────────────────
// The TenantContext now carries a `scope` field ('wedding' | 'org' | 'platform')
// and an `organizationId`. The extension STILL filters by `weddingId` regardless
// of scope, because:
//   - 'wedding' scope: user operates on their own wedding (weddingId from user.weddingId)
//   - 'org' scope: org member operates on ONE wedding at a time (weddingId from
//     the X-Wedding-Slug header, verified to belong to their org in resolveAdminTenant)
//   - 'platform' scope: platform admin operates on ONE wedding at a time (weddingId
//     from X-Wedding-Slug header or default)
//
// The "dual-scope" is therefore at the AUTHORIZATION layer (assertWeddingAccess
// in auth.ts checks organizationId for org-scoped users), NOT at the Prisma
// extension layer. The extension's job is unchanged: prevent cross-wedding
// leaks by injecting weddingId into every tenant-scoped query.
//
// For legitimate cross-wedding aggregates (org dashboard, platform dashboard),
// use `unsafePlatformDb` (the raw Prisma client without this extension) with
// explicit `where: { organizationId }` or `where: { id: { in: [...] } }` filters.
//
// ──── Scoping rules ────────────────────────────────────────────────────────────
// | Operation   | Auto-inject? | Reason                                                |
// |-------------|--------------|-------------------------------------------------------|
// | findMany    | YES (where)  | Listing queries — must never leak across tenants     |
// | findFirst   | YES (where)  | Same as findMany                                      |
// | count       | YES (where)  | Stats must be scoped                                  |
// | groupBy     | YES (where)  | Aggregations must be scoped                           |
// | aggregate   | YES (where)  | Same                                                  |
// | create      | YES (data)   | New rows must belong to current tenant                |
// | createMany  | YES (data[]) | Same for batch inserts                                |
// | updateMany  | YES (where)  | Bulk updates must not cross tenants                   |
// | deleteMany  | YES (where)  | Bulk deletes must not cross tenants                   |
// | findUnique  | NO           | Composite unique keys (weddingId_key) would break     |
// | update      | NO           | Same — uses where: { id } or composite key            |
// | delete      | NO           | Same                                                  |
// | upsert      | NO           | Same                                                  |
// ───────────────────────────────────────────────────────────────────────────────
//
// For findUnique / update / delete / upsert, callers MUST explicitly add
// `weddingId` to the `where` clause (or use findFirst instead of findUnique).
// The helper `assertTenantOwned()` below makes this safe and ergonomic.
//
// ──── Backward compatibility ──────────────────────────────────────────────────
// When no tenant context is active (called outside runWithTenant()), the
// extension passes through queries unchanged. This allows legacy code paths
// (e.g. the root "/" page without explicit context) to keep working during
// the migration. Phase 3 will tighten this to throw.

import { Prisma, PrismaClient } from '@prisma/client';
import { getTenantContext } from '../tenant-context';

// Models that are tenant-scoped (every row belongs to exactly one Wedding).
// AuditLog is intentionally NOT in this list — it allows null weddingId for
// platform-level events. AdminUser is also excluded — SUPER_ADMIN has null
// weddingId (platform-wide); other users have a non-null weddingId but their
// queries are typically by-id lookups, not listings.
const TENANT_SCOPED_MODELS = new Set<string>([
  'Guest',
  'Table',
  'Media',
  'EventTimeline',
  'CoupleStory',
  'Settings',
  'GuestSession',
  'GuestAccessLog',
  'Theme',
  'MusicTrack',
  'Invitation',
  'UsageCounter',
  // Phase C — Collection binding is tenant-scoped (1 active binding per wedding).
  'WeddingCollectionBinding',
  // CONS-5-CLIENT-BACKEND — per-wedding client backend entities.
  'Family',
  'GuestGroup',
  'Gift',
  'ProgramItem',
  // P5.3-3 (audit-A P1-ISO-3): GuestbookEntry is wedding-scoped (weddingId is
  // non-null on the model). Previously omitted from this set as a latent risk —
  // no production route used `tenantDb.guestbookEntry.*` outside a tenant
  // context, so the omission was safe in practice. Adding it now closes the
  // latent gap: any future route that forgets runWithTenant() will fail-closed
  // instead of silently querying across all weddings.
  'GuestbookEntry',
]);

// Operations that accept a `where` clause for filtering (read + bulk write).
const WHERE_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'count',
  'groupBy',
  'aggregate',
  'updateMany',
  'deleteMany',
]);

// Operations that accept a `data` payload for inserts.
const DATA_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * The tenant-scoped Prisma client extension.
 *
 * Apply via: `const tenantDb = db.$extends(tenantScopedExtension);`
 */
export const tenantScopedExtension = Prisma.defineExtension({
  name: 'tenant-scoped',
  // P3: The query interceptors are built dynamically (one $allOperations per
  // tenant-scoped model) via Object.fromEntries. Prisma's precise per-model
  // query-extension type (DynamicQueryExtensionArgs) cannot infer the shape of
  // a string-indexed record, so we cast through the official type. The runtime
  // behaviour is unchanged — every tenant-scoped model gets the same
  // weddingId-injecting $allOperations callback.
  query: Object.fromEntries(
    Array.from(TENANT_SCOPED_MODELS).map((modelName) => [
      modelName.charAt(0).toLowerCase() + modelName.slice(1),
      {
        async $allOperations({ operation, args, query }: {
          operation: string;
          args: any;
          query: (args: any) => Promise<any>;
        }) {
          const ctx = getTenantContext();

          // ─── FAIL-CLOSED (P0 multi-tenant security) ─────────────────────────
          // If no tenant context is active, REJECT queries against tenant-scoped
          // models. This is the core multi-tenant isolation guarantee: a route
          // that forgets runWithTenant() must NOT silently query across all
          // tenants.
          //
          // Platform-level operations (wedding CRUD, dashboard stats) that need
          // cross-tenant access must use the explicit `unsafePlatformDb` client
          // (see src/lib/db.ts), which is the raw Prisma client WITHOUT this
          // extension. The `unsafePlatformDb` name makes cross-tenant access
          // visible in code review.
          if (!ctx) {
            throw new Error(
              `TENANT_FAIL_CLOSED: Query against tenant-scoped model "${modelName}" ` +
              `(${operation}) called without a tenant context. ` +
              `Either wrap the calling code in runWithTenant(), or use ` +
              `unsafePlatformDb (from @/lib/db) for legitimate cross-tenant ` +
              `platform operations. ` +
              `This is a security guard — see src/lib/prisma-extensions/tenant-scoped.ts.`
            );
          }

          // Inject weddingId into WHERE clause for filter operations.
          if (WHERE_OPERATIONS.has(operation)) {
            args.where = {
              ...(args.where ?? {}),
              weddingId: ctx.weddingId,
            };
          }

          // Inject weddingId into DATA payload for insert operations.
          if (DATA_OPERATIONS.has(operation)) {
            if (operation === 'create') {
              args.data = {
                ...(args.data ?? {}),
                weddingId: ctx.weddingId,
              };
            } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
              if (Array.isArray(args.data)) {
                args.data = args.data.map((d: any) => ({
                  ...d,
                  weddingId: ctx.weddingId,
                }));
              } else if (args.data && typeof args.data === 'object') {
                // Single-object createMany variant (rare)
                args.data = { ...args.data, weddingId: ctx.weddingId };
              }
            }
          }

          // For findUnique / update / delete / upsert — NO auto-injection.
          // Routes must use findFirst with explicit weddingId, or use the
          // composite unique key (e.g. where: { weddingId_key: { weddingId, key } }).
          return query(args);
        },
      },
    ])
  ) as any,  // P3: Prisma doesn't export a public type for a dynamically-built
            // query-extension record (Object.fromEntries is string-indexed).
            // The runtime behaviour is correct and uniform across models; the
            // cast is internal to this module and doesn't affect callers.
});

// ──── Helper: assert that an entity belongs to the current tenant ─────────────

/**
 * Verify that an entity (looked up by id) belongs to the current tenant.
 * Throws 404-equivalent error if not found or belongs to another wedding.
 *
 * Use this for findUnique / update / delete operations that bypass the
 * extension's auto-injection (because they use `where: { id }`).
 *
 * @example
 *   const guest = await assertTenantOwned('guest', guestId, ctx.weddingId);
 *   // → returns the guest if it belongs to ctx.weddingId, throws otherwise
 */
export async function assertTenantOwned<T extends { id: string; weddingId?: string | null }>(
  model: { findUnique: (args: { where: { id: string } }) => Promise<T | null> },
  id: string,
  weddingId: string
): Promise<T> {
  const entity = await model.findUnique({ where: { id } });
  if (!entity) {
    const err = new Error('Entity not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (entity.weddingId !== weddingId) {
    // Don't reveal that the entity exists in another tenant — return 404
    const err = new Error('Entity not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return entity;
}

// Re-export for convenience
export type TenantScopedPrismaClient = PrismaClient;
