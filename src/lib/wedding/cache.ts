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
import path from 'node:path';
import {
  resolveWeddingBySlug,
  buildTenantContext,
  runWithTenant,
  invalidateWeddingCache as invalidateInMemoryWeddingCache,
} from '@/lib/tenant-context';
import { resolveWeddingManifest } from '@/lib/wedding/manifest';
import type { WeddingManifest } from '@/lib/wedding/manifest';
import { db, tenantDb } from '@/lib/db';
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
  // MISSION 5.9.2 — the published InvitationExperienceConfig (template +
  // sections + tokens + resolvedBindings + mediaSlots + wedding data).
  // Present when the wedding has an InvitationTemplate assigned + published.
  invitation?: any;
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
            // MISSION 5.9.2 — pass through the invitation experience config
            // so IdentityInvitation can render the premium 12-section invitation.
            invitation?: any;
          } | null>(publishedRow.publishedConfigJson, null);
          if (parsed && parsed.manifest && parsed.theme) {
            publishedConfig = {
              manifest: parsed.manifest,
              theme: parsed.theme,
              templateName: parsed.templateName ?? '',
              themeName: parsed.themeName ?? '',
              version: parsed.version ?? publishedRow.publishedVersion ?? '',
              compiledAt: parsed.compiledAt ?? '',
              // MISSION 5.9.2 — pass through the invitation experience config
              invitation: parsed.invitation ?? null,
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

    // 5.8.17 BLOCKER_1_CACHE — revalidateTag only MARKS cache entries stale;
    // it does NOT delete them. With SWR, the next request serves the STALE
    // entry and triggers a background revalidation that does NOT complete
    // reliably within 300s (Fix 1 ineffective per Phase 3 retest #2).
    // Add revalidatePath to force a full route cache flush so the public
    // /w/[slug] page regenerates on the NEXT request → immediate consistency
    // for publish / unpublish / republish transitions.
    try {
      const { revalidatePath } = await import('next/cache');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/' + slug, 'page');
      logger.info('wedding-cache.path-revalidated', { slug, path: `/w/${slug}` });
    } catch (e) {
      logger.error('wedding-cache.path-revalidate-failed', { slug, errMessage: e instanceof Error ? e.message : String(e) });
    }

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

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2A (MISSION 5.9.0 audit §20.4) — Public wedding PAGE data
// ══════════════════════════════════════════════════════════════════════════════
//
// The public wedding page (`/w/[slug]`) used to be a `'use client'` component
// that issued a 4-call API waterfall on the client (`/api/couple-story`,
// `/api/timeline`, `/api/settings`, `/api/music`). Phase 2A moves these 4
// fetches server-side so the page becomes an async Server Component that
// hydrates only interactive islands (GuestAuthForm, RSVP form, MusicPlayer,
// VisualEffectsLayer). Expected benefit: -200ms TTI, -50KB JS gzip.
//
// This function returns ALL FOUR datasets in a single cached round-trip,
// using the same per-wedding cache tag (`wedding-${slug}`) as
// `getCachedWeddingData` so on-demand invalidation (publish pipeline) busts
// both caches atomically.
//
// TENANT ISOLATION (§11 leak fix preserved):
//   - The cache key is the slug itself (`['wedding-page-data', slug]`), so
//     wedding A's cache entry is 100% isolated from wedding B's.
//   - The cached callback resolves the wedding by slug, then runs all 4
//     Prisma queries inside `runWithTenant(ctx, ...)`. This activates the
//     tenant-scoped Prisma extension (auto-injects `weddingId` into
//     `findMany` against CoupleStory / Settings). For EventTimeline we ALSO
//     pass an explicit `where: { weddingId }` filter — defence-in-depth
//     matching the existing `/api/timeline` route.
//   - The cached callback never returns data scoped to a different wedding,
//     even if the in-memory L1 cache were to leak between requests (it
//     can't — `unstable_cache` keys by the slug argument).
//
// NON-FATAL FAILURE:
//   If any individual dataset fails to fetch (transient DB error), the
//   function returns an empty array / null for THAT dataset rather than
//   crashing the whole page. The caller renders graceful fallbacks (the
//   SectionRenderer already handles empty stories / empty timeline / null
//   settings). The successful datasets are still cached and served.
//
// SERIALIZATION:
//   `unstable_cache` JSON-serializes the return value. All fields are
//   primitives (string | number | boolean | array | plain object) — no Date
//   objects — so the round-trip is lossless. The shape mirrors what the
//   original client-side `useEffect` produced, so the SectionRenderer's
//   `SectionRendererData` prop type is satisfied unchanged.

// ─── Phase 2A types ───────────────────────────────────────────────────────────

/** One couple-story chapter (mirrors `CoupleStory` Prisma row, all fields serializable). */
export interface CachedCoupleStory {
  id: string;
  title: string;
  description: string;
  date: string | null;
  imageUrl: string | null;
  order: number;
}

/** One timeline event (mirrors `EventTimeline` Prisma row, all fields serializable). */
export interface CachedTimelineEvent {
  id: string;
  time: string;
  activity: string;
  location: string | null;
  description: string | null;
  icon: string | null;
  order: number;
}

/**
 * Settings map (key → value). Built from the `Settings` Prisma table where
 * each row is a `(weddingId, key, value)` tuple. Mirrors the shape produced
 * by the original `/api/settings` GET handler.
 */
export type CachedSettings = Record<string, string>;

/** Ambient music settings (built from the 4 `music_*` settings rows). */
export interface CachedMusicSettings {
  /** Raw uploaded file path (e.g. `/uploads/slug/music/ambient-…mp3`) — empty when no track. */
  file: string;
  /** Volume 0..1 (parsed from the `music_volume` settings row, defaults to 0.25). */
  volume: number;
  /** Whether the organizer has enabled ambient music (parsed from `music_enabled`). */
  enabled: boolean;
  /** Playable URL passed to <AmbientMusicPlayer musicFile=…> (uses /api/music/file streaming endpoint). */
  url: string;
}

/** Bundle returned by `getCachedWeddingPageData` — all 4 datasets in one payload. */
export interface CachedWeddingPageData {
  stories: CachedCoupleStory[];
  timeline: CachedTimelineEvent[];
  settings: CachedSettings;
  music: CachedMusicSettings;
}

// ─── Defaults (mirror /api/music route's DEFAULT_SETTINGS) ─────────────────────

const DEFAULT_MUSIC_SETTINGS: CachedMusicSettings = {
  file: '',
  volume: 0.25,
  enabled: false,
  url: '',
};

// ─── Cached fetch ─────────────────────────────────────────────────────────────

/**
 * Resolve the public wedding page's 4 datasets (couple stories, timeline,
 * settings, music) with ISR caching, keyed by slug, tagged `wedding-{slug}`.
 *
 * Returns null ONLY if the wedding itself doesn't exist (caller should
 * `notFound()`). If the wedding exists but individual dataset fetches fail,
 * those datasets come back as empty arrays / empty objects / defaults — the
 * page still renders.
 *
 * The returned shape is JSON-serializable (no Date objects) so it can be
 * passed from the async Server Component page directly to a client
 * component as serializable props.
 *
 * @example
 *   // in an async Server Component page:
 *   const pageData = await getCachedWeddingPageData(slug);
 *   if (!pageData) notFound();
 *   return <WeddingPageClient stories={pageData.stories} … />;
 */
export async function getCachedWeddingPageData(
  slug: string
): Promise<CachedWeddingPageData | null> {
  const cachedFn = unstable_cache(
    async (s: string): Promise<CachedWeddingPageData | null> => {
      const wedding = await resolveWeddingBySlug(s);
      if (!wedding) {
        return null;
      }

      // Build the tenant context so tenantDb.* queries auto-scope by
      // weddingId. We use the same `buildTenantContext` helper as
      // `resolvePublicTenant` (default 'wedding' scope). The wedding is
      // already PUBLISHED by the time we get here — the layout gates status.
      const tenantCtx = buildTenantContext(wedding, 'wedding');

      // Run all 4 fetches inside the tenant scope. Each fetch is wrapped in
      // its own try/catch so a single failure doesn't lose the other 3
      // datasets (graceful degradation). The Promise.all runs them in
      // parallel for minimal latency.
      const [stories, timeline, settingsMap, musicSettings] = await runWithTenant(
        tenantCtx,
        async () => {
          return Promise.all([
            // 1. CoupleStory (tenantDb auto-scopes by weddingId)
            (async (): Promise<CachedCoupleStory[]> => {
              try {
                const rows = await tenantDb.coupleStory.findMany({
                  orderBy: { order: 'asc' },
                  take: 50, // P2-PERF-4: bound to match /api/couple-story
                });
                return rows.map((r) => ({
                  id: r.id,
                  title: r.title,
                  description: r.description,
                  date: r.date ?? null,
                  imageUrl: r.imageUrl ?? null,
                  order: r.order,
                }));
              } catch (error) {
                logger.warn('wedding-page-data.stories-failed', {
                  slug: s,
                  weddingId: wedding.id,
                  errMessage: error instanceof Error ? error.message : String(error),
                });
                return [];
              }
            })(),

            // 2. EventTimeline (explicit weddingId filter — defence-in-depth,
            //    matches /api/timeline route's pattern post-P4.3)
            (async (): Promise<CachedTimelineEvent[]> => {
              try {
                const rows = await db.eventTimeline.findMany({
                  where: { weddingId: wedding.id },
                  orderBy: { order: 'asc' },
                  take: 200, // P2-PERF-4: bound to match /api/timeline
                });
                return rows.map((r) => ({
                  id: r.id,
                  time: r.time,
                  activity: r.activity,
                  location: r.location ?? null,
                  description: r.description ?? null,
                  icon: r.icon ?? null,
                  order: r.order,
                }));
              } catch (error) {
                logger.warn('wedding-page-data.timeline-failed', {
                  slug: s,
                  weddingId: wedding.id,
                  errMessage: error instanceof Error ? error.message : String(error),
                });
                return [];
              }
            })(),

            // 3. Settings (tenantDb auto-scopes by weddingId)
            (async (): Promise<CachedSettings> => {
              try {
                const rows = await tenantDb.settings.findMany({
                  orderBy: { key: 'asc' },
                });
                const map: CachedSettings = {};
                for (const row of rows) {
                  map[row.key] = row.value;
                }
                return map;
              } catch (error) {
                logger.warn('wedding-page-data.settings-failed', {
                  slug: s,
                  weddingId: wedding.id,
                  errMessage: error instanceof Error ? error.message : String(error),
                });
                return {};
              }
            })(),

            // 4. Music settings (built from the 4 `music_*` Settings rows,
            //    mirrors /api/music GET handler's logic exactly)
            (async (): Promise<CachedMusicSettings> => {
              try {
                const musicKeys = [
                  'music_enabled',
                  'music_volume',
                  'music_file',
                  'music_original_name',
                ];
                const rows = await tenantDb.settings.findMany({
                  where: { key: { in: musicKeys } },
                });
                const map: CachedSettings = {};
                for (const row of rows) {
                  map[row.key] = row.value;
                }
                const musicFile = map.music_file ?? '';
                const enabled = map.music_enabled === 'true';
                const volumeRaw = Number(map.music_volume);
                const volume =
                  Number.isFinite(volumeRaw) && volumeRaw > 0 ? volumeRaw : 0.25;
                const url = musicFile
                  ? `/api/music/file?f=${encodeURIComponent(path.basename(musicFile))}`
                  : '';
                return { file: musicFile, volume, enabled, url };
              } catch (error) {
                logger.warn('wedding-page-data.music-failed', {
                  slug: s,
                  weddingId: wedding.id,
                  errMessage: error instanceof Error ? error.message : String(error),
                });
                return { ...DEFAULT_MUSIC_SETTINGS };
              }
            })(),
          ]);
        },
      );

      return { stories, timeline, settings: settingsMap, music: musicSettings };
    },
    // Cache key parts: ['wedding-page-data', slug] → per-tenant isolation.
    [`wedding-page-data`, slug],
    {
      // Same per-wedding tag as getCachedWeddingData → on-demand invalidation
      // via revalidateTag('wedding-{slug}') busts BOTH caches atomically.
      tags: [weddingCacheTag(slug)],
      // Fallback revalidate: 5 minutes (matches getCachedWeddingData).
      revalidate: 300,
    },
  );

  return cachedFn(slug);
}
