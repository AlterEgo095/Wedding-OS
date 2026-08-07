// ══════════════════════════════════════════════════════════════════════════════
// src/lib/pipeline/rollback.ts — Mission 6.0 P3.5 (DEPLOYMENT ROLLBACK)
// ══════════════════════════════════════════════════════════════════════════════
//
// Restores a previous successful deployment's PublishedConfig snapshot
// (Deployment.configJson — added in P0.6) as the live wedding frontend.
//
// ROLLBACK SEMANTICS (audit-trail preserved, no destructive mutation):
//   1. Fetch the target Deployment row.
//        Eligibility: status === 'DEPLOYED' AND configJson IS NOT NULL
//                     AND weddingId IS NOT NULL.
//   2. Create a NEW Deployment row (audit trail) with:
//        - version        = `rollback-${original.version}`
//        - templateId     = original.templateId (preserved)
//        - themeId        = original.themeId (preserved)
//        - collectionId   = original.collectionId (preserved)
//        - triggeredBy    = the acting admin (passed by the API route)
//        - status         = PENDING (then DEPLOYED after success)
//        - configJson     = original.configJson (full PublishedConfig snapshot)
//   3. Restore Wedding row:
//        - publishedConfigJson = original.configJson
//        - publishedVersion    = `rollback-${original.version}`
//        - publishedAt         = now()
//        - status              = PUBLISHED (ONLY if the wedding is currently
//                                PUBLISHED or COMPLETED; ARCHIVED/SUSPENDED
//                                weddings stay frozen — admin must unsuspend
//                                first). DRAFT weddings get flipped to
//                                PUBLISHED since we are putting a live
//                                config on them.
//   4. Update the new Deployment row to status=DEPLOYED + url=/w/{slug}.
//   5. invalidateWeddingCache(slug) — busts both L1 (in-memory Map) and
//      L2 (Next.js unstable_cache ISR layer) so the next guest request
//      sees the restored config immediately (no 5-min staleness window).
//   6. AuditLog entry: action='deployment.rollback' with fromDeploymentId
//      + toDeploymentId + weddingId + version.
//
// The ORIGINAL failed/regressing deployment is NOT deleted — admin can
// still inspect its logsJson for post-mortem. The rollback is itself a
// new Deployment row, so the audit trail is unbroken.
//
// All DB access uses `unsafePlatformDb` (same rationale as
// deployment-pipeline.ts — touches platform-wide Deployment + Wedding
// rows; caller has already been verified as a platform admin).

