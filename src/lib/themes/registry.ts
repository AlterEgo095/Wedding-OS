// ══════════════════════════════════════════════════════════════════════════════
// src/lib/themes/registry.ts
// MISSION 5.9.2 P1 — DB-backed theme registry (single source of truth).
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the 4 fragmented theme registries (THEME_PACKAGES, THEME_PRESETS,
// THEME_TEMPLATES, IDENTITY_PRESETS) with a single DB-backed PlatformTheme
// catalog (audit 5.9.1 P1-1 fix — "four disconnected registries with drift").
//
// Public API:
//   - listPlatformThemes(filter?) → PlatformThemeSummary[]
//   - getPlatformThemeBySlug(slug) → PlatformThemeDetailed | null
//   - getPlatformThemeById(id) → PlatformThemeDetailed | null
//   - getDefaultPlatformTheme() → PlatformThemeDetailed | null
//   - listRecommendedPlatformThemes() → PlatformThemeSummary[]
//   - listPremiumPlatformThemes() → PlatformThemeSummary[]
//
// The original constants (THEME_PACKAGES, THEME_PRESETS, THEME_TEMPLATES,
// IDENTITY_PRESETS) remain in their files as SEED SOURCES — they are consumed
// only by `scripts/seed-platform-themes-phase1.cjs` to populate the DB. Runtime
// code should ALWAYS go through this module to read themes.
//
// This module is READ-ONLY. Writes (create/update/delete themes) go through
// the /api/platform/themes REST API.
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlatformThemeSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  category: string | null;
  tier: string;
  version: string;
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  identity: string | null;
  fontDisplay: string | null;
  fontBody: string | null;
  /** Parsed palette (primary, accent, surface, ...). Empty if paletteJson is malformed. */
  palette: Record<string, string | null>;
  /** Parsed preview swatch if configJson contains one (identity presets only). */
  preview?: { bg: string; text: string; swatch: string[] };
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformThemeDetailed extends PlatformThemeSummary {
  configJson: string;
  paletteJson: string;
  isBuiltIn: boolean;
  status: string;
}

export interface ListThemesFilter {
  tier?: string;
  category?: string;
  isPremium?: boolean;
  isRecommended?: boolean;
  isDefault?: boolean;
  status?: string;
  /** Free-text search on name + slug. */
  search?: string;
  /** Limit (default 100, max 200). */
  limit?: number;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const SUMMARY_SELECT = {
  id: true,
  slug: true,
  name: true,
  category: true,
  tier: true,
  version: true,
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  identity: true,
  fontDisplay: true,
  fontBody: true,
  paletteJson: true,
  configJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DETAILED_SELECT = {
  ...SUMMARY_SELECT,
  isBuiltIn: true,
  status: true,
} as const;

function safeParseJson<T = Record<string, unknown>>(
  raw: string | null | undefined,
  fallback: T,
): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toSummary(row: {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  tier: string;
  version: string;
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  identity: string | null;
  fontDisplay: string | null;
  fontBody: string | null;
  paletteJson: string;
  configJson: string;
  createdAt: Date;
  updatedAt: Date;
}): PlatformThemeSummary {
  const palette = safeParseJson<Record<string, string | null>>(
    row.paletteJson,
    {},
  );
  const config = safeParseJson<{
    description?: string;
    preview?: { bg: string; text: string; swatch: string[] };
  }>(row.configJson, {});
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: config.description ?? null,
    category: row.category,
    tier: row.tier,
    version: row.version,
    isPremium: row.isPremium,
    isRecommended: row.isRecommended,
    isDefault: row.isDefault,
    identity: row.identity,
    fontDisplay: row.fontDisplay,
    fontBody: row.fontBody,
    palette,
    preview: config.preview,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * List PlatformThemes with optional filter. Returns up to `limit` rows (default
 * 100, max 200), ordered by isDefault desc, isRecommended desc, name asc.
 */
export async function listPlatformThemes(
  filter: ListThemesFilter = {},
): Promise<PlatformThemeSummary[]> {
  const limit = Math.min(200, Math.max(1, filter.limit ?? 100));
  const where: Record<string, unknown> = {};
  if (filter.tier) where.tier = filter.tier;
  if (filter.category) where.category = filter.category;
  if (filter.isPremium !== undefined) where.isPremium = filter.isPremium;
  if (filter.isRecommended !== undefined) where.isRecommended = filter.isRecommended;
  if (filter.isDefault !== undefined) where.isDefault = filter.isDefault;
  if (filter.status) where.status = filter.status;
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search } },
      { slug: { contains: filter.search } },
    ];
  }

  const rows = await db.platformTheme.findMany({
    where,
    select: SUMMARY_SELECT,
    orderBy: [
      { isDefault: 'desc' },
      { isRecommended: 'desc' },
      { name: 'asc' },
    ],
    take: limit,
  });

  return rows.map(toSummary);
}

