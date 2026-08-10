// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED THEME PRESET REGISTRY — Phase 1B (MISSION 5.9.0 §20.3 1B)
// ══════════════════════════════════════════════════════════════════════════════
//
// Fusionne les deux systèmes de thème parallèles préexistants :
//   1. `src/lib/themes/templates.ts`        → THEME_TEMPLATES (4 entrées simples)
//   2. `src/lib/aenws/theme-packages.ts`    → THEME_PACKAGES (12 entrées riches)
//
// THEME_PRESETS est désormais la SOURCE DE VÉRITÉ unique. Les deux anciens
// fichiers ré-exportent ce registre via leurs adaptateurs (Phase 1B) sans
// casser les consommateurs existants (ThemeCustomizer, ThemeTheater).
//
// Contrainte dorée de non-régression : aucun export ancien n'est supprimé.
// Les adaptateurs `themePresetToTemplate` / `themePresetToPackage` garantissent
// la compatibilité ascendante pendant la migration progressive des consommateurs.
//
// Note sur la dépendance circulaire : `presets.ts` importe `THEME_PACKAGES`
// (runtime). Le fichier `templates.ts` NE ré-exporte PAS `THEME_PRESETS`
// (les ré-exports initialement ajoutés en Phase 1B créaient un cycle →
// ReferenceError au runtime Next.js). Le registre unifié `THEME_PRESETS`
// est disponible UNIQUEMENT via `@/lib/themes/presets` — les consommateurs
// qui veulent le registre unifié l'importent directement depuis ce chemin.
//
// ─── P4-2 (MISSION 5.9.1) — Legacy ThemeTemplates removed ────────────────────
// The 4 legacy ThemeTemplate entries (classic-gold, romantic-rose,
// minimal-modern, royal-night) were migrated to PlatformTheme DB rows in
// P1-2 and the `THEME_TEMPLATES` array in `./templates` is now EMPTY. This
// file previously appended 4 `templateToPreset(THEME_TEMPLATES.find(...))`
// entries to `THEME_PRESETS` — those calls would now receive `undefined`
// (because the array is empty) and crash at module load (accessing
// `undefined.id` throws TypeError). The 4 broken calls have been REMOVED —
// `THEME_PRESETS` now contains only the 12 THEME_PACKAGES-derived entries.
// The 4 migrated themes remain accessible at runtime via the DB-backed
// registry (`src/lib/themes/registry.ts`) or directly via
// `db.platformTheme.findUnique({ where: { slug } })`.
//
// The `templateToPreset` helper is KEPT (unused, but reserved for future
// in-code template re-introduction). The runtime import of `THEME_TEMPLATES`
// from `./templates` has been removed; only the TYPE-only import of
// `ThemeTemplate` remains (still referenced by `themePresetToTemplate`).
// ══════════════════════════════════════════════════════════════════════════════

import type {
  ThemePackage,
  ThemeIdentity,
  ThemeSection,
  ThemeInvitation,
  DemoCouple,
} from '@/lib/aenws/theme-system';
// P4-2: TYPE-only import — `themePresetToTemplate` still references the
// `ThemeTemplate` type. The RUNTIME import of `THEME_TEMPLATES` has been
// removed because the array is now empty (the 4 entries were migrated to
// PlatformTheme DB rows in P1-2). See the file-level comment above.
import type { ThemeTemplate } from './templates';
import { THEME_PACKAGES } from '@/lib/aenws/theme-packages';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeCategory = 'LUXURY' | 'CLASSIC' | 'AFRICAN' | 'MINIMAL' | 'DESTINATION';
export type ThemeTier = 'FREE' | 'PREMIUM' | 'EXCLUSIVE';
export type ThemeMotionTier = 'subtle' | 'elegant' | 'cinematic' | 'none';

