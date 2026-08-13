'use client';

import { useEffect } from 'react';
import { getFontOption } from '@/lib/themes/templates';

/**
 * Extended theme token set.
 *
 * MISSION 5.9.2 P0 (QW2) — Activate 9 dead --theme-* CSS tokens.
 *
 * The original ThemeInjector only set 4 of 13 --theme-* CSS variables
 * (primary, accent, font-display, font-body). The other 9 were declared in
 * globals.css with fallbacks but NEVER set per-wedding, silently neutering
 * identity presets' dark surfaces, patterns, ambiance gradients, and motion
 * tiers on the production render path.
 *
 * This update reads the extended tokens from the `customizations` JSON blob
 * (populated by the apply endpoint QW6 + identity preset QW5) and sets ALL
 * 13 --theme-* CSS variables when the data is present.
 *
 * MISSION 5.9.2 P4-5 — Theme asset management.
 *
 * ThemeInjector now also reads the optional `assetsJson` blob (background +
 * pattern image URLs) and surfaces them as two NEW CSS custom properties:
 *   --theme-background-image  (from assetsJson.background.url)
 *   --theme-pattern-image     (from assetsJson.pattern.url)
 * These are distinct from `--theme-pattern` (which carries a CSS gradient/
 * color from the identity preset). The wedding frontend's CSS can consume
 * them e.g. `body { background-image: var(--theme-background-image); }` or a
 * decorative overlay div with `background: var(--theme-pattern-image)`.
 */
interface ThemeData {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
  // Optional customizations blob — contains the extended theme tokens.
  // Populated by the apply endpoint (QW6) which writes the full identity
  // preset config (surface, surfaceDeep, text, textMuted, pattern, ambiance,
  // primaryLight, primaryDark, accentLight, motionTier) into customizations.
  customizations?: Record<string, unknown> | null;
  // P4-5 — Optional assetsJson string (PlatformTheme.assetsJson copy).
  // Shape: { background: { url, alt? }, pattern: { url, repeat? } }
  // When present, the background.url + pattern.url are surfaced as
  // --theme-background-image + --theme-pattern-image CSS vars.
  assetsJson?: string | null;
}

// ─── CONS-6-PIPELINE — optional theme prop ───────────────────────────────────
export interface ThemeInjectorProps {
  theme?: {
    primaryColor: string;
    accentColor: string;
    fontDisplay: string;
    fontBody: string;
    layout: string;
    customizations?: Record<string, unknown> | null;
    // P4-5 — assetsJson carried through from the published PlatformTheme.
    assetsJson?: string | null;
  } | null;
}

/**
 * The complete set of --theme-* CSS variables that ThemeInjector manages.
 * Used for both setting (on apply) and removing (on cleanup) so no stale
 * variables leak between weddings.
 */
const THEME_CSS_VARS = [
  '--theme-primary',
  '--theme-accent',
  '--theme-font-display',
  '--theme-font-body',
  '--theme-surface',
  '--theme-surface-deep',
  '--theme-text',
  '--theme-text-muted',
  '--theme-primary-light',
  '--theme-primary-dark',
  '--theme-accent-light',
  '--theme-pattern',
  '--theme-ambiance',
  // P4-5 — asset image URLs (background + pattern).
  // Distinct from --theme-pattern (gradient/color from identity preset).
  '--theme-background-image',
  '--theme-pattern-image',
] as const;

/**
 * Safely read a string value from the customizations blob.
 */
function getString(customizations: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const val = customizations?.[key];
  return typeof val === 'string' && val.length > 0 ? val : undefined;
}

/**
 * Apply a theme blob to the document root (CSS variables + Google Fonts).
 *
 * Sets ALL 13 --theme-* CSS variables:
 *   - 4 core tokens (primary, accent, font-display, font-body) — always set
 *   - 9 extended tokens (surface, surfaceDeep, text, textMuted, pattern,
 *     ambiance, primaryLight, primaryDark, accentLight) — set only when
 *     present in the customizations blob (identity-aware themes).
 */
