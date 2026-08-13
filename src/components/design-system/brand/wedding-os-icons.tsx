/**
 * MISSION 5.9.5 — PHASE G: BRAND SYSTEM
 * WeddingOSIcons — SVG icon set for PWA + favicons.
 *
 * Generates 4 icon variants as React SVG components. These can be:
 *  - Rendered directly in the DOM (e.g., for an icon showcase page).
 *  - Serialized to .svg files via renderToStaticMarkup for static export.
 *  - Rasterized to .png via sharp/puppeteer in a separate build step.
 *
 * Icons:
 *  - FaviconSVG       : 32×32 simplified W/O mark (no circle, no heart).
 *  - AppIconSVG       : 512×512 W/O on gold-gradient rounded square bg.
 *  - AppleTouchIconSVG: 180×180 W/O on solid dark bg (iOS — no gradient).
 *  - MaskableIconSVG  : 512×512 W/O at 80% safe zone (Android maskable).
 *
 * Geometry: the W/O monogram is defined in a 0 0 100 100 viewBox
 * (same as WeddingOSMark). Each icon embeds the W/O paths scaled +
 * translated to its own viewBox via a nested <svg> with x/y/width/height.
 *
 * Tokens: gradient stops are literal hex values (same as WeddingOSMark).
 * Background colors are also literal hex (PWA icons are typically
 * rasterized to PNG where CSS vars wouldn't apply).
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

/* ----------------------------------------------------------------
   Shared geometry (mirrors wedding-os-mark.tsx — kept inline here so
   the icons are self-contained for static export / PNG rasterization).
---------------------------------------------------------------- */
const W_PATH = 'M 16 32 L 24 68 L 32 48 L 40 68 L 48 32'
const SLASH_PATH = 'M 40 72 L 54 28'
const O_CX = 68
const O_CY = 50
const O_R = 14
const HEART_PATH = `M ${O_CX} ${O_CY + 4} C ${O_CX - 5} ${O_CY} ${O_CX - 5} ${O_CY - 4} ${O_CX} ${O_CY - 2} C ${O_CX + 5} ${O_CY - 4} ${O_CX + 5} ${O_CY} ${O_CX} ${O_CY + 4} Z`

/** Unique gradient ids per icon (avoids DOM collisions when multiple
    icons render on the same page). */
const GRADIENT_ID_APP = 'wedding-os-icon-app-gold'
const GRADIENT_ID_APPLE = 'wedding-os-icon-apple-gold'
const GRADIENT_ID_MASK = 'wedding-os-icon-mask-gold'
const GRADIENT_ID_FAV = 'wedding-os-icon-fav-gold'

/* ----------------------------------------------------------------
   Reusable W/O group (renders the 4 paths with given stroke/fill)
---------------------------------------------------------------- */
interface MonogramGroupProps {
  stroke: string
  fill: string
  withHeart?: boolean
  strokeWidth?: number
}

function MonogramGroup({
  stroke,
  fill,
  withHeart = true,
  strokeWidth = 3,
}: MonogramGroupProps) {
  return (
    <>
      {/* W */}
      <path
        d={W_PATH}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* / slash */}
      <path
        d={SLASH_PATH}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* O ring */}
      <circle
        cx={O_CX}
        cy={O_CY}
        r={O_R}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {/* Heart inside O */}
      {withHeart && <path d={HEART_PATH} fill={fill} stroke="none" />}
    </>
  )
}

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type WeddingOSIconSize = number

export interface WeddingOSIconProps
  extends Omit<
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
  > {
  /** Pixel size (width = height). Defaults to each icon's native size. */
  size?: WeddingOSIconSize
  /** Accessible label. If omitted, svg becomes aria-hidden. */
  'aria-label'?: string
}

/* ----------------------------------------------------------------
   1. FaviconSVG — 32×32 simplified W/O mark
   No outer circle, no heart — maximum clarity at 16-32px display sizes.
   Uses solid gold (#D4AF37) instead of gradient (gradients render
   poorly at 16px).
---------------------------------------------------------------- */
export function FaviconSVG({
  size = 32,
  className,
  'aria-label': ariaLabel,
  ...props
}: WeddingOSIconProps) {
  const a11y = ariaLabel
    ? { role: 'img' as const, 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const }
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('inline-block', className)}
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
      {...props}
    >
      <MonogramGroup
        stroke="#D4AF37"
        fill="#D4AF37"
        withHeart={false}
        strokeWidth={6}
      />
    </svg>
  )
}

