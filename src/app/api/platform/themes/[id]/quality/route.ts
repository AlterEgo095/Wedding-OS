export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { computeThemeQualityScore } from '@/lib/quality/scorecard';

/**
 * GET /api/platform/themes/[id]/quality
 *
 * Returns the per-theme quality scorecard (6 dimensions) for a PlatformTheme.
 *
 * MISSION 5.9.2 P2-7 — exposes the `computeThemeQualityScore` pure function
 * to the ThemesManager UI so each theme card can display a quality badge
 * (good/warning/critical) without recomputing the rubric client-side.
 *
 * Auth: PLATFORM_ADMIN only (mirrors /api/platform/themes/* routes).
 * Shape: identical to the themes route THEME_SELECT (so the score function
 *        receives exactly the fields it declares in ThemeQualityInput).
 */

const THEME_QUALITY_SELECT = {
  id: true,
  slug: true,
  name: true,
  paletteJson: true,
  fontDisplay: true,
  fontBody: true,
  isBuiltIn: true,
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  tier: true,
  category: true,
  version: true,
  identity: true,
  configJson: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const theme = await db.platformTheme.findUnique({
      where: { id },
      select: THEME_QUALITY_SELECT,
    });

    if (!theme) return notFound('Thème introuvable');

    // Defensive: the seed always writes `paletteJson` + `configJson` as valid
    // JSON strings, but user-created themes (POST endpoint) might store '{}'.
    // `computeThemeQualityScore` is a pure function — it never throws and
    // never touches the DB, so this call is safe to make inline.
    const score = await computeThemeQualityScore({
      id: theme.id,
      slug: theme.slug,
      name: theme.name,
      paletteJson: theme.paletteJson ?? '{}',
      fontDisplay: theme.fontDisplay,
      fontBody: theme.fontBody,
      isBuiltIn: theme.isBuiltIn,
      isPremium: theme.isPremium,
      isRecommended: theme.isRecommended,
      isDefault: theme.isDefault,
      tier: theme.tier,
      category: theme.category,
      version: theme.version,
      identity: theme.identity,
      configJson: theme.configJson ?? '{}',
    });

    // Return the score at the top level (not nested under `score`) so the
    // ThemesManager can read json.overall + json.tier directly.
    return NextResponse.json(score);
  } catch (error) {
    logger.error('Theme quality score error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
