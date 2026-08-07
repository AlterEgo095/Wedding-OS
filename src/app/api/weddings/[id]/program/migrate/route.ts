export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { apiSuccess, apiError, internalError, unauthorized, forbidden } from '@/lib/api-errors';
import { withRateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  migrateEventTimelineToProgramItem,
  type ProgramMergeDb,
} from '@/lib/wedding/program-merge';

// ══════════════════════════════════════════════════════════════════════════════
// Mission 6.0 — P4.3 — /api/weddings/[id]/program/migrate
// ══════════════════════════════════════════════════════════════════════════════
//
// POST /api/weddings/{id}/program/migrate
//   → 200 { migrated: number, errors: string[], totalEventTimeline: number }
//
// Triggers a one-way migration of all unmigrated EventTimeline rows for the
// given wedding into ProgramItem (the canonical going-forward model). Rows
// that have already been migrated (EventTimeline.migratedToProgramItemId IS
// NOT NULL) are skipped — the operation is idempotent and safe to call
// multiple times.
//
// Authorisation: PLATFORM_ADMIN only. ORGANIZERs cannot trigger migrations
// (migration is a one-time-per-wedding administrative operation; the audit
// trail needs to be platform-level).
//
// Audit: a single `program.migrate` audit-log entry is written via
// `writeAuditLog` (which routes to the appropriate DB internally based on
// whether weddingId is provided). The per-row migrations are atomic
// $transactions inside the helper (each row's ProgramItem.create +
// EventTimeline.update commit or roll back together), but the overall
// migration is NOT wrapped in a single transaction — a failure on row N
// does not roll back rows 1..N-1, which is the desired behaviour for a
// long-running migration (a 500-row migration should not fail atomically
// because row 499 had an unparseable time string).
// ══════════════════════════════════════════════════════════════════════════════

// Validate the wedding id URL param. Accepts cuid-shaped strings (24+ chars,
// lowercase alphanumeric). This guards against injection via path params.
const weddingIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

async function migrateHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // ─── Resolve + validate URL params ──────────────────────────────────────
  const { id: weddingId } = await params;
  const idParsed = weddingIdSchema.safeParse(weddingId);
  if (!idParsed.success) {
    return apiError('Identifiant de mariage invalide', 400);
  }

  // ─── Auth: PLATFORM_ADMIN only ──────────────────────────────────────────
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  const denied = requirePlatformAdmin(user);
  if (denied) {
    return forbidden('Réservé aux administrateurs de la plateforme');
  }

  try {
    // ─── Verify the wedding exists (platform DB, not tenant-scoped) ───────
    const wedding = await db.wedding.findUnique({
      where: { id: idParsed.data },
      select: { id: true, slug: true, coupleLabel: true },
    });
    if (!wedding) {
      return apiError('Mariage introuvable', 404);
    }

    // ─── Count total EventTimeline rows for context (pre-migration) ──────
    // Use `db` (raw client) with explicit weddingId filter — the tenantDb
    // extension has a TS regression post-P3 prisma client regen. Same
    // pattern as /api/weddings/[id]/program/route.ts.
    const totalEventTimeline = await db.eventTimeline.count({
      where: { weddingId: wedding.id },
    });

    // ─── Run the migration ────────────────────────────────────────────────
    // We pass the global `tenantDb` (the extended client with the tenant-
    // scoped auto-inject extension). The helper always passes `weddingId`
    // explicitly in WHERE clauses, so the call is safe inside or outside
    // runWithTenant(). We do NOT wrap this in runWithTenant because the
    // PLATFORM_ADMIN's request may not resolve a tenant context (platform
    // admins have no weddingId), and the helper's explicit weddingId filter
    // is sufficient.
    const result = await migrateEventTimelineToProgramItem(
      wedding.id,
      tenantDb as unknown as ProgramMergeDb,
    );

    // ─── Audit log (platform-wide via writeAuditLog) ─────────────────────
    // The audit action is `program.migrate` (lowercase dotted — the new
    // Mission 6.0 naming convention for domain events, see P3 audit work).
    // The legacy `CREATE_PROGRAM_ITEM` / `UPDATE_PROGRAM_ITEM` codes are
    // used by the original program route handlers (kept for backward compat
    // with existing audit dashboards).
    try {
      await writeAuditLog({
        weddingId: wedding.id,
        userId: user.id,
        action: 'program.migrate',
        details: `Migrated ${result.migrated}/${totalEventTimeline} EventTimeline rows to ProgramItem` +
          (result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''),
        request,
      });
    } catch (auditErr) {
      // Audit-log failure is non-fatal — the migration has already happened.
      logger.warn('program.migrate: audit log write failed', {
        weddingId: wedding.id,
        errMessage: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return apiSuccess(
      {
        migrated: result.migrated,
        errors: result.errors,
        totalEventTimeline,
      },
      200,
    );
  } catch (error) {
    logger.error('program.migrate: unhandled error', {
      weddingId: idParsed.data,
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const POST = withRateLimit(5, 60_000)(migrateHandler);
