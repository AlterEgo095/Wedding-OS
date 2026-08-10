// ══════════════════════════════════════════════════════════════════════════════
// src/lib/wedding/manifest.ts — CANONICAL MANIFEST CONTRACT (Slice 1)
// ══════════════════════════════════════════════════════════════════════════════
// The manifest is the SINGLE source of truth for how a wedding's public page is
// rendered. It is:
//   - typed (TypeScript interfaces)
//   - versioned (schemaVersion)
//   - validated (validateManifest throws on invalid)
//   - persisted (WeddingCollectionBinding.manifest, JSON string)
//   - consumed at render time (layout.tsx → context → SectionRenderer)
//
// The chain is:
//   Collection (DB) → generateManifest() → binding.manifest → SectionRenderer → public page
//
// No hardcoded section order. No decorative manifest. No write-only field.
//
// P3.2 (Layouts stage UI + API) — drift fix:
// This file historically exported a hardcoded `LAYOUT_SECTIONS` map of 5 layouts
// (royal, classic, minimal, destination, modern). src/lib/themes/templates.ts
// exported a hardcoded `LAYOUT_OPTIONS` array of 4 layouts (classic, modern,
// minimalist, royal) — `minimalist` vs `minimal` slug drift + 4 vs 5 entries.
// P3-Foundation deployed a `Layout` Prisma model (seeded with the 5 manifest.ts
// slugs) and a Layout Manager API (/api/platform/layouts). This file now ALSO
// exports an async `getLayoutSections(layoutSlug)` that reads from the DB
// `Layout` table (slug=layoutSlug, status=PUBLISHED) and falls back to the
// hardcoded `LAYOUT_SECTIONS[layoutSlug]` if the DB is empty or the query
// fails. `generateManifest` and `resolveWeddingManifest` prefer the DB version.
// The hardcoded `LAYOUT_SECTIONS` constant is kept (and now exported) for
// backward compatibility (sync callers, SSR cold start before DB reachable).
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';

// ─── Section Types ────────────────────────────────────────────────────────────
//
// MISSION 5.9.0 — Phase 1E (audit §20.3) expanded this from 6 to 14 types so
// the full 13-step public narrative is reachable from the manifest:
//   HERO · COUPLE · COUNTDOWN · STORY · GALLERY · TIMELINE · VENUE · MAP
//   INVITATION · RSVP · GUEST-AUTH · GUEST-EXPERIENCE · GUESTBOOK · CTA
//
// The 8 new types are ADDITIVE — existing layouts (royal, classic, minimal,
// destination, modern) still ship their original 6-section configuration.
// Designers add the new sections explicitly via the manifest editor (or by
// binding the wedding to a new DB-seeded Layout row). The new types default
// to `enabled: false` everywhere they aren't listed, so existing published
// weddings render identically.
export type SectionType =
  | 'hero'
  | 'couple'           // NEW — couple spotlight (names, photo, initials)
  | 'countdown'        // NEW — live countdown to wedding date
  | 'story'
  | 'gallery'
  | 'timeline'
  | 'venue'            // NEW — venue details (extracted from map, address-only variant)
  | 'map'              // existing — full map with directions
  | 'invitation'       // NEW — invitation card with RSVP CTA
  | 'rsvp'             // NEW — RSVP form (standalone, separate from guest-auth)
  | 'guest-auth'
  | 'guest-experience' // NEW — guest personal space (after login)
  | 'guestbook'        // NEW — guestbook messages
  | 'cta';             // NEW — final call-to-action (share photos, guestbook, thank you)

export const SECTION_TYPES: SectionType[] = [
  'hero', 'couple', 'countdown', 'story', 'gallery', 'timeline',
  'venue', 'map', 'invitation', 'rsvp', 'guest-auth', 'guest-experience', 'guestbook', 'cta',
];

// ─── Manifest Section ─────────────────────────────────────────────────────────
export interface ManifestSection {
  id: string;
  type: SectionType;
  enabled: boolean;
  order: number;
  props?: Record<string, unknown>;
}

// ─── Manifest Theme ───────────────────────────────────────────────────────────
export interface ManifestTheme {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
}

