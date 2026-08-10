'use client';

// ════════════════════════════════════════════════════════════════════════════
// <NextActionCta> — smart next-action call-to-action (Phase 2F — IA redesign).
// ════════════════════════════════════════════════════════════════════════════
//
// Renders a gold-tinted card at the bottom of a tab suggesting the next logical
// workflow step. Used on 5 high-traffic wedding-admin tabs to guide couples
// through the linear workflow:
//
//   Guests → Invitations → QR Codes → Check-in → Statistics → Share site
//
// Visual:
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │  Prochaine étape: Créer des invitations           [icon] →           │
//   └──────────────────────────────────────────────────────────────────────┘
//   (rounded-xl, bg-gold/5, border border-gold/20)
//
// Two render modes (mirrors the SidebarLink pattern):
//   (1) Tab-state mode — when `onClick` is provided, renders a <button> that
//       calls onClick (preserves the wedding admin's in-page tab navigation).
//   (2) URL-routed mode — when only `href` is provided, renders Next.js <Link>.
//
// `href` is always required for accessibility + future deep-linking.

import { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface NextActionCtaProps {
  /** Visible prompt text (e.g. 'Prochaine étape: Créer des invitations'). */
  label: string;
  /** Destination URL (accessibility + future deep-link). */
  href: string;
  /** Optional icon rendered before the chevron. */
  icon?: ReactNode;
  /**
   * Optional click handler — when provided, renders as <button> (preserves
   * in-page tab navigation). When omitted, renders as <Link href={href}>.
   */
  onClick?: () => void;
}

export function NextActionCta({ label, href, icon, onClick }: NextActionCtaProps) {
  const actionClasses =
    'text-gold hover:underline flex items-center gap-1 text-sm font-medium shrink-0';

  return (
    <div className="mt-8 p-4 rounded-xl bg-gold/5 border border-gold/20 flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground min-w-0 truncate">{label}</span>
      {onClick ? (
        <button type="button" onClick={onClick} className={actionClasses} aria-label={label}>
          {icon}
          <ChevronRight className="w-4 h-4" />
        </button>
      ) : (
        <Link href={href} className={actionClasses} aria-label={label}>
          {icon}
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

export default NextActionCta;
