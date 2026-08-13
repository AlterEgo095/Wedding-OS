'use client'

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * MISSION 5.9.5 — PHASE B
 * BottomNav — barre de navigation mobile premium (3-5 items max).
 *
 * Spécifications :
 *  - Visibilité `md:hidden` (mobile uniquement, caché ≥768px)
 *  - Position `fixed` (défaut) ou `absolute` (pour démos / mocks phone-frame)
 *  - Effet glass (backdrop-blur + bg semi-transparent)
 *  - Filet supérieur or (border-gold/15) — hairline premium
 *  - Padding bottom safe-area (pb-safe — home indicator iOS)
 *  - Hauteur 56px (h-14) + pb-safe — stack icône + label
 *  - Animation Framer Motion : slide-up au mount (y: 100 → 0, spring)
 *  - Rail d'accent actif animé (layoutId, slide entre items)
 *  - Support badge numérique (petite pilule or sur l'icône)
 *  - Active state : icône + label or (ou émeraude selon variant)
 *  - Inactive : text-foreground/60
 *  - Tap feedback : active:scale-95
 *  - useReducedMotion — animations désactivées si préférence réduite
 *
 * Accessibilité :
 *  - <nav aria-label="Navigation mobile">
 *  - role="button" sur chaque item
 *  - aria-current="page" sur l'item actif
 *  - aria-label complet sur chaque bouton (même si label tronqué visuellement)
 *  - Clavier : button natif (Tab, Enter, Space)
 */

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export interface BottomNavItem {
  /** Identifiant unique (servira pour l'état actif) */
  id: string
  /** Label court (max ~10 caractères, sera tronqué si plus long) */
  label: string
  /** Icône Lucide */
  icon: LucideIcon
  /** Navigation route (utilise router.push) */
  href?: string
  /** Sélecteur d'ancre same-page (ex: "#accueil", utilise scrollIntoView) */
  anchor?: string
  /** Badge numérique optionnel (notifications, panier, etc.) */
  badge?: number
}

export type BottomNavVariant = 'default' | 'gold' | 'emerald'

export interface BottomNavProps
  extends Omit<
    React.HTMLAttributes<HTMLElement>,
    // Les handlers drag natifs de React entrent en conflit avec les props
    // `onDrag*` de framer-motion (types incompatibles : DragEventHandler vs
    // (event, info: PanInfo) => void). On les retire donc de l'interface
    // publique — la BottomNav n'a pas besoin de drag natif de toute façon.
    | 'children'
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
  items: BottomNavItem[]
  /** État actif contrôlé. Si non fourni, dérive de pathname + searchParams. */
  activeId?: string
  /** Couleur d'accent (or par défaut, émeraude pour contexte org/admin vert) */
  variant?: BottomNavVariant
  /**
   * Position de la barre :
   *  - 'fixed' (défaut) : collée en bas du viewport (mobile réel)
   *  - 'absolute' : positionnée en absolu dans un parent `relative`
   *    (utile pour les démos / phone-frame mockups)
   */
  position?: 'fixed' | 'absolute'
  className?: string
}

/* ----------------------------------------------------------------
   Variantes d'accent — mappe le variant → classes de couleur
   pour les différents éléments (rail, icône active, label, badge)
---------------------------------------------------------------- */
interface AccentClasses {
  rail: string
  activeIcon: string
  activeLabel: string
  badge: string
}

const accentMap: Record<BottomNavVariant, AccentClasses> = {
  default: {
    rail: 'bg-[var(--gold)]',
    activeIcon: 'text-[var(--gold)]',
    activeLabel: 'text-[var(--gold)]',
    badge: 'bg-[var(--gold)] text-[var(--gold-foreground)]',
  },
  gold: {
    rail: 'bg-[var(--gold)]',
    activeIcon: 'text-[var(--gold)]',
    activeLabel: 'text-[var(--gold)]',
    badge: 'bg-[var(--gold)] text-[var(--gold-foreground)]',
  },
  emerald: {
    rail: 'bg-[var(--emerald-brand)]',
    activeIcon: 'text-[var(--emerald-brand)]',
    activeLabel: 'text-[var(--emerald-brand)]',
    badge: 'bg-[var(--emerald-brand)] text-white',
  },
}

/* ----------------------------------------------------------------
   Hook — dérivation automatique de l'item actif
---------------------------------------------------------------- */
function useDerivedActiveId(items: BottomNavItem[]): string | undefined {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return React.useMemo(() => {
    if (!pathname) return undefined
    const tab = searchParams?.get('tab')
    // Pour les contextes admin : si ?tab=X est présent, on cherche un item
    // dont l'href contient ?tab=X. Sinon on retombe sur le 1er item.
    if (tab) {
      const match = items.find((it) => it.href?.includes(`tab=${tab}`))
      if (match) return match.id
    }
    // Sinon : match exact sur le pathname (sans query)
    const exact = items.find((it) => it.href === pathname)
    if (exact) return exact.id
    // Fallback : match sur le début de pathname (segment le plus long gagne)
    const prefix = items
      .filter((it) => it.href && pathname.startsWith(it.href.split('?')[0]))
      .sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))[0]
    return prefix?.id ?? items[0]?.id
  }, [pathname, searchParams, items])
}

