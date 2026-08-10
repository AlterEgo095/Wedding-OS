// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/SectionTransition.tsx
// Phase 2D (MISSION 5.9.0) — Decorative scroll-triggered section divider.
// ══════════════════════════════════════════════════════════════════════════════
//
// A decorative transition element rendered between sections. 4 presets:
//   - wave:      SVG wave that draws itself on reveal
//   - fade:      soft vertical gradient fade between section backgrounds
//   - line:      thin gold line that grows from 0 → full width on reveal
//   - particles: scattered gold dots that fade in with stagger
//
// Uses `motion` for the reveal animation. All presets respect
// `prefers-reduced-motion` (renders the final state, no animation).
//
// Token-driven: defaults the line/wave color to `var(--theme-primary)` so
// the divider matches the active wedding theme. Override via `color` prop
// (accepts any CSS color value, including token references).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type TransitionPreset = 'wave' | 'fade' | 'line' | 'particles';

export interface SectionTransitionProps {
  /** Visual preset — see file header. */
  preset?: TransitionPreset;
  /** Line/wave/dot color. Defaults to `var(--theme-primary)`. */
  color?: string;
  /** When true, flips the element vertically (for bottom-to-top transitions). */
  flip?: boolean;
  /** Extra Tailwind classes on the wrapper. */
  className?: string;
}

/**
 * SectionTransition — decorative section divider with 4 reveal presets.
 *
 * @example
 *   <SectionTransition preset="wave" />
 *   <SectionTransition preset="line" flip />
 */
export function SectionTransition({
  preset = 'wave',
  color = 'var(--theme-primary)',
  flip = false,
  className,
}: SectionTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  // Particles preset dot list — memoised once. NOTE: hooks must be called
  // unconditionally (rules-of-hooks), so we compute `dots` even when the
  // preset is wave/fade/line; it's cheap and never rendered in those cases.
  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        left: (i * 8.5 + (i % 3) * 4) % 100,
        top: 20 + ((i * 37) % 60),
        size: 2 + (i % 3),
        delay: i * 0.08,
      })),
    [],
  );

  const wrapperClass = cn(
    'relative w-full h-16 pointer-events-none overflow-hidden',
    flip && 'rotate-180',
    className,
  );

  // ─── Wave preset ──────────────────────────────────────────────────────
  if (preset === 'wave') {
    return (
      <div className={wrapperClass} aria-hidden="true">
        <svg
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <motion.path
            d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"
            fill={color}
            opacity={0.15}
            initial={prefersReducedMotion ? { pathLength: 1, opacity: 0.15 } : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 0.15 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          />
          <motion.path
            d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            initial={prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          />
        </svg>
      </div>
    );
  }

  // ─── Fade preset ──────────────────────────────────────────────────────
  if (preset === 'fade') {
    return (
      <div className={wrapperClass} aria-hidden="true">
        <motion.div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, transparent, ${color}, transparent)`,
            opacity: 0.4,
          }}
          initial={prefersReducedMotion ? { opacity: 0.4 } : { opacity: 0 }}
          whileInView={{ opacity: 0.4 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </div>
    );
  }

  // ─── Line preset ──────────────────────────────────────────────────────
  if (preset === 'line') {
    return (
      <div
        className={cn(wrapperClass, 'flex items-center justify-center')}
        aria-hidden="true"
      >
        <motion.div
          className="h-px"
          style={{ background: color, opacity: 0.5 }}
          initial={prefersReducedMotion ? { width: '60%' } : { width: '0%' }}
          whileInView={{ width: '60%' }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      </div>
    );
  }

  // ─── Particles preset ─────────────────────────────────────────────────
  // 12 scattered dots, staggered fade-in. Under reduced-motion they're all
  // visible immediately (the stagger would be a vestibular trigger).
  return (
    <div className={wrapperClass} aria-hidden="true">
      {dots.map((dot) => (
        <motion.span
          key={dot.id}
          className="absolute rounded-full"
          style={{
            left: `${dot.left}%`,
            top: `${dot.top}%`,
            width: dot.size,
            height: dot.size,
            background: color,
          }}
          initial={prefersReducedMotion ? { opacity: 0.5 } : { opacity: 0 }}
          whileInView={{ opacity: 0.5 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : dot.delay }}
        />
      ))}
    </div>
  );
}

export default SectionTransition;
