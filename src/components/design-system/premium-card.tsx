'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Mission 5.9.5 — Phase A
 * PremiumCard — mobile-first card primitive with premium surface,
 * soft shadow, and optional gold/emerald accent rails.
 */

type AccentVariant = 'none' | 'gold' | 'emerald' | 'blush'

interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: AccentVariant
  interactive?: boolean
  padded?: boolean
}

const accentRail: Record<AccentVariant, string> = {
  none: '',
  gold: 'before:bg-[var(--gold)]',
  emerald: 'before:bg-[var(--emerald-brand)]',
  blush: 'before:bg-[var(--blush)]',
}

export const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, accent = 'none', interactive = false, padded = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-2xl bg-card text-card-foreground border border-border',
          'shadow-[var(--shadow-md)]',
          'before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:opacity-0 before:transition-opacity',
          accent !== 'none' && accentRail[accent],
          interactive &&
            'transition-all duration-300 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 cursor-pointer hover:before:opacity-100',
          padded && 'p-5 sm:p-6',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
PremiumCard.displayName = 'PremiumCard'

/** Card sub-components for consistent structure */
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-fluid-lg font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-fluid-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-fluid-sm', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center pt-4', className)} {...props} />
}
