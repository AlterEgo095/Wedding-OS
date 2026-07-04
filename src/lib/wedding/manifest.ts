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
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';

// ─── Section Types ────────────────────────────────────────────────────────────
export type SectionType =
  | 'hero'
  | 'story'
  | 'gallery'
  | 'timeline'
  | 'map'
  | 'guest-auth';

export const SECTION_TYPES: SectionType[] = ['hero', 'story', 'gallery', 'timeline', 'map', 'guest-auth'];

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
const LAYOUT_SECTIONS: Record<string, Omit<ManifestSection, 'props'>[]> = {
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
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: {
      variants: { orderBy: { code: 'asc' } },
    },
  });

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

  const sections = (LAYOUT_SECTIONS[layout] || LAYOUT_SECTIONS.classic).map((s) => ({ ...s }));

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
