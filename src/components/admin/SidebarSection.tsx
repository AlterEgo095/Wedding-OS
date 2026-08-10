'use client';

// ════════════════════════════════════════════════════════════════════════════
// SidebarSection — grouped nav section used inside <AdminShell>.
// ════════════════════════════════════════════════════════════════════════════
//
// Renders an optional uppercase header label (matching the existing
// platform admin `text-[10px] font-semibold uppercase tracking-widest
// text-gold/50` pattern) followed by a vertical nav container.
//
// An optional 2px left color stripe (`stripeColor`) can be applied to
// visually distinguish sections. By default no stripe is rendered — this
// preserves visual fidelity with the existing platform / wedding admin
// sidebars which have no per-section stripe. Future shells (or IA-v2
// redesign) can opt-in by passing `stripeColor="gold"` etc.
//
// Phase 1D — extracted from the inline section-header logic of
// `src/app/platform/admin/page.tsx` (NAV_SECTIONS map + showSectionHeader).

import { ReactNode } from 'react';

export type SidebarSectionStripeColor =
  | 'gold'
  | 'emerald'
  | 'rose'
  | 'slate'
  | 'violet';

const STRIPE_BORDER_CLASS: Record<SidebarSectionStripeColor, string> = {
  gold: 'border-gold/40',
  emerald: 'border-emerald-500/30',
  rose: 'border-rose-500/30',
  slate: 'border-slate-500/30',
  violet: 'border-violet-500/30',
};

export interface SidebarSectionProps {
  /** Optional uppercase header label rendered above the nav items. */
  label?: string;
  /** Nav items (typically <SidebarLink> elements). */
  children: ReactNode;
  /**
   * Optional 2px left color stripe. When omitted, no stripe is rendered
   * (preserves the existing platform / wedding admin visual which has no
   * per-section stripe).
   */
  stripeColor?: SidebarSectionStripeColor;
}

export function SidebarSection({
  label,
  children,
  stripeColor,
}: SidebarSectionProps) {
  const stripeClass =
    stripeColor !== undefined
      ? `pl-2 border-l-2 ${STRIPE_BORDER_CLASS[stripeColor]}`
      : '';

  return (
    <div className={stripeClass}>
      {label && (
        <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gold/50">
          {label}
        </p>
      )}
      <nav className="px-2 space-y-1">{children}</nav>
    </div>
  );
}

export default SidebarSection;
