'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * MISSION 5.9.5 — PHASE F
 * BottomSheet — premium mobile-first modal that slides up from the bottom.
 *
 * Spécifications (P2-2 — Pas de bottom sheets pour formulaires courts sur mobile) :
 *  - Mobile-first : full-width anchored bottom sur mobile (<sm).
 *  - Desktop (sm+) : centered modal max-w-md avec rounded-2xl.
 *  - Drag handle (pill) en top center, draggable pour dismiss
 *    (drag down > 100px ou velocity > 500 ferme).
 *  - Backdrop bg-black/50 backdrop-blur click-to-close.
 *  - Tailles : sm (40vh) · md (60vh, défaut) · lg (80vh) · auto (content, max 85vh).
 *  - Variantes : default (solid bg-background) · glass (glassmorphism) ·
 *    premium (gold border accent).
 *
 * Accessibilité :
 *  - role="dialog" aria-modal="true"
 *  - aria-labelledby (titre) + aria-describedby (description)
 *  - Focus trap : focus au 1er élément focusable à l'open,
 *    Tab cycle dans la sheet, restore au trigger à la close.
 *  - Escape ferme (closeOnEscape=true défaut)
 *  - Body scroll lock quand open (restored on close)
 *  - aria-label="Fermer" sur bouton close (X icon, 44px touch target)
 *  - aria-live="polite" region pour annoncer open/close au SR
 *
 * z-index (override cascade layers via `!`) :
 *  - Backdrop : !z-[60]
 *  - Sheet    : !z-[61]
 *  (au-dessus du FAB !z-50 et BottomNav !z-50 quand open)
 *
 * Reduced motion : useReducedMotion() —
 *  - spring → instant (duration: 0)
 *  - slide-up → opacity-only transition
 *  - drag-to-dismiss désactivé (instant close)
 *
 * Portail : rendu via createPortal(document.body) pour échapper
 * aux stacking contexts parents (transforms motion.div whileInView,
 * overflow:hidden, etc.). Sinon le `!fixed !z-[61]` serait piégé.
 */

/* ----------------------------------------------------------------
   Types
---------------------------------------------------------------- */
export type BottomSheetSize = 'sm' | 'md' | 'lg' | 'auto'
export type BottomSheetVariant = 'default' | 'glass' | 'premium'

export interface BottomSheetProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    // Les handlers drag/animation natifs de React entrent en conflit avec
    // les props `onDrag*` / `onAnimation*` de framer-motion (types
    // incompatibles — VPS build strict). On les retire de l'interface
    // publique. On attache nos propres handlers framer-motion en interne.
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
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre — si fourni, auto-rend un BottomSheetHeader (Recommended). */
  title?: string
  /** Description — rendue sous le titre si fournie. */
  description?: string
  /** Taille (défaut 'md'). */
  size?: BottomSheetSize
  /** Variante visuelle (défaut 'default'). */
  variant?: BottomSheetVariant
  /** Extra classes sur la sheet. */
  className?: string
  /** Clic sur backdrop ferme (défaut true). */
  closeOnOverlayClick?: boolean
  /** Escape ferme (défaut true). */
  closeOnEscape?: boolean
  /** Bouton X en top-right (défaut true). */
  showCloseButton?: boolean
}

/* ----------------------------------------------------------------
   Size & Variant maps
---------------------------------------------------------------- */
const sizeMap: Record<BottomSheetSize, string> = {
  // max-h sur le sheet container ; content scroll si dépasse
  sm: 'max-h-[40vh]',
  md: 'max-h-[60vh]',
  lg: 'max-h-[80vh]',
  auto: 'max-h-[85vh]',
}

const variantMap: Record<BottomSheetVariant, string> = {
  default: 'bg-background',
  glass: 'glass',
  premium:
    'bg-background border-t-2 border-t-[var(--gold)] shadow-[var(--shadow-gold)]',
}

/* ----------------------------------------------------------------
   Focusable elements selector (for focus trap)
---------------------------------------------------------------- */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* ----------------------------------------------------------------
   Hook — focus trap + escape + body scroll lock + restore focus
