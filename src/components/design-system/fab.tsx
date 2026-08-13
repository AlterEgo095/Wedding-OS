'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * MISSION 5.9.5 — PHASE E
 * FAB (Floating Action Button) — bouton d'action rapide mobile-first premium.
 *
 * Spécifications (P2-1 — Pas de FAB pour actions rapides) :
 *  - Visibilité `md:hidden` (mobile uniquement — desktop a sidebar/drawer)
 *  - Position `!fixed` (override cascade layers — VPS global CSS force
 *    `main, header, footer, nav, aside { position: relative; }` qui surcharge
 *    les utilities Tailwind. Le préfixe `!` = !important bat les cascade layers)
 *  - `!z-50` (au-dessus du contenu)
 *  - Position bottom-20 right-4 (au-dessus du BottomNav fixed h-14 + pb-safe)
 *  - Safe-area aware : `style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}`
 *    (5rem = 80px = bottom-20 — clears 56px BottomNav + safe-area)
 *  - Taille : 56px (défaut md), variants sm (48px) / lg (64px)
 *  - Cible tactile ≥ 44px (WCAG 2.5.5)
 *
 * Expandable (défaut si actions.length > 0) :
 *  - Clic → stack verticale d'actions animée (height/opacity spring)
 *  - Icône principale rotate (Plus → X) sur open
 *  - Backdrop backdrop-blur click-away closes
 *
 * Variantes d'accent (accentMap, comme BottomNav) :
 *  - 'gold' (défaut) — actions mariage principales
 *  - 'emerald' — admin / plateforme
 *  - 'blush' — romantique / invités
 *  - 'default' — neutre
 *
 * Accessibilité :
 *  - aria-label (prop, défaut "Actions rapides")
 *  - aria-expanded={isOpen} aria-haspopup="menu"
 *  - role="menu" sur le stack, role="menuitem" sur chaque action
 *  - Focus trap : focus au 1er item à l'open, restore au FAB à la close
 *  - Escape ferme, Tab cycle, Enter/Space active
 *  - Click-away handler (document mousedown)
 *
 * Haptic feedback (P3-3 bonus) :
 *  - navigator.vibrate?.(10) sur tap (10ms vibration subtile)
 *  - Respect prefers-reduced-motion (skip vibration si réduit)
 *  - Wrappé en try/catch + feature check (devices non-supportés)
 *
 * Reduced motion :
 *  - useReducedMotion() — désactive spring (instant transitions) + vibration
 */

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type FabAccent = 'gold' | 'emerald' | 'blush' | 'default'
export type FabSize = 'sm' | 'md' | 'lg' // sm=48px, md=56 (default), lg=64
export type FabPosition = 'fixed' | 'absolute'

export interface FabAction {
  /** Identifiant unique */
  id: string
  /** Label affiché + aria-label */
  label: string
  /** Icône Lucide (optionnel — défaut une icône générique) */
  icon?: React.ComponentType<{ className?: string }>
  /** Si fourni, rend un <a> (navigation). Sinon <button> + onClick. */
  href?: string
  /** Handler cliqué (si pas de href) */
  onClick?: () => void
  /** Accent spécifique à cette action (défaut = accent du FAB) */
  accent?: FabAccent
}

export interface FabProps
  extends Omit<
    React.HTMLAttributes<HTMLButtonElement>,
    // Les handlers drag/animation natifs de React entrent en conflit avec
    // les props `onDrag*` / `onAnimation*` de framer-motion (types
    // incompatibles). On les retire de l'interface publique — le FAB n'a
    // pas besoin de drag natif ni d'écouter onAnimationStart/End natif.
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
  /** Actions du menu expandable. Si fourni, expandable=true par défaut. */
  actions?: FabAction[]
  /** Icône principale (défaut Lucide Plus). Affichée X quand open. */
  icon?: React.ComponentType<{ className?: string }>
  /** aria-label du bouton principal (défaut "Actions rapides") */
  label?: string
  /** Accent du FAB principal (défaut 'gold') */
  accent?: FabAccent
  /** Taille (défaut 'md' = 56px) */
  size?: FabSize
  /** Si true, le clic expand/collapse. Si false, le clic fire onTrigger.
   *  Défaut : true si actions.length > 0, sinon false. */
  expandable?: boolean
  /** Fired quand FAB cliqué (mode non-expandable). */
  onTrigger?: () => void
  /**
   * Position du FAB :
   *  - 'fixed' (défaut) : fixed au viewport (mobile réel, production)
   *  - 'absolute' : positionné en absolu dans un parent `relative`
   *    (utile pour les démos / phone-frame mockups)
   */
  position?: FabPosition
  /** Force l'état open au montage (pour démos showcase). Si non défini,
   *  l'état est contrôlé en interne par useState. */
  defaultOpen?: boolean
}

