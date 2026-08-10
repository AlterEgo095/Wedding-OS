// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/GlassCard.tsx
// Phase 2D (MISSION 5.9.0) — Token-driven glass container.
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the ad-hoc `.glass-card` CSS class with a typed, token-driven
// component. Reads the Phase 1A tokens (`--glass-bg`, `--glass-border`,
// `--glass-blur`) instead of hardcoding oklch values, so theme overrides
// (e.g. Cinematic Dark's stronger blur) propagate without code changes.
//
// Variants:
//   - default:    standard glass surface (used for cards, hero panels)
//   - elevated:   stronger shadow + brighter border (used for modals, popovers)
//   - subtle:     minimal blur, low-opacity border (used for nested groupings)
//
// Accessibility:
//   - When `prefers-reduced-motion: reduce` is set (via framer-motion's
//     `useReducedMotion()`), the hover lift + gold shadow are disabled.
//   - The card itself remains focusable-content-bearing; no aria roles are
//     injected (consumers compose semantics inside).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { ReactNode, ElementType } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Visual strength of the glass surface. */
export type GlassCardVariant = 'default' | 'elevated' | 'subtle';

/** Polymorphic root element — limited to block-level containers. */
export type GlassCardAs = 'div' | 'section' | 'article' | 'aside';

export interface GlassCardProps {
  /** Card content. */
  children: ReactNode;
  /** Extra Tailwind classes (merged after variant classes). */
  className?: string;
  /** Visual variant — see file header. */
  variant?: GlassCardVariant;
  /** When true, applies a subtle lift + gold shadow on hover (skipped if
   *  prefers-reduced-motion is set). */
  hover?: boolean;
  /** Root element type — defaults to `div`. */
  as?: GlassCardAs;
}

/** Variant → class map. All values use the Phase 1A tokens. */
const VARIANT_CLASSES: Record<GlassCardVariant, string> = {
  default: 'bg-[var(--glass-bg)] border-[var(--glass-border)]',
  elevated:
    'bg-[var(--glass-bg)] border-[var(--glass-border)] shadow-[0_8px_40px_oklch(0.18_0.02_60/0.18)]',
  subtle:
    'bg-[var(--glass-bg)]/60 border-[var(--glass-border)]/60',
};

/**
 * GlassCard — token-driven glassmorphism container.
 *
 * Renders a `<div>` (or `section`/`article`/`aside` via `as`) with a
 * backdrop-blur surface, glass-tinted background, and gold border, using
 * the `--glass-bg` / `--glass-border` / `--glass-blur` tokens.
 *
 * @example
 *   <GlassCard variant="elevated" hover>
 *     <h3>Save the date</h3>
 *   </GlassCard>
 */
export function GlassCard({
  children,
  className,
  variant = 'default',
  hover = false,
  as = 'div',
}: GlassCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const Comp = as as ElementType;

  // Hover lift is skipped under reduced-motion — the spec requires the
  // hover affordance to be visible only when motion is allowed.
  const hoverClasses =
    hover && !prefersReducedMotion
      ? 'transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold)]'
      : '';

  return (
    <Comp
      className={cn(
        'rounded-2xl backdrop-blur-[var(--glass-blur)] border',
        VARIANT_CLASSES[variant],
        hoverClasses,
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export default GlassCard;
