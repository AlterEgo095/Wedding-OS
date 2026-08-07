// ══════════════════════════════════════════════════════════════════════════════
// src/lib/wedding/cache.ts — Mission 6.0 P0.9
// ══════════════════════════════════════════════════════════════════════════════
//
// ISR + per-wedding cache tags for public wedding pages (/w/[slug]).
//
// PROBLEM (audit 6.0-F):
//   Public wedding pages use `export const dynamic = 'force-dynamic'`, which
//   means EVERY request re-runs the full server-side data resolution
//   (resolveWeddingBySlug + resolveWeddingManifest + publishedConfigJson read).
//   At B2B2C scale (1M guests × 4 API calls/page = 4M DB queries/sec peak),
//   this is a non-starter.
//
// FIX:
//   Wrap the wedding layout data fetch in `unstable_cache` with:
//     - Cache key:    ['wedding-layout', slug]  (per-tenant isolation)
//     - Cache tag:    `wedding-${slug}`         (for on-demand invalidation)
//     - Revalidate:   300s                      (5-min fallback safety net)
//
//   On publish (pipeline OR legacy fallback), the publish helper calls
//   `invalidateWeddingCache(slug)` which calls `revalidateTag('wedding-{slug}')`
//   → the next request re-fetches fresh data. No 5-min staleness window for
//   the critical publish moment.
//
// CROSS-TENANT SAFETY (§11 leak fix preserved):
//   The cache key is the slug itself, so wedding A's cache entry is 100%
//   isolated from wedding B's. There is no shared cache namespace. The §11
//   fix (no cross-wedding data leak) is preserved because the cache key IS
//   the tenant boundary identifier.
//
//   What is NOT cached: per-request dynamic data (headers(), searchParams,
//   guest session tokens). Those remain fresh on every request via the
//   client-side page.tsx + fetch interceptor (cache: 'no-store' on /api/*).

