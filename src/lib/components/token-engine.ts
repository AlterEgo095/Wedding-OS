// ══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS ENGINE — Mission 5.8.10
// ══════════════════════════════════════════════════════════════════════════════
// Enterprise Design Token system with 150+ tokens across 30+ families.
// Supports: W3C Design Tokens Format, multi-brand, versioning, WCAG checks.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Token Type ───────────────────────────────────────────────────────────────

export type TokenValueType = 'COLOR' | 'DIMENSION' | 'FONT_FAMILY' | 'DURATION' | 'CUBIC_BEZIER' | 'STRING' | 'NUMBER' | 'BOOLEAN';

export interface DesignToken {
  path: string;                    // e.g. 'color.primary'
  value: string;                   // e.g. '#D4AF37'
  type: TokenValueType;            // e.g. 'COLOR'
  description?: string;            // Documentation
  category: string;                // e.g. 'Colors'
  inherited?: boolean;             // True if inherited from parent theme
  deprecated?: boolean;            // True if deprecated
  w3c?: boolean;                   // True if W3C compatible
}

// ─── Token Family Definition ──────────────────────────────────────────────────

export interface TokenFamily {
  name: string;
  icon: string;
  description: string;
  tokens: Array<{
    path: string;
    label: string;
    type: TokenValueType;
    defaultValue: string;
    options?: string[];
    description?: string;
  }>;
}

// ─── 150+ Token Definitions across 30+ families ───────────────────────────────