---------------------------------------------------------------- */
function useBottomSheetBehavior(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  sheetRef: React.RefObject<HTMLDivElement | null>,
  closeOnEscape: boolean,
) {
  // Save previously focused element to restore on close
  const previousFocusRef = React.useRef<HTMLElement | null>(null)
  // Save body overflow to restore on close
  const previousOverflowRef = React.useRef<string>('')

  React.useEffect(() => {
    if (!open) return

    // 1. Save currently focused element (the trigger button)
    if (typeof document !== 'undefined') {
      previousFocusRef.current = document.activeElement as HTMLElement | null
    }

    // 2. Body scroll lock
    if (typeof document !== 'undefined') {
      previousOverflowRef.current = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    // 3. Focus first focusable element in the sheet (after animation frame
    //    to ensure the sheet is rendered)
    const rafId = window.requestAnimationFrame(() => {
      const sheet = sheetRef.current
      if (!sheet) return
      const first = sheet.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (first) {
        first.focus()
      } else {
        // Focus the sheet itself (tabIndex=-1)
        sheet.focus()
      }
    })

    // 4. Escape key handler
    function handleEscape(e: KeyboardEvent) {
      if (!closeOnEscape) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
      }
    }

    // 5. Tab cycling (focus trap)
    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const sheet = sheetRef.current
      if (!sheet) return
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null) // skip hidden
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        // Shift+Tab : si au 1er (ou hors sheet), focus au dernier
        if (active === first || !sheet.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab : si au dernier (ou hors sheet), focus au 1er
        if (active === last || !sheet.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('keydown', handleTab)

    return () => {
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('keydown', handleTab)
      // Restore body overflow
      if (typeof document !== 'undefined') {
        document.body.style.overflow = previousOverflowRef.current
      }
      // Restore focus to trigger
      window.requestAnimationFrame(() => {
        previousFocusRef.current?.focus()
      })
    }
  }, [open, onOpenChange, sheetRef, closeOnEscape])
}

/* ----------------------------------------------------------------
   BottomSheet main component
---------------------------------------------------------------- */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  variant = 'default',
  children,
  className,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  ...props
}: BottomSheetProps) {
  const reduce = useReducedMotion()
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()
  const descId = React.useId()
  // mount guard for portal (SSR safe)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  useBottomSheetBehavior(open, onOpenChange, sheetRef, closeOnEscape)

  // Drag-to-dismiss handler (framer-motion PanInfo)
  // Si drag down > 100px ou velocity > 500 → close
  const handleDragEnd = React.useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (reduce) {
        // Reduced motion : no drag-to-dismiss (instant close only)
        return
      }
      if (info.offset.y > 100 || info.velocity.y > 500) {
        onOpenChange(false)
      }
    },
    [onOpenChange, reduce],
  )

  const handleBackdropClick = React.useCallback(() => {
    if (closeOnOverlayClick) {
      onOpenChange(false)
    }
  }, [closeOnOverlayClick, onOpenChange])

  const handleCloseClick = React.useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Don't render until mounted (SSR safety for createPortal)
  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — fade in/out, click to close
              !z-[60] (above FAB !z-50, BottomNav !z-50) */}
          <motion.div
            aria-hidden="true"
            onClick={handleBackdropClick}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="!fixed !inset-0 !z-[60] bg-black/50 backdrop-blur-[2px]"
          />

          {/* Sheet — slides up from bottom (mobile) / centered modal (desktop)
              !z-[61] (above backdrop)
              `!fixed` override cascade layers (same as FAB/BottomNav pattern) */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            // Drag-to-dismiss (mobile bottom sheet feel)
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            // Slide up from bottom (mobile) or fade in (desktop via initial y 100%)
            initial={reduce ? { opacity: 0 } : { y: '100%', opacity: 1 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: '100%', opacity: 1 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: 'spring', damping: 30, stiffness: 300 }
            }
            className={cn(
              // !fixed + !z-[61] override cascade layers
              '!fixed !z-[61]',
              // Mobile : full-width, bottom-anchored, top-rounded
              'left-0 right-0 bottom-0',
              'rounded-t-2xl border border-border',
              'flex flex-col',
              'shadow-[var(--shadow-xl)]',
              // Desktop (sm+) : centered modal max-w-md with full rounded corners
              'sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto',
              'sm:-translate-x-1/2 sm:-translate-y-1/2',
              'sm:max-w-md sm:w-full sm:rounded-2xl',
              // Size (max-height)
              sizeMap[size],
              // Variant (background + accent)
              variantMap[variant],
              // Safe-area bottom (iOS home indicator)
              'pb-safe',
              // Focus management
              'outline-none',
              className,
            )}
            {...props}
          >
            {/* Drag handle — pill at top center, draggable to dismiss */}
            <div
              aria-hidden="true"
              className="flex w-full shrink-0 justify-center pt-3 pb-1"
            >
              <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Close button — top right, 44px touch target */}
            {showCloseButton && (
              <button
                type="button"
                onClick={handleCloseClick}
                aria-label="Fermer"
                className={cn(
                  'absolute right-3 top-2 z-10',
                  'flex h-11 w-11 items-center justify-center rounded-full',
                  'text-muted-foreground hover:text-foreground hover:bg-accent',
                  'transition-colors',
                  'min-h-[44px] min-w-[44px]',
                  'focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-ring focus-visible:ring-offset-2',
                  'focus-visible:ring-offset-background',
                )}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            )}

            {/* Auto-rendered header (if title or description provided).
                Users can also use <BottomSheetHeader> manually inside
                children for advanced composition. */}
            {(title || description) && (
              <BottomSheetHeader>
                {title && (
                  <BottomSheetTitle id={titleId}>{title}</BottomSheetTitle>
                )}
                {description && (
                  <BottomSheetDescription id={descId}>
                    {description}
                  </BottomSheetDescription>
                )}
              </BottomSheetHeader>
            )}

            {/* Children — the main content (form fields, list, etc.).
                Scrollable if exceeds available height. */}
            <div className="flex-1 overflow-y-auto">{children}</div>

            {/* SR live region — announces open/close to screen readers */}
            <span aria-live="polite" className="sr-only">
              {open ? 'Bottom sheet ouvert' : 'Bottom sheet fermé'}
            </span>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ----------------------------------------------------------------
   Sub-components (compound pattern — matches shadcn Dialog conventions)