// ─── Manifest Luxury ──────────────────────────────────────────────────────────
export interface ManifestLuxury {
  theme: string;
  intensity: number;
  effects: Record<string, boolean>;
}

// ─── Canonical Manifest ───────────────────────────────────────────────────────
export interface WeddingManifest {
  schemaVersion: 1;
  collectionId: string;
  collectionSlug: string;
  collectionName: string;
  collectionVersion: string;
  variantId: string | null;
  sections: ManifestSection[];
  theme: ManifestTheme;
  luxury: ManifestLuxury | null;
}

// ─── Layout → Section Configuration ───────────────────────────────────────────
//
// Hardcoded fallback for `getLayoutSections()` (P3.2). Kept for backward
// compat (sync callers, SSR cold start before DB reachable) and as the source
// of truth for the 5 canonical layouts that are seeded into the DB Layout
// table by the P3-Foundation migration. Designers should treat the DB as the
// source of truth going forward — new layouts are added via
// /api/platform/layouts, NOT by editing this map.
export const LAYOUT_SECTIONS: Record<string, Omit<ManifestSection, 'props'>[]> = {
  royal: [
    { id: 'accueil', type: 'hero', enabled: true, order: 0 },
    { id: 'notre-histoire', type: 'story', enabled: true, order: 1 },
    { id: 'galerie', type: 'gallery', enabled: true, order: 2 },
    { id: 'programme', type: 'timeline', enabled: true, order: 3 },
    { id: 'lieu', type: 'map', enabled: true, order: 4 },
    { id: 'authentification', type: 'guest-auth', enabled: true, order: 5 },
  ],
  classic: [
    { id: 'accueil', type: 'hero', enabled: true, order: 0 },
    { id: 'notre-histoire', type: 'story', enabled: true, order: 1 },
    { id: 'galerie', type: 'gallery', enabled: true, order: 2 },
    { id: 'programme', type: 'timeline', enabled: true, order: 3 },
    { id: 'lieu', type: 'map', enabled: true, order: 4 },
    { id: 'authentification', type: 'guest-auth', enabled: true, order: 5 },
  ],
  minimal: [
    { id: 'accueil', type: 'hero', enabled: true, order: 0 },
    { id: 'notre-histoire', type: 'story', enabled: true, order: 1 },
    { id: 'programme', type: 'timeline', enabled: true, order: 2 },
    { id: 'authentification', type: 'guest-auth', enabled: true, order: 3 },
  ],
  destination: [
    { id: 'accueil', type: 'hero', enabled: true, order: 0 },
    { id: 'galerie', type: 'gallery', enabled: true, order: 1 },
    { id: 'notre-histoire', type: 'story', enabled: true, order: 2 },
    { id: 'programme', type: 'timeline', enabled: true, order: 3 },
    { id: 'lieu', type: 'map', enabled: true, order: 4 },
    { id: 'authentification', type: 'guest-auth', enabled: true, order: 5 },
  ],
  modern: [
    { id: 'accueil', type: 'hero', enabled: true, order: 0 },
    { id: 'programme', type: 'timeline', enabled: true, order: 1 },
    { id: 'galerie', type: 'gallery', enabled: true, order: 2 },
    { id: 'notre-histoire', type: 'story', enabled: true, order: 3 },
    { id: 'authentification', type: 'guest-auth', enabled: true, order: 4 },
  ],
};

/**
 * DB-backed layout sections lookup (P3.2 drift fix).
 *
 * Reads `Layout.sectionsJson` (ManifestSection[] shape) from the DB Layout
 * table where `slug=layoutSlug` and `status=PUBLISHED`. Falls back to the
 * hardcoded `LAYOUT_SECTIONS[layoutSlug]` (or `LAYOUT_SECTIONS.classic`) if:
 *   - the DB query fails (e.g. Layout table not yet migrated, query error), OR
 *   - the DB row is missing or not PUBLISHED, OR
 *   - the DB row's sectionsJson is empty / unparseable / fails validation.
 *
 * Resolves the historical naming drift where this file used `minimal` and
 * src/lib/themes/templates.ts used `minimalist`: the DB Layout table (seeded
 * in P3-Foundation) uses `minimal`, and this function is the canonical lookup
 * for both codepaths.
 *
 * Used by:
 *   - `generateManifest()` — when a Collection's `themeSeed.layout` slug is a
 *     DB layout, we pull its section ordering from the DB.
 *   - `resolveWeddingManifest()` — when a Wedding has a `layoutId` but no
 *     persisted binding manifest, we build a default manifest from the
 *     layout's sections.
 */
