export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as platformDb, db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';
import { invalidateWeddingCache } from '@/lib/wedding/cache';
import { safeJsonParse } from '@/lib/safe-json';
import {
  IDENTITY_PRESETS,
  getIdentityPreset,
  identityPresetToThemePreset,
  isWeddingIdentity,
} from '@/lib/themes/identity-presets';

/**
 * POST /api/platform/themes/[id]/apply
 *
 * MISSION 5.9.2 P0 (QW6) — Apply a PlatformTheme to a Wedding.
 *
 * This endpoint closes the P0-1 gap identified in audit 5.9.1: the Super Admin
 * previously had no way to apply any of the 21 visually distinct designs to a
 * real wedding. This endpoint:
 *
 *   1. Looks up the PlatformTheme by [id] (platform DB, not tenant-scoped).
 *   2. Resolves the full theme config:
 *      - If the PlatformTheme has an `identity` field (e.g. 'royal-luxury'),
 *        resolves the identity preset and builds the full config via
 *        `identityPresetToThemePreset()` (all 13 CSS tokens + pattern +
 *        ambiance + motionTier + sectionOverrides).
 *      - Otherwise, builds the config from the PlatformTheme's paletteJson +
 *        fontDisplay + fontBody fields.
 *   3. Upserts the Wedding's Theme row with:
 *      - primaryColor, accentColor, fontDisplay, fontBody, layout (top-level)
 *      - customizations JSON blob containing: identity, surface, surfaceDeep,
 *        text, textMuted, pattern, ambiance, primaryLight, primaryDark,
 *        accentLight, motionTier, sectionOverrides (read by ThemeInjector QW2)
 *   4. Writes an audit log.
 *   5. Invalidates the wedding cache so the new theme takes effect immediately.
 *
 * Auth: PLATFORM_ADMIN only (Super Admin operation).
 */
