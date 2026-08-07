'use client';

import { useEffect } from 'react';
import { getFontOption } from '@/lib/themes/templates';

interface ThemeData {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
  // Optional customizations blob (kept for backward compatibility — luxury,
  // collectionMeta keys are still read by other components). Penpot token
  // injection was removed in P4-penpot.
  customizations?: Record<string, unknown> | null;
}

// ─── CONS-6-PIPELINE — optional theme prop ───────────────────────────────────
// When the deployment pipeline publishes a config, layout.tsx parses its
// `theme` field and page.tsx passes it here. When provided, ThemeInjector
// injects the CSS variables + Google Fonts directly (no /api/theme fetch) —
// this guarantees the rendered theme matches exactly what was deployed.
// When null/undefined, ThemeInjector falls back to fetching /api/theme
// (existing behavior for weddings deployed before the pipeline).
export interface ThemeInjectorProps {
  theme?: {
    primaryColor: string;
    accentColor: string;
    fontDisplay: string;
    fontBody: string;
    layout: string;
  } | null;
}

/**
 * Apply a theme blob to the document root (CSS variables + Google Fonts).
 * Extracted so both the prop path and the fetch path share the same logic.
 */
function applyThemeData(data: ThemeData) {
  const root = document.documentElement;

  // Inject CSS variables (canonical theme — unchanged)
  root.style.setProperty('--theme-primary', data.primaryColor);
  root.style.setProperty('--theme-accent', data.accentColor);
  root.style.setProperty('--theme-font-display', `'${data.fontDisplay}', serif`);
  root.style.setProperty('--theme-font-body', `'${data.fontBody}', sans-serif`);

  // Load Google Fonts for display + body fonts
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
        });
      } catch {
        // Silent fail — theme is cosmetic, don't break the page
      }
      return () => {
        cancelled = true;
        // Cleanup: remove CSS variables (fonts stay cached for performance)
        const root = document.documentElement;
        root.style.removeProperty('--theme-primary');
        root.style.removeProperty('--theme-accent');
        root.style.removeProperty('--theme-font-display');
        root.style.removeProperty('--theme-font-body');
      };
    }

    // ── Fallback: fetch /api/theme (existing behavior) ──────────────────────
    async function loadTheme() {
      try {
        // No hardcoded slug — the fetch interceptor installed on /w/[slug]
        // pages sets X-Wedding-Slug for the current tenant, and on root /
        // the API's resolvePublicTenant serves the default wedding.
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
      // Cleanup: remove CSS variables (fonts stay cached for performance)
      const root = document.documentElement;
      root.style.removeProperty('--theme-primary');
      root.style.removeProperty('--theme-accent');
      root.style.removeProperty('--theme-font-display');
      root.style.removeProperty('--theme-font-body');
    };
  }, [theme]);

  return null;
}
