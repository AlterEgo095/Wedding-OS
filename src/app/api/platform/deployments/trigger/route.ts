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
// MISSION 5.9.4 P1-1 FIX — quality gate backend enforcement.
// The DesignerTab UI blocks publish when canPublish=false && qualityGate=true,
// but the backend deploy trigger had NO quality check — a determined admin
// could bypass via direct API call. This adds server-side enforcement that
// mirrors the UI gate: only activates when the wedding has opted into the
// blocking quality gate (publishedConfigJson.qualityGate === true).
import { computeQualityScorecard } from '@/lib/quality/scorecard';
import { safeJsonParse } from '@/lib/safe-json';
// MISSION 5.9.3 P1-2 FIX — payment gate enforcement.
// The PUT /api/platform/weddings/[id] route enforces "no PUBLISHED without PAID"
// (commercialStatus must be 'PAID' for non-default weddings transitioning to
// PUBLISHED). Without the same check here, the deploy trigger would bypass
// the payment gate entirely — an admin could publish a wedding without paying.
import { db } from '@/lib/db';

/**
 * Trigger a frontend deployment pipeline run (CONS-6-PIPELINE task 3).
 *
 * POST /api/platform/deployments/trigger
 *   body: { weddingId, templateId, themeId, collectionId?, staging? }
 *   → 201 { deploymentId, status, logs, url, version }
 *        (status = 'DEPLOYED' when staging=false, 'STAGING' when staging=true)
 *   → 409 { error: 'DEPLOYMENT_IN_PROGRESS', lockedBy, lockedAt, weddingId }
 *          (another deploy for the same wedding is already in flight)
 *   → 400 on malformed body / invalid zod parse
 *   → 500 on unexpected pipeline error
 *
 * Platform-admin only. Rate-limited at 10 req/min (deploys are expensive —
 * they write PublishedConfig to the Wedding row + flip status to PUBLISHED).
 *
 * P3.6 — The pipeline call is wrapped in `withDeployLock(weddingId, userId, fn)`
 * to prevent two concurrent deploys for the same wedding racing on
 * Wedding.publishedConfigJson + Deployment rows. If the lock is already held,
 * returns 409 immediately (no audit log written — no deployment was attempted).
 *
 * P4-4 — `body.staging === true` switches the pipeline into PREVIEW-ONLY mode.
 * The pipeline runs end-to-end (validateInputs → resolveExperience), the
 * PublishedConfig is compiled + persisted on the Deployment row (status=STAGING),
 * BUT the Wedding row is NOT touched (no publishedConfigJson, no status flip, no
 * publishedAt) and the per-wedding ISR cache is NOT invalidated. Guests keep
 * seeing the previously published config until an admin calls
 * POST /api/platform/deployments/{id}/promote-staging (which copies the staging
 * deployment's configJson → Wedding.publishedConfigJson + flips the wedding
 * to PUBLISHED + flips the deployment STAGING → DEPLOYED + invalidates the cache).
 *
 * SEMANTICS COMPARISON:
 *   staging=false (default, backward-compatible) → status=DEPLOYED, 201, audit
 *     action='DEPLOYMENT_SUCCESS', wedding is PUBLISHED + ISR cache busted.
 *   staging=true                              → status=STAGING,  201, audit
 *     action='DEPLOYMENT_STAGING', wedding row untouched + ISR cache NOT busted.
 *     Admin must promote via /promote-staging to go live (see that route's JSDoc).
 */