/* ----------------------------------------------------------------
   2. AppIconSVG — 512×512 W/O on gold-gradient rounded square
   Standard PWA app icon. W/O rendered in dark obsidian (#0A0A0A) for
   contrast against the gold bg. Rounded square (border-radius ~18.75%).
---------------------------------------------------------------- */
export function AppIconSVG({
  size = 512,
  className,
  'aria-label': ariaLabel,
  ...props
}: WeddingOSIconProps) {
  const a11y = ariaLabel
    ? { role: 'img' as const, 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const }
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cn('inline-block', className)}
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
      {...props}
    >
      <defs>
        <linearGradient
          id={GRADIENT_ID_APP}
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
      {/* Rounded square bg */}
      <rect
        x="0"
        y="0"
        width="512"
        height="512"
        rx="96"
        ry="96"
        fill={`url(#${GRADIENT_ID_APP})`}
      />
      {/* W/O monogram, centered (translated to 128,128 and scaled 2.56×) */}
      <g transform="translate(128, 128) scale(2.56)">
        <MonogramGroup
          stroke="#0A0A0A"
          fill="#0A0A0A"
          withHeart
          strokeWidth={3}
        />
      </g>
    </svg>
  )
}

/* ----------------------------------------------------------------
   3. AppleTouchIconSVG — 180×180 W/O on solid dark bg (no gradient)
   iOS apple-touch-icon. NO border radius (iOS applies its own mask).
   NO gradient on the bg (iOS sometimes renders gradients poorly). The
   W/O itself uses the gold gradient (allowed — only the bg must be
   solid for iOS compatibility).
---------------------------------------------------------------- */
export function AppleTouchIconSVG({
  size = 180,
  className,
  'aria-label': ariaLabel,
  ...props
}: WeddingOSIconProps) {
  const a11y = ariaLabel
    ? { role: 'img' as const, 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const }
  // Scale + translate so W/O is centered in the 180×180 viewBox.
  // W/O native viewBox is 100×100. We want it to occupy ~70% of 180 = 126.
  // Scale = 1.26, translate = (180 - 126) / 2 = 27.
  const scale = 1.26
  const offset = 27
  return (
    <svg
      viewBox="0 0 180 180"
      width={size}
      height={size}
      className={cn('inline-block', className)}
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
      {...props}
    >
      <defs>
        <linearGradient
          id={GRADIENT_ID_APPLE}
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
      {/* Solid dark bg (no radius — iOS applies its own mask) */}
      <rect x="0" y="0" width="180" height="180" fill="#0A0A0A" />
      {/* W/O monogram, gold gradient */}
      <g transform={`translate(${offset}, ${offset}) scale(${scale})`}>
        <MonogramGroup
          stroke={`url(#${GRADIENT_ID_APPLE})`}
          fill={`url(#${GRADIENT_ID_APPLE})`}
          withHeart
          strokeWidth={3}
        />
      </g>
    </svg>
  )
}

/* ----------------------------------------------------------------
   4. MaskableIconSVG — 512×512 with safe zone padding
   Android maskable icon. The "safe zone" is the central 80% of the
   icon (i.e., a 410×410 area centered in 512×512). Content outside
   the safe zone may be clipped by Android's mask shapes (circle,
   squircle, etc.).
   We render:
    - Full-bleed dark bg (covers entire 512×512).
    - W/O monogram at 80% safe zone (centered, scaled to fit in 410×410).
---------------------------------------------------------------- */
export function MaskableIconSVG({
  size = 512,
  className,
  'aria-label': ariaLabel,
  ...props
}: WeddingOSIconProps) {
  const a11y = ariaLabel
    ? { role: 'img' as const, 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const }
  // Safe zone = 80% of 512 = 409.6 ≈ 410.
  // W/O native viewBox = 100×100. Scale to fit 410 → scale = 4.10.
  // Offset = (512 - 410) / 2 = 51.
  const scale = 4.1
  const offset = 51
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cn('inline-block', className)}
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
      {...props}
    >
      <defs>
        <linearGradient
          id={GRADIENT_ID_MASK}
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
      {/* Full-bleed dark bg */}
      <rect x="0" y="0" width="512" height="512" fill="#0A0A0A" />
      {/* W/O monogram at safe zone (centered, 80% of icon) */}
      <g transform={`translate(${offset}, ${offset}) scale(${scale})`}>
        <MonogramGroup
          stroke={`url(#${GRADIENT_ID_MASK})`}
          fill={`url(#${GRADIENT_ID_MASK})`}
          withHeart
          strokeWidth={3}
        />
      </g>
    </svg>
  )
}

/* ----------------------------------------------------------------
   Utility: get all icon definitions as a serializable map.
   Used by build scripts to generate static .svg / .png files.
---------------------------------------------------------------- */
export const WEDDING_OS_ICONS = {
  favicon: { component: FaviconSVG, nativeSize: 32 },
  appIcon: { component: AppIconSVG, nativeSize: 512 },
  appleTouchIcon: { component: AppleTouchIconSVG, nativeSize: 180 },
  maskableIcon: { component: MaskableIconSVG, nativeSize: 512 },
} as const
