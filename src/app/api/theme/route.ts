export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
import { isValidHexColor, normalizeHexColor, getLayoutOption, getFontOption, DEFAULT_THEME } from '@/lib/themes/templates';

// GET /api/theme — public, returns the theme for the resolved wedding
export const GET = withPublicTenant(async (_req, ctx) => {
  try {
    const theme = await db.theme.findUnique({
      where: { weddingId: ctx.weddingId },
    });

    // Return theme or defaults
    const response = {
      primaryColor: theme?.primaryColor ?? DEFAULT_THEME.primaryColor,
      accentColor: theme?.accentColor ?? DEFAULT_THEME.accentColor,
      fontDisplay: theme?.fontDisplay ?? DEFAULT_THEME.fontDisplay,
      fontBody: theme?.fontBody ?? DEFAULT_THEME.fontBody,
      layout: theme?.layout ?? DEFAULT_THEME.layout,
      customizations: theme?.customizations ? JSON.parse(theme.customizations) : null,
      wedding: {
        slug: ctx.slug,
        isDefault: ctx.isDefault,
        status: ctx.status,
        plan: ctx.plan,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get theme error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// PUT /api/theme — ORGANIZER+ only, upserts the theme for the resolved wedding
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json();
      const { primaryColor, accentColor, fontDisplay, fontBody, layout, customizations } = body as {
        primaryColor?: string;
        accentColor?: string;
        fontDisplay?: string;
        fontBody?: string;
        layout?: string;
        customizations?: Record<string, unknown>;
      };

      // Validate colors
      if (primaryColor !== undefined && !isValidHexColor(primaryColor)) {
        return NextResponse.json({ error: 'Couleur primaire invalide (format #RRGGBB requis)' }, { status: 400 });
      }
      if (accentColor !== undefined && !isValidHexColor(accentColor)) {
        return NextResponse.json({ error: 'Couleur d\'accent invalide (format #RRGGBB requis)' }, { status: 400 });
      }

      // Validate layout
      if (layout !== undefined && !getLayoutOption(layout)) {
        return NextResponse.json({ error: 'Layout invalide (classic, modern, minimalist, royal)' }, { status: 400 });
      }

      // Validate fonts
      if (fontDisplay !== undefined && !getFontOption(fontDisplay)) {
        return NextResponse.json({ error: `Police d'affichage invalide` }, { status: 400 });
      }
      if (fontBody !== undefined && !getFontOption(fontBody)) {
        return NextResponse.json({ error: 'Police de corps invalide' }, { status: 400 });
      }

      // Build update data
      const updateData: Record<string, string | null> = {};
      if (primaryColor !== undefined) updateData.primaryColor = normalizeHexColor(primaryColor);
      if (accentColor !== undefined) updateData.accentColor = normalizeHexColor(accentColor);
      if (fontDisplay !== undefined) updateData.fontDisplay = fontDisplay;
      if (fontBody !== undefined) updateData.fontBody = fontBody;
      if (layout !== undefined) updateData.layout = layout;
      if (customizations !== undefined) updateData.customizations = JSON.stringify(customizations);

      const theme = await db.theme.upsert({
        where: { weddingId: ctx.weddingId },
        update: updateData,
        create: {
          weddingId: ctx.weddingId,
          primaryColor: updateData.primaryColor ?? DEFAULT_THEME.primaryColor,
          accentColor: updateData.accentColor ?? DEFAULT_THEME.accentColor,
          fontDisplay: updateData.fontDisplay ?? DEFAULT_THEME.fontDisplay,
          fontBody: updateData.fontBody ?? DEFAULT_THEME.fontBody,
          layout: updateData.layout ?? DEFAULT_THEME.layout,
          customizations: updateData.customizations ?? null,
        },
      });

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'UPDATE_THEME',
          details: `Theme updated: ${Object.keys(updateData).join(', ')}`,
        },
      });

      return NextResponse.json({
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
        fontDisplay: theme.fontDisplay,
        fontBody: theme.fontBody,
        layout: theme.layout,
        customizations: theme.customizations ? JSON.parse(theme.customizations) : null,
      });
    });
  } catch (error) {
    console.error('Update theme error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