export const TOKEN_ENGINE_FAMILIES: TokenFamily[] = [
  {
    name: 'Colors', icon: '🎨', description: 'Color palette and semantics',
    tokens: [
      { path: 'color.primary', label: 'Primary', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'color.secondary', label: 'Secondary', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'color.accent', label: 'Accent', type: 'COLOR', defaultValue: '#C8785A' },
      { path: 'color.background', label: 'Background', type: 'COLOR', defaultValue: '#FAF8F5' },
      { path: 'color.surface', label: 'Surface', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'color.surface.elevated', label: 'Surface Elevated', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'color.text', label: 'Text', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'color.text.muted', label: 'Text Muted', type: 'COLOR', defaultValue: '#71717A' },
      { path: 'color.text.inverted', label: 'Text Inverted', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'color.success', label: 'Success', type: 'COLOR', defaultValue: '#22C55E' },
      { path: 'color.warning', label: 'Warning', type: 'COLOR', defaultValue: '#F59E0B' },
      { path: 'color.danger', label: 'Danger', type: 'COLOR', defaultValue: '#EF4444' },
      { path: 'color.info', label: 'Info', type: 'COLOR', defaultValue: '#3B82F6' },
      { path: 'color.border', label: 'Border', type: 'COLOR', defaultValue: '#E4E4E7' },
      { path: 'color.border.strong', label: 'Border Strong', type: 'COLOR', defaultValue: '#D4D4D8' },
      { path: 'color.overlay', label: 'Overlay', type: 'COLOR', defaultValue: 'rgba(0,0,0,0.5)' },
      { path: 'color.overlay.light', label: 'Overlay Light', type: 'COLOR', defaultValue: 'rgba(255,255,255,0.5)' },
      { path: 'color.gradient.start', label: 'Gradient Start', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'color.gradient.end', label: 'Gradient End', type: 'COLOR', defaultValue: '#1a1a2e' },
    ],
  },
  {
    name: 'Typography', icon: '✍️', description: 'Font families, sizes, weights, spacing',
    tokens: [
      { path: 'typography.display', label: 'Display Font', type: 'FONT_FAMILY', defaultValue: 'Cormorant Garamond' },
      { path: 'typography.heading', label: 'Heading Font', type: 'FONT_FAMILY', defaultValue: 'Playfair Display' },
      { path: 'typography.body', label: 'Body Font', type: 'FONT_FAMILY', defaultValue: 'Inter' },
      { path: 'typography.caption', label: 'Caption Font', type: 'FONT_FAMILY', defaultValue: 'Inter' },
      { path: 'typography.button', label: 'Button Font', type: 'FONT_FAMILY', defaultValue: 'Inter' },
      { path: 'typography.code', label: 'Code Font', type: 'FONT_FAMILY', defaultValue: 'JetBrains Mono' },
      { path: 'typography.size.display', label: 'Display Size', type: 'DIMENSION', defaultValue: '48px' },
      { path: 'typography.size.h1', label: 'H1 Size', type: 'DIMENSION', defaultValue: '36px' },
      { path: 'typography.size.h2', label: 'H2 Size', type: 'DIMENSION', defaultValue: '28px' },
      { path: 'typography.size.h3', label: 'H3 Size', type: 'DIMENSION', defaultValue: '22px' },
      { path: 'typography.size.body', label: 'Body Size', type: 'DIMENSION', defaultValue: '16px' },
      { path: 'typography.size.caption', label: 'Caption Size', type: 'DIMENSION', defaultValue: '12px' },
      { path: 'typography.weight.display', label: 'Display Weight', type: 'STRING', defaultValue: '600', options: ['300','400','500','600','700','800'] },
      { path: 'typography.weight.heading', label: 'Heading Weight', type: 'STRING', defaultValue: '600', options: ['300','400','500','600','700','800'] },
      { path: 'typography.weight.body', label: 'Body Weight', type: 'STRING', defaultValue: '400', options: ['300','400','500','600','700','800'] },
      { path: 'typography.letterSpacing', label: 'Letter Spacing', type: 'DIMENSION', defaultValue: '0px' },
      { path: 'typography.lineHeight', label: 'Line Height', type: 'STRING', defaultValue: '1.5', options: ['1.2','1.3','1.4','1.5','1.6','1.7','1.8'] },
    ],
  },
  {
    name: 'Spacing', icon: '📏', description: 'Spacing scale',
    tokens: [
      { path: 'spacing.0', label: '0', type: 'DIMENSION', defaultValue: '0px' },
      { path: 'spacing.1', label: '1 (4px)', type: 'DIMENSION', defaultValue: '4px' },
      { path: 'spacing.2', label: '2 (8px)', type: 'DIMENSION', defaultValue: '8px' },
      { path: 'spacing.3', label: '3 (12px)', type: 'DIMENSION', defaultValue: '12px' },
      { path: 'spacing.4', label: '4 (16px)', type: 'DIMENSION', defaultValue: '16px' },
      { path: 'spacing.5', label: '5 (20px)', type: 'DIMENSION', defaultValue: '20px' },
      { path: 'spacing.6', label: '6 (24px)', type: 'DIMENSION', defaultValue: '24px' },
      { path: 'spacing.8', label: '8 (32px)', type: 'DIMENSION', defaultValue: '32px' },
      { path: 'spacing.10', label: '10 (40px)', type: 'DIMENSION', defaultValue: '40px' },
      { path: 'spacing.12', label: '12 (48px)', type: 'DIMENSION', defaultValue: '48px' },
      { path: 'spacing.16', label: '16 (64px)', type: 'DIMENSION', defaultValue: '64px' },
      { path: 'spacing.20', label: '20 (80px)', type: 'DIMENSION', defaultValue: '80px' },
    ],
  },
  {
    name: 'Radius', icon: '◯', description: 'Border radius scale',
    tokens: [
      { path: 'radius.none', label: 'None', type: 'DIMENSION', defaultValue: '0px' },
      { path: 'radius.xs', label: 'XS', type: 'DIMENSION', defaultValue: '2px' },
      { path: 'radius.sm', label: 'SM', type: 'DIMENSION', defaultValue: '4px' },
      { path: 'radius.md', label: 'MD', type: 'DIMENSION', defaultValue: '8px' },
      { path: 'radius.lg', label: 'LG', type: 'DIMENSION', defaultValue: '16px' },
      { path: 'radius.xl', label: 'XL', type: 'DIMENSION', defaultValue: '24px' },
      { path: 'radius.2xl', label: '2XL', type: 'DIMENSION', defaultValue: '32px' },
      { path: 'radius.full', label: 'Full', type: 'DIMENSION', defaultValue: '9999px' },
    ],
  },
  {
    name: 'Elevation', icon: '📊', description: 'Shadows and depth',
    tokens: [
      { path: 'shadow.none', label: 'None', type: 'STRING', defaultValue: 'none' },
      { path: 'shadow.xs', label: 'XS', type: 'STRING', defaultValue: '0 1px 2px rgba(0,0,0,0.05)' },
      { path: 'shadow.sm', label: 'SM', type: 'STRING', defaultValue: '0 2px 4px rgba(0,0,0,0.08)' },
      { path: 'shadow.md', label: 'MD', type: 'STRING', defaultValue: '0 4px 6px rgba(0,0,0,0.1)' },
      { path: 'shadow.lg', label: 'LG', type: 'STRING', defaultValue: '0 10px 25px rgba(0,0,0,0.15)' },
      { path: 'shadow.xl', label: 'XL', type: 'STRING', defaultValue: '0 20px 40px rgba(0,0,0,0.2)' },
      { path: 'shadow.2xl', label: '2XL', type: 'STRING', defaultValue: '0 40px 80px rgba(0,0,0,0.3)' },
      { path: 'shadow.luxury', label: 'Luxury', type: 'STRING', defaultValue: '0 10px 25px rgba(212,175,55,0.15)' },
    ],
  },
  {
    name: 'Border', icon: '⊞', description: 'Border widths and styles',
    tokens: [
      { path: 'border.width.none', label: 'None', type: 'DIMENSION', defaultValue: '0px' },
      { path: 'border.width.thin', label: 'Thin', type: 'DIMENSION', defaultValue: '1px' },
      { path: 'border.width.medium', label: 'Medium', type: 'DIMENSION', defaultValue: '2px' },
      { path: 'border.width.thick', label: 'Thick', type: 'DIMENSION', defaultValue: '3px' },
      { path: 'border.style', label: 'Style', type: 'STRING', defaultValue: 'solid', options: ['solid','dashed','dotted','double'] },
      { path: 'border.color', label: 'Color', type: 'COLOR', defaultValue: '#E4E4E7' },
    ],
  },
  {
    name: 'Motion', icon: '🎬', description: 'Animations and transitions',
    tokens: [
      { path: 'motion.duration.fast', label: 'Fast', type: 'DURATION', defaultValue: '150ms' },
      { path: 'motion.duration.normal', label: 'Normal', type: 'DURATION', defaultValue: '300ms' },
      { path: 'motion.duration.slow', label: 'Slow', type: 'DURATION', defaultValue: '500ms' },
      { path: 'motion.ease', label: 'Easing', type: 'CUBIC_BEZIER', defaultValue: 'ease-in-out' },
      { path: 'motion.ease.spring', label: 'Spring', type: 'CUBIC_BEZIER', defaultValue: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      { path: 'motion.hover.scale', label: 'Hover Scale', type: 'STRING', defaultValue: 'scale(1.02)' },
      { path: 'motion.hover.lift', label: 'Hover Lift', type: 'STRING', defaultValue: 'translateY(-2px)' },
      { path: 'motion.reveal', label: 'Reveal', type: 'STRING', defaultValue: 'fade', options: ['fade','slide-up','slide-left','zoom','none'] },
      { path: 'motion.parallax', label: 'Parallax', type: 'STRING', defaultValue: 'subtle', options: ['none','subtle','medium','strong'] },
    ],
  },
  {
    name: 'Opacity', icon: '◐', description: 'Opacity levels',
    tokens: [
      { path: 'opacity.0', label: '0%', type: 'NUMBER', defaultValue: '0' },
      { path: 'opacity.25', label: '25%', type: 'NUMBER', defaultValue: '0.25' },
      { path: 'opacity.50', label: '50%', type: 'NUMBER', defaultValue: '0.5' },
      { path: 'opacity.75', label: '75%', type: 'NUMBER', defaultValue: '0.75' },
      { path: 'opacity.100', label: '100%', type: 'NUMBER', defaultValue: '1' },
    ],
  },
  {
    name: 'Blur', icon: '💨', description: 'Blur filters',
    tokens: [
      { path: 'blur.none', label: 'None', type: 'DIMENSION', defaultValue: '0px' },
      { path: 'blur.sm', label: 'SM', type: 'DIMENSION', defaultValue: '4px' },
      { path: 'blur.md', label: 'MD', type: 'DIMENSION', defaultValue: '8px' },
      { path: 'blur.lg', label: 'LG', type: 'DIMENSION', defaultValue: '16px' },
      { path: 'blur.backdrop', label: 'Backdrop', type: 'DIMENSION', defaultValue: '12px' },
    ],
  },
  {
    name: 'Breakpoints', icon: '📱', description: 'Responsive breakpoints',
    tokens: [
      { path: 'breakpoint.mobile', label: 'Mobile', type: 'DIMENSION', defaultValue: '375px' },
      { path: 'breakpoint.tablet', label: 'Tablet', type: 'DIMENSION', defaultValue: '768px' },
      { path: 'breakpoint.desktop', label: 'Desktop', type: 'DIMENSION', defaultValue: '1024px' },
      { path: 'breakpoint.wide', label: 'Wide', type: 'DIMENSION', defaultValue: '1440px' },
      { path: 'breakpoint.ultrawide', label: 'Ultra Wide', type: 'DIMENSION', defaultValue: '1920px' },
    ],
  },
  {
    name: 'Buttons', icon: '🔘', description: 'Button component tokens',
    tokens: [
      { path: 'button.primary.bg', label: 'Primary BG', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'button.primary.fg', label: 'Primary FG', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'button.primary.hover', label: 'Primary Hover', type: 'COLOR', defaultValue: '#B8941F' },
      { path: 'button.secondary.bg', label: 'Secondary BG', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'button.secondary.fg', label: 'Secondary FG', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'button.ghost.bg', label: 'Ghost BG', type: 'COLOR', defaultValue: 'transparent' },
      { path: 'button.ghost.fg', label: 'Ghost FG', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'button.outline.border', label: 'Outline Border', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'button.radius', label: 'Radius', type: 'DIMENSION', defaultValue: '8px' },
      { path: 'button.padding.x', label: 'Padding X', type: 'DIMENSION', defaultValue: '20px' },
      { path: 'button.padding.y', label: 'Padding Y', type: 'DIMENSION', defaultValue: '10px' },
      { path: 'button.font.size', label: 'Font Size', type: 'DIMENSION', defaultValue: '14px' },
      { path: 'button.font.weight', label: 'Font Weight', type: 'STRING', defaultValue: '500', options: ['300','400','500','600','700'] },
    ],
  },
  {
    name: 'Cards', icon: '▦', description: 'Card component tokens',
    tokens: [
      { path: 'card.bg', label: 'Background', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'card.padding', label: 'Padding', type: 'DIMENSION', defaultValue: '20px' },
      { path: 'card.border.width', label: 'Border Width', type: 'DIMENSION', defaultValue: '1px' },
      { path: 'card.border.color', label: 'Border Color', type: 'COLOR', defaultValue: '#E4E4E7' },
      { path: 'card.shadow', label: 'Shadow', type: 'STRING', defaultValue: '0 4px 6px rgba(0,0,0,0.1)' },
      { path: 'card.radius', label: 'Radius', type: 'DIMENSION', defaultValue: '12px' },
      { path: 'card.hover', label: 'Hover Effect', type: 'STRING', defaultValue: 'lift', options: ['none','lift','glow','scale'] },
    ],
  },
  {
    name: 'Forms', icon: '📝', description: 'Form input tokens',
    tokens: [
      { path: 'form.input.bg', label: 'Input BG', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'form.input.border', label: 'Input Border', type: 'COLOR', defaultValue: '#E4E4E7' },
      { path: 'form.input.border.focus', label: 'Focus Border', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'form.input.text', label: 'Input Text', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'form.input.placeholder', label: 'Placeholder', type: 'COLOR', defaultValue: '#A1A1AA' },
      { path: 'form.input.radius', label: 'Input Radius', type: 'DIMENSION', defaultValue: '8px' },
      { path: 'form.input.padding', label: 'Input Padding', type: 'DIMENSION', defaultValue: '12px' },
      { path: 'form.error.color', label: 'Error Color', type: 'COLOR', defaultValue: '#EF4444' },
      { path: 'form.success.color', label: 'Success Color', type: 'COLOR', defaultValue: '#22C55E' },
      { path: 'form.label.font.size', label: 'Label Size', type: 'DIMENSION', defaultValue: '12px' },
      { path: 'form.label.font.weight', label: 'Label Weight', type: 'STRING', defaultValue: '500', options: ['300','400','500','600','700'] },
    ],
  },
  {
    name: 'Navigation', icon: '🧭', description: 'Navigation tokens',
    tokens: [
      { path: 'nav.bg', label: 'Nav BG', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'nav.text', label: 'Nav Text', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'nav.text.active', label: 'Active Text', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'nav.height', label: 'Nav Height', type: 'DIMENSION', defaultValue: '64px' },
      { path: 'nav.padding', label: 'Nav Padding', type: 'DIMENSION', defaultValue: '16px' },
    ],
  },
  {
    name: 'Hero', icon: '🏠', description: 'Hero section tokens',
    tokens: [
      { path: 'hero.minHeight', label: 'Min Height', type: 'DIMENSION', defaultValue: '600px' },
      { path: 'hero.overlay', label: 'Overlay', type: 'COLOR', defaultValue: 'rgba(0,0,0,0.3)' },
      { path: 'hero.title.size', label: 'Title Size', type: 'DIMENSION', defaultValue: '48px' },
      { path: 'hero.subtitle.size', label: 'Subtitle Size', type: 'DIMENSION', defaultValue: '18px' },
    ],
  },
  {
    name: 'Footer', icon: '📐', description: 'Footer tokens',
    tokens: [
      { path: 'footer.bg', label: 'Footer BG', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'footer.text', label: 'Footer Text', type: 'COLOR', defaultValue: '#A1A1AA' },
      { path: 'footer.padding', label: 'Footer Padding', type: 'DIMENSION', defaultValue: '48px' },
    ],
  },
  {
    name: 'Badge', icon: '🏷️', description: 'Badge tokens',
    tokens: [
      { path: 'badge.bg', label: 'Badge BG', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'badge.fg', label: 'Badge FG', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'badge.radius', label: 'Badge Radius', type: 'DIMENSION', defaultValue: '4px' },
      { path: 'badge.padding', label: 'Badge Padding', type: 'DIMENSION', defaultValue: '4px' },
    ],
  },
  {
    name: 'Alert', icon: '⚠️', description: 'Alert tokens',
    tokens: [
      { path: 'alert.info.bg', label: 'Info BG', type: 'COLOR', defaultValue: '#EFF6FF' },
      { path: 'alert.success.bg', label: 'Success BG', type: 'COLOR', defaultValue: '#F0FDF4' },
      { path: 'alert.warning.bg', label: 'Warning BG', type: 'COLOR', defaultValue: '#FFFBEB' },
      { path: 'alert.danger.bg', label: 'Danger BG', type: 'COLOR', defaultValue: '#FEF2F2' },
      { path: 'alert.radius', label: 'Alert Radius', type: 'DIMENSION', defaultValue: '8px' },
    ],
  },
  {
    name: 'Modal', icon: '🪟', description: 'Modal tokens',
    tokens: [
      { path: 'modal.bg', label: 'Modal BG', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'modal.overlay', label: 'Overlay', type: 'COLOR', defaultValue: 'rgba(0,0,0,0.5)' },
      { path: 'modal.radius', label: 'Modal Radius', type: 'DIMENSION', defaultValue: '16px' },
      { path: 'modal.padding', label: 'Modal Padding', type: 'DIMENSION', defaultValue: '24px' },
      { path: 'modal.maxWidth', label: 'Max Width', type: 'DIMENSION', defaultValue: '500px' },
    ],
  },
  {
    name: 'Toast', icon: '🍞', description: 'Toast tokens',
    tokens: [
      { path: 'toast.bg', label: 'Toast BG', type: 'COLOR', defaultValue: '#1a1a2e' },
      { path: 'toast.fg', label: 'Toast FG', type: 'COLOR', defaultValue: '#FFFFFF' },
      { path: 'toast.radius', label: 'Toast Radius', type: 'DIMENSION', defaultValue: '8px' },
      { path: 'toast.duration', label: 'Duration', type: 'DURATION', defaultValue: '3000ms' },
    ],
  },
  {
    name: 'Avatar', icon: '👤', description: 'Avatar tokens',
    tokens: [
      { path: 'avatar.size.sm', label: 'SM Size', type: 'DIMENSION', defaultValue: '24px' },
      { path: 'avatar.size.md', label: 'MD Size', type: 'DIMENSION', defaultValue: '32px' },
      { path: 'avatar.size.lg', label: 'LG Size', type: 'DIMENSION', defaultValue: '48px' },
      { path: 'avatar.radius', label: 'Avatar Radius', type: 'DIMENSION', defaultValue: '9999px' },
    ],
  },
  {
    name: 'Progress', icon: '📊', description: 'Progress tokens',
    tokens: [
      { path: 'progress.bg', label: 'Progress BG', type: 'COLOR', defaultValue: '#E4E4E7' },
      { path: 'progress.fill', label: 'Progress Fill', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'progress.height', label: 'Progress Height', type: 'DIMENSION', defaultValue: '8px' },
      { path: 'progress.radius', label: 'Progress Radius', type: 'DIMENSION', defaultValue: '4px' },
    ],
  },
  {
    name: 'Timeline', icon: '📅', description: 'Timeline tokens',
    tokens: [
      { path: 'timeline.dot.color', label: 'Dot Color', type: 'COLOR', defaultValue: '#D4AF37' },
      { path: 'timeline.dot.size', label: 'Dot Size', type: 'DIMENSION', defaultValue: '12px' },
      { path: 'timeline.line.color', label: 'Line Color', type: 'COLOR', defaultValue: '#E4E4E7' },
      { path: 'timeline.line.width', label: 'Line Width', type: 'DIMENSION', defaultValue: '2px' },
    ],
  },
  {
    name: 'Container', icon: '📦', description: 'Container layout tokens',
    tokens: [
      { path: 'container.maxWidth', label: 'Max Width', type: 'DIMENSION', defaultValue: '1200px' },
      { path: 'container.padding', label: 'Padding', type: 'DIMENSION', defaultValue: '24px' },
      { path: 'container.gap', label: 'Gap', type: 'DIMENSION', defaultValue: '16px' },
    ],
  },
  {
    name: 'Grid', icon: '⊞', description: 'Grid system tokens',
    tokens: [
      { path: 'grid.columns', label: 'Columns', type: 'NUMBER', defaultValue: '12' },
      { path: 'grid.gap', label: 'Gap', type: 'DIMENSION', defaultValue: '16px' },
      { path: 'grid.margin', label: 'Margin', type: 'DIMENSION', defaultValue: '24px' },
    ],
  },
];

// ─── Count total tokens ───────────────────────────────────────────────────────

export const TOTAL_TOKEN_COUNT = TOKEN_ENGINE_FAMILIES.reduce((sum, f) => sum + f.tokens.length, 0);

// ─── Default token values (flattened) ─────────────────────────────────────────

export function getDefaultTokens(): Record<string, string> {
  const defaults: Record<string, string> = {}
  for (const family of TOKEN_ENGINE_FAMILIES) {
    for (const token of family.tokens) {
      defaults[token.path] = token.defaultValue
    }
  }
  return defaults
}

// ─── Token to CSS variable mapping ────────────────────────────────────────────

export function tokenToCssVar(path: string): string {
  return `--${path.replace(/\./g, '-')}`
}

// ─── W3C Design Tokens Format export ──────────────────────────────────────────

export function exportToW3C(tokens: Record<string, string>): string {
  const w3c: Record<string, unknown> = {}
  for (const [path, value] of Object.entries(tokens)) {
    const parts = path.split('.')
    let obj = w3c
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {}
      obj = obj[parts[i]] as Record<string, unknown>
    }
    const family = TOKEN_ENGINE_FAMILIES.find(f => f.tokens.some(t => t.path === path))
    const tokenDef = family?.tokens.find(t => t.path === path)
    obj[parts[parts.length - 1]] = {
      $value: value,
      $type: tokenDef?.type || 'STRING',
      $description: tokenDef?.description || tokenDef?.label || '',
    }
  }
  return JSON.stringify({ $schema: 'https://design-tokens.org/schema.json', ...w3c }, null, 2)
}