import { unstable_cache } from 'next/cache';
import { resolveWeddingBySlug, invalidateWeddingCache as invalidateInMemoryWeddingCache } from '@/lib/tenant-context';
import { resolveWeddingManifest } from '@/lib/wedding/manifest';
import type { WeddingManifest } from '@/lib/wedding/manifest';
import { db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublishedConfigSnapshot {
  manifest: WeddingManifest;
  theme: {
    primaryColor: string;
    accentColor: string;
    fontDisplay: string;
    fontBody: string;
    layout: string;
  };
  templateName: string;
  themeName: string;
  version: string;
  compiledAt: string;
}

export interface CachedWeddingData {
  /**
   * The resolved wedding row (identity + status + plan + dates + venue).
   *
   * NOTE: `weddingDate` is serialized to an ISO string because
   * `unstable_cache` JSON-serializes the return value (Date objects become
   * strings). Callers should NOT call `.toISOString()` on it — it's already
   * a string. Use `new Date(wedding.weddingDate)` to get a Date object back.
   */
  wedding: {
    id: string;
    slug: string;
    status: string;
    plan: string;
    isDefault: boolean;
    brideName: string;
    groomName: string;
    coupleLabel: string;
    /** ISO string (serialized by unstable_cache), or null. */
    weddingDate: string | null;
    venueName: string | null;
    venueCity: string | null;
  };
  /** The manifest (from publishedConfigJson if present, else binding-based). */
  manifest: WeddingManifest;
  /** The published config snapshot (null if wedding was never pipelined). */
  publishedConfig: PublishedConfigSnapshot | null;
}

// ─── Cache tag helper ─────────────────────────────────────────────────────────

/**
 * Returns the per-wedding cache tag used by `unstable_cache` below.
 * Also used by `invalidateWeddingCache` and the publish helpers to bust
 * the cache on-demand after a successful publish.
 */
export const weddingCacheTag = (slug: string): string => `wedding-${slug}`;

// ─── Cached fetch ─────────────────────────────────────────────────────────────

/**
 * Resolve wedding layout data (wedding row + manifest + publishedConfig)
 * with ISR caching, keyed by slug, tagged `wedding-{slug}`.
 *
 * Returns null if the wedding doesn't exist (caller should `notFound()`).
 *
 * NOTE: the `unstable_cache` wrapper is created per-call so the tag can be
 * derived from the runtime `slug` argument. This is the documented pattern
 * for dynamic cache tags in Next.js 16 App Router.
 */
export async function getCachedWeddingData(
  slug: string
): Promise<CachedWeddingData | null> {
  const cachedFn = unstable_cache(
    async (s: string): Promise<CachedWeddingData | null> => {
      const wedding = await resolveWeddingBySlug(s);
      if (!wedding) {
        return null;
      }

      // ── CONS-6-PIPELINE: prefer publishedConfigJson (deployment snapshot) ──
      let publishedConfig: PublishedConfigSnapshot | null = null;
      let manifest: WeddingManifest;

      try {
        const publishedRow = await db.wedding.findUnique({
          where: { id: wedding.id },
          select: { publishedConfigJson: true, publishedVersion: true },
        });
        if (publishedRow?.publishedConfigJson) {
          const parsed = safeJsonParse<{
            manifest?: WeddingManifest;
            theme?: {
              primaryColor: string;
              accentColor: string;
              fontDisplay: string;
              fontBody: string;
              layout: string;
            };
            templateName?: string;
            themeName?: string;
            version?: string;
            compiledAt?: string;
          } | null>(publishedRow.publishedConfigJson, null);
          if (parsed && parsed.manifest && parsed.theme) {
            publishedConfig = {
              manifest: parsed.manifest,
              theme: parsed.theme,
              templateName: parsed.templateName ?? '',
              themeName: parsed.themeName ?? '',
              version: parsed.version ?? publishedRow.publishedVersion ?? '',
              compiledAt: parsed.compiledAt ?? '',
            };
          }
        }
      } catch (error) {
        // Non-fatal — fall back to binding-based manifest.
        logger.warn('cache: failed to read publishedConfigJson', {
          weddingId: wedding.id,
          slug: s,
          errMessage: error instanceof Error ? error.message : String(error),
        });
      }

      if (publishedConfig) {
        manifest = publishedConfig.manifest;
      } else {
        manifest = await resolveWeddingManifest(wedding.id);
      }

      // Pre-serialize Date fields to ISO strings BEFORE returning from the
      // cached function. `unstable_cache` JSON-serializes the return value,
      // so Date objects would become strings anyway — but the TypeScript type
      // would still say `Date`, causing runtime errors when callers invoke
      // `.toISOString()` on what is actually a string. By converting here,
      // the type honestly reflects the post-serialization shape.
      return {
        wedding: {
          id: wedding.id,
          slug: wedding.slug,
          status: wedding.status,
          plan: wedding.plan,
          isDefault: wedding.isDefault,
          brideName: wedding.brideName,
          groomName: wedding.groomName,
          coupleLabel: wedding.coupleLabel,
          weddingDate: wedding.weddingDate
            ? wedding.weddingDate.toISOString()
            : null,
          venueName: wedding.venueName,
          venueCity: wedding.venueCity,
        },
        manifest,
        publishedConfig,
      };
    },
    // Cache key parts: ['wedding-layout', slug] → per-tenant isolation.
    [`wedding-layout`, slug],
    {
      // Per-wedding tag → on-demand invalidation via revalidateTag.
      tags: [weddingCacheTag(slug)],
      // Fallback revalidate: 5 minutes. Belt-and-suspenders in case
      // an invalidate call is missed (e.g. DB write outside the pipeline).
      revalidate: 300,
    }
  );

  return cachedFn(slug);
}

// ─── Invalidation ─────────────────────────────────────────────────────────────

/**
 * Invalidate the per-wedding ISR cache after a publish or config change.
 *
 * This is the AWAITED variant of `invalidateWeddingCache` (from
 * `tenant-context.ts`) for use in the deployment pipeline where we want
 * to ensure the L2 (`revalidateTag`) invalidation completes BEFORE the
 * publish response is returned to the caller. This guarantees the next
 * request sees fresh data with no staleness window.
 *
 * It busts BOTH cache layers:
 *   1. The in-memory `weddingCache` Map (L1) — via the sync
 *      `invalidateInMemoryWeddingCache` from tenant-context.
 *   2. The Next.js `unstable_cache` ISR layer (L2) — via an explicit
 *      awaited `revalidateTag('wedding-{slug}', 'default')`.
 *
 * (The sync `invalidateWeddingCache` in tenant-context.ts also fires L2
 * invalidation as fire-and-forget for the 6 existing callers that don't
 * await. This async variant is for the pipeline path where we want to
 * guarantee completion.)
 *
 * MUST be called from a Next.js server context (route handler or server
 * action) — `revalidateTag` requires the Next.js runtime.
 *
 * Invoked by:
 *   - publish-helper.ts (after PIPELINE success + LEGACY fallback)
 *   - deployment-pipeline.ts publishFrontend stage (trigger/retry routes)
 */
export async function invalidateWeddingCache(slug: string): Promise<void> {
  // Layer 1: clear the in-memory L1 cache (synchronous).
  try {
    invalidateInMemoryWeddingCache(slug);
  } catch (error) {
    logger.warn('wedding-cache.l1-invalidate-failed', {
      slug,
      errMessage: error instanceof Error ? error.message : String(error),
    });
  }

  // Layer 2: bust the Next.js unstable_cache ISR layer (awaited).
  try {
    const { revalidateTag } = await import('next/cache');
    // Next.js 16: revalidateTag(tag, profile) — 'default' marks the tag's
    // cache entries as stale immediately.
    revalidateTag(weddingCacheTag(slug), 'default');
    logger.info('wedding-cache.invalidated', {
      slug,
      tag: weddingCacheTag(slug),
    });
  } catch (error) {
    // Non-fatal: L1 is cleared, L2 has a 5-min fallback revalidate.
    logger.warn('wedding-cache.l2-invalidate-failed', {
      slug,
      errMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
