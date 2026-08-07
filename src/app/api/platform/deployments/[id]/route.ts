export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getDeploymentStatus } from '@/lib/pipeline/deployment-pipeline';
import { safeJsonParse } from '@/lib/safe-json';

/**
 * Get a single deployment's status + logs (CONS-6-PIPELINE task 3).
 *
 * GET /api/platform/deployments/{id}
 *   → 200 { deployment, stages }
 *
 * Platform-admin only. Returns the deployment row (id, status, version, url,
 * wedding, template, createdAt, updatedAt) AND the parsed logsJson as a
 * structured `stages` array (each with PENDING/RUNNING/SUCCESS/FAILED
 * status + startedAt/finishedAt + logs + error).
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return apiError('Deployment id required', 400);

    const deployment = await getDeploymentStatus(id);
    if (!deployment) {
      return apiError('Déploiement introuvable', 404);
    }

    // Parse logsJson into a structured stages array.
    const parsed = safeJsonParse<{
      stages?: unknown;
      logs?: string[];
      error?: string;
    }>(deployment.logsJson, {});

    return apiSuccess({
      deployment: {
        id: deployment.id,
        weddingId: deployment.weddingId,
        templateId: deployment.templateId,
        version: deployment.version,
        status: deployment.status,
        url: deployment.url,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt,
        wedding: deployment.wedding,
        template: deployment.template,
      },
      stages: parsed.stages ?? [],
      logs: parsed.logs ?? [],
      error: parsed.error ?? null,
    });
  } catch (error) {
    logger.error('deployments.get error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
