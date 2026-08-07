export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { retryDeployment } from '@/lib/pipeline/deployment-pipeline';

/**
 * Retry a failed deployment (CONS-6-PIPELINE task 3).
 *
 * POST /api/platform/deployments/{id}/retry
 *   → 200 { deploymentId, status, logs, url, version }
 *
 * Platform-admin only. Re-runs the pipeline using the previous deployment's
 * weddingId + templateId. The themeId is recovered from the previous logs
 * if available, else falls back to the first PUBLISHED PlatformTheme.
 *
 * Returns 409 if the deployment is not in FAILED status (retry only makes
 * sense for failed deployments — successful deployments should be re-run
 * via /trigger with fresh inputs).
 */

async function retryHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return apiError('Deployment id required', 400);

    logger.info('deployments.retry', { deploymentId: id, triggeredBy: user!.id });

    const result = await retryDeployment(id, user!.id);

    await writeAuditLog({
      userId: user!.id,
      action: result.status === 'DEPLOYED' ? 'DEPLOYMENT_RETRY_SUCCESS' : 'DEPLOYMENT_RETRY_FAILED',
      details: `Retry of ${id} → ${result.status} (new deployment ${result.deploymentId}, version ${result.version})`,
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
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      return apiError(msg, 404);
    }
    logger.error('deployments.retry error', { errMessage: msg });
    return internalError();
  }
}

export const POST = withRateLimit(10, 60_000)(retryHandler);