const applySchema = z.object({
  weddingId: z.string().min(1).max(100),
});

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id: themeId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'weddingId est requis');
    }
    const { weddingId } = parsed.data;

    // ── 1. Look up the PlatformTheme ──────────────────────────────────────
    const platformTheme = await platformDb.platformTheme.findUnique({
      where: { id: themeId },
    });
    if (!platformTheme) return notFound('Thème introuvable');

    // ── 2. Verify the wedding exists ──────────────────────────────────────
    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: { id: true, slug: true, coupleLabel: true },
    });
    if (!wedding) return notFound('Mariage introuvable');

    // ── 3. Resolve the full theme config ──────────────────────────────────
    // If the PlatformTheme has an `identity` field, use the identity preset
    // (rich config: all 13 CSS tokens + pattern + ambiance + motionTier +
    // sectionOverrides). Otherwise, fall back to the paletteJson + fonts.
    let themeConfig: {
      primaryColor: string;
      accentColor: string;
      fontDisplay: string;
      fontBody: string;
      layout: string;
      customizations: Record<string, unknown>;
    };

    let identitySlug: string | null = null;

    if (platformTheme.identity && isWeddingIdentity(platformTheme.identity)) {
      // ── Identity preset path (rich config) ─────────────────────────────
      const identityPreset = getIdentityPreset(platformTheme.identity);
      if (!identityPreset) {
        return badRequest(`Identité "${platformTheme.identity}" introuvable dans le registre`);
      }
      const fullPreset = identityPresetToThemePreset(identityPreset);
      identitySlug = platformTheme.identity;

      themeConfig = {
        primaryColor: fullPreset.primaryColor,
        accentColor: fullPreset.accentColor,
        fontDisplay: fullPreset.fontDisplay,
        fontBody: fullPreset.fontBody,
        layout: fullPreset.layout,
        customizations: {
          identity: identitySlug,
          surface: fullPreset.surface ?? null,
          surfaceDeep: fullPreset.surfaceDeep ?? null,
          text: fullPreset.text ?? null,
          textMuted: fullPreset.textMuted ?? null,
          primaryLight: fullPreset.primaryLight ?? null,
          primaryDark: fullPreset.primaryDark ?? null,
          accentLight: fullPreset.accentLight ?? null,
          pattern: fullPreset.pattern ?? null,
          ambiance: fullPreset.ambiance ?? null,
          motionTier: fullPreset.motionTier ?? null,
          copyTone: fullPreset.copyTone ?? null,
          sectionOverrides: identityPreset.sectionOverrides,
          preview: identityPreset.preview,
          platformThemeId: platformTheme.id,
          platformThemeSlug: platformTheme.slug,
          // P4-5 — copy assetsJson so ThemeInjector can inject --theme-background-image + --theme-pattern-image
          assetsJson: platformTheme.assetsJson,
        },
      };
    } else {
      // ── Fallback path: paletteJson + fonts ─────────────────────────────
      const palette = safeJsonParse(platformTheme.paletteJson, {}) as Record<string, unknown>;
      themeConfig = {
        primaryColor:
          (typeof palette.primary === 'string' && palette.primary) ||
          (typeof palette.primaryColor === 'string' && palette.primaryColor) ||
          '#D4A853',
        accentColor:
          (typeof palette.accent === 'string' && palette.accent) ||
          (typeof palette.accentColor === 'string' && palette.accentColor) ||
          '#C8785A',
        fontDisplay: platformTheme.fontDisplay ?? 'Cormorant Garamond',
        fontBody: platformTheme.fontBody ?? 'Inter',
        layout: (typeof palette.layout === 'string' && palette.layout) || 'classic',
        customizations: {
          surface: typeof palette.surface === 'string' ? palette.surface : null,
          surfaceDeep: typeof palette.surfaceDeep === 'string' ? palette.surfaceDeep : null,
          text: typeof palette.text === 'string' ? palette.text : null,
          textMuted: typeof palette.textMuted === 'string' ? palette.textMuted : null,
          primaryLight: typeof palette.primaryLight === 'string' ? palette.primaryLight : null,
          primaryDark: typeof palette.primaryDark === 'string' ? palette.primaryDark : null,
          accentLight: typeof palette.accentLight === 'string' ? palette.accentLight : null,
          platformThemeId: platformTheme.id,
          platformThemeSlug: platformTheme.slug,
          // P4-5 — copy assetsJson so ThemeInjector can inject --theme-background-image + --theme-pattern-image
          assetsJson: platformTheme.assetsJson,
        },
      };
    }

    // ── 4. Upsert the Wedding's Theme row ─────────────────────────────────
    const client = getClientInfo(request);
    const customizationsJson = JSON.stringify(themeConfig.customizations);

    const theme = await db.theme.upsert({
      where: { weddingId: wedding.id },
      update: {
        primaryColor: themeConfig.primaryColor,
        accentColor: themeConfig.accentColor,
        fontDisplay: themeConfig.fontDisplay,
        fontBody: themeConfig.fontBody,
        layout: themeConfig.layout,
        customizations: customizationsJson,
      },
      create: {
        weddingId: wedding.id,
        primaryColor: themeConfig.primaryColor,
        accentColor: themeConfig.accentColor,
        fontDisplay: themeConfig.fontDisplay,
        fontBody: themeConfig.fontBody,
        layout: themeConfig.layout,
        customizations: customizationsJson,
      },
    });

    // ── 5. Write audit log ────────────────────────────────────────────────
    await db.auditLog.create({
      data: {
        weddingId: wedding.id,
        userId: user!.id,
        action: 'APPLY_PLATFORM_THEME',
        details: `Applied platform theme "${platformTheme.name}" (${platformTheme.slug})${identitySlug ? ` with identity "${identitySlug}"` : ''} to wedding ${wedding.slug}`,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      },
    });

    // ── 6. Invalidate the wedding cache ───────────────────────────────────
    try {
      await invalidateWeddingCache(wedding.slug);
    } catch {
      // Cache invalidation failure is non-fatal — the theme will still apply
      // on the next cache miss (5-min fallback revalidate).
    }

    logger.info('Platform theme applied', {
      themeId: platformTheme.id,
      themeSlug: platformTheme.slug,
      weddingId: wedding.id,
      weddingSlug: wedding.slug,
      identity: identitySlug,
    });

    return NextResponse.json({
      ok: true,
      theme: {
        id: theme.id,
        weddingId: theme.weddingId,
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
        fontDisplay: theme.fontDisplay,
        fontBody: theme.fontBody,
        layout: theme.layout,
        customizations: themeConfig.customizations,
      },
      platformTheme: {
        id: platformTheme.id,
        name: platformTheme.name,
        slug: platformTheme.slug,
        identity: identitySlug,
      },
      wedding: {
        id: wedding.id,
        slug: wedding.slug,
      },
    });
  } catch (error) {
    logger.error('Apply platform theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(20, 60_000)(postHandler);
