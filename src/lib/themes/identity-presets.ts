// ══════════════════════════════════════════════════════════════════════════════
// src/lib/themes/identity-presets.ts
// Phase 2E (MISSION 5.9.0 §20.4) — Section identity presets registry.
// ══════════════════════════════════════════════════════════════════════════════
//
// Maps 5 wedding "identities" (curated end-to-end design systems) to:
//   - a base ThemePreset slug from the unified THEME_PRESETS registry (Phase 1B)
//   - optional color / font / pattern / ambiance overrides on top of the base
//   - a motion tier (subtle / elegant / cinematic / none)
//   - a copy tone (FR) used by AI-assisted content generation
//   - section component overrides (which premium variant to use per section type)
//
// Identities are ADDITIVE to THEME_PRESETS — they don't replace or rename any
// of the 16 base presets. A wedding explicitly opts into an identity by setting
// `identity: 'royal-luxury'` (or any of the 5 ids) in its themeConfig JSON blob
// (NO new Prisma column, NO API change). When no identity is set, the wedding
// renders with the default section components (HeroSection, PremiumGallery, …)
// — backward compat is preserved.
//
// The 5 identities (from the audit §20.4 Phase 2E):
//   1. royal-luxury        — navy + gold + Cormorant + candle-pattern
//   2. minimal-editorial   — cream + charcoal + Playfair + no-pattern
//   3. botanical-romance   — sage + blush + Cormorant + leaf-pattern
//   4. cinematic-dark      — black + gold + Playfair + film-grain
//   5. modern-champagne    — champagne + bronze + Geist Sans + no-pattern
//
// Each identity's `basePresetSlug` MUST exist in THEME_PRESETS (validated at
// module load — throws at import time if the base preset is missing, which
// catches typos during development rather than at first render).
// ══════════════════════════════════════════════════════════════════════════════

import {
  THEME_PRESETS,
  getThemePreset,
  type ThemePreset,
  type ThemeMotionTier,
} from './presets';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The 5 wedding identities curated by the design team (audit §20.4 Phase 2E).
 * Stored in `Wedding.themeConfig.identity` (JSON blob — no Prisma column).
 */
export type WeddingIdentity =
  | 'royal-luxury'
  | 'minimal-editorial'
  | 'botanical-romance'
  | 'cinematic-dark'
  | 'modern-champagne';

/**
 * Section component variants available as overrides.
 *
 * The default section components (HeroSection, PremiumGallery, CountdownSection)
 * are always available. The premium variants (Phase 2D) are opt-in per identity.
 */
export type SectionComponent =
  | 'CinematicHero'
  | 'EditorialHero'
  | 'HeroSection'
  | 'LuxuryGallery'
  | 'PremiumGallery'
  | 'ImmersiveGallery'
  | 'LuxuryCountdown'
  | 'CountdownSection';

/**
 * A single section override entry — replaces the default component for the
 * given `sectionType` with the specified `component` variant.
 */
export interface SectionOverride {
  /** The manifest section type to override (e.g. 'hero', 'gallery'). */
  sectionType: string;
  /** The premium component variant to use instead of the default. */
  component: SectionComponent;
}

/**
 * Optional color overrides applied on top of the base ThemePreset.
 * All values are CSS color strings (hex / rgb / oklch / var(--token)).
 */
export interface IdentityColorOverrides {
  primary?: string;
  accent?: string;
  surface?: string;
  surfaceDeep?: string;
  text?: string;
}

/**
 * Optional font overrides applied on top of the base ThemePreset.
 */
export interface IdentityFontOverrides {
  display?: string;
  body?: string;
}

/**
 * An identity preset — the full design DNA for one of the 5 wedding identities.
 *
 * The `identityPresetToThemePreset()` helper merges the base ThemePreset with
 * the overrides to produce a final ThemePreset consumable by ThemeInjector
 * (Phase 1A) and the existing theme pipeline.
 */
export interface IdentityPreset {
  /** Stable identifier (stored in themeConfig.identity). */
  id: WeddingIdentity;
  /** Human-readable label (FR) shown in the picker UI. */
  label: string;
  /** Marketing description (FR) shown under the label. */
  description: string;
  /** Base ThemePreset slug to derive colors/fonts from (must exist in THEME_PRESETS). */
  basePresetSlug: string;
  /** Override colors (applied on top of base preset). */
  colors?: IdentityColorOverrides;
  /** Override fonts (applied on top of base preset). */
  fonts?: IdentityFontOverrides;
  /** Pattern overlay (CSS background shorthand or 'none'). */
  pattern: string;
  /** Ambient ambiance color / gradient. */
  ambiance: string;
  /** Motion tier — controls AmbientBackground + framer-motion presets. */
  motionTier: ThemeMotionTier;
  /** Copy tone (FR) for AI-generated content. */
  copyTone: string;
  /** Section component overrides — replaces the default component per section type. */
  sectionOverrides: SectionOverride[];
  /** Preview swatch for the picker UI (Phase 4A Preview Lab). */
  preview: {
    bg: string;
    text: string;
    swatch: string[];
  };
}