/**
 * ThemePreset — forme unifiée produite par la fusion Phase 1B.
 *
 * Regroupe en une seule interface :
 *   - les champs simples de l'ancien `ThemeTemplate` (primaryColor, accentColor,
 *     fontDisplay, fontBody, layout, preview)
 *   - les champs riches de l'ancien `ThemePackage` (sections, invitation,
 *     demo, features)
 *
 * Les champs riches (`sections`, `invitation`, `demo`) sont typés `unknown`
 * pour éviter une dépendance de type circulaire avec `theme-system.ts` et
 * préserver la compatibilité ascendante. Les adaptateurs
 * `themePresetToTemplate` et `themePresetToPackage` restaurent le typage fort
 * au moment de la consommation.
 */
export interface ThemePreset {
  id: string;
  slug: string;
  label: string;
  /** Identité marketing courte : 'Royal Luxury' | 'Minimal Editorial' | etc. */
  identity: string;
  category: ThemeCategory;
  tier: ThemeTier;
  description: string;
  // ─── Colors ────────────────────────────────────────────────────────────────
  primaryColor: string;
  accentColor: string;
  primaryLight?: string;
  primaryDark?: string;
  accentLight?: string;
  surface?: string;
  surfaceDeep?: string;
  text?: string;
  textMuted?: string;
  // ─── Typography ────────────────────────────────────────────────────────────
  fontDisplay: string;
  fontBody: string;
  // ─── Layout ────────────────────────────────────────────────────────────────
  /** 'classic' | 'modern' | 'minimalist' | 'royal' | 'minimal' | 'destination' */
  layout: string;
  // ─── Premium identity fields (from ThemePackage) ───────────────────────────
  /** URL de motif CSS ou 'none'. */
  pattern?: string;
  /** Couleur / gradient d'ambiance. */
  ambiance?: string;
  motionTier?: ThemeMotionTier;
  /** Ton de voix éditorial (FR). */
  copyTone?: string;
  // ─── Preview ───────────────────────────────────────────────────────────────
  preview: {
    bg: string;
    text: string;
    swatch: string[];
  };
  // ─── Optional rich fields (from ThemePackage, for showcase) ─────────────────
  /** ThemeSection[] — gardé en `unknown` pour compat ascendante. */
  sections?: unknown;
  /** ThemeInvitation. */
  invitation?: unknown;
  /** DemoCouple. */
  demo?: unknown;
  features?: string[];
}

// ─── Helpers de mapping (règles Phase 1B §20.3 1B) ────────────────────────────

/** Map une catégorie vers un slug de layout (règle de dérivation Phase 1B). */
function layoutForCategory(category: ThemeCategory): string {
  switch (category) {
    case 'LUXURY': return 'royal';
    case 'CLASSIC': return 'classic';
    case 'MINIMAL': return 'minimalist';
    case 'AFRICAN': return 'modern';
    case 'DESTINATION': return 'destination';
    default: return 'classic';
  }
}

/**
 * Dérive le motion tier depuis la catégorie et le tier.
 * Règle Phase 1B : 'elegant' pour LUXURY ou EXCLUSIVE, 'subtle' sinon.
 */
function motionTierFor(category: ThemeCategory, tier: ThemeTier): ThemeMotionTier {
  if (category === 'LUXURY' || tier === 'EXCLUSIVE') return 'elegant';
  return 'subtle';
}

/** Dérive le ton de voix éditorial (FR) depuis la catégorie (règle Phase 1B). */
function copyToneFor(category: ThemeCategory): string {
  switch (category) {
    case 'LUXURY': return 'élégant';
    case 'AFRICAN': return 'chaleureux';
    case 'MINIMAL': return 'épuré';
    case 'DESTINATION': return 'décontracté';
    case 'CLASSIC': return 'classique';
    default: return 'classique';
  }
}

/** Construit un objet `preview` depuis une `ThemeIdentity` riche. */
function previewFromIdentity(i: ThemeIdentity): { bg: string; text: string; swatch: string[] } {
  return {
    bg: i.surfaceDeep,
    text: i.text,
    swatch: [i.primary, i.accent, i.primaryDark, i.text],
  };
}

