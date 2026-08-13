/**
 * MISSION 5.9.5 — PHASE A: Design Tokens (TypeScript mirror)
 * Task 5.8.10-TOKENS: Consolidated into 14 canonical categories.
 * ============================================================
 * Single source of truth for design tokens consumed in TS/TSX.
 * Mirrors the CSS custom properties in src/app/globals.css.
 * Use these for inline styles, Framer Motion variants, chart configs,
 * canvas rendering, and any context where CSS vars are inconvenient.
 *
 * Canonical hierarchy:
 *   BRAND · COLOR · TYPOGRAPHY · SPACING · RADIUS · SHADOW · GRADIENT
 *   · MOTION · GLASS · SURFACE · BUTTON · CARD · FORM · RESPONSIVE
 *
 * Principles: Mobile-FIRST, touch-friendly (44px min), safe-area aware,
 * premium wedding aesthetic (gold / champagne / emerald / blush).
 * NO indigo / blue.
 */

export const touchTargets = {
  min: 'var(--touch-min)', // 44px
  sm: 'var(--touch-sm)', // 44px
  md: 'var(--touch-md)', // 48px
  lg: 'var(--touch-lg)', // 56px
  xl: 'var(--touch-xl)', // 64px
} as const

export const safeAreas = {
  top: 'var(--safe-top)',
  bottom: 'var(--safe-bottom)',
  left: 'var(--safe-left)',
  right: 'var(--safe-right)',
} as const

/** Fluid type scale (clamp-based, mobile→desktop) */
export const fluidType = {
  xs: 'var(--text-xs)', // 11→12
  sm: 'var(--text-sm)', // 13→14
  base: 'var(--text-base)', // 15→16
  lg: 'var(--text-lg)', // 17→19
  xl: 'var(--text-xl)', // 19→22
  '2xl': 'var(--text-2xl)', // 22→28
  '3xl': 'var(--text-3xl)', // 26→36
  '4xl': 'var(--text-4xl)', // 30→46
  '5xl': 'var(--text-5xl)', // 36→60
  '6xl': 'var(--text-6xl)', // 42→76
} as const

/** Fluid spacing scale */
export const fluidSpace = {
  0: 'var(--space-0)',
  1: 'var(--space-1)', // 4→5
  2: 'var(--space-2)', // 8→10
  3: 'var(--space-3)', // 12→15
  4: 'var(--space-4)', // 16→20
  5: 'var(--space-5)', // 24→30
  6: 'var(--space-6)', // 32→40
  7: 'var(--space-7)', // 40→50
  8: 'var(--space-8)', // 48→60
  9: 'var(--space-9)', // 64→80
  10: 'var(--space-10)', // 80→100
} as const

/** Premium shadows */
export const shadows = {
  xs: 'var(--shadow-xs)',
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  xl: 'var(--shadow-xl)',
  '2xl': 'var(--shadow-2xl)',
  gold: 'var(--shadow-gold)',
  emerald: 'var(--shadow-emerald)',
  inner: 'var(--shadow-inner)',
} as const

/** Motion tokens (durations + easings) */
export const motion = {
  duration: {
    instant: 80,
    fast: 150,
    normal: 250,
    slow: 400,
    slower: 600,
  },
  ease: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
} as const

/** z-index scale */
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  drawer: 1040,
  modalBackdrop: 1050,
  modal: 1060,
  popover: 1070,
  toast: 1080,
  tooltip: 1090,
} as const

/** Breakpoints (mobile-first, mirror Tailwind defaults) */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

/** Premium brand color tokens (semantic names — legacy aliases) */
export const brandColors = {
  gold: 'var(--gold)',
  goldSoft: 'var(--gold-soft)',
  emerald: 'var(--emerald-brand)',
  emeraldSoft: 'var(--emerald-soft)',
  blush: 'var(--blush)',
  pearl: 'var(--pearl)',
  ink: 'var(--ink)',
  ivory: 'var(--ivory)',
} as const

/** ════ BRAND — Wedding OS official identity (Task 5.8.10) ════ */
export const brand = {
  gold: 'var(--brand-gold)',
  goldLight: 'var(--brand-gold-light)',
  goldDark: 'var(--brand-gold-dark)',
  ivory: 'var(--brand-ivory)',
  midnight: 'var(--brand-midnight)',
  blush: 'var(--brand-blush)',
  emerald: 'var(--brand-emerald)',
  silver: 'var(--brand-silver)',
  lavender: 'var(--brand-lavender)',
  // Metallic gradient stops (for SVG logos)
  goldStopLight: 'var(--brand-gold-stop-light)',
  goldStopMid: 'var(--brand-gold-stop-mid)',
  goldStopDark: 'var(--brand-gold-stop-dark)',
} as const

/** Container widths */
export const containers = {
  mobile: 'var(--container-mobile)',
  sm: 'var(--container-sm)',
  md: 'var(--container-md)',
  lg: 'var(--container-lg)',
  xl: 'var(--container-xl)',
  '2xl': 'var(--container-2xl)',
} as const

/** Layout heights */
export const layoutHeights = {
  header: 'var(--header-height)',
  footer: 'var(--footer-height)',
  bottomNav: 'var(--bottom-nav-height)',
} as const