// ─── Pattern generators (inline data URLs — same shape as theme-packages.ts) ──
// Kept local to this module so identity-presets is self-contained (no circular
// import with the rich aenws/theme-packages.ts file).

function pOrnamental(c: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><circle cx='30' cy='30' r='1.5' fill='${c}' opacity='0.18'/><circle cx='0' cy='0' r='1' fill='${c}' opacity='0.12'/><circle cx='60' cy='0' r='1' fill='${c}' opacity='0.12'/><circle cx='0' cy='60' r='1' fill='${c}' opacity='0.12'/><circle cx='60' cy='60' r='1' fill='${c}' opacity='0.12'/></svg>`,
  )}")`;
}

function pLeaves(c: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'><path d='M15 5 Q5 15 15 25 Q25 15 15 5' fill='${c}' opacity='0.1'/></svg>`,
  )}")`;
}

function pFilmGrain(): string {
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;
}

// ─── IDENTITY_PRESETS — the 5 curated identities ──────────────────────────────

/**
 * The 5 wedding identity presets. ADDITIVE to THEME_PRESETS — none of the 16
 * base presets are renamed or removed.
 *
 * Each entry's `basePresetSlug` is validated below against THEME_PRESETS so
 * a typo throws at module load (developer-time) rather than at first render.
 */
