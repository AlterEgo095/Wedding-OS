// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/quality/[slug]/auto-fix/route.ts — Phase 4B+ 1-click auto-fix
// ══════════════════════════════════════════════════════════════════════════════
//
// POST /api/platform/quality/{slug}/auto-fix
//
// Body: `{ fixId: string }` — the `id` field of a `QualityFinding` whose
// `fixType === 'auto'`. (See src/lib/quality/scorecard.ts for the canonical
// list of fixIds.)
//
// Auth: PLATFORM_ADMIN / SUPER_ADMIN only (same gate as the GET route). The
// auto-fix writes to the wedding's `publishedConfigJson` blob + the `Theme`
// row — both are platform-level admin operations that must not be exposed to
// per-wedding organizers or guests.
//
// Idempotent: applying the same fixId twice is a no-op (e.g. enabling an
// already-enabled section). The audit log still records the second call (so
// the trail shows the user clicked the button again) but the underlying data
// is unchanged.
//
// Multi-wedding isolation: the route resolves the wedding by slug, then
// operates ONLY on that wedding's publishedConfigJson + Theme row. There is
// no cross-wedding data access. A PLATFORM_ADMIN can auto-fix ANY wedding
// (the role gate handles this — same as the existing GET route + the
// force-publish POST on the parent route).
//
// Audit: every auto-fix writes an AuditLog row via `writeAuditLog` (non-fatal
// — never throws). action='quality.auto_fix', weddingId=<resolved>,
// userId=<admin>. The metadata captures the fixId + the dimension it came
// from so investigators can reconstruct what was changed.
//
// Response shape:
//   200 OK   `{ success: true, fixId, message, scorecard: <re-computed> }`
//   400      `{ error: '...' }` — bad body / fixId is manual / unsupported fixId
//   401      `{ error: 'Non authentifié' }`
//   403      `{ error: 'Accès refusé' }` — not PLATFORM_ADMIN
//   404      `{ error: 'Mariage introuvable' }` — slug didn't resolve
//   500      `{ error: 'Erreur interne du serveur' }`
//
// Cache headers: `Cache-Control: no-store` — the response carries a freshly
// re-computed scorecard, so caching it would be misleading.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withSecurityHeaders } from '@/lib/rate-limit';
import { computeQualityScorecard } from '@/lib/quality/scorecard';
import { invalidateWeddingCache } from '@/lib/wedding/cache';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, notFound, badRequest, forbidden } from '@/lib/api-errors';
import { db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';
import type { SectionType } from '@/lib/wedding/manifest';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Subset of publishedConfigJson shape that this route reads + mutates. */
interface PublishedConfig {
  manifest?: {
    sections?: Array<{
      id: string;
      type: SectionType;
      enabled: boolean;
      order: number;
      props?: Record<string, unknown>;
    }>;
    theme?: {
      primaryColor?: string;
      accentColor?: string;
      fontDisplay?: string;
      fontBody?: string;
    };
  };
  theme?: {
    primaryColor?: string;
    accentColor?: string;
    fontDisplay?: string;
    fontBody?: string;
    layout?: string;
  };
  // Forward-compat: the scorecard's qualityGate fields live alongside.
  qualityGate?: boolean;
  qualityThreshold?: number;
  // Pass-through fields we don't touch but must preserve when re-serialising.
  [key: string]: unknown;
}

/** Result of applying a single fixId to the parsed config. */
interface FixResult {
  /** Human-readable summary of what was changed (used in the audit log details). */
  summary: string;
  /** The dimension the finding belongs to (for audit metadata). */
  dimension: string;
  /** True if the underlying data actually changed (false = idempotent no-op). */
  changed: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The default theme applied by the `apply-default-theme` fix. Matches the
 * `createDefaultManifest()` defaults in src/lib/wedding/manifest.ts so the
 * fixed wedding renders consistently with the platform's canonical default
 * look (gold + dark navy).
 */
const DEFAULT_THEME_COLORS = {
  primaryColor: '#D4A853',
  accentColor: '#1a1a2e',
  fontDisplay: 'Cormorant Garamond',
  fontBody: 'Inter',
} as const;

/** Layout slug used by `theme-layout-classic`. */
const DEFAULT_LAYOUT_SLUG = 'classic';

/**
 * Section types whose fixId is `enable-section-<type>`. The `hero` section
 * uses the canonical `enable-hero` id (shared across 3 dimensions: VISUAL,
 * UX, PERFORMANCE) — see `resolveSectionTypeFromFixId` below.
 */
const SECTION_FIX_PREFIX = 'enable-section-';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a fixId to a section type. Returns null for non-section fixIds.
 *
 *   `enable-hero`                       → 'hero'
 *   `enable-section-story`              → 'story'
 *   `enable-section-guest-auth`         → 'guest-auth'
 *   `enable-section-rsvp`               → 'rsvp'
 *   `apply-default-theme`               → null
 *   `theme-layout-classic`              → null
 */
function resolveSectionTypeFromFixId(fixId: string): SectionType | null {
  if (fixId === 'enable-hero') return 'hero';
  if (fixId.startsWith(SECTION_FIX_PREFIX)) {
    const type = fixId.slice(SECTION_FIX_PREFIX.length);
    // Validate against the canonical section types list. We import
    // SECTION_TYPES at the top of the file via the manifest module.
    const validTypes: ReadonlyArray<SectionType> = [
      'hero', 'couple', 'countdown', 'story', 'gallery', 'timeline',
      'venue', 'map', 'invitation', 'rsvp', 'guest-auth', 'guest-experience',
      'guestbook', 'cta',
    ];
    if (validTypes.includes(type as SectionType)) {
      return type as SectionType;
    }
  }
  return null;
}

/**
 * Enable a section in the manifest. Idempotent:
 *   - If a section with the given type already exists, set enabled=true.
 *   - If no section with the type exists, append one with a sensible id +
 *     order (so the publishedConfigJson stays valid).
 *
 * Returns `{ changed: boolean }` reflecting whether the manifest was mutated.
 */
function enableSectionInManifest(
  config: PublishedConfig,
  sectionType: SectionType,
): boolean {
  if (!config.manifest) {
    config.manifest = { sections: [], theme: { ...DEFAULT_THEME_COLORS } };
  }
  if (!Array.isArray(config.manifest.sections)) {
    config.manifest.sections = [];
  }

  const sections = config.manifest.sections;
  const existing = sections.find((s) => s.type === sectionType);
  if (existing) {
    if (existing.enabled) {
      return false; // idempotent no-op
    }
    existing.enabled = true;
    return true;
  }

  // Append a new section. Use a slugified id + max order + 1 so the new
  // section renders at the bottom of the page (the organizer can reorder
  // via the Designer afterwards).
  const maxOrder = sections.reduce((max, s) => Math.max(max, s.order ?? 0), -1);
  sections.push({
    id: `auto-${sectionType}`,
    type: sectionType,
    enabled: true,
    order: maxOrder + 1,
  });
  return true;
}

/**
 * Apply the default gold theme to both `publishedConfigJson.theme` and
 * `publishedConfigJson.manifest.theme`. Idempotent: if both already match
 * the defaults, returns `changed: false`.
 */
function applyDefaultTheme(config: PublishedConfig): boolean {
  let changed = false;

  if (!config.manifest) {
    config.manifest = { sections: [], theme: { ...DEFAULT_THEME_COLORS } };
    changed = true;
  } else if (!config.manifest.theme) {
    config.manifest.theme = { ...DEFAULT_THEME_COLORS };
    changed = true;
  } else {
    const t = config.manifest.theme;
    if (t.primaryColor !== DEFAULT_THEME_COLORS.primaryColor) {
      t.primaryColor = DEFAULT_THEME_COLORS.primaryColor;
      changed = true;
    }
    if (t.accentColor !== DEFAULT_THEME_COLORS.accentColor) {
      t.accentColor = DEFAULT_THEME_COLORS.accentColor;
      changed = true;
    }
    if (t.fontDisplay !== DEFAULT_THEME_COLORS.fontDisplay) {
      t.fontDisplay = DEFAULT_THEME_COLORS.fontDisplay;
      changed = true;
    }
    if (t.fontBody !== DEFAULT_THEME_COLORS.fontBody) {
      t.fontBody = DEFAULT_THEME_COLORS.fontBody;
      changed = true;
    }
  }

  // Mirror to the top-level `theme` field (the cache layer reads BOTH —
  // manifest.theme is the source of truth for the rendered page, but
  // publishedConfigJson.theme is the snapshot the deployment pipeline
  // uses on cold-cache first paint).
  if (!config.theme) {
    config.theme = { ...DEFAULT_THEME_COLORS, layout: DEFAULT_LAYOUT_SLUG };
    changed = true;
  } else {
    if (config.theme.primaryColor !== DEFAULT_THEME_COLORS.primaryColor) {
      config.theme.primaryColor = DEFAULT_THEME_COLORS.primaryColor;
      changed = true;
    }
    if (config.theme.accentColor !== DEFAULT_THEME_COLORS.accentColor) {
      config.theme.accentColor = DEFAULT_THEME_COLORS.accentColor;
      changed = true;
    }
    if (config.theme.fontDisplay !== DEFAULT_THEME_COLORS.fontDisplay) {
      config.theme.fontDisplay = DEFAULT_THEME_COLORS.fontDisplay;
      changed = true;
    }
    if (config.theme.fontBody !== DEFAULT_THEME_COLORS.fontBody) {
      config.theme.fontBody = DEFAULT_THEME_COLORS.fontBody;
      changed = true;
    }
  }

  return changed;
}

/**
 * Update the `layout` field on the Theme row + publishedConfigJson.theme.
 * Idempotent: if the layout is already `classic`, returns `changed: false`.
 *
 * Note: the scorecard reads `themeLayout` from `db.theme.layout` (NOT from
 * publishedConfigJson.theme.layout), so we MUST update the Theme row.
 * Mirroring to publishedConfigJson.theme.layout is for forward-consistency
 * (future scorecard revisions may consolidate the source).
 */
function applyClassicLayoutToConfig(config: PublishedConfig): boolean {
  let changed = false;
  if (!config.theme) {
    config.theme = { layout: DEFAULT_LAYOUT_SLUG };
    changed = true;
  } else if (config.theme.layout !== DEFAULT_LAYOUT_SLUG) {
    config.theme.layout = DEFAULT_LAYOUT_SLUG;
    changed = true;
  }
  return changed;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    // ── 1. Auth: PLATFORM_ADMIN / SUPER_ADMIN only ────────────────────────
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;
    if (!user) {
      // Unreachable (requirePlatformAdmin handles null), but TS narrowing.
      return forbidden('Accès refusé');
    }

    // ── 2. Resolve slug ───────────────────────────────────────────────────
    const { slug } = await params;
    if (!slug || typeof slug !== 'string') {
      return notFound('Slug de mariage invalide');
    }

    // ── 3. Parse + validate body ──────────────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return badRequest('Corps de requête invalide');
    }
    const fixId = typeof (body as { fixId?: unknown }).fixId === 'string'
      ? String((body as { fixId: string }).fixId).trim()
      : '';
    if (!fixId) {
      return badRequest('Champ `fixId` requis');
    }

    // ── 4. Resolve wedding by slug (need id for Theme row + audit log) ────
    const wedding = await db.wedding.findUnique({
      where: { slug },
      select: { id: true, publishedConfigJson: true },
    });
    if (!wedding) {
      return notFound('Mariage introuvable');
    }

    // ── 5. Compute current scorecard + locate the finding by fixId ───────
    const scorecard = await computeQualityScorecard(slug);
    if (!scorecard) {
      // Should not happen (wedding resolved above) — belt + suspenders.
      return notFound('Mariage introuvable');
    }

    let matchedDimension: string | null = null;
    let matchedFixType: 'auto' | 'manual' | undefined = undefined;
    let matchedMessage: string | null = null;
    for (const dim of scorecard.dimensions) {
      for (const f of dim.findings) {
        if (f.id === fixId) {
          matchedDimension = dim.id;
          matchedFixType = f.fixType;
          matchedMessage = f.message;
          break;
        }
      }
      if (matchedDimension) break;
    }

    if (!matchedDimension) {
      return notFound(`Finding "${fixId}" introuvable dans le scorecard`);
    }
    if (matchedFixType !== 'auto') {
      // The finding exists but is manual (or undefined → backwards compat).
      return badRequest(
        `Le finding "${fixId}" nécessite une correction manuelle (non auto-fixable)`,
      );
    }

    // ── 6. Apply the fix ──────────────────────────────────────────────────
    // Parse the publishedConfigJson blob. If it's missing or unparseable,
    // start from an empty shell so the fix can populate it.
    const config: PublishedConfig = wedding.publishedConfigJson
      ? safeJsonParse<PublishedConfig | null>(wedding.publishedConfigJson, null) ?? {}
      : {};

    let fixResult: FixResult;
    let shouldUpdateThemeRow = false;

    const sectionType = resolveSectionTypeFromFixId(fixId);
    if (sectionType) {
      // enable-hero / enable-section-<type>
      const changed = enableSectionInManifest(config, sectionType);
      fixResult = {
        summary: `Section "${sectionType}" activée dans publishedConfigJson.manifest.sections`,
        dimension: matchedDimension,
        changed,
      };
    } else if (fixId === 'apply-default-theme') {
      const changed = applyDefaultTheme(config);
      fixResult = {
        summary: `Thème or par défaut appliqué (primaryColor=${DEFAULT_THEME_COLORS.primaryColor}, accentColor=${DEFAULT_THEME_COLORS.accentColor})`,
        dimension: matchedDimension,
        changed,
      };
    } else if (fixId === 'theme-layout-classic') {
      const configChanged = applyClassicLayoutToConfig(config);
      shouldUpdateThemeRow = true;
      fixResult = {
        summary: `Layout basculé vers "${DEFAULT_LAYOUT_SLUG}" (Theme.layout + publishedConfigJson.theme.layout)`,
        dimension: matchedDimension,
        changed: configChanged,
      };
    } else {
      // The finding has fixType='auto' but no matching fixer in this route.
      // This is a bug in the scorecard engine (it claimed auto-fixable but
      // we don't have a fixer). Log it + return 400 so the user gets a
      // clear "not yet implemented" message instead of a silent 500.
      logger.warn('quality.auto_fix: no fixer for fixId', {
        fixId,
        dimension: matchedDimension,
        weddingId: wedding.id,
      });
      return badRequest(
        `Aucun fixer programmé pour le fixId "${fixId}" — contactez le support`,
      );
    }

    // ── 7. Persist the publishedConfigJson update ─────────────────────────
    if (fixResult.changed) {
      await db.wedding.update({
        where: { id: wedding.id },
        data: { publishedConfigJson: JSON.stringify(config) },
      });
    }

    // ── 7b. Persist the Theme row update (only for theme-layout-classic) ─
    if (shouldUpdateThemeRow) {
      try {
        // upsert because the Theme row may not exist yet (the wedding
        // might have been provisioned without a Theme — the scorecard's
        // readThemeLayout handles this gracefully).
        await db.theme.upsert({
          where: { weddingId: wedding.id },
          update: { layout: DEFAULT_LAYOUT_SLUG },
          create: {
            weddingId: wedding.id,
            layout: DEFAULT_LAYOUT_SLUG,
            // The other Theme fields default to whatever the schema allows
            // (they're nullable / have DB defaults). The scorecard only
            // reads `layout`, so we don't need to populate the rest.
          },
        });
      } catch (err) {
        // Non-fatal: the scorecard reads from `db.theme.layout`. If the
        // upsert failed, the finding will still appear on the next
        // recomputation. We log + proceed (the audit log will still record
        // the attempt).
        logger.warn('quality.auto_fix: theme upsert failed', {
          fixId,
          weddingId: wedding.id,
          errMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── 8. Invalidate the wedding ISR cache so the public page reflects ─
    //    the fix on the next request. The cache is tagged `wedding-{slug}`
    //    and `invalidateWeddingCache` calls `revalidateTag` (L2) + the
    //    in-memory cache bust (L1). Best-effort: a failure here means the
    //    public page may show stale data for up to 5 minutes (the cache's
    //    fallback revalidate).
    try {
      await invalidateWeddingCache(slug);
    } catch (err) {
      logger.warn('quality.auto_fix: cache invalidation failed', {
        fixId,
        slug,
        errMessage: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 9. Audit log ──────────────────────────────────────────────────────
    await writeAuditLog({
      weddingId: wedding.id,
      userId: user.id,
      action: 'quality.auto_fix',
      details: `Auto-fix appliqué: fixId="${fixId}" (dimension=${matchedDimension}) — ${fixResult.summary}. Finding: "${matchedMessage ?? ''}". Changed: ${fixResult.changed ? 'yes' : 'no (idempotent no-op)'}`,
      request,
      targetType: 'WEDDING',
      targetResourceId: wedding.id,
      result: 'SUCCESS',
    });

    // ── 10. Re-compute the scorecard so the UI can update without a refetch ─
    const newScorecard = await computeQualityScorecard(slug);

    // ── 11. Return ────────────────────────────────────────────────────────
    const response = NextResponse.json({
      success: true,
      fixId,
      message: fixResult.changed
        ? 'Fix appliqué'
        : 'Fix déjà appliqué (idempotent)',
      changed: fixResult.changed,
      dimension: matchedDimension,
      scorecard: newScorecard,
    });
    response.headers.set('Cache-Control', 'no-store');
    return withSecurityHeaders(response);
  } catch (error) {
    logger.error('quality.auto_fix API error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