/* ----------------------------------------------------------------
   Item unique
---------------------------------------------------------------- */
interface NavItemProps {
  item: BottomNavItem
  isActive: boolean
  accent: AccentClasses
  layoutId: string
  reduce: boolean | null
  onItemClick: (item: BottomNavItem) => void
}

function NavItem({
  item,
  isActive,
  accent,
  layoutId,
  reduce,
  onItemClick,
}: NavItemProps) {
  const Icon = item.icon
  const showBadge = typeof item.badge === 'number' && item.badge > 0
  const badgeLabel = (item.badge ?? 0) > 99 ? '99+' : String(item.badge)

  return (
    <button
      type="button"
      role="button"
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.label}
      onClick={() => onItemClick(item)}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-1',
        'min-h-[var(--touch-min)] min-w-[var(--touch-min)]',
        'py-1.5 px-1 select-none',
        'transition-transform duration-150',
        'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      )}
    >
      {/* Rail d'accent actif — motion layoutId pour le slide fluide */}
      {isActive && (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className={cn(
            'absolute left-1/2 -translate-x-1/2 top-0 h-[2px] w-8 rounded-full',
            accent.rail,
          )}
          transition={
            reduce
              ? { duration: 0 }
              : {
                  type: 'spring',
                  stiffness: 380,
                  damping: 30,
                }
          }
        />
      )}

      {/* Icône + badge */}
      <span className="relative flex items-center justify-center">
        <Icon
          className={cn(
            'h-6 w-6 transition-colors duration-200',
            isActive ? accent.activeIcon : 'text-foreground/60',
          )}
          aria-hidden
          strokeWidth={isActive ? 2.25 : 1.75}
        />
        {showBadge && (
          <span
            className={cn(
              'absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1',
              'flex items-center justify-center rounded-full',
              'text-[9px] font-bold leading-none tabular-nums',
              'shadow-sm',
              accent.badge,
            )}
            aria-label={`${item.badge} notifications`}
          >
            {badgeLabel}
          </span>
        )}
      </span>

      {/* Label — tronqué si > 10 caractères */}
      <span
        className={cn(
          'max-w-full truncate text-[10px] leading-tight font-medium',
          'transition-colors duration-200',
          isActive ? accent.activeLabel : 'text-foreground/60',
        )}
      >
        {item.label}
      </span>
    </button>
  )
}

/* ----------------------------------------------------------------
   Composant principal
---------------------------------------------------------------- */
export function BottomNav({
  items,
  activeId,
  variant = 'default',
  position = 'fixed',
  className,
  ...props
}: BottomNavProps) {
  const router = useRouter()
  const reduce = useReducedMotion()
  // layoutId unique par instance — critique car plusieurs BottomNav
  // peuvent coexister sur la même page (ex: la showcase de démo).
  const reactId = React.useId()
  const layoutId = `bottomNavRail-${reactId}`

  const derivedActiveId = useDerivedActiveId(items)
  const currentActiveId = activeId ?? derivedActiveId

  const handleItemClick = React.useCallback(
    (item: BottomNavItem) => {
      if (item.anchor) {
        // Scroll same-page — utile pour les pages publiques de mariage
        const target =
          item.anchor.startsWith('#')
            ? document.querySelector(item.anchor)
            : document.getElementById(item.anchor)
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (item.href) {
        router.push(item.href)
      }
    },
    [router],
  )

  // Animations du conteneur : slide-up au mount
  const containerVariants: Variants = {
    hidden: { y: reduce ? 0 : 100, opacity: reduce ? 1 : 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: reduce
        ? { duration: 0 }
        : {
            type: 'spring',
            stiffness: 280,
            damping: 28,
            opacity: { duration: 0.2 },
          },
    },
  }

  const accent = accentMap[variant]
  const positionClass =
    position === 'fixed'
      ? '!fixed bottom-0 left-0 right-0 md:hidden'
      : '!absolute bottom-0 left-0 right-0'

  return (
    <motion.nav
      aria-label="Navigation mobile"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        '!z-50',
        positionClass,
        'glass border-t border-gold/15',
        'pb-safe',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'flex h-14 w-full items-stretch justify-around',
          'px-safe',
        )}
        role="list"
      >
        {items.map((item) => (
          <div key={item.id} role="listitem" className="flex flex-1">
            <NavItem
              item={item}
              isActive={currentActiveId === item.id}
              accent={accent}
              layoutId={layoutId}
              reduce={reduce}
              onItemClick={handleItemClick}
            />
          </div>
        ))}
      </div>
    </motion.nav>
  )
}
