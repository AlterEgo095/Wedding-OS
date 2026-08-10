"use client";

/**
 * Phase 3C (MISSION 5.9.0) — Retry button for the offline fallback page.
 *
 * Small Client Component so the rest of `src/app/offline/page.tsx` can stay a
 * Server Component (no `'use client'` directive at the page level → the static
 * HTML is cacheable by the Service Worker and renders even with zero JS).
 *
 * Behaviour: calls `window.location.reload()`. Because the Service Worker
 * intercepted the original navigation (e.g. to `/w/josue-hornella`), the URL
 * in the address bar is STILL the page the user wanted — reloading re-triggers
 * the SW's network-first strategy, which will now succeed if the network has
 * come back (and falls back to the cached page if not).
 */
import { RefreshCw } from "lucide-react";

export default function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-gold px-6 py-3 text-sm font-display font-medium tracking-wide text-white hover:opacity-90 transition-opacity min-h-[44px] shadow-lg shadow-gold/25"
    >
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      Réessayer
    </button>
  );
}
