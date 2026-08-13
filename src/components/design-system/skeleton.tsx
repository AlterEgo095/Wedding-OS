'use client'

import * as React from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * MISSION 5.9.5 — PHASE C
 * Skeleton — primitive de chargement premium.
 *
 * Spécifications :
 *  - 3 variants : 'shimmer' (défaut, sweep or premium), 'pulse' (soft opacity),
 *    'static' (solid muted — pour prefers-reduced-motion).
 *  - 3 accents : 'gold' (mariage/marketing), 'emerald' (admin/platform),
 *    'none' (neutre muted). L'accent teinte le gradient shimmer.
 *  - Auto-downgrade shimmer → static via `useReducedMotion()` (framer-motion).
 *  - Largeurs/hauteurs en px (number) ou string — render inline style.
 *  - `aria-hidden="true"` : les skeletons sont décoratifs, l'utilisateur SR
 *    ne doit pas les entendre (le message de chargement réel vient d'une
 *    région `aria-live="polite"` séparée).
 *  - `pointer-events-none select-none` — ne volent jamais les clics.
 *  - Polymorphique via prop `as` (div par défaut, span, etc.).
 *  - Shimmer réutilise le `@keyframes shimmer` existant dans globals.css
 *    (lines 509-512) — on override juste duration/easing via inline `animation`.
 *
 * Accessibilité :
 *  - aria-hidden="true"
 *  - pointer-events-none + select-none
 *  - role="presentation" via aria-hidden (implicite)
 *  - prefers-reduced-motion : auto-downgrade à 'static'
 */

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type SkeletonVariant = 'shimmer' | 'pulse' | 'static'
export type SkeletonAccent = 'gold' | 'emerald' | 'none'
export type SkeletonRounded = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'none'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Animation : shimmer (sweep gold), pulse (opacity), static (none) */
  variant?: SkeletonVariant
  /** Couleur d'accent qui teinte le shimmer */
  accent?: SkeletonAccent
  /** Border-radius (md par défaut) */
  rounded?: SkeletonRounded
  /** Largeur (px si number, ou string CSS) */
  width?: number | string
  /** Hauteur (px si number, ou string CSS) */
  height?: number | string
  /** Délai d'animation en ms (pour stagger entre lignes) */
  delay?: number
  /** Polymorphique — render as div (défaut), span, etc. */
  as?: React.ElementType
}

/* ----------------------------------------------------------------
   Accent → shimmer gradient map
   (chaque accent donne un gradient linéaire transparent→tinte→transparent)
---------------------------------------------------------------- */
const shimmerGradient: Record<SkeletonAccent, string> = {
  gold: 'linear-gradient(90deg, transparent 0%, oklch(0.85 0.08 75 / 0.18) 50%, transparent 100%)',
  emerald:
    'linear-gradient(90deg, transparent 0%, oklch(0.7 0.08 160 / 0.18) 50%, transparent 100%)',
  none: 'linear-gradient(90deg, transparent 0%, oklch(0.7 0.02 280 / 0.12) 50%, transparent 100%)',
}

/* ----------------------------------------------------------------
   Rounded → classes map
---------------------------------------------------------------- */
const roundedMap: Record<SkeletonRounded, string> = {
  sm: 'rounded-[var(--radius-sm)]',
  md: 'rounded-[var(--radius-md)]',
  lg: 'rounded-[var(--radius-lg)]',
  xl: 'rounded-[var(--radius-xl)]',
  full: 'rounded-full',
  none: 'rounded-none',
}

/* ----------------------------------------------------------------
   Skeleton — composant base
---------------------------------------------------------------- */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      className,
      variant = 'shimmer',
      accent = 'none',
      rounded = 'md',
      width,
      height,
      delay,
      as: Comp = 'div',
      style,
      ...props
    },
    ref,
  ) => {
    const reduce = useReducedMotion()

    // Auto-downgrade shimmer → static si l'utilisateur préfère le reduced-motion.
    // pulse reste pulse (c'est doux) — mais si reduce est très strict, on pourrait
    // aussi downgrader. Pour l'instant on garde pulse car c'est subtil.
    const effectiveVariant: SkeletonVariant =
      variant === 'shimmer' && reduce ? 'static' : variant

    // Inline style pour width/height/délai + shimmer custom gradient.
    // Le `@keyframes shimmer` existe déjà dans globals.css (lignes 509-512).
    // On override juste duration (1.8s) + easing (ease-in-out) pour un sweep premium.
    const shimmerStyle: React.CSSProperties =
      effectiveVariant === 'shimmer'
        ? {
            backgroundImage: shimmerGradient[accent],
            backgroundSize: '200% 100%',
            animation: `shimmer 1.8s ease-in-out infinite`,
            animationDelay: delay ? `${delay}ms` : undefined,
          }
        : {}

    const dimensionStyle: React.CSSProperties = {
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
    }

    return (
      <Comp
        ref={ref}
        aria-hidden="true"
        className={cn(
          'block bg-muted/60',
          'pointer-events-none select-none',
          roundedMap[rounded],
          effectiveVariant === 'pulse' && 'animate-pulse',
          effectiveVariant === 'static' && 'bg-muted/70',
          className,
        )}
        style={{
          ...dimensionStyle,
          ...shimmerStyle,
          ...style,
        }}
        {...props}
      />
    )
  },
)
Skeleton.displayName = 'Skeleton'

