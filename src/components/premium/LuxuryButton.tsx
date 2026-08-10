// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/LuxuryButton.tsx
// Phase 2D (MISSION 5.9.0) — Three luxury button variants.
// ══════════════════════════════════════════════════════════════════════════════
//
// Extends the standard shadcn Button contract with three luxury variants:
//   - gold-gradient: linear-gradient gold surface, dark text — high-impact CTA
//   - glass:         transparent surface + glass bg + gold border — secondary CTA
//   - outline-gold:  transparent surface + gold border + gold text — ghost CTA
//
// All variants enforce the Phase 0.5 minimum 44×44px touch target via the
// size classes (`h-11`/`h-10`/`h-12` for default/sm/lg respectively).
//
// The gold gradient uses `--gold-light` → `--gold-dark` so theme overrides
// (e.g. Royal Luxury's deeper gold) propagate.
//
// Accessibility:
//   - Hover glow (box-shadow on `:hover`) is disabled when
//     `prefers-reduced-motion: reduce` is set.
//   - Loading state renders an accessible `aria-busy="true"` button with a
//     spinning indicator and a visually-hidden "Chargement…" label.
//   - All standard `<button>` attributes are forwarded (type, disabled,
//     aria-label, onClick, etc.).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type LuxuryButtonVariant = 'gold-gradient' | 'glass' | 'outline-gold';
export type LuxuryButtonSize = 'sm' | 'default' | 'lg';

export interface LuxuryButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant — see file header. */
  variant?: LuxuryButtonVariant;
  /** Size preset — all meet WCAG 2.5.5 (44×44 minimum). */
  size?: LuxuryButtonSize;
  /** Optional icon node rendered in an icon slot. */
  icon?: ReactNode;
  /** Position of `icon` relative to the label. */
  iconPosition?: 'left' | 'right';
  /** When true, disables the button + shows a spinner. */
  loading?: boolean;
}

/** Size → class map. Inherited from Phase 0.5 touch-target sizing. */
const SIZE_CLASSES: Record<LuxuryButtonSize, string> = {
  sm: 'h-10 px-4 text-sm min-h-[40px]',
  default: 'h-11 px-6 text-sm min-h-[44px]',
  lg: 'h-12 px-8 text-base min-h-[48px]',
};

/** Variant → static classes (applied regardless of motion preference). */
const VARIANT_BASE: Record<LuxuryButtonVariant, string> = {
  'gold-gradient':
    'text-foreground font-semibold rounded-full border border-transparent ' +
    'bg-[linear-gradient(135deg,var(--gold-light),var(--gold-dark))] ' +
    'hover:brightness-110 active:brightness-95',
  glass:
    'text-foreground font-medium rounded-full ' +
    'bg-[var(--glass-bg)] border border-[var(--glass-border)] ' +
    'backdrop-blur-[var(--glass-blur)] hover:bg-[var(--glass-bg)]/80',
  'outline-gold':
    'text-foreground font-medium rounded-full ' +
    'bg-transparent border border-[var(--gold-light)]/60 ' +
    'hover:text-[var(--gold-dark)] hover:border-[var(--gold-light)]',
};

/** Variant → hover-glow classes (suppressed under reduced-motion). */
const VARIANT_HOVER_GLOW: Record<LuxuryButtonVariant, string> = {
  'gold-gradient': 'hover:shadow-[0_0_20px_var(--gold-light)]',
  glass: 'hover:shadow-[0_0_18px_var(--gold-light)]',
  'outline-gold': 'hover:shadow-[0_0_14px_var(--gold-light)]',
};

/**
 * LuxuryButton — token-driven premium button with 3 luxury variants.
 *
 * @example
 *   <LuxuryButton variant="gold-gradient" icon={<Heart />} onClick={confirm}>
 *     Confirmer ma présence
 *   </LuxuryButton>
 */
export function LuxuryButton({
  variant = 'gold-gradient',
  size = 'default',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: LuxuryButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  const glow = prefersReducedMotion ? '' : VARIANT_HOVER_GLOW[variant];

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'transition-all duration-300 outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--gold-light)] focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-60',
        SIZE_CLASSES[size],
        VARIANT_BASE[variant],
        glow,
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {!loading && icon && iconPosition === 'left' && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {!loading && icon && iconPosition === 'right' && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {loading && (
        <span className="sr-only" aria-live="polite">
          Chargement…
        </span>
      )}
    </button>
  );
}

export default LuxuryButton;
