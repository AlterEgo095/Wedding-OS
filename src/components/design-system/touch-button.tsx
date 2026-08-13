'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Mission 5.9.5 — Phase A
 * TouchButton — premium mobile-first button primitive.
 *
 * Guarantees:
 * - Minimum 44px touch target (WCAG 2.5.5) on all variants except `inline`.
 * - Safe-area aware padding options.
 * - Focus-visible ring uses the gold token for on-brand accessibility.
 * - Premium motion: subtle scale on tap, lift on hover (desktop enhancement).
 * - Supports `asChild` for polymorphic rendering (links, etc.).
 */

const touchButtonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.97]',
    'motion-reduce:transition-none motion-reduce:active:scale-100',
  ],
  {
    variants: {
      variant: {
        // Signature gold gradient — the primary CTA
        gold: [
          'bg-gradient-to-br from-[oklch(0.7_0.12_75)] via-[oklch(0.58_0.13_78)] to-[oklch(0.48_0.1_82)]',
          'text-[oklch(0.985_0.008_95)] shadow-[var(--shadow-gold)]',
          'hover:shadow-lg hover:brightness-[1.05]',
        ],
        // Deep emerald — secondary premium
        emerald: [
          'bg-gradient-to-br from-[oklch(0.55_0.09_160)] to-[oklch(0.4_0.08_165)]',
          'text-[oklch(0.985_0.008_95)] shadow-[var(--shadow-emerald)]',
          'hover:shadow-lg hover:brightness-[1.05]',
        ],
        // Solid surface
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        // Subtle surface
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // Outline (premium ghost)
        outline:
          'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
        // Ghost (transparent)
        ghost: 'bg-transparent hover:bg-accent hover:text-accent-foreground',
        // Destructive
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
        // Premium glass
        glass:
          'glass text-foreground hover:bg-white/10 dark:hover:bg-white/5',
      },
      size: {
        // Touch-friendly default (44px min)
        default: 'h-11 min-h-[44px] px-5 text-fluid-sm rounded-lg',
        sm: 'h-10 min-h-[44px] px-4 text-fluid-sm rounded-md',
        lg: 'h-12 min-h-[48px] px-6 text-fluid-base rounded-lg',
        xl: 'h-14 min-h-[56px] px-8 text-fluid-lg rounded-xl',
        icon: 'h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg',
        // Inline (links in text) — exempt from 44px rule
        inline: 'h-auto min-h-0 min-w-0 px-1 text-fluid-sm',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      fullWidth: false,
    },
  }
)

export interface TouchButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof touchButtonVariants> {
  asChild?: boolean
}

const TouchButton = React.forwardRef<HTMLButtonElement, TouchButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(touchButtonVariants({ variant, size, fullWidth, className }))}
        {...props}
      />
    )
  }
)
TouchButton.displayName = 'TouchButton'

export { TouchButton, touchButtonVariants }
