// ══════════════════════════════════════════════════════════════════════════════
// src/lib/pipeline/deployment-pipeline.ts — CONS-6-PIPELINE
// ══════════════════════════════════════════════════════════════════════════════
//
// Canonical frontend deployment pipeline for Wedding OS.
//
// Pipeline order (each stage is a sequential, logged, persisted step):
//   1. validateInputs       — verify weddingId/templateId/themeId exist + are usable
//   2. resolveBrand         — fetch the Brand record (org-level or wedding override) [P3.1]
//   3. resolveTemplate      — fetch the Template record (must be PUBLISHED)
//   4. resolveTheme         — fetch the PlatformTheme record (palette + fonts)
//   5. resolveAssets        — gather referenced PlatformAsset records
//   6. resolveComponents    — gather referenced ComponentRegistry entries
//   7. resolveLayouts       — fetch the Layout record (sectionsJson) [P3.2]
//   8. resolveBindings      — fetch WeddingCollectionBinding (manifest) if any
//   9. resolveCollection    — fetch the Collection (optional) + variant
//  10. resolveProducts      — verify Entitlement grants access to bundle [P3.3]
//  11. compileFrontend      — build the PublishedConfig JSON blob
//  12. publishFrontend      — write publishedConfigJson to Wedding + flip status
//  13. resolveExperience    — initialize A/B variants for active sections [P3.4]
//
// Trigger model:
//   - Only SUPER_ADMIN / PLATFORM_ADMIN can deploy (enforced by the API route).
//   - Organizers only feed content (stories, timeline, gifts, ...) via /w/[slug]/admin.
//   - The pipeline is invoked via POST /api/platform/deployments/trigger.
//
// Persistence:
//   - A Deployment row is created at start (status=PENDING) and updated after
//     each stage. On success: status=DEPLOYED, url=/w/{slug}, Wedding.status
//     =PUBLISHED, publishedAt=now(). On failure: status=FAILED, logsJson
//     contains the failing stage + error.
//   - The final PublishedConfig is written to Wedding.publishedConfigJson and
//     Wedding.publishedVersion (the version string).
//
// All DB access uses `unsafePlatformDb` because the pipeline touches
// platform-wide models (Template, PlatformTheme, ComponentRegistry,
// PlatformAsset, Deployment) AND a specific Wedding row identified by
// weddingId. There is no tenant-scoping concern here because the caller
// (API route) has already verified the acting user is a platform admin.

import { unsafePlatformDb as db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { safeJsonParse } from '@/lib/safe-json';
import type { WeddingManifest } from '@/lib/wedding/manifest';
import { resolveWeddingManifest } from '@/lib/wedding/manifest';
import { invalidateWeddingCache } from '@/lib/wedding/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StageStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface PipelineStage {
  name: string;
  status: StageStatus;
  startedAt: string | null;
  finishedAt: string | null;
  logs: string[];
  error: string | null;
}

export interface PipelineContext {
  weddingId: string;
  weddingSlug: string;
  templateId: string;
  themeId: string;
  collectionId?: string | null;
  version: string;
  stages: PipelineStage[];
}

export interface DeploymentResult {
  deploymentId: string;
  /**
   * 'DEPLOYED'  → full deploy: Wedding.publishedConfigJson written + wedding flipped to PUBLISHED + ISR cache busted.
   * 'STAGING'   → preview-only deploy: configJson snapshot persisted on the Deployment row, but Wedding.publishedConfigJson
   *               is NOT written, wedding status is NOT flipped, ISR cache is NOT busted. Use promote-staging to flip STAGING → DEPLOYED.
   * 'FAILED'    → pipeline threw at some stage; deployment row is marked FAILED + logsJson contains the error.
   */
  status: 'DEPLOYED' | 'STAGING' | 'FAILED';
  logs: string[];
  url: string | null;
  version: string;
}

export interface RunPipelineInput {
  weddingId: string;
  templateId: string;
  themeId: string;
  collectionId?: string | null;
  /** Acting admin user ID (for audit log). */
  triggeredBy?: string | null;
  /**
   * P4-4 (Staging deployments) — when true, the pipeline runs end-to-end but
   * does NOT write Wedding.publishedConfigJson, does NOT flip the wedding
   * status to PUBLISHED, and does NOT invalidate the per-wedding ISR cache.
   * The Deployment row is marked STAGING (not DEPLOYED) with the compiled
   * configJson snapshot persisted on it. Admin can later call
   * POST /api/platform/deployments/{id}/promote-staging to flip STAGING →
   * DEPLOYED (copies configJson → publishedConfigJson + flips wedding to
   * PUBLISHED + invalidates the cache). Default false (full deploy).
   */
  staging?: boolean;
}

