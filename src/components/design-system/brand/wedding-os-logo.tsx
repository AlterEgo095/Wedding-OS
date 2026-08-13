/**
 * MISSION 5.9.5 — PHASE G: BRAND SYSTEM
 * WeddingOSLogo — the master logo abstraction.
 *
 * One component, eight variants. Composes <WeddingOSMark> + <WeddingOSWordmark>
 * into the canonical brand lockups.
 *
 * Variants:
 *  - primary    : circle + W/O + wordmark + tagline        (hero, about)
 *  - lockup     : W/O + wordmark (no circle, no tagline)    (header horizontal)
 *  - mark       : W/O monogram in circle                    (nav, favicon)
 *  - monogram   : W/O letters only (no circle)              (mobile compact)
 *  - compact    : W/O + "Wedding OS" inline (small)         (sidebar header)
 *  - wordmark   : "WEDDING OS" text only                    (footer, emails)
 *  - monochrome : single-color (currentColor) lockup        (emboss, overlays)
 *  - watermark  : low-opacity monogram                      (bg watermark)
 *
 * Theme:
 *  - 'auto'  (default): inherits from page (Tailwind dark: variant).
 *                       Tagline uses muted-foreground (theme-aware).
 *  - 'light' : forces light styling (dark text on light bg).
 *  - 'dark'  : forces dark styling (light text on dark bg).
 *
 * Implementation:
 *  - Server component (no 'use client'). Theme is handled via Tailwind
 *    dark: variants (configured via @custom-variant dark in globals.css).
 *  - The mark + wordmark use a single gold gradient that works on both
 *    light and dark backgrounds (it contains both highlights and shadows).
 *  - For 'monochrome' variant, mark + wordmark use currentColor.
 *
 * Accessibility:
 *  - Every variant has role="img" + aria-label (overridable).
 *  - Decorative use: consumer sets aria-hidden="true" via ...props.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { WeddingOSMark, type WeddingOSMarkSize } from './wedding-os-mark'
import { WeddingOSWordmark, type WeddingOSWordmarkSize } from './wedding-os-wordmark'

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type WeddingOSLogoVariant =
  | 'primary'
  | 'lockup'
  | 'mark'
  | 'monogram'
  | 'compact'
  | 'wordmark'
  | 'monochrome'
  | 'watermark'

export type WeddingOSLogoTheme = 'auto' | 'light' | 'dark'
export type WeddingOSLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export interface WeddingOSLogoProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    | 'onDrag'
    | 'onDragStart'
    | 'onDragEnd'
    | 'onDragEnter'
    | 'onDragLeave'
    | 'onDragOver'
    | 'onDragExit'
    | 'onAnimationStart'
    | 'onAnimationEnd'
    | 'onAnimationIteration'
  > {
  /** Logo variant. Default 'primary'. */
  variant?: WeddingOSLogoVariant
  /** Theme. Default 'auto' (inherits from page). */
  theme?: WeddingOSLogoTheme
  /** Size preset. Default 'md'. */
  size?: WeddingOSLogoSize
  /** Show "CREATE · MANAGE · CELEBRATE" tagline (primary only). */
  showTagline?: boolean
  /** Show "THE ULTIMATE WEDDING PLATFORM" descriptor (primary only). */
  showDescriptor?: boolean
  /** Show thin outer circle around the monogram (default per-variant). */
  showCircle?: boolean
  /** Accessible label. Default 'Wedding OS'. */
  ariaLabel?: string
}

/* ----------------------------------------------------------------
   Size → component size mapping
   The mark and wordmark share the same size scale (xs..2xl) so they
   stay in proportion. Tagline + descriptor use a smaller derived size.
---------------------------------------------------------------- */
const TAGLINE_SIZE: Record<WeddingOSLogoSize, number> = {
  xs: 6,
  sm: 7,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 14,
}

const DESCRIPTOR_SIZE: Record<WeddingOSLogoSize, number> = {
  xs: 5,
  sm: 6,
  md: 7,
  lg: 8,
  xl: 9,
  '2xl': 10,
}

/* ----------------------------------------------------------------
   Theme → text color classes
   - 'auto'  : Tailwind dark: variant (inherits from page).
   - 'light' : forced dark text (consumer promises a light bg).
   - 'dark'  : forced light text (consumer promises a dark bg).
---------------------------------------------------------------- */
function taglineClass(theme: WeddingOSLogoTheme): string {
  switch (theme) {
    case 'light':
      return 'text-ink/60'
    case 'dark':
      return 'text-ivory/60'
    case 'auto':
    default:
      return 'text-ink/60 dark:text-ivory/60'
  }
}

function descriptorClass(theme: WeddingOSLogoTheme): string {
  switch (theme) {
    case 'light':
      return 'text-ink/40'
    case 'dark':
      return 'text-ivory/40'
    case 'auto':
    default:
      return 'text-ink/40 dark:text-ivory/40'
  }
}

/* ----------------------------------------------------------------
   Decorative separators between tagline words
   "CREATE · MANAGE · CELEBRATE" — the · is a centered dot.
---------------------------------------------------------------- */
const TAGLINE_TEXT = 'CREATE · MANAGE · CELEBRATE'
const DESCRIPTOR_TEXT = 'THE ULTIMATE WEDDING PLATFORM'

