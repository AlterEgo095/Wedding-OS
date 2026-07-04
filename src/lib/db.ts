import { PrismaClient } from '@prisma/client'
import { tenantScopedExtension } from './prisma-extensions/tenant-scoped'

// ─── Raw Prisma client ────────────────────────────────────────────────────────
// Use this for:
//   - Platform-level operations (Wedding CRUD, platform admin)
//   - Auth lookups (AdminUser by email/id)
//   - AuditLog writes (weddingId may be null for platform events)
//   - Routes that need to query ACROSS tenants (super-admin dashboards)
//
// WARNING: when using `db` directly against tenant-scoped models (Guest,
// Table, Media, ...), you MUST manually add `weddingId` to all `where`
// clauses to prevent cross-tenant data leaks. Prefer `tenantDb` instead.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  tenantPrisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

// ─── unsafePlatformDb alias ───────────────────────────────────────────────────
// Explicit alias for the raw Prisma client, for code that needs cross-tenant
// access. The name "unsafePlatformDb" makes it visible in code review that a
// query is NOT tenant-scoped. Prefer `db` for platform-level models (Wedding,
// AdminUser, AuditLog) and `tenantDb` for tenant-scoped models (Guest, Table,
// Media, ...). Use `unsafePlatformDb` only when you need to query tenant-scoped
// models ACROSS tenants (e.g. platform dashboard stats counting all guests).
export const unsafePlatformDb = db;

// ─── Tenant-scoped Prisma client ──────────────────────────────────────────────
// Use this for all tenant-scoped operations (Guest, Table, Media, ...).
// When called inside runWithTenant(), it auto-injects `weddingId` into:
//   - findMany, findFirst, count, groupBy, aggregate (where clause)
//   - create, createMany (data payload)
//   - updateMany, deleteMany (where clause)
//
// When called OUTSIDE runWithTenant(), it passes through unchanged
// (backward compatibility during migration).
//
// For findUnique / update / delete / upsert (by id), the extension does
// NOT auto-inject — callers must either:
//   - Use findFirst instead of findUnique (extension will scope it), OR
//   - Add `weddingId` explicitly to the `where` clause
export const tenantDb =
  globalForPrisma.tenantPrisma ??
  (db as PrismaClient).$extends(tenantScopedExtension)

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.tenantPrisma = tenantDb as PrismaClient
}
