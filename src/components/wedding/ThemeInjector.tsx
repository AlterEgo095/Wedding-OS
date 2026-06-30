'use client';

import { useEffect } from 'react';
import { getFontOption } from '@/lib/themes/templates';
import { penpotTokensToCssVars, type PenpotIntegration, type PenpotTokens } from '@/lib/penpot/config';

interface ThemeData {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
  // Penpot integration (additive — null when not yet linked)
  customizations?: { penpot?: PenpotIntegration } | null;
}

/**
 * ThemeInjector — fetches the wedding theme from /api/theme and injects
 * CSS variables + Google Fonts into the document.
 *
 * Side effects only — renders null.
 * Mounted once per wedding page (root / and /w/[slug]).
 *
 * Penpot integration (additive):
 *   In addition to the 4 canonical --theme-* vars, this injector now also
 *   reads `customizations.penpot.tokens` and injects them as --penpot-*
 *   CSS variables. This lets Penpot-designed components pick up the tokens
 *   without affecting existing components that use --theme-* vars.
 *   Zero regression: if Penpot is not linked, no --penpot-* vars are set
 *   and behavior is identical to before.
 */
export function ThemeInjector() {
  useEffect(() => {
    let cancelled = false;
    const injectedLinkIds: string[] = [];
    const injectedPenpotVars: string[] = [];

    async function loadTheme() {
      try {
        // No hardcoded slug — the fetch interceptor installed on /w/[slug]
        // pages sets X-Wedding-Slug for the current tenant, and on root /
        // the API's resolvePublicTenant serves the default wedding.
        const res = await fetch('/api/theme');
        if (!res.ok) return;
        const data: ThemeData = await res.json();
        if (cancelled) return;

        const root = document.documentElement;

        // Inject CSS variables (canonical theme — unchanged)
        root.style.setProperty('--theme-primary', data.primaryColor);
        root.style.setProperty('--theme-accent', data.accentColor);
        root.style.setProperty('--theme-font-display', `'${data.fontDisplay}', serif`);
        root.style.setProperty('--theme-font-body', `'${data.fontBody}', sans-serif`);

        // ─── Penpot token injection (additive) ────────────────────────────
        // Read tokens from Theme.customizations.penpot.tokens and inject them
        // as --penpot-* CSS vars. These coexist with --theme-* vars: Penpot-
        // designed components reference --penpot-*, existing components keep
        // using --theme-*. Both sets stay in sync via the Studio's push/pull.
        // Defensive: customizations may come back as a string (if double-encoded
        // by an older PUT) or as an object (canonical). Handle both.
        let customizationsObj: Record<string, unknown> | null = null
        if (data.customizations) {
          try {
            customizationsObj =
              typeof data.customizations === 'string'
                ? JSON.parse(data.customizations)
                : data.customizations
          } catch {
            customizationsObj = null
          }
        }
        const penpotTokens = customizationsObj?.penpot
          ? (customizationsObj.penpot as PenpotIntegration)?.tokens
          : null
        if (penpotTokens && typeof penpotTokens === 'object') {
          const cssVars = penpotTokensToCssVars(penpotTokens)
          for (const [varName, value] of Object.entries(cssVars)) {
            root.style.setProperty(varName, value)
            injectedPenpotVars.push(varName)
          }
        }

        // Load Google Fonts for display + body fonts
        const displayFont = getFontOption(data.fontDisplay);
        const bodyFont = getFontOption(data.fontBody);

        const fontsToLoad = new Set<string>();
        if (displayFont) fontsToLoad.add(displayFont.googleFontUrl);
        if (bodyFont) fontsToLoad.add(bodyFont.googleFontUrl);

        // Also load fonts referenced by Penpot tokens (if different from theme)
        const penpotDisplay = penpotTokens?.['typography.display'];
        const penpotBody = penpotTokens?.['typography.body'];
        if (penpotDisplay && penpotDisplay !== data.fontDisplay) {
          const f = getFontOption(penpotDisplay);
          if (f) fontsToLoad.add(f.googleFontUrl);
        }
        if (penpotBody && penpotBody !== data.fontBody) {
          const f = getFontOption(penpotBody);
          if (f) fontsToLoad.add(f.googleFontUrl);
        }

        for (const url of fontsToLoad) {
          const linkId = `theme-font-${btoa(url).replace(/[/+=]/g, '_')}`;
          if (document.getElementById(linkId)) continue;
          const link = document.createElement('link');
          link.id = linkId;
          link.rel = 'stylesheet';
          link.href = url;
          document.head.appendChild(link);
          injectedLinkIds.push(linkId);
        }
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
      // Cleanup Penpot vars too
      for (const varName of injectedPenpotVars) {
        root.style.removeProperty(varName);
      }
    };
  }, []);

  return null;
}