function applyThemeData(data: ThemeData) {
  const root = document.documentElement;

  // ── Core 4 tokens (always set — these are the canonical theme fields) ────
  root.style.setProperty('--theme-primary', data.primaryColor);
  root.style.setProperty('--theme-accent', data.accentColor);
  root.style.setProperty('--theme-font-display', `'${data.fontDisplay}', serif`);
  root.style.setProperty('--theme-font-body', `'${data.fontBody}', sans-serif`);

  // ── P1-1 FIX (5.8.11-FIX): propagate theme to Tailwind utility classes ──
  // The wedding frontend components use Tailwind utilities like `text-gold`,
  // `font-serif`, `font-display` which resolve to CSS vars `--gold`,
  // `--font-serif`, `--font-display` (defined in globals.css @theme inline).
  // WITHOUT this propagation, those utilities resolve to the hardcoded
  // defaults from globals.css (--gold=oklch gold ≈ not #D4AF37, --font-serif
  // = Georgia, --font-display = Geist Sans) — ignoring the per-wedding theme.
  // By overriding these vars here, `text-gold` follows --theme-primary,
  // `font-serif`/`font-display` follow --theme-font-display. This is
  // ADDITIVE — when no theme is applied, the globals.css defaults stand.
  if (data.primaryColor) {
    root.style.setProperty('--gold', data.primaryColor);
    root.style.setProperty('--brand-gold', data.primaryColor);
    // Also override --primary so `text-primary` follows the theme.
    root.style.setProperty('--primary', data.primaryColor);
  }
  if (data.fontDisplay) {
    const displayFontFamily = `'${data.fontDisplay}', serif`;
    root.style.setProperty('--font-display', displayFontFamily);
    root.style.setProperty('--font-serif', displayFontFamily);
  }

  // ── Extended 9 tokens (set only when present in customizations) ──────────
  // These activate identity presets' dark surfaces, patterns, ambiance
  // gradients, and color variants. When absent, the CSS fallbacks in
  // globals.css take over (backward compatible with non-identity weddings).
  const c = data.customizations ?? null;

  const surface = getString(c, 'surface');
  if (surface) root.style.setProperty('--theme-surface', surface);

  const surfaceDeep = getString(c, 'surfaceDeep');
  if (surfaceDeep) root.style.setProperty('--theme-surface-deep', surfaceDeep);

  const text = getString(c, 'text');
  if (text) root.style.setProperty('--theme-text', text);

  const textMuted = getString(c, 'textMuted');
  if (textMuted) root.style.setProperty('--theme-text-muted', textMuted);

  const primaryLight = getString(c, 'primaryLight');
  if (primaryLight) root.style.setProperty('--theme-primary-light', primaryLight);

  const primaryDark = getString(c, 'primaryDark');
  if (primaryDark) root.style.setProperty('--theme-primary-dark', primaryDark);

  const accentLight = getString(c, 'accentLight');
  if (accentLight) root.style.setProperty('--theme-accent-light', accentLight);

  const pattern = getString(c, 'pattern');
  if (pattern) root.style.setProperty('--theme-pattern', pattern);

  const ambiance = getString(c, 'ambiance');
  if (ambiance) root.style.setProperty('--theme-ambiance', ambiance);

  // ── P4-5 — Theme assets (background + pattern images) ────────────────────
  // assetsJson is the PlatformTheme.assetsJson string copied into the
  // wedding's published theme config. We surface the URLs as CSS custom
  // properties so the wedding frontend's CSS can consume them via
  // `var(--theme-background-image)` / `var(--theme-pattern-image)`.
  applyThemeAssets(data.assetsJson);

  // ── Load Google Fonts for display + body fonts ───────────────────────────
  const displayFont = getFontOption(data.fontDisplay);
  const bodyFont = getFontOption(data.fontBody);

  const fontsToLoad = new Set<string>();
  if (displayFont) fontsToLoad.add(displayFont.googleFontUrl);
  if (bodyFont) fontsToLoad.add(bodyFont.googleFontUrl);

  for (const url of fontsToLoad) {
    const linkId = `theme-font-${btoa(url).replace(/[/+=]/g, '_')}`;
    if (document.getElementById(linkId)) continue;
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }
}

