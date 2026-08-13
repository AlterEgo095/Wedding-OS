// ══════════════════════════════════════════════════════════════════════════════
// src/lib/invitations/variants.ts
// MISSION 5.9.2 P3 — Invitation Experience Library: Variants / Slot Mappings.
// ══════════════════════════════════════════════════════════════════════════════
//
// Three pure-function maps that bridge the THREE worlds:
//
//   1. Collection Module Slots (INVITATIONS pack — 8 slots from collections/index.ts)
//        ↳ standard / vip / famille / couple / presse / sponsor / numerique / impression
//   2. Invitation Styles (InvitationStyle union — 10 entries from types.ts)
//        ↳ ROYAL_GOLD / ROYAL_BLACK / WHITE_ROMANCE / CHAMPAGNE_EDITORIAL / ...
//   3. Renderer Components (5 premium React components dispatched by IdentityInvitation)
//        ↳ LuxuryInvitation / EditorialInvitation / BotanicalInvitation / CinematicInvitation / ChampagneInvitation
//
// These maps are READ-ONLY constants. They:
//   - drive the IdentityInvitation dispatcher (Phase 4)
//   - drive the Collection Module binding UI (Phase 6)
//   - drive the seed script (Phase 3 — scripts/seed-invitation-templates.cjs)
//   - drive the admin UI matrix preview (Phase 6 — InvitationTemplatesManager)
//
// Pure functions only — no DB access, no side effects, no I/O.
// ══════════════════════════════════════════════════════════════════════════════

import type {
  InvitationCategory,
  InvitationStyle,
  InvitationIdentity,
  InvitationSectionType,
  MediaSlotSemanticRole,
  InvitationLayout,
} from './types';

// ─── 1. INVITATION PACK SLOTS (mirrors lib/collections/index.ts) ──────────────

/**
 * The 8 INVITATIONS module slots from `lib/collections/index.ts` (lines 158-165).
 * Each slot maps to a guest-tier scope (or a delivery channel for the last two).
 *
 * These are STABLE identifiers — never renamed. They appear in:
 *   - DB CollectionModule.slot
 *   - lib/collections/index.ts COLLECTION_MODULE_SEED
 *   - lib/collections/types.ts ModulePack = 'INVITATIONS'
 */
export const INVITATION_PACK_SLOTS = [
  'standard',
  'vip',
  'famille',
  'couple',
  'presse',
  'sponsor',
  'numerique',
  'impression',
] as const;

export type InvitationPackSlot = (typeof INVITATION_PACK_SLOTS)[number];

/**
 * Human-readable label for each slot (mirrors collections/index.ts labels).
 * Used by the admin UI to render the matrix grid.
 */
export const INVITATION_PACK_SLOT_LABELS: Readonly<Record<InvitationPackSlot, string>> = {
  standard: 'Invitation STANDARD',
  vip: 'Invitation VIP',
  famille: 'Invitation FAMILLE',
  couple: 'Invitation COUPLE',
  presse: 'Invitation PRESSE',
  sponsor: 'Invitation SPONSOR',
  numerique: 'Invitation numérique (QR)',
  impression: 'Invitation imprimable (PDF)',
};

/**
 * The guest-tier scope for each slot (null = no tier — delivery channel only).
 * Mirrors the `guestTier` field in COLLECTION_MODULE_SEED.
 */
export const INVITATION_PACK_SLOT_TIER: Readonly<
  Record<InvitationPackSlot, 'STANDARD' | 'VIP' | 'FAMILLE' | 'COUPLE' | 'PRESSE' | 'SPONSOR' | null>
> = {
  standard: 'STANDARD',
  vip: 'VIP',
  famille: 'FAMILLE',
  couple: 'COUPLE',
  presse: 'PRESSE',
  sponsor: 'SPONSOR',
  numerique: null, // delivery channel
  impression: null, // delivery channel
};

// ─── 2. RENDERER COMPONENT IDENTIFIERS ───────────────────────────────────────

/**
 * The 5 premium React renderer components. The IdentityInvitation dispatcher
 * (Phase 4 — src/components/wedding/IdentityInvitation.tsx) reads this string
 * and dynamically imports the matching component from src/components/premium/.
 *
 * Each component renders an `InvitationExperienceConfig` (see types.ts §9).
 */
export type InvitationRendererComponent =
  | 'LuxuryInvitation'
  | 'EditorialInvitation'
  | 'BotanicalInvitation'
  | 'CinematicInvitation'
  | 'ChampagneInvitation';