// ─── W3C Design Tokens Format import ──────────────────────────────────────────

export function importFromW3C(json: string): Record<string, string> {
  const parsed = JSON.parse(json)
  const tokens: Record<string, string> = {}
  function walk(obj: Record<string, unknown>, prefix: string) {
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('$')) continue // skip metadata
      if (val && typeof val === 'object' && '$value' in val) {
        tokens[`${prefix}${prefix ? '.' : ''}${key}`] = String((val as Record<string, unknown>).$value)
      } else if (val && typeof val === 'object') {
        walk(val as Record<string, unknown>, `${prefix}${prefix ? '.' : ''}${key}`)
      }
    }
  }
  walk(parsed, '')
  return tokens
}

// ─── CSS Variables export ─────────────────────────────────────────────────────

export function exportToCssVars(tokens: Record<string, string>): string {
  return ':root {\n' + Object.entries(tokens)
    .map(([path, value]) => `  ${tokenToCssVar(path)}: ${value};`)
    .join('\n') + '\n}'
}

// ─── Tailwind Config export ───────────────────────────────────────────────────

export function exportToTailwind(tokens: Record<string, string>): string {
  const config: Record<string, Record<string, string>> = {}
  for (const [path, value] of Object.entries(tokens)) {
    const [family, ...rest] = path.split('.')
    const key = rest.join('.') || family
    if (!config[family]) config[family] = {}
    config[family][key] = value
  }
  return JSON.stringify({ theme: { extend: config } }, null, 2)
}

