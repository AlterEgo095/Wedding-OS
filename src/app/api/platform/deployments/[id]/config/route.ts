export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getDeploymentStatus } from '@/lib/pipeline/deployment-pipeline';
import { safeJsonParse } from '@/lib/safe-json';

/**
 * Get a deployment's full PublishedConfig snapshot (Mission 6.0 P3.5).
 *
 * GET /api/platform/deployments/{id}/config
 *   → 200 { deploymentId, version, hasConfig, config }
 *
 * Platform-admin only. Used by the DeploymentsPanel "View config" button to
 * display the PublishedConfig JSON (pretty-printed) in a modal — supports
 * the rollback workflow (admin inspects previous config before rolling back).
 *
 * The `config` field is the parsed PublishedConfig object (null when the
 * deployment has no configJson — e.g. failed deployments, or pre-P0.6 rows).
 *
 * This is a sibling route of /api/platform/deployments/[id]/rollback — both
 * are owned by the P3.5 agent and intentionally additive (the existing
 * GET /api/platform/deployments/[id] route does NOT expose configJson, so
 * we provide a dedicated endpoint rather than modifying another agent's file).
 */

async function getConfigHandler(
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

    const rawConfig = deployment.configJson;
    const parsed = rawConfig
      ? safeJsonParse<Record<string, unknown> | null>(rawConfig, null)
      : null;

    return apiSuccess({
      deploymentId: deployment.id,
      version: deployment.version,
      status: deployment.status,
      hasConfig: parsed !== null,
      config: parsed,
    });
  } catch (error) {
    logger.error('deployments.config.get error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = withRateLimit(30, 60_000)(getConfigHandler);