/**
 * The renderer component file path (relative to src/components/).
 * Used by the admin UI to deep-link to the source.
 */
export const INVITATION_RENDERER_PATH: Readonly<
  Record<InvitationRendererComponent, string>
> = {
  LuxuryInvitation: 'premium/LuxuryInvitation.tsx',
  EditorialInvitation: 'premium/EditorialInvitation.tsx',
  BotanicalInvitation: 'premium/BotanicalInvitation.tsx',
  CinematicInvitation: 'premium/CinematicInvitation.tsx',
  ChampagneInvitation: 'premium/ChampagneInvitation.tsx',
};

// ─── 3. STYLE → RENDERER COMPONENT MAP (drives the dispatcher) ────────────────

/**
 * Maps an InvitationStyle (canonical 10) to its primary renderer component.
 * This is the ROUTING TABLE the IdentityInvitation dispatcher uses to pick
 * which premium React component renders a given template style.
 *
 * Per the mission brief §6 mapping table:
 *   - LuxuryInvitation    → royal-gold, royal-black, african-luxury, sapphire-night (4 styles)
 *   - EditorialInvitation → champagne-editorial, modern-monogram, black-ivory (3 styles)
 *   - BotanicalInvitation → white-romance, botanical-love (2 styles)
 *   - CinematicInvitation → sunset-romance (1 style)
 *   - ChampagneInvitation → (reserved for forward compat — alias of EditorialInvitation for now)
 */
export const STYLE_TO_RENDERER: Readonly<
  Record<InvitationStyle, InvitationRendererComponent>
> = {
  ROYAL_GOLD: 'LuxuryInvitation',
  ROYAL_BLACK: 'LuxuryInvitation',
  AFRICAN_LUXURY: 'LuxuryInvitation',
  SAPPHIRE_NIGHT: 'LuxuryInvitation',
  CHAMPAGNE_EDITORIAL: 'EditorialInvitation',
  MODERN_MONOGRAM: 'EditorialInvitation',
  BLACK_IVORY: 'EditorialInvitation',
  WHITE_ROMANCE: 'BotanicalInvitation',
  BOTANICAL_LOVE: 'BotanicalInvitation',
  SUNSET_ROMANCE: 'CinematicInvitation',
  // Mission 5.9.4 P2-1 — 5 new premium styles
  PEARL_ROMANCE: 'BotanicalInvitation',       // pearl/shimmer botanical
  EMERALD_PALACE: 'LuxuryInvitation',          // emerald palace luxury
  OLD_MONEY: 'EditorialInvitation',            // understated editorial
  ART_DECO: 'EditorialInvitation',             // geometric editorial
  BOTANICAL_GARDEN: 'BotanicalInvitation',     // garden botanical
};

/**
 * Maps a category to its primary renderer (used as a fallback when the style
 * is unknown — e.g. user-provided custom template). One category may have
 * multiple renderers; this returns the MOST COMMON one.
 */
export const CATEGORY_TO_DEFAULT_RENDERER: Readonly<
  Record<InvitationCategory, InvitationRendererComponent>
> = {
  LUXURY: 'LuxuryInvitation',
  EDITORIAL: 'EditorialInvitation',
  BOTANICAL: 'BotanicalInvitation',
  CINEMATIC: 'CinematicInvitation',
  CHAMPAGNE: 'ChampagneInvitation',
};

/**
 * Returns the renderer component for a given style. Falls back to the
 * category-default renderer if the style is not in the map (defensive —
 * should never happen since the union is closed, but allows forward-compat
 * with custom template styles).
 */
export function resolveRendererForStyle(
  style: InvitationStyle,
  category?: InvitationCategory,
): InvitationRendererComponent {
  if (style in STYLE_TO_RENDERER) {
    return STYLE_TO_RENDERER[style];
  }
  if (category && category in CATEGORY_TO_DEFAULT_RENDERER) {
    return CATEGORY_TO_DEFAULT_RENDERER[category];
  }
  return 'LuxuryInvitation'; // safest default — most-tested component
}

// ─── 4. STYLE → INVITATION PACK SLOT COMPATIBILITY MATRIX ────────────────────

