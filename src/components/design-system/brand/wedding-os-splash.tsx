/**
 * MISSION 5.9.5 — PHASE G: BRAND SYSTEM
 * WeddingOSSplash — premium loading/splash screen for PWA + loading states.
 *
 * Design:
 *  - Centered monogram (W/O in circle) with subtle pulse animation
 *    (opacity 0.7 → 1.0, 2.5s ease-in-out, infinite).
 *  - "WEDDING OS" wordmark below the monogram.
 *  - "CREATE · MANAGE · CELEBRATE" tagline below the wordmark.
 *  - Optional spinner (thin gold ring, rotating 1.5s linear infinite).
 *  - Dark background (obsidian #0A0A0A) with subtle radial gold glow.
 *
 * Variants:
 *  - fullScreen=true (default): fixed inset-0, covers entire viewport.
 *    Used for PWA splash, route transitions, app boot.
 *  - fullScreen=false: inline-block, sized to content. Used as a card
 *    loading state or embedded loader.
 *
 * Accessibility:
 *  - role="status" + aria-live="polite" + aria-label="Loading Wedding OS".
 *  - Spinner has aria-hidden="true" (decorative — the label conveys state).
 *  - Respect prefers-reduced-motion (useReducedMotion disables pulse +
 *    rotation, replaces with a static "Loading..." text alternative).
 */

'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { WeddingOSMark, type WeddingOSMarkSize } from './wedding-os-mark'
import { WeddingOSWordmark, type WeddingOSWordmarkSize } from './wedding-os-wordmark'

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type WeddingOSSplashSize = 'sm' | 'md' | 'lg' | 'xl'

export interface WeddingOSSplashProps
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
  /** Size preset (controls monogram + wordmark scale). Default 'lg'. */
  size?: WeddingOSSplashSize
  /** Show a thin gold spinner ring below the wordmark. Default false. */
  showSpinner?: boolean
  /** Full-screen fixed overlay (default) vs inline-block. Default true. */
  fullScreen?: boolean
  /** Accessible label. Default 'Loading Wedding OS'. */
  'aria-label'?: string
}

/* ----------------------------------------------------------------
   Size mapping
   Splash sizes start at 'sm' (no xs — too small for a splash). The
   monogram + wordmark share the size scale.
---------------------------------------------------------------- */
const SPLASH_MARK_SIZE: Record<WeddingOSSplashSize, WeddingOSMarkSize> = {
  sm: 'md',
  md: 'lg',
  lg: 'xl',
  xl: '2xl',
}

const SPLASH_WORDMARK_SIZE: Record<WeddingOSSplashSize, WeddingOSWordmarkSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'xl',
  xl: '2xl',
}

const TAGLINE_PX: Record<WeddingOSSplashSize, number> = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
}

const SPINNER_PX: Record<WeddingOSSplashSize, number> = {
  sm: 20,
  md: 28,
  lg: 36,
  xl: 44,
}

/* ----------------------------------------------------------------
   Component
---------------------------------------------------------------- */
export function WeddingOSSplash({
  size = 'lg',
  showSpinner = false,
  fullScreen = true,
  className,
  'aria-label': ariaLabel = 'Loading Wedding OS',
  ...props
}: WeddingOSSplashProps) {
  const prefersReducedMotion = useReducedMotion()
  const markSize = SPLASH_MARK_SIZE[size]
  const wordmarkSize = SPLASH_WORDMARK_SIZE[size]
  const taglinePx = TAGLINE_PX[size]
  const spinnerPx = SPINNER_PX[size]

  // Pulse animation: opacity 0.7 → 1.0 → 0.7, 2.5s ease-in-out, infinite.
  // When prefersReducedMotion, render statically at opacity 1.
  const pulseProps = prefersReducedMotion
    ? {}
    : {
        animate: { opacity: [0.7, 1, 0.7] },
        transition: {
          duration: 2.5,
          ease: 'easeInOut' as const,
          repeat: Infinity,
          repeatType: 'loop' as const,
        },
      }

  // Spinner rotation: 1.5s linear infinite.
  // When prefersReducedMotion, render a static "Loading…" text alternative.
  const spinnerProps = prefersReducedMotion
    ? {}
    : {
        animate: { rotate: 360 },
        transition: {
          duration: 1.5,
          ease: 'linear' as const,
          repeat: Infinity,
        },
      }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={cn(
        // Obsidian dark background with radial gold glow
        'relative flex flex-col items-center justify-center gap-5',
        'bg-[#0A0A0A] text-[#FAF6F0]',
        'before:pointer-events-none before:absolute before:inset-0',
        'before:bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.15)_0%,transparent_60%)]',
        fullScreen && 'fixed inset-0 z-[1090]',
        className
      )}
      {...props}
    >
      <motion.div
        className="relative z-10 flex flex-col items-center gap-4"
        {...pulseProps}
      >
        <WeddingOSMark
          size={markSize}
          withCircle
          withHeart
          aria-label="Wedding OS"
        />
        <div className="flex flex-col items-center gap-2">
          <WeddingOSWordmark
            size={wordmarkSize}
            withHeart
            aria-label="Wedding OS"
          />
          <span
            className="font-sans font-medium uppercase tracking-[0.35em] text-[#D4AF37]/70 whitespace-nowrap"
            style={{ fontSize: `${taglinePx}px` }}
          >
            CREATE · MANAGE · CELEBRATE
          </span>
        </div>
      </motion.div>

      {showSpinner && (
        <div className="relative z-10 mt-2">
          {prefersReducedMotion ? (
            <span className="font-sans text-xs uppercase tracking-[0.3em] text-[#D4AF37]/70">
              Loading…
            </span>
          ) : (
            <motion.svg
              width={spinnerPx}
              height={spinnerPx}
              viewBox="0 0 40 40"
              className="inline-block"
              aria-hidden="true"
              {...spinnerProps}
            >
              <circle
                cx="20"
                cy="20"
                r="17"
                fill="none"
                stroke="#D4AF37"
                strokeOpacity="0.2"
                strokeWidth="2"
              />
              <circle
                cx="20"
                cy="20"
                r="17"
                fill="none"
                stroke="#D4AF37"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="80"
                strokeDashoffset="60"
              />
            </motion.svg>
          )}
        </div>
      )}

      {/* Screen-reader-only live region for status updates */}
      <span className="sr-only">{ariaLabel}</span>
    </div>
  )
}
