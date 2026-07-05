export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { badRequest } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';
import { generateManifest, validateManifest } from '@/lib/wedding/manifest';
import { safeJsonParse } from '@/lib/safe-json';

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/collections/deploy — ORGANIZER+, tenant-scoped
// ══════════════════════════════════════════════════════════════════════════════
// CANONICAL deploy endpoint (Slice 1 rewrite):
//   1. Reads Collection from DATABASE (not static catalog)
//   2. Generates a section-based manifest via generateManifest()
//   3. Persists WeddingCollectionBinding with the real manifest
//   4. Sets Wedding.collectionId + collectionVersion + variantId
//   5. Applies manifest theme to Theme row (4 CSS vars)
//   6. Stores luxury config in Theme.customizations for LuxuryVisualEngine
//
// The manifest is the SINGLE source of truth for public rendering.
// layout.tsx resolves the binding → manifest → SectionRenderer.
// ══════════════════════════════════════════════════════════════════════════════

async function deployCollectionHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized — authentication required' }, { status: 401 });
    }
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden — ORGANIZER+ role required' }, { status: 403 });
    }

    return await withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => ({}));
      const { collectionId, variantId } = body as {
        collectionId?: string;
        variantId?: string | null;
      };

      if (!collectionId) {
        return badRequest('collectionId est requis');
      }

      // ── Generate canonical manifest from DB Collection ────────────────────
      const manifest = await generateManifest(collectionId, variantId || null);
      if (!manifest) {
        return NextResponse.json(
          { error: 'Collection not found in database', collectionId },
          { status: 404 },
        );
      }

      // Validate before persisting (fail explicitly, no silent fallback)
      validateManifest(manifest);

      // ── Persist binding + wedding + theme in a transaction ─────────────────
      const manifestJson = JSON.stringify(manifest);
      const customizations = {
        collectionId: manifest.collectionId,
        collectionName: manifest.collectionName,
        collectionVersion: manifest.collectionVersion,
        luxury: manifest.luxury,
        penpot: null, // Penpot deferred (Slice 5)
      };

      const [binding, , theme] = await db.$transaction([
        db.weddingCollectionBinding.upsert({
          where: { weddingId: ctx.weddingId },
          update: {
            collectionId: manifest.collectionId,
            collectionVersion: manifest.collectionVersion,
            manifest: manifestJson,
            status: 'DEPLOYED',
            deployedAt: new Date(),
            deployedByUserId: user.id,
          },
          create: {
            weddingId: ctx.weddingId,
            collectionId: manifest.collectionId,
            collectionVersion: manifest.collectionVersion,
            manifest: manifestJson,
            status: 'DEPLOYED',
            deployedAt: new Date(),
            deployedByUserId: user.id,
          },
        }),
        db.wedding.update({
          where: { id: ctx.weddingId },
          data: {
            collectionId: manifest.collectionId,
            collectionVersion: manifest.collectionVersion,
            variantId: manifest.variantId,
          },
        }),
        db.theme.upsert({
          where: { weddingId: ctx.weddingId },
          update: {
            primaryColor: manifest.theme.primaryColor,
            accentColor: manifest.theme.accentColor,
            fontDisplay: manifest.theme.fontDisplay,
            fontBody: manifest.theme.fontBody,
            layout: manifest.sections.length <= 4 ? 'minimal' : 'classic',
            customizations: JSON.stringify(customizations),
          },
          create: {
            weddingId: ctx.weddingId,
            primaryColor: manifest.theme.primaryColor,
            accentColor: manifest.theme.accentColor,
            fontDisplay: manifest.theme.fontDisplay,
            fontBody: manifest.theme.fontBody,
            layout: manifest.sections.length <= 4 ? 'minimal' : 'classic',
            customizations: JSON.stringify(customizations),
          },
        }),
      ]);

      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'DEPLOY_COLLECTION',
        details: `Deployed Collection "${manifest.collectionName}" (${manifest.collectionSlug} v${manifest.collectionVersion}) — ${manifest.sections.filter(s => s.enabled).length} sections enabled, binding ${binding.id}`,
        request,
      });

      return NextResponse.json({
        success: true,
        manifest,
        themeApplied: {
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          fontDisplay: theme.fontDisplay,
          fontBody: theme.fontBody,
        },
        bindingId: binding.id,
      });
    }) as unknown as NextResponse;
  } catch (e) {
    logger.error('Deploy collection error', {
      errMessage: e instanceof Error ? e.message : String(e),
      errName: e instanceof Error ? e.name : 'Unknown',
    });
    return NextResponse.json(
      { error: 'Invalid request', detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export const POST = withRateLimit(10, 60_000)(deployCollectionHandler);
