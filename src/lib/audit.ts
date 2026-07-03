// ══════════════════════════════════════════════════════════════════════════════
// writeAuditLog — P2-SEC-14 + P2-CQ-7
// ══════════════════════════════════════════════════════════════════════════════
//
// Centralised AuditLog writer. Replaces the 40+ scattered `auditLog.create`
// call sites that never populated ipAddress / userAgent (P1-SEC-12 left half
// of the schema's forensic fields blank).
//
// Contract:
//   - If `weddingId` is provided → writes through `tenantDb.auditLog.create`
//     (the tenant extension auto-injects weddingId). For tenant-scoped audits.
//   - If `weddingId` is null/undefined → writes through `db.auditLog.create`
//     for platform-level events (PLATFORM_ADMIN login, wedding CRUD, etc.).
//   - If `request` is provided, ipAddress + userAgent are extracted via
//     getClientInfo() (already used by guest-access logging). Explicit
//     `ipAddress` / `userAgent` params override the request-derived values
//     (useful for tests + for routes that resolve IP upstream via headers
//     the helper doesn't know about).
//   - NEVER throws — wraps the entire write in try/catch and logs the failure
//     via logger. Audit-log failure must NOT crash the user's request
//     (the action has already happened; the audit trail is best-effort).
//
// Usage:
//   import { writeAuditLog } from '@/lib/audit'
//   await writeAuditLog({
//     weddingId: ctx.weddingId,
//     userId: user.id,
//     action: 'guest.create',
//     details: `Created guest ${guest.id}`,
//     request,
//   })
//   // Platform-level:
//   await writeAuditLog({
//     userId: admin.id,
//     action: 'platform.login',
//     request,
//   })

import type { NextRequest } from 'next/server';
import { db, tenantDb } from './db';
import { getClientInfo } from './guest-auth';
import { logger } from './logger';

export interface WriteAuditLogParams {
  /** Wedding the audit event belongs to. null/undefined → platform-level audit (db, not tenantDb). */
  weddingId?: string | null;
  /** Acting user. null for unauthenticated events (e.g. failed login). */
  userId?: string | null;
  /** Stable machine-readable action code, e.g. `guest.create`, `platform.login`. */
  action: string;
  /** Human-readable details. Truncated by callers if excessively long. */
  details?: string | null;
  /** Request to derive ipAddress + userAgent from. Optional. */
  request?: NextRequest | Request;
  /** Override IP (skips getClientInfo extraction if set). */
  ipAddress?: string | null;
  /** Override User-Agent (skips getClientInfo extraction if set). */
  userAgent?: string | null;
}

/**
 * Write an AuditLog row, populating all 6 forensic fields.
 * Safe to call from any route handler — never throws.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  // ── Resolve IP + User-Agent ───────────────────────────────────────────────
  let ipAddress: string | null = params.ipAddress ?? null;
  let userAgent: string | null = params.userAgent ?? null;

  if (params.request) {
    try {
      const client = getClientInfo(params.request as Request);
      // Only fall back to request-derived values if no explicit override.
      if (ipAddress === null) ipAddress = client.ipAddress ?? null;
      if (userAgent === null) userAgent = client.userAgent ?? null;
    } catch (err) {
      // getClientInfo reads headers — should not throw, but if it does we
      // log and continue rather than failing the audit write entirely.
      logger.warn('writeAuditLog: getClientInfo failed', {
        err: err instanceof Error ? err : new Error(String(err)),
        action: params.action,
      });
    }
  }

  // Normalise empty strings to null — the schema column is String? and
  // empty strings are confusing in audit queries.
  if (ipAddress === '' ) ipAddress = null;
  if (userAgent === '') userAgent = null;

  const weddingId = params.weddingId ?? null;
  const userId = params.userId ?? null;

  const data = {
    weddingId,
    userId,
    action: params.action,
    details: params.details ?? null,
    ipAddress,
    userAgent,
  };

  try {
    // P2-CQ-7: tenant-scoped audit if weddingId is set; platform audit otherwise.
    // The tenantDb extension auto-injects weddingId on create — passing it
    // explicitly here is harmless (the extension will just confirm it matches
    // the active tenant context, or inject it if no context is active).
    if (weddingId) {
      await tenantDb.auditLog.create({ data });
    } else {
      await db.auditLog.create({ data });
    }
  } catch (err) {
    // NEVER crash the request — the audited action has already happened.
    // Log the failure so ops can detect broken audit trails.
    logger.error('writeAuditLog: failed to persist audit log', {
      action: params.action,
      weddingId,
      userId,
      err: err instanceof Error ? err : new Error(String(err)),
    });
  }
}