import { unsafePlatformDb as db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { invalidateWeddingCache } from '@/lib/wedding/cache';
import { writeAuditLog } from '@/lib/audit';
import type { NextRequest } from 'next/server';
import type { DeploymentResult } from '@/lib/pipeline/deployment-pipeline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Statuses that imply the wedding frontend is currently LIVE (or about to be).
 * A rollback to a PUBLISHED/COMPLETED wedding re-publishes it. DRAFT weddings
 * also get flipped to PUBLISHED because we're putting a live config on them.
 *
 * ARCHIVED + SUSPENDED weddings are intentionally NOT flipped — the admin
 * must explicitly unsuspend/unarchive first (otherwise a rollback could
 * silently resurrect a wedding that was taken down for legal/abuse reasons).
 */
const REENABLE_STATUSES = new Set(['PUBLISHED', 'COMPLETED', 'DRAFT']);

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Rollback a wedding to a previous successful deployment's PublishedConfig.
 *
 * @param deploymentId  The target DEPLOYED deployment to restore.
 * @param triggeredBy   Acting admin user ID (for audit + Deployment.triggeredBy).
 *                      Falls back to null when not provided (audit logs the
 *                      rollback as system-initiated).
 * @param request       Optional NextRequest — used to capture IP + UA in the
 *                      audit log when called from an API route.
 *
 * @returns DeploymentResult — same shape as runDeploymentPipeline's return:
 *          { deploymentId, status, logs, url, version }.
 *          status is always 'DEPLOYED' on success (rollback never fails the
 *          publish step — if the config was valid when first deployed, it
 *          is valid now). On failure, the function throws.
 */
export async function rollbackDeployment(
  deploymentId: string,
  triggeredBy?: string | null,
  request?: NextRequest
): Promise<DeploymentResult> {
  const logs: string[] = [];
  const actorId = triggeredBy ?? null;

  logger.info('pipeline.rollback.start', {
    deploymentId,
    triggeredBy: actorId,
  });

  // ── 1. Fetch + validate the target Deployment row ────────────────────────
  const original = await db.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      weddingId: true,
      templateId: true,
      themeId: true,
      collectionId: true,
      configJson: true,
      version: true,
      status: true,
    },
  });

  if (!original) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }
  if (original.status !== 'DEPLOYED') {
    throw new Error(
      `Deployment ${deploymentId} is not rollback-eligible (status=${original.status}). Only DEPLOYED deployments can be rolled back.`
    );
  }
  if (!original.configJson) {
    throw new Error(
      `Deployment ${deploymentId} has no configJson snapshot — cannot rollback (P0.6 configJson column is empty for this row).`
    );
  }
  if (!original.weddingId) {
    throw new Error(
      `Deployment ${deploymentId} has no weddingId — cannot rollback (orphaned deployment).`
    );
  }

  logs.push(`[rollback] Source deployment ${original.id} (version ${original.version}) eligible`);

  // ── 2. Fetch the wedding (need slug for URL + current status for the flip) ──
  const wedding = await db.wedding.findUnique({
    where: { id: original.weddingId },
    select: {
      id: true,
      slug: true,
      coupleLabel: true,
      status: true,
    },
  });
  if (!wedding) {
    throw new Error(
      `Wedding ${original.weddingId} not found (deployment ${deploymentId} references a deleted wedding).`
    );
  }

  const rollbackVersion = `rollback-${original.version}`;
  const url = `/w/${wedding.slug}`;
  const shouldFlipStatus = REENABLE_STATUSES.has(wedding.status);

  logs.push(
    `[rollback] Wedding ${wedding.slug} (status=${wedding.status}) — flip to PUBLISHED=${shouldFlipStatus}`
  );

  // ── 3. Create the NEW Deployment row (status=PENDING — audit trail) ──────
  const newDeployment = await db.deployment.create({
    data: {
      weddingId: wedding.id,
      templateId: original.templateId,
      themeId: original.themeId,
      collectionId: original.collectionId,
      triggeredBy: actorId,
      version: rollbackVersion,
      status: 'PENDING',
      url: null,
      logsJson: JSON.stringify({
        stages: [],
        logs: [`[rollback] Initiated rollback to version ${original.version}`],
      }),
    },
  });
  logs.push(`[rollback] Created new deployment ${newDeployment.id} (version ${rollbackVersion})`);

  try {
    // ── 4. Restore the Wedding row (config + version + status + publishedAt) ──
    const weddingUpdateData: {
      publishedConfigJson: string;
      publishedVersion: string;
      publishedAt: Date;
      status?: string;
    } = {
      publishedConfigJson: original.configJson,
      publishedVersion: rollbackVersion,
      publishedAt: new Date(),
    };
    if (shouldFlipStatus) {
      weddingUpdateData.status = 'PUBLISHED';
    }
    await db.wedding.update({
      where: { id: wedding.id },
      data: weddingUpdateData,
    });
    logs.push(
      `[rollback] Wedding ${wedding.slug} restored — publishedVersion=${rollbackVersion} status=${shouldFlipStatus ? 'PUBLISHED' : wedding.status} (unchanged)`
    );

    // ── 5. Mark the new Deployment as DEPLOYED + persist configJson snapshot ──
    const rollbackLogs = [
      `[rollback] Restored config from deployment ${original.id} (version ${original.version})`,
      `[rollback] Wedding ${wedding.slug} publishedVersion=${rollbackVersion}`,
      `[rollback] Cache invalidated for slug=${wedding.slug}`,
      `[rollback] Original deployment ${original.id} preserved (audit trail)`,
    ];
    await db.deployment.update({
      where: { id: newDeployment.id },
      data: {
        status: 'DEPLOYED',
        url,
        configJson: original.configJson,
        logsJson: JSON.stringify({
          stages: [],
          logs: rollbackLogs,
          rollback: {
            fromDeploymentId: original.id,
            fromVersion: original.version,
            toDeploymentId: newDeployment.id,
            toVersion: rollbackVersion,
            weddingId: wedding.id,
            weddingSlug: wedding.slug,
            triggeredBy: actorId,
            initiatedAt: nowIso(),
          },
        }),
      },
    });
    logs.push(...rollbackLogs);

    // ── 6. Invalidate the per-wedding ISR cache (L1 + L2) ──────────────────
    await invalidateWeddingCache(wedding.slug);
    logs.push(`[rollback] Cache invalidated for slug=${wedding.slug}`);

    // ── 7. Audit log ───────────────────────────────────────────────────────
    await writeAuditLog({
      weddingId: wedding.id,
      userId: actorId,
      action: 'deployment.rollback',
      details: `Rollback wedding ${wedding.slug} to deployment ${original.id} (version ${original.version}) → new deployment ${newDeployment.id} (version ${rollbackVersion})`,
      request,
    }).catch((err) => {
      // Audit-log failure must not fail the rollback.
      logger.warn('pipeline.rollback.audit-log-failed', {
        deploymentId: newDeployment.id,
        errMessage: err instanceof Error ? err.message : String(err),
      });
    });

    logger.info('pipeline.rollback.success', {
      fromDeploymentId: original.id,
      toDeploymentId: newDeployment.id,
      weddingId: wedding.id,
      version: rollbackVersion,
    });

    return {
      deploymentId: newDeployment.id,
      status: 'DEPLOYED',
      logs,
      url,
      version: rollbackVersion,
    };
  } catch (error) {
    // ── Failure — mark the new Deployment FAILED + rethrow ─────────────────
    const errMsg = error instanceof Error ? error.message : String(error);
    try {
      await db.deployment.update({
        where: { id: newDeployment.id },
        data: {
          status: 'FAILED',
          logsJson: JSON.stringify({
            stages: [],
            logs,
            error: errMsg,
          }),
        },
      });
    } catch (persistErr) {
      logger.error('pipeline.rollback.persist-failed', {
        deploymentId: newDeployment.id,
        errMessage: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }
    logger.error('pipeline.rollback.failure', {
      fromDeploymentId: original.id,
      toDeploymentId: newDeployment.id,
      errMessage: errMsg,
    });
    throw error;
  }
}