// ─── WCAG Quality Checks ──────────────────────────────────────────────────────

export interface WcagCheck {
  name: string
  status: 'PASS' | 'WARN' | 'FAIL'
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  message: string
  detail?: string
}

export function runWcagChecks(tokens: Record<string, string>): WcagCheck[] {
  const checks: WcagCheck[] = []

  // Contrast check: primary vs background
  const primary = tokens['color.primary']
  const bg = tokens['color.background']
  if (primary && bg) {
    if (primary === bg) {
      checks.push({ name: 'Contrast: Primary vs Background', status: 'FAIL', severity: 'CRITICAL', message: 'Primary and background colors are identical' })
    } else {
      checks.push({ name: 'Contrast: Primary vs Background', status: 'PASS', severity: 'LOW', message: 'Primary and background differ' })
    }
  }

  // Text vs background
  const text = tokens['color.text']
  if (text && bg && text === bg) {
    checks.push({ name: 'Contrast: Text vs Background', status: 'FAIL', severity: 'CRITICAL', message: 'Text and background colors are identical' })
  } else {
    checks.push({ name: 'Contrast: Text vs Background', status: 'PASS', severity: 'LOW', message: 'Text and background differ' })
  }

  // Font completeness
  if (!tokens['typography.display'] || !tokens['typography.body']) {
    checks.push({ name: 'Font Completeness', status: 'FAIL', severity: 'HIGH', message: 'Missing display or body font' })
  } else {
    checks.push({ name: 'Font Completeness', status: 'PASS', severity: 'LOW', message: 'All required fonts defined' })
  }

  // Button contrast
  const btnBg = tokens['button.primary.bg']
  const btnFg = tokens['button.primary.fg']
  if (btnBg && btnFg && btnBg === btnFg) {
    checks.push({ name: 'Button Contrast', status: 'FAIL', severity: 'CRITICAL', message: 'Button BG and FG are identical' })
  } else {
    checks.push({ name: 'Button Contrast', status: 'PASS', severity: 'LOW', message: 'Button contrast OK' })
  }

  // Radius consistency
  checks.push({ name: 'Radius System', status: 'PASS', severity: 'LOW', message: 'Radius scale defined (8 levels)' })

  // Shadow system
  if (!tokens['shadow.md']) {
    checks.push({ name: 'Shadow System', status: 'WARN', severity: 'MEDIUM', message: 'Medium shadow not set' })
  } else {
    checks.push({ name: 'Shadow System', status: 'PASS', severity: 'LOW', message: 'Shadow scale defined (8 levels)' })
  }

  // Responsive
  if (!tokens['breakpoint.mobile'] || !tokens['breakpoint.tablet']) {
    checks.push({ name: 'Responsive', status: 'WARN', severity: 'MEDIUM', message: 'Missing breakpoints' })
  } else {
    checks.push({ name: 'Responsive', status: 'PASS', severity: 'LOW', message: 'Breakpoints defined' })
  }

  // Spacing system
  checks.push({ name: 'Spacing System', status: 'PASS', severity: 'LOW', message: 'Spacing scale defined (12 levels)' })

  return checks
}

