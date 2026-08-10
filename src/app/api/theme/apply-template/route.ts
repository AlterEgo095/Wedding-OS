export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getTemplate, normalizeHexColor, DEFAULT_THEME } from '@/lib/themes/templates';
// P4-2: safeJsonParse is used to parse the PlatformTheme.paletteJson + configJson
// blobs in the DB fallback path.
import { safeJsonParse } from '@/lib/safe-json';
// P2-CQ-5: standardised API errors.
import { badRequest } from '@/lib/api-errors';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

// ─── P4-2: legacy ThemeTemplates removed — DB fallback ───────────────────────
// P4-2 (MISSION 5.9.1): the 4 legacy ThemeTemplates (classic-gold, romantic-rose,
// minimal-modern, royal-night) were migrated to PlatformTheme DB rows in P1-2.
// The TS-side `getTemplate()` now ALWAYS returns null (see
// `src/lib/themes/templates.ts` for the deprecation JSDoc). This route therefore
// ALWAYS falls through to the DB-backed `PlatformTheme` lookup below.
//
// The TS template code path is KEPT for backward compat (in case a future
// template is reintroduced in code) but is effectively dead — `getTemplate()`
// will never return a non-null value post-P4-2.
//
// Migration contract — the 4 legacy PlatformTheme rows are seeded with:
//   slug:           'classic-gold' | 'romantic-rose' | 'minimal-modern' | 'royal-night'
//   name:           'Or Classique' | 'Rose Romantique' | 'Minimal Moderne' | 'Nuit Royale'
//   paletteJson:    {"primary":"#...","accent":"#...",...}
//   fontDisplay:    'Cormorant Garamond' | 'Playfair Display' | 'Marcellus' | 'Italiana'
//   fontBody:       'Inter' | 'Lato' | 'Montserrat' | 'Lora'
//   configJson.layout: 'classic' | 'modern' | 'minimalist' | 'royal'
//   isBuiltIn:      true
//   status:         'PUBLISHED'
//   configJson.isLegacy: true (P1-2 marker)
// ────────────────────────────────────────────────────────────────────────────

