// ══════════════════════════════════════════════════════════════════════════════
// THEME ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the Theme Engine.
// Manages: colors, typographies, palettes, layout variants, effects, animations.
//
// The current implementation stores theme data in the `Theme` Prisma model
// and injects CSS variables via ThemeInjector.tsx. The future Theme Engine
// will expand this to: per-section theming, animation presets, button styles,
// icon sets, background patterns, and light effects.
//
// Penpot integration (Phase 8 prep) will feed design tokens into this engine.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A complete theme definition for a wedding.
 * Maps to the `Theme` Prisma model + the `customizations` JSON column.
 */
export interface ThemeEntity {
  id: string;
  weddingId: string;
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: ThemeLayout;
  customizations: ThemeCustomizations;
  createdAt: Date;
  updatedAt: Date;
}

export type ThemeLayout = 'classic' | 'modern' | 'minimalist' | 'royal';

export interface ThemeCustomizations {
  heroStyle?: 'cinematic' | 'split' | 'fullbleed' | 'minimal';
  animationIntensity?: 'ultra' | 'high' | 'medium' | 'low' | 'minimal';
  buttonStyle?: 'gold' | 'outline' | 'glass' | 'solid';
  iconSet?: 'lucide' | 'floral' | 'geometric' | 'classic';
  backgroundPattern?: 'none' | 'paper' | 'floral' | 'geometric' | 'gradient';
  lightEffects?: {
    starSky: boolean;
    goldenDust: boolean;
    sparkles: boolean;
    halos: boolean;
    breathing: boolean;
  };
  sectionThemes?: {
    hero?: SectionTheme;
    invitation?: SectionTheme;
    gallery?: SectionTheme;
    footer?: SectionTheme;
    program?: SectionTheme;
  };
}

export interface SectionTheme {
  primaryColor?: string;
  accentColor?: string;
  background?: string;
  fontDisplay?: string;
  animationIntensity?: 'ultra' | 'high' | 'medium' | 'low' | 'minimal';
}

/**
 * A theme template — a pre-built theme that can be applied to a wedding.
 * Managed by the Marketplace Engine in the future.
 */
export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  preview: string; // image URL or gradient CSS
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: ThemeLayout;
  customizations: Partial<ThemeCustomizations>;
  tags: string[];
  isPremium: boolean;
}

/**
 * CSS variables that the ThemeInjector emits.
 * These MUST be consumed by the Tailwind `@theme inline` block in globals.css.
 */
export interface ThemeCssVariables {
  '--theme-primary': string;
  '--theme-accent': string;
  '--theme-font-display': string;
  '--theme-font-body': string;
}

/**
 * Theme Engine interface — future implementation.
 */
export interface IThemeEngine {
  getTheme(weddingId: string): Promise<ThemeEntity | null>;
  updateTheme(weddingId: string, patch: Partial<ThemeEntity>): Promise<ThemeEntity>;
  applyTemplate(weddingId: string, templateId: string): Promise<ThemeEntity>;
  listTemplates(filter?: { premium?: boolean }): Promise<ThemeTemplate[]>;
  toCssVariables(theme: ThemeEntity): ThemeCssVariables;
}

/**
 * Penpot integration interface (Phase 8 prep).
 * Defines how design tokens flow from Penpot into the Theme Engine.
 */
export interface IPenpotThemeBridge {
  importTokens(penpotFileId: string): Promise<Partial<ThemeEntity>>;
  exportTokens(theme: ThemeEntity): Promise<Record<string, unknown>>;
}
