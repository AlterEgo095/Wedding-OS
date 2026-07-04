export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { internalError } from '@/lib/api-errors';

/**
 * GET /api/platform/collections  (PLATFORM_ADMIN)
 *
 * Returns ALL active + published + commercialized Collections with their
 * variants — WITHOUT plan-gating. Used by the onboarding wizard's Collection
 * picker (Step 3) so the platform admin can see the full catalog regardless
 * of the couple's chosen plan. Plan-gating is enforced at deploy time by
 * `deployCollection()` → `canAccessCollection()`.
 *
 * Unlike the public GET /api/collections (which filters by the resolved
 * tenant's plan), this endpoint returns every Collection and includes the
 * `tier` field so the wizard UI can show access warnings (e.g. "Collection
 * EXCLUSIVE — nécessite le plan ELITE").
 *
 * Response shape:
 *   {
 *     collections: Array<{
 *       id, slug, name, description, thumbnailUrl, category, tier, sortOrder,
 *       themeSeed: { primaryColor, accentColor, fontDisplay, fontBody, layout },
 *       luxuryPreset: LuxuryPreset | null,
 *       variants: Array<{ id, code, name, paletteOverride, isDefault }>
 *     }>
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const rows = await db.collection.findMany({
      where: {
        isActive: true,
        isPublished: true,
        status: 'COMMERCIALISE',
      },
      include: {
        variants: { orderBy: { code: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const collections = rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      thumbnailUrl: c.thumbnailUrl,
      category: c.category,
      tier: c.tier,
      sortOrder: c.sortOrder,
      themeSeed: JSON.parse(c.themeSeed),
      luxuryPreset: c.luxuryPreset ? JSON.parse(c.luxuryPreset) : null,
      variants: c.variants.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        paletteOverride: v.paletteOverride ? JSON.parse(v.paletteOverride) : null,
        isDefault: v.isDefault,
      })),
    }));

    return NextResponse.json({ collections });
  } catch (error: unknown) {
    logger.error('Platform list collections error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
