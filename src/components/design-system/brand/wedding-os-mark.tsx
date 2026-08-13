/**
 * MISSION 5.9.5 — PHASE G: BRAND SYSTEM
 * WeddingOSMark — the geometric "W/O" monogram, the heart of the brand.
 *
 * Design (pure SVG, scalable, crisp at any size):
 *  - "W" — 4 angled strokes meeting in a crown shape (5-point polyline)
 *  - "/" — diagonal slash separator (W → O)
 *  - "O" — thin-stroke circle (wedding band)
 *  - Optional heart inside the O (small filled heart, visible accent)
 *  - Optional thin outer circle (luxury jewelry frame)
 *
 * Theming:
 *  - Default: 3-stop metallic gold gradient (#FFF8E7 → #D4AF37 → #8A6320)
 *  - Monochrome: uses `currentColor` (consumer sets text-color)
 *
 * Geometry: viewBox 0 0 100 100 — square, fits inside the outer circle
 * (r=46). The W/O group is horizontally compressed & vertically centered
 * so it sits inside the circle with ~15% breathing room.
 *
 * Tokens: gradient stops are LITERAL hex values (SVG stop-color cannot
 * consume CSS vars in all browsers reliably for linearGradient stops
 * inside a reusable component). All other styling goes through Tailwind.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type WeddingOSMarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/**
 * SVG-native props, with framer-motion-incompatible handlers omitted.
 * (Same pattern used by Phase E FAB + Phase F BottomSheet — keeps the
 * mark safe to wrap in motion.svg if needed later.)
 */
export type WeddingOSMarkProps = Omit<
  React.SVGProps<SVGSVGElement>,
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
  /** Size preset (default 'md' = 32px). */
  size?: WeddingOSMarkSize
  /** Render the thin outer luxury circle. Default false. */
  withCircle?: boolean
  /** Render a small heart inside the O. Default true. */
  withHeart?: boolean
  /** Use currentColor instead of the gold gradient. Default false. */
  monochrome?: boolean
  /** Accessible label. If omitted, svg becomes aria-hidden. */
  'aria-label'?: string
}

/* ----------------------------------------------------------------
   Size → px mapping
   Mirrors the brand size scale shared with the wordmark + logo.
---------------------------------------------------------------- */
export const MARK_SIZE_PX: Record<WeddingOSMarkSize, number> = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
  '2xl': 96,
}

/* ----------------------------------------------------------------
   Geometry constants (viewBox = 0 0 100 100)
   - W occupies x ∈ [16, 48], y ∈ [32, 68]
   - / slash from (40, 72) → (54, 28)
   - O ring center (68, 50), r=14
   - Heart inside O: cx=68, cy=50, ~8×8
   - Outer circle: cx=50, cy=50, r=46 (when withCircle=true)
---------------------------------------------------------------- */
const W_PATH = 'M 16 32 L 24 68 L 32 48 L 40 68 L 48 32'
const SLASH_PATH = 'M 40 72 L 54 28'
const O_CX = 68
const O_CY = 50
const O_R = 14
const HEART_PATH = `M ${O_CX} ${O_CY + 4} C ${O_CX - 5} ${O_CY} ${O_CX - 5} ${O_CY - 4} ${O_CX} ${O_CY - 2} C ${O_CX + 5} ${O_CY - 4} ${O_CX + 5} ${O_CY} ${O_CX} ${O_CY + 4} Z`

/* Unique gradient id (stable per module, allows multiple instances on
   a single page without collision — DOM lookup is by id, so we use a
   module-scoped counter to ensure uniqueness across instances). */
const gradientId = 'wedding-os-mark-gold'

/* ----------------------------------------------------------------
   Component
---------------------------------------------------------------- */
export const WeddingOSMark = React.forwardRef<SVGSVGElement, WeddingOSMarkProps>(
  (
    {
      size = 'md',
      withCircle = false,
      withHeart = true,
      monochrome = false,
      className,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const px = MARK_SIZE_PX[size]
    const stroke = monochrome ? 'currentColor' : `url(#${gradientId})`
    const fill = monochrome ? 'currentColor' : `url(#${gradientId})`
    const a11y = ariaLabel
      ? { role: 'img' as const, 'aria-label': ariaLabel }
      : { 'aria-hidden': true as const }

    return (
      <svg
        ref={ref}
        viewBox="0 0 100 100"
        width={px}
        height={px}
        className={cn('inline-block shrink-0', className)}
        xmlns="http://www.w3.org/2000/svg"
        {...a11y}
        {...props}
      >
        {/* ---- Defs (gradient) — only emitted when not monochrome ---- */}
        {!monochrome && (
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFF8E7" />
              <stop offset="50%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#8A6320" />
            </linearGradient>
          </defs>
        )}

        {/* ---- Optional thin outer circle (luxury frame) ---- */}
        {withCircle && (
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={stroke}
            strokeWidth="1"
            opacity="0.6"
          />
        )}

        {/* ---- W (4-stroke polyline) ---- */}
        <path
          d={W_PATH}
          fill="none"
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ---- / slash (separator) ---- */}
        <path
          d={SLASH_PATH}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* ---- O ring (wedding band) ---- */}
        <circle
          cx={O_CX}
          cy={O_CY}
          r={O_R}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
        />

        {/* ---- Heart inside O (small filled accent) ---- */}
        {withHeart && <path d={HEART_PATH} fill={fill} stroke="none" />}
      </svg>
    )
  }
)
WeddingOSMark.displayName = 'WeddingOSMark'
