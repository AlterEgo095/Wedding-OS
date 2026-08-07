export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { unsafePlatformDb as db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';
import { invalidateWeddingCache } from '@/lib/wedding/cache';

/**
 * Promote a STAGING deployment to production (Mission 6.0 P3.7).
 *
 * POST /api/platform/deployments/{id}/promote-staging
 *   body: {} (no params)
 *   → 200 { deploymentId, status: 'DEPLOYED', weddingId, version }
 *   → 404 if deployment not found
 *   → 409 if deployment status !== 'STAGING'
 *   → 400 if deployment has no weddingId or no configJson
 *
 * Platform-admin only. Rate-limited at 10 req/min (promoting staging rewrites
 * the Wedding row + busts the ISR cache — same cost as /trigger).
 *
 * SEMANTICS:
 *   A STAGING deployment is a deployment that ran the pipeline successfully
 *   but was not yet promoted to production. It has a configJson snapshot
 *   (from the pipeline's compileFrontend + publishFrontend stages) but the
 *   Wedding.publishedConfigJson still points at the PREVIOUS production
 *   deployment.
 *
 *   "Promote to production" copies the staging deployment's configJson into
 *   Wedding.publishedConfigJson + flips the wedding status to PUBLISHED (if
 *   currently in REENABLE_STATUSES) + invalidates the ISR cache. The staging
 *   deployment itself flips status STAGING → DEPLOYED (it's now the live
 *   production deployment).
 *
 *   This is structurally similar to /rollback, but simpler:
 *     - /rollback creates a NEW deployment row (audit trail) with version
 *       `rollback-${original.version}`.
 *     - /promote-staging does NOT create a new deployment — the staging
 *       deployment itself becomes the production deployment (status flip
 *       STAGING → DEPLOYED). This is because the staging deployment is
 *       already a complete, freshly-built artifact (not a restored snapshot).
 *
 *   ARCHIVED / SUSPENDED weddings are NOT auto-resurrected (same safety as
 *   rollback) — admin must unsuspend first.
 */

/**
 * Statuses that imply the wedding frontend is currently LIVE (or about to be).
 * Promoting staging to production on a PUBLISHED/COMPLETED wedding re-publishes
 * it. DRAFT weddings also get flipped to PUBLISHED (we're putting a live config
 * on them). ARCHIVED + SUSPENDED weddings are intentionally NOT flipped —
 * admin must explicitly unsuspend/unarchive first.
 */
const REENABLE_STATUSES = new Set(['PUBLISHED', 'COMPLETED', 'DRAFT']);

async function promoteStagingHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return apiError('Deployment id required', 400);

    // ── 1. Fetch the staging deployment ──────────────────────────────────────
    const target = await db.deployment.findUnique({
      where: { id },
      select: {
        id: true,
        weddingId: true,
        templateId: true,
        version: true,
        status: true,
        configJson: true,
        logsJson: true,
      },
    });

    if (!target) {
      return apiError('Déploiement introuvable', 404);
    }

    if (target.status !== 'STAGING') {
      return apiError(
        `Déploiement ${id} n'est pas en staging (status=${target.status}). Seuls les déploiements STAGING peuvent être promus en production.`,
        409,
      );
    }

    if (!target.weddingId) {
      return apiError(
        `Déploiement ${id} n'a pas de weddingId — impossible de promouvoir.`,
        400,
      );
    }

    if (!target.configJson) {
      return apiError(
        `Déploiement ${id} n'a pas de configJson — impossible de promouvoir (le snapshot de config est requis pour publier).`,
        400,
      );
    }

    logger.info('deployments.promote-staging', {
      deploymentId: id,
      weddingId: target.weddingId,
      triggeredBy: user!.id,
    });

    // ── 2. Fetch the wedding (need slug + current status) ────────────────────
    const wedding = await db.wedding.findUnique({
      where: { id: target.weddingId },
      select: {
        id: true,
        slug: true,
        coupleLabel: true,
        status: true,
      },
    });

    if (!wedding) {
      return apiError(
        `Wedding ${target.weddingId} introuvable (le déploiement ${id} référence un wedding supprimé).`,
        404,
      );
    }

    const shouldFlipStatus = REENABLE_STATUSES.has(wedding.status);

    // ── 3. Restore the Wedding row ───────────────────────────────────────────
    const weddingUpdateData: {
      publishedConfigJson: string;
      publishedVersion: string;
      publishedAt: Date;
      status?: string;
    } = {
      publishedConfigJson: target.configJson,
      publishedVersion: target.version,
      publishedAt: new Date(),
    };
    if (shouldFlipStatus) {
      weddingUpdateData.status = 'PUBLISHED';
    }
    await db.wedding.update({
      where: { id: wedding.id },
      data: weddingUpdateData,
    });

    // ── 4. Flip the staging deployment status STAGING → DEPLOYED ─────────────
    const existingLogs = safeJsonParse<{
      stages?: unknown;
      logs?: string[];
      error?: string;
    }>(target.logsJson, {});

    const promotionBlock = {
      promotedBy: user!.id,
      promotedAt: new Date().toISOString(),
      fromStatus: 'STAGING',
      toStatus: 'DEPLOYED',
      previousWeddingStatus: wedding.status,
      weddingStatusFlipped: shouldFlipStatus,
    };

    await db.deployment.update({
      where: { id },
      data: {
        status: 'DEPLOYED',
        url: `/w/${wedding.slug}`,
        logsJson: JSON.stringify({
          ...existingLogs,
          stagingPromotion: promotionBlock,
        }),
      },
    });

    // ── 5. Invalidate the per-wedding ISR cache (L1 + L2) ────────────────────
    try {
      await invalidateWeddingCache(wedding.slug);
    } catch (cacheErr) {
      // Non-fatal — the cache will expire on its own (5-min TTL).
      logger.warn('deployments.promote-staging: cache invalidation failed', {
        weddingSlug: wedding.slug,
        errMessage: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
      });
    }

    // ── 6. Audit log (best-effort) ───────────────────────────────────────────
    await writeAuditLog({
      weddingId: wedding.id,
      userId: user!.id,
      action: 'deployment.promote_staging',
      details: `Promoted STAGING deployment ${id} (version ${target.version}) to production for wedding ${wedding.slug} — wedding status flip: ${wedding.status} → ${shouldFlipStatus ? 'PUBLISHED' : wedding.status} (unchanged)`,
      request,
    }).catch(() => {
      /* audit-log failure must not fail the response */
    });

    return apiSuccess({
      deploymentId: id,
      status: 'DEPLOYED',
      weddingId: wedding.id,
      weddingSlug: wedding.slug,
      version: target.version,
      url: `/w/${wedding.slug}`,
      weddingStatusFlipped: shouldFlipStatus,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      return apiError(msg, 404);
    }
    logger.error('deployments.promote-staging error', { errMessage: msg });
    return internalError();
  }
}

export const POST = withRateLimit(10, 60_000)(promoteStagingHandler);
