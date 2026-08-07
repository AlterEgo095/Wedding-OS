// ══════════════════════════════════════════════════════════════════════════════
// src/lib/pipeline/publish-helper.ts — Mission 6.0 P0.5
// ══════════════════════════════════════════════════════════════════════════════
//
// Bridge between the 3 "bypass" routes (onboarding/publish, onboarding/create-wedding,
// platform/weddings/[id] PUT) and the canonical runDeploymentPipeline().
//
// PROBLEM (audit 6.0-E):
//   3 routes flip Wedding.status='PUBLISHED' directly without invoking the
//   pipeline. This creates weddings that are publicly accessible but have:
//     - NO Deployment row (invisible to Production Studio)
//     - NO publishedConfigJson snapshot (no rollback)
//     - NO version history
//
// FIX:
//   This helper resolves templateId + themeId for a wedding (from its
//   WeddingCollectionBinding, or the first PUBLISHED defaults) and calls
//   runDeploymentPipeline(). If the pipeline fails (e.g. no templates
//   exist yet for a fresh install), it creates a LEGACY Deployment row
//   so the wedding is at least tracked, then sets status='PUBLISHED' as
//   a graceful fallback.
//
// This ensures EVERY wedding that becomes PUBLISHED has a Deployment row
// traceable in the Production Studio, without breaking existing flows.

import { unsafePlatformDb as db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runDeploymentPipeline, type DeploymentResult } from './deployment-pipeline';
import { invalidateWeddingCache } from '@/lib/wedding/cache';

export interface PublishResult {
  success: boolean;
  deploymentId: string | null;
  version: string | null;
  url: string | null;
  mode: 'PIPELINE' | 'LEGACY_FALLBACK';
  error?: string;
}

/**
 * Publish a wedding via the canonical deployment pipeline.
 *
 * Resolves templateId + themeId from:
 *   1. The wedding's WeddingCollectionBinding (if a collection is bound)
 *   2. The first PUBLISHED Template + PlatformTheme (system defaults)
 *
 * If the pipeline succeeds: returns the deployment result.
 * If the pipeline fails: creates a LEGACY Deployment row + sets status='PUBLISHED'
 * directly (graceful fallback so onboarding never blocks).
 */
export async function publishWeddingViaPipeline(
  weddingId: string,
  triggeredBy?: string | null
): Promise<PublishResult> {
  logger.info('publish-helper.start', { weddingId, triggeredBy });

  // ── Resolve templateId + themeId ──────────────────────────────────────────
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      slug: true,
      status: true,
      collectionId: true,
    },
  });

  if (!wedding) {
    return { success: false, deploymentId: null, version: null, url: null, mode: 'LEGACY_FALLBACK', error: 'Wedding not found' };
  }

  // Try to resolve from the wedding's collection binding
  let templateId: string | null = null;
  let themeId: string | null = null;
  let collectionId: string | null = wedding.collectionId ?? null;

  if (collectionId) {
    const binding = await db.weddingCollectionBinding.findFirst({
      where: { weddingId },
      select: { manifest: true },
    });
    if (binding?.manifest) {
      try {
        const manifest = JSON.parse(binding.manifest);
        templateId = manifest.templateId ?? null;
        themeId = manifest.themeId ?? null;
      } catch {
        // manifest parse error — fall through to defaults
      }
    }
  }

  // Fall back to the first PUBLISHED template + theme
  if (!templateId) {
    const defaultTemplate = await db.template.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    templateId = defaultTemplate?.id ?? null;
  }

  if (!themeId) {
    const defaultTheme = await db.platformTheme.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    themeId = defaultTheme?.id ?? null;
  }

  // ── If we have both, run the full pipeline ────────────────────────────────
  if (templateId && themeId) {
    try {
      const result: DeploymentResult = await runDeploymentPipeline({
        weddingId,
        templateId,
        themeId,
        collectionId,
        triggeredBy,
      });

      if (result.status === 'DEPLOYED') {
        logger.info('publish-helper.pipeline-success', {
          weddingId,
          deploymentId: result.deploymentId,
          version: result.version,
        });
        // Mission 6.0 P0.9 — invalidate the per-wedding ISR cache so the
        // public /w/[slug] page reflects the new deployment immediately
        // (no 5-min staleness window on the critical publish moment).
        await invalidateWeddingCache(wedding.slug);
        return {
          success: true,
          deploymentId: result.deploymentId,
          version: result.version,
          url: result.url,
          mode: 'PIPELINE',
        };
      }
      // Pipeline ran but FAILED — fall through to legacy
      logger.warn('publish-helper.pipeline-failed-fallback', {
        weddingId,
        deploymentId: result.deploymentId,
        logs: result.logs.slice(-5),
      });
    } catch (err) {
      logger.error('publish-helper.pipeline-error', {
        weddingId,
        errMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Legacy fallback: no templates/themes or pipeline failed ───────────────
  // Create a LEGACY Deployment row so the wedding is tracked in the Production
  // Studio, then set status='PUBLISHED' directly.
  const version = `legacy-${Date.now()}`;
  const url = `/w/${wedding.slug}`;

  try {
    const deployment = await db.deployment.create({
      data: {
        weddingId,
        templateId,
        version,
        status: 'LEGACY',
        url,
        configJson: null,
        themeId,
        collectionId,
        triggeredBy: triggeredBy ?? null,
        logsJson: JSON.stringify({
          mode: 'LEGACY_FALLBACK',
          reason: templateId && themeId ? 'pipeline_failed' : 'no_template_or_theme',
          timestamp: new Date().toISOString(),
        }),
      },
    });

    await db.wedding.update({
      where: { id: weddingId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    logger.info('publish-helper.legacy-fallback', {
      weddingId,
      deploymentId: deployment.id,
    });

    // Mission 6.0 P0.9 — invalidate the per-wedding ISR cache so the
    // public /w/[slug] page reflects the new PUBLISHED status immediately.
    await invalidateWeddingCache(wedding.slug);

    return {
      success: true,
      deploymentId: deployment.id,
      version,
      url,
      mode: 'LEGACY_FALLBACK',
    };
  } catch (err) {
    logger.error('publish-helper.legacy-error', {
      weddingId,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      deploymentId: null,
      version: null,
      url: null,
      mode: 'LEGACY_FALLBACK',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
