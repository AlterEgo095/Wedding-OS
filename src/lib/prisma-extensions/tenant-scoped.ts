// ══════════════════════════════════════════════════════════════════════════════
// Tenant-Scoped Prisma Extension — Phase 2 Anti-Leak Safety Net
// ══════════════════════════════════════════════════════════════════════════════
//
// Wraps the Prisma client to AUTOMATICALLY inject `weddingId` into queries
// against tenant-scoped models, when a tenant context is active (set via
// runWithTenant() from tenant-context.ts).
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
  query: {
    // For each tenant-scoped model, intercept all operations.
    ...Object.fromEntries(
      Array.from(TENANT_SCOPED_MODELS).map((modelName) => [
        // Prisma's $extends query callback uses the lowercase model name
        // as it appears in the PrismaClient (e.g. "guest", "table").
        modelName.charAt(0).toLowerCase() + modelName.slice(1),
        {
          async $allOperations({ operation, args, query }: {
            operation: string;
            args: any;
            query: (args: any) => Promise<any>;
          }) {
            const ctx = getTenantContext();

            // No tenant context — pass through unchanged (legacy compat).
            if (!ctx) {
              return query(args);
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
    ),
  },
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
