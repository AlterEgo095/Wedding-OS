export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { apiSuccess, apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { unsafePlatformDb as db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';
import { rollbackDeployment } from '@/lib/pipeline/rollback';

/**
 * Canary deployment actions (Mission 6.0 P3.7).
 *
 * POST /api/platform/deployments/{id}/canary
 *   body: { action: 'promote_canary' | 'full_promote' | 'rollback_canary' }
 *   → 200 { deploymentId, action, canary: CanaryMeta | null }
 *
 * Platform-admin only. Rate-limited at 10 req/min (canary actions may
 * trigger a rollback — same cost as /rollback).
 *
 * CANARY MODEL:
 *   A "canary" deployment is a regular DEPLOYED deployment that has been
 *   marked as gradually-rolled-out via a `canary` block in its logsJson:
 *
 *     logsJson.canary = {
 *       isCanary: true,
 *       canaryStartedAt: '2026-08-07T…',
 *       canaryTrafficPct: 25,  // last computed traffic %
 *       promotedBy: 'user-uuid',
 *     }
 *
 *   The frontend (GovernancePanel) simulates the 0→100% ramp over 1 hour
 *   based on canaryStartedAt. There's no real traffic shifting logic here
 *   (the wedding frontend serves 100% of traffic regardless) — this is a
 *   governance/audit abstraction. When a real traffic shaper is added
 *   (Phase 9+), it can read the same logsJson.canary block.
 *
 * ACTIONS:
 *   - promote_canary: sets logsJson.canary = { isCanary: true,
 *     canaryStartedAt: now, promotedBy: userId }. Deployment status stays
 *     DEPLOYED (it IS deployed — the canary flag just marks it as
 *     progressive).
 *   - full_promote: removes the logsJson.canary block (or sets isCanary:
 *     false + canaryFinalizedAt). The deployment is now the canonical
 *     production deploy.
 *   - rollback_canary: finds the PREVIOUS DEPLOYED deployment for the same
 *     wedding (skipping the current canary deployment) and calls
 *     rollbackDeployment() on it. The canary flag on the current deployment
 *     is also cleared.
 *
 * The route does NOT change the Wedding row directly (except via
 * rollbackDeployment in the rollback_canary case) — the wedding's
 * publishedConfigJson already points at the canary deployment's config
 * (set by the pipeline when it ran). Canary is purely a metadata flag.
 */

const canarySchema = z.object({
  action: z.enum(['promote_canary', 'full_promote', 'rollback_canary']),
});

/** Canonical shape of the logsJson.canary block. */
interface CanaryMeta {
  isCanary: boolean;
  canaryStartedAt?: string;
  canaryTrafficPct?: number;
  promotedBy?: string | null;
  canaryFinalizedAt?: string;
  canaryRolledBackAt?: string;
}

async function canaryHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return apiError('Deployment id required', 400);

    const body = await request.json().catch(() => null);
    if (!body) return apiError('Corps de requête invalide', 400);

    const parsed = canarySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message || 'Action invalide (attendu: promote_canary | full_promote | rollback_canary)',
        400,
      );
    }
    const action = parsed.data.action;

    // ── Fetch the target deployment ──────────────────────────────────────────
    const target = await db.deployment.findUnique({
      where: { id },
      select: {
        id: true,
        weddingId: true,
        version: true,
        status: true,
        logsJson: true,
      },
    });

    if (!target) {
      return apiError('Déploiement introuvable', 404);
    }

    // Canary actions require a DEPLOYED deployment (you can't canary a
    // PENDING/FAILED/CANCELLED one — there's nothing live to progressively
    // shift traffic to).
    if (target.status !== 'DEPLOYED') {
      return apiError(
        `Déploiement ${id} n'est pas DEPLOYED (status=${target.status}). Les actions canary nécessitent un déploiement DEPLOYED.`,
        409,
      );
    }

    // Parse existing logsJson (preserve stages + logs).
    const existingLogs = safeJsonParse<{
      stages?: unknown;
      logs?: string[];
      error?: string;
      canary?: CanaryMeta;
      rollback?: unknown;
    }>(target.logsJson, {});

    logger.info('deployments.canary', {
      deploymentId: id,
      action,
      weddingId: target.weddingId,
      triggeredBy: user!.id,
    });

    // ── promote_canary ────────────────────────────────────────────────────────
    if (action === 'promote_canary') {
      const canary: CanaryMeta = {
        isCanary: true,
        canaryStartedAt: new Date().toISOString(),
        canaryTrafficPct: 0,
        promotedBy: user!.id,
      };
      await db.deployment.update({
        where: { id },
        data: {
          logsJson: JSON.stringify({
            ...existingLogs,
            canary,
          }),
        },
      });

      await writeAuditLog({
        weddingId: target.weddingId,
        userId: user!.id,
        action: 'deployment.canary',
        details: `Promoted deployment ${id} (version ${target.version}) to canary — ramp 0→100% over 1h`,
        request,
      }).catch(() => {
        /* best-effort */
      });

      return apiSuccess({ deploymentId: id, action, canary });
    }

    // ── full_promote ──────────────────────────────────────────────────────────
    if (action === 'full_promote') {
      const prevCanary = existingLogs.canary ?? null;
      const canary: CanaryMeta = {
        isCanary: false,
        canaryStartedAt: prevCanary?.canaryStartedAt,
        canaryTrafficPct: 100,
        promotedBy: prevCanary?.promotedBy ?? user!.id,
        canaryFinalizedAt: new Date().toISOString(),
      };
      await db.deployment.update({
        where: { id },
        data: {
          logsJson: JSON.stringify({
            ...existingLogs,
            canary,
          }),
        },
      });

      await writeAuditLog({
        weddingId: target.weddingId,
        userId: user!.id,
        action: 'deployment.canary',
        details: `Full-promoted canary deployment ${id} (version ${target.version}) → production 100%`,
        request,
      }).catch(() => {
        /* best-effort */
      });

      return apiSuccess({ deploymentId: id, action, canary });
    }

    // ── rollback_canary ───────────────────────────────────────────────────────
    // Find the PREVIOUS DEPLOYED deployment for the same wedding (the one that
    // was live before the canary was promoted). We skip the current canary
    // deployment itself.
    if (action === 'rollback_canary') {
      if (!target.weddingId) {
        return apiError(
          `Déploiement ${id} n'a pas de weddingId — impossible de trouver un déploiement précédent pour rollback canary.`,
          400,
        );
      }

      const previousDeployed = await db.deployment.findFirst({
        where: {
          weddingId: target.weddingId,
          status: 'DEPLOYED',
          id: { not: id },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, version: true },
      });

      if (!previousDeployed) {
        return apiError(
          `Aucun déploiement DEPLOYED précédent trouvé pour le wedding ${target.weddingId} — impossible de rollback le canary sans cible de rollback.`,
          404,
        );
      }

      // Mark the current canary as rolled-back (clear canary flag, log the
      // rollback event) BEFORE invoking rollbackDeployment (which creates a
      // new deployment row + restores the wedding config).
      const canary: CanaryMeta = {
        isCanary: false,
        canaryStartedAt: existingLogs.canary?.canaryStartedAt,
        canaryTrafficPct: 0,
        promotedBy: existingLogs.canary?.promotedBy ?? user!.id,
        canaryRolledBackAt: new Date().toISOString(),
      };
      await db.deployment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          logsJson: JSON.stringify({
            ...existingLogs,
            canary,
          }),
        },
      });

      // Now invoke the P3.5 rollback helper on the previous DEPLOYED
      // deployment. This creates a NEW deployment row (version
      // `rollback-${previous.version}`) and restores the wedding config.
      const rollbackResult = await rollbackDeployment(
        previousDeployed.id,
        user!.id,
        request,
      );

      await writeAuditLog({
        weddingId: target.weddingId,
        userId: user!.id,
        action: 'deployment.canary',
        details: `Rolled back canary deployment ${id} (version ${target.version}) → restored deployment ${previousDeployed.id} (version ${previousDeployed.version}) via new deployment ${rollbackResult.deploymentId} (version ${rollbackResult.version})`,
        request,
      }).catch(() => {
        /* best-effort */
      });

      return apiSuccess({
        deploymentId: id,
        action,
        canary,
        rollback: {
          targetDeploymentId: previousDeployed.id,
          targetVersion: previousDeployed.version,
          newDeploymentId: rollbackResult.deploymentId,
          newVersion: rollbackResult.version,
        },
      });
    }

    // Unreachable (zod enum validation guarantees one of the 3 actions).
    return apiError('Action non supportée', 400);
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
    logger.error('deployments.canary error', { errMessage: msg });
    return internalError();
  }
}

export const POST = withRateLimit(10, 60_000)(canaryHandler);
