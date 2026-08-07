export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { rollbackDeployment } from '@/lib/pipeline/rollback';

/**
 * Rollback a wedding to a previous successful deployment (Mission 6.0 P3.5).
 *
 * POST /api/platform/deployments/{id}/rollback
 *   body (optional): { triggeredBy?: string }
 *   → 200 { deploymentId, status, url, version, logs }
 *
 * Platform-admin only. Rate-limited at 10 req/min (rollbacks rewrite the
 * Wedding row + bust the ISR cache — same cost as a fresh deploy).
 *
 * The `triggeredBy` body field is OPTIONAL — when omitted, the acting user
 * from the auth session is used (the normal case). It exists so a script
 * or another admin tool can attribute the rollback to a specific user.
 *
 * On success, returns the NEW deployment row (the rollback row, not the
 * original). The original deployment is preserved untouched (audit trail).
 *
 * Errors:
 *   404 — Deployment not found OR not rollback-eligible (status !== DEPLOYED
 *         OR configJson is null OR weddingId is null).
 *   403 — User is not a PLATFORM_ADMIN.
 *   500 — Unexpected error (DB failure, cache invalidation failure, ...).
 */

async function rollbackHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return apiError('Deployment id required', 400);

    // Body is optional — triggeredBy defaults to the acting user.
    let bodyTriggeredBy: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body === 'object' && 'triggeredBy' in body) {
        const v = (body as { triggeredBy?: unknown }).triggeredBy;
        if (typeof v === 'string' && v.length > 0) bodyTriggeredBy = v;
      }
    } catch {
      // No JSON body or invalid JSON — fine, we fall back to the auth user.
    }
    const triggeredBy = bodyTriggeredBy ?? user!.id;

    logger.info('deployments.rollback', {
      deploymentId: id,
      triggeredBy,
    });

    const result = await rollbackDeployment(id, triggeredBy, request);

    // Best-effort audit log (the rollback helper already wrote a more
    // detailed one, but we add a top-level API-call audit entry here too
    // so /platform/admin/audit shows the API route invocation distinctly
    // from the internal pipeline action).
    await writeAuditLog({
      userId: user!.id,
      action: 'DEPLOYMENT_ROLLBACK_API',
      details: `API rollback of deployment ${id} → new deployment ${result.deploymentId} (version ${result.version}, status ${result.status})`,
      request,
    }).catch(() => {
      /* audit-log failure must not fail the response */
    });

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
    if (
      msg.includes('not found') ||
      msg.includes('not rollback-eligible') ||
      msg.includes('no configJson') ||
      msg.includes('no weddingId')
    ) {
      return apiError(msg, 404);
    }
    logger.error('deployments.rollback error', { errMessage: msg });
    return internalError();
  }
}

export const POST = withRateLimit(10, 60_000)(rollbackHandler);