export async function getLayoutSections(
  layoutSlug: string,
): Promise<Omit<ManifestSection, 'props'>[]> {
  try {
    const row = await db.layout.findUnique({
      where: { slug: layoutSlug },
      select: { sectionsJson: true, status: true },
    });
    if (row && row.status === 'PUBLISHED') {
      const parsed = safeJsonParse<unknown>(row.sectionsJson, null);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate each section + strip `props` to match LAYOUT_SECTIONS value
        // shape. Props per section live in `Layout.propsJson`, not embedded in
        // sectionsJson.
        const sections: Omit<ManifestSection, 'props'>[] = [];
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const s = item as Record<string, unknown>;
          if (
            typeof s.id !== 'string' ||
            typeof s.type !== 'string' ||
            !SECTION_TYPES.includes(s.type as SectionType) ||
            typeof s.enabled !== 'boolean' ||
            typeof s.order !== 'number'
          ) {
            continue;
          }
          sections.push({
            id: s.id,
            type: s.type as SectionType,
            enabled: s.enabled,
            order: s.order,
          });
        }
        if (sections.length > 0) return sections;
      }
    }
  } catch {
    // DB query failed (table missing, schema not migrated, etc.) — fall through
    // to the hardcoded fallback. Non-fatal: kept silent to avoid log noise
    // during SSR when the DB is briefly unreachable.
  }
  // Hardcoded fallback (matches the original `LAYOUT_SECTIONS[layout] ||
  // LAYOUT_SECTIONS.classic` behavior).
  return (LAYOUT_SECTIONS[layoutSlug] || LAYOUT_SECTIONS.classic).map((s) => ({ ...s }));
}

export function createDefaultManifest(): WeddingManifest {
  return {
    schemaVersion: 1,
    collectionId: '',
    collectionSlug: 'default',
    collectionName: 'Default',
    collectionVersion: '0.0.0',
    variantId: null,
    sections: LAYOUT_SECTIONS.classic.map((s) => ({ ...s })),
    theme: {
      primaryColor: '#D4A853',
      accentColor: '#1a1a2e',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
    },
    luxury: null,
  };
}

// ─── Generate Manifest from DB Collection + Variant ───────────────────────────
export async function generateManifest(
  collectionId: string,
  variantId: string | null = null,
): Promise<WeddingManifest | null> {
  // Mission 5.7 B1: accept either the DB cuid OR the slug as collectionId.
  // The static catalog (catalog.ts) and CollectionsShowcase pass slugs as ids;
  // the DB uses cuids. Try cuid first, fall back to slug.
  let collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: {
      variants: { orderBy: { code: 'asc' } },
    },
  });
  if (!collection) {
    collection = await db.collection.findUnique({
      where: { slug: collectionId },
      include: {
        variants: { orderBy: { code: 'asc' } },
      },
    });
  }

  if (!collection) return null;

  const themeSeed = safeJsonParse<Record<string, string>>(collection.themeSeed, {});
  const layout = themeSeed.layout || 'classic';

  let variant = variantId
    ? collection.variants.find((v) => v.id === variantId || v.code === variantId)
    : collection.variants.find((v) => v.isDefault) || collection.variants[0];

  const paletteOverride = variant?.paletteOverride
    ? safeJsonParse<Record<string, string>>(variant.paletteOverride, {})
    : {};

  const theme: ManifestTheme = {
    primaryColor: paletteOverride.primaryColor || themeSeed.primaryColor || '#D4A853',
    accentColor: paletteOverride.accentColor || themeSeed.accentColor || '#1a1a2e',
    fontDisplay: paletteOverride.fontDisplay || themeSeed.fontDisplay || 'Cormorant Garamond',
    fontBody: paletteOverride.fontBody || themeSeed.fontBody || 'Inter',
  };

  const luxury: ManifestLuxury | null = collection.luxuryPreset
    ? safeJsonParse<ManifestLuxury | null>(collection.luxuryPreset, null)
    : null;

  const sections = await getLayoutSections(layout);

  return {
    schemaVersion: 1,
    collectionId: collection.id,
    collectionSlug: collection.slug,
    collectionName: collection.name,
    collectionVersion: collection.version,
    variantId: variant?.id || null,
    sections,
    theme,
    luxury,
  };
}

