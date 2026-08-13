'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Mission 5.9.5 — Phase A
 * SafeArea — wrapper that respects device safe-area insets (iOS notch,
 * home indicator, Android gesture nav). Composes with the CSS utilities
 * `.pt-safe`, `.pb-safe`, etc.
 *
 * Usage:
 *   <SafeArea top bottom>...</SafeArea>           // padding top + bottom
 *   <SafeArea inset="all">...</SafeArea>          // padding all sides
 *   <SafeArea inset="top" as="header">...</SafeArea>
 */

type Inset = 'top' | 'bottom' | 'left' | 'right' | 'all'

interface SafeAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Shorthand: pass a single inset to apply */
  inset?: Inset
  /** Boolean props for combining insets */
  top?: boolean
  bottom?: boolean
  left?: boolean
  right?: boolean
  /** Render as a different element (header / footer / main / section) */
  as?: React.ElementType
}

export function SafeArea({
  inset,
  top,
  bottom,
  left,
  right,
  as: Comp = 'div',
  className,
  children,
  ...props
}: SafeAreaProps) {
  const top2 = top || inset === 'top' || inset === 'all'
  const bottom2 = bottom || inset === 'bottom' || inset === 'all'
  const left2 = left || inset === 'left' || inset === 'all'
  const right2 = right || inset === 'right' || inset === 'all'

  return (
    <Comp
      className={cn(
        top2 && 'pt-safe',
        bottom2 && 'pb-safe',
        left2 && 'pl-safe',
        right2 && 'pr-safe',
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

/** AppShell — sticky-footer root wrapper (mobile-first) */
interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType
}

export function AppShell({ as: Comp = 'div', className, children, ...props }: AppShellProps) {
  return (
    <Comp className={cn('app-shell', className)} {...props}>
      {children}
    </Comp>
  )
}

/** AppMain — flex-grow main content region */
export function AppMain({ as: Comp = 'main', className, children, ...props }: AppShellProps) {
  return (
    <Comp className={cn('app-main', className)} {...props}>
      {children}
    </Comp>
  )
}

/** AppFooter — sticky footer that respects safe-area bottom */
export function AppFooter({ as: Comp = 'footer', className, children, ...props }: AppShellProps) {
  return (
    <Comp className={cn('app-footer pb-safe', className)} {...props}>
      {children}
    </Comp>
  )
}
