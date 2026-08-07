export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { unsafePlatformDb as db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';

/**
 * Reject a PENDING deployment (Mission 6.0 P3.7).
 *
 * POST /api/platform/deployments/{id}/reject
 *   body: { reason?: string }   (optional human-readable reason)
 *   → 200 { deploymentId, status: 'CANCELLED' }
 *   → 404 if deployment not found
 *   → 409 if deployment status !== 'PENDING'
 *
 * Platform-admin only. Rate-limited at 30 req/min (reject is cheap — just a
 * status flip + audit log, no pipeline run).
 *
 * FLOW:
 *   1. Fetch the PENDING deployment.
 *   2. Flip status PENDING → CANCELLED. Persist the rejection reason (if
 *      provided) into the logsJson.rejection block for audit visibility.
 *   3. Audit log 'deployment.reject' with the reason.
 *
 * The deployment row is preserved (NOT deleted) so the audit trail shows
 * that it was created, awaited approval, and was rejected. The /retry
 * route cannot retry CANCELLED deployments (only FAILED) — rejected
 * deployments stay terminal.
 */

async function rejectHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return apiError('Deployment id required', 400);

    // Optional body: { reason?: string }
    let reason: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body === 'object' && 'reason' in body) {
        const v = (body as { reason?: unknown }).reason;
        if (typeof v === 'string' && v.length > 0 && v.length <= 1000) {
          reason = v;
        }
      }
    } catch {
      // No body or invalid JSON — fine, reason stays null.
    }

    // ── 1. Fetch the target deployment ───────────────────────────────────────
    const target = await db.deployment.findUnique({
      where: { id },
      select: {
        id: true,
        weddingId: true,
        templateId: true,
        version: true,
        status: true,
        logsJson: true,
      },
    });

    if (!target) {
      return apiError('Déploiement introuvable', 404);
    }

    if (target.status !== 'PENDING') {
      return apiError(
        `Déploiement ${id} n'est pas en attente (status=${target.status}). Seuls les déploiements PENDING peuvent être rejetés.`,
        409,
      );
    }

    logger.info('deployments.reject', {
      deploymentId: id,
      weddingId: target.weddingId,
      triggeredBy: user!.id,
      reason,
    });

    // ── 2. Flip status PENDING → CANCELLED + persist rejection metadata ──────
    // Preserve existing logsJson stages (if any) and append a rejection block.
    const existingLogs = safeJsonParse<{
      stages?: unknown;
      logs?: string[];
      error?: string;
    }>(target.logsJson, {});

    const rejectionBlock = {
      rejectedBy: user!.id,
      rejectedAt: new Date().toISOString(),
      reason: reason ?? null,
    };

    await db.deployment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        logsJson: JSON.stringify({
          ...existingLogs,
          rejection: rejectionBlock,
        }),
      },
    });

    // ── 3. Audit log (best-effort) ───────────────────────────────────────────
    await writeAuditLog({
      weddingId: target.weddingId,
      userId: user!.id,
      action: 'deployment.reject',
      details: `Rejected PENDING deployment ${id} (version ${target.version})${reason ? ` — reason: ${reason}` : ''}`,
      request,
    }).catch(() => {
      /* audit-log failure must not fail the response */
    });

    return apiSuccess({
      deploymentId: id,
      status: 'CANCELLED',
      rejection: rejectionBlock,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      return apiError(msg, 404);
    }
    logger.error('deployments.reject error', { errMessage: msg });
    return internalError();
  }
}

export const POST = withRateLimit(30, 60_000)(rejectHandler);
