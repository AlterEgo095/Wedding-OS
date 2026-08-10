// ══════════════════════════════════════════════════════════════════════════════
// src/components/ui/nav-underline.tsx
// Phase 3D (MISSION 5.9.0) — Micro-interaction #8: Nav underline grows from left.
// ══════════════════════════════════════════════════════════════════════════════
//
// A reusable nav link with an animated underline that grows from left to
// right on hover (and stays full-width when `active`).
//
// API:
//   <NavUnderline href="#programme" active={currentSection === 'programme'}>
//     Programme
//   </NavUnderline>
//
// Implementation:
//   - Renders a Next.js `<Link>` (works for both hash-links and real routes).
//   - The underline is a `::after` pseudo-element styled via Tailwind's
//     arbitrary `after:` variants — width 0 → 100% on hover, transition
//     300ms. When `active`, width is locked to 100%.
//   - Reduced motion: the transition is removed (instant width change).
//
// Why a component (and not just a CSS class)?
//   - The existing `.link-elegant` class in globals.css does almost the same
//     thing, but it (a) doesn't have an `active` variant, (b) doesn't handle
//     reduced motion in the class itself (relies on the global
//     `prefers-reduced-motion` selector — which DOES collapse the
//     transition to 0.01ms, so it works, but it's implicit). This component
//     makes both behaviours explicit and reusable.
//
// Accessibility:
//   - `aria-current="page"` is set when `active` is true (so SR users know
//     which nav item is the current section).
//   - The underline is decorative — it has no semantic role, so it's pure
//     CSS (no extra ARIA).
//   - Forwards all `<Link>` props (href, onClick, prefetch, etc.).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { ReactNode, MouseEventHandler } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface NavUnderlineProps {
  /** Link target — hash (#section) or real route. */
  href: string;
  /** Link label / content. */
  children: ReactNode;
  /** When true, the underline is locked at 100% width. */
  active?: boolean;
  /** Optional className — merged with the link's base classes. */
  className?: string;
  /** Click handler (forwarded to the Link). */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  /** Forwarded aria-label for icon-only links. */
  'aria-label'?: string;
}

export function NavUnderline({
  href,
  children,
  active = false,
  className,
  onClick,
  ...rest
}: NavUnderlineProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative inline-flex items-center px-4 py-2',
        'text-sm font-medium font-display tracking-wide',
        'text-foreground/80 hover:text-foreground transition-colors',
        // Underline pseudo-element (Tailwind `after:` variants).
        'after:absolute after:left-0 after:-bottom-0.5 after:h-px',
        'after:bg-[linear-gradient(90deg,var(--gold-light),var(--rose-gold))]',
        // Width: 0 by default → 100% on hover/active.
        active ? 'after:w-full' : 'after:w-0',
        !active && 'hover:after:w-full',
        // Transition: smooth 300ms (or instant under reduced motion).
        prefersReducedMotion ? '' : 'after:transition-[width] after:duration-300 after:ease-out',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default NavUnderline;