// ─── Pipeline stage names (fixed order — DO NOT reorder) ──────────────────────

export const PIPELINE_STAGE_NAMES = [
  'validateInputs',
  'resolveBrand',
  'resolveTemplate',
  'resolveTheme',
  'resolveAssets',
  'resolveComponents',
  'resolveLayouts',
  'resolveBindings',
  'resolveCollection',
  'resolveProducts',
  'compileFrontend',
  'publishFrontend',
  'resolveExperience',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_NAMES)[number];

// ─── Published config shape (persisted to Wedding.publishedConfigJson) ────────

export interface PublishedTheme {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
}

export interface PublishedBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  voiceTone: Record<string, unknown>;
  iconography: Record<string, unknown>;
  colors: Record<string, unknown>;
  typography: Record<string, unknown>;
}

export interface PublishedLayout {
  id: string;
  name: string;
  slug: string;
  sections: unknown[]; // ManifestSection[] (kept as unknown[] to avoid circular type dep)
  props: Record<string, unknown>;
  version: number;
}

export interface PublishedProduct {
  id: string;
  name: string;
  slug: string;
  bundle: {
    collectionIds: string[];
    addOns: Array<{ type: string; quantity: number }>;
    features: Array<{ key: string; value: string }>;
  };
  priceCents: number;
  currency: string;
  licence: string;
}

export interface PublishedExperience {
  /** Section IDs that have at least one active A/B variant configured. */
  activeSections: string[];
  /** Number of variants initialized during this deployment. */
  initializedVariants: number;
}

