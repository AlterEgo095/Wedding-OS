// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/wedding-context.tsx — React Context for the resolved wedding
// ══════════════════════════════════════════════════════════════════════════════
// Provides the wedding identity AND its published manifest to all pages under
// /w/[slug]/*. The manifest is resolved server-side in layout.tsx and passed
// down so SectionRenderer can render sections dynamically.
//
// Also exposes a helper `fetchTenant(path, init)` that auto-adds the
// X-Wedding-Slug header so client-side API calls scope to this wedding.

'use client';

import { createContext, useContext, useCallback, ReactNode } from 'react';
import type { WeddingManifest } from '@/lib/wedding/manifest';

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