/**
 * Maps each InvitationStyle to the list of INVITATIONS pack slots it is
 * COMPATIBLE with. Used by:
 *   - admin UI to show "available templates" when an admin selects a pack slot
 *   - seed script to populate ExperienceVariant.sectionId (Phase 4)
 *   - quality scorecard to flag unsupported combinations (Phase 7)
 *
 * Default rule: every template is compatible with `standard`, `vip`,
 * `numerique`, `impression` (universal). Premium templates add `famille`,
 * `couple`, `presse`, `sponsor` selectively.
 */
export const STYLE_TO_PACK_SLOTS: Readonly<
  Record<InvitationStyle, readonly InvitationPackSlot[]>
> = {
  // Universal templates (FREE / STANDARD) — compatible with all 8 slots
  ROYAL_GOLD: ['standard', 'vip', 'famille', 'couple', 'presse', 'sponsor', 'numerique', 'impression'],
  CHAMPAGNE_EDITORIAL: ['standard', 'vip', 'famille', 'couple', 'presse', 'sponsor', 'numerique', 'impression'],
  MODERN_MONOGRAM: ['standard', 'vip', 'famille', 'couple', 'presse', 'sponsor', 'numerique', 'impression'],
  // Premium templates — exclude 'presse' (press gets simpler templates)
  ROYAL_BLACK: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  BLACK_IVORY: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  WHITE_ROMANCE: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  BOTANICAL_LOVE: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  AFRICAN_LUXURY: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  SUNSET_ROMANCE: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  // Exclusive template — VIP + sponsor + famille only (prestige positioning)
  SAPPHIRE_NIGHT: ['vip', 'famille', 'sponsor', 'numerique', 'impression'],
  // Mission 5.9.4 P2-1 — 5 new premium templates
  PEARL_ROMANCE: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  OLD_MONEY: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  ART_DECO: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  BOTANICAL_GARDEN: ['standard', 'vip', 'famille', 'couple', 'sponsor', 'numerique', 'impression'],
  // Exclusive emerald palace — VIP + sponsor + famille only (prestige positioning)
  EMERALD_PALACE: ['vip', 'famille', 'sponsor', 'numerique', 'impression'],
};

/**
 * Returns true if a given (style, slot) combination is compatible.
 * Used by the admin UI to filter the template picker.
 */
export function isStyleCompatibleWithPackSlot(
  style: InvitationStyle,
  slot: InvitationPackSlot,
): boolean {
  const allowed = STYLE_TO_PACK_SLOTS[style] ?? [];
  return allowed.includes(slot);
}

/**
 * Returns all InvitationStyles compatible with a given pack slot (inverse map).
 * Used by the admin UI to render the available templates when an admin
 * picks a slot in the Collection Module binder.
 */
export function listStylesForPackSlot(slot: InvitationPackSlot): InvitationStyle[] {
  return (Object.keys(STYLE_TO_PACK_SLOTS) as InvitationStyle[]).filter((style) =>
    isStyleCompatibleWithPackSlot(style, slot),
  );
}

// ─── 5. SEMANTIC ROLE → SECTION TYPE MAP (drives auto-binding) ────────────────

/**
 * Maps a MediaSlotSemanticRole to the section type(s) it typically appears in.
 * The composer uses this to auto-bind media slots to sections when a wedding
 * has uploaded media but hasn't manually assigned slots.
 *
 * One role may serve multiple sections (e.g. COUPLE_HERO appears in 'cover'
 * AND 'hero-photo' depending on layout).
 */
export const SEMANTIC_ROLE_TO_SECTIONS: Readonly<
  Record<MediaSlotSemanticRole, readonly InvitationSectionType[]>
> = {
  COUPLE_HERO: ['cover', 'hero-photo'],
  COUPLE_PORTRAIT: ['couple-introduction', 'guest-personalization'],
  COUPLE_STORY: ['story'],
  GALLERY_01: ['gallery'],
  GALLERY_02: ['gallery'],
  GALLERY_03: ['gallery'],
  VENUE_IMAGE: ['venue'],
  BACKGROUND_IMAGE: ['cover', 'ceremony', 'reception'],
  MONOGRAM: ['cover', 'footer', 'guest-personalization'],
};

/**
 * Returns the sections that can use a given semantic role.
 */
export function getSectionsForSemanticRole(
  role: MediaSlotSemanticRole,
): readonly InvitationSectionType[] {
  return SEMANTIC_ROLE_TO_SECTIONS[role] ?? [];
}

/**
 * Returns the primary semantic role for a given section type (the role that
 * will be auto-bound first when no manual assignment exists).
 */