const triggerSchema = z.object({
  weddingId: z.string().min(1).max(64),
  templateId: z.string().min(1).max(64),
  themeId: z.string().min(1).max(64),
  collectionId: z.string().min(1).max(64).optional().nullable(),
  /** P4-4 — when true, the pipeline runs in preview-only mode (no Wedding row write). */
  staging: z.boolean().default(false).optional(),
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

    const staging = input.staging === true;

    logger.info('deployments.trigger', {
      weddingId: input.weddingId,
      templateId: input.templateId,
      themeId: input.themeId,
      collectionId: input.collectionId ?? null,
      staging,
      triggeredBy: user!.id,
    });

    // ─── MISSION 5.9.3 P1-2 FIX — Payment gate enforcement ──────────────────
    // Mirror the PUT /api/platform/weddings/[id] invariant: a non-default
    // wedding cannot transition to PUBLISHED unless commercialStatus = 'PAID'.
    //
    // Exemptions:
    //   - staging=true (preview-only deploy — Wedding row is NOT touched,
    //     no status flip, no guest impact → no payment needed).
    //   - isDefault=true (demo wedding, exempt from billing — matches the
    //     PUT route's exemption for josue-hornella and future demo weddings).
    //   - status === 'PUBLISHED' (already-published redeploys — the gate
    //     only blocks the DRAFT→PUBLISHED transition, not redeploys. This
    //     matches the PUT route's `existing.status !== 'PUBLISHED'` check).
    //
    // Without this gate, an admin could bypass billing entirely by calling
    // the deploy trigger instead of the PUT route (audit 5.9.3 P1-2).
    if (!staging) {
      const existing = await db.wedding.findUnique({
        where: { id: input.weddingId },
        select: { isDefault: true, commercialStatus: true, status: true, slug: true, publishedConfigJson: true },
      });
      if (
        existing &&
        !existing.isDefault &&
        existing.status !== 'PUBLISHED' &&
        existing.commercialStatus !== 'PAID'
      ) {
        logger.warn('deployments.trigger.payment_gate_blocked', {
          weddingId: input.weddingId,
          isDefault: existing.isDefault,
          status: existing.status,
          commercialStatus: existing.commercialStatus,
          triggeredBy: user!.id,
        });
        await writeAuditLog({
          weddingId: input.weddingId,
          userId: user!.id,
          action: 'DEPLOYMENT_PAYMENT_BLOCKED',
          details: `Deploy blocked by payment gate (commercialStatus=${existing.commercialStatus}, status=${existing.status})`,
          request,
        }).catch(() => { /* audit-log failure must not fail the response */ });
        return apiError(
          'Publication refusée : le paiement doit être vérifié avant déploiement. ' +
          'Utilisez Commercial OS → Payments → ✓ pour vérifier le paiement, ' +
          'ce qui déclenche le provisioning et met commercialStatus=PAID.',
          403
        );
      }

      // ─── MISSION 5.9.4 P1-1 FIX — Quality gate backend enforcement ────────
      // When a wedding has opted into the blocking quality gate
      // (publishedConfigJson.qualityGate === true), the deploy trigger MUST
      // verify canPublish before proceeding. Without this, the UI gate can be
      // bypassed via direct API call (audit 5.9.4 P1-1).
      //
      // The check is NON-BLOCKING for weddings that haven't opted in
      // (qualityGate defaults to false = advisory mode, backward compatible).
      // Exemptions: staging=true (preview only), isDefault=true (demo wedding).
      if (existing && !existing.isDefault && existing.publishedConfigJson) {
        const cfg = safeJsonParse<{ qualityGate?: boolean } | null>(
          existing.publishedConfigJson,
          null
        );
        if (cfg?.qualityGate === true && existing.slug) {
          try {
            const scorecard = await computeQualityScorecard(existing.slug);
            if (scorecard && !scorecard.canPublish) {
              const criticalDims = scorecard.dimensions.filter(
                (d) => d.status === 'critical'
              );
              const dimList = criticalDims
                .map((d) => `${d.label} (${d.score}/100)`)
                .join(', ');
              logger.warn('deployments.trigger.quality_gate_blocked', {
                weddingId: input.weddingId,
                slug: existing.slug,
                overall: scorecard.overall,
                canPublish: scorecard.canPublish,
                criticalCount: criticalDims.length,
                triggeredBy: user!.id,
              });
              await writeAuditLog({
                weddingId: input.weddingId,
                userId: user!.id,
                action: 'DEPLOYMENT_QUALITY_BLOCKED',
                details: `Deploy blocked by quality gate (overall=${scorecard.overall}/100, critical: ${dimList})`,
                request,
              }).catch(() => { /* audit-log failure must not fail the response */ });
              return apiError(
                `Publication refusée : le score de qualité est insuffisant (${scorecard.overall}/100). ` +
                `Dimensions critiques : ${dimList}. ` +
                `Utilisez le Quality Center pour corriger les problèmes avant publication.`,
                403
              );
            }
          } catch (qualError) {
            // Non-fatal — if the scorecard computation fails, log + continue.
            // We don't want a scorecard bug to block all deploys.
            logger.warn('deployments.trigger.quality_gate_error', {
              weddingId: input.weddingId,
              slug: existing.slug,
              errMessage: qualError instanceof Error ? qualError.message : String(qualError),
            });
          }
        }
      }
    }

    // P3.6 — Acquire per-weddingId deploy lock BEFORE entering the pipeline.
    // If another deploy is already in flight for this wedding, return 409
    // immediately. The lock is released in a `finally` inside withDeployLock,
    // so it's always freed even if the pipeline throws.
    // P4-4 — staging deploys ALSO take the lock (they touch the Deployment row +
    // compile the manifest, which is expensive — and a staging + a full deploy
    // racing on the same wedding would produce confusing history).
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
          staging,
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
    // P4-4 — pick the audit action based on the terminal status:
    //   DEPLOYED → 'DEPLOYMENT_SUCCESS'   (full deploy, wedding is live)
    //   STAGING  → 'DEPLOYMENT_STAGING'   (preview-only, awaiting promote-staging)
    //   FAILED   → 'DEPLOYMENT_FAILED'    (pipeline threw at some stage)
    const auditAction =
      result.status === 'DEPLOYED'
        ? 'DEPLOYMENT_SUCCESS'
        : result.status === 'STAGING'
        ? 'DEPLOYMENT_STAGING'
        : 'DEPLOYMENT_FAILED';
    await writeAuditLog({
      weddingId: input.weddingId,
      userId: user!.id,
      action: auditAction,
      details: `Pipeline ${result.version} → ${result.status} (deployment ${result.deploymentId})${
        staging ? ' [staging=true]' : ''
      }`,
      request,
    }).catch(() => {
      /* audit-log failure must not fail the response */
    });

    // P4-4 — both DEPLOYED and STAGING represent a successful deployment
    // creation (a new Deployment row was persisted), so both return 201.
    // Only FAILED returns 200 (the row exists but the pipeline didn't complete).
    if (result.status === 'DEPLOYED' || result.status === 'STAGING') {
      return apiSuccess(
        {
          deploymentId: result.deploymentId,
          status: result.status,
          url: result.url,
          version: result.version,
          logs: result.logs,
          staging: result.status === 'STAGING',
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
        staging: false,
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



