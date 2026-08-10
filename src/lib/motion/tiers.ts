// ══════════════════════════════════════════════════════════════════════════════
// src/lib/motion/tiers.ts
// Phase 3A (MISSION 5.9.0) — Motion design system: 4 motion tiers.
// ══════════════════════════════════════════════════════════════════════════════
//
// Defines 4 motion tiers as a typed preset of durations + easings + stagger.
// Each tier bundles a duration, a stagger delay, an easing curve, a translation
// distance, and a starting scale. Components consume these via `getMotionConfig()`
// so that a single identity-preset change cascades through every animated surface.
//
// Tiers:
//   - subtle:    0.4s duration, 0.06s stagger, [0.4,0,0.2,1]     16px / 0.98 scale
//   - elegant:   0.7s duration, 0.10s stagger, [0.16,1,0.3,1]    30px / 0.96 scale
//   - cinematic: 1.0s duration, 0.15s stagger, [0.22,1,0.36,1]   50px / 0.92 scale
//   - none:      no motion (used for accessibility / `prefers-reduced-motion`
//                and as a hard kill switch — MotionReveal renders plain <div>).
//
// The active tier is read from the CSS variable `--motion-tier` set on
// `:root` by the WeddingThemeInjector (src/components/wedding/ThemeInjector.tsx)
// based on the wedding's identity preset. The default is `'subtle'` (also the
// SSR fallback — see `getMotionTier()`).
//
// Why a tier system?
//   Phase 0 inventory found 85 files using framer-motion with 1023 motion.*
//   occurrences and inconsistent durations/easings. The tier system gives every
//   animated surface the same vocabulary so that the visual mood (subtle vs.
//   cinematic) is consistent and can be tuned in one place.
//
// Reduced motion:
//   - `useReducedMotion()` from framer-motion is checked separately in
//     `MotionReveal` (renders plain <div>). The `none` tier is the *design*
//     kill switch — it allows an identity preset to disable motion without
//     relying on the user's OS preference.
//   - When the tier is `'none'`, MotionReveal also renders plain <div> — so
//     both paths converge on the same zero-motion output.
// ══════════════════════════════════════════════════════════════════════════════

/** The 4 motion tiers. `'none'` disables all motion. */
export type MotionTier = 'subtle' | 'elegant' | 'cinematic' | 'none';

/** Per-tier animation preset (duration / stagger / ease / distance / scale). */
export interface MotionTierConfig {
  /** Animation duration in seconds. */
  duration: number;
  /** Delay between staggered children, in seconds. */
  staggerDelay: number;
  /** Cubic-bezier as `[x1,y1,x2,y2]`, or a named easing string. */
  ease: number[] | string;
  /** Distance in pixels the element travels (fade-up / slide). */
  distance: number;
  /** Initial scale for scale-in presets (1 = no scale). */
  scale: number;
}

/**
 * All 4 motion tier presets. `MOTION_TIERS.none` is the zero-motion fallback.
 */
export const MOTION_TIERS: Record<MotionTier, MotionTierConfig> = {
  subtle:    { duration: 0.4, staggerDelay: 0.06, ease: [0.4, 0, 0.2, 1],  distance: 16, scale: 0.98 },
  elegant:   { duration: 0.7, staggerDelay: 0.10, ease: [0.16, 1, 0.3, 1], distance: 30, scale: 0.96 },
  cinematic: { duration: 1.0, staggerDelay: 0.15, ease: [0.22, 1, 0.36, 1], distance: 50, scale: 0.92 },
  none:      { duration: 0,   staggerDelay: 0,    ease: 'linear',           distance: 0,  scale: 1    },
};

/** Set of valid tier values for runtime validation. */
const VALID_TIERS = new Set<MotionTier>(['subtle', 'elegant', 'cinematic', 'none']);

/**
 * Read the active motion tier from the CSS variable `--motion-tier` on
 * `:root`. Falls back to `'subtle'` when:
 *   - running on the server (no `window` / no DOM),
 *   - the variable is unset or empty,
 *   - the variable holds an unknown value (defensive — ThemeInjector is the
 *     only writer, but a hand-edited theme could set an invalid value).
 *
 * Note: this is a snapshot read. For React components that must re-render when
 * the tier changes, use the `useMotionTier()` hook in `./useMotionTier.ts`
 * (which calls this in an effect + listens for theme-injector updates).
 */
export function getMotionTier(): MotionTier {
  if (typeof window === 'undefined') return 'subtle';
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-tier')
    .trim()
    .toLowerCase();
  if (!raw) return 'subtle';
  return VALID_TIERS.has(raw as MotionTier) ? (raw as MotionTier) : 'subtle';
}

/**
 * Convenience wrapper: returns the {@link MotionTierConfig} for the current
 * tier. Server-side, this resolves to the `subtle` preset.
 */
export function getMotionConfig(): MotionTierConfig {
  return MOTION_TIERS[getMotionTier()];
}