export function getPrimarySemanticRoleForSection(
  sectionType: InvitationSectionType,
): MediaSlotSemanticRole | null {
  const map: Partial<Record<InvitationSectionType, MediaSlotSemanticRole>> = {
    cover: 'COUPLE_HERO',
    'hero-photo': 'COUPLE_HERO',
    'couple-introduction': 'COUPLE_PORTRAIT',
    'guest-personalization': 'COUPLE_PORTRAIT',
    story: 'COUPLE_STORY',
    gallery: 'GALLERY_01',
    venue: 'VENUE_IMAGE',
    ceremony: 'BACKGROUND_IMAGE',
    reception: 'BACKGROUND_IMAGE',
    footer: 'MONOGRAM',
  };
  return map[sectionType] ?? null;
}

// ─── 6. IDENTITY → RENDERER (preset default) ──────────────────────────────────

/**
 * Maps an InvitationIdentity (5 presets) to its DEFAULT renderer component.
 * Used when a wedding has NO explicit InvitationTemplate selected but has
 * an identity override (legacy 5.9.1 path) — the IdentityInvitation
 * dispatcher falls back to the identity's default renderer with a built-in
 * template config.
 *
 * This preserves backward-compat for the 7 existing weddings (audit F10).
 */
export const IDENTITY_TO_DEFAULT_RENDERER: Readonly<
  Record<InvitationIdentity, InvitationRendererComponent>
> = {
  'royal-luxury': 'LuxuryInvitation',
  'minimal-editorial': 'EditorialInvitation',
  'botanical-romance': 'BotanicalInvitation',
  'cinematic-dark': 'CinematicInvitation',
  'modern-champagne': 'ChampagneInvitation',
};

/**
 * Maps an InvitationIdentity to its DEFAULT InvitationStyle (used when no
 * explicit template is selected). The IdentityInvitation dispatcher uses
 * this to render a default invitation experience for legacy weddings.
 */
export const IDENTITY_TO_DEFAULT_STYLE: Readonly<
  Record<InvitationIdentity, InvitationStyle>
> = {
  'royal-luxury': 'ROYAL_GOLD',
  'minimal-editorial': 'MODERN_MONOGRAM',
  'botanical-romance': 'WHITE_ROMANCE',
  'cinematic-dark': 'SUNSET_ROMANCE',
  'modern-champagne': 'CHAMPAGNE_EDITORIAL',
};

// ─── 7. LAYOUT → DEFAULT SECTION ORDER (composer bootstrap) ───────────────────

/**
 * Default section order per layout. The composer uses this to order sections
 * when a template's configJson.sections lacks explicit `order` values, OR
 * when a wedding has no InvitationTemplate and the dispatcher needs to
 * synthesize a default experience from the layout alone.
 *
 * Section IDs not in the list are appended at the end (sorted alphabetically).
 */
export const LAYOUT_DEFAULT_SECTION_ORDER: Readonly<
  Record<InvitationLayout, readonly InvitationSectionType[]>
> = {
  FULL_BLEED_IMAGE: ['cover', 'couple-introduction', 'wedding-date', 'countdown', 'ceremony', 'reception', 'story', 'gallery', 'venue', 'rsvp', 'qr-access', 'footer'],
  EDITORIAL_GRID: ['cover', 'wedding-date', 'couple-introduction', 'story', 'gallery', 'ceremony', 'reception', 'venue', 'rsvp', 'footer'],
  SPLIT_SCREEN: ['cover', 'couple-introduction', 'story', 'gallery', 'wedding-date', 'ceremony', 'reception', 'venue', 'rsvp', 'footer'],
  CINEMATIC_HERO: ['cover', 'wedding-date', 'countdown', 'couple-introduction', 'story', 'gallery', 'ceremony', 'reception', 'venue', 'rsvp', 'qr-access', 'footer'],
  TYPOGRAPHIC_HERO: ['cover', 'wedding-date', 'couple-introduction', 'ceremony', 'reception', 'story', 'gallery', 'venue', 'rsvp', 'footer'],
  ASYMMETRIC: ['cover', 'couple-introduction', 'wedding-date', 'story', 'gallery', 'ceremony', 'reception', 'venue', 'rsvp', 'footer'],
  CENTERED_CEREMONY: ['cover', 'wedding-date', 'couple-introduction', 'ceremony', 'reception', 'story', 'gallery', 'venue', 'rsvp', 'footer'],
  PHOTO_COLLAGE: ['cover', 'gallery', 'couple-introduction', 'wedding-date', 'story', 'ceremony', 'reception', 'venue', 'rsvp', 'footer'],
};

