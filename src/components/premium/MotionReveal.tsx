// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/MotionReveal.tsx
// Phase 2D (MISSION 5.9.0) — Scroll-triggered reveal wrapper.
// Phase 3A (MISSION 5.9.0) — Tier-aware (4 tiers) + stagger orchestration.
// ══════════════════════════════════════════════════════════════════════════════
//
// A thin wrapper around framer-motion's `motion.div` that exposes 4 reveal
// presets via `whileInView`. Replaces the ad-hoc `ScrollReveal` component
// (which depends on the visual-effects store) with a focused, token-aware
// alternative.
//
// Presets:
//   - fade-up    (default): opacity 0→1, y {tier.distance}→0
//   - fade-in:              opacity 0→1
//   - scale-in:             opacity 0→1, scale {tier.scale}→1
//   - slide-left:           opacity 0→1, x {tier.distance}→0
//
// Tier system (Phase 3A):
//   - The active tier is read from the CSS variable `--motion-tier` (set on
//     :root by the WeddingThemeInjector based on the wedding's identity
//     preset). The tier controls duration, ease, distance, and scale.
//   - Pass an explicit `tier` prop to override the CSS-derived tier (e.g. for
//     design-tool previews that want to force `cinematic`).
//   - When the resolved tier is `'none'` OR `useReducedMotion()` is true, the
//     component renders a plain `<div>` (no motion wrapper) — both paths
//     converge on the same zero-motion output.
//
// Stagger mode:
//   - Pass `stagger` to orchestrate staggered children. The wrapper becomes a
//     parent `motion.div` with `variants.visible.transition.staggerChildren`
//     set to the tier's `staggerDelay`. **Children must be motion.* elements
//     with their own `variants` prop** for the stagger to take effect.
//   - In stagger mode the parent has no opacity/transform animation itself —
//     it only orchestrates its children.
//
// Accessibility:
//   - When `useReducedMotion()` returns true, renders a plain `<div>` with NO
//     framer-motion wrapper (children are visible immediately).
//   - The wrapping div keeps the `className` so layout-critical styles (flex,
//     grid, sizing) still apply in the static fallback.
//   - When the tier is `'none'`, the same plain `<div>` fallback is used —
//     this is the *design* kill switch (distinct from the user's OS preference).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion, type Easing, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMotionTier } from '@/lib/motion/useMotionTier';
import { MOTION_TIERS, type MotionTier, type MotionTierConfig } from '@/lib/motion/tiers';

export type RevealPreset = 'fade-up' | 'fade-in' | 'scale-in' | 'slide-left';

export interface MotionRevealProps {
  /** Content to reveal. */
  children: ReactNode;
  /** Animation preset — see file header. */
  preset?: RevealPreset;
  /** Optional tier override. Defaults to the active tier from `--motion-tier`. */
  tier?: MotionTier;
  /** Delay before the animation starts (seconds). Also used as `delayChildren`
   *  in stagger mode. */
  delay?: number;
  /** Intersection threshold (0-1) — fraction of the element that must be
   *  visible before triggering. */
  threshold?: number;
  /** Animate only once (default true). When false, re-animates on every
   *  enter/leave. */
  once?: boolean;
  /** When true, parent orchestrates staggered children via `staggerChildren`.
   *  Children must be motion.* elements with their own `variants` prop. */
  stagger?: boolean;
  /** Extra Tailwind classes applied to the wrapping div. */
  className?: string;
}

/**
 * Build the per-preset hidden state using the tier's `distance` and `scale`.
 * The visible state always resolves to identity (opacity 1, no transform) so
 * every preset converges to the same final layout.
 */
function buildPresetVariants(preset: RevealPreset, cfg: MotionTierConfig): Variants {
  switch (preset) {
    case 'fade-up':
      return {
        hidden: { opacity: 0, y: cfg.distance },
        visible: { opacity: 1, y: 0, x: 0, scale: 1 },
      };
    case 'fade-in':
      return {
        hidden: { opacity: 0 },
        visible: { opacity: 1, x: 0, y: 0, scale: 1 },
      };
    case 'scale-in':
      return {
        hidden: { opacity: 0, scale: cfg.scale },
        visible: { opacity: 1, x: 0, y: 0, scale: 1 },
      };
    case 'slide-left':
      return {
        hidden: { opacity: 0, x: cfg.distance },
        visible: { opacity: 1, x: 0, y: 0, scale: 1 },
      };
    default:
      return {
        hidden: { opacity: 0, y: cfg.distance },
        visible: { opacity: 1, x: 0, y: 0, scale: 1 },
      };
  }
}

/**
 * Build the parent variants for stagger mode. The parent has no
 * opacity/transform animation itself — it only orchestrates its children via
 * `staggerChildren` (and optionally `delayChildren`).
 */
function buildStaggerVariants(cfg: MotionTierConfig, delay: number): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: cfg.staggerDelay,
        delayChildren: delay,
      },
    },
  };
}

/**
 * MotionReveal — scroll-triggered reveal wrapper.
 *
 * Renders a `motion.div` with `whileInView` + the chosen preset, driven by the
 * active motion tier's duration/ease/distance/scale. Falls back to a plain
 * `<div>` when:
 *   - `prefers-reduced-motion: reduce` is set, OR
 *   - the resolved tier is `'none'`.
 *
 * @example
 *   <MotionReveal preset="fade-up" delay={0.2}>
 *     <h2>Le grand jour approche</h2>
 *   </MotionReveal>
 *
 * @example // staggered children
 *   <MotionReveal stagger>
 *     {items.map((it) => (
 *       <motion.div key={it.id} variants={{ hidden: {opacity:0,y:20}, visible: {opacity:1,y:0} }}>
 *         {it.label}
 *       </motion.div>
 *     ))}
 *   </MotionReveal>
 */
export function MotionReveal({
  children,
  preset = 'fade-up',
  tier: tierOverride,
  delay = 0,
  threshold = 0.15,
  once = true,
  stagger = false,
  className,
}: MotionRevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const { tier: tierFromDom } = useMotionTier();

  // Resolve the active tier: explicit prop wins, else the DOM-derived tier.
  const tier: MotionTier = tierOverride ?? tierFromDom;
  const cfg: MotionTierConfig = MOTION_TIERS[tier];

  // Reduced-motion OR tier='none': render static. The className is preserved
  // so layout is identical; only the animation is removed.
  if (prefersReducedMotion || tier === 'none' || cfg.duration === 0) {
    return <div className={className}>{children}</div>;
  }

  // Stagger mode: parent orchestrates children — no opacity/transform on parent.
  if (stagger) {
    const variants = buildStaggerVariants(cfg, delay);
    return (
      <motion.div
        className={cn(className)}
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once, margin: '-50px', amount: threshold }}
      >
        {children}
      </motion.div>
    );
  }

  // Default reveal: animate the wrapper itself.
  const variants = buildPresetVariants(preset, cfg);
  return (
    <motion.div
      className={cn(className)}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '-50px', amount: threshold }}
      transition={{
        duration: cfg.duration,
        delay,
        ease: cfg.ease as Easing,
      }}
    >
      {children}
    </motion.div>
  );
}

export default MotionReveal;
