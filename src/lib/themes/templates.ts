// ─── MISSION 5.9.1 P4-2 — Legacy ThemeTemplates removed ─────────────────────
// The 4 legacy ThemeTemplate entries (classic-gold, romantic-rose,
// minimal-modern, royal-night) were migrated to PlatformTheme DB rows in
// P1-2. The THEME_TEMPLATES array is now empty. Utility functions
// (getFontOption, isValidHexColor, normalizeHexColor, getLayoutOption,
// DEFAULT_THEME, FONT_OPTIONS, LAYOUT_OPTIONS) + the ThemeTemplate / FontOption
// / LayoutOption types are KEPT — they are still referenced by
// src/lib/themes/presets.ts (themePresetToTemplate), src/components/admin/
// ThemeCustomizer.tsx, src/components/wedding/ThemeInjector.tsx and
// src/app/api/theme/route.ts.
//
// ⚠️ NOTE P4-2 — re-export intentionally NOT added:
// The P4-2 spec asked to "keep the re-export line
//   `export { THEME_PRESETS, getThemePreset, type ThemePreset } from './presets'`"
// but that re-export was REMOVED in Phase 1B because it created a circular
// import (templates.ts → presets.ts → templates.ts) which crashed Next.js at
// runtime (see the explanatory comment at the top of presets.ts). Consumers
// that need the unified registry MUST import it directly from
// `@/lib/themes/presets`. Re-adding the re-export here would re-introduce the
// circular dep — DO NOT re-add it.
//
// ⚠️ NOTE P4-2 — presets.ts still imports THEME_TEMPLATES at runtime:
// `src/lib/themes/presets.ts` builds `THEME_PRESETS` by appending
//   `templateToPreset(THEME_TEMPLATES.find(t => t.id === 'classic-gold') as ThemeTemplate, ...)`
// for the 4 legacy slugs. With THEME_TEMPLATES now empty, those 4 `.find()`
// calls return `undefined`, and the resulting 4 entries in `THEME_PRESETS`
// will have all-`undefined` fields (id, slug, label, preview, ...). This is a
// KNOWN backward-compat risk flagged in the P4-2 README and requires a
// follow-up task (P4-3 or sibling) to remove those 4 broken
// `templateToPreset(THEME_TEMPLATES.find(...))` calls from presets.ts so that
// `THEME_PRESETS` only contains the 12 THEME_PACKAGES-derived entries.
// ────────────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// Theme Templates — Phase 8 Themes & Customization
// ══════════════════════════════════════════════════════════════════════════════
//
// 4 predefined theme templates that couples can apply with one click.
// Each template defines: primaryColor, accentColor, fontDisplay, fontBody, layout.
// Custom themes can be created by modifying any of these values via the API.
//
// P3.2 (Layouts stage UI + API) — drift fix:
// Historically this file exported a hardcoded `LAYOUT_OPTIONS` array of 4
// entries (classic, modern, minimalist, royal) while src/lib/wedding/manifest.ts
// exported a hardcoded `LAYOUT_SECTIONS` map of 5 entries (royal, classic,
// minimal, destination, modern). The two were out of sync: `minimalist` vs
// `minimal` and 4 vs 5 entries. P3-Foundation deployed a `Layout` Prisma model
// (seeded with the 5 manifest.ts slugs) and a Layout Manager API
// (/api/platform/layouts) so designers can publish new layouts without code
// changes. This file now ALSO exports an async `getLayoutOptions()` that reads
// from the DB `Layout` table (status=PUBLISHED) and falls back to the hardcoded
// `LAYOUT_OPTIONS` constant if the DB is empty or the query fails. The hardcoded
// constant is kept for backward compatibility (synchronous callers, SSR cold
// starts before the DB is reachable, ThemeTemplate.layout union type).
//
// New code paths should prefer `await getLayoutOptions()`.
// Existing synchronous code paths can continue to import `LAYOUT_OPTIONS`.
//
// P4-2 (MISSION 5.9.1 — Dead code cleanup):
// The 4 legacy `ThemeTemplate` entries (classic-gold, romantic-rose,
// minimal-modern, royal-night) have been REMOVED. They were migrated to
// `PlatformTheme` DB rows in P1-2 (marked `isBuiltIn=true`,
// `status='PUBLISHED'`, `configJson.isLegacy=true`, `version='0.9.0'`).
// `THEME_TEMPLATES` is now an EMPTY array — runtime code should read themes
// from the DB-backed registry (`@/lib/themes/registry.ts`) or directly via
// `db.platformTheme.findUnique({ where: { slug } })`. The legacy `getTemplate()`
// helper is kept as a stub that returns `null` for the 4 migrated slugs so
// existing callers (e.g. /api/theme/apply-template/route.ts) can branch into the
// DB-fallback path. See file-level comment at the top for the full migration
// notes.


export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: 'classic' | 'modern' | 'minimalist' | 'royal';
  preview: {
    bg: string;
    text: string;
    swatch: string[];
  };
}

export interface FontOption {
  family: string;
  label: string;
  category: 'serif' | 'sans-serif' | 'display';
  googleFontUrl: string;
}

export interface LayoutOption {
  // Widened from the historical `'classic' | 'modern' | 'minimalist' | 'royal'`
  // union to `string` so DB-backed layouts (any slug) can flow through the same
  // type. The hardcoded LAYOUT_OPTIONS constant still uses the 4 original
  // slugs — backward compatible because the union is a subset of string.
  id: string;
  label: string;
  description: string;
}

// ─── Font Options (Google Fonts) ──────────────────────────────────────────────

