export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccessAsync } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { badRequest, internalError } from '@/lib/api-errors';
import { generateManifest, validateManifest, parseManifest, type WeddingManifest, type ManifestSection } from '@/lib/wedding/manifest';
import { safeJsonParse } from '@/lib/safe-json';
// Mission 5.9.1 P4-3 — route the Designer publish (POST) through the canonical
// deployment pipeline so it no longer bypasses:
//   • Deployment row creation (Production Studio visibility for design republish)
//   • publishedConfigJson snapshot on the Wedding row (rollback + cache key)
//   • invalidateWeddingCache(slug) (no 5-min ISR staleness window)
// The onboarding/publish + platform/weddings/[id] routes already use this
// helper — this closes the last bypass. PUT (save draft) also invalidates the
// cache so the preview (?preview=draft) picks up edits without waiting on ISR.
import { publishWeddingViaPipeline } from '@/lib/pipeline/publish-helper';
import { invalidateWeddingCache } from '@/lib/wedding/cache';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/design — Designer API (Slice 2)
// ══════════════════════════════════════════════════════════════════════════════
// GET: returns the current draft + published manifest for this wedding
// PUT: saves a draft manifest (section enable/disable, reorder, theme overrides)
// POST: publishes the draft (copies draftManifest → manifest)
// DELETE: discards the draft (sets draftManifest = null)
//
// Authorization: ORGANIZER+ only. Tenant-scoped via weddingId in the URL.
//
// Mission 5.9.1 P4-3 (Designer publish path):
//   POST now routes through publishWeddingViaPipeline() so the Designer's
//   "Publier" button produces a Deployment row + publishedConfigJson snapshot
//   + invalidates the per-wedding ISR cache (no bypass). PUT (save draft)
//   invalidates the cache too so the preview reflects edits immediately.
// ══════════════════════════════════════════════════════════════════════════════

async function checkAuth(request: NextRequest, weddingId: string) {
  const user = await getAuthUser(request);
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
    return { error: NextResponse.json({ error: 'Forbidden — ORGANIZER+ required' }, { status: 403 }) };
  }
  // Tenant-scoped access check — resolves org-scoped access via DB lookup
  // (P5.1-2: fixes B2B2C ORG_ADMIN/ORG_MEMBER denial — they have no weddingId
  // but should be granted access to weddings under their organization).
  if (!(await assertWeddingAccessAsync(user, weddingId))) {
    return { error: NextResponse.json({ error: 'Forbidden — not your wedding' }, { status: 403 }) };
  }
  return { user };
}

