export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { runDeploymentPipeline } from '@/lib/pipeline/deployment-pipeline';
import { withDeployLock } from '@/lib/pipeline/deploy-lock';

/**
 * Trigger a frontend deployment pipeline run (CONS-6-PIPELINE task 3).
 *
 * POST /api/platform/deployments/trigger
 *   body: { weddingId, templateId, themeId, collectionId?, staging? }
 *   → 201 { deploymentId, status, logs, url, version }
 *        (status = 'DEPLOYED' when staging=false, 'STAGING' when staging=true)
 *   → 409 { error: 'DEPLOYMENT_IN_PROGRESS', lockedBy, lockedAt, weddingId }
 *          (another deploy for the same wedding is already in flight)
 *   → 400 on malformed body / invalid zod parse
 *   → 500 on unexpected pipeline error
 *
 * Platform-admin only. Rate-limited at 10 req/min (deploys are expensive —
 * they write PublishedConfig to the Wedding row + flip status to PUBLISHED).
 *
 * P3.6 — The pipeline call is wrapped in `withDeployLock(weddingId, userId, fn)`
 * to prevent two concurrent deploys for the same wedding racing on
 * Wedding.publishedConfigJson + Deployment rows. If the lock is already held,
 * returns 409 immediately (no audit log written — no deployment was attempted).
 *
 * P4-4 — `body.staging === true` switches the pipeline into PREVIEW-ONLY mode.
 * The pipeline runs end-to-end (validateInputs → resolveExperience), the
 * PublishedConfig is compiled + persisted on the Deployment row (status=STAGING),
 * BUT the Wedding row is NOT touched (no publishedConfigJson, no status flip, no
 * publishedAt) and the per-wedding ISR cache is NOT invalidated. Guests keep
 * seeing the previously published config until an admin calls
 * POST /api/platform/deployments/{id}/promote-staging (which copies the staging
 * deployment's configJson → Wedding.publishedConfigJson + flips the wedding
 * to PUBLISHED + flips the deployment STAGING → DEPLOYED + invalidates the cache).
 *
 * SEMANTICS COMPARISON:
 *   staging=false (default, backward-compatible) → status=DEPLOYED, 201, audit
 *     action='DEPLOYMENT_SUCCESS', wedding is PUBLISHED + ISR cache busted.
 *   staging=true                              → status=STAGING,  201, audit
 *     action='DEPLOYMENT_STAGING', wedding row untouched + ISR cache NOT busted.
 *     Admin must promote via /promote-staging to go live (see that route's JSDoc).
 */

const triggerSchema = z.object({
  weddingId: z.string().min(1).max(64),
  templateId: z.string().min(1).max(64),
  themeId: z.string().min(1).max(64),
  collectionId: z.string().min(1).max(64).optional().nullable(),
  /** P4-4 — when true, the pipeline runs in preview-only mode (no Wedding row write). */
  staging: z.boolean().default(false).optional(),
});

async function triggerHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return apiError('Corps de requête invalide', 400);

    const parsed = triggerSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message || 'Données invalides',
        400
      );
    }
    const input = parsed.data;

    const staging = input.staging === true;

    logger.info('deployments.trigger', {
      weddingId: input.weddingId,
      templateId: input.templateId,
      themeId: input.themeId,
      collectionId: input.collectionId ?? null,
      staging,
      triggeredBy: user!.id,
    });

    // P3.6 — Acquire per-weddingId deploy lock BEFORE entering the pipeline.
    // If another deploy is already in flight for this wedding, return 409
    // immediately. The lock is released in a `finally` inside withDeployLock,
    // so it's always freed even if the pipeline throws.
    // P4-4 — staging deploys ALSO take the lock (they touch the Deployment row +
    // compile the manifest, which is expensive — and a staging + a full deploy
    // racing on the same wedding would produce confusing history).
    const lockOutcome = await withDeployLock(
      input.weddingId,
      user!.id,
      () =>
        runDeploymentPipeline({
          weddingId: input.weddingId,
          templateId: input.templateId,
          themeId: input.themeId,
          collectionId: input.collectionId ?? null,
          triggeredBy: user!.id,
          staging,
        }),
    );

    if (lockOutcome.error) {
      // Lock was held — return 409 Conflict. No audit log: no deployment
      // was attempted, the request was rejected at the gate.
      logger.warn('deployments.trigger.locked', {
        weddingId: input.weddingId,
        triggeredBy: user!.id,
        lockError: lockOutcome.error,
      });
      return NextResponse.json(lockOutcome.error.body, {
        status: lockOutcome.error.status,
      });
    }

    const result = lockOutcome.result!;

    // Audit log (best-effort, never throws).
    // P4-4 — pick the audit action based on the terminal status:
    //   DEPLOYED → 'DEPLOYMENT_SUCCESS'   (full deploy, wedding is live)
    //   STAGING  → 'DEPLOYMENT_STAGING'   (preview-only, awaiting promote-staging)
    //   FAILED   → 'DEPLOYMENT_FAILED'    (pipeline threw at some stage)
    const auditAction =
      result.status === 'DEPLOYED'
        ? 'DEPLOYMENT_SUCCESS'
        : result.status === 'STAGING'
        ? 'DEPLOYMENT_STAGING'
        : 'DEPLOYMENT_FAILED';
    await writeAuditLog({
      weddingId: input.weddingId,
      userId: user!.id,
      action: auditAction,
      details: `Pipeline ${result.version} → ${result.status} (deployment ${result.deploymentId})${
        staging ? ' [staging=true]' : ''
      }`,
      request,
    }).catch(() => {
      /* audit-log failure must not fail the response */
    });

    // P4-4 — both DEPLOYED and STAGING represent a successful deployment
    // creation (a new Deployment row was persisted), so both return 201.
    // Only FAILED returns 200 (the row exists but the pipeline didn't complete).
    if (result.status === 'DEPLOYED' || result.status === 'STAGING') {
      return apiSuccess(
        {
          deploymentId: result.deploymentId,
          status: result.status,
          url: result.url,
          version: result.version,
          logs: result.logs,
          staging: result.status === 'STAGING',
        },
        201
      );
    }
    return apiSuccess(
      {
        deploymentId: result.deploymentId,
        status: result.status,
        url: result.url,
        version: result.version,
        logs: result.logs,
        staging: false,
      },
      200
    );
  } catch (error) {
    logger.error('deployments.trigger error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(10, 60_000)(triggerHandler);

