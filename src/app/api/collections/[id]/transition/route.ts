export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';
import {
  transitionCollection,
  ApplyError,
  type CollectionStatus,
} from '@/lib/collections';

/**
 * POST /api/collections/[id]/transition
 * ══════════════════════════════════════════════════════════════════════════════
 * Mission 6.0 — P3.10 (audit-6.0-B): exposes the existing lifecycle transition
 * function (`transitionCollection` in src/lib/collections/index.ts) as an HTTP
 * endpoint. Before this route, the "Commercialiser" button in
 * CollectionsFactoryTab.tsx called this URL and received a 404.
 *
 * The actual state machine (BROUILLON → EN_COURS → VALIDATION → PUBLIE →
 * COMMERCIALISE → ARCHIVE) — including the role matrix and the 34-slot
 * completeness gate — is implemented in `transitionCollection`. This route is
 * a thin HTTP wrapper that:
 *   1. Authenticates + requires PLATFORM_ADMIN.
 *   2. Maps the request body's `action` to a target status (or accepts `to`
 *      directly for callers that already speak lifecycle vocabulary).
 *   3. Delegates validation + DB update to `transitionCollection`.
 *   4. Writes a supplementary `collection.transition` AuditLog row carrying
 *      the HTTP-specific context (action verb, notes, IP/UA).
 *   5. Returns 200 with the updated Collection.
 *
 * Body (one of):
 *   { action: 'publish' | 'commercialise' | 'unpublish' | 'archive', notes?: string }
 *   { to: 'BROUILLON' | 'EN_COURS' | 'VALIDATION' | 'PUBLIE' | 'COMMERCIALISE' | 'ARCHIVE', notes?: string }
 *
 * Action → target status mapping (depends on the current status; aligns with
 * the 9-edge transition matrix in TRANSITION_ROLES):
 *   - publish       : BROUILLON→EN_COURS, EN_COURS→VALIDATION, VALIDATION→PUBLIE, ARCHIVE→PUBLIE (restore)
 *   - commercialise : PUBLIE→COMMERCIALISE
 *   - unpublish     : EN_COURS→BROUILLON, VALIDATION→EN_COURS
 *                     (PUBLIE→BROUILLON is NOT in the matrix → UI disables "Dépublier" in PUBLIE state)
 *   - archive       : PUBLIE→ARCHIVE, COMMERCIALISE→ARCHIVE
 *
 * Rate-limited (20/min per IP). Returns 422 if the action is not valid for the
 * current status; 403 if the underlying transition is forbidden for the role;
 * 422 if the completeness gate fails (forward publication flow).
 * ══════════════════════════════════════════════════════════════════════════════
 */

type Action = 'publish' | 'commercialise' | 'unpublish' | 'archive';

/**
 * Map an `action` verb to a concrete target lifecycle status, given the
 * Collection's current status. Returns null when the action is not available
 * from the current status (the API responds 422 in that case).
 */
function resolveTargetStatus(
  action: Action,
  current: string
): CollectionStatus | null {
  switch (action) {
    case 'publish':
      // Advance through the publication pipeline — each current status maps
      // to the next forward step. ARCHIVE → PUBLIE is the documented
      // restoration path (already-commercialized Collections skip the gate).
      if (current === 'BROUILLON') return 'EN_COURS';
      if (current === 'EN_COURS') return 'VALIDATION';
      if (current === 'VALIDATION') return 'PUBLIE';
      if (current === 'ARCHIVE') return 'PUBLIE';
      return null;
    case 'commercialise':
      // Only PUBLIE → COMMERCIALISE is in the matrix.
      if (current === 'PUBLIE') return 'COMMERCIALISE';
      return null;
    case 'unpublish':
      // Roll back one step within the pre-publication flow. The matrix does
      // NOT allow PUBLIE → BROUILLON directly (only ARCHIVE → PUBLIE restores),
      // so 'unpublish' from PUBLIE/COMMERCIALISE/ARCHIVE returns null and the
      // UI disables the action.
      if (current === 'EN_COURS') return 'BROUILLON';
      if (current === 'VALIDATION') return 'EN_COURS';
      return null;
    case 'archive':
      // PUBLIE or COMMERCIALISE can be archived (removed from marketplace).
      if (current === 'PUBLIE' || current === 'COMMERCIALISE') return 'ARCHIVE';
      return null;
    default:
      return null;
  }
}

async function transitionHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ─── Auth + RBAC ────────────────────────────────────────────────────────
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    // ─── Fetch the Collection (platform-wide — not tenant-scoped) ───────────
    const existing = await db.collection.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        version: true,
      },
    });
    if (!existing) return notFound('Collection introuvable');

    // ─── Parse + validate the request body ──────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return badRequest('Corps de requête invalide');
    }

    const notes: string | null =
      typeof body.notes === 'string' && body.notes.trim().length > 0
        ? body.notes.trim().slice(0, 500)
        : null;

    let target: CollectionStatus | null = null;
    let actionVerb: Action | null = null;

    if (typeof body.to === 'string' && body.to.length > 0) {
      // Backward-compat path: caller already speaks lifecycle vocabulary.
      target = body.to as CollectionStatus;
    } else if (typeof body.action === 'string' && body.action.length > 0) {
      actionVerb = body.action as Action;
      target = resolveTargetStatus(actionVerb, existing.status);
      if (!target) {
        return NextResponse.json(
          {
            error: `Action "${actionVerb}" non disponible pour le statut actuel (${existing.status})`,
          },
          { status: 422 }
        );
      }
    } else {
      return badRequest("Champ 'action' ou 'to' requis dans le corps de la requête");
    }

    // ─── Delegate the transition to the shared domain function ──────────────
    // transitionCollection enforces: (a) the role matrix, (b) the completeness
    // gate (34 Penpot slots filled for VALIDATION/PUBLIE forward flow), and
    // (c) writes its own COLLECTION_TRANSITION AuditLog row with from/to/version.
    const result = await transitionCollection({
      collectionId: id,
      to: target,
      userRole: user!.role,
      userId: user!.id,
      weddingId: user!.weddingId ?? null,
    });

    // Re-fetch the updated row so the client gets the canonical post-transition
    // state (timestamps, version bump, etc.).
    const updated = await db.collection.findUnique({ where: { id } });

    // ─── Supplementary AuditLog entry (HTTP-level context) ──────────────────
    // transitionCollection already writes a `COLLECTION_TRANSITION` row; this
    // second row is the API-level record carrying the action verb, notes, and
    // the request's IP/UserAgent. Action key uses dot-notation
    // (`collection.transition`) for consistency with the post-P2 audit
    // convention (vs. the legacy SCREAMING_SNAKE used by the domain function).
    const client = getClientInfo(request);
    try {
      await db.auditLog.create({
        data: {
          weddingId: user!.weddingId ?? null,
          userId: user!.id,
          action: 'collection.transition',
          details: JSON.stringify({
            collectionId: id,
            slug: existing.slug,
            name: existing.name,
            action: actionVerb,
            to: result.to,
            fromStatus: result.from,
            toStatus: result.to,
            version: result.version,
            notes,
          }),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    } catch (auditErr) {
      // Best-effort — never fail the request because of an audit-write issue.
      logger.error('collection.transition: failed to write API-level AuditLog', {
        errMessage: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      success: true,
      collection: updated,
      transition: result,
    });
  } catch (error: unknown) {
    // ApplyError carries a statusCode — surface it as the HTTP response status
    // so the client sees a meaningful 400/403/404/422 instead of a 500.
    if (error instanceof ApplyError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    logger.error('Collection transition error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(20, 60_000)(transitionHandler);