/* ----------------------------------------------------------------
   Component
---------------------------------------------------------------- */
export function WeddingOSLogo({
  variant = 'primary',
  theme = 'auto',
  size = 'md',
  showTagline = false,
  showDescriptor = false,
  showCircle,
  className,
  ariaLabel = 'Wedding OS',
  ...props
}: WeddingOSLogoProps) {
  const markSize = size as WeddingOSMarkSize
  const wordmarkSize = size as WeddingOSWordmarkSize
  const taglinePx = TAGLINE_SIZE[size]
  const descriptorPx = DESCRIPTOR_SIZE[size]

  // Resolve `showCircle` default per-variant:
  //  - primary, mark: default true (luxury framing)
  //  - lockup, monogram, compact, wordmark, monochrome, watermark: default false
  const resolvedShowCircle =
    showCircle ?? (variant === 'primary' || variant === 'mark')

  // For 'monochrome' variant, the mark + wordmark render with currentColor.
  const isMonochrome = variant === 'monochrome'
  // For 'watermark' variant, render a low-opacity monogram.
  const isWatermark = variant === 'watermark'

  /* ---------- Variant: watermark ---------- */
  if (isWatermark) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn('inline-block opacity-[0.06] pointer-events-none', className)}
        {...props}
      >
        <WeddingOSMark
          size={markSize}
          withCircle={resolvedShowCircle}
          withHeart
          monochrome
        />
      </div>
    )
  }

  /* ---------- Variant: mark (just the monogram + circle) ---------- */
  if (variant === 'mark') {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn('inline-flex', className)}
        {...props}
      >
        <WeddingOSMark
          size={markSize}
          withCircle={resolvedShowCircle}
          withHeart
          monochrome={isMonochrome}
        />
      </div>
    )
  }

  /* ---------- Variant: monogram (W/O letters only, no circle) ---------- */
  if (variant === 'monogram') {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn('inline-flex', className)}
        {...props}
      >
        <WeddingOSMark
          size={markSize}
          withCircle={false}
          withHeart
          monochrome={isMonochrome}
        />
      </div>
    )
  }

  /* ---------- Variant: wordmark (text only) ---------- */
  if (variant === 'wordmark') {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn('inline-flex', className)}
        {...props}
      >
        <WeddingOSWordmark
          size={wordmarkSize}
          monochrome={isMonochrome}
          withHeart
        />
      </div>
    )
  }

  /* ---------- Variant: compact (W/O + small wordmark inline) ---------- */
  if (variant === 'compact') {
    // For compact, the wordmark is one size smaller than the mark for
    // visual balance (e.g., md mark + sm wordmark).
    const compactWordmarkSize = (size === 'xs' ? 'xs' : size === 'sm' ? 'xs' : size === 'md' ? 'sm' : size === 'lg' ? 'md' : size === 'xl' ? 'lg' : 'xl') as WeddingOSWordmarkSize
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn('inline-flex items-center gap-2', className)}
        {...props}
      >
        <WeddingOSMark
          size={markSize}
          withCircle={false}
          withHeart
          monochrome={isMonochrome}
        />
        <WeddingOSWordmark
          size={compactWordmarkSize}
          monochrome={isMonochrome}
          withHeart={false}
        />
      </div>
    )
  }

  /* ---------- Variant: lockup (W/O + wordmark, no circle/tagline) ---------- */
  if (variant === 'lockup' || variant === 'monochrome') {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn('inline-flex items-center gap-3', className)}
        {...props}
      >
        <WeddingOSMark
          size={markSize}
          withCircle={false}
          withHeart
          monochrome={isMonochrome}
        />
        <WeddingOSWordmark
          size={wordmarkSize}
          monochrome={isMonochrome}
          withHeart
        />
      </div>
    )
  }

  /* ---------- Variant: primary (full lockup) ---------- */
  // primary: circle + W/O + wordmark + tagline (vertical stack)
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('inline-flex flex-col items-center gap-3 sm:gap-4', className)}
      {...props}
    >
      <WeddingOSMark
        size={markSize}
        withCircle={resolvedShowCircle}
        withHeart
        monochrome={isMonochrome}
      />
      <div className="flex flex-col items-center gap-1.5">
        <WeddingOSWordmark
          size={wordmarkSize}
          monochrome={isMonochrome}
          withHeart
        />
        {showTagline && (
          <span
            className={cn(
              'font-sans font-medium uppercase tracking-[0.35em] whitespace-nowrap',
              taglineClass(theme)
            )}
            style={{ fontSize: `${taglinePx}px` }}
          >
            {TAGLINE_TEXT}
          </span>
        )}
        {showDescriptor && (
          <span
            className={cn(
              'font-sans uppercase tracking-[0.2em] whitespace-nowrap',
              descriptorClass(theme)
            )}
            style={{ fontSize: `${descriptorPx}px` }}
          >
            {DESCRIPTOR_TEXT}
          </span>
        )}
      </div>
    </div>
  )
}
