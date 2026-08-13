'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Mission 5.9.5 — Phase A
 * FluidHeading — fluid premium headings using the clamp-based type scale.
 * Renders an H1–H6 with fluid sizing, tight leading, balanced wrapping.
 */

type Level = 1 | 2 | 3 | 4 | 5 | 6

interface FluidHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: Level
  /** Optional eyebrow / kicker rendered above the heading */
  eyebrow?: string
  /** Optional gradient treatment (gold / emerald) */
  gradient?: 'none' | 'gold' | 'emerald'
  /** Balance text wrapping (premium typography) */
  balance?: boolean
}

const sizeByLevel: Record<Level, string> = {
  1: 'text-fluid-5xl font-bold',
  2: 'text-fluid-4xl font-semibold',
  3: 'text-fluid-3xl font-semibold',
  4: 'text-fluid-2xl font-semibold',
  5: 'text-fluid-xl font-semibold',
  6: 'text-fluid-lg font-medium',
}

const gradientClass = {
  none: '',
  gold: 'text-gradient-gold',
  emerald: 'text-gradient-emerald',
}

export function FluidHeading({
  level = 2,
  eyebrow,
  gradient = 'none',
  balance = true,
  className,
  children,
  ...props
}: FluidHeadingProps) {
  const Tag = `h${level}` as React.ElementType
  return (
    <div className="flex flex-col gap-2">
      {eyebrow && (
        <span className="text-fluid-xs font-semibold uppercase tracking-[var(--tracking-widest)] text-[var(--gold)]">
          {eyebrow}
        </span>
      )}
      <Tag
        className={cn(
          sizeByLevel[level],
          'leading-[var(--leading-tight)] tracking-[var(--tracking-tight)]',
          gradientClass[gradient],
          balance && 'text-balance',
          className
        )}
        {...props}
      >
        {children}
      </Tag>
    </div>
  )
}

/** FluidText — fluid body paragraph with leading + wrapping defaults */
interface FluidTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  size?: 'sm' | 'base' | 'lg' | 'xl'
  muted?: boolean
  leading?: 'tight' | 'snug' | 'normal' | 'relaxed'
}

const textSize = {
  sm: 'text-fluid-sm',
  base: 'text-fluid-base',
  lg: 'text-fluid-lg',
  xl: 'text-fluid-xl',
}

const leadingClass = {
  tight: 'leading-[var(--leading-tight)]',
  snug: 'leading-[var(--leading-snug)]',
  normal: 'leading-[var(--leading-normal)]',
  relaxed: 'leading-[var(--leading-relaxed)]',
}

export function FluidText({
  size = 'base',
  muted = false,
  leading = 'normal',
  className,
  children,
  ...props
}: FluidTextProps) {
  return (
    <p
      className={cn(
        textSize[size],
        leadingClass[leading],
        muted && 'text-muted-foreground',
        'text-pretty',
        className
      )}
      {...props}
    >
      {children}
    </p>
  )
}