/* ----------------------------------------------------------------
   SkeletonText — multi-line text placeholder
---------------------------------------------------------------- */
export interface SkeletonTextProps {
  /** Nombre de lignes (défaut 3) */
  lines?: number
  /** Hauteur de chaque ligne : sm (h-3), md (h-4), lg (h-5) */
  lineHeight?: 'sm' | 'md' | 'lg'
  /**
   * Largeur des lignes :
   *  - string : appliquée à toutes sauf la dernière (qui obtient 60%)
   *  - string[] : largeur par ligne (doit avoir `lines` entrées, ou on prend modulo)
   */
  width?: string | string[]
  /** Accent (forwardé aux Skeleton) */
  accent?: SkeletonAccent
  /** Variant (forwardé aux Skeleton) */
  variant?: SkeletonVariant
  /** Classe override */
  className?: string
}

const lineHeightMap: Record<NonNullable<SkeletonTextProps['lineHeight']>, string> = {
  sm: 'h-3',
  md: 'h-4',
  lg: 'h-5',
}

export function SkeletonText({
  lines = 3,
  lineHeight = 'md',
  width,
  accent = 'none',
  variant = 'shimmer',
  className,
}: SkeletonTextProps) {
  const lineH = lineHeightMap[lineHeight]
  const widthArr = Array.isArray(width)
  const widths: (string | undefined)[] = Array.from({ length: lines }, (_, i) => {
    if (widthArr) return width[i % (width as string[]).length]
    // String single : toutes les lignes sauf la dernière obtiennent la valeur,
    // la dernière obtient 60%.
    if (typeof width === 'string') return i === lines - 1 ? '60%' : width
    // Pas de width → undefined (Skeleton s'adapte au parent).
    return undefined
  })

  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      role="presentation"
      aria-hidden="true"
    >
      {widths.map((w, i) => (
        <Skeleton
          key={i}
          variant={variant}
          accent={accent}
          width={w}
          className={cn(lineH, !w && 'w-full')}
          // Stagger subtil : 100ms par ligne
          delay={i * 100}
        />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------
   SkeletonCircle — circular avatar/icon placeholder
---------------------------------------------------------------- */
export interface SkeletonCircleProps {
  /** Taille en px (défaut 40) */
  size?: number
  accent?: SkeletonAccent
  variant?: SkeletonVariant
  className?: string
  delay?: number
}

export function SkeletonCircle({
  size = 40,
  accent = 'none',
  variant = 'shimmer',
  className,
  delay,
}: SkeletonCircleProps) {
  return (
    <Skeleton
      variant={variant}
      accent={accent}
      rounded="full"
      width={size}
      height={size}
      delay={delay}
      className={className}
    />
  )
}

/* ----------------------------------------------------------------
   SkeletonButton — button-shaped placeholder
   (matches TouchButton sizes : sm/default h-44px, lg h-48px, icon 44×44)
---------------------------------------------------------------- */
export interface SkeletonButtonProps {
  /** Taille — matches TouchButton sizes */
  size?: 'sm' | 'default' | 'lg' | 'icon'
  /** Pleine largeur (w-full) */
  fullWidth?: boolean
  accent?: SkeletonAccent
  variant?: SkeletonVariant
  className?: string
  delay?: number
}

export function SkeletonButton({
  size = 'default',
  fullWidth = false,
  accent = 'none',
  variant = 'shimmer',
  className,
  delay,
}: SkeletonButtonProps) {
  const sizeClass =
    size === 'icon'
      ? 'h-11 w-11 min-h-[44px] min-w-[44px]'
      : size === 'lg'
        ? 'h-12 min-h-[48px]'
        : size === 'sm'
          ? 'h-11 min-h-[44px]'
          : 'h-11 min-h-[44px]'
  const widthClass = fullWidth ? 'w-full' : size === 'icon' ? '' : 'w-24'

  return (
    <Skeleton
      variant={variant}
      accent={accent}
      rounded={size === 'icon' ? 'lg' : 'md'}
      className={cn(sizeClass, widthClass, className)}
      delay={delay}
    />
  )
}
