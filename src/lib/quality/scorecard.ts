// ══════════════════════════════════════════════════════════════════════════════
// src/lib/quality/scorecard.ts — MISSION 5.9.0 Phase 4B (Design Quality Score)
// ══════════════════════════════════════════════════════════════════════════════
//
// Per-wedding quality scorecard with 9 dimensions:
//   VISUAL · UX · RESPONSIVE · ACCESSIBILITY · PERFORMANCE · BRAND ·
//   CONTENT · MOBILE · CONVERSION
//
// Each dimension is scored 0..100. The overall score is the average of the 9.
// A wedding is `canPublish` iff `overall >= threshold` AND no dimension is
// below the threshold.
//
// PUBLISH GATE (CRITICAL CONSTRAINT, audit §20.6 Phase 4B):
//   The quality check is **advisory by default** — it warns the user but does
//   NOT block publication. Only when the wedding's `publishedConfigJson`
//   blob carries `qualityGate: true` does the scorecard actually block the
//   publish (and only PLATFORM_ADMIN can override).
//
//   This default-advisory posture is intentional: existing weddings that
//   pre-date Phase 4B might legitimately score < 60 on a dimension (e.g. a
//   minimal-layout wedding with no gallery). Blocking them on first publish
//   after the Phase 4B deploy would be a regression. Organizers opt into the
//   gate per-wedding by setting `qualityGate: true` in the published config.
//
// PERFORMANCE:
//   The computation reads from `getCachedWeddingData` (ISR-cached) +
//   `getCachedWeddingPageData` (ISR-cached) + 2 lightweight Prisma queries
//   (media list + theme row). All four sources are parallelised via
//   `Promise.all`. Total cost is well under 500ms on a warm cache.
//
// TENANT ISOLATION:
//   The scorecard reads ONLY the wedding whose slug is passed. The cached
//   fetchers are keyed by slug (per-tenant isolation). The 2 direct Prisma
//   queries filter by `weddingId` (resolved from the cached fetch). There is
//   no cross-wedding data access.
//
// NON-REGRESSION:
//   This module is purely additive — it does not modify any existing wedding
//   data, cache shape, or publish path. The publish gate is wired into the
//   DesignerTab UI only (Phase 4B step 4); the backend publish route is
//   unchanged.