/* ----------------------------------------------------------------
   Variants — accentMap (comme BottomNav)
---------------------------------------------------------------- */
interface FabAccentClasses {
  /** Couleur de l'icône principale */
  icon: string
  /** Background teinté subtil pour l'icône (effet halo) */
  halo: string
  /** Couleur de fond de l'action item */
  itemBg: string
  /** Couleur de l'icône de l'action item */
  itemIcon: string
  /** Couleur du label de l'action item */
  itemLabel: string
  /** Border / ring au hover de l'action item */
  itemHover: string
}

const accentMap: Record<FabAccent, FabAccentClasses> = {
  gold: {
    icon: 'text-[var(--gold)]',
    halo: 'bg-[oklch(0.55_0.12_75/0.12)]',
    itemBg: 'bg-card/95 backdrop-blur',
    itemIcon: 'text-[var(--gold)]',
    itemLabel: 'text-foreground',
    itemHover: 'hover:bg-[oklch(0.55_0.12_75/0.08)]',
  },
  emerald: {
    icon: 'text-[var(--emerald-brand)]',
    halo: 'bg-[oklch(0.45_0.09_160/0.12)]',
    itemBg: 'bg-card/95 backdrop-blur',
    itemIcon: 'text-[var(--emerald-brand)]',
    itemLabel: 'text-foreground',
    itemHover: 'hover:bg-[oklch(0.45_0.09_160/0.08)]',
  },
  blush: {
    icon: 'text-[var(--blush)]',
    halo: 'bg-[oklch(0.82_0.06_20/0.18)]',
    itemBg: 'bg-card/95 backdrop-blur',
    itemIcon: 'text-[var(--blush)]',
    itemLabel: 'text-foreground',
    itemHover: 'hover:bg-[oklch(0.82_0.06_20/0.12)]',
  },
  default: {
    icon: 'text-foreground',
    halo: 'bg-foreground/5',
    itemBg: 'bg-card/95 backdrop-blur',
    itemIcon: 'text-foreground',
    itemLabel: 'text-foreground',
    itemHover: 'hover:bg-accent',
  },
}

/* ----------------------------------------------------------------
   Size map
---------------------------------------------------------------- */
const sizeMap: Record<FabSize, { btn: string; icon: string; minTouch: string }> = {
  sm: { btn: 'h-12 w-12', icon: 'h-5 w-5', minTouch: 'min-h-[44px] min-w-[44px]' },
  md: { btn: 'h-14 w-14', icon: 'h-6 w-6', minTouch: 'min-h-[44px] min-w-[44px]' },
  lg: { btn: 'h-16 w-16', icon: 'h-7 w-7', minTouch: 'min-h-[44px] min-w-[44px]' },
}

