// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/wedding-context.tsx — React Context for the resolved wedding
// ══════════════════════════════════════════════════════════════════════════════
// Provides the wedding identity AND its published manifest to all pages under
// /w/[slug]/*. The manifest is resolved server-side in layout.tsx and passed
// down so SectionRenderer can render sections dynamically.
//
// CONS-6-PIPELINE: also exposes an optional `publishedConfig` snapshot —
// the parsed PublishedConfig from the last successful deployment pipeline run.
// When non-null, page.tsx uses its `theme` for ThemeInjector and its `manifest`
// for SectionRenderer (overriding the binding-based manifest).
//
// Also exposes a helper `fetchTenant(path, init)` that auto-adds the
// X-Wedding-Slug header so client-side API calls scope to this wedding.

'use client';

import { createContext, useContext, useCallback, ReactNode } from 'react';
import type { WeddingManifest } from '@/lib/wedding/manifest';

// ─── CONS-6-PIPELINE — published config snapshot ─────────────────────────────
// Mirrors the `theme` + `manifest` fields of PublishedConfig from
// src/lib/pipeline/deployment-pipeline.ts. Kept as a structural type (not
// imported) to avoid pulling server-only DB code into the client bundle.
export interface PublishedThemeSnapshot {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
  // MISSION 5.9.2 P0 (QW5) — extended theme tokens for identity presets.
  // When a wedding has an identity preset applied (via the apply endpoint QW6),
  // the customizations blob contains the full theme config (surface, surfaceDeep,
  // text, textMuted, pattern, ambiance, primaryLight, primaryDark, accentLight,
  // motionTier) so ThemeInjector (QW2) can set ALL 13 --theme-* CSS variables.
  // Optional for backward compat — older published configs won't have it.
  customizations?: Record<string, unknown> | null;
}

export interface PublishedConfigSnapshot {
  manifest: WeddingManifest;
  theme: PublishedThemeSnapshot;
  templateName: string;
  themeName: string;
  version: string;
  compiledAt: string;
  // MISSION 5.9.2 — the published InvitationExperienceConfig (template +
  // sections + tokens + resolvedBindings + mediaSlots + wedding data).
  // Present when the wedding has an InvitationTemplate assigned + published.
  // Null/absent for legacy weddings without a template (backward compat).
  invitation?: any;
}

export interface WeddingContextValue {
  id: string;
  slug: string;
  coupleLabel: string;
  brideName: string;
  groomName: string;
  weddingDate: string | null;
  venueName: string | null;
  venueCity: string | null;
  status: string;
  plan: string;
  isDefault: boolean;
  manifest: WeddingManifest;
  /** CONS-6-PIPELINE — null when no deployment has been published yet. */
  publishedConfig: PublishedConfigSnapshot | null;
}

const WeddingCtx = createContext<WeddingContextValue | null>(null);

export function WeddingContextProvider({
  wedding,
  children,
}: {
  wedding: WeddingContextValue;
  children: ReactNode;
}) {
  return <WeddingCtx.Provider value={wedding}>{children}</WeddingCtx.Provider>;
}

export function useWedding(): WeddingContextValue {
  const ctx = useContext(WeddingCtx);
  if (!ctx) {
    throw new Error('useWedding() must be used inside <WeddingContextProvider>');
  }
  return ctx;
}

/**
 * Fetch helper that auto-injects the X-Wedding-Slug header so the API
 * resolves the tenant from the current wedding context.
 */
export function useTenantFetch() {
  const wedding = useWedding();
  return useCallback(
    (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('X-Wedding-Slug', wedding.slug);
      return fetch(path, { ...init, headers });
    },
    [wedding.slug]
  );
}
