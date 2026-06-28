'use client';

import { useEffect } from 'react';
import { getFontOption } from '@/lib/themes/templates';

interface ThemeData {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
}

/**
 * ThemeInjector — fetches the wedding theme from /api/theme and injects
 * CSS variables + Google Fonts into the document.
 *
 * Side effects only — renders null.
 * Mounted once per wedding page (root / and /w/[slug]).
 */
export function ThemeInjector() {
  useEffect(() => {
    let cancelled = false;
    const injectedLinkIds: string[] = [];

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

        // Inject CSS variables
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
    };
  }, []);

  return null;
}