// ─── GET: return draft + published manifest ───────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    const binding = await db.weddingCollectionBinding.findUnique({
      where: { weddingId },
      select: {
        manifest: true,
        draftManifest: true,
        collectionId: true,
        collectionVersion: true,
        status: true,
        deployedAt: true,
      },
    });

    const collections = await db.collection.findMany({
      where: { isActive: true, isPublished: true },
      select: {
        id: true, slug: true, name: true, version: true, category: true,
        themeSeed: true, thumbnailUrl: true,
        variants: { select: { id: true, code: true, name: true, isDefault: true, paletteOverride: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const published = binding ? parseManifest(binding.manifest) : null;
    const draft = binding?.draftManifest ? parseManifest(binding.draftManifest) : null;

    return NextResponse.json({
      binding: binding ? {
        collectionId: binding.collectionId,
        collectionVersion: binding.collectionVersion,
        status: binding.status,
        deployedAt: binding.deployedAt,
        hasDraft: !!binding.draftManifest,
      } : null,
      publishedManifest: published,
      draftManifest: draft,
      availableCollections: collections.map(c => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        version: c.version,
        category: c.category,
        thumbnailUrl: c.thumbnailUrl,
        themeSeed: safeJsonParse(c.themeSeed, {}),
        variants: c.variants.map(v => ({
          id: v.id,
          code: v.code,
          name: v.name,
          isDefault: v.isDefault,
          paletteOverride: v.paletteOverride ? safeJsonParse(v.paletteOverride, {}) : null,
        })),
      })),
    });
  } catch (error) {
    logger.error('Design GET error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── PUT: save draft manifest ─────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { sections, theme, collectionId, variantId } = body as {
      sections?: ManifestSection[];
      theme?: { primaryColor?: string; accentColor?: string; fontDisplay?: string; fontBody?: string };
      collectionId?: string;
      variantId?: string | null;
    };

    // If collectionId is provided and differs from current binding, regenerate manifest from new collection
    const existingBinding = await db.weddingCollectionBinding.findUnique({
      where: { weddingId },
      select: { collectionId: true, manifest: true },
    });

    let draft: WeddingManifest;

    if (collectionId && (!existingBinding || collectionId !== existingBinding.collectionId)) {
      // Collection changed — regenerate manifest from new collection, then apply overrides
      const generated = await generateManifest(collectionId, variantId || null);
      if (!generated) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      }
      draft = generated;
      if (sections) draft.sections = sections;
      if (theme) {
        draft.theme = {
          primaryColor: theme.primaryColor || draft.theme.primaryColor,
          accentColor: theme.accentColor || draft.theme.accentColor,
          fontDisplay: theme.fontDisplay || draft.theme.fontDisplay,
          fontBody: theme.fontBody || draft.theme.fontBody,
        };
      }
    } else {
      // Edit existing manifest — start from published, apply overrides
      const base = parseManifest(existingBinding?.manifest);
      if (!base) {
        return NextResponse.json({ error: 'No published manifest to edit — deploy a collection first' }, { status: 400 });
      }
      draft = {
        ...base,
        sections: sections || base.sections,
        theme: theme ? {
          primaryColor: theme.primaryColor || base.theme.primaryColor,
          accentColor: theme.accentColor || base.theme.accentColor,
          fontDisplay: theme.fontDisplay || base.theme.fontDisplay,
          fontBody: theme.fontBody || base.theme.fontBody,
        } : base.theme,
        variantId: variantId !== undefined ? variantId : base.variantId,
      };
    }

    // Validate before saving
    validateManifest(draft);

    // Save as draft (NOT published — public renderer still reads `manifest`, not `draftManifest`)
    await db.weddingCollectionBinding.upsert({
      where: { weddingId },
      update: {
        draftManifest: JSON.stringify(draft),
        collectionId: draft.collectionId,
        collectionVersion: draft.collectionVersion,
      },
      create: {
        weddingId,
        collectionId: draft.collectionId,
        collectionVersion: draft.collectionVersion,
        manifest: JSON.stringify(draft), // initial deploy also publishes
        draftManifest: JSON.stringify(draft),
        status: 'DEPLOYED',
      },
    });

    await writeAuditLog({
      weddingId,
      userId: user.id,
      action: 'SAVE_DESIGN_DRAFT',
      details: `Saved draft manifest: ${draft.sections.filter(s => s.enabled).length} sections enabled`,
      request,
    });

    // Mission 5.9.1 P4-3 — best-effort cache invalidation so the preview
    // (?preview=draft) and any caller that reads the cached layer picks up
    // the new draft. Non-fatal: a miss here falls back to the 5-min ISR
    // revalidate window, which is acceptable for a save (not a publish).
    // The CREATE branch (initial deploy) also sets `manifest` (effectively a
    // publish) — this invalidation covers that path too.
    try {
      const slug = request.headers.get('X-Wedding-Slug')
        ?? (await db.wedding.findUnique({
            where: { id: weddingId },
            select: { slug: true },
          }))?.slug
        ?? null;
      if (slug) {
        await invalidateWeddingCache(slug);
      }
    } catch (cacheErr) {
      logger.warn('Design PUT: cache invalidation failed (non-fatal)', {
        weddingId,
        errMessage: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
      });
    }

    return NextResponse.json({ success: true, draft });
  } catch (error) {
    logger.error('Design PUT error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Invalid request', detail: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

// ─── POST: publish draft → copy draftManifest to manifest ─────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const binding = await db.weddingCollectionBinding.findUnique({
      where: { weddingId },
      select: { draftManifest: true, manifest: true },
    });

    if (!binding?.draftManifest) {
      return NextResponse.json({ error: 'No draft to publish' }, { status: 400 });
    }

    const draft = parseManifest(binding.draftManifest);
    if (!draft) {
      return NextResponse.json({ error: 'Draft manifest is invalid' }, { status: 400 });
    }

    // Publish: copy draft → published, also apply theme to Theme table
    const manifestJson = JSON.stringify(draft);
    await db.$transaction([
      db.weddingCollectionBinding.update({
        where: { weddingId },
        data: {
          manifest: manifestJson,
          draftManifest: null, // clear draft after publish
          deployedAt: new Date(),
          deployedByUserId: user.id,
        },
      }),
      db.wedding.update({
        where: { id: weddingId },
        data: {
          collectionId: draft.collectionId,
          collectionVersion: draft.collectionVersion,
          variantId: draft.variantId,
        },
      }),
      db.theme.upsert({
        where: { weddingId },
        update: {
          primaryColor: draft.theme.primaryColor,
          accentColor: draft.theme.accentColor,
          fontDisplay: draft.theme.fontDisplay,
          fontBody: draft.theme.fontBody,
        },
        create: {
          weddingId,
          primaryColor: draft.theme.primaryColor,
          accentColor: draft.theme.accentColor,
          fontDisplay: draft.theme.fontDisplay,
          fontBody: draft.theme.fontBody,
        },
      }),
    ]);

    // ─── Mission 5.9.1 P4-3: route the design republish through the deployment
    // pipeline so the Designer publish path no longer bypasses:
    //   • Deployment row creation (PIPELINE → status='DEPLOYED' OR
    //     LEGACY_FALLBACK → status='LEGACY'; both surface in Production Studio)
    //   • publishedConfigJson snapshot on the Wedding row (PIPELINE mode only;
    //     LEGACY falls back to binding-based manifest in the cached resolver —
    //     still correct because the binding was just updated above)
    //   • invalidateWeddingCache(slug) (always called by the helper — guaranteed
    //     L1 + L2 cache bust so the next /w/[slug] request shows the new design
    //     immediately, no 5-min ISR staleness window)
    //
    // The pipeline reads the FRESHLY-UPDATED WeddingCollectionBinding.manifest
    // (written in the transaction above) so the snapshot it produces matches
    // what the public renderer will serve. The pipeline also re-resolves
    // templateId + themeId (from the manifest's templateId/themeId fields OR
    // from the first PUBLISHED defaults) — same resolution as the
    // onboarding/publish path.
    //
    // Non-fatal: if the pipeline throws (e.g. transient DB issue), the manifest
    // is already persisted in the transaction above — we still invalidate the
    // cache via the awaited helper so the public page reflects the new design
    // (worst case: 5-min ISR fallback window if even this fails). The user
    // never sees a 500 — the publish succeeds, just without a Deployment row.
    let pipelineMode: 'PIPELINE' | 'LEGACY_FALLBACK' | 'SKIPPED' = 'SKIPPED';
    let deploymentId: string | null = null;
    try {
      const publishResult = await publishWeddingViaPipeline(weddingId, user.id);
      pipelineMode = publishResult.mode;
      deploymentId = publishResult.deploymentId;
    } catch (pipelineErr) {
      // Pipeline threw — best-effort cache invalidation so the public page
      // still reflects the new manifest snapshot (read from
      // WeddingCollectionBinding.manifest by the cached resolver).
      logger.error('Design POST: publishWeddingViaPipeline failed (non-fatal)', {
        weddingId,
        errMessage: pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr),
      });
      // Resolve the slug for the cache invalidation. Prefer the X-Wedding-Slug
      // header (always sent by DesignerTab) and fall back to a DB lookup so
      // other callers without the header still get the cache busted.
      const slug = request.headers.get('X-Wedding-Slug')
        ?? (await db.wedding.findUnique({
            where: { id: weddingId },
            select: { slug: true },
          }))?.slug
        ?? null;
      if (slug) {
        try {
          await invalidateWeddingCache(slug);
        } catch (cacheErr) {
          logger.warn('Design POST: fallback cache invalidation failed', {
            weddingId,
            slug,
            errMessage: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        }
      }
    }

    await writeAuditLog({
      weddingId,
      userId: user.id,
      action: 'PUBLISH_DESIGN',
      details: `Published design: ${draft.sections.filter(s => s.enabled).length} sections, collection ${draft.collectionSlug}${deploymentId ? `, deployment=${deploymentId} (${pipelineMode})` : ' (pipeline skipped)'}`,
      request,
    });

    return NextResponse.json({ success: true, published: draft });
  } catch (error) {
    logger.error('Design POST error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── DELETE: discard draft ────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    await db.weddingCollectionBinding.update({
      where: { weddingId },
      data: { draftManifest: null },
    });

    return NextResponse.json({ success: true });
  } catch {
    return internalError();
  }
}