// ─── Validate Manifest ────────────────────────────────────────────────────────
export function validateManifest(manifest: unknown): WeddingManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('MANIFEST_INVALID: not an object');
  }
  const m = manifest as Partial<WeddingManifest>;

  if (m.schemaVersion !== 1) {
    throw new Error(`MANIFEST_INVALID: unsupported schemaVersion ${m.schemaVersion}`);
  }
  if (!Array.isArray(m.sections)) {
    throw new Error('MANIFEST_INVALID: sections is not an array');
  }
  if (!m.theme || typeof m.theme.primaryColor !== 'string') {
    throw new Error('MANIFEST_INVALID: theme.primaryColor missing');
  }

  for (const s of m.sections) {
    if (!s.id || typeof s.id !== 'string') {
      throw new Error('MANIFEST_INVALID: section.id missing');
    }
    if (!SECTION_TYPES.includes(s.type)) {
      throw new Error(`MANIFEST_INVALID: unknown section type "${s.type}"`);
    }
    if (typeof s.enabled !== 'boolean') {
      throw new Error('MANIFEST_INVALID: section.enabled must be boolean');
    }
    if (typeof s.order !== 'number') {
      throw new Error('MANIFEST_INVALID: section.order must be number');
    }
  }

  return m as WeddingManifest;
}

// ─── Parse Manifest from DB string ────────────────────────────────────────────
export function parseManifest(manifestJson: string | null | undefined): WeddingManifest | null {
  if (!manifestJson) return null;
  try {
    const raw = safeJsonParse<unknown>(manifestJson, null);
    if (!raw) return null;
    return validateManifest(raw);
  } catch {
    return null;
  }
}

// ─── Resolve Manifest for a Wedding (server-side) ─────────────────────────────
export async function resolveWeddingManifest(weddingId: string): Promise<WeddingManifest> {
  const binding = await db.weddingCollectionBinding.findUnique({
    where: { weddingId },
    select: { manifest: true, collectionId: true },
  });

  const parsed = parseManifest(binding?.manifest);
  if (parsed) return parsed;

  // P3.2: no persisted binding manifest — check if the wedding has a layoutId.
  // If so, build a default manifest from the layout's sections (DB-backed via
  // `getLayoutSections`, with hardcoded fallback inside). This lets designers
  // publish new layouts without touching the hardcoded LAYOUT_SECTIONS map.
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { layout: { select: { slug: true } } },
  });
  if (wedding?.layout?.slug) {
    const sections = await getLayoutSections(wedding.layout.slug);
    if (sections.length > 0) {
      return {
        schemaVersion: 1,
        collectionId: '',
        collectionSlug: 'default',
        collectionName: 'Default',
        collectionVersion: '0.0.0',
        variantId: null,
        sections: sections.map((s) => ({ ...s })),
        theme: {
          primaryColor: '#D4A853',
          accentColor: '#1a1a2e',
          fontDisplay: 'Cormorant Garamond',
          fontBody: 'Inter',
        },
        luxury: null,
      };
    }
  }

  return createDefaultManifest();
}

// ─── Resolve DRAFT Manifest (for admin preview only) ──────────────────────────
// Returns the draft manifest if it exists, otherwise the published manifest.
// Used by the preview route (?preview=draft) which is admin-only.
export async function resolveWeddingDraftManifest(weddingId: string): Promise<WeddingManifest> {
  const binding = await db.weddingCollectionBinding.findUnique({
    where: { weddingId },
    select: { manifest: true, draftManifest: true },
  });

  // Prefer draft if it exists and is valid
  if (binding?.draftManifest) {
    const draft = parseManifest(binding.draftManifest);
    if (draft) return draft;
  }

  // Fall back to published
  const published = parseManifest(binding?.manifest);
  if (published) return published;

  return createDefaultManifest();
}
