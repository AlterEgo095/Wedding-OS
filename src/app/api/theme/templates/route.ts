export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { safeJsonParse } from '@/lib/safe-json';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/theme/templates — P3-UX (Sprint Premium tranche 2, PX-6)
// ══════════════════════════════════════════════════════════════════════════════
//
// Read-only catalog of PUBLISHED PlatformThemes, consumed by the guided setup
// wizard's Design step (/w/[slug]/setup) so an ORGANIZER can pick a template
// and apply it via the EXISTING POST /api/theme/apply-template.
//
// Why this endpoint exists (and why it is safe):
//   - The platform catalog endpoint (/api/platform/themes) is PLATFORM_ADMIN
//     gated — an ORGANIZER cannot call it from the wizard.
//   - This route reuses the exact same gate family as PUT /api/theme
//     (getAuthUser + hasPermission ORGANIZER+ + withAdminTenantHandler), so
//     the auth posture is identical to the theme-mutation surface already in
//     production.
//   - Strictly read-only: no mutation, no AuditLog noise, no cache
//     invalidation needed.
//   - Minimal projection: no id (cuid), no configJson full blob (the wizard
//     only needs preview swatches), no approval/lock metadata.
//
// Response: 200 { templates: [{ slug, name, category, tier, layout,
//   fontDisplay, fontBody, isPremium, isRecommended, palette: { primary,
//   accent, surface, surfaceDeep } }] }
//   - paletteJson is defensively parsed (safeJsonParse) and reduced to the 4
//     swatch keys the wizard preview renders; missing keys fall back to null
//     and the client renders a neutral swatch.

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async () => {
      const themes = await db.platformTheme.findMany({
        where: { status: 'PUBLISHED' },
        select: {
          slug: true,
          name: true,
          category: true,
          tier: true,
          fontDisplay: true,
          fontBody: true,
          isPremium: true,
          isRecommended: true,
          paletteJson: true,
        },
        orderBy: [{ isRecommended: 'desc' }, { name: 'asc' }],
      });

      const templates = themes.map((t) => {
        const palette = safeJsonParse(t.paletteJson, {}) as Record<string, unknown>;
        const pick = (...keys: string[]): string | null => {
          for (const k of keys) {
            const v = palette[k];
            if (typeof v === 'string' && v.length > 0) return v;
          }
          return null;
        };
        return {
          slug: t.slug,
          name: t.name,
          category: t.category,
          tier: t.tier,
          fontDisplay: t.fontDisplay,
          fontBody: t.fontBody,
          isPremium: t.isPremium,
          isRecommended: t.isRecommended,
          palette: {
            primary: pick('primary', 'primaryColor'),
            accent: pick('accent', 'accentColor'),
            surface: pick('surface'),
            surfaceDeep: pick('surfaceDeep', 'background'),
          },
        };
      });

      return NextResponse.json({ templates });
    });
  } catch (error) {
    logger.error('List theme templates error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
