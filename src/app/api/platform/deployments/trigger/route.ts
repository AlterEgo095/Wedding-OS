export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { runDeploymentPipeline } from '@/lib/pipeline/deployment-pipeline';

/**
 * Trigger a frontend deployment pipeline run (CONS-6-PIPELINE task 3).
 *
 * POST /api/platform/deployments/trigger
 *   body: { weddingId, templateId, themeId, collectionId? }
 *   → 201 { deploymentId, status, logs, url, version }
 *
 * Platform-admin only. Rate-limited at 10 req/min (deploys are expensive —
 * they write PublishedConfig to the Wedding row + flip status to PUBLISHED).
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

    const result = await runDeploymentPipeline({
      weddingId: input.weddingId,
      templateId: input.templateId,
      themeId: input.themeId,
      collectionId: input.collectionId ?? null,
      triggeredBy: user!.id,
    });

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
