'use client';

import { useState, useEffect } from 'react';

/**
 * useTheme — Phase 3 client hook for Collection-aware rendering.
 *
 * Fetches `/api/theme` once per page load and caches the result in a module-
 * level promise + React state. Used by GuestPersonalSpace (live site) and
 * InvitationPreviewManager (admin preview) so they can read the deployed
 * Collection's colors/fonts without each firing their own fetch.
 *
 * The /api/theme endpoint already injects CSS vars via ThemeInjector
 * (`--theme-primary`, `--theme-accent`, `--theme-font-display`,
 * `--theme-font-body`, plus 12 `--luxury-*` vars). Components that ONLY need
 * CSS vars do NOT need this hook — they can just use `var(--theme-*)` in their
 * styles. This hook is for components that need the RAW theme values (e.g.
 * GuestPersonalSpace's hidden download JSX for html2canvas-pro, which does
 * not reliably resolve CSS vars).
 *
 * Returns:
 *   - theme: ThemeData | null           (null while loading)
 *   - loading: boolean
 *   - error: string | null
 *
 * ThemeData shape mirrors the GET /api/theme response:
 *   { primaryColor, accentColor, fontDisplay, fontBody, layout,
 *     customizations, luxury, binding, wedding }
 */

export interface ThemeBinding {
  id: string;
  collectionId: string;
  collectionVersion: number | null;
  status: string;
  deployedAt: string | null;
  manifest: Record<string, unknown> | null;
}

export interface ThemeLuxury {
  theme?: string;
  effects?: Record<string, boolean>;
  intensity?: number;
  density?: number;
  speed?: number;
  haloCount?: number;
}

export interface ThemeData {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
  customizations: Record<string, unknown> | null;
  luxury: ThemeLuxury | null;
  binding: ThemeBinding | null;
  wedding: {
    slug: string;
    isDefault: boolean;
    status: string;
    plan: string;
  };
}

// ─── Module-level cache (one fetch per browser session) ─────────────────────
let cachedPromise: Promise<ThemeData | null> | null = null;
let cachedData: ThemeData | null = null;
let cachedError: string | null = null;

async function fetchTheme(): Promise<ThemeData | null> {
  try {
    const res = await fetch('/api/theme', { cache: 'no-store' });
    if (!res.ok) {
      cachedError = `HTTP ${res.status}`;
      return null;
    }
    const data = (await res.json()) as ThemeData;
    cachedData = data;
    cachedError = null;
    return data;
  } catch (err) {
    cachedError = err instanceof Error ? err.message : 'Network error';
    return null;
  }
}

/**
 * useTheme — subscribe to the cached theme fetch.
 *
 * On first mount, kicks off the fetch (if not already cached). On subsequent
 * mounts, returns the cached value synchronously. Re-renders when the fetch
 * resolves.
 *
 * Pass `skip` to skip the fetch entirely (e.g. when the parent will pass a
 * `theme` prop down explicitly — used by the admin preview).
 */
export function useTheme(skip = false): {
  theme: ThemeData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  // We use a lazy initializer + useEffect to trigger the fetch on first mount.
  // React.useState is fine here — we don't need useSyncExternalStore because
  // the cache is per-module, not per-store.
  const [version, setVersion] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (skip) {
      setMounted(true);
      return;
    }
    setMounted(true);
    if (!cachedPromise) {
      cachedPromise = fetchTheme();
    }
    // Trigger re-render when the promise resolves.
    let cancelled = false;
    cachedPromise.then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [skip]);

  const reload = () => {
    cachedPromise = fetchTheme();
    cachedPromise.then(() => setVersion((v) => v + 1));
  };

  // Before mount (SSR or first paint), return loading=true with no data.
  // After mount, return whatever the cache currently holds.
  if (!mounted) {
    return { theme: null, loading: !skip, error: null, reload };
  }

  return {
    theme: cachedData,
    loading: !skip && !cachedData && !cachedError,
    error: cachedError,
    reload,
  };
}

/**
 * getThemeSync — read the current cached theme synchronously (null if not yet
 * fetched). Useful for components that need the theme on first paint after the
 * ThemeInjector has run (e.g. the download JSX in GuestPersonalSpace).
 */
export function getThemeSync(): ThemeData | null {
  return cachedData;
}

/**
 * prefetchTheme — kick off the fetch early (e.g. in a layout) so the data is
 * ready by the time child components mount.
 */
export function prefetchTheme(): void {
  if (!cachedPromise) {
    cachedPromise = fetchTheme();
  }
}