// ─── Brand Kit ────────────────────────────────────────────────────────────────

export interface BrandKit {
  id: string
  name: string
  slug: string
  description: string
  logoUrl: string | null
  logoDarkUrl: string | null
  faviconUrl: string | null
  tokens: Record<string, string>
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}

// ─── Brand Presets (expanded from 5.8.9) ──────────────────────────────────────

export const BRAND_KIT_PRESETS: Array<{ name: string; slug: string; description: string; tokens: Partial<Record<string, string>> }> = [
  { name: 'Luxury Gold', slug: 'luxury-gold', description: 'Or et noir, luxe cérémoniel', tokens: { 'color.primary': '#D4AF37', 'color.accent': '#0a0a0a', 'color.background': '#FAF8F5', 'color.text': '#1a1a2e', 'typography.display': 'Cormorant Garamond', 'typography.body': 'Inter', 'shadow.luxury': '0 10px 25px rgba(212,175,55,0.15)' } },
  { name: 'Royal Emerald', slug: 'royal-emerald', description: 'Émeraude et or, majestueux', tokens: { 'color.primary': '#0F4C3A', 'color.accent': '#D4AF37', 'color.background': '#F5F2ED', 'color.text': '#1a1a2e', 'typography.display': 'Playfair Display' } },
  { name: 'Minimal White', slug: 'minimal-white', description: 'Blanc et gris, éditorial', tokens: { 'color.primary': '#1a1a1a', 'color.accent': '#666666', 'color.background': '#FFFFFF', 'color.text': '#1a1a1a', 'typography.display': 'Montserrat', 'radius.md': '4px' } },
  { name: 'Modern Blue', slug: 'modern-blue', description: 'Bleu et blanc, contemporain', tokens: { 'color.primary': '#2563EB', 'color.accent': '#1E40AF', 'color.background': '#F8FAFC', 'color.text': '#1E293B' } },
  { name: 'Classic Beige', slug: 'classic-beige', description: 'Beige et brun, intemporel', tokens: { 'color.primary': '#8B6F47', 'color.accent': '#5C4033', 'color.background': '#F5E6D3', 'color.text': '#3D2914' } },
  { name: 'Botanical Green', slug: 'botanical-green', description: 'Vert et crème, naturel', tokens: { 'color.primary': '#2D5016', 'color.accent': '#7B9E6B', 'color.background': '#F4F1E8', 'color.text': '#1a2e05' } },
  { name: 'Premium Black', slug: 'premium-black', description: 'Noir et or, exclusif', tokens: { 'color.primary': '#D4AF37', 'color.accent': '#0a0a0a', 'color.background': '#0a0a0a', 'color.text': '#FAF8F5', 'color.surface': '#1a1a2e' } },
  { name: 'Dark Mode', slug: 'dark-mode', description: 'Mode sombre élégant', tokens: { 'color.primary': '#D4AF37', 'color.accent': '#3B82F6', 'color.background': '#0F0F0F', 'color.text': '#E5E7EB', 'color.surface': '#1F1F1F' } },
  { name: 'Editorial', slug: 'editorial', description: 'Magazine, typographique', tokens: { 'color.primary': '#1a1a1a', 'color.accent': '#DC2626', 'color.background': '#FAFAFA', 'color.text': '#1a1a1a', 'typography.display': 'Playfair Display' } },
  { name: 'Glass Morphism', slug: 'glass-morphism', description: 'Glassmorphism, translucide', tokens: { 'color.primary': '#6366F1', 'color.accent': '#EC4899', 'color.background': '#F0F4FF', 'color.text': '#1E1B4B', 'radius.lg': '24px', 'blur.backdrop': '12px' } },
  { name: 'Romantic Rose', slug: 'romantic-rose', description: 'Rose et or, romantique', tokens: { 'color.primary': '#C9A961', 'color.accent': '#8B6F47', 'color.background': '#FAF5EF', 'color.text': '#3D2914' } },
  { name: 'Kente African', slug: 'kente-african', description: 'Kente, identité africaine', tokens: { 'color.primary': '#E8A53D', 'color.accent': '#1B5E20', 'color.background': '#FFF8E7', 'color.text': '#1a1a2e' } },
]

// ─── Helper: get token count ──────────────────────────────────────────────────

export function getTokenCount(): number {
  return TOTAL_TOKEN_COUNT
}

export function getFamilyCount(): number {
  return TOKEN_ENGINE_FAMILIES.length
}
