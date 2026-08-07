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
 *   body: { weddingId, templateId, themeId, collectionId? }
 *   → 201 { deploymentId, status, logs, url, version }
 *   → 409 { error: 'DEPLOYMENT_IN_PROGRESS', lockedBy, lockedAt, weddingId }
 *          (another deploy for the same wedding is already in flight)
 *
 * Platform-admin only. Rate-limited at 10 req/min (deploys are expensive —
 * they write PublishedConfig to the Wedding row + flip status to PUBLISHED).
 *
 * P3.6 — The pipeline call is wrapped in `withDeployLock(weddingId, userId, fn)`
 * to prevent two concurrent deploys for the same wedding racing on
 * Wedding.publishedConfigJson + Deployment rows. If the lock is already held,
 * returns 409 immediately (no audit log written — no deployment was attempted).
 */

const triggerSchema = z.object({
  weddingId: z.string().min(1).max(64),
  templateId: z.string().min(1).max(64),
  themeId: z.string().min(1).max(64),
  collectionId: z.string().min(1).max(64).optional().nullable(),
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

    logger.info('deployments.trigger', {
      weddingId: input.weddingId,
      templateId: input.templateId,
      themeId: input.themeId,
      collectionId: input.collectionId ?? null,
      triggeredBy: user!.id,
    });

    // P3.6 — Acquire per-weddingId deploy lock BEFORE entering the pipeline.
    // If another deploy is already in flight for this wedding, return 409
    // immediately. The lock is released in a `finally` inside withDeployLock,
    // so it's always freed even if the pipeline throws.
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
    await writeAuditLog({
      weddingId: input.weddingId,
      userId: user!.id,
      action: result.status === 'DEPLOYED' ? 'DEPLOYMENT_SUCCESS' : 'DEPLOYMENT_FAILED',
      details: `Pipeline ${result.version} → ${result.status} (deployment ${result.deploymentId})`,
      request,
    }).catch(() => {
      /* audit-log failure must not fail the response */
    });

    if (result.status === 'DEPLOYED') {
      return apiSuccess(
        {
          deploymentId: result.deploymentId,
          status: result.status,
          url: result.url,
          version: result.version,
          logs: result.logs,
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