export const IDENTITY_PRESETS: IdentityPreset[] = [
  // ─── 1. Royal Luxury — navy + gold + Cormorant + candle-pattern ─────────────
  {
    id: 'royal-luxury',
    label: 'Royal Luxury',
    description:
      "Somptuosité navy et or, typographie Cormorant, motif ornemental. Héros cinématographique et galerie luxueuse à cadres dorés.",
    basePresetSlug: 'royal-gold',
    colors: {
      // royal-gold already ships gold #D4AF37 + navy #1a1a2e — keep them,
      // but force a deep navy surface for the candle-lit mood.
      surface: '#0a0a1e',
      surfaceDeep: '#050518',
      text: '#F5E6C8',
    },
    fonts: {
      display: 'Cormorant Garamond',
      body: 'Inter',
    },
    pattern: pOrnamental('#D4AF37'),
    ambiance:
      'radial-gradient(ellipse at top, rgba(212,175,55,0.12), transparent 60%), linear-gradient(180deg, #0a0a1e, #050518)',
    motionTier: 'elegant',
    copyTone: 'majestueux',
    sectionOverrides: [
      { sectionType: 'hero', component: 'CinematicHero' },
      { sectionType: 'gallery', component: 'LuxuryGallery' },
      { sectionType: 'countdown', component: 'LuxuryCountdown' },
    ],
    preview: {
      bg: '#0a0a1e',
      text: '#F5E6C8',
      swatch: ['#0a0a1e', '#D4AF37', '#1a1a2e', '#F5E6C8'],
    },
  },

  // ─── 2. Minimal Editorial — cream + charcoal + Playfair + no-pattern ───────
  {
    id: 'minimal-editorial',
    label: 'Minimal Editorial',
    description:
      "Crème et charbon, Playfair Display épuré, sans motif. Héros éditorial en split-layout pour une mise en page magazine.",
    basePresetSlug: 'pure-white',
    colors: {
      // pure-white ships charcoal #2C2C2C primary + #FFFFFF surface — override
      // the surface to a warm cream and the accent to a softer off-white.
      primary: '#1F1F1F',
      accent: '#E8E1D4',
      surface: '#FAF7F2',
      surfaceDeep: '#F0EBE0',
      text: '#1F1F1F',
    },
    fonts: {
      display: 'Playfair Display',
      body: 'Inter',
    },
    pattern: 'none',
    ambiance: 'linear-gradient(180deg, #FAF7F2, #F0EBE0)',
    motionTier: 'subtle',
    copyTone: 'épuré',
    sectionOverrides: [
      { sectionType: 'hero', component: 'EditorialHero' },
      // Gallery stays as PremiumGallery (clean grid) per audit spec.
    ],
    preview: {
      bg: '#FAF7F2',
      text: '#1F1F1F',
      swatch: ['#FAF7F2', '#1F1F1F', '#E8E1D4', '#A8A8A8'],
    },
  },

  // ─── 3. Botanical Romance — sage + blush + Cormorant + leaf-pattern ────────
  {
    id: 'botanical-romance',
    label: 'Botanical Romance',
    description:
      "Vert sauge et rose blush, Cormorant Garamond, motif de feuilles. Animations douces, héros à photographie soft-focus.",
    basePresetSlug: 'garden',
    colors: {
      // garden ships sage #558B2F primary + cream #FFF8E1 accent — soften the
      // green to a sage tone and shift the accent to a blush pink.
      primary: '#8FA68E',
      accent: '#F4D9D0',
      surface: '#F8F5EF',
      surfaceDeep: '#EFEAE0',
      text: '#3A4A3A',
    },
    fonts: {
      display: 'Cormorant Garamond',
      body: 'Lato',
    },
    pattern: pLeaves('#8FA68E'),
    ambiance:
      'radial-gradient(ellipse at top, rgba(143,166,142,0.10), transparent 60%), linear-gradient(180deg, #F8F5EF, #EFEAE0)',
    motionTier: 'subtle',
    copyTone: 'tendrement',
    sectionOverrides: [
      // Botanical Romance keeps HeroSection (soft variant) per audit spec —
      // no hero override. The identity mostly recolors via the theme tokens.
      { sectionType: 'gallery', component: 'LuxuryGallery' },
    ],
    preview: {
      bg: '#F8F5EF',
      text: '#3A4A3A',
      swatch: ['#8FA68E', '#F4D9D0', '#F8F5EF', '#3A4A3A'],
    },
  },

  // ─── 4. Cinematic Dark — black + gold + Playfair + film-grain ──────────────
  {
    id: 'cinematic-dark',
    label: 'Cinematic Dark',
    description:
      "Noir profond et or éclatant, Playfair Display, grain de film. Héros cinématographique plein écran et galerie immersive en plein écran.",
    basePresetSlug: 'royal-black',
    colors: {
      // royal-black ships gold #C9A961 + black #0a0a0a — keep them, force a
      // true black surface for maximum cinematic contrast.
      surface: '#000000',
      surfaceDeep: '#050505',
      text: '#F0E6D0',
    },
    fonts: {
      display: 'Playfair Display',
      body: 'Montserrat',
    },
    pattern: pFilmGrain(),
    ambiance:
      'radial-gradient(ellipse at center, rgba(201,169,97,0.08), transparent 70%), linear-gradient(180deg, #000000, #050505)',
    motionTier: 'cinematic',
    copyTone: 'cinématique',
    sectionOverrides: [
      { sectionType: 'hero', component: 'CinematicHero' },
      { sectionType: 'gallery', component: 'ImmersiveGallery' },
      { sectionType: 'countdown', component: 'LuxuryCountdown' },
    ],
    preview: {
      bg: '#000000',
      text: '#F0E6D0',
      swatch: ['#000000', '#C9A961', '#1a1a1a', '#F0E6D0'],
    },
  },

  // ─── 5. Modern Champagne — champagne + bronze + Geist Sans + no-pattern ────
  {
    id: 'modern-champagne',
    label: 'Modern Champagne',
    description:
      "Champagne et bronze, Geist Sans moderne, sans motif. Héros éditorial épuré pour une esthétique contemporaine et chaleureuse.",
    basePresetSlug: 'elegant-beige',
    colors: {
      // elegant-beige ships brown #5C4033 + beige #D4C5B0 — shift primary to
      // bronze, accent to champagne, surface to a warm champagne cream.
      primary: '#A8743D',
      accent: '#D9C3A1',
      surface: '#F5EDE0',
      surfaceDeep: '#E8DDC8',
      text: '#3A2E22',
    },
    fonts: {
      display: 'Playfair Display',
      body: 'Geist Sans',
    },
    pattern: 'none',
    ambiance:
      'radial-gradient(ellipse at top, rgba(168,116,61,0.06), transparent 60%), linear-gradient(180deg, #F5EDE0, #E8DDC8)',
    motionTier: 'subtle',
    copyTone: 'chaleureux',
    sectionOverrides: [
      { sectionType: 'hero', component: 'EditorialHero' },
    ],
    preview: {
      bg: '#F5EDE0',
      text: '#3A2E22',
      swatch: ['#A8743D', '#D9C3A1', '#F5EDE0', '#3A2E22'],
    },
  },
];

// ─── Validation — fail fast at module load if a base preset is missing ────────
// A typo in `basePresetSlug` would otherwise silently fall back to defaults at
// first render. Validating here surfaces the issue at dev-time import.