/**
 * Resolve a PlatformTheme by slug. Returns null if not found.
 */
export async function getPlatformThemeBySlug(
  slug: string,
): Promise<PlatformThemeDetailed | null> {
  const row = await db.platformTheme.findUnique({
    where: { slug },
    select: DETAILED_SELECT,
  });
  if (!row) return null;
  return {
    ...toSummary(row),
    configJson: row.configJson,
    paletteJson: row.paletteJson,
    isBuiltIn: row.isBuiltIn,
    status: row.status,
  };
}

/**
 * Resolve a PlatformTheme by ID. Returns null if not found.
 */
export async function getPlatformThemeById(
  id: string,
): Promise<PlatformThemeDetailed | null> {
  const row = await db.platformTheme.findUnique({
    where: { id },
    select: DETAILED_SELECT,
  });
  if (!row) return null;
  return {
    ...toSummary(row),
    configJson: row.configJson,
    paletteJson: row.paletteJson,
    isBuiltIn: row.isBuiltIn,
    status: row.status,
  };
}

/**
 * Returns the default PlatformTheme (isDefault=true). If multiple are flagged
 * (shouldn't happen, but defensive), returns the first by name.
 */
export async function getDefaultPlatformTheme(): Promise<PlatformThemeDetailed | null> {
  const row = await db.platformTheme.findFirst({
    where: { isDefault: true, status: 'PUBLISHED' },
    select: DETAILED_SELECT,
    orderBy: { name: 'asc' },
  });
  if (!row) return null;
  return {
    ...toSummary(row),
    configJson: row.configJson,
    paletteJson: row.paletteJson,
    isBuiltIn: row.isBuiltIn,
    status: row.status,
  };
}

/**
 * Returns the recommended PlatformThemes (isRecommended=true), ordered by name.
 */
export async function listRecommendedPlatformThemes(): Promise<PlatformThemeSummary[]> {
  const rows = await db.platformTheme.findMany({
    where: { isRecommended: true, status: 'PUBLISHED' },
    select: SUMMARY_SELECT,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toSummary);
}

/**
 * Returns the premium PlatformThemes (isPremium=true), ordered by tier then name.
 */
export async function listPremiumPlatformThemes(): Promise<PlatformThemeSummary[]> {
  const rows = await db.platformTheme.findMany({
    where: { isPremium: true, status: 'PUBLISHED' },
    select: SUMMARY_SELECT,
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toSummary);
}

/**
 * Convenience: count themes by tier/category for catalog stats.
 */
export async function getThemeCatalogStats(): Promise<{
  total: number;
  premium: number;
  recommended: number;
  identityPresets: number;
  byTier: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  const [total, premium, recommended, identityPresets, tierGroups, categoryGroups] =
    await Promise.all([
      db.platformTheme.count({ where: { status: 'PUBLISHED' } }),
      db.platformTheme.count({ where: { isPremium: true, status: 'PUBLISHED' } }),
      db.platformTheme.count({ where: { isRecommended: true, status: 'PUBLISHED' } }),
      db.platformTheme.count({ where: { NOT: { identity: null }, status: 'PUBLISHED' } }),
      db.platformTheme.groupBy({
        by: ['tier'],
        where: { status: 'PUBLISHED' },
        _count: true,
      }),
      db.platformTheme.groupBy({
        by: ['category'],
        where: { status: 'PUBLISHED' },
        _count: true,
      }),
    ]);

  const byTier: Record<string, number> = {};
  for (const g of tierGroups) byTier[g.tier] = g._count;
  const byCategory: Record<string, number> = {};
  for (const g of categoryGroups) byCategory[g.category ?? 'null'] = g._count;

  return { total, premium, recommended, identityPresets, byTier, byCategory };
}

// ─── Backward-compat shims ───────────────────────────────────────────────────
//
// These functions provide a DB-backed equivalent of the original registry
// getters. They return the SAME shape as the original constants so existing
// consumers can migrate without refactoring.
//
// They use an in-process cache (5 min TTL) to avoid hitting the DB on every
// render — themes change rarely (only on admin edit / seed).

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _allThemesCache: CacheEntry<PlatformThemeSummary[]> | null = null;

async function getAllThemesCached(): Promise<PlatformThemeSummary[]> {
  const now = Date.now();
  if (_allThemesCache && _allThemesCache.expiresAt > now) {
    return _allThemesCache.value;
  }
  const value = await listPlatformThemes({ limit: 200 });
  _allThemesCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/**
 * Invalidate the in-process cache. Call this after a theme is created/updated/
 * deleted to force the next read to hit the DB.
 */
export function invalidateThemeRegistryCache(): void {
  _allThemesCache = null;
  logger.debug('Theme registry cache invalidated');
}