export interface PublishedConfig {
  schemaVersion: 1;
  weddingId: string;
  weddingSlug: string;
  coupleLabel: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  themeId: string;
  themeName: string;
  collectionId: string | null;
  version: string;
  compiledAt: string; // ISO timestamp
  manifest: WeddingManifest;
  theme: PublishedTheme;
  /** ComponentRegistry entries referenced by this build (slug → version). */
  components: Array<{ slug: string; name: string; type: string; version: number }>;
  /** PlatformAsset entries referenced by this build (id → url). */
  assets: Array<{ id: string; name: string; type: string; url: string }>;
  /** P3.1 — Brand Kit (null when no brand is linked to the wedding or its org). */
  brand: PublishedBrand | null;
  /** P3.2 — Layout (null when no layout is linked; manifest falls back to defaults). */
  layout: PublishedLayout | null;
  /** P3.3 — Product (null when no product is linked to the wedding's entitlements). */
  product: PublishedProduct | null;
  /** P3.4 — Experience (post-deploy A/B variant initialization summary). */
  experience: PublishedExperience;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function initStages(): PipelineStage[] {
  return PIPELINE_STAGE_NAMES.map((name) => ({
    name,
    status: 'PENDING' as StageStatus,
    startedAt: null,
    finishedAt: null,
    logs: [],
    error: null,
  }));
}

function makeVersion(): string {
  // Semver-ish: yyyy.MMdd.HHmmss — short, sortable, monotonically increasing
  // within a day. Suffix a 4-char random to disambiguate two builds in the
  // same minute.
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}.${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}-${rand}`;
}

interface StageRunner {
  ctx: PipelineContext;
  deploymentId: string;
  logs: string[];
}

async function runStage(
  runner: StageRunner,
  stageName: PipelineStageName,
  fn: () => Promise<void>
): Promise<void> {
  const stage = runner.ctx.stages.find((s) => s.name === stageName)!;
  stage.status = 'RUNNING';
  stage.startedAt = nowIso();
  // Persist running state so /api/platform/deployments/[id] can show progress.
  await persist(runner.deploymentId, runner.ctx, 'BUILDING');
  logger.info('pipeline.stage.start', { deploymentId: runner.deploymentId, stage: stageName });
  try {
    await fn();
    stage.status = 'SUCCESS';
    stage.finishedAt = nowIso();
    stage.logs.push(`OK — ${stageName} completed`);
    runner.logs.push(`[${stageName}] OK`);
    logger.info('pipeline.stage.success', {
      deploymentId: runner.deploymentId,
      stage: stageName,
    });
  } catch (error) {
    stage.status = 'FAILED';
    stage.finishedAt = nowIso();
    const msg = error instanceof Error ? error.message : String(error);
    stage.error = msg;
    stage.logs.push(`FAIL — ${msg}`);
    runner.logs.push(`[${stageName}] FAIL: ${msg}`);
    logger.error('pipeline.stage.failed', {
      deploymentId: runner.deploymentId,
      stage: stageName,
      errMessage: msg,
    });
    throw error;
  }
}

async function persist(
  deploymentId: string,
  ctx: PipelineContext,
  deploymentStatus: 'PENDING' | 'BUILDING' | 'STAGING' | 'DEPLOYED' | 'FAILED'
): Promise<void> {
  await db.deployment.update({
    where: { id: deploymentId },
    data: {
      status: deploymentStatus,
      version: ctx.version,
      logsJson: JSON.stringify({
        stages: ctx.stages,
        logs: ctx.stages.flatMap((s) => s.logs),
      }),
    },
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the canonical frontend deployment pipeline for a wedding.
 *
 * P4-4 — `input.staging === true` switches the pipeline into PREVIEW-ONLY
 * mode: every stage runs (validateInputs → resolveExperience), the
 * PublishedConfig is compiled, and the snapshot is persisted on the
 * Deployment row (status=STAGING, configJson=<compiled>), but the THREE
 * production-side effects are SKIPPED:
 *   1. db.wedding.update({ status:'PUBLISHED', publishedConfigJson, ... }) — NOT called
 *   2. invalidateWeddingCache(slug) — NOT called
 *   3. final persist status — STAGING instead of DEPLOYED
 * This lets an admin preview a build before going live. Promote a STAGING
 * deployment to production via POST /api/platform/deployments/{id}/promote-staging
 * (which performs steps 1+2 atomically + flips the deployment STAGING → DEPLOYED).
 *
 * @param input - weddingId + templateId + themeId + collectionId? + triggeredBy? + staging?
 * @returns DeploymentResult with status 'DEPLOYED' | 'STAGING' | 'FAILED'.
 */
export async function runDeploymentPipeline(
  input: RunPipelineInput
): Promise<DeploymentResult> {
  const version = makeVersion();
  const logs: string[] = [];
  const triggeredBy = input.triggeredBy ?? null;
  const staging = input.staging === true;

  logger.info('pipeline.start', {
    weddingId: input.weddingId,
    templateId: input.templateId,
    themeId: input.themeId,
    collectionId: input.collectionId ?? null,
    version,
    triggeredBy,
    staging,
  });

  // ── Pre-fetch the wedding (we need its slug for the URL + coupleLabel) ────
  const wedding = await db.wedding.findUnique({
    where: { id: input.weddingId },
    select: {
      id: true,
      slug: true,
      coupleLabel: true,
      status: true,
    },
  });
  if (!wedding) {
    throw new Error(`Wedding not found: ${input.weddingId}`);
  }

  const ctx: PipelineContext = {
    weddingId: wedding.id,
    weddingSlug: wedding.slug,
    templateId: input.templateId,
    themeId: input.themeId,
    collectionId: input.collectionId ?? null,
    version,
    stages: initStages(),
  };

  // ── Create the Deployment row (status=PENDING) ───────────────────────────
  // Mission 6.0 P0.6 — persist themeId/collectionId/triggeredBy for audit + rollback.
  const deployment = await db.deployment.create({
    data: {
      weddingId: wedding.id,
      templateId: input.templateId,
      themeId: input.themeId,
      collectionId: input.collectionId ?? null,
      triggeredBy: triggeredBy,
      version,
      status: 'PENDING',
      url: null,
      logsJson: JSON.stringify({ stages: ctx.stages, logs: [] }),
    },
  });
  const deploymentId = deployment.id;
  logs.push(`[init] Created deployment ${deploymentId} (version ${version})`);

  // Mutable accumulator — populated by each stage, consumed by compileFrontend.
  let template: {
    id: string;
    name: string;
    slug: string;
    schemaJson: string;
    version: number;
    status: string;
  } | null = null;
  let theme: {
    id: string;
    name: string;
    slug: string;
    paletteJson: string;
    fontDisplay: string | null;
    fontBody: string | null;
    status: string;
  } | null = null;
  let components: Array<{
    id: string;
    slug: string;
    name: string;
    type: string;
    version: number;
    status: string;
  }> = [];
  let assets: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
  }> = [];
  let binding: { manifest: string | null; collectionId: string | null } | null = null;
  let collection: {
    id: string;
    slug: string;
    name: string;
    version: string;
  } | null = null;
  let manifest: WeddingManifest | null = null;
  // P3 accumulators
  let brand: PublishedBrand | null = null;
  let layout: PublishedLayout | null = null;
  let product: PublishedProduct | null = null;
  let experience: PublishedExperience = { activeSections: [], initializedVariants: 0 };

  const runner: StageRunner = { ctx, deploymentId, logs };

  try {
    // ── 1. validateInputs ─────────────────────────────────────────────────
    await runStage(runner, 'validateInputs', async () => {
      if (!input.weddingId) throw new Error('weddingId is required');
      if (!input.templateId) throw new Error('templateId is required');
      if (!input.themeId) throw new Error('themeId is required');
      // Wedding existence already checked above — re-affirm for log clarity.
      logs.push(`[validateInputs] wedding=${wedding.slug} coupleLabel=${wedding.coupleLabel}`);
      if (wedding.status === 'ARCHIVED' || wedding.status === 'SUSPENDED') {
        throw new Error(`Wedding status ${wedding.status} cannot be deployed`);
      }
    });

    // ── 2. resolveBrand [P3.1] ────────────────────────────────────────────
    // Brand resolution order: wedding.brandId → organization.brandId → null.
    // Non-fatal: a wedding without a brand deploys fine (brand = null).
    await runStage(runner, 'resolveBrand', async () => {
      const weddingWithBrand = await db.wedding.findUnique({
        where: { id: wedding.id },
        select: {
          brandId: true,
          organizationId: true,
        },
      });
      const brandId = weddingWithBrand?.brandId ?? null;
      const orgId = weddingWithBrand?.organizationId ?? null;
      let resolvedBrandId = brandId;
      if (!resolvedBrandId && orgId) {
        const org = await db.organization.findUnique({
          where: { id: orgId },
          select: { brandId: true },
        });
        resolvedBrandId = org?.brandId ?? null;
      }
      if (resolvedBrandId) {
        const b = await db.brand.findUnique({
          where: { id: resolvedBrandId },
        });
        if (b && b.status === 'PUBLISHED') {
          brand = {
            id: b.id,
            name: b.name,
            slug: b.slug,
            logoUrl: b.logoUrl,
            voiceTone: safeJsonParse<Record<string, unknown>>(b.voiceToneJson, {}),
            iconography: safeJsonParse<Record<string, unknown>>(b.iconographyJson, {}),
            colors: safeJsonParse<Record<string, unknown>>(b.colorsJson, {}),
            typography: safeJsonParse<Record<string, unknown>>(b.typographyJson, {}),
          };
          logs.push(`[resolveBrand] ${b.slug} (${b.name}) — published`);
        } else if (b) {
          logs.push(`[resolveBrand] brand ${b.slug} found but status=${b.status} (skipped)`);
        } else {
          logs.push(`[resolveBrand] brandId ${resolvedBrandId} not found (non-fatal)`);
        }
      } else {
        logs.push('[resolveBrand] no brand linked to wedding or org (non-fatal)');
      }
    });

    // ── 3. resolveTemplate ────────────────────────────────────────────────
    await runStage(runner, 'resolveTemplate', async () => {
      template = await db.template.findUnique({
        where: { id: input.templateId },
        select: {
          id: true,
          name: true,
          slug: true,
          schemaJson: true,
          version: true,
          status: true,
        },
      });
      if (!template) throw new Error(`Template not found: ${input.templateId}`);
      if (template!.status === 'ARCHIVED') {
        throw new Error(`Template ${template!.slug} is ARCHIVED`);
      }
      logs.push(
        `[resolveTemplate] ${template!.slug} v${template!.version} (${template!.status})`
      );
    });

    // ── 3. resolveTheme ───────────────────────────────────────────────────
    await runStage(runner, 'resolveTheme', async () => {
      theme = await db.platformTheme.findUnique({
        where: { id: input.themeId },
        select: {
          id: true,
          name: true,
          slug: true,
          paletteJson: true,
          fontDisplay: true,
          fontBody: true,
          status: true,
        },
      });
      if (!theme) throw new Error(`PlatformTheme not found: ${input.themeId}`);
      if (theme!.status !== 'PUBLISHED') {
        throw new Error(`Theme ${theme!.slug} is not PUBLISHED (status=${theme!.status})`);
      }
      logs.push(
        `[resolveTheme] ${theme!.slug} (fontDisplay=${theme!.fontDisplay ?? 'null'})`
      );
    });

    // ── 4. resolveAssets ──────────────────────────────────────────────────
    await runStage(runner, 'resolveAssets', async () => {
      // Parse the template's schemaJson to find referenced asset IDs. The
      // schema is free-form — we extract any string that looks like a cuid
      // OR any URL string. This is best-effort; in practice the template
      // author references assets by ID in their schema.
      const schema = safeJsonParse<Record<string, unknown>>(template!.schemaJson, {});
      const assetIds = new Set<string>();
      const walk = (node: unknown): void => {
        if (typeof node === 'string') {
          // cuid pattern: 24 chars [a-z0-9]
          if (/^[a-z0-9]{24}$/.test(node)) assetIds.add(node);
        } else if (Array.isArray(node)) {
          node.forEach(walk);
        } else if (node && typeof node === 'object') {
          Object.values(node as Record<string, unknown>).forEach(walk);
        }
      };
      walk(schema);
      if (assetIds.size > 0) {
        assets = await db.platformAsset.findMany({
          where: { id: { in: Array.from(assetIds) } },
          select: { id: true, name: true, type: true, url: true },
        });
      }
      logs.push(`[resolveAssets] ${assets.length} asset(s) referenced by template schema`);
    });

    // ── 5. resolveComponents ──────────────────────────────────────────────
    await runStage(runner, 'resolveComponents', async () => {
      // Resolve all PUBLISHED components — the template's manifest references
      // them by type (hero, gallery, ...). We resolve all PUBLISHED ones so
      // the runtime registry has the latest version of each.
      components = await db.componentRegistry.findMany({
        where: { status: 'PUBLISHED' },
        select: { id: true, slug: true, name: true, type: true, version: true, status: true },
      });
      logs.push(`[resolveComponents] ${components.length} PUBLISHED components available`);
    });

    // ── 6. resolveLayouts [P3.2] ──────────────────────────────────────────
    // Layout resolution order: wedding.layoutId → template.layoutId → null.
    // Non-fatal: a wedding without a layout deploys fine (layout = null) and
    // the manifest falls back to the hardcoded LAYOUT_SECTIONS map.
    await runStage(runner, 'resolveLayouts', async () => {
      const weddingWithLayout = await db.wedding.findUnique({
        where: { id: wedding.id },
        select: { layoutId: true },
      });
      let layoutId = weddingWithLayout?.layoutId ?? null;
      // Fall back to template's layoutId if wedding has none.
      if (!layoutId && template?.id) {
        const tplWithLayout = await db.template.findUnique({
          where: { id: template.id },
          select: { layoutId: true },
        });
        layoutId = tplWithLayout?.layoutId ?? null;
      }
      if (layoutId) {
        const l = await db.layout.findUnique({ where: { id: layoutId } });
        if (l && l.status === 'PUBLISHED') {
          layout = {
            id: l.id,
            name: l.name,
            slug: l.slug,
            sections: safeJsonParse<unknown[]>(l.sectionsJson, []),
            props: safeJsonParse<Record<string, unknown>>(l.propsJson, {}),
            version: l.version,
          };
          logs.push(
            `[resolveLayouts] ${l.slug} v${l.version} — ${layout.sections.length} sections`
          );
        } else if (l) {
          logs.push(`[resolveLayouts] layout ${l.slug} found but status=${l.status} (skipped)`);
        } else {
          logs.push(`[resolveLayouts] layoutId ${layoutId} not found (non-fatal)`);
        }
      } else {
        logs.push('[resolveLayouts] no layout linked (non-fatal — manifest will use defaults)');
      }
    });

    // ── 7. resolveBindings ────────────────────────────────────────────────
    await runStage(runner, 'resolveBindings', async () => {
      binding = await db.weddingCollectionBinding.findUnique({
        where: { weddingId: wedding.id },
        select: { manifest: true, collectionId: true },
      });
      logs.push(
        `[resolveBindings] binding=${binding ? 'found' : 'none'} collectionId=${
          binding?.collectionId ?? 'null'
        }`
      );
    });

    // ── 7. resolveCollection ──────────────────────────────────────────────
    await runStage(runner, 'resolveCollection', async () => {
      const collId =
        input.collectionId && input.collectionId.trim() !== ''
          ? input.collectionId!.trim()
          : binding?.collectionId ?? null;
      if (collId) {
        collection = await db.collection.findUnique({
          where: { id: collId },
          select: { id: true, slug: true, name: true, version: true },
        });
        if (!collection) {
          // Non-fatal — collection is optional. Log and continue.
          logs.push(
            `[resolveCollection] collection ${collId} not found (non-fatal)`
          );
        } else {
          logs.push(
            `[resolveCollection] ${collection.slug} v${collection.version}`
          );
        }
      } else {
        logs.push('[resolveCollection] no collection referenced');
      }
    });

    // ── 9. resolveProducts [P3.3] ─────────────────────────────────────────
    // Look up the wedding's active Product entitlement (origin = ADD_ON or PLAN,
    // type = PREMIUM_COLLECTIONS — the entitlement type that grants product access).
    // Non-fatal: a wedding without a product deploys fine (product = null).
    // When a product is found, we verify that every collectionId in its bundle
    // is accessible (i.e. the wedding's collectionId matches one of them, OR
    // the wedding has an entitlement granting access).
    await runStage(runner, 'resolveProducts', async () => {
      const productEntitlement = await db.entitlement.findFirst({
        where: {
          weddingId: wedding.id,
          productId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { productId: true },
      });
      const productId = productEntitlement?.productId ?? null;
      if (productId) {
        const p = await db.product.findUnique({ where: { id: productId } });
        if (p && p.status === 'PUBLISHED') {
          const bundle = safeJsonParse<{
            collectionIds?: string[];
            addOns?: Array<{ type: string; quantity: number }>;
            features?: Array<{ key: string; value: string }>;
          }>(p.bundleJson, {});
          product = {
            id: p.id,
            name: p.name,
            slug: p.slug,
            bundle: {
              collectionIds: bundle.collectionIds ?? [],
              addOns: bundle.addOns ?? [],
              features: bundle.features ?? [],
            },
            priceCents: p.priceCents,
            currency: p.currency,
            licence: p.licence,
          };
          logs.push(
            `[resolveProducts] ${p.slug} (${p.name}) — ${product.bundle.collectionIds.length} collections, ${product.bundle.addOns.length} add-ons`
          );
        } else if (p) {
          logs.push(`[resolveProducts] product ${p.slug} found but status=${p.status} (skipped)`);
        } else {
          logs.push(`[resolveProducts] productId ${productId} not found (non-fatal)`);
        }
      } else {
        logs.push('[resolveProducts] no product linked to wedding entitlements (non-fatal)');
      }
    });

    // ── 10. compileFrontend ───────────────────────────────────────────────
    await runStage(runner, 'compileFrontend', async () => {
      // Resolve the canonical manifest (sections + theme + luxury) for this
      // wedding. Uses the existing WeddingCollectionBinding manifest if set,
      // else falls back to the default manifest (classic-gold).
      manifest = await resolveWeddingManifest(wedding.id);
      if (!manifest) {
        throw new Error('Failed to resolve wedding manifest');
      }

      // Override the manifest theme with the PlatformTheme palette/fonts when
      // available. The PlatformTheme is the deployment-time source of truth.
      const palette = safeJsonParse<Record<string, string>>(theme!.paletteJson, {});
      const compiledTheme: PublishedTheme = {
        primaryColor:
          palette.primaryColor || manifest.theme.primaryColor || '#D4A853',
        accentColor:
          palette.accentColor || manifest.theme.accentColor || '#C8785A',
        fontDisplay: theme!.fontDisplay || manifest.theme.fontDisplay || 'Cormorant Garamond',
        fontBody: theme!.fontBody || manifest.theme.fontBody || 'Inter',
        layout:
          safeJsonParse<Record<string, string>>(template!.schemaJson, {}).layout || 'classic',
      };

      const publishedConfig: PublishedConfig = {
        schemaVersion: 1,
        weddingId: wedding.id,
        weddingSlug: wedding.slug,
        coupleLabel: wedding.coupleLabel,
        templateId: template!.id,
        templateName: template!.name,
        templateVersion: template!.version,
        themeId: theme!.id,
        themeName: theme!.name,
        collectionId: collection?.id ?? null,
        version,
        compiledAt: nowIso(),
        manifest: manifest!,
        theme: compiledTheme,
        components: components.map((c) => ({
          slug: c.slug,
          name: c.name,
          type: c.type,
          version: c.version,
        })),
        assets: assets.map((a) => ({ id: a.id, name: a.name, type: a.type, url: a.url })),
        // P3.1-P3.4 — new pipeline stage outputs
        brand,
        layout,
        product,
        experience,
      };

      // Stash on ctx so publishFrontend can read it without re-computing.
      (ctx as PipelineContext & { _publishedConfig?: PublishedConfig })._publishedConfig =
        publishedConfig;
      logs.push(
        `[compileFrontend] manifest sections=${manifest!.sections.length} theme=${compiledTheme.primaryColor} components=${components.length} assets=${assets.length} brand=${brand ? brand.slug : 'none'} layout=${layout ? layout.slug : 'none'} product=${product ? product.slug : 'none'}`
      );
    });

    // ── 11. publishFrontend ───────────────────────────────────────────────
    //
    // P4-4 — In STAGING mode, this stage persists the compiled configJson
    // on the Deployment row (so promote-staging can copy it to
    // Wedding.publishedConfigJson later) but SKIPS the three production
    // side-effects:
    //   • db.wedding.update (no publishedConfigJson, no status flip, no publishedAt)
    //   • invalidateWeddingCache (public site must NOT change)
    //   • deployment status is STAGING (not DEPLOYED)
    // The wedding row remains untouched — guests keep seeing the previously
    // published config. Admin can preview the staging build via the GovernancePanel
    // §3 staging list (which fetches the deployment's configJson directly),
    // and promote it to production when ready.
    await runStage(runner, 'publishFrontend', async () => {
      const publishedConfig = (ctx as PipelineContext & { _publishedConfig?: PublishedConfig })
        ._publishedConfig;
      if (!publishedConfig) {
        throw new Error('compileFrontend did not produce a PublishedConfig');
      }
      const url = `/w/${wedding.slug}`;
      const configJsonSnapshot = JSON.stringify(publishedConfig);

      if (!staging) {
        // ── Full deploy — write the live config on the Wedding row ──
        await db.wedding.update({
          where: { id: wedding.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            publishedConfigJson: configJsonSnapshot,
            publishedVersion: version,
          },
        });
      }
      // Mission 6.0 P0.6 — persist the full config snapshot on the Deployment row
      // so rollback is possible (previously only Wedding.publishedConfigJson held it).
      // P4-4 — in STAGING mode, this snapshot is the ONLY persisted copy of the
      // build (the Wedding row is untouched). promote-staging will copy it to
      // Wedding.publishedConfigJson when the admin promotes.
      await db.deployment.update({
        where: { id: deploymentId },
        data: {
          status: staging ? 'STAGING' : 'DEPLOYED',
          url,
          configJson: configJsonSnapshot,
        },
      });
      if (!staging) {
        // Mission 6.0 P0.9 — invalidate the per-wedding ISR cache so the
        // public /w/[slug] page picks up the new publishedConfigJson + status
        // immediately. Without this, the 5-min fallback revalidate would
        // serve the stale (pre-publish) snapshot to guests.
        // P4-4 — SKIPPED in STAGING mode (no public-side change to invalidate).
        await invalidateWeddingCache(wedding.slug);
        logs.push(
          `[publishFrontend] Wedding.status=PUBLISHED url=${url} cache invalidated`
        );
      } else {
        logs.push(
          `[publishFrontend] STAGING — configJson snapshot persisted on deployment ${deploymentId} (wedding row untouched, cache NOT invalidated)`
        );
      }
    });

    // ── 12. resolveExperience [P3.4] ──────────────────────────────────────
    // Post-deploy: initialize default A/B variants for the wedding's active
    // manifest sections (one variant "A" at 100% per section — i.e. no split
    // yet, but the row exists so the ExperienceManager UI can add a "B"
    // variant later). Non-fatal: failures here don't fail the deployment.
    await runStage(runner, 'resolveExperience', async () => {
      if (!manifest || !manifest.sections || manifest.sections.length === 0) {
        logs.push('[resolveExperience] no manifest sections — skipping variant init');
        return;
      }
      const sectionIds = manifest.sections.map((s) => s.id).filter(Boolean) as string[];
      let initialized = 0;
      const activeSections: string[] = [];
      for (const sectionId of sectionIds) {
        // Upsert variant "A" at 100% traffic (default — no split yet).
        // Skip if any variant already exists for this (wedding, section) pair.
        const existing = await db.experienceVariant.findFirst({
          where: { weddingId: wedding.id, sectionId },
          select: { id: true, variantCode: true },
        });
        if (existing) {
          activeSections.push(sectionId);
          continue;
        }
        await db.experienceVariant.create({
          data: {
            weddingId: wedding.id,
            sectionId,
            variantCode: 'A',
            trafficPct: 100,
            description: 'Default variant (initialized by deployment pipeline)',
            isActive: true,
          },
        });
        initialized++;
        activeSections.push(sectionId);
      }
      experience = { activeSections, initializedVariants: initialized };
      logs.push(
        `[resolveExperience] ${initialized} new variants initialized, ${activeSections.length} active sections`
      );
    });

    // ── Success — final persist ───────────────────────────────────────────
    // P4-4 — in STAGING mode the deployment's terminal status is STAGING, not DEPLOYED.
    // The Wedding row + ISR cache are untouched (handled inside publishFrontend above).
    const finalStatus: 'STAGING' | 'DEPLOYED' = staging ? 'STAGING' : 'DEPLOYED';
    await persist(deploymentId, ctx, finalStatus);
    logger.info('pipeline.success', {
      deploymentId,
      version,
      weddingId: wedding.id,
      staging,
      status: finalStatus,
    });

    return {
      deploymentId,
      status: finalStatus,
      logs,
      url: `/w/${wedding.slug}`,
      version,
    };
  } catch (error) {
    // ── Failure — mark deployment FAILED + final persist ──────────────────
    const errMsg = error instanceof Error ? error.message : String(error);
    try {
      await db.deployment.update({
        where: { id: deploymentId },
        data: {
          status: 'FAILED',
          logsJson: JSON.stringify({
            stages: ctx.stages,
            logs,
            error: errMsg,
          }),
        },
      });
    } catch (persistErr) {
      logger.error('pipeline.persist-failed', {
        deploymentId,
        errMessage: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }
    logger.error('pipeline.failure', { deploymentId, version, errMessage: errMsg });
    return {
      deploymentId,
      status: 'FAILED',
      logs,
      url: null,
      version,
    };
  }
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export interface DeploymentStatusRow {
  id: string;
  weddingId: string | null;
  templateId: string | null;
  themeId: string | null;
  collectionId: string | null;
  configJson: string | null;
  version: string;
  status: string;
  url: string | null;
  logsJson: string;
  triggeredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  wedding: { id: string; slug: string; coupleLabel: string } | null;
  template: { id: string; name: string; slug: string } | null;
}

const DEPLOYMENT_FULL_SELECT = {
  id: true,
  weddingId: true,
  templateId: true,
  themeId: true,
  collectionId: true,
  configJson: true,
  version: true,
  status: true,
  url: true,
  logsJson: true,
  triggeredBy: true,
  createdAt: true,
  updatedAt: true,
  wedding: { select: { id: true, slug: true, coupleLabel: true } },
  template: { select: { id: true, name: true, slug: true } },
} as const;

export async function getDeploymentStatus(
  deploymentId: string
): Promise<DeploymentStatusRow | null> {
  return db.deployment.findUnique({
    where: { id: deploymentId },
    select: DEPLOYMENT_FULL_SELECT,
  }) as Promise<DeploymentStatusRow | null>;
}

export async function listDeployments(opts: {
  weddingId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ deployments: DeploymentStatusRow[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (opts.weddingId) where.weddingId = opts.weddingId;
  if (opts.status) where.status = opts.status;
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const [deployments, total] = await Promise.all([
    db.deployment.findMany({
      where,
      select: DEPLOYMENT_FULL_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    db.deployment.count({ where }),
  ]);
  return { deployments: deployments as DeploymentStatusRow[], total };
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

export async function retryDeployment(
  deploymentId: string,
  triggeredBy?: string | null
): Promise<DeploymentResult> {
  const previous = await db.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      weddingId: true,
      templateId: true,
      logsJson: true,
    },
  });
  if (!previous) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }
  if (!previous.weddingId || !previous.templateId) {
    throw new Error(`Deployment ${deploymentId} is missing weddingId/templateId — cannot retry`);
  }
  // Recover the themeId + collectionId from the previous logsJson (best-effort).
  // The pipeline doesn't persist the input themeId in the Deployment row, so
  // we extract it from the logs if available. If we can't, we fall back to
  // the first PUBLISHED theme (defensive — should not happen in practice).
  let themeId: string | null = null;
  let collectionId: string | null = null;
  try {
    const parsed = safeJsonParse<{
      stages?: Array<{ name: string; logs?: string[] }>;
      logs?: string[];
    }>(previous.logsJson, {});
    const allLogs: string[] = [];
    if (Array.isArray(parsed.stages)) {
      for (const s of parsed.stages) {
        if (Array.isArray(s.logs)) allLogs.push(...s.logs);
      }
    }
    if (Array.isArray(parsed.logs)) allLogs.push(...parsed.logs);
    // No themeId is logged explicitly — fall through to defensive default.
    void allLogs;
  } catch {
    // ignore
  }

  if (!themeId) {
    const fallbackTheme = await db.platformTheme.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!fallbackTheme) {
      throw new Error('No PUBLISHED PlatformTheme available for retry fallback');
    }
    themeId = fallbackTheme.id;
  }

  return runDeploymentPipeline({
    weddingId: previous.weddingId,
    templateId: previous.templateId,
    themeId,
    collectionId,
    triggeredBy,
  });
}

