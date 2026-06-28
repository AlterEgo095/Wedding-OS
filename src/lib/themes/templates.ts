// ══════════════════════════════════════════════════════════════════════════════
// Theme Templates — Phase 8 Themes & Customization
// ══════════════════════════════════════════════════════════════════════════════
//
// 4 predefined theme templates that couples can apply with one click.
// Each template defines: primaryColor, accentColor, fontDisplay, fontBody, layout.
// Custom themes can be created by modifying any of these values via the API.

export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: 'classic' | 'modern' | 'minimalist' | 'royal';
  preview: {
    bg: string;
    text: string;
    swatch: string[];
  };
}

export interface FontOption {
  family: string;
  label: string;
  category: 'serif' | 'sans-serif' | 'display';
  googleFontUrl: string;
}

export interface LayoutOption {
  id: 'classic' | 'modern' | 'minimalist' | 'royal';
  label: string;
  description: string;
}

// ─── Font Options (Google Fonts) ──────────────────────────────────────────────

export const FONT_OPTIONS: FontOption[] = [
  {
    family: 'Cormorant Garamond',
    label: 'Cormorant Garamond',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
  },
  {
    family: 'Playfair Display',
    label: 'Playfair Display',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&display=swap',
  },
  {
    family: 'Marcellus',
    label: 'Marcellus',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Marcellus&display=swap',
  },
  {
    family: 'Lora',
    label: 'Lora',
    category: 'serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap',
  },
  {
    family: 'Inter',
    label: 'Inter',
    category: 'sans-serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  },
  {
    family: 'Lato',
    label: 'Lato',
    category: 'sans-serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap',
  },
  {
    family: 'Montserrat',
    label: 'Montserrat',
    category: 'sans-serif',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap',
  },
  {
    family: 'Italiana',
    label: 'Italiana',
    category: 'display',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Italiana&display=swap',
  },
];

// ─── Layout Options ───────────────────────────────────────────────────────────

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: 'classic', label: 'Classique', description: 'Sections élégantes traditionnelles avec heros centrés' },
  { id: 'modern', label: 'Moderne', description: 'Mises en page asymétriques avec transitions fluides' },
  { id: 'minimalist', label: 'Minimaliste', description: 'Épuré, beaucoup d’espace blanc, typographie fine' },
  { id: 'royal', label: 'Royal', description: 'Ornementé, dorures, ambiance cérémonielle somptueuse' },
];

// ─── 4 Theme Templates ────────────────────────────────────────────────────────

export const THEME_TEMPLATES: ThemeTemplate[] = [
  {
    id: 'classic-gold',
    name: 'Or Classique',
    description: 'L’élégance intemporelle de l’or et du champagne — la signature Heureux Mariage.',
    primaryColor: '#D4A853',
    accentColor: '#C8785A',
    fontDisplay: 'Cormorant Garamond',
    fontBody: 'Inter',
    layout: 'classic',
    preview: {
      bg: '#1a1410',
      text: '#F5E6D3',
      swatch: ['#D4A853', '#C8785A', '#8B6F47', '#F5E6D3'],
    },
  },
  {
    id: 'romantic-rose',
    name: 'Rose Romantique',
    description: 'Tendresse et poésie pour une célébration tout en douceur et romantisme.',
    primaryColor: '#E8B4B8',
    accentColor: '#C08497',
    fontDisplay: 'Playfair Display',
    fontBody: 'Lato',
    layout: 'modern',
    preview: {
      bg: '#2a1a1e',
      text: '#FBE5E7',
      swatch: ['#E8B4B8', '#C08497', '#8B5A6B', '#FBE5E7'],
    },
  },
  {
    id: 'minimal-modern',
    name: 'Minimal Moderne',
    description: 'Lignes pures, gris contemporains — pour les couples au goût épuré et moderne.',
    primaryColor: '#525252',
    accentColor: '#A3A3A3',
    fontDisplay: 'Marcellus',
    fontBody: 'Montserrat',
    layout: 'minimalist',
    preview: {
      bg: '#1c1c1c',
      text: '#E5E5E5',
      swatch: ['#525252', '#A3A3A3', '#262626', '#E5E5E5'],
    },
  },
  {
    id: 'royal-night',
    name: 'Nuit Royale',
    description: 'Sombre et somptueux, l’or étincelant sur fond nuit pour une allure majestueuse.',
    primaryColor: '#C9A14A',
    accentColor: '#1B1B3A',
    fontDisplay: 'Italiana',
    fontBody: 'Lora',
    layout: 'royal',
    preview: {
      bg: '#0f0f1e',
      text: '#E5C97B',
      swatch: ['#C9A14A', '#1B1B3A', '#3D2E5F', '#E5C97B'],
    },
  },
];

// ─── Default Theme ────────────────────────────────────────────────────────────

export const DEFAULT_THEME = {
  primaryColor: '#D4A853',
  accentColor: '#C8785A',
  fontDisplay: 'Cormorant Garamond',
  fontBody: 'Inter',
  layout: 'classic' as const,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTemplate(id: string): ThemeTemplate | undefined {
  return THEME_TEMPLATES.find(t => t.id === id);
}

export function getFontOption(family: string): FontOption | undefined {
  return FONT_OPTIONS.find(f => f.family === family);
}

export function getLayoutOption(id: string): LayoutOption | undefined {
  return LAYOUT_OPTIONS.find(l => l.id === id);
}

/**
 * Validate a hex color string (#RRGGBB or #RGB).
 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

/**
 * Normalize a hex color to #RRGGBB format.
 */
export function normalizeHexColor(color: string): string {
  const trimmed = color.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return '#D4A853';
}