for (const identity of IDENTITY_PRESETS) {
  const base = getThemePreset(identity.basePresetSlug);
  if (!base) {
    throw new Error(
      `[identity-presets] L'identité "${identity.id}" référence un preset de base inconnu "${identity.basePresetSlug}". ` +
        `Slugs disponibles: ${THEME_PRESETS.map((p) => p.slug).join(', ')}.`,
    );
  }
}

// ─── Accessors ────────────────────────────────────────────────────────────────

/**
 * Récupère un IdentityPreset par son id.
 * @returns l'IdentityPreset ou `undefined` si l'id n'existe pas.
 */
export function getIdentityPreset(id: WeddingIdentity): IdentityPreset | undefined {
  return IDENTITY_PRESETS.find((p) => p.id === id);
}

/**
 * Vérifie qu'une chaîne est un identifiant d'identité valide.
 * Utile pour valider l'entrée utilisateur (themeConfig.identity) avant lookup.
 */
export function isWeddingIdentity(value: unknown): value is WeddingIdentity {
  return (
    typeof value === 'string' &&
    IDENTITY_PRESETS.some((p) => p.id === value)
  );
}

// ─── ThemePreset merger ───────────────────────────────────────────────────────

/**
 * Fusionne un IdentityPreset avec son ThemePreset de base pour produire un
 * ThemePreset final consumable par ThemeInjector (Phase 1A) et le pipeline
 * de thème existant.
 *
 * Règles de merge:
 *   - `slug` / `id` / `category` / `tier` / `layout` / `sections` / `invitation`
 *     / `demo` / `features` viennent du preset de base (l'identité ne crée pas
 *     un nouveau slug — elle est une surcouche).
 *   - `label` / `identity` / `description` viennent de l'IdentityPreset (plus
 *     spécifique que le preset de base).
 *   - `primaryColor` / `accentColor` / `surface` / `surfaceDeep` / `text` sont
 *     surchargés par `identity.colors` si présents, sinon hérités du base.
 *   - `primaryLight` / `primaryDark` / `accentLight` / `textMuted` sont hérités
 *     du base (l'identité ne les redéfinit pas — laissons le preset source
 *     fournir les variants ombrés).
 *   - `fontDisplay` / `fontBody` sont surchargés par `identity.fonts` si présents.
 *   - `pattern` / `ambiance` / `motionTier` / `copyTone` viennent toujours de
 *     l'IdentityPreset (toujours définis, plus spécifiques que le base).
 *   - `preview` vient de l'IdentityPreset (curated pour le picker UI).
 *
 * @example
 *   const identity = getIdentityPreset('royal-luxury')!;
 *   const theme = identityPresetToThemePreset(identity);
 *   // → ThemePreset prête à être injectée par ThemeInjector
 */
export function identityPresetToThemePreset(identity: IdentityPreset): ThemePreset {
  const base = getThemePreset(identity.basePresetSlug);
  if (!base) {
    // Déjà validé au chargement du module, mais TypeScript ne le sait pas.
    throw new Error(
      `[identity-presets] Preset de base introuvable pour l'identité "${identity.id}" (slug "${identity.basePresetSlug}").`,
    );
  }

  return {
    ...base,
    // ─── Champs surchargés par l'identité ─────────────────────────────────
    label: identity.label,
    identity: identity.label,
    description: identity.description,
    primaryColor: identity.colors?.primary ?? base.primaryColor,
    accentColor: identity.colors?.accent ?? base.accentColor,
    surface: identity.colors?.surface ?? base.surface,
    surfaceDeep: identity.colors?.surfaceDeep ?? base.surfaceDeep,
    text: identity.colors?.text ?? base.text,
    fontDisplay: identity.fonts?.display ?? base.fontDisplay,
    fontBody: identity.fonts?.body ?? base.fontBody,
    pattern: identity.pattern,
    ambiance: identity.ambiance,
    motionTier: identity.motionTier,
    copyTone: identity.copyTone,
    preview: identity.preview,
    // slug / id / category / tier / layout / sections / invitation / demo /
    // features / primaryLight / primaryDark / accentLight / textMuted sont
    // hérités du base via le spread ...base ci-dessus.
  };
}

// ─── Section override lookup ──────────────────────────────────────────────────

/**
 * Cherche le composant à utiliser pour un type de section donné dans une
 * identité. Retourne `undefined` si aucune surcharge n'est définie (le
 * composant par défaut du SectionRenderer doit alors être utilisé).
 *
 * @example
 *   const heroComponent = getSectionOverride(identity, 'hero');
 *   // → 'CinematicHero' pour royal-luxury, undefined pour botanical-romance
 */
export function getSectionOverride(
  identity: IdentityPreset,
  sectionType: string,
): SectionComponent | undefined {
  return identity.sectionOverrides.find((o) => o.sectionType === sectionType)?.component;
}
