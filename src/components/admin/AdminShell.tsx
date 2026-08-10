'use client';

// ════════════════════════════════════════════════════════════════════════════
// <AdminShell> — unified admin chrome primitive (Phase 1D).
// ════════════════════════════════════════════════════════════════════════════
//
// Reusable sidebar + mobile drawer + top bar + footer for the 4 admin shells.
// Extracted from the duplicated chrome of:
//   - src/app/platform/admin/page.tsx (new super admin)
//   - src/app/w/[slug]/admin/page.tsx (wedding admin)
//   - src/app/org/[slug]/admin/layout.tsx (org admin — reference pattern)
//
// Layout (matches the org admin reference + platform/wedding admin patterns):
//
//   ┌─────────────┬───────────────────────────────────────────────┐
//   │  Sidebar    │  Top bar (hamburger on mobile + title + right)│
//   │  - brand    ├───────────────────────────────────────────────┤
//   │  - badges   │                                               │
//   │  - nav      │              {children}                       │
//   │  - user     │           (scrollable, custom-scrollbar)      │
//   │  - footer   │                                               │
//   │             ├───────────────────────────────────────────────┤
//   │             │  Mobile bottom bar (optional slot)            │
//   └─────────────┴───────────────────────────────────────────────┘
//
// Visual style:
//   - Outer background: linear-gradient(135deg, oklch(0.12 0.02 270), ...)
//   - Sidebar:           bg-white/[0.02] + border-r border-white/10
//   - Top bar:           h-14 + border-b border-white/10 + bg-white/[0.02]
//   - User avatar:       bg-gradient-gold circle with white initial
//   - Active nav item:   bg-gold/15 text-gold font-medium
//   - Section header:    text-[10px] font-semibold uppercase tracking-widest text-gold/50
//
// Mobile drawer:
//   - Uses shadcn <Sheet> with side="left"
//   - Same nav content as desktop
//   - Radix-based slide-in-from-left animation (replaces the old
//     framer-motion <motion.aside> pattern; same look, less code)
//
// Nav item rendering:
//   - When `onNavigate` is provided, renders as <button> (preserves in-page
//     tab-state pattern used by platform + wedding admin).
//   - Otherwise renders as Next.js <Link> (URL-routed, used by org admin).
//
// Extensions beyond the spec (necessary for visual fidelity):
//   - mobileBottomBar?: ReactNode   — slot for the mobile bottom tab bar
//                                     (both platform + wedding admin have one)
//   - topBarRight?: ReactNode       — slot for the top bar right side
//                                     (logout button, "Voir le site" link, etc.)
//   - pageTitle?: ReactNode         — accepts icon + label combo (not just string)

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { Menu, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { SidebarLink } from './SidebarLink';
import {
  SidebarSection,
  type SidebarSectionStripeColor,
} from './SidebarSection';

// ─── Public types ────────────────────────────────────────────────────────────

export interface AdminShellNavItem {
  /** Destination URL (accessibility + future deep-link). */
  href: string;
  /** Visible label. */
  label: string;
  /** Pre-rendered icon element (caller picks className/size). */
  icon: ReactNode;
  /** Active state — toggles gold highlight classes. */
  active?: boolean;
  /** Optional badge (count or short string) shown on the right. */
  badge?: string | number;
  /**
   * Marks the item as super-admin only. NOTE: <AdminShell> does NOT enforce
   * this — the caller is responsible for filtering superAdminOnly items
   * before passing them to sections. This field is kept on the interface
   * for symmetry with the original NavItem shape.
   */
  superAdminOnly?: boolean;
  /**
   * Optional click handler. When provided, the item renders as a <button>
   * (preserves in-page tab-state pattern). When omitted, renders as <Link>.
   */
  onNavigate?: () => void;
}

export interface AdminShellSection {
  /** Section identifier (e.g. 'command-center', 'production-studio'). */
  id: string;
  /** Optional uppercase header label (e.g. 'Command Center'). */
  label?: string;
  /** Nav items in this section. */
  items: AdminShellNavItem[];
  /**
   * Optional 2px left color stripe (Phase 2F — IA redesign). When omitted,
   * no stripe is rendered (preserves the original flat visual).
   */
  stripeColor?: SidebarSectionStripeColor;
}

export interface AdminShellContextBadge {
  /** Visible label of the badge (e.g. 'DRAFT', 'ELITE', '2025-06-14'). */
  value: string;
  /** Optional title text shown on hover. */
  label?: string;
  /** Color tone. Default 'gold'. */
  tone?: 'gold' | 'emerald' | 'rose' | 'slate';
}

export interface AdminShellUser {
  /** Display name (shown in the sidebar footer card). */
  name: string;
  /** Email (currently unused in the footer but exposed for future use). */
  email: string;
  /** Role label (shown under the name, e.g. 'Super Admin'). */
  roleLabel: string;
  /** Single-character avatar initial (caller upper-cases it). */
  avatarInitial: string;
}

export interface AdminShellBreadcrumb {
  label: string;
  href?: string;
}

export interface AdminShellProps {
  /** Navigation sections (each renders a <SidebarSection>). */
  sections: AdminShellSection[];
  /** Current user (renders the footer user card). */
  user: AdminShellUser;
  /** Context badges shown under the brand header. */
  contextBadges?: AdminShellContextBadge[];
  /** Brand header (top of sidebar) — logo + name. */
  brand: ReactNode;
  /** Optional extra content at the sidebar footer (e.g. logout button). */
  sidebarFooter?: ReactNode;
  /** Page title for the top bar (accepts string or icon+label combo). */
  pageTitle?: ReactNode;
  /** Optional breadcrumb trail rendered in the top bar. */
  breadcrumbs?: AdminShellBreadcrumb[];
  /**
   * Optional prominent context banner rendered above the nav (Phase 2F —
   * IA redesign). When provided, the wedding admin displays a 4-badge
   * banner (CoupleLabel · Date · Status · VenueCity) with a gold-tinted
   * background. Mutually independent from `contextBadges` (small pill row).
   */
  contextBanner?: ReactNode;
  /** Page content. */
  children: ReactNode;
  /** Sidebar width — default 'w-72' (288px, the unified width per Phase 0.6). */
  sidebarWidth?: string;
  /**
   * Mobile drawer width — default 'w-72'. Pass a different value to preserve
   * the existing drawer width of a given shell (e.g. 'w-64' for the platform
   * admin whose original drawer was 256px).
   */
  mobileDrawerWidth?: string;
  /**
   * Optional mobile bottom bar (rendered below the scrollable content).
   * Both platform + wedding admin have a 5-6 item bottom tab bar; pass it
   * here to preserve that visual.
   */
  mobileBottomBar?: ReactNode;
  /** Optional right-side content for the top bar (logout, links, etc.). */
  topBarRight?: ReactNode;
}

// ─── Tone → className mapping for context badges ─────────────────────────────

const BADGE_TONE_CLASS: Record<
  NonNullable<AdminShellContextBadge['tone']>,
  string
> = {
  gold: 'bg-gold/15 text-gold border-gold/40',
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminShell({
  sections,
  user,
  contextBadges,
  contextBanner,
  brand,
  sidebarFooter,
  pageTitle,
  breadcrumbs,
  children,
  sidebarWidth = 'w-72',
  mobileDrawerWidth = 'w-72',
  mobileBottomBar,
  topBarRight,
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // ─── Shared sub-renders (used by both desktop sidebar + mobile drawer) ──────

  const renderBrandAndBadges = () => (
    <>
      {brand}
      {contextBadges && contextBadges.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {contextBadges.map((b, i) => (
            <Badge
              key={i}
              variant="outline"
              title={b.label}
              className={`text-[10px] uppercase tracking-wide ${BADGE_TONE_CLASS[b.tone || 'gold']}`}
            >
              {b.value}
            </Badge>
          ))}
        </div>
      )}
      {/* Phase 2F — prominent context banner (e.g. wedding admin's 4-badge row). */}
      {contextBanner}
    </>
  );

  const renderNavSections = (closeDrawerOnClick = false) => (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2 space-y-1">
      {sections.map((section) => (
        <SidebarSection
          key={section.id}
          label={section.label}
          stripeColor={section.stripeColor}
        >
          {section.items.map((item) => (
            <SidebarLink
              key={`${section.id}-${item.href}`}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.active}
              badge={item.badge}
              onNavigate={
                item.onNavigate
                  ? closeDrawerOnClick
                    ? () => {
                        item.onNavigate?.();
                        setMobileOpen(false);
                      }
                    : item.onNavigate
                  : undefined
              }
            />
          ))}
        </SidebarSection>
      ))}
    </div>
  );

  const renderUserFooter = () => (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3 px-2">
        <div className="w-9 h-9 rounded-full bg-gradient-gold flex items-center justify-center text-white text-sm font-bold shrink-0">
          {user.avatarInitial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{user.name}</p>
          <p className="text-[10px] text-gold/80 uppercase tracking-wider truncate">
            {user.roleLabel}
          </p>
        </div>
      </div>
      {sidebarFooter}
    </div>
  );

  return (
    <div
      className="h-screen flex"
      style={{
        background:
          'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
      }}
    >
      {/* ── Desktop sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col ${sidebarWidth} shrink-0 border-r border-white/10 bg-white/[0.02]`}
      >
        {renderBrandAndBadges()}
        <Separator className="bg-white/10" />
        {renderNavSections()}
        <Separator className="bg-white/10" />
        {renderUserFooter()}
      </aside>

      {/* ── Mobile drawer (shadcn Sheet, slides in from left) ────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className={`${mobileDrawerWidth} p-0 gap-0 flex flex-col border-r border-white/10 bg-white/[0.02]`}
          style={{
            background:
              'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270))',
          }}
        >
          {/* Radix Dialog requires a SheetTitle for a11y (aria-labelledby).
              We render it visually-hidden. */}
          <SheetTitle className="sr-only">Navigation administrateur</SheetTitle>
          {renderBrandAndBadges()}
          <Separator className="bg-white/10" />
          {renderNavSections(true)}
          <Separator className="bg-white/10" />
          {renderUserFooter()}
        </SheetContent>
      </Sheet>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top bar (unified — visible on all viewports; hamburger hidden on desktop) */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10 bg-white/[0.02]">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            {pageTitle && (
              <div className="flex items-center gap-2 min-w-0">
                {pageTitle}
              </div>
            )}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav
                aria-label="Fil d'Ariane"
                className="flex items-center gap-1 text-sm text-muted-foreground min-w-0"
              >
                {breadcrumbs.map((bc, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <span
                      key={i}
                      className="flex items-center gap-1 min-w-0"
                    >
                      {i > 0 && (
                        <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      )}
                      {bc.href && !isLast ? (
                        <Link
                          href={bc.href}
                          className="hover:text-foreground transition-colors truncate"
                        >
                          {bc.label}
                        </Link>
                      ) : (
                        <span
                          className={`truncate ${
                            isLast ? 'text-gold font-medium' : ''
                          }`}
                        >
                          {bc.label}
                        </span>
                      )}
                    </span>
                  );
                })}
              </nav>
            )}
          </div>

          {topBarRight && (
            <div className="ml-auto flex items-center gap-2">
              {topBarRight}
            </div>
          )}
        </header>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {/* Optional mobile bottom bar slot */}
        {mobileBottomBar && <>{mobileBottomBar}</>}
      </div>
    </div>
  );
}

export default AdminShell;