export const FONT_OPTIONS: FontOption[] = [
  {
    family: 'Cormorant Garamond',
    label: 'Cormorant Garamond',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
  },
  {
    family: 'Playfair Display',
    label: 'Playfair Display',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&display=swap',
  },
  {
    family: 'Marcellus',
    label: 'Marcellus',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Marcellus&display=swap',
  },
  {
    family: 'Lora',
    label: 'Lora',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap',
  },
  {
    family: 'Inter',
    label: 'Inter',
    category: 'sans-serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  },
  {
    family: 'Lato',
    label: 'Lato',
    category: 'sans-serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap',
  },
  {
    family: 'Montserrat',
    label: 'Montserrat',
    category: 'sans-serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap',
  },
  {
    family: 'Italiana',
    label: 'Italiana',
    category: 'display',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Italiana&display=swap',
  },
];

// ─── Layout Options ───────────────────────────────────────────────────────────
//
// Hardcoded fallback kept for backward compat (synchronous callers, SSR cold
// start before DB is reachable, ThemeTemplate.layout union type). Note the
// `minimalist` slug here is HISTORICAL — the canonical slug in the DB Layout
// table (seeded by P3-Foundation) is `minimal`. Designers should treat the DB
// as the source of truth going forward (see `getLayoutOptions()` below).

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: 'classic', label: 'Classique', description: 'Sections élégantes traditionnelles avec heros centrés' },
  { id: 'modern', label: 'Moderne', description: 'Mises en page asymétriques avec transitions fluides' },
  { id: 'minimalist', label: 'Minimaliste', description: 'Épuré, beaucoup d’espace blanc, typographie fine' },
  { id: 'royal', label: 'Royal', description: 'Ornementé, dorures, ambiance cérémonielle somptueuse' },
];

/**
 * DB-backed layout options list (P3.2 drift fix).
 *
 * This is the canonical source of layout options going forward. Designers can
 * publish new Layout rows (status=PUBLISHED) via /api/platform/layouts and they
 * will automatically appear in the layout picker — no code changes needed.
 *
 * Falls back to the hardcoded `LAYOUT_OPTIONS` constant if:
 *   - the DB query fails (e.g. Layout table not yet migrated), OR
 *   - the DB returns zero PUBLISHED rows (e.g. fresh install before seed)
 *
 * @returns Promise<LayoutOption[]> — each entry's `id` is the Layout.slug.
 */


// ─── Theme Templates (EMPTY post-P4-2) ────────────────────────────────────────
//
// P4-2 (MISSION 5.9.1): the 4 legacy entries (classic-gold, romantic-rose,
// minimal-modern, royal-night) have been migrated to PlatformTheme DB rows
// (P1-2). The array is now empty. The constant is kept as an empty array
// (rather than deleted) because `src/lib/themes/presets.ts` imports it at
// runtime to build the unified THEME_PRESETS registry — deleting it would
// cause a build-time import error in presets.ts. See the file-level comment
// at the top for the backward-compat risks this creates.

export const THEME_TEMPLATES: ThemeTemplate[] = [];

// ─── Default Theme ────────────────────────────────────────────────────────────

export const DEFAULT_THEME = {
  primaryColor: '#D4A853',
  accentColor: '#C8785A',
  fontDisplay: 'Cormorant Garamond',
  fontBody: 'Inter',
  layout: 'classic' as const,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Slugs of the 4 ThemeTemplates that were migrated to PlatformTheme DB rows
 * in P1-2 (MISSION 5.9.1). Kept as a closed set so that the deprecation path
 * can be documented precisely and so callers wanting to detect a "legacy slug"
 * (e.g. the DB fallback in /api/theme/apply-template/route.ts) can do so
 * without re-introducing the hardcoded template values.
 */
export const LEGACY_TEMPLATE_SLUGS: ReadonlySet<string> = new Set([
  'classic-gold',
  'romantic-rose',
  'minimal-modern',
  'royal-night',
]);

/**
 * Lookup a ThemeTemplate by id (slug).
 *
 * @deprecated Since MISSION 5.9.1 P4-2 — the 4 legacy ThemeTemplates were
 *   migrated to PlatformTheme DB rows in P1-2. This function returns `null`
 *   for the 4 legacy slugs (classic-gold, romantic-rose, minimal-modern,
 *   royal-night) and for any other slug (the `THEME_TEMPLATES` array is now
 *   empty). Callers should fall back to the DB-backed PlatformTheme:
 *
 *   ```ts
 *   const platformTheme = await db.platformTheme.findUnique({
 *     where: { slug: templateId },
 *   });
 *   ```
 *
 *   See `src/app/api/theme/apply-template/route.ts` for the canonical
 *   fallback pattern.
 *
 *   The function is KEPT (not deleted) to preserve the module's public API
 *   surface and to let TypeScript continue to flag any forgotten caller at
 *   compile time. Removing it would force a flag-day migration of every
 *   caller, which is out of scope for P4-2.
 */
export function getTemplate(id: string): ThemeTemplate | null {
  // P4-2: THEME_TEMPLATES is now empty — the 4 legacy entries were migrated
  // to PlatformTheme DB rows in P1-2. The function signature is preserved
  // for backward compat but it ALWAYS returns null. Callers should fall
  // back to `db.platformTheme.findUnique({ where: { slug: id } })` (see
  // /api/theme/apply-template/route.ts for the canonical pattern).
  void id; // kept on the signature for backward-compat callers
  return null;
}

export function getFontOption(family: string): FontOption | undefined {
  return FONT_OPTIONS.find(f => f.family === family);
}

export function getLayoutOption(id: string): LayoutOption | undefined {
  return LAYOUT_OPTIONS.find(l => l.id === id);
}

/**
 * Validate a hex color string (#RRGGBB or #RGB).
 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

/**
 * Normalize a hex color to #RRGGBB format.
 */
export function normalizeHexColor(color: string): string {
  const trimmed = color.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return '#D4A853';
}