// POST /api/theme/apply-template — ORGANIZER+, applies a predefined template
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { templateId } = body as { templateId?: string };

      if (!templateId) {
        return NextResponse.json({ error: 'templateId est requis' }, { status: 400 });
      }

      // ── 1. Try the legacy TS-side getTemplate() ────────────────────────────
      // P4-2: this path is now dead — getTemplate() always returns null. The
      // code is kept for backward compat so a future re-introduction of an
      // in-code template wouldn't require touching this route.
      const template = getTemplate(templateId);

      // Resolved theme values (primary, accent, fonts, layout) + a human label
      // for the audit log. The source depends on whether the TS template path
      // or the DB PlatformTheme fallback provided them.
      let primaryColor: string;
      let accentColor: string;
      let fontDisplay: string;
      let fontBody: string;
      let layout: string;
      let appliedLabel: string;
      let appliedSource: 'TS_TEMPLATE' | 'DB_PLATFORM_THEME';

      if (template) {
        // ── Backward compat: TS template found (theoretically won't happen post-P4-2)
        primaryColor = normalizeHexColor(template.primaryColor);
        accentColor = normalizeHexColor(template.accentColor);
        fontDisplay = template.fontDisplay;
        fontBody = template.fontBody;
        layout = template.layout;
        appliedLabel = `${template.name} (${template.id})`;
        appliedSource = 'TS_TEMPLATE';
      } else {
        // ── P4-2: DB fallback — read the PlatformTheme row by slug ──────────
        // This is the canonical path post-P4-2. We look up the PlatformTheme
        // by its slug (which equals the legacy ThemeTemplate id for the 4
        // migrated themes), parse paletteJson for the colors, configJson for
        // the layout, and use the fontDisplay/fontBody columns.
        const platformTheme = await db.platformTheme.findUnique({
          where: { slug: templateId },
          select: {
            id: true,
            name: true,
            slug: true,
            paletteJson: true,
            configJson: true,
            fontDisplay: true,
            fontBody: true,
            status: true,
            isBuiltIn: true,
          },
        });

        if (!platformTheme) {
          return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
        }

        // Only PUBLISHED themes can be applied. ARCHIVED / DRAFT themes are
        // rejected (matches the catalog visibility rules in
        // /api/platform/themes GET).
        if (platformTheme.status !== 'PUBLISHED') {
          return NextResponse.json(
            { error: `Template "${templateId}" n'est pas publié (statut: ${platformTheme.status})` },
            { status: 409 },
          );
        }

        // ── Parse paletteJson — colors ─────────────────────────────────────
        // Schema (per the migration seed + /api/platform/themes/[id]/apply):
        //   { "primary":"#...", "accent":"#...", "primaryLight":null, ... }
        // We read primary/accent defensively (string + non-empty). If the
        // palette is malformed or missing the keys, fall back to DEFAULT_THEME
        // so the apply never crashes the wedding page.
        const palette = safeJsonParse<Record<string, unknown>>(
          platformTheme.paletteJson,
          {},
        );
        const primaryRaw =
          (typeof palette.primary === 'string' && palette.primary) ||
          (typeof palette.primaryColor === 'string' && palette.primaryColor) ||
          '';
        const accentRaw =
          (typeof palette.accent === 'string' && palette.accent) ||
          (typeof palette.accentColor === 'string' && palette.accentColor) ||
          '';

        primaryColor = primaryRaw ? normalizeHexColor(primaryRaw) : DEFAULT_THEME.primaryColor;
        accentColor = accentRaw ? normalizeHexColor(accentRaw) : DEFAULT_THEME.accentColor;

        // ── Fonts — prefer the columns, fall back to configJson, then DEFAULT ─
        // configJson fonts shape:
        //   { "fonts": { "display": "Cormorant Garamond", "body": "Inter" }, ... }
        const config = safeJsonParse<Record<string, unknown>>(
          platformTheme.configJson,
          {},
        );
        const configFonts =
          config.fonts && typeof config.fonts === 'object'
            ? (config.fonts as Record<string, unknown>)
            : {};

        fontDisplay =
          (platformTheme.fontDisplay ??
            (typeof configFonts.display === 'string' ? configFonts.display : '')) ||
          DEFAULT_THEME.fontDisplay;
        fontBody =
          (platformTheme.fontBody ??
            (typeof configFonts.body === 'string' ? configFonts.body : '')) ||
          DEFAULT_THEME.fontBody;

        // ── Layout — read from configJson.layout (paletteJson has no layout) ─
        // configJson layout shape: { "layout": "classic"|"modern"|"minimalist"|"royal", ... }
        // Falls back to DEFAULT_THEME.layout if absent.
        const configLayout =
          typeof config.layout === 'string' && config.layout
            ? config.layout
            : '';
        layout = configLayout || DEFAULT_THEME.layout;

        appliedLabel = `${platformTheme.name} (${platformTheme.slug})`;
        appliedSource = 'DB_PLATFORM_THEME';
      }

      // ── 2. Apply resolved theme values to the Wedding's Theme row ──────────
      const theme = await db.theme.upsert({
        where: { weddingId: ctx.weddingId },
        update: {
          primaryColor,
          accentColor,
          fontDisplay,
          fontBody,
          layout,
        },
        create: {
          weddingId: ctx.weddingId,
          primaryColor,
          accentColor,
          fontDisplay,
          fontBody,
          layout,
        },
      });

      // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
      // P4-2: the audit details now include the source (TS_TEMPLATE vs
      // DB_PLATFORM_THEME) so the migration is observable in the audit trail.
      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'APPLY_THEME_TEMPLATE',
        details: `Applied template: ${appliedLabel} [source=${appliedSource}]`,
        request,
      });

      return NextResponse.json({
        template: { id: templateId, name: appliedLabel },
        source: appliedSource,
        theme: {
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          fontDisplay: theme.fontDisplay,
          fontBody: theme.fontBody,
          layout: theme.layout,
        },
      });
    });
  } catch (error) {
    logger.error('Apply theme template error', { err: error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