---------------------------------------------------------------- */

/** Header — title + description area at the top of the sheet. */
export function BottomSheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 px-5 pt-3 pb-3 shrink-0', className)}
      {...props}
    />
  )
}

/** Title — H2 with premium typography. Accepts `id` for aria-labelledby. */
export function BottomSheetTitle({
  className,
  id,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { id?: string }) {
  return (
    <h2
      id={id}
      className={cn(
        'text-fluid-lg font-semibold leading-tight tracking-tight text-balance pr-10',
        className,
      )}
      {...props}
    />
  )
}

/** Description — muted text below the title. Accepts `id` for aria-describedby. */
export function BottomSheetDescription({
  className,
  id,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { id?: string }) {
  return (
    <p
      id={id}
      className={cn('text-fluid-sm text-muted-foreground text-pretty', className)}
      {...props}
    />
  )
}

/** Content — main body of the sheet (form fields, list, etc.). */
export function BottomSheetContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-3', className)} {...props} />
}

/** Footer — action buttons area at the bottom of the sheet. */
export function BottomSheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        'px-5 pt-3 pb-5 shrink-0',
        className,
      )}
      {...props}
    />
  )
}

BottomSheet.displayName = 'BottomSheet'
BottomSheetHeader.displayName = 'BottomSheetHeader'
BottomSheetTitle.displayName = 'BottomSheetTitle'
BottomSheetDescription.displayName = 'BottomSheetDescription'
BottomSheetContent.displayName = 'BottomSheetContent'
BottomSheetFooter.displayName = 'BottomSheetFooter'