/**
 * P4-5 — Parse assetsJson and surface the background + pattern image URLs as
 * CSS custom properties on the document root.
 *
 * Sets:
 *   --theme-background-image: url('...')   (when assetsJson.background.url is set)
 *   --theme-pattern-image:    url('...')   (when assetsJson.pattern.url is set)
 *
 * When assetsJson is empty/missing OR the URL is empty, the corresponding
 * var is REMOVED so the platform default (CSS fallback in globals.css) takes
 * over. This keeps the injector idempotent — re-applying the same theme does
 * not stack stale vars.
 *
 * URLs are wrapped in `url('...')` with single quotes to survive any
 * characters in data: URLs (commas, semicolons). The caller is responsible
 * for validating the URL (the API does this via zod).
 */
function applyThemeAssets(assetsJson: string | null | undefined) {
  const root = document.documentElement;

  if (!assetsJson) {
    root.style.removeProperty('--theme-background-image');
    root.style.removeProperty('--theme-pattern-image');
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(assetsJson);
  } catch {
    // Malformed JSON — clear both vars so we don't leak a stale value from
    // a previous theme. The platform default (no background image) applies.
    root.style.removeProperty('--theme-background-image');
    root.style.removeProperty('--theme-pattern-image');
    return;
  }

  const assets =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const bg = assets.background;
  const bgUrl =
    bg && typeof bg === 'object' &&
    'url' in bg && typeof (bg as { url: unknown }).url === 'string'
      ? (bg as { url: string }).url
      : '';
  if (bgUrl) {
    root.style.setProperty('--theme-background-image', `url('${bgUrl.replace(/'/g, "\\'")}')`);
  } else {
    root.style.removeProperty('--theme-background-image');
  }

  const pat = assets.pattern;
  const patUrl =
    pat && typeof pat === 'object' &&
    'url' in pat && typeof (pat as { url: unknown }).url === 'string'
      ? (pat as { url: string }).url
      : '';
  if (patUrl) {
    root.style.setProperty('--theme-pattern-image', `url('${patUrl.replace(/'/g, "\\'")}')`);
  } else {
    root.style.removeProperty('--theme-pattern-image');
  }
}

/**
 * Remove ALL --theme-* CSS variables from the document root.
 * Called on cleanup so themes don't leak between weddings.
 */
function removeAllThemeVars() {
  const root = document.documentElement;
  for (const varName of THEME_CSS_VARS) {
    root.style.removeProperty(varName);
  }
}

/**
 * ThemeInjector — injects CSS variables + Google Fonts into the document.
 *
 * CONS-6-PIPELINE: when `theme` prop is provided (from the published config),
 * uses it directly. Otherwise falls back to fetching /api/theme.
 *
 * Side effects only — renders null.
 * Mounted once per wedding page (root / and /w/[slug]).
 */
export function ThemeInjector({ theme }: ThemeInjectorProps = {}) {
  useEffect(() => {
    let cancelled = false;

    // ── CONS-6-PIPELINE: prefer the published theme prop when available ─────
    if (theme) {
      try {
        applyThemeData({
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          fontDisplay: theme.fontDisplay,
          fontBody: theme.fontBody,
          layout: theme.layout,
          customizations: theme.customizations ?? null,
          // P4-5 — pass through assetsJson. The apply route stores it inside
          // customizations.assetsJson (merged from platformTheme.assetsJson);
          // top-level theme.assetsJson is the future path once the publish
          // pipeline surfaces it. Fall back to customizations for now.
          assetsJson: theme.assetsJson
            ?? (theme.customizations
                && typeof theme.customizations === 'object'
                && 'assetsJson' in theme.customizations
                && typeof (theme.customizations as Record<string, unknown>).assetsJson === 'string'
              ? (theme.customizations as Record<string, unknown>).assetsJson as string
              : null)
            ?? null,
        });
      } catch {
        // Silent fail — theme is cosmetic, don't break the page
      }
      return () => {
        cancelled = true;
        removeAllThemeVars();
      };
    }

    // ── Fallback: fetch /api/theme (existing behavior) ──────────────────────
    async function loadTheme() {
      try {
        const res = await fetch('/api/theme');
        if (!res.ok) return;
        const data: ThemeData = await res.json();
        if (cancelled) return;
        applyThemeData(data);
      } catch {
        // Silent fail — theme is cosmetic, don't break the page
      }
    }

    loadTheme();

    return () => {
      cancelled = true;
      removeAllThemeVars();
    };
  }, [theme]);

  return null;
}


