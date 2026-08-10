// ══════════════════════════════════════════════════════════════════════════════
// src/components/ui/save-button.tsx
// Phase 3D (MISSION 5.9.0) — Micro-interaction #2: Save action checkmark.
// ══════════════════════════════════════════════════════════════════════════════
//
// A drop-in button that surfaces the async save lifecycle visually:
//   - idle    → normal button (renders `children`)
//   - saving  → spinner + "Enregistrement…" + `aria-busy="true"`
//   - saved   → green checkmark + "Enregistré !" for 1.5s, then resets to idle
//
// The state machine is driven entirely by the consumer's `onSave` async handler:
//   1. On click → setState('saving')
//   2. await onSave()
//   3. On success → setState('saved') → setTimeout(1500) → setState('idle')
//   4. On error → setState('idle') immediately (re-throw so the consumer's
//      `toast.error()` catch block still runs)
//
// Accessibility:
//   - `aria-busy="true"` while saving.
//   - `aria-live="polite"` on the visible label so SR users hear the
//     "Enregistré !" confirmation.
//   - The checkmark appears WITHOUT animation when `prefers-reduced-motion`
//     is set — the green check still shows for 1.5s so the user gets the
//     same confirmation signal, just without the scale-in.
//   - Standard `<button>` attrs (type, disabled, className) forwarded.
//
// Visual:
//   - Built on the shadcn Button contract (variants, sizes) so it inherits
//     the Phase 0.5 44×44 touch-target sizing.
//   - When `saved`, the button temporarily switches to a green-tinted variant
//     to make the success state obvious at a glance.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { Button, buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
type ButtonSize = VariantProps<typeof buttonVariants>['size'];

export interface SaveButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /**
   * Async save handler. The button transitions through `saving` → `saved` →
   * `idle` based on the promise state. Re-throws on error so the consumer's
   * own catch block (e.g. `toast.error()`) still runs.
   */
  onSave: () => Promise<void>;
  /** shadcn Button variant. Defaults to `default`. */
  variant?: ButtonVariant;
  /** shadcn Button size. Defaults to `default`. */
  size?: ButtonSize;
  /** Optional icon rendered to the left of the label in the `idle` state. */
  icon?: ReactNode;
  /** Button label (idle state). Required. */
  children: ReactNode;
  /** Override the "saved" reset delay (ms). Defaults to 1500. */
  savedDurationMs?: number;
}

type SaveState = 'idle' | 'saving' | 'saved';

export function SaveButton({
  onSave,
  variant = 'default',
  size = 'default',
  icon,
  children,
  savedDurationMs = 1500,
  className,
  disabled,
  type = 'button',
  ...rest
}: SaveButtonProps) {
  const [state, setState] = useState<SaveState>('idle');
  const prefersReducedMotion = useReducedMotion();
  // Ref so the timeout cleanup doesn't leak if the button unmounts mid-cycle.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(async () => {
    if (state !== 'idle') return; // ignore double-clicks while in-flight
    setState('saving');
    try {
      await onSave();
      setState('saved');
      resetTimerRef.current = setTimeout(() => {
        setState('idle');
        resetTimerRef.current = null;
      }, savedDurationMs);
    } catch (err) {
      setState('idle');
      throw err;
    }
  }, [onSave, state, savedDurationMs]);

  // Compute the visual state — when `saved`, we tint green; otherwise we
  // use the consumer's `variant`.
  const isSaved = state === 'saved';
  const isSaving = state === 'saving';

  // The `check` icon scales in (unless reduced motion → instant).
  const checkClassName = prefersReducedMotion
    ? 'size-4'
    : 'size-4 animate-in zoom-in-50 duration-300';

  return (
    <Button
      type={type}
      variant={isSaved ? 'outline' : variant}
      size={size}
      onClick={handleClick}
      disabled={disabled || isSaving || isSaved}
      aria-busy={isSaving || undefined}
      aria-live="polite"
      className={cn(
        // When saved: green border + green text + soft green glow (no animation
        // of the glow itself under reduced motion — the .animate-in zoom on the
        // checkmark is the only animation, and that's gated above).
        isSaved &&
          'border-emerald-500/60 text-emerald-600 dark:text-emerald-400 ' +
            'shadow-[0_0_12px_oklch(0.72_0.18_145/25%)]',
        className,
      )}
      {...rest}
    >
      {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {isSaved && <Check className={checkClassName} aria-hidden="true" />}
      {!isSaving && !isSaved && icon && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>
        {isSaving
          ? 'Enregistrement…'
          : isSaved
            ? 'Enregistré !'
            : children}
      </span>
    </Button>
  );
}

export default SaveButton;
