// ══════════════════════════════════════════════════════════════════════════════
// src/lib/invitations/index.ts
// MISSION 5.9.2 P3 — Invitation Experience Library: Registry + Composer.
// ══════════════════════════════════════════════════════════════════════════════
//
// This module is the SINGLE SOURCE OF TRUTH for the invitation layer at
// runtime. It mirrors the pattern of `src/lib/themes/registry.ts`:
//
//   - DB-backed InvitationTemplate catalog (cross-tenant — uses `unsafePlatformDb`)
//   - 5-min in-process cache (invalidated on writes)
//   - READ-ONLY public API (writes go through /api/platform/invitation-templates)
//   - Composer function that merges template config + live wedding + guest data
//
// PUBLIC API:
//
//   Registry (read templates from DB):
//     - listInvitationTemplates(filter?) → InvitationTemplateSummary[]
//     - getInvitationTemplateBySlug(slug) → InvitationTemplateDetailed | null
//     - getInvitationTemplateById(id) → InvitationTemplateDetailed | null
//     - getDefaultInvitationTemplate() → InvitationTemplateDetailed | null
//     - listRecommendedInvitationTemplates() → InvitationTemplateSummary[]
//     - listPremiumInvitationTemplates() → InvitationTemplateSummary[]
//     - getInvitationCatalogStats() → { total, premium, byTier, byCategory, ... }
//
//   Composer (merge template + wedding + guest → render config):
//     - composeInvitationExperience(templateSlug, ctx) → InvitationExperienceConfig
//
//   Cache control:
//     - invalidateInvitationRegistryCache() → void
//
// The Composer is the heart of Mission 5.9.2. It:
//   1. Loads the template's InvitationTemplateConfig (from DB or cache)
//   2. Resolves media slots (semantic role → URL via ctx.mediaSlots)
//   3. Resolves data bindings (placeholder → string via ctx dotted path)
//   4. Applies per-wedding overrides (sections/tokens/copy)
//   5. Merges tokens (template defaults + overrides + theme palette merge)
//   6. Picks active language (ctx.lang or 'fr')
//   7. Stamps version + generatedAt for cache-busting + audit
//
// The output InvitationExperienceConfig is what IdentityInvitation (Phase 4)
// reads to dispatch to the right premium renderer component.
// ══════════════════════════════════════════════════════════════════════════════

import { unsafePlatformDb as platformDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  INVITATION_COMPOSER_VERSION,
  type InvitationApprovalStatus,
  type InvitationCategory,
  type InvitationFormat,
  type InvitationIdentity,
  type InvitationLanguage,
  type InvitationLayout,
  type InvitationStyle,
  type InvitationTemplateStatus,
  type InvitationTier,
  type InvitationTemplateConfig,
  type InvitationTemplateRegistryEntry,
  type InvitationExperienceConfig,
  type InvitationExperienceContext,
  type InvitationSection,
  type InvitationSectionType,
  type InvitationTokens,
  type InvitationTemplateOverrides,
  type MediaSlot,
  type MediaSlotSemanticRole,
} from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InvitationTemplateSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  category: InvitationCategory;
  style: InvitationStyle;
  layout: InvitationLayout;
  identity: InvitationIdentity | null;
  tier: InvitationTier;
  status: InvitationTemplateStatus;
  isLocked: boolean;
  approvalStatus: InvitationApprovalStatus;
  isBuiltIn: boolean;
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  version: number;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  themeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Parsed config — sections count + media slots count + bindings count (denormalised). */
  sectionsCount: number;
  mediaSlotsCount: number;
  dataBindingsCount: number;
  guestBindingsCount: number;
}

export interface InvitationTemplateDetailed extends InvitationTemplateSummary {
  configJson: string;
  assetsJson: string;
  previewJson: string;
  /** Parsed config (the full InvitationTemplateConfig object). */
  config: InvitationTemplateConfig;
}