/* ----------------------------------------------------------------
   Haptic feedback helper
   navigator.vibrate(10) — 10ms subtle vibration on supported devices.
   Respect prefers-reduced-motion (skip if reduced).
---------------------------------------------------------------- */
function haptic(reduce: boolean | null): void {
  if (reduce) return
  if (typeof navigator === 'undefined') return
  const vibrate = (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate
  if (typeof vibrate !== 'function') return
  try {
    vibrate(10)
  } catch {
    // Silent fail — devices non-supportés ou permission refusée.
  }
}

/* ----------------------------------------------------------------
   Hook — click-away + escape close + focus management
---------------------------------------------------------------- */
function useFABMenu(
  isOpen: boolean,
  setIsOpen: (open: boolean) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
  fabRef: React.RefObject<HTMLButtonElement | null>,
) {
  const itemsRef = React.useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([])

  // Click-away : si clic en dehors du container, fermer.
  // Type union car le handler est attaché à mousedown (MouseEvent) ET
  // touchstart (TouchEvent). On utilise `e.target` qui est commun aux deux.
  React.useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const container = containerRef.current
      if (!container) return
      if (!container.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown as EventListener)
    document.addEventListener('touchstart', handlePointerDown as EventListener, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handlePointerDown as EventListener)
      document.removeEventListener('touchstart', handlePointerDown as EventListener)
    }
  }, [isOpen, setIsOpen, containerRef])

  // Escape ferme + restore focus au FAB.
  React.useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        // Restore focus au FAB
        window.requestAnimationFrame(() => {
          fabRef.current?.focus()
        })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setIsOpen, fabRef])

  // Focus trap : à l'open, focus au 1er item.
  React.useEffect(() => {
    if (!isOpen) return
    // Focus au 1er item après l'animation d'entrée
    const id = window.requestAnimationFrame(() => {
      const first = itemsRef.current.find((el) => el != null)
      first?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [isOpen])

  // Trap Tab dans le menu
  const handleItemKeyDown = React.useCallback(
    (e: React.KeyboardEvent, index: number, total: number) => {
      if (e.key !== 'Tab') return
      const items = itemsRef.current.filter((el): el is HTMLAnchorElement | HTMLButtonElement => el != null)
      if (items.length === 0) return
      if (e.shiftKey) {
        if (index === 0) {
          e.preventDefault()
          items[items.length - 1]?.focus()
        }
      } else {
        if (index === total - 1) {
          e.preventDefault()
          items[0]?.focus()
        }
      }
    },
    [],
  )

  return { itemsRef, handleItemKeyDown }
}

/* ----------------------------------------------------------------
   Single action item
---------------------------------------------------------------- */
interface FabActionItemProps {
  action: FabAction
  index: number
  total: number
  accent: FabAccentClasses
  defaultAccent: FabAccent
  reduce: boolean | null
  onActivate: () => void
  registerRef: (el: HTMLAnchorElement | HTMLButtonElement | null, index: number) => void
  onKeyDown: (e: React.KeyboardEvent, index: number, total: number) => void
}

function FabActionItem({
  action,
  index,
  total,
  accent,
  defaultAccent,
  reduce,
  onActivate,
  registerRef,
  onKeyDown,
}: FabActionItemProps) {
  const router = useRouter()
  // L'item utilise l'accent de l'action si défini, sinon celui du FAB
  const itemAccent = accentMap[action.accent ?? defaultAccent]
  const Icon = action.icon ?? Plus

  const handleClick = React.useCallback(() => {
    haptic(reduce)
    onActivate()
    if (action.onClick) {
      action.onClick()
    } else if (action.href) {
      router.push(action.href)
    }
  }, [action, onActivate, reduce, router])

  const itemVariants: Variants = {
    hidden: {
      opacity: 0,
      y: reduce ? 0 : 12,
      scale: reduce ? 1 : 0.92,
      transition: { duration: 0 },
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: reduce
        ? { duration: 0 }
        : {
            type: 'spring',
            stiffness: 380,
            damping: 26,
            delay: index * 0.04,
          },
    },
    exit: {
      opacity: 0,
      y: reduce ? 0 : 8,
      scale: reduce ? 1 : 0.94,
      transition: { duration: reduce ? 0 : 0.15 },
    },
  }

  const baseClasses = cn(
    'group flex w-full items-center gap-3 rounded-xl border border-border/60',
    'px-3 py-2.5 min-h-[44px] min-w-[44px]',
    'shadow-lg shadow-black/10',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    itemAccent.itemBg,
    itemAccent.itemHover,
  )

  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          itemAccent.halo,
        )}
      >
        <Icon className={cn('h-5 w-5', itemAccent.itemIcon)} strokeWidth={1.9} />
      </span>
      <span
        className={cn(
          'flex-1 text-fluid-sm font-medium leading-tight text-left',
          itemAccent.itemLabel,
        )}
      >
        {action.label}
      </span>
    </>
  )

  if (action.href) {
    return (
      <motion.div variants={itemVariants} initial="hidden" animate="visible" exit="exit" layout={false}>
        <a
          ref={(el) => registerRef(el, index)}
          role="menuitem"
          href={action.href}
          aria-label={action.label}
          onClick={(e) => {
            e.preventDefault()
            handleClick()
          }}
          onKeyDown={(e) => onKeyDown(e, index, total)}
          className={baseClasses}
        >
          {inner}
        </a>
      </motion.div>
    )
  }

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" exit="exit" layout={false}>
      <button
        ref={(el) => registerRef(el, index)}
        type="button"
        role="menuitem"
        aria-label={action.label}
        onClick={handleClick}
        onKeyDown={(e) => onKeyDown(e, index, total)}
        className={baseClasses}
      >
        {inner}
      </button>
    </motion.div>
  )
}

