export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, tenantDb } from '@/lib/db';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound, forbidden, unauthorized } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { buildTenantContext, runWithTenant } from '@/lib/tenant-context';
import { getAuthUser, assertWeddingAccessAsync } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/guestbook/[entryId] — Admin moderation — P4.1
// ══════════════════════════════════════════════════════════════════════════════
//
// PATCH  /api/weddings/{id}/guestbook/{entryId}  { action: 'approve' | 'reject' }
//    → 200 { entry }
//
//    Moderates a pending entry.
//      - action='approve' → sets approved=true, approvedAt=now, approvedById=user.id
//      - action='reject'  → sets rejectedAt=now (approved stays false)
//    Audit log: action='guestbook.moderate'.
//
// DELETE /api/weddings/{id}/guestbook/{entryId}
//    → 200 { ok: true }
//
//    Hard-deletes the entry (no soft-delete column on GuestbookEntry).
//    Audit log: action='guestbook.delete'.
//
// Authorization: PLATFORM_ADMIN (any wedding) OR ORGANIZER with wedding access
// (assertWeddingAccessAsync resolves the wedding's organizationId for org-scoped
// users and checks user.weddingId for per-wedding roles). RECEPTION/CONTROLLER
// are explicitly denied — moderation is an ORGANIZER+ action.
//
// Both handlers are rate-limited at 30/min per IP (admin actions).
// ══════════════════════════════════════════════════════════════════════════════

const moderateSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

const ENTRY_ADMIN_SELECT = {
  id: true,
  weddingId: true,
  guestId: true,
  authorName: true,
  message: true,
  rating: true,
  approved: true,
  approvedById: true,
  approvedAt: true,
  rejectedAt: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function resolveWeddingContext(weddingId: string) {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      slug: true,
      status: true,
      plan: true,
      isDefault: true,
      brideName: true,
      groomName: true,
      coupleLabel: true,
      weddingDate: true,
      venueName: true,
      venueCity: true,
      organizationId: true,
    },
  });
  if (!wedding) return null;
  const cached = { ...wedding, fetchedAt: Date.now() };
  return buildTenantContext(cached);
}

// ORGANIZER+ roles allowed to moderate. RECEPTION/CONTROLLER are NOT.
function canModerate(role: string): boolean {
  return (
    role === 'PLATFORM_ADMIN' ||
    role === 'SUPER_ADMIN' ||
    role === 'ORGANIZER' ||
    role === 'ORG_ADMIN'
  );
}

// ─── PATCH — approve/reject ──────────────────────────────────────────────────

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const { id: weddingId, entryId } = await params;

    if (!canModerate(user.role)) {
      return forbidden('Modération réservée aux organisateurs');
    }
    const hasAccess = await assertWeddingAccessAsync(user, weddingId);
    if (!hasAccess) return forbidden('Accès refusé à ce mariage');

    const ctx = await resolveWeddingContext(weddingId);
    if (!ctx) return notFound('Mariage introuvable');

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = moderateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const { action } = parsed.data;

    return runWithTenant(ctx, async () => {
      // findFirst (NOT findUnique) so the tenant extension can auto-inject
      // weddingId — this guarantees we can't accidentally moderate an entry
      // from a different wedding even if entryId is enumerated.
      // Cast to base Prisma signature: the tenant extension produces a union
      // type for GuestbookEntry methods that TypeScript can't reconcile
      // ("Excessive stack depth"). Runtime behavior is identical (extension
      // auto-injects weddingId, which we already pass explicitly). Same
      // pattern as /api/weddings/[id]/stats/route.ts:134.
      const findFirst = tenantDb.guestbookEntry.findFirst as typeof db.guestbookEntry.findFirst;
      const update = tenantDb.guestbookEntry.update as typeof db.guestbookEntry.update;
      const existing = await findFirst({
        where: { id: entryId },
        select: { id: true, approved: true, rejectedAt: true, authorName: true },
      });
      if (!existing) return notFound('Entrée introuvable');

      const now = new Date();
      const updateData =
        action === 'approve'
          ? {
              approved: true,
              approvedAt: now,
              approvedById: user.id,
              rejectedAt: null, // un-reject if previously rejected
            }
          : {
              // reject: keep approved=false (or set it false if it was true),
              // set rejectedAt=now. We do NOT clear approvedById/approvedAt —
              // they remain as historical record of who previously approved.
              approved: false,
              rejectedAt: now,
            };

      const updated = await update({
        where: { id: entryId },
        data: updateData,
        select: ENTRY_ADMIN_SELECT,
      });

      await writeAuditLog({
        weddingId,
        userId: user.id,
        action: 'guestbook.moderate',
        details: `${action === 'approve' ? 'Approved' : 'Rejected'} guestbook entry ${entryId} (author: ${existing.authorName})`,
        request,
      });

      return NextResponse.json({ entry: updated });
    });
  } catch (error) {
    logger.error('Guestbook moderate error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── DELETE — hard-delete entry ──────────────────────────────────────────────

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const { id: weddingId, entryId } = await params;

    if (!canModerate(user.role)) {
      return forbidden('Suppression réservée aux organisateurs');
    }
    const hasAccess = await assertWeddingAccessAsync(user, weddingId);
    if (!hasAccess) return forbidden('Accès refusé à ce mariage');

    const ctx = await resolveWeddingContext(weddingId);
    if (!ctx) return notFound('Mariage introuvable');

    return runWithTenant(ctx, async () => {
      // Cast to base Prisma signature — see PATCH handler for rationale.
      const findFirst = tenantDb.guestbookEntry.findFirst as typeof db.guestbookEntry.findFirst;
      const remove = tenantDb.guestbookEntry.delete as typeof db.guestbookEntry.delete;
      const existing = await findFirst({
        where: { id: entryId },
        select: { id: true, authorName: true, message: true },
      });
      if (!existing) return notFound('Entrée introuvable');

      await remove({ where: { id: entryId } });

      await writeAuditLog({
        weddingId,
        userId: user.id,
        action: 'guestbook.delete',
        details: `Deleted guestbook entry ${entryId} (author: ${existing.authorName}, message preview: "${existing.message.slice(0, 80)}")`,
        request,
      });

      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    logger.error('Guestbook delete error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PATCH = withRateLimit(30, 60_000)(patchHandler);
export const DELETE = withRateLimit(30, 60_000)(deleteHandler);
