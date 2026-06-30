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
 * Shape of the luxury preset stored in Theme.customizations.luxury.
 * Mirrors LuxuryPreset from src/lib/collections/index.ts (kept inline to avoid
 * a circular import — the store is client-only, the collections lib is shared).
 */
interface LuxuryPreset {
  theme: 'gold' | 'rose' | 'champagne' | 'midnight';
  effects: {
    starrySky: boolean;
    goldenDust: boolean;
    microSparkles: boolean;
    luminousHalos: boolean;
    globalBreathing: boolean;
    sectionAmbiance: boolean;
    scrollReflections: boolean;
  };
  intensity: number;
  density: number;
  speed: number;
  haloCount: number;
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
 *
 * Collection Engine (Phase 1 — additive):
 *   If `customizations.luxury` is present (set when a Collection is applied),
 *   the luxury-engine-store is hydrated with the Collection's luxury preset.
 *   This is a SESSION-LEVEL hydration — we use the store's set() directly
 *   WITHOUT calling saveToStorage, so the couple's localStorage preferences
 *   are not clobbered. If `customizations.luxury` is absent, the store keeps
 *   its localStorage behavior unchanged (zero regression).
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

        // ─── Parse customizations (defensive: string | object) ──────────────
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

        // ─── Penpot token injection (additive) ────────────────────────────
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

        // ─── Luxury preset hydration (Collection Engine — additive) ───────
        // If a Collection has been applied, customizations.luxury holds the
        // preset. We hydrate the luxury-engine-store IN-PLACE (session-only,
        // no localStorage write) so the LuxuryVisualEngine renders the right
        // ambiance. If absent, the store keeps its localStorage state.
        const luxuryPreset = customizationsObj?.luxury as LuxuryPreset | undefined
        if (luxuryPreset && typeof luxuryPreset === 'object') {
          hydrateLuxuryStore(luxuryPreset)
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

/**
 * Hydrate the luxury-engine-store from a Collection's luxury preset.
 *
 * CRITICAL: this is a SESSION-LEVEL hydration. We import the store dynamically
 * (so this file doesn't pull the store into the server bundle) and call the
 * store's set() directly — NOT the action helpers that persist to localStorage.
 * This means:
 *   - The Collection's ambiance is applied immediately on page load.
 *   - The couple's localStorage preferences are NOT clobbered.
 *   - If the couple toggles an effect via AppearanceManager, that override is
 *     persisted to localStorage and wins on subsequent loads (until they
 *     re-apply the Collection).
 *
 * Zero-regression: if the store can't be loaded (SSR, error), this is a no-op.
 */
async function hydrateLuxuryStore(preset: LuxuryPreset): Promise<void> {
  try {
    // Dynamic import — luxury-engine-store is client-only (uses localStorage)
    const { useLuxuryEngine } = await import('@/lib/luxury-engine-store')
    const store = useLuxuryEngine as unknown as {
      setState: (partial: Record<string, unknown>) => void
    }
    // Set the preset values directly via setState (no persistence)
    store.setState({
      theme: preset.theme,
      starrySky: preset.effects.starrySky,
      goldenDust: preset.effects.goldenDust,
      microSparkles: preset.effects.microSparkles,
      luminousHalos: preset.effects.luminousHalos,
      globalBreathing: preset.effects.globalBreathing,
      sectionAmbiance: preset.effects.sectionAmbiance,
      scrollReflections: preset.effects.scrollReflections,
      intensity: preset.intensity,
      density: preset.density,
      speed: preset.speed,
      haloCount: preset.haloCount,
    })
  } catch {
    // Silent fail — luxury is cosmetic
  }
}