/* ----------------------------------------------------------------
   Main FAB component
---------------------------------------------------------------- */
export const FAB = React.forwardRef<HTMLButtonElement, FabProps>(function FAB(
  {
    actions = [],
    icon: IconProp,
    label = 'Actions rapides',
    accent = 'gold',
    size = 'md',
    expandable,
    onTrigger,
    position = 'fixed',
    defaultOpen = false,
    className,
    ...props
  },
  ref,
) {
  const reduce = useReducedMotion()
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  // expandable default : true si actions.length > 0, sinon false
  const isExpandable = expandable ?? actions.length > 0

  // Container ref (FAB + menu) pour le click-away
  const containerRef = React.useRef<HTMLDivElement>(null)
  // Ref interne au bouton principal (forwardRef + our own ref merge)
  const internalBtnRef = React.useRef<HTMLButtonElement | null>(null)
  const setBtnRef = React.useCallback(
    (el: HTMLButtonElement | null) => {
      internalBtnRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) {
        ;(ref as React.MutableRefObject<HTMLButtonElement | null>).current = el
      }
    },
    [ref],
  )

  const { itemsRef, handleItemKeyDown } = useFABMenu(isOpen, setIsOpen, containerRef, internalBtnRef)

  const registerItemRef = React.useCallback(
    (el: HTMLAnchorElement | HTMLButtonElement | null, index: number) => {
      itemsRef.current[index] = el
    },
    [itemsRef],
  )

  const handleMainClick = React.useCallback(() => {
    haptic(reduce)
    if (isExpandable) {
      setIsOpen((prev) => !prev)
    } else {
      onTrigger?.()
    }
  }, [isExpandable, onTrigger, reduce])

  // Close after action click
  const handleActionActivate = React.useCallback(() => {
    setIsOpen(false)
  }, [])

  const accentClasses = accentMap[accent]
  const sizeClasses = sizeMap[size]
  // Icône principale : prop ou Plus par défaut
  const MainIcon = IconProp ?? Plus
  // Icône quand open : X (si pas de prop icon custom), sinon rotate 45°
  const OpenIcon = IconProp ? MainIcon : X

  // Variants pour le container du menu
  const menuVariants: Variants = {
    hidden: {
      opacity: 0,
      transition: { duration: reduce ? 0 : 0.15 },
    },
    visible: {
      opacity: 1,
      transition: reduce
        ? { duration: 0 }
        : {
            staggerChildren: 0.04,
            delayChildren: 0.02,
          },
    },
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        // !fixed / !absolute override cascade layers (VPS global CSS force
        // `main, header, footer, nav, aside { position: relative; }` qui
        // surcharge les utilities Tailwind. Le préfixe `!` = !important bat
        // les cascade layers).
        // !z-50 above content + BottomNav
        // md:hidden : mobile only (desktop has sidebar/drawer)
        position === 'fixed' ? '!fixed md:hidden' : '!absolute',
        '!z-50',
        'right-4',
        className,
      )}
      style={{
        // bottom-20 (5rem = 80px) clears the BottomNav fixed at bottom-0
        // (56px height) + safe-area. Same offset for both fixed and absolute
        // positions so the showcase mockups mirror the production layout.
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Backdrop — click-away closes. Subtle blur for premium feel.
          Only rendered in fixed mode (production). In absolute mode
          (showcase mockups), the click-away is handled by the document
          mousedown listener — no backdrop to avoid darkening the page. */}
      <AnimatePresence>
        {isOpen && position === 'fixed' && (
          <motion.button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className="fixed inset-0 -z-10 cursor-pointer bg-black/20 backdrop-blur-[2px]"
            style={{ right: 0, bottom: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Stack vertical des actions (au-dessus du FAB) */}
      <AnimatePresence>
        {isOpen && isExpandable && actions.length > 0 && (
          <motion.div
            role="menu"
            aria-label={`${label} — actions`}
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="mb-3 flex w-56 flex-col gap-2"
          >
            {actions.map((action, idx) => (
              <FabActionItem
                key={action.id}
                action={action}
                index={idx}
                total={actions.length}
                accent={accentClasses}
                defaultAccent={accent}
                reduce={reduce}
                onActivate={handleActionActivate}
                registerRef={registerItemRef}
                onKeyDown={handleItemKeyDown}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouton principal circulaire */}
      <motion.button
        ref={setBtnRef}
        type="button"
        aria-label={label}
        aria-expanded={isExpandable ? isOpen : undefined}
        aria-haspopup={isExpandable ? 'menu' : undefined}
        onClick={handleMainClick}
        whileHover={reduce ? undefined : { scale: 1.05 }}
        whileTap={reduce ? undefined : { scale: 0.95 }}
        className={cn(
          'relative flex items-center justify-center',
          'rounded-full glass shadow-lg shadow-black/20',
          'transition-transform duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'hover:shadow-xl hover:shadow-black/25',
          'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
          sizeClasses.btn,
          sizeClasses.minTouch,
        )}
        {...props}
      >
        {/* Halo accent (subtle background tint behind icon) */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-2 rounded-full',
            accentClasses.halo,
            'transition-opacity duration-200',
            isOpen ? 'opacity-100' : 'opacity-60',
          )}
        />
        {/* Icon — swap Plus↔X on open, or rotate 45° for custom icon */}
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span
              key="open"
              aria-hidden
              className="relative flex items-center justify-center"
              initial={reduce ? { opacity: 1 } : { opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
              transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <OpenIcon
                className={cn(sizeClasses.icon, accentClasses.icon)}
                strokeWidth={2.25}
              />
            </motion.span>
          ) : (
            <motion.span
              key="closed"
              aria-hidden
              className="relative flex items-center justify-center"
              initial={reduce ? { opacity: 1 } : { opacity: 0, rotate: 90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
              transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <MainIcon
                className={cn(sizeClasses.icon, accentClasses.icon)}
                strokeWidth={2.25}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
})
FAB.displayName = 'FAB'
