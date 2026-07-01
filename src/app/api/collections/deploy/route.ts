export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getCollection } from '@/lib/collections/catalog';
import { countModules, countVariants } from '@/lib/collections/types';

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/collections/deploy — ORGANIZER+, tenant-scoped
// ══════════════════════════════════════════════════════════════════════════════
// Phase A (Sécurisation): wrapped in getAuthUser + hasPermission + withAdminTenantHandler
// so only authenticated ORGANIZER/PLATFORM_ADMIN users can deploy a Collection to
// the wedding they own. Previously this route was fully unauthenticated and could
// be called by anyone with the collectionId.
//
// Phase B (Données codées en dur): couple defaults are now fetched from the
// tenant's Settings rows (bride_name, groom_name) instead of the hardcoded
// "Josué" / "Hornella" fallbacks that leaked the default wedding's identity.
//
// Phase C/D (Déploiement réel): the route now also persists a
// WeddingCollectionBinding row, sets Wedding.collectionId / collectionVersion,
// and applies the Collection's DesignSystem to the Wedding's Theme row so the
// public site reflects the deployed Collection at render time.
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // ── Phase A: Authentication ──────────────────────────────────────────────
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized — authentication required' }, { status: 401 });
    }
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden — ORGANIZER+ role required' }, { status: 403 });
    }

    // ── Phase A: Tenant resolution (locks non-platform admins to their wedding) ──
    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => ({}));
      const { collectionId, variantSelections } = body as {
        collectionId?: string;
        variantSelections?: Record<string, string>;
      };

      if (!collectionId) {
        return NextResponse.json({ error: 'collectionId est requis' }, { status: 400 });
      }

      const collection = getCollection(collectionId);
      if (!collection) {
        return NextResponse.json(
          { error: 'Collection not found', collectionId },
          { status: 404 },
        );
      }

      // ── Phase B: Fetch couple identity from Settings (no hardcoded defaults) ──
      const settingsRows = await db.settings.findMany({
        where: { weddingId: ctx.weddingId },
        select: { key: true, value: true },
      });
      const settings = new Map(settingsRows.map((s) => [s.key, s.value]));
      const brideName = (settings.get('bride_name') || '').trim();
      const groomName = (settings.get('groom_name') || '').trim();
      const weddingDate = (settings.get('wedding_date') || '').trim();
      const venueName = (settings.get('venue_name') || '').trim();
      const hashtag = (settings.get('hashtag') || '').trim();
      const coupleLabel =
        [brideName, groomName].filter(Boolean).join(' & ') || 'Mariage';

      // ── Phase C/D: Persist binding + apply design system ──────────────────────
      // 1. Upsert WeddingCollectionBinding (single active binding per wedding)
      // 2. Set Wedding.collectionId + collectionVersion
      // 3. Apply the DesignSystem to the Wedding's Theme row
      const customizations = {
        collectionId: collection.id,
        collectionName: collection.name,
        collectionVersion: collection.version,
        designSystem: collection.designSystem,
        variantSelections: variantSelections || {},
        deployedAt: new Date().toISOString(),
        deployedBy: user.id,
      };

      const [binding, , theme] = await db.$transaction([
        db.weddingCollectionBinding.upsert({
          where: { weddingId: ctx.weddingId },
          update: {
            collectionId: collection.id,
            collectionVersion: collection.version,
            manifest: JSON.stringify(customizations),
            status: 'DEPLOYED',
            deployedAt: new Date(),
            deployedByUserId: user.id,
          },
          create: {
            weddingId: ctx.weddingId,
            collectionId: collection.id,
            collectionVersion: collection.version,
            manifest: JSON.stringify(customizations),
            status: 'DEPLOYED',
            deployedAt: new Date(),
            deployedByUserId: user.id,
          },
        }),
        db.wedding.update({
          where: { id: ctx.weddingId },
          data: {
            collectionId: collection.id,
            collectionVersion: collection.version,
          },
        }),
        db.theme.upsert({
          where: { weddingId: ctx.weddingId },
          update: {
            primaryColor: collection.designSystem.primary,
            accentColor: collection.designSystem.accent,
            fontDisplay: collection.designSystem.fontDisplay,
            fontBody: collection.designSystem.fontBody,
            layout: collection.designSystem.layout || 'classic',
            customizations: JSON.stringify(customizations),
          },
          create: {
            weddingId: ctx.weddingId,
            primaryColor: collection.designSystem.primary,
            accentColor: collection.designSystem.accent,
            fontDisplay: collection.designSystem.fontDisplay,
            fontBody: collection.designSystem.fontBody,
            layout: collection.designSystem.layout || 'classic',
            customizations: JSON.stringify(customizations),
          },
        }),
      ]);

      // Audit log
      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'DEPLOY_COLLECTION',
          details: `Deployed Collection "${collection.name}" (${collection.id} v${collection.version}) — binding ${binding.id}, theme ${theme.id}`,
        },
      });

      // ── Build deployment manifest (returned to caller) ───────────────────────
      const manifest = {
        bindingId: binding.id,
        collectionId: collection.id,
        collectionName: collection.name,
        collectionVersion: collection.version,
        designSystem: collection.designSystem,
        couple: {
          bride: brideName,
          groom: groomName,
          label: coupleLabel,
          date: weddingDate,
          venue: venueName,
          hashtag,
        },
        themeApplied: {
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          fontDisplay: theme.fontDisplay,
          fontBody: theme.fontBody,
          layout: theme.layout,
        },
        selections: collection.packs.flatMap((p) =>
          p.modules.map((m) => {
            const chosen = variantSelections?.[m.id] || m.variants[0]?.id || 'A';
            const variant = m.variants.find((v) => v.id === chosen) || m.variants[0];
            return {
              pack: p.id,
              packName: p.name,
              moduleId: m.id,
              moduleName: m.name,
              variantId: variant?.id,
              variantName: variant?.name,
              renderer: variant?.renderer,
              required: m.required,
            };
          }),
        ),
        stats: {
          packs: collection.packs.length,
          modules: countModules(collection),
          variants: countVariants(collection),
          completionPct: collection.completionPct,
        },
        deployedAt: new Date().toISOString(),
        deployedBy: user.id,
      };

      return NextResponse.json({
        success: true,
        manifest,
      });
    });
  } catch (e) {
    console.error('Deploy collection error:', e);
    return NextResponse.json(
      { error: 'Invalid request', detail: (e as Error).message },
      { status: 400 },
    );
  }
}
