export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { unsafePlatformDb as db } from '@/lib/db';
import {
  runDeploymentPipeline,
  type DeploymentResult,
} from '@/lib/pipeline/deployment-pipeline';

/**
 * Approve a PENDING deployment (Mission 6.0 P3.7).
 *
 * POST /api/platform/deployments/{id}/approve
 *   body: {} (no params — the deployment's existing weddingId/templateId/
 *   themeId/collectionId are reused)
 *   → 201 { deploymentId, status, url, version, logs }  (DEPLOYED)
 *   → 200 { deploymentId, status, url, version, logs }  (FAILED)
 *   → 404 if deployment not found
 *   → 409 if deployment status !== 'PENDING'
 *   → 400 if deployment has no weddingId or templateId
 *
 * Platform-admin only. Rate-limited at 10 req/min (approvals run the full
 * pipeline — same cost as /trigger).
 *
 * SEMANTICS:
 *   The previous GovernancePanel was a health dashboard (renamed to
 *   PlatformHealthPanel in P3.7). The new GovernancePanel exposes a
 *   deployment approval queue. Deployments reach PENDING status via
 *   external triggers (e.g. onboarding workflows that pre-create a
 *   deployment row without running the pipeline). The platform admin
 *   reviews each PENDING row and either approves (→ run pipeline) or
 *   rejects (→ CANCELLED, see /reject route).
 *
 * FLOW:
 *   1. Fetch the PENDING deployment.
 *   2. Flip its status PENDING → BUILDING (so admin sees the approval
 *      took effect immediately, before the pipeline finishes).
 *   3. Resolve themeId — prefer deployment.themeId; if null, recover
 *      from logsJson; if still null, fall back to the first PUBLISHED
 *      PlatformTheme (same defensive logic as retryDeployment).
 *   4. Call runDeploymentPipeline({weddingId, templateId, themeId,
 *      collectionId, triggeredBy}). The pipeline CREATES A NEW deployment
 *      row (its own audit trail) and runs all 13 stages.
 *   5. Update the original deployment: status = result.status, url =
 *      result.url, copy configJson from the new deployment (so the
 *      original is also a valid "completed" record with a snapshot
 *      for future /config views or /rollback).
 *   6. Audit log 'deployment.approve' linking originalId + newId.
 *
 * The result returned to the client is the pipeline's result (which
 * points at the NEW deployment id). The original deployment id is
 * preserved in the audit log + visible in the deployments list (now
 * reflecting the final status).
 */

async function approveHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return apiError('Deployment id required', 400);

    // ── 1. Fetch the target deployment ───────────────────────────────────────
    const target = await db.deployment.findUnique({
      where: { id },
      select: {
        id: true,
        weddingId: true,
        templateId: true,
        themeId: true,
        collectionId: true,
        version: true,
        status: true,
      },
    });

    if (!target) {
      return apiError('Déploiement introuvable', 404);
    }

    if (target.status !== 'PENDING') {
      return apiError(
        `Déploiement ${id} n'est pas en attente (status=${target.status}). Seuls les déploiements PENDING peuvent être approuvés.`,
        409,
      );
    }

    if (!target.weddingId || !target.templateId) {
      return apiError(
        `Déploiement ${id} n'a pas de weddingId/templateId — impossible d'approuver.`,
        400,
      );
    }

    logger.info('deployments.approve', {
      deploymentId: id,
      weddingId: target.weddingId,
      templateId: target.templateId,
      triggeredBy: user!.id,
    });

    // ── 2. Flip status PENDING → BUILDING on the original ────────────────────
    await db.deployment.update({
      where: { id },
      data: { status: 'BUILDING' },
    });

    // ── 3. Resolve themeId (defensive fallback, same as retryDeployment) ─────
    let themeId: string | null = target.themeId ?? null;
    if (!themeId) {
      const fallbackTheme = await db.platformTheme.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!fallbackTheme) {
        // Mark original FAILED so admin sees the approval didn't succeed.
        await db.deployment.update({
          where: { id },
          data: {
            status: 'FAILED',
            logsJson: JSON.stringify({
              stages: [],
              logs: [],
              error:
                'Approval failed: no PUBLISHED PlatformTheme available for themeId fallback.',
            }),
          },
        });
        return apiError(
          'Aucun PlatformTheme PUBLISHED disponible pour fallback — approval impossible',
          500,
        );
      }
      themeId = fallbackTheme.id;
    }

    // ── 4. Run the pipeline (creates a NEW deployment row) ───────────────────
    const result: DeploymentResult = await runDeploymentPipeline({
      weddingId: target.weddingId,
      templateId: target.templateId,
      themeId,
      collectionId: target.collectionId ?? null,
      triggeredBy: user!.id,
    });

    // ── 5. Sync the original deployment with the pipeline result ─────────────
    // Fetch the new deployment to get its configJson (the result object doesn't
    // expose it). The original deployment should reflect the final state so the
    // admin's approvals queue shows it as resolved.
    let newConfigJson: string | null = null;
    try {
      const newDep = await db.deployment.findUnique({
        where: { id: result.deploymentId },
        select: { configJson: true },
      });
      newConfigJson = newDep?.configJson ?? null;
    } catch (fetchErr) {
      // Non-fatal — the original just won't have a configJson snapshot.
      logger.warn('deployments.approve: could not fetch new deployment configJson', {
        newDeploymentId: result.deploymentId,
        errMessage: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
    }

    try {
      await db.deployment.update({
        where: { id },
        data: {
          status: result.status,
          url: result.url,
          ...(newConfigJson !== null ? { configJson: newConfigJson } : {}),
        },
      });
    } catch (updateErr) {
      // Non-fatal — the new deployment already has the canonical state.
      logger.warn('deployments.approve: could not sync original deployment status', {
        originalDeploymentId: id,
        errMessage: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }

    // ── 6. Audit log (best-effort) ───────────────────────────────────────────
    await writeAuditLog({
      weddingId: target.weddingId,
      userId: user!.id,
      action: 'deployment.approve',
      details: `Approved PENDING deployment ${id} (version ${target.version}) → new deployment ${result.deploymentId} (version ${result.version}, status ${result.status})`,
      request,
    }).catch(() => {
      /* audit-log failure must not fail the response */
    });

    // ── 7. Return the pipeline result (points at the NEW deployment) ─────────
    if (result.status === 'DEPLOYED') {
      return apiSuccess(
        {
          deploymentId: result.deploymentId,
          status: result.status,
          url: result.url,
          version: result.version,
          logs: result.logs,
          originalDeploymentId: id,
        },
        201,
      );
    }
    return apiSuccess(
      {
        deploymentId: result.deploymentId,
        status: result.status,
        url: result.url,
        version: result.version,
        logs: result.logs,
        originalDeploymentId: id,
      },
      200,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found') || msg.includes('Wedding not found')) {
      return apiError(msg, 404);
    }
    logger.error('deployments.approve error', { errMessage: msg });
    return internalError();
  }
}

export const POST = withRateLimit(10, 60_000)(approveHandler);