/** Premium gradients */
export const gradients = {
  gold: 'var(--gradient-gold)',
  emerald: 'var(--gradient-emerald)',
  blush: 'var(--gradient-blush)',
  ivory: 'var(--gradient-ivory)',
  shimmer: 'var(--gradient-shimmer)',
} as const

/** Radii */
export const radii = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
  '3xl': 'var(--radius-3xl)',
} as const

/** ════ GLASS — premium frosted effect (Task 5.8.10) ════ */
export const glass = {
  bg: 'var(--glass-bg)',
  bgDark: 'var(--glass-bg-dark)',
  border: 'var(--glass-border)',
  blur: 'var(--glass-blur)',
  saturate: 'var(--glass-saturate)',
} as const

/** ════ SURFACE — elevation tiers 0-4 (Task 5.8.10) ════ */
export const surface = {
  0: 'var(--surface-0)',
  1: 'var(--surface-1)',
  2: 'var(--surface-2)',
  3: 'var(--surface-3)',
  4: 'var(--surface-4)',
  '0-dark': 'var(--surface-0-dark)',
  '1-dark': 'var(--surface-1-dark)',
  '2-dark': 'var(--surface-2-dark)',
  '3-dark': 'var(--surface-3-dark)',
  '4-dark': 'var(--surface-4-dark)',
} as const

/** ════ BUTTON — heights, paddings, variants (Task 5.8.10) ════ */
export const button = {
  heightSm: 'var(--btn-height-sm)',
  heightMd: 'var(--btn-height-md)',
  heightLg: 'var(--btn-height-lg)',
  paddingXSm: 'var(--btn-padding-x-sm)',
  paddingXMd: 'var(--btn-padding-x-md)',
  paddingXLg: 'var(--btn-padding-x-lg)',
  radius: 'var(--btn-radius)',
  fontWeight: 'var(--btn-font-weight)',
  letterSpacing: 'var(--btn-letter-spacing)',
} as const

/** ════ CARD — padding, radius, shadow (Task 5.8.10) ════ */
export const card = {
  padding: 'var(--card-padding)',
  paddingSm: 'var(--card-padding-sm)',
  paddingLg: 'var(--card-padding-lg)',
  radius: 'var(--card-radius)',
  shadow: 'var(--card-shadow)',
  shadowHover: 'var(--card-shadow-hover)',
  border: 'var(--card-border)',
} as const

/** ════ FORM — inputs, focus ring, error state (Task 5.8.10) ════ */
export const form = {
  inputHeight: 'var(--input-height)',
  inputHeightSm: 'var(--input-height-sm)',
  inputPaddingX: 'var(--input-padding-x)',
  inputRadius: 'var(--input-radius)',
  inputBg: 'var(--input-bg)',
  inputBorder: 'var(--input-border)',
  inputBorderFocus: 'var(--input-border-focus)',
  inputRing: 'var(--input-ring)',
  inputError: 'var(--input-error)',
  inputErrorRing: 'var(--input-error-ring)',
  labelFontWeight: 'var(--label-font-weight)',
  labelLetterSpacing: 'var(--label-letter-spacing)',
  labelMarginBottom: 'var(--label-margin-bottom)',
  helperTextSize: 'var(--helper-text-size)',
  helperTextColor: 'var(--helper-text-color)',
} as const

/** ════ RESPONSIVE — breakpoints + container max widths (Task 5.8.10) ════ */
export const responsive = {
  bpSm: 'var(--bp-sm)',
  bpMd: 'var(--bp-md)',
  bpLg: 'var(--bp-lg)',
  bpXl: 'var(--bp-xl)',
  bp2xl: 'var(--bp-2xl)',
  containerMobileMax: 'var(--container-mobile-max)',
  containerSmMax: 'var(--container-sm-max)',
  containerMdMax: 'var(--container-md-max)',
  containerLgMax: 'var(--container-lg-max)',
  containerXlMax: 'var(--container-xl-max)',
  container2xlMax: 'var(--container-2xl-max)',
} as const

/**
 * Framer Motion preset variants built from the motion tokens.
 * Use these for consistent premium animations across the platform.
 */
export const framerPresets = {
  enterUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: motion.duration.normal / 1000, ease: [0.22, 1, 0.36, 1] as const },
  },
  enterScale: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
    transition: { duration: motion.duration.normal / 1000, ease: [0.34, 1.56, 0.64, 1] as const },
  },
  enterFade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: motion.duration.fast / 1000, ease: 'easeOut' as const },
  },
  tap: {
    whileTap: { scale: 0.97 },
    whileHover: { scale: 1.02 },
    transition: { duration: motion.duration.fast / 1000, ease: [0.22, 1, 0.36, 1] as const },
  },
} as const

/** Type-safe token registry for documentation / design system pages */
export const tokenRegistry = {
  touchTargets,
  safeAreas,
  fluidType,
  fluidSpace,
  shadows,
  motion,
  zIndex,
  breakpoints,
  brandColors,
  brand,
  containers,
  layoutHeights,
  gradients,
  radii,
  glass,
  surface,
  button,
  card,
  form,
  responsive,
  framerPresets,
} as const

export type DesignTokens = typeof tokenRegistry