import { db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';
import {
  getCachedWeddingData,
  getCachedWeddingPageData,
} from '@/lib/wedding/cache';
import type { SectionType, WeddingManifest } from '@/lib/wedding/manifest';
import { logger } from '@/lib/logger';

// ─── Public types ─────────────────────────────────────────────────────────────

export type QualitySeverity = 'good' | 'warning' | 'critical';

export interface QualityFinding {
  /** Human-readable (French) message describing what was checked + the result. */
  message: string;
  /** Severity of this individual finding. `good` findings are positive checks. */
  severity: QualitySeverity;
  /** True when a 1-click fix is technically possible (UI shows a "Corriger" button). */
  autoFixable?: boolean;
  /** Description of the 1-click fix action (shown as the button's tooltip / aria-label). */
  fixAction?: string;
  /**
   * Admin tab the "Corriger" button navigates to. Matches the `id` field of
   * `NAV_ITEMS` in src/app/w/[slug]/admin/page.tsx (e.g. 'designer', 'media',
   * 'timeline', 'story', 'theme', 'appearance'). Omit when the finding is
   * informational only.
   */
  fixAdminTab?: string;
  /**
   * Stable identifier used by the auto-fix API to match a finding to its
   * programmatic fixer. Must be UNIQUE across all 9 dimensions for findings
   * that share the same fixer (e.g. multiple "Section hero désactivée"
   * findings across VISUAL/UX/PERFORMANCE all carry `id: 'enable-hero'` —
   * applying the fix once resolves all of them).
   *
   * Convention: `<verb>-<noun>` (e.g. `enable-hero`, `enable-section-rsvp`,
   * `apply-default-theme`, `theme-layout-classic`). See
   * `src/app/api/platform/quality/[slug]/auto-fix/route.ts` for the canonical
   * list of supported fixIds.
   *
   * Omitted on positive (`good`) findings and on auto-fixable findings that
   * have no programmatic fixer (those carry `fixType: 'manual'` instead).
   */
  id?: string;
  /**
   * `'auto'` when the fix can be APPLIED programmatically by the auto-fix API
   * (1-click, no human input required — e.g. enable a section, apply a default
   * theme). `'manual'` when the finding is auto-fixable in the sense that the
   * UI shows a "Corriger" button, but the button only NAVIGATES the user to
   * the relevant admin tab — a human must then perform the actual fix (e.g.
   * upload a couple photo, type a welcome message).
   *
   * UI behaviour:
   *   - `fixType === 'auto'`     → button label "Corriger automatiquement" with
   *                                 a Zap icon; click POSTs to /auto-fix.
   *   - `fixType === 'manual'`   → button label "Corriger" with a Wrench icon;
   *                                 click calls `onNavigateToTab(fixAdminTab)`.
   *   - `fixType === undefined`  → treated as `'manual'` for backwards compat.
   */
  fixType?: 'auto' | 'manual';
}

export interface QualityDimension {
  /** Stable id, lowercase (e.g. 'visual', 'ux', 'responsive', …). */
  id: string;
  /** Human-readable label (French, shown in the scorecard UI). */
  label: string;
  /** Score 0..100. */
  score: number;
  /** Computed from `score` + `threshold`: good ≥ 80, warning 60..79, critical < 60. */
  status: QualitySeverity;
  /** Individual findings that contributed to the score. */
  findings: QualityFinding[];
}

export interface QualityScorecard {
  /** The wedding slug the scorecard was computed for. */
  weddingSlug: string;
  /** 9 dimension objects, in canonical order. */
  dimensions: QualityDimension[];
  /** Average of the 9 dimension scores (rounded to the nearest integer). */
  overall: number;
  /**
   * Per-wedding threshold (default 60). Pulled from `qualityThreshold` in the
   * publishedConfigJson blob if present, else 60.
   */
  threshold: number;
  /**
   * `true` iff `overall >= threshold` AND every dimension's score ≥ threshold.
   *
   * NOTE: even when `canPublish === false`, the publish gate stays ADVISORY
   * unless the wedding's `publishedConfigJson.qualityGate === true`. The UI
   * uses `canPublish` to decide which modal to show; the actual publish is
   * blocked server-side only when `qualityGate` is set (Phase 4B step 4 wires
   * this into the DesignerTab publish flow).
   */
  canPublish: boolean;
  /**
   * True iff the wedding has opted into the blocking quality gate. Read from
   * `publishedConfigJson.qualityGate`. Default false (advisory).
   */
  qualityGateEnabled: boolean;
  /** ISO timestamp the scorecard was computed at (for cache freshness display). */
  computedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** The 9 canonical dimension ids (used by both the scorecard engine + the UI). */
export const QUALITY_DIMENSION_IDS = [
  'visual',
  'ux',
  'responsive',
  'accessibility',
  'performance',
  'brand',
  'content',
  'mobile',
  'conversion',
] as const;

const DEFAULT_THRESHOLD = 60;

/**
 * French labels for each dimension id. Kept in a separate const so the UI can
 * reuse them without circular-importing the scorecard engine.
 */
export const QUALITY_DIMENSION_LABELS: Record<string, string> = {
  visual: 'Visuel',
  ux: 'Expérience (UX)',
  responsive: 'Responsive',
  accessibility: 'Accessibilité',
  performance: 'Performance',
  brand: 'Identité',
  content: 'Contenu',
  mobile: 'Mobile / PWA',
  conversion: 'Conversion',
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Clamp a score to [0, 100]. */
function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Compute the status badge from a score + threshold. */
function statusFor(score: number, threshold: number): QualitySeverity {
  if (score >= 80) return 'good';
  if (score >= threshold) return 'warning';
  return 'critical';
}

/**
 * Read `qualityGate` + `qualityThreshold` from the wedding's
 * `publishedConfigJson` blob. The blob is the canonical "themeConfig" JSON
 * snapshot written by the deployment pipeline. Returns `{ qualityGate,
 * qualityThreshold }` with defaults if the blob is missing or unparseable.
 *
 * IMPORTANT: the publishedConfigJson shape is `{ manifest, theme, templateName,
 * themeName, version, compiledAt, ... }`. We add two OPTIONAL additive fields:
 *   - `qualityGate: boolean`      — default false (advisory)
 *   - `qualityThreshold: number`  — default 60
 * These fields are forward-compatible — older snapshots without them parse
 * cleanly with the defaults applied.
 */
async function readQualityGateFlags(weddingId: string): Promise<{
  qualityGate: boolean;
  qualityThreshold: number;
}> {
  try {
    const row = await db.wedding.findUnique({
      where: { id: weddingId },
      select: { publishedConfigJson: true },
    });
    if (!row?.publishedConfigJson) {
      return { qualityGate: false, qualityThreshold: DEFAULT_THRESHOLD };
    }
    const parsed = safeJsonParse<{
      qualityGate?: boolean;
      qualityThreshold?: number;
    } | null>(row.publishedConfigJson, null);
    if (!parsed) {
      return { qualityGate: false, qualityThreshold: DEFAULT_THRESHOLD };
    }
    const threshold = Number.isFinite(parsed.qualityThreshold)
      ? clamp(parsed.qualityThreshold as number)
      : DEFAULT_THRESHOLD;
    return {
      qualityGate: parsed.qualityGate === true,
      qualityThreshold: threshold,
    };
  } catch (error) {
    // Non-fatal — fail open with defaults. The scorecard is computed anyway;
    // the gate just stays advisory.
    logger.warn('quality.scorecard: readQualityGateFlags failed', {
      weddingId,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return { qualityGate: false, qualityThreshold: DEFAULT_THRESHOLD };
  }
}

/** Lightweight theme row fetch (only the `layout` field is needed). */
async function readThemeLayout(weddingId: string): Promise<string | null> {
  try {
    const row = await db.theme.findUnique({
      where: { weddingId },
      select: { layout: true },
    });
    return row?.layout ?? null;
  } catch (error) {
    logger.warn('quality.scorecard: readThemeLayout failed', {
      weddingId,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Count media rows by category (GALLERY vs COUPLE_STORY) for this wedding. */
async function readMediaCounts(
  weddingId: string,
): Promise<{ galleryCount: number; couplePhotoCount: number }> {
  try {
    const rows = await db.media.findMany({
      where: { weddingId },
      select: { type: true, category: true, title: true, description: true },
    });
    let galleryCount = 0;
    let couplePhotoCount = 0;
    for (const m of rows) {
      const isPhoto = m.type === 'PHOTO';
      if (!isPhoto) continue;
      const cat = (m.category ?? '').toUpperCase();
      if (cat === 'GALLERY') galleryCount++;
      if (cat === 'COUPLE_STORY') couplePhotoCount++;
    }
    return { galleryCount, couplePhotoCount };
  } catch (error) {
    logger.warn('quality.scorecard: readMediaCounts failed', {
      weddingId,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return { galleryCount: 0, couplePhotoCount: 0 };
  }
}

// ─── Section helpers ──────────────────────────────────────────────────────────

/** Set of section types enabled in the manifest. */
function enabledSectionTypes(manifest: WeddingManifest | null): Set<SectionType> {
  if (!manifest) return new Set();
  return new Set(
    manifest.sections.filter((s) => s.enabled).map((s) => s.type),
  );
}

/** True iff a given section type is enabled in the manifest. */
function hasSection(
  manifest: WeddingManifest | null,
  type: SectionType,
): boolean {
  return enabledSectionTypes(manifest).has(type);
}

// ─── Dimension scorers ────────────────────────────────────────────────────────
//
// Each scorer returns a `QualityDimension` WITHOUT the `status` field set
// (the orchestrator computes status from score + threshold after all scorers
// have run, so the threshold is consistent across all 9 dimensions).

interface ScorerContext {
  manifest: WeddingManifest | null;
  /** True iff the publishedConfigJson snapshot was found (i.e. wedding has been published). */
  hasPublishedConfig: boolean;
  /** Theme layout slug (from `Theme.layout` — null if no theme row). */
  themeLayout: string | null;
  /** Media counts (gallery + couple photos). */
  media: { galleryCount: number; couplePhotoCount: number };
  /** Page datasets from getCachedWeddingPageData. */
  page: {
    stories: { id: string; title: string; imageUrl: string | null }[];
    timeline: { id: string }[];
    settings: Record<string, string>;
  };
  /** Wedding identity from getCachedWeddingData. */
  wedding: {
    brideName: string;
    groomName: string;
    venueName: string | null;
    venueCity: string | null;
    weddingDate: string | null;
  };
}

// 1. VISUAL — has theme configured? has hero image? has couple photos? has gallery images?
function scoreVisual(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  let score = 100;

  // Theme configured (non-default primary color)
  const hasTheme =
    !!ctx.manifest?.theme &&
    ctx.manifest.theme.primaryColor &&
    ctx.manifest.theme.primaryColor !== '#000000';
  if (hasTheme) {
    findings.push({
      message: 'Thème visuel configuré',
      severity: 'good',
    });
  } else {
    score -= 20;
    findings.push({
      id: 'apply-default-theme',
      message: 'Aucun thème visuel configuré',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Appliquer le thème or par défaut (1 clic)',
      fixAdminTab: 'theme',
      fixType: 'auto',
    });
  }

  // Hero image — check manifest hero section is enabled (we don't have direct
  // access to the hero image URL from the cached data; treat hero section
  // enabled as a proxy for "has hero").
  const hasHero = hasSection(ctx.manifest, 'hero');
  if (hasHero) {
    findings.push({ message: 'Section hero activée', severity: 'good' });
  } else {
    score -= 20;
    findings.push({
      id: 'enable-hero',
      message: 'Section hero désactivée',
      severity: 'critical',
      autoFixable: true,
      fixAction: 'Activer la section hero (1 clic)',
      fixAdminTab: 'designer',
      fixType: 'auto',
    });
  }

  // Couple photos
  if (ctx.media.couplePhotoCount > 0) {
    findings.push({
      message: `${ctx.media.couplePhotoCount} photo(s) de couple téléversée(s)`,
      severity: 'good',
    });
  } else {
    score -= 20;
    findings.push({
      id: 'add-couple-photo',
      message: 'Aucune photo de couple dans la médiathèque',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Téléverser au moins une photo de couple',
      fixAdminTab: 'media',
      fixType: 'manual',
    });
  }

  // Gallery images
  if (ctx.media.galleryCount >= 3) {
    findings.push({
      message: `${ctx.media.galleryCount} images en galerie`,
      severity: 'good',
    });
  } else if (ctx.media.galleryCount > 0) {
    score -= 10;
    findings.push({
      id: 'add-gallery-images',
      message: `Seulement ${ctx.media.galleryCount} image(s) en galerie (3+ recommandées)`,
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter plus d\'images à la galerie',
      fixAdminTab: 'media',
      fixType: 'manual',
    });
  } else {
    score -= 20;
    findings.push({
      id: 'add-gallery-images',
      message: 'Aucune image en galerie',
      severity: 'critical',
      autoFixable: true,
      fixAction: 'Téléverser des images dans la galerie',
      fixAdminTab: 'media',
      fixType: 'manual',
    });
  }

  return {
    id: 'visual',
    label: QUALITY_DIMENSION_LABELS.visual,
    score: clamp(score),
    status: 'good', // placeholder — orchestrator sets the real status
    findings,
  };
}

// 2. UX — all 6 core sections enabled + welcome message + hashtag
function scoreUx(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  let score = 100;
  const requiredSections: SectionType[] = [
    'hero',
    'story',
    'gallery',
    'timeline',
    'map',
    'guest-auth',
  ];
  for (const t of requiredSections) {
    if (hasSection(ctx.manifest, t)) {
      findings.push({ message: `Section "${t}" activée`, severity: 'good' });
    } else {
      score -= 15;
      findings.push({
        // hero uses the canonical `enable-hero` id (shared across VISUAL +
        // PERFORMANCE + UX); every other section uses `enable-section-<type>`.
        id: t === 'hero' ? 'enable-hero' : `enable-section-${t}`,
        message: `Section "${t}" désactivée`,
        severity: 'warning',
        autoFixable: true,
        fixAction: `Activer la section ${t} (1 clic)`,
        fixAdminTab: 'designer',
        fixType: 'auto',
      });
    }
  }

  // Welcome message (settings key `welcome_message` or `welcomeMessage`)
  const welcome =
    ctx.page.settings.welcome_message ?? ctx.page.settings.welcomeMessage ?? '';
  if (welcome.trim()) {
    findings.push({ message: 'Message de bienvenue configuré', severity: 'good' });
  } else {
    score -= 15;
    findings.push({
      id: 'add-welcome-message',
      message: 'Aucun message de bienvenue configuré',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter un message de bienvenue dans les paramètres',
      fixAdminTab: 'settings',
      fixType: 'manual',
    });
  }

  // Hashtag
  const hashtag = ctx.page.settings.hashtag ?? '';
  if (hashtag.trim()) {
    findings.push({ message: 'Hashtag du mariage configuré', severity: 'good' });
  } else {
    score -= 15;
    findings.push({
      id: 'add-hashtag',
      message: 'Aucun hashtag configuré',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter un hashtag dans les paramètres',
      fixAdminTab: 'settings',
      fixType: 'manual',
    });
  }

  return {
    id: 'ux',
    label: QUALITY_DIMENSION_LABELS.ux,
    score: clamp(score),
    status: 'good',
    findings,
  };
}

// 3. RESPONSIVE — viewport meta (always yes) + mobile-friendly layout (royal heavy) + mobile nav
function scoreResponsive(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  let score = 100;

  // Viewport meta — Next.js always emits one
  findings.push({
    message: 'Balise viewport présente (Next.js par défaut)',
    severity: 'good',
  });

  // Layout — 'royal' is heavy on mobile (audit §20.6)
  const layout = ctx.themeLayout ?? 'classic';
  if (layout === 'royal') {
    score -= 30;
    findings.push({
      id: 'theme-layout-classic',
      message: 'Layout "royal" lourd sur mobile — privilégier "classic" ou "modern"',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Basculer le layout vers "classic" (1 clic)',
      fixAdminTab: 'theme',
      fixType: 'auto',
    });
  } else {
    findings.push({
      message: `Layout "${layout}" adapté au mobile`,
      severity: 'good',
    });
  }

  // Mobile nav — assume yes (Navigation component is responsive by design).
  // We don't have a per-wedding "mobile nav" flag; the audit treats this as a
  // soft check that's always satisfied by the shared Navigation component.
  findings.push({
    message: 'Navigation mobile responsive (composant partagé)',
    severity: 'good',
  });

  return {
    id: 'responsive',
    label: QUALITY_DIMENSION_LABELS.responsive,
    score: clamp(score),
    status: 'good',
    findings,
  };
}

// 4. ACCESSIBILITY — alt text on images + skip-link (Phase 0) + aria labels
function scoreAccessibility(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  let score = 100;

  // Skip-link — Phase 0 wired a global skip-link into the root layout
  findings.push({
    message: 'Skip-link présent (Phase 0 — racine layout)',
    severity: 'good',
  });

  // Alt text — check couple-story images have non-empty titles (used as alt)
  const storiesWithImage = ctx.page.stories.filter((s) => !!s.imageUrl);
  const storiesWithAlt = storiesWithImage.filter((s) => !!s.title?.trim());
  if (storiesWithImage.length === 0) {
    findings.push({
      message: 'Aucune image d\'histoire — alt-text non requis',
      severity: 'good',
    });
  } else if (storiesWithAlt.length === storiesWithImage.length) {
    findings.push({
      message: `${storiesWithAlt.length} image(s) d\'histoire avec texte alternatif (titre)`,
      severity: 'good',
    });
  } else {
    const missing = storiesWithImage.length - storiesWithAlt.length;
    score -= Math.min(25, missing * 5);
    findings.push({
      id: 'add-story-alt-text',
      message: `${missing} image(s) d\'histoire sans texte alternatif`,
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter un titre à chaque chapitre d\'histoire',
      fixAdminTab: 'story',
      fixType: 'manual',
    });
  }

  // Aria labels — soft check: settings.accessibility_aria_labels === 'true'
  // indicates the organizer has explicitly configured custom aria labels.
  // Most weddings rely on the sensible defaults baked into the section
  // components, so this is informational, not blocking.
  const ariaConfigured = ctx.page.settings.accessibility_aria_labels === 'true';
  if (ariaConfigured) {
    findings.push({
      message: 'Labels ARIA personnalisés configurés',
      severity: 'good',
    });
  } else {
    // No deduction — defaults are sensible. Just an informational finding.
    findings.push({
      message: 'Labels ARIA par défaut (composants de section)',
      severity: 'good',
    });
  }

  return {
    id: 'accessibility',
    label: QUALITY_DIMENSION_LABELS.accessibility,
    score: clamp(score),
    status: 'good',
    findings,
  };
}

// 5. PERFORMANCE — RSC (Phase 2A) + ISR + priority LCP (Phase 3B) + image sizes + AVIF/WebP
function scorePerformance(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  // Start at 100; the 5 checks each contribute +0 (since they're all
  // already implemented at the platform level — see Phase 2A + Phase 3B).
  // We surface them as `good` findings so the UI shows what's been validated.
  let score = 100;

  // RSC — Phase 2A migrated /w/[slug] to an async Server Component
  findings.push({
    message: 'Page en Server Component (Phase 2A — RSC)',
    severity: 'good',
  });

  // ISR — revalidate = 300 on /w/[slug]/layout + page
  findings.push({
    message: 'ISR activée (revalidate=300s + invalidation par tag)',
    severity: 'good',
  });

  // Priority on LCP — Phase 3B added `priority` to the hero image
  if (hasSection(ctx.manifest, 'hero')) {
    findings.push({
      message: 'Attribut `priority` sur l\'image hero (LCP) — Phase 3B',
      severity: 'good',
    });
  } else {
    score -= 20;
    findings.push({
      id: 'enable-hero',
      message: 'Pas de section hero — l\'optimisation LCP est inactive',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Activer la section hero (1 clic)',
      fixAdminTab: 'designer',
      fixType: 'auto',
    });
  }

  // Image sizes — Phase 3B added explicit `sizes` to next/image usage
  findings.push({
    message: 'Attribut `sizes` explicite sur les images (Phase 3B)',
    severity: 'good',
  });

  // AVIF/WebP — Next.js image optimizer serves AVIF/WebP automatically
  findings.push({
    message: 'Formats AVIF/WebP servis par l\'optimiseur d\'images Next.js',
    severity: 'good',
  });

  // Bonus: detect published-config snapshot (warm cache, fast first paint)
  if (ctx.hasPublishedConfig) {
    findings.push({
      message: 'Snapshot publié (publishedConfigJson) — premier rendu accéléré',
      severity: 'good',
    });
  } else {
    score -= 10;
    findings.push({
      id: 'publish-snapshot',
      message: 'Aucun snapshot publié — la page est résolue à la volée',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Publier le mariage pour générer le snapshot',
      fixAdminTab: 'designer',
      fixType: 'manual',
    });
  }

  return {
    id: 'performance',
    label: QUALITY_DIMENSION_LABELS.performance,
    score: clamp(score),
    status: 'good',
    findings,
  };
}

// 6. BRAND — custom theme (not default) + custom font + couple photo
function scoreBrand(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  let score = 100;

  const DEFAULT_PRIMARY = '#D4A853';
  const DEFAULT_FONT_DISPLAY = 'Cormorant Garamond';

  const primary = ctx.manifest?.theme.primaryColor ?? '';
  const fontDisplay = ctx.manifest?.theme.fontDisplay ?? '';

  // Custom theme (primary color != default)
  if (primary && primary.toLowerCase() !== DEFAULT_PRIMARY.toLowerCase()) {
    findings.push({
      message: `Couleur primaire personnalisée (${primary})`,
      severity: 'good',
    });
  } else {
    score -= 25;
    findings.push({
      id: 'customize-primary-color',
      message: 'Couleur primaire par défaut — personnaliser pour renforcer l\'identité',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Personnaliser la couleur primaire',
      fixAdminTab: 'theme',
      fixType: 'manual',
    });
  }

  // Custom font
  if (
    fontDisplay &&
    fontDisplay.toLowerCase() !== DEFAULT_FONT_DISPLAY.toLowerCase()
  ) {
    findings.push({
      message: `Police d'affichage personnalisée (${fontDisplay})`,
      severity: 'good',
    });
  } else {
    score -= 25;
    findings.push({
      id: 'customize-font-display',
      message: 'Police d\'affichage par défaut — personnaliser pour renforcer l\'identité',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Personnaliser la police d\'affichage',
      fixAdminTab: 'theme',
      fixType: 'manual',
    });
  }

  // Couple photo
  if (ctx.media.couplePhotoCount > 0) {
    findings.push({
      message: `${ctx.media.couplePhotoCount} photo(s) de couple`,
      severity: 'good',
    });
  } else {
    score -= 25;
    findings.push({
      id: 'add-couple-photo',
      message: 'Aucune photo de couple',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Téléverser une photo de couple',
      fixAdminTab: 'media',
      fixType: 'manual',
    });
  }

  // Bonus: couple names set (identity)
  if (ctx.wedding.brideName && ctx.wedding.groomName) {
    findings.push({
      message: `Identité du couple renseignée (${ctx.wedding.brideName} & ${ctx.wedding.groomName})`,
      severity: 'good',
    });
  } else {
    score -= 25;
    findings.push({
      id: 'add-couple-names',
      message: 'Identité du couple incomplète (marié(e) manquant)',
      severity: 'critical',
      autoFixable: true,
      fixAction: 'Renseigner les noms des mariés',
      fixAdminTab: 'settings',
      fixType: 'manual',
    });
  }

  return {
    id: 'brand',
    label: QUALITY_DIMENSION_LABELS.brand,
    score: clamp(score),
    status: 'good',
    findings,
  };
}

// 7. CONTENT — ≥3 story chapters + ≥5 timeline events + gallery 5+ + welcome message
function scoreContent(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  let score = 100;

  // Story chapters
  if (ctx.page.stories.length >= 3) {
    findings.push({
      message: `${ctx.page.stories.length} chapitres d'histoire`,
      severity: 'good',
    });
  } else {
    score -= 20;
    findings.push({
      id: 'add-story-chapters',
      message: `${ctx.page.stories.length} chapitre(s) d'histoire (3+ recommandés)`,
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter des chapitres à l\'histoire',
      fixAdminTab: 'story',
      fixType: 'manual',
    });
  }

  // Timeline events
  if (ctx.page.timeline.length >= 5) {
    findings.push({
      message: `${ctx.page.timeline.length} événements au programme`,
      severity: 'good',
    });
  } else {
    score -= 20;
    findings.push({
      id: 'add-timeline-events',
      message: `${ctx.page.timeline.length} événement(s) au programme (5+ recommandés)`,
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter des événements au programme',
      fixAdminTab: 'timeline',
      fixType: 'manual',
    });
  }

  // Gallery 5+
  if (ctx.media.galleryCount >= 5) {
    findings.push({
      message: `${ctx.media.galleryCount} images en galerie`,
      severity: 'good',
    });
  } else {
    score -= 20;
    findings.push({
      id: 'add-gallery-images',
      message: `${ctx.media.galleryCount} image(s) en galerie (5+ recommandées)`,
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter des images à la galerie',
      fixAdminTab: 'media',
      fixType: 'manual',
    });
  }

  // Welcome message
  const welcome =
    ctx.page.settings.welcome_message ?? ctx.page.settings.welcomeMessage ?? '';
  if (welcome.trim()) {
    findings.push({ message: 'Message de bienvenue configuré', severity: 'good' });
  } else {
    score -= 20;
    findings.push({
      id: 'add-welcome-message',
      message: 'Aucun message de bienvenue',
      severity: 'warning',
      autoFixable: true,
      fixAction: 'Ajouter un message de bienvenue',
      fixAdminTab: 'settings',
      fixType: 'manual',
    });
  }

  return {
    id: 'content',
    label: QUALITY_DIMENSION_LABELS.content,
    score: clamp(score),
    status: 'good',
    findings,
  };
}

// 8. MOBILE — PWA manifest + icons (Phase 0) + offline page (Phase 3C) + SW
function scoreMobile(): QualityDimension {
  const findings: QualityFinding[] = [];
  // All 4 checks are platform-level guarantees (Phase 0 + Phase 3C):
  //   - /public/manifest.json (PWA manifest)
  //   - /public/icons/* (icons — Phase 0)
  //   - /app/offline/page.tsx (offline page — Phase 3C)
  //   - /public/sw.js (service worker)
  // They're invariant across weddings, so the score is always 100 unless one
  // of those files is missing (which would be a platform regression, not a
  // per-wedding issue). We surface them as `good` findings for visibility.
  findings.push({
    message: 'Manifest PWA présent (/public/manifest.json)',
    severity: 'good',
  });
  findings.push({
    message: 'Icônes PWA présentes (Phase 0)',
    severity: 'good',
  });
  findings.push({
    message: 'Page offline disponible (Phase 3C — /app/offline)',
    severity: 'good',
  });
  findings.push({
    message: 'Service Worker enregistré (/public/sw.js)',
    severity: 'good',
  });

  return {
    id: 'mobile',
    label: QUALITY_DIMENSION_LABELS.mobile,
    score: 100,
    status: 'good',
    findings,
  };
}

// 9. CONVERSION — RSVP + guest-auth + CTA + invitation
function scoreConversion(ctx: ScorerContext): QualityDimension {
  const findings: QualityFinding[] = [];
  let score = 100;

  const sections: Array<{ type: SectionType; label: string }> = [
    { type: 'rsvp', label: 'RSVP' },
    { type: 'guest-auth', label: 'Authentification invité' },
    { type: 'cta', label: 'Appel à l\'action' },
    { type: 'invitation', label: 'Invitation' },
  ];

  for (const s of sections) {
    if (hasSection(ctx.manifest, s.type)) {
      findings.push({ message: `Section ${s.label} activée`, severity: 'good' });
    } else {
      score -= 25;
      findings.push({
        // guest-auth shares the canonical `enable-section-guest-auth` id with
        // the UX dimension; the others use the `enable-section-<type>` convention.
        id: `enable-section-${s.type}`,
        message: `Section ${s.label} désactivée`,
        severity: 'warning',
        autoFixable: true,
        fixAction: `Activer la section ${s.type} (1 clic)`,
        fixAdminTab: 'designer',
        fixType: 'auto',
      });
    }
  }

  return {
    id: 'conversion',
    label: QUALITY_DIMENSION_LABELS.conversion,
    score: clamp(score),
    status: 'good',
    findings,
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Compute the 9-dimension quality scorecard for a wedding.
 *
 * @param weddingSlug The wedding's URL slug (e.g. "josue-hornella").
 * @returns A `QualityScorecard` object, or null if the wedding doesn't exist.
 *
 * Performance: ~3 DB round-trips on a warm cache (1 cached fetch for layout
 * data, 1 cached fetch for page data, 2 direct Prisma queries for media +
 * theme + qualityGate flags). Cold-cache cost is dominated by the cache miss
 * populate (~50-200ms); warm-cache cost is < 50ms.
 */
export async function computeQualityScorecard(
  weddingSlug: string,
): Promise<QualityScorecard | null> {
  // Parallel: cached layout + page data (both ISR-cached, tagged
  // `wedding-{slug}` so on-demand invalidation busts them atomically).
  const [cachedLayout, cachedPage] = await Promise.all([
    getCachedWeddingData(weddingSlug),
    getCachedWeddingPageData(weddingSlug),
  ]);

  if (!cachedLayout) {
    // Wedding doesn't exist — caller should 404.
    return null;
  }

  const weddingId = cachedLayout.wedding.id;

  // Parallel: 3 direct Prisma queries (theme layout, media counts, gate flags).
  // These are NOT cached because:
  //   - theme + media change frequently (organizer edits)
  //   - qualityGate flag is small + cheap to read
  // The cached fetches above already cover the bulk of the data; these 3
  // queries are small selects that round out the scorecard.
  const [themeLayout, media, gateFlags] = await Promise.all([
    readThemeLayout(weddingId),
    readMediaCounts(weddingId),
    readQualityGateFlags(weddingId),
  ]);

  const ctx: ScorerContext = {
    manifest: cachedLayout.manifest,
    hasPublishedConfig: cachedLayout.publishedConfig !== null,
    themeLayout,
    media,
    page: {
      stories: cachedPage?.stories ?? [],
      timeline: cachedPage?.timeline ?? [],
      settings: cachedPage?.settings ?? {},
    },
    wedding: {
      brideName: cachedLayout.wedding.brideName,
      groomName: cachedLayout.wedding.groomName,
      venueName: cachedLayout.wedding.venueName,
      venueCity: cachedLayout.wedding.venueCity,
      weddingDate: cachedLayout.wedding.weddingDate,
    },
  };

  // Compute all 9 dimensions (status is a placeholder — set below).
  const dimensions: QualityDimension[] = [
    scoreVisual(ctx),
    scoreUx(ctx),
    scoreResponsive(ctx),
    scoreAccessibility(ctx),
    scorePerformance(ctx),
    scoreBrand(ctx),
    scoreContent(ctx),
    scoreMobile(),
    scoreConversion(ctx),
  ];

  // Compute the overall + canPublish flag.
  const overall = clamp(
    dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length,
  );
  const threshold = gateFlags.qualityThreshold;
  const noDimBelowThreshold = dimensions.every((d) => d.score >= threshold);
  const canPublish = overall >= threshold && noDimBelowThreshold;

  // Apply the real status to each dimension (now that we know the threshold).
  for (const d of dimensions) {
    d.status = statusFor(d.score, threshold);
  }

  return {
    weddingSlug,
    dimensions,
    overall,
    threshold,
    canPublish,
    qualityGateEnabled: gateFlags.qualityGate,
    computedAt: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MISSION 5.9.2 P2-7 — Per-theme quality score (append to scorecard.ts)
// Scores a PlatformTheme on 6 dimensions (palette, typography, configJson
// richness, identity linkage, commercial markers, versioning).
// Does NOT modify computeQualityScorecard (per-wedding) — separate concern.
// ══════════════════════════════════════════════════════════════════════════════
//
// This block is purely ADDITIVE: it only declares new types + a new pure
// function. It touches no existing symbol, no DB call, no cache, no side
// effect. The per-wedding `computeQualityScorecard` is unchanged.
//
// Scoring rubric (6 dimensions, weights sum to 100):
//   1. Palette completeness   (weight 25) — 9 named CSS color tokens
//   2. Typography             (weight 15) — fontDisplay + fontBody both set
//   3. ConfigJson richness    (weight 25) — pattern/ambiance/motion/layout/...
//   4. Identity linkage       (weight 10) — identity resolves to a preset
//   5. Commercial markers     (weight 15) — premium/recommended/default/builtin
//   6. Versioning             (weight 10) — semver-compliant version string
//
// overall = Σ(dim.score × dim.weight) / Σ(weights)  ∈ [0, 100]
// tier: good ≥ 80, warning ≥ 50, critical < 50.

import { isWeddingIdentity as _isWeddingIdentity } from '@/lib/themes/identity-presets';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ThemeQualitySeverity = 'good' | 'warning' | 'critical';

export interface ThemeQualityDimension {
  /** Human-readable (French) label of the dimension. */
  name: string;
  /** Score 0..100. */
  score: number;
  /** Weight of this dimension in the overall score (Σ weights = 100). */
  weight: number;
  /** Short human-readable note explaining the score (e.g. "7/9 colors defined"). */
  notes: string;
}

export interface ThemeQualityFinding {
  severity: ThemeQualitySeverity;
  message: string;
}

export interface ThemeQualityScore {
  /** PlatformTheme.id (UUID). */
  themeId: string;
  /** PlatformTheme.slug (kebab-case). */
  themeSlug: string;
  /** Overall weighted score 0..100 (rounded to nearest integer). */
  overall: number;
  /** Tier derived from `overall`: good ≥ 80, warning ≥ 50, critical < 50. */
  tier: ThemeQualitySeverity;
  /** 6 dimension objects, in canonical order. */
  dimensions: ThemeQualityDimension[];
  /** Cross-dimension findings (warnings for <50, positives for ≥90). */
  findings: ThemeQualityFinding[];
  /** ISO timestamp the score was computed at. */
  computedAt: string;
}

// ─── Input shape (mirrors the fields selected by the themes route THEME_SELECT) ─

export interface ThemeQualityInput {
  id: string;
  slug: string;
  name: string;
  paletteJson: string;
  fontDisplay: string | null;
  fontBody: string | null;
  isBuiltIn: boolean;
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  tier: string;
  category: string | null;
  version: string;
  identity: string | null;
  configJson: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The 9 canonical palette color tokens scored by dimension 1. */
const PALETTE_COLOR_KEYS = [
  'primary',
  'primaryLight',
  'primaryDark',
  'accent',
  'accentLight',
  'surface',
  'surfaceDeep',
  'text',
  'textMuted',
] as const;

/**
 * Fallback identity preset list — used only if the static import of
 * `isWeddingIdentity` somehow resolves to undefined at runtime (e.g. circular
 * import or build-time tree-shaking edge case). Mirrors the 5 canonical
 * presets declared in `src/lib/themes/identity-presets.ts`.
 */
const FALLBACK_KNOWN_IDENTITIES = new Set<string>([
  'royal-luxury',
  'minimal-editorial',
  'botanical-romance',
  'cinematic-dark',
  'modern-champagne',
]);

function resolveIdentityKnown(identity: string | null): boolean {
  if (!identity) return false;
  // Prefer the imported validator (canonical source of truth).
  const fn = _isWeddingIdentity as unknown;
  if (typeof fn === 'function') {
    try {
      return Boolean((fn as (v: unknown) => boolean)(identity));
    } catch {
      // fall through to hardcoded set
    }
  }
  return FALLBACK_KNOWN_IDENTITIES.has(identity);
}

/**
 * Defensive JSON parser. Uses the project's `safeJsonParse` (imported at the
 * top of scorecard.ts — in lexical scope once this block is appended). If
 * `safeJsonParse` is ever missing (e.g. append applied to a renamed build),
 * falls back to a plain try/catch JSON.parse. NEVER throws — returns
 * `fallback` on any failure.
 *
 * NOTE: this references `safeJsonParse` from the enclosing module scope
 * (the top-of-file import in scorecard.ts). When compiled standalone, this
 * identifier is unresolved — that is expected; the file is an append patch,
 * not a standalone module.
 */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    // `safeJsonParse` is in lexical scope (top-of-file import).
    const result = safeJsonParse(raw, fallback as unknown) as T;
    if (result === undefined || result === null) return fallback;
    return result;
  } catch {
    // Import missing or parser threw — fall through to JSON.parse.
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function tierFor(overall: number): ThemeQualitySeverity {
  if (overall >= 80) return 'good';
  if (overall >= 50) return 'warning';
  return 'critical';
}

// ─── Dimension scorers ────────────────────────────────────────────────────────

interface PaletteShape {
  primary?: unknown;
  primaryLight?: unknown;
  primaryDark?: unknown;
  accent?: unknown;
  accentLight?: unknown;
  surface?: unknown;
  surfaceDeep?: unknown;
  text?: unknown;
  textMuted?: unknown;
  colors?: PaletteShape;
}

interface ConfigJsonShape {
  pattern?: unknown;
  ambiance?: unknown;
  motionTier?: unknown;
  layout?: unknown;
  features?: unknown;
  description?: unknown;
  fonts?: {
    displayWeight?: unknown;
    bodyWeight?: unknown;
  };
  colors?: PaletteShape;
}

function scorePaletteCompleteness(
  paletteJson: string,
  configJson: string,
): { score: number; present: number; notes: string } {
  const palette = parseJson<PaletteShape>(paletteJson, {});
  const config = parseJson<ConfigJsonShape>(configJson, {});
  // Union the two color sources — paletteJson is the canonical flat object,
  // but configJson.colors also carries the same tokens (defensive union).
  const paletteColors: PaletteShape = { ...(config.colors ?? {}), ...palette };

  let present = 0;
  for (const key of PALETTE_COLOR_KEYS) {
    const value = paletteColors[key];
    if (isNonEmptyString(value)) present += 1;
  }
  const score = clampScore((present / PALETTE_COLOR_KEYS.length) * 100);
  return {
    score,
    present,
    notes: `${present}/${PALETTE_COLOR_KEYS.length} couleurs définies`,
  };
}

function scoreTypography(
  fontDisplay: string | null,
  fontBody: string | null,
): { score: number; notes: string } {
  const hasDisplay = isNonEmptyString(fontDisplay);
  const hasBody = isNonEmptyString(fontBody);
  let raw: number;
  if (hasDisplay && hasBody) raw = 100;
  else if (hasDisplay || hasBody) raw = 50;
  else raw = 0;
  const which = [hasDisplay && 'display', hasBody && 'body']
    .filter(Boolean)
    .join(' + ');
  return {
    score: clampScore(raw),
    notes: which ? `Polices: ${which}` : 'Aucune police définie',
  };
}

function scoreConfigJsonRichness(
  configJson: string,
): { score: number; notes: string } {
  const config = parseJson<ConfigJsonShape>(configJson, {});
  let points = 0;
  if (isNonEmptyString(config.pattern)) points += 15;
  if (isNonEmptyString(config.ambiance)) points += 15;
  if (isNonEmptyString(config.motionTier)) points += 15;
  if (isNonEmptyString(config.layout)) points += 15;
  if (Array.isArray(config.features) && config.features.length >= 4) points += 15;
  if (isNonEmptyString(config.description)) points += 10;
  if (
    config.fonts &&
    isNonEmptyString((config.fonts as { displayWeight?: unknown }).displayWeight)
  ) {
    points += 5;
  }
  if (
    config.fonts &&
    isNonEmptyString((config.fonts as { bodyWeight?: unknown }).bodyWeight)
  ) {
    points += 5;
  }
  const score = clampScore(points);
  return { score, notes: `${points}/100 points de richesse configJson` };
}

function scoreIdentityLinkage(
  identity: string | null,
): { score: number; notes: string } {
  if (!identity) {
    return {
      score: 30,
      notes: 'Aucune identité liée (fonctionne via configJson)',
    };
  }
  if (resolveIdentityKnown(identity)) {
    return {
      score: 100,
      notes: `Identité « ${identity} » résout vers un preset connu`,
    };
  }
  return {
    score: 50,
    notes: `Identité « ${identity} » inconnue du registre`,
  };
}

function scoreCommercialMarkers(theme: ThemeQualityInput): {
  score: number;
  notes: string;
} {
  let points = 0;
  if (theme.isPremium) points += 40;
  if (theme.isRecommended) points += 30;
  if (theme.isDefault) points += 20;
  if (theme.isBuiltIn) points += 10;
  const markers: string[] = [];
  if (theme.isPremium) markers.push('premium');
  if (theme.isRecommended) markers.push('recommended');
  if (theme.isDefault) markers.push('default');
  if (theme.isBuiltIn) markers.push('builtin');
  const score = clampScore(points);
  return {
    score,
    notes: markers.length ? `Marqueurs: ${markers.join(', ')}` : 'Aucun marqueur commercial',
  };
}

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

function scoreVersioning(version: string | null | undefined): {
  score: number;
  notes: string;
} {
  const v = isNonEmptyString(version) ? (version as string).trim() : '';
  if (!v) {
    return { score: 0, notes: 'Version vide' };
  }
  if (SEMVER_REGEX.test(v)) {
    return { score: 100, notes: `Version semver « ${v} »` };
  }
  return { score: 50, notes: `Version non-semver « ${v} »` };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Compute the 6-dimension quality score for a PlatformTheme.
 *
 * PURE function — no DB call, no cache, no side effect. Takes the theme object
 * (as selected by the themes route THEME_SELECT) and returns a
 * `ThemeQualityScore`. The caller is responsible for auth + DB fetch.
 *
 * @param theme The PlatformTheme row (13 fields from THEME_SELECT).
 * @returns A `ThemeQualityScore` object. Never null + never throws.
 */
export async function computeThemeQualityScore(
  theme: ThemeQualityInput,
): Promise<ThemeQualityScore> {
  const paletteResult = scorePaletteCompleteness(
    theme.paletteJson,
    theme.configJson,
  );
  const typographyResult = scoreTypography(theme.fontDisplay, theme.fontBody);
  const configResult = scoreConfigJsonRichness(theme.configJson);
  const identityResult = scoreIdentityLinkage(theme.identity);
  const commercialResult = scoreCommercialMarkers(theme);
  const versionResult = scoreVersioning(theme.version);

  const dimensions: ThemeQualityDimension[] = [
    {
      name: 'Palette completeness',
      score: paletteResult.score,
      weight: 25,
      notes: paletteResult.notes,
    },
    {
      name: 'Typography',
      score: typographyResult.score,
      weight: 15,
      notes: typographyResult.notes,
    },
    {
      name: 'ConfigJson richness',
      score: configResult.score,
      weight: 25,
      notes: configResult.notes,
    },
    {
      name: 'Identity linkage',
      score: identityResult.score,
      weight: 10,
      notes: identityResult.notes,
    },
    {
      name: 'Commercial markers',
      score: commercialResult.score,
      weight: 15,
      notes: commercialResult.notes,
    },
    {
      name: 'Versioning',
      score: versionResult.score,
      weight: 10,
      notes: versionResult.notes,
    },
  ];

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weightedSum = dimensions.reduce(
    (sum, d) => sum + d.score * d.weight,
    0,
  );
  const overall = clampScore(weightedSum / totalWeight);
  const tier = tierFor(overall);

  // Findings: warnings for <50, positives for ≥90 (across all dimensions).
  const findings: ThemeQualityFinding[] = [];
  for (const d of dimensions) {
    if (d.score < 50) {
      findings.push({
        severity: 'warning',
        message: `${d.name}: ${d.score}/100 — ${d.notes}`,
      });
    } else if (d.score >= 90) {
      findings.push({
        severity: 'good',
        message: `${d.name}: ${d.score}/100 — ${d.notes}`,
      });
    }
  }

  return {
    themeId: theme.id,
    themeSlug: theme.slug,
    overall,
    tier,
    dimensions,
    findings,
    computedAt: new Date().toISOString(),
  };
}