/** Construit une URL Google Fonts depuis les familles display + body. */
function googleFontUrlFor(display: string, body: string): string {
  const encode = (family: string) => family.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${encode(display)}:wght@400;700&family=${encode(body)}:wght@300;400;500&display=swap`;
}

// ─── Convertisseurs anciens → nouveau ─────────────────────────────────────────

/** Convertit un ThemePackage riche en ThemePreset unifié. */
function packageToPreset(pkg: ThemePackage): ThemePreset {
  return {
    id: pkg.slug,
    slug: pkg.slug,
    label: pkg.name,
    identity: pkg.name,
    category: pkg.category,
    tier: pkg.tier,
    description: pkg.description,
    primaryColor: pkg.identity.primary,
    accentColor: pkg.identity.accent,
    primaryLight: pkg.identity.primaryLight,
    primaryDark: pkg.identity.primaryDark,
    accentLight: pkg.identity.accentLight,
    surface: pkg.identity.surface,
    surfaceDeep: pkg.identity.surfaceDeep,
    text: pkg.identity.text,
    textMuted: pkg.identity.textMuted,
    fontDisplay: pkg.identity.fontDisplay,
    fontBody: pkg.identity.fontBody,
    layout: layoutForCategory(pkg.category),
    pattern: pkg.identity.pattern,
    ambiance: pkg.identity.ambiance,
    motionTier: motionTierFor(pkg.category, pkg.tier),
    copyTone: copyToneFor(pkg.category),
    preview: previewFromIdentity(pkg.identity),
    sections: pkg.sections,
    invitation: pkg.invitation,
    demo: pkg.demo,
    features: pkg.features,
  };
}

/**
 * Convertit un ThemeTemplate simple en ThemePreset unifié.
 *
 * P4-2 (MISSION 5.9.1): currently UNUSED — the 4 legacy ThemeTemplate entries
 * were migrated to PlatformTheme DB rows in P1-2 and the `THEME_TEMPLATES`
 * array in `./templates` is now empty. The function is KEPT so a future
 * in-code template can be re-introduced without rewriting this module (just
 * append `templateToPreset(...)` calls back to `THEME_PRESETS` below).
 */
function templateToPreset(
  template: ThemeTemplate,
  category: ThemeCategory,
  tier: ThemeTier,
): ThemePreset {
  return {
    id: template.id,
    slug: template.id,
    label: template.name,
    identity: template.name,
    category,
    tier,
    description: template.description,
    primaryColor: template.primaryColor,
    accentColor: template.accentColor,
    fontDisplay: template.fontDisplay,
    fontBody: template.fontBody,
    layout: template.layout,
    motionTier: 'subtle',
    preview: template.preview,
  };
}

// ─── THEME_PRESETS — Registre unifié (source de vérité) ───────────────────────

/**
 * Registre unifié des thèmes. Source de vérité unique à partir de Phase 1B.
 *
 * Construit en fusionnant :
 *   - les 12 ThemePackage riches (sections + invitation + demo + features) :
 *     royal-gold, royal-black, sapphire-noir, congo-prestige, kente,
 *     white-romance, elegant-beige, pure-white, nordic, beach, garden, sunset
 *
 * Total post-P4-2 : 12 entrées (les 4 ThemeTemplate-derived entries ont été
 * retirées — elles étaient dérivées de `THEME_TEMPLATES` qui est désormais vide
 * suite à la migration P1-2 des 4 templates vers PlatformTheme DB rows).
 *
 * P4-2 (MISSION 5.9.1) : les 4 entrées
 *   `templateToPreset(THEME_TEMPLATES.find(t => t.id === 'classic-gold') as ThemeTemplate, ...)`
 * ont été supprimées — `THEME_TEMPLATES.find(...)` aurait retourné `undefined`
 * (le tableau est vide), ce qui aurait fait crasher `templateToPreset` au
 * chargement du module (TypeError sur `undefined.id`).
 */
export const THEME_PRESETS: ThemePreset[] = [
  // ─── 12 presets issus de THEME_PACKAGES (riches) ───────────────────────────
  ...THEME_PACKAGES.map(packageToPreset),

  // ─── P4-2 (MISSION 5.9.1): 4 ThemeTemplate-derived presets REMOVED ────────
  // The 4 legacy entries (classic-gold, romantic-rose, minimal-modern,
  // royal-night) were migrated to PlatformTheme DB rows in P1-2. They remain
  // accessible at runtime via `src/lib/themes/registry.ts`
  // (listPlatformThemes / getPlatformThemeBySlug) or directly via
  // `db.platformTheme.findUnique({ where: { slug } })`.
];

// ─── Accessors ────────────────────────────────────────────────────────────────

/** Récupère un ThemePreset par son slug. */
export function getThemePreset(slug: string): ThemePreset | undefined {
  return THEME_PRESETS.find(p => p.slug === slug);
}

// ─── Adaptateurs de rétro-compatibilité ───────────────────────────────────────

/**
 * Convertit un ThemePreset unifié en ThemeTemplate simple (legacy).
 * Utilisé par `ThemeCustomizer` tant qu'il n'a pas migré vers ThemePreset.
 *
 * Note : `preset.layout` est plus large que `ThemeTemplate.layout` (le premier
 * accepte 'destination' et 'minimal' ; le second est restreint à 4 slugs).
 * On mappe tout layout hors-union vers 'classic' comme défaut défensif.
 */
export function themePresetToTemplate(preset: ThemePreset): ThemeTemplate {
  const allowedLayouts: ReadonlyArray<ThemeTemplate['layout']> = [
    'classic',
    'modern',
    'minimalist',
    'royal',
  ];
  const layout: ThemeTemplate['layout'] = (
    allowedLayouts as readonly string[]
  ).includes(preset.layout)
    ? (preset.layout as ThemeTemplate['layout'])
    : 'classic';
  return {
    id: preset.id,
    name: preset.label,
    description: preset.description,
    primaryColor: preset.primaryColor,
    accentColor: preset.accentColor,
    fontDisplay: preset.fontDisplay,
    fontBody: preset.fontBody,
    layout,
    preview: preset.preview,
  };
}

// ─── Valeurs par défaut pour les champs riches manquants ──────────────────────
// Utilisées par `themePresetToPackage` quand le preset ne ship pas les champs
// riches (i.e. presets dérivés de THEME_TEMPLATES plutôt que THEME_PACKAGES).

const DEFAULT_SECTIONS: ThemeSection[] = [
  { id: 'hero', type: 'hero', variant: 'minimal-center', enabled: true, order: 0 },
  { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
  { id: 'gallery', type: 'gallery', variant: 'masonry', enabled: true, order: 2 },
  { id: 'timeline', type: 'timeline', variant: 'alternating', enabled: true, order: 3 },
  { id: 'guest-auth', type: 'guest-auth', variant: 'minimal-form', enabled: true, order: 4 },
];

const DEFAULT_INVITATION: ThemeInvitation = {
  template: 'classic-card',
  rsvpStyle: 'inline-form',
  qrStyle: 'minimal-monochrome',
  shareStyle: 'social-cards',
};

const DEFAULT_DEMO: DemoCouple = {
  groomName: 'Alexandre',
  brideName: 'Céleste',
  groomInitial: 'A',
  brideInitial: 'C',
  weddingDate: 'Samedi 12 Septembre 2026',
  weddingDateShort: '12.09.2026',
  venue: 'Château de Lumière',
  venueCity: 'Versailles, France',
  venueAddress: '1 Avenue du Crépuscule, 78000',
  hashtag: '#AlexandreEtCéleste',
  heroImage: '/aenws/themes/classic-gold.png',
  story: [],
  timeline: [],
  gallery: [],
};

const DEFAULT_FEATURES: string[] = ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'];

/**
 * Convertit un ThemePreset unifié en ThemePackage riche (legacy).
 * Utilisé par `ThemeTheater` tant qu'il n'a pas migré vers ThemePreset.
 *
 * Les presets dérivés de `THEME_PACKAGES` portent leurs champs riches d'origine
 * (sections, invitation, demo, features). Les presets dérivés de
 * `THEME_TEMPLATES` retombent sur des valeurs par défaut sensées.
 *
 * Les champs `displayWeight`, `bodyWeight`, `googleFontUrl` (qui n'existent pas
 * dans `ThemePreset`) sont reconstruits : poids par défaut '700'/'400', URL
 * Google Fonts dérivée des familles display + body.
 */
export function themePresetToPackage(preset: ThemePreset): ThemePackage {
  const sections = (preset.sections as ThemePackage['sections'] | undefined) ?? DEFAULT_SECTIONS;
  const invitation = (preset.invitation as ThemePackage['invitation'] | undefined) ?? DEFAULT_INVITATION;
  const demo = (preset.demo as ThemePackage['demo'] | undefined) ?? DEFAULT_DEMO;
  const features = preset.features ?? DEFAULT_FEATURES;

  const identity: ThemeIdentity = {
    primary: preset.primaryColor,
    primaryLight: preset.primaryLight ?? preset.primaryColor,
    primaryDark: preset.primaryDark ?? preset.primaryColor,
    accent: preset.accentColor,
    accentLight: preset.accentLight ?? preset.accentColor,
    surface: preset.surface ?? '#ffffff',
    surfaceDeep: preset.surfaceDeep ?? '#f5f5f5',
    text: preset.text ?? '#1a1a1a',
    textMuted: preset.textMuted ?? '#6b6b6b',
    fontDisplay: preset.fontDisplay,
    fontBody: preset.fontBody,
    displayWeight: '700',
    bodyWeight: '400',
    pattern: preset.pattern ?? 'none',
    ambiance:
      preset.ambiance ??
      `linear-gradient(180deg, ${preset.surface ?? '#ffffff'}, ${preset.surfaceDeep ?? '#f5f5f5'})`,
    googleFontUrl: googleFontUrlFor(preset.fontDisplay, preset.fontBody),
  };

  return {
    slug: preset.slug,
    name: preset.label,
    category: preset.category,
    tier: preset.tier,
    description: preset.description,
    identity,
    sections,
    invitation,
    demo,
    features,
  };
}

// ─── Migration helper ─────────────────────────────────────────────────────────

/**
 * Migre un blob JSON `themeConfig` legacy (depuis Wedding.themeConfig ou
 * Settings) vers un slug de ThemePreset unifié. Retourne le slug correspondant
 * le mieux. Utilisé à la lecture pour migrer progressivement les mariages
 * existants.
 */
export function migrateThemeConfig(themeConfig: Record<string, unknown> | null): string {
  if (!themeConfig) return 'classic-gold';
  const slug = themeConfig.themePresetSlug as string | undefined;
  if (slug && getThemePreset(slug)) return slug;
  // Essai de correspondance par primaryColor
  const primary = themeConfig.primaryColor as string | undefined;
  if (primary) {
    const match = THEME_PRESETS.find(
      p => p.primaryColor.toLowerCase() === primary.toLowerCase(),
    );
    if (match) return match.slug;
  }
  // P4-2: 'classic-gold' is no longer in THEME_PRESETS (the 4 legacy entries
  // were migrated to PlatformTheme DB rows in P1-2). The string is kept as
  // the fallback slug so callers that store the slug in their config continue
  // to round-trip — but the actual theme lookup must go through the DB-backed
  // registry (src/lib/themes/registry.ts) which DOES have the row.
  return 'classic-gold';
}
