/**
 * MISSION 5.9.5 — PHASE G: BRAND SYSTEM
 * WeddingOSWordmark — the "WEDDING OS" text logo.
 *
 * Design:
 *  - Premium serif (Playfair Display → Cormorant → Georgia fallback)
 *  - Wide letter-spacing (0.2em) for luxury feel
 *  - Uppercase
 *  - 3-stop gold gradient text (background-clip: text) when colored
 *  - currentColor when monochrome (consumer sets text color)
 *  - Optional heart accent inside the "O" of "OS"
 *
 * Implementation notes:
 *  - Polymorphic `as` prop (default 'span') for semantic flexibility
 *  - The heart is a small SVG positioned absolutely inside the O letter's
 *    bounding box. We can't truly "cut it out" of the letter (would need
 *    SVG text + mask, fragile across fonts) so we render it as a visible
 *    accent INSIDE the O's counter — premium and recognizable.
 *  - The gold gradient is applied via CSS `background-clip: text` on the
 *    parent, so the heart needs its OWN gradient (defined in a hidden
 *    <svg> with a <linearGradient>). This ensures the heart matches the
 *    text gradient exactly.
 *  - For monochrome, the heart uses `currentColor` — same as the text.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type WeddingOSWordmarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/**
 * Polymorphic component props. We accept any HTML element type via `as`,
 * but for type-safety we restrict to a known set of semantic tags that
 * make sense for a wordmark (span, div, h1-h6, p, a).
 */
type AsTag = 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'a'

export type WeddingOSWordmarkProps<T extends AsTag = 'span'> = Omit<
  React.HTMLAttributes<HTMLElement>,
  // Omit drag/animation handlers (framer-motion safety — same pattern as
  // Phase E/F SVG components).
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
> & {
  /** Semantic tag to render. Default 'span'. */
  as?: T
  /** Size preset. Default 'md'. */
  size?: WeddingOSWordmarkSize
  /** Use currentColor instead of the gold gradient. Default false. */
  monochrome?: boolean
  /** Show a small heart accent inside the O of "OS". Default true. */
  withHeart?: boolean
  /** Accessible label. Default 'Wedding OS'. */
  'aria-label'?: string
  /** When `as='a'`, the href to navigate to. */
  href?: string
}

/* ----------------------------------------------------------------
   Size → font-size + heart-size mapping
   The font-size maps to the wordmark text size (the monogram is sized
   separately by the logo component). Heart-size is the heart SVG width
   in px, calibrated to fit inside the "O" counter at each font-size.
---------------------------------------------------------------- */
const WORDMARK_SIZE: Record<
  WeddingOSWordmarkSize,
  { fontPx: number; heartPx: number }
> = {
  xs: { fontPx: 10, heartPx: 3 },
  sm: { fontPx: 12, heartPx: 4 },
  md: { fontPx: 14, heartPx: 5 },
  lg: { fontPx: 18, heartPx: 6 },
  xl: { fontPx: 24, heartPx: 8 },
  '2xl': { fontPx: 32, heartPx: 11 },
}

/** Module-scoped gradient id (unique per page). */
const WORDMARK_GRADIENT_ID = 'wedding-os-wordmark-gold'

/* ----------------------------------------------------------------
   Component
---------------------------------------------------------------- */
export function WeddingOSWordmark<T extends AsTag = 'span'>({
  as,
  size = 'md',
  monochrome = false,
  withHeart = true,
  className,
  children,
  'aria-label': ariaLabel = 'Wedding OS',
  href,
  ...props
}: WeddingOSWordmarkProps<T>) {
  const { fontPx, heartPx } = WORDMARK_SIZE[size]
  const Tag = (as ?? 'span') as React.ElementType

  // Colored: gradient text via background-clip.
  // Monochrome: currentColor (consumer controls color).
  const textClasses = monochrome
    ? 'text-current'
    : 'bg-gradient-to-br from-[#FFF8E7] via-[#D4AF37] to-[#8A6320] bg-clip-text text-transparent'

  // Hidden SVG defs (gradient for the heart accent — only needed for
  // the colored variant + when heart is shown).
  const defsSvg =
    !monochrome && withHeart ? (
      <svg
        width="0"
        height="0"
        className="absolute"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={WORDMARK_GRADIENT_ID}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#FFF8E7" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#8A6320" />
          </linearGradient>
        </defs>
      </svg>
    ) : null

  // The small heart accent, rendered as inline SVG. Positioned absolutely
  // centered inside the O's counter. For sizes xs/sm the heart is too
  // small to be readable — we skip it for those sizes.
  const heartVisible = withHeart && size !== 'xs' && size !== 'sm'
  const heartFill = monochrome ? 'currentColor' : `url(#${WORDMARK_GRADIENT_ID})`

  // Wordmark text content with the heart injected into the "O" of "OS".
  // We split into 3 parts: "WEDDING " + "O" + "S" so we can wrap the O
  // in a positioning context.
  const textContent = (
    <>
      {'WEDDING '}
      {heartVisible ? (
        <span className="relative inline-block">
          {'O'}
          <svg
            viewBox="0 0 10 10"
            width={heartPx}
            height={heartPx}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M 5 8 C 1 5 1 2 5 4 C 9 2 9 5 5 8 Z"
              fill={heartFill}
            />
          </svg>
        </span>
      ) : (
        'O'
      )}
      {'S'}
    </>
  )

  return (
    <Tag
      role="img"
      aria-label={ariaLabel}
      href={href}
      className={cn(
        'inline-flex items-baseline font-serif font-semibold uppercase',
        'leading-none tracking-[0.2em]',
        textClasses,
        className
      )}
      style={{ fontSize: `${fontPx}px` }}
      {...props}
    >
      {defsSvg}
      {textContent}
      {children}
    </Tag>
  )
}