/**
 * Returns the default section order for a layout. Falls back to the
 * FULL_BLEED_IMAGE order if the layout is unknown.
 */
export function getDefaultSectionOrderForLayout(
  layout: InvitationLayout,
): readonly InvitationSectionType[] {
  return LAYOUT_DEFAULT_SECTION_ORDER[layout] ?? LAYOUT_DEFAULT_SECTION_ORDER.FULL_BLEED_IMAGE;
}

// ─── 8. METADATA HELPERS (admin UI matrix preview) ────────────────────────────

/**
 * Returns the full metadata for a given style — used by the admin UI to
 * render the template picker matrix (slot × style × renderer grid).
 *
 * Combines:
 *   - STYLE_TO_RENDERER (which component renders it)
 *   - STYLE_TO_PACK_SLOTS (which slots are compatible)
 *   - canonical category + identity (from CANONICAL_INVITATION_TEMPLATES)
 */
export function getStyleMetadata(style: InvitationStyle): {
  renderer: InvitationRendererComponent;
  rendererPath: string;
  compatibleSlots: readonly InvitationPackSlot[];
  compatibleSlotsCount: number;
  defaultSectionOrder: readonly InvitationSectionType[];
} {
  const renderer = STYLE_TO_RENDERER[style];
  const compatibleSlots = STYLE_TO_PACK_SLOTS[style];
  return {
    renderer,
    rendererPath: INVITATION_RENDERER_PATH[renderer],
    compatibleSlots,
    compatibleSlotsCount: compatibleSlots.length,
    defaultSectionOrder: getDefaultSectionOrderForLayout(
      // Map style → layout (1:1 for canonical templates)
      STYLE_TO_LAYOUT[style] ?? 'FULL_BLEED_IMAGE',
    ),
  };
}

/** Style → default layout (mirrors CANONICAL_INVITATION_TEMPLATES in types.ts). */
const STYLE_TO_LAYOUT: Readonly<Record<InvitationStyle, InvitationLayout>> = {
  ROYAL_GOLD: 'FULL_BLEED_IMAGE',
  ROYAL_BLACK: 'CINEMATIC_HERO',
  WHITE_ROMANCE: 'CENTERED_CEREMONY',
  CHAMPAGNE_EDITORIAL: 'EDITORIAL_GRID',
  BLACK_IVORY: 'TYPOGRAPHIC_HERO',
  BOTANICAL_LOVE: 'SPLIT_SCREEN',
  MODERN_MONOGRAM: 'ASYMMETRIC',
  AFRICAN_LUXURY: 'PHOTO_COLLAGE',
  SUNSET_ROMANCE: 'CINEMATIC_HERO',
  SAPPHIRE_NIGHT: 'FULL_BLEED_IMAGE',
  // Mission 5.9.4 P2-1 — 5 new premium templates
  PEARL_ROMANCE: 'CENTERED_CEREMONY',
  EMERALD_PALACE: 'FULL_BLEED_IMAGE',
  OLD_MONEY: 'TYPOGRAPHIC_HERO',
  ART_DECO: 'EDITORIAL_GRID',
  BOTANICAL_GARDEN: 'SPLIT_SCREEN',
};

// ─── 9. SLOT → DEFAULT STYLE (admin UI default selection) ─────────────────────

/**
 * Returns the default InvitationStyle for a given pack slot (used as the
 * pre-selected option in the admin UI when an admin opens a slot for the
 * first time). The default is the most appropriate FREE/STANDARD template
 * for the slot's tier.
 */
export function getDefaultStyleForPackSlot(slot: InvitationPackSlot): InvitationStyle {
  const map: Record<InvitationPackSlot, InvitationStyle> = {
    standard: 'ROYAL_GOLD', // free default
    vip: 'ROYAL_BLACK', // premium
    famille: 'WHITE_ROMANCE', // premium
    couple: 'BLACK_IVORY', // premium
    presse: 'CHAMPAGNE_EDITORIAL', // standard
    sponsor: 'MODERN_MONOGRAM', // standard
    numerique: 'ROYAL_GOLD', // free default (numeric delivery)
    impression: 'CHAMPAGNE_EDITORIAL', // standard (print delivery)
  };
  return map[slot];
}

