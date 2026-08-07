// ══════════════════════════════════════════════════════════════════════════════
// Prisma PII Encryption Extension — Mission 6.0 P4.6
// ══════════════════════════════════════════════════════════════════════════════
//
// A Prisma client extension that intercepts Guest model queries to
// automatically encrypt PII on write and decrypt PII on read.
//
// ──── Status: DEFINED BUT NOT WIRED IN THIS PHASE ────────────────────────────
// Per the task spec:
//   "Only ADD the extension if it's safe to do so. If extending is risky,
//    just export the helpers and use them manually in the GDPR endpoints
//    (P4.4/P4.5) — that's acceptable for this phase."
//
// The existing `tenantDb` already has `tenantScopedExtension` applied via
// `db.$extends(...)`. Prisma DOES support chaining extensions
// (`db.$extends(ext1).$extends(ext2)`), but doing so on the shared global
// `tenantDb` singleton would affect EVERY query path in the codebase — too
// risky for a single sub-agent push without full QA. The P4.4/P4.5 GDPR
// endpoints therefore use the manual helpers (`encryptGuestPii` /
// `decryptGuestPii` from guest-pii.ts) instead.
//
// This file is EXPORTED and READY to wire when the migration is approved:
//
//   import { PrismaClient } from '@prisma/client';
//   import { tenantScopedExtension } from './prisma-extensions/tenant-scoped';
//   import { withPiiEncryption } from './prisma-extensions/pii-encryption';
//
//   const baseDb = new PrismaClient();
//   const tenantDb = baseDb
//     .$extends(tenantScopedExtension)
//     .$extends(withPiiEncryption);   // ← chain PII extension
//
// The extension is transparent: existing code that doesn't touch PII fields
// continues to work unchanged. The decrypt-on-read path handles BOTH
// `pii:`-prefixed (encrypted) and plaintext (legacy) values.
//
// ──── Operations intercepted ─────────────────────────────────────────────────
// | Operation   | PII handling                                              |
// |-------------|-----------------------------------------------------------|
// | findMany    | decrypt each result row's PII fields                      |
// | findFirst   | decrypt the result row's PII fields (if any)              |
// | findUnique  | same as findFirst                                         |
// | create      | encrypt PII fields in `data` before insert                |
// | createMany  | encrypt PII fields in each row of `data[]` before insert  |
// | update      | encrypt PII fields in `data` before update                |
// | upsert      | encrypt PII fields in `create` + `update` payloads        |
// | updateMany  | encrypt PII fields in `data` before update                |
// | delete/deleteMany | no PII handling (no payload)                        |
// | count/aggregate/groupBy | no PII handling (no payload, no row return)    |
//
// ──── Why a separate extension (not folded into tenant-scoped.ts)? ──────────
// Separation of concerns:
//   - tenant-scoped.ts: SECURITY (multi-tenant isolation — fail-closed).
//   - pii-encryption.ts: COMPLIANCE (GDPR data-at-rest encryption).
// Different change cadence, different test surface, different rollback path.

import { Prisma } from '@prisma/client';
import { encryptGuestPii, decryptGuestPii } from './guest-pii';
import type { GuestPiiField } from './guest-pii';

// The 4 PII fields (mirror of GUEST_PII_FIELDS in guest-pii.ts — duplicated
// here to avoid a circular import: guest-pii.ts → pii-encryption.ts →
// guest-auth.ts → db.ts → prisma-extensions/tenant-scoped.ts →
// tenant-context.ts → db.ts ... and this file imports guest-pii.ts directly,
// which is fine, but we still keep the constant local for clarity).
const PII_FIELDS: readonly GuestPiiField[] = ['phone', 'email', 'personalMessage', 'dietary'] as const;

// Operations that return a single row or array of rows (need decrypt).
const READ_OPS = new Set(['findMany', 'findFirst', 'findUnique']);

// Operations that take a `data` payload (need encrypt).
const WRITE_OPS_DATA = new Set(['create', 'update', 'upsert']);
const WRITE_OPS_DATA_ARRAY = new Set(['createMany', 'createManyAndReturn', 'updateMany']);

// ─── Helper: is this a Guest row? ─────────────────────────────────────────────
// Cheap structural check — a Guest row has at least one PII field as a
// string or null. We don't require all 4 (some queries `select` a subset).
function looksLikeGuestRow(row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  // Must have at least one PII field present (as string or null).
  // `undefined` (field not selected) doesn't count.
  return PII_FIELDS.some((f) => r[f] !== undefined);
}

// ─── Helper: decrypt PII on a single row, in place ───────────────────────────
function tryDecryptRow(row: unknown): unknown {
  if (!looksLikeGuestRow(row)) return row;
  return decryptGuestPii(row as Record<string, unknown>);
}

// ─── Helper: encrypt PII on a write payload ──────────────────────────────────
function tryEncryptPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  // Arrays (createMany data: [...])
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (item && typeof item === 'object') {
        return encryptGuestPii(item as Record<string, unknown>);
      }
      return item;
    });
  }
  // Single object (create/update/upsert data: {...})
  return encryptGuestPii(data as Record<string, unknown>);
}

// ─── Helper: encrypt PII on an upsert payload ────────────────────────────────
// upsert has `{ where, create, update }` — both create and update may carry
// PII fields.
function tryEncryptUpsertPayload(args: Record<string, unknown>): void {
  if (args.create && typeof args.create === 'object') {
    args.create = encryptGuestPii(args.create as Record<string, unknown>);
  }
  if (args.update && typeof args.update === 'object') {
    args.update = encryptGuestPii(args.update as Record<string, unknown>);
  }
}

// ─── The extension ────────────────────────────────────────────────────────────
export const withPiiEncryption = Prisma.defineExtension({
  name: 'pii-encryption',
  query: {
    guest: {
      async $allOperations({ operation, args, query }: {
        operation: string;
        args: any;
        query: (args: any) => Promise<any>;
      }) {
        // ─── WRITE PATH: encrypt PII before sending to DB ────────────────────
        if (WRITE_OPS_DATA.has(operation)) {
          // upsert has nested create/update payloads
          if (operation === 'upsert') {
            tryEncryptUpsertPayload(args as Record<string, unknown>);
          } else if (args.data) {
            args.data = tryEncryptPayload(args.data);
          }
        } else if (WRITE_OPS_DATA_ARRAY.has(operation)) {
          if (args.data) {
            args.data = tryEncryptPayload(args.data);
          }
        }

        // ─── READ PATH: execute the query, then decrypt PII on results ───────
        const result = await query(args);

        if (READ_OPS.has(operation)) {
          if (Array.isArray(result)) {
            return result.map(tryDecryptRow);
          }
          return tryDecryptRow(result);
        }

        // create/update/upsert return the written row — decrypt its PII too
        // so the caller gets back a consistent view (encrypted in DB,
        // decrypted in memory).
        if (WRITE_OPS_DATA.has(operation)) {
          return tryDecryptRow(result);
        }

        return result;
      },
    },
  },
});

// ─── Helper: apply PII extension to an existing Prisma client ────────────────
/**
 * Apply the PII encryption extension to a Prisma client.
 *
 * @example
 *   import { db } from '@/lib/db';
 *   import { withPiiEncryption } from '@/lib/prisma-extensions/pii-encryption';
 *   const piiAwareDb = db.$extends(withPiiEncryption);
 *
 * Note: the returned client is a NEW client (Prisma $extends is immutable).
 * The original `db` is unaffected.
 */
export function applyPiiEncryption<T extends { $extends: (ext: unknown) => T }>(
  client: T
): T {
  return client.$extends(withPiiEncryption);
}
