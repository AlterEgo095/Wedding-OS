'use client';

// ════════════════════════════════════════════════════════════════════════════
// SidebarLink — presentational nav link used inside <AdminShell> sidebars.
// ════════════════════════════════════════════════════════════════════════════
//
// Two render modes (auto-selected from props):
//
//   1. URL-routed mode  — when only `href` is provided. Renders a Next.js
//      <Link>. This mirrors the org admin layout's SidebarLink pattern
//      (src/app/org/[slug]/admin/layout.tsx).
//
//   2. Tab-state mode   — when `onNavigate` is provided. Renders a <button>
//      that calls `onNavigate` on click. This preserves the platform admin
//      and wedding admin pattern where the sidebar drives in-page tab state
//      instead of URL routing. `href` is still required for accessibility
//      (exposed via `data-href`) and future deep-link support.
//
// Visual style is identical for both modes and matches the existing
// platform / wedding admin sidebar items:
//   - active:   bg-gold/15 text-gold font-medium
//   - inactive: text-muted-foreground hover:text-foreground hover:bg-white/5
//
// An optional `badge` renders on the right (e.g. unread count, plan label).
//
// Phase 1D — extracted from the inline `SidebarLink` of
// `src/app/org/[slug]/admin/layout.tsx` and the inline `<button>` patterns
// of `src/app/platform/admin/page.tsx` + `src/app/w/[slug]/admin/page.tsx`.

import Link from 'next/link';
import { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';

export interface SidebarLinkProps {
  /** Destination URL. Always required (accessibility + future deep-link). */
  href: string;
  /** Visible label. */
  label: string;
  /** Pre-rendered icon element (caller picks className/size). */
  icon: ReactNode;
  /** Active state — toggles gold highlight classes + aria-current. */
  active?: boolean;
  /** Optional badge (count or short string) shown on the right. */
  badge?: string | number;
  /**
   * Optional click handler. When provided, the link renders as a <button>
   * instead of a <Link>, preserving the in-page tab-state pattern used by
   * the platform + wedding admin shells. The href is still exposed via
   * `data-href` for accessibility/future deep-link support.
   */
  onNavigate?: () => void;
}

export function SidebarLink({
  href,
  label,
  icon,
  active,
  badge,
  onNavigate,
}: SidebarLinkProps) {
  const className = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
    active
      ? 'bg-gold/15 text-gold font-medium'
      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
  }`;

  const content = (
    <>
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      {badge !== undefined && badge !== null && badge !== '' && (
        <Badge
          variant="outline"
          className="ml-auto text-[10px] bg-gold/15 text-gold border-gold/40"
        >
          {badge}
        </Badge>
      )}
    </>
  );

  if (onNavigate) {
    return (
      <button
        type="button"
        onClick={onNavigate}
        data-href={href}
        aria-current={active ? 'page' : undefined}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      {content}
    </Link>
  );
}

export default SidebarLink;