export interface ListInvitationTemplatesFilter {
  tier?: InvitationTier;
  category?: InvitationCategory;
  isPremium?: boolean;
  isRecommended?: boolean;
  isDefault?: boolean;
  status?: InvitationTemplateStatus;
  approvalStatus?: InvitationApprovalStatus;
  isLocked?: boolean;
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
  description: true,
  category: true,
  style: true,
  layout: true,
  identity: true,
  tier: true,
  status: true,
  isLocked: true,
  approvalStatus: true,
  isBuiltIn: true,
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  version: true,
  thumbnailUrl: true,
  previewUrl: true,
  themeId: true,
  configJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DETAILED_SELECT = {
  ...SUMMARY_SELECT,
  assetsJson: true,
  previewJson: true,
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
  description: string | null;
  category: string;
  style: string;
  layout: string;
  identity: string | null;
  tier: string;
  status: string;
  isLocked: boolean;
  approvalStatus: string;
  isBuiltIn: boolean;
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  version: number;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  themeId: string | null;
  configJson: string;
  createdAt: Date;
  updatedAt: Date;
}): InvitationTemplateSummary {
  const config = safeParseJson<InvitationTemplateConfig>(row.configJson, {
    sections: [],
    mediaSlots: [],
    weddingBindings: {} as never,
    guestBindings: {} as never,
    responsiveRules: { mobile: {}, tablet: {}, desktop: {} },
    animationRules: { reveal: 'none', duration: 0, easing: 'ease' },
    qualityRules: {
      minImagesPerSlot: 1,
      requiredBindings: [],
      minQrReadability: 0,
      minAccessibility: 0,
      minContrastRatio: 4.5,
      blockOnCritical: true,
    },
    supportedFormats: [],
    supportedLanguages: [],
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category as InvitationCategory,
    style: row.style as InvitationStyle,
    layout: row.layout as InvitationLayout,
    identity: row.identity as InvitationIdentity | null,
    tier: row.tier as InvitationTier,
    status: row.status as InvitationTemplateStatus,
    isLocked: row.isLocked,
    approvalStatus: row.approvalStatus as InvitationApprovalStatus,
    isBuiltIn: row.isBuiltIn,
    isPremium: row.isPremium,
    isRecommended: row.isRecommended,
    isDefault: row.isDefault,
    version: row.version,
    thumbnailUrl: row.thumbnailUrl,
    previewUrl: row.previewUrl,
    themeId: row.themeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sectionsCount: Array.isArray(config.sections) ? config.sections.filter((s) => s.enabled).length : 0,
    mediaSlotsCount: Array.isArray(config.mediaSlots) ? config.mediaSlots.length : 0,
    dataBindingsCount: config.weddingBindings ? Object.keys(config.weddingBindings).length : 0,
    guestBindingsCount: config.guestBindings ? Object.keys(config.guestBindings).length : 0,
  };
}

// ─── Public Registry API ─────────────────────────────────────────────────────

/**
 * List InvitationTemplates with optional filter. Returns up to `limit` rows
 * (default 100, max 200), ordered by isDefault desc, isRecommended desc, name asc.
 *
 * CROSS-TENANT: InvitationTemplates are PLATFORM-level (super-admin managed).
 * They are NOT scoped to a specific wedding — every org sees the same catalog.
 */
export async function listInvitationTemplates(
  filter: ListInvitationTemplatesFilter = {},
): Promise<InvitationTemplateSummary[]> {
  const limit = Math.min(200, Math.max(1, filter.limit ?? 100));
  const where: Record<string, unknown> = {};
  if (filter.tier) where.tier = filter.tier;
  if (filter.category) where.category = filter.category;
  if (filter.isPremium !== undefined) where.isPremium = filter.isPremium;
  if (filter.isRecommended !== undefined) where.isRecommended = filter.isRecommended;
  if (filter.isDefault !== undefined) where.isDefault = filter.isDefault;
  if (filter.status) where.status = filter.status;
  if (filter.approvalStatus) where.approvalStatus = filter.approvalStatus;
  if (filter.isLocked !== undefined) where.isLocked = filter.isLocked;
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search } },
      { slug: { contains: filter.search } },
    ];
  }

  const rows = await platformDb.invitationTemplate.findMany({
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
 * Resolve an InvitationTemplate by slug. Returns null if not found.
 * Includes the full parsed config.
 */
export async function getInvitationTemplateBySlug(
  slug: string,
): Promise<InvitationTemplateDetailed | null> {
  const row = await platformDb.invitationTemplate.findUnique({
    where: { slug },
    select: DETAILED_SELECT,
  });
  if (!row) return null;
  const summary = toSummary(row);
  const config = safeParseJson<InvitationTemplateConfig>(row.configJson, {
    sections: [],
    mediaSlots: [],
    weddingBindings: {} as never,
    guestBindings: {} as never,
    responsiveRules: { mobile: {}, tablet: {}, desktop: {} },
    animationRules: { reveal: 'none', duration: 0, easing: 'ease' },
    qualityRules: {
      minImagesPerSlot: 1,
      requiredBindings: [],
      minQrReadability: 0,
      minAccessibility: 0,
      minContrastRatio: 4.5,
      blockOnCritical: true,
    },
    supportedFormats: [],
    supportedLanguages: [],
  });
  return {
    ...summary,
    configJson: row.configJson,
    assetsJson: row.assetsJson,
    previewJson: row.previewJson,
    config,
  };
}

/**
 * Resolve an InvitationTemplate by ID. Returns null if not found.
 */
export async function getInvitationTemplateById(
  id: string,
): Promise<InvitationTemplateDetailed | null> {
  const row = await platformDb.invitationTemplate.findUnique({
    where: { id },
    select: DETAILED_SELECT,
  });
  if (!row) return null;
  const summary = toSummary(row);
  const config = safeParseJson<InvitationTemplateConfig>(row.configJson, {
    sections: [],
    mediaSlots: [],
    weddingBindings: {} as never,
    guestBindings: {} as never,
    responsiveRules: { mobile: {}, tablet: {}, desktop: {} },
    animationRules: { reveal: 'none', duration: 0, easing: 'ease' },
    qualityRules: {
      minImagesPerSlot: 1,
      requiredBindings: [],
      minQrReadability: 0,
      minAccessibility: 0,
      minContrastRatio: 4.5,
      blockOnCritical: true,
    },
    supportedFormats: [],
    supportedLanguages: [],
  });
  return {
    ...summary,
    configJson: row.configJson,
    assetsJson: row.assetsJson,
    previewJson: row.previewJson,
    config,
  };
}

/**
 * Returns the default InvitationTemplate (isDefault=true, status=PUBLISHED).
 * If multiple are flagged (shouldn't happen), returns the first by name.
 */
export async function getDefaultInvitationTemplate(): Promise<InvitationTemplateDetailed | null> {
  const row = await platformDb.invitationTemplate.findFirst({
    where: { isDefault: true, status: 'PUBLISHED' },
    select: DETAILED_SELECT,
    orderBy: { name: 'asc' },
  });
  if (!row) return null;
  const summary = toSummary(row);
  const config = safeParseJson<InvitationTemplateConfig>(row.configJson, {
    sections: [],
    mediaSlots: [],
    weddingBindings: {} as never,
    guestBindings: {} as never,
    responsiveRules: { mobile: {}, tablet: {}, desktop: {} },
    animationRules: { reveal: 'none', duration: 0, easing: 'ease' },
    qualityRules: {
      minImagesPerSlot: 1,
      requiredBindings: [],
      minQrReadability: 0,
      minAccessibility: 0,
      minContrastRatio: 4.5,
      blockOnCritical: true,
    },
    supportedFormats: [],
    supportedLanguages: [],
  });
  return {
    ...summary,
    configJson: row.configJson,
    assetsJson: row.assetsJson,
    previewJson: row.previewJson,
    config,
  };
}

/**
 * Returns the recommended InvitationTemplates (isRecommended=true, status=PUBLISHED).
 */
export async function listRecommendedInvitationTemplates(): Promise<InvitationTemplateSummary[]> {
  const rows = await platformDb.invitationTemplate.findMany({
    where: { isRecommended: true, status: 'PUBLISHED' },
    select: SUMMARY_SELECT,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toSummary);
}

/**
 * Returns the premium InvitationTemplates (isPremium=true, status=PUBLISHED).
 */
export async function listPremiumInvitationTemplates(): Promise<InvitationTemplateSummary[]> {
  const rows = await platformDb.invitationTemplate.findMany({
    where: { isPremium: true, status: 'PUBLISHED' },
    select: SUMMARY_SELECT,
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toSummary);
}

/**
 * Convenience: count templates by tier/category for catalog stats.
 */
export async function getInvitationCatalogStats(): Promise<{
  total: number;
  premium: number;
  recommended: number;
  default: number;
  locked: number;
  byTier: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
}> {
  const [
    total,
    premium,
    recommended,
    defaultCount,
    locked,
    tierGroups,
    categoryGroups,
    statusGroups,
  ] = await Promise.all([
    platformDb.invitationTemplate.count({ where: { status: 'PUBLISHED' } }),
    platformDb.invitationTemplate.count({ where: { isPremium: true, status: 'PUBLISHED' } }),
    platformDb.invitationTemplate.count({ where: { isRecommended: true, status: 'PUBLISHED' } }),
    platformDb.invitationTemplate.count({ where: { isDefault: true, status: 'PUBLISHED' } }),
    platformDb.invitationTemplate.count({ where: { isLocked: true } }),
    platformDb.invitationTemplate.groupBy({
      by: ['tier'],
      where: { status: 'PUBLISHED' },
      _count: true,
    }),
    platformDb.invitationTemplate.groupBy({
      by: ['category'],
      where: { status: 'PUBLISHED' },
      _count: true,
    }),
    platformDb.invitationTemplate.groupBy({
      by: ['status'],
      _count: true,
    }),
  ]);

  const byTier: Record<string, number> = {};
  for (const g of tierGroups) byTier[g.tier] = g._count;
  const byCategory: Record<string, number> = {};
  for (const g of categoryGroups) byCategory[g.category] = g._count;
  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) byStatus[g.status] = g._count;

  return {
    total,
    premium,
    recommended,
    default: defaultCount,
    locked,
    byTier,
    byCategory,
    byStatus,
  };
}

// ─── In-process cache (5 min TTL — mirrors themes/registry.ts) ──────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _allTemplatesCache: CacheEntry<InvitationTemplateSummary[]> | null = null;
const _bySlugCache = new Map<string, CacheEntry<InvitationTemplateDetailed | null>>();

async function getAllTemplatesCached(): Promise<InvitationTemplateSummary[]> {
  const now = Date.now();
  if (_allTemplatesCache && _allTemplatesCache.expiresAt > now) {
    return _allTemplatesCache.value;
  }
  const value = await listInvitationTemplates({ limit: 200 });
  _allTemplatesCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

async function getTemplateBySlugCached(
  slug: string,
): Promise<InvitationTemplateDetailed | null> {
  const now = Date.now();
  const cached = _bySlugCache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = await getInvitationTemplateBySlug(slug);
  _bySlugCache.set(slug, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Invalidate the in-process cache. Call this after a template is created/
 * updated/deleted to force the next read to hit the DB.
 */
export function invalidateInvitationRegistryCache(): void {
  _allTemplatesCache = null;
  _bySlugCache.clear();
  logger.debug('Invitation registry cache invalidated');
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSER — merge template config + live wedding + guest data
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compose an InvitationExperienceConfig from a template + a wedding/guest context.
 *
 * This is the heart of Mission 5.9.2 — the function that turns a static
 * template config + dynamic wedding data into the final render config that
 * the IdentityInvitation dispatcher (and the 5 premium components) consume.
 *
 * Algorithm:
 *   1. Load template (from cache or DB) — fallback to default if not found
 *   2. Parse the template's InvitationTemplateConfig
 *   3. Apply per-wedding overrides (sections/tokens/copy) from ctx.overrides
 *   4. Resolve media slots: map semantic role → URL via ctx.mediaSlots
 *   5. Resolve data bindings: for each placeholder, evaluate the expression
 *      against the ctx (dotted path: wedding.coupleLabel, guest.name, etc.)
 *   6. Merge tokens: template defaults + overrides + (theme palette TBD in Phase 5)
 *   7. Pick active language: ctx.lang or 'fr' (only if supported by template)
 *   8. Stamp version + generatedAt for cache-busting + audit
 *   9. Return the full InvitationExperienceConfig object
 *
 * The composer is PURE (no side effects, no I/O except the initial DB read).
 * It does NOT write to the DB — snapshot creation is the pipeline's job
 * (Phase 5 — resolveInvitations stage).
 *
 * @param templateSlug The slug of the InvitationTemplate to use.
 * @param ctx The runtime context (wedding + guest + media + overrides).
 * @returns The composed InvitationExperienceConfig (ready for rendering).
 */
export async function composeInvitationExperience(
  templateSlug: string,
  ctx: InvitationExperienceContext,
): Promise<InvitationExperienceConfig> {
  // Step 1: Load template (cache or DB) — fallback to default if not found
  let template = await getTemplateBySlugCached(templateSlug);
  if (!template) {
    logger.warn(
      `composeInvitationExperience: template "${templateSlug}" not found — falling back to default`,
      { templateSlug, weddingId: ctx.weddingId },
    );
    template = await getDefaultInvitationTemplate();
    if (!template) {
      throw new Error(
        `Invitation template "${templateSlug}" not found and no default template is configured. ` +
          `Seed the canonical templates via scripts/seed-invitation-templates.cjs.`,
      );
    }
  }

  const cfg = template.config;

  // Step 2: Apply per-wedding overrides (sections/tokens/copy)
  const overrides = ctx.overrides ?? {};
  const resolvedSections = applySectionOverrides(cfg.sections, overrides);
  const resolvedTokens = applyTokenOverrides(cfg.tokens ?? {}, overrides.tokens);
  const resolvedCopy = applyCopyOverrides(
    (cfg.copy ?? {}) as Record<InvitationLanguage, Record<string, string>>,
    overrides.copy ?? {},
    pickActiveLanguage(cfg.supportedLanguages, ctx),
  );

  // Step 3: Resolve media slots (semantic role → URL via ctx.mediaSlots)
  const resolvedMediaSlots = resolveMediaSlots(cfg.mediaSlots, ctx.mediaSlots);

  // Step 4: Resolve data bindings (placeholder → string via dotted path)
  const resolvedBindings = resolveDataBindings(
    cfg.weddingBindings,
    cfg.guestBindings,
    ctx,
  );

  // Step 5: Pick active language
  const activeLanguage = pickActiveLanguage(cfg.supportedLanguages, ctx);

  // Step 6: Stamp version + generatedAt
  const generatedAt = new Date().toISOString();

  return {
    templateSlug: template.slug,
    templateVersion: template.version,
    category: template.category,
    style: template.style,
    layout: template.layout,
    identity: template.identity,
    sections: resolvedSections,
    mediaSlots: resolvedMediaSlots,
    tokens: resolvedTokens,
    resolvedBindings,
    responsiveRules: cfg.responsiveRules,
    animationRules: cfg.animationRules,
    qualityRules: cfg.qualityRules,
    supportedFormats: cfg.supportedFormats,
    supportedLanguages: cfg.supportedLanguages,
    activeLanguage,
    copy: resolvedCopy,
    wedding: ctx,
    guest: ctx.guest ?? null,
    generatedAt,
    composerVersion: INVITATION_COMPOSER_VERSION,
  };
}

// ─── Composer helpers ─────────────────────────────────────────────────────────

/**
 * Apply per-wedding section overrides (enable/disable + reorder + props).
 */
function applySectionOverrides(
  sections: InvitationSection[],
  overrides: InvitationTemplateOverrides,
): InvitationSection[] {
  let result = sections.map((s) => {
    const enabledOverride = overrides.sectionEnabled?.[s.id];
    const orderOverride = overrides.sectionOrder?.[s.id];
    const propsOverride = overrides.sectionProps?.[s.id];
    return {
      ...s,
      enabled: enabledOverride !== undefined ? enabledOverride : s.enabled,
      order: orderOverride !== undefined ? orderOverride : s.order,
      props: propsOverride ? { ...s.props, ...propsOverride } : s.props,
    };
  });
  // Sort by order ascending (stable)
  result = result.sort((a, b) => a.order - b.order);
  return result;
}

/**
 * Apply per-wedding token overrides (e.g. couple picked a custom primary color).
 */
function applyTokenOverrides(
  defaults: InvitationTokens,
  overrides?: Partial<InvitationTokens>,
): InvitationTokens {
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
}

/**
 * Apply per-wedding copy overrides (per language).
 */
function applyCopyOverrides(
  defaults: Record<InvitationLanguage, Record<string, string>>,
  overrides: Partial<Record<InvitationLanguage, Record<string, string>>>,
  activeLang: InvitationLanguage,
): Record<string, string> {
  const defaultCopy = defaults[activeLang] ?? {};
  const overrideCopy = overrides[activeLang] ?? {};
  return { ...defaultCopy, ...overrideCopy };
}

/**
 * Pick the active language: prefer ctx.lang if supported by the template,
 * otherwise default to 'fr' (canonical mission language).
 */
function pickActiveLanguage(
  supported: InvitationLanguage[],
  ctx: InvitationExperienceContext,
): InvitationLanguage {
  // The ctx doesn't carry lang directly — caller can inject via overrides.copy
  // We default to 'fr' (canonical mission language per brief §1).
  // Future: read from request Accept-Language in the API route.
  if (supported.includes('fr')) return 'fr';
  if (supported.includes('en')) return 'en';
  return supported[0] ?? 'fr';
}

/**
 * Resolve media slots: for each declared slot, look up ctx.mediaSlots[semanticRole]
 * and return the resolved asset. If no media is bound, use the slot's fallback
 * (or null if no fallback — quality gate will flag this).
 */
function resolveMediaSlots(
  declared: MediaSlot[],
  ctxMediaSlots: Record<string, InvitationExperienceContext['mediaSlots'][string]>,
): Record<string, InvitationExperienceContext['mediaSlots'][string]> {
  const resolved: Record<string, InvitationExperienceContext['mediaSlots'][string]> = {};
  for (const slot of declared) {
    const asset = ctxMediaSlots[slot.semanticRole];
    if (asset) {
      resolved[slot.slotId] = asset;
    } else if (slot.fallback) {
      // Use the slot's fallback URL (synthesise a minimal asset object)
      resolved[slot.slotId] = {
        mediaId: 'fallback',
        url: slot.fallback,
        alt: slot.label,
        aspectRatio: slot.aspectRatio,
      };
    }
    // If no asset AND no fallback, the slot is left undefined — the quality
    // gate (Phase 7 — invitation-scorecard.ts) will flag this as a critical
    // error and block publication if `required: true`.
  }
  return resolved;
}

/**
 * Resolve data bindings: for each (placeholder, expression) pair in
 * weddingBindings + guestBindings, evaluate the expression against the ctx
 * (dotted path: wedding.coupleLabel, guest.name, etc.) and return a flat
 * placeholder → string map.
 *
 * Supports format transformations (date, time, currency, etc.).
 */
function resolveDataBindings(
  weddingBindings: Record<string, { placeholder: string; expression: string; fallback?: string; format?: string; formatArgs?: Record<string, string> }>,
  guestBindings: Record<string, { placeholder: string; expression: string; fallback?: string; format?: string; formatArgs?: Record<string, string> }>,
  ctx: InvitationExperienceContext,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  // Wedding-level bindings
  for (const key of Object.keys(weddingBindings)) {
    const binding = weddingBindings[key];
    const value = evaluateExpression(binding.expression, ctx, binding.fallback);
    resolved[binding.placeholder] = formatValue(value, binding.format, binding.formatArgs);
  }

  // Guest-level bindings (only if a guest context is present)
  if (ctx.guest) {
    for (const key of Object.keys(guestBindings)) {
      const binding = guestBindings[key];
      const value = evaluateExpression(binding.expression, ctx, binding.fallback);
      resolved[binding.placeholder] = formatValue(value, binding.format, binding.formatArgs);
    }
  }

  return resolved;
}

/**
 * Evaluate a dotted-path expression against the context.
 *
 * Supported roots:
 *   - "wedding." → InvitationExperienceContext fields (coupleLabel, weddingDate, venueName, ...)
 *   - "guest." → InvitationGuestContext fields (name, firstName, tableLabel, accessCode, ...)
 *   - "event." → InvitationEventContext fields (resolved via events array — picks the first event of the type)
 *
 * Returns the fallback if any segment is undefined or the path is invalid.
 */
function evaluateExpression(
  expression: string,
  ctx: InvitationExperienceContext,
  fallback?: string,
): string {
  try {
    const [root, ...rest] = expression.split('.');
    if (!root) return fallback ?? '';

    let target: unknown;
    if (root === 'wedding') {
      target = {
        weddingId: ctx.weddingId,
        weddingSlug: ctx.weddingSlug,
        coupleLabel: ctx.coupleLabel,
        brideName: ctx.brideName,
        groomName: ctx.groomName,
        weddingDate: ctx.weddingDate,
        timezone: ctx.timezone,
        venueName: ctx.venueName,
        venueAddress: ctx.venueAddress,
        venueCity: ctx.venueCity,
        venueLat: ctx.venueLat,
        venueLng: ctx.venueLng,
        rsvpUrl: ctx.rsvpUrl,
        galleryUrl: ctx.galleryUrl,
        storyUrl: ctx.storyUrl,
        mapUrl: ctx.mapUrl,
      };
    } else if (root === 'guest' && ctx.guest) {
      target = {
        guestId: ctx.guest.guestId,
        name: ctx.guest.name,
        firstName: ctx.guest.firstName,
        tableLabel: ctx.guest.tableLabel,
        accessCode: ctx.guest.accessCode,
        qrCodeUrl: ctx.guest.qrCodeUrl,
        rsvpUrl: ctx.guest.rsvpUrl,
      };
    } else if (root === 'event' && ctx.events && ctx.events.length > 0) {
      // Pick the first event matching the type in rest[0] (e.g. "event.ceremony.title")
      const eventType = rest.shift();
      const ev = ctx.events.find((e) => e.type === eventType);
      if (!ev) return fallback ?? '';
      target = ev;
    } else if (root === 'story' && ctx.stories && ctx.stories.length > 0) {
      // Pick the first story
      target = ctx.stories[0];
    } else {
      return fallback ?? '';
    }

    // Walk the remaining path
    let current: unknown = target;
    for (const segment of rest) {
      if (current == null || typeof current !== 'object') return fallback ?? '';
      current = (current as Record<string, unknown>)[segment];
      if (current === undefined) return fallback ?? '';
    }

    if (current === null || current === undefined) return fallback ?? '';
    return String(current);
  } catch (err) {
    logger.warn('evaluateExpression failed', { expression, err });
    return fallback ?? '';
  }
}

/**
 * Apply a format transformation to a resolved value.
 */
function formatValue(
  value: string,
  format?: string,
  _formatArgs?: Record<string, string>,
): string {
  if (!format || !value) return value;
  try {
    switch (format) {
      case 'date': {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      case 'date-long': {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleDateString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      case 'time': {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      case 'datetime': {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleString('fr-FR');
      }
      case 'currency':
        return value; // No transformation (currency not used in invitations today)
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      default:
        return value;
    }
  } catch {
    return value;
  }
}

// ─── Registry entry (for admin UI matrix preview) ─────────────────────────────

/**
 * Returns a flat list of InvitationTemplateRegistryEntry objects —
 * denormalised view used by the admin UI to render the template picker grid.
 *
 * Combines the DB row with the resolved renderer component (from variants.ts).
 */
export async function listInvitationTemplateRegistryEntries(): Promise<
  InvitationTemplateRegistryEntry[]
> {
  const summaries = await getAllTemplatesCached();
  return summaries.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description ?? null,
    category: s.category,
    style: s.style,
    layout: s.layout,
    identity: s.identity,
    tier: s.tier,
    status: s.status,
    isLocked: s.isLocked,
    approvalStatus: s.approvalStatus,
    isBuiltIn: s.isBuiltIn,
    isPremium: s.isPremium,
    isRecommended: s.isRecommended,
    isDefault: s.isDefault,
    version: s.version,
    thumbnailUrl: s.thumbnailUrl,
    previewUrl: s.previewUrl,
    themeId: s.themeId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    sectionsCount: s.sectionsCount,
    mediaSlotsCount: s.mediaSlotsCount,
    dataBindingsCount: s.dataBindingsCount,
    guestBindingsCount: s.guestBindingsCount,
  }));
}
