'use client';

// ══════════════════════════════════════════════════════════════════════════════
// OrgAdminSidebar — client island inside the org admin Server-Component layout
// ══════════════════════════════════════════════════════════════════════════════
//
// Two variants (rendered in different places by layout.tsx):
//
//   variant="footer" — rendered at the bottom of the desktop sidebar. Shows
//     only the "Déconnexion" button. The mobile hamburger + drawer are NOT
//     rendered here (they would be hidden by `hidden md:flex`).
//
//   variant="mobile-topbar" — rendered at the top of the main content area.
//     On desktop (md+) it renders nothing (the desktop sidebar already shows
//     everything). On mobile it renders a sticky header with:
//       • hamburger button (opens the drawer)
//       • org name (truncated)
//       • a "back to site" link
//     Plus a drawer overlay with the full nav + logout button.
//
// The two variants share the same logout handler and drawer contents.

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, LayoutDashboard, Users, Settings, LogOut, Menu, X, Crown, Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export interface OrgAdminSidebarUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
}

export interface OrgAdminSidebarOrg {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  status: string;
  plan: string;
  maxWeddings: number;
  maxMembers: number;
}

interface OrgAdminSidebarProps {
  user: OrgAdminSidebarUser;
  org: OrgAdminSidebarOrg;
  variant: 'footer' | 'mobile-topbar';
}

export function OrgAdminSidebar({ user, org, variant }: OrgAdminSidebarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      // Reuse the existing /api/platform/logout endpoint — it clears the
      // httpOnly auth_token + csrf_token cookies for any role.
      await fetch('/api/platform/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      /* best-effort: the cookie is httpOnly so even if the network call
         fails, the redirect below lands the user on the login page. */
    } finally {
      try {
        localStorage.removeItem('admin_user');
      } catch {
        /* ignore */
      }
      toast.success('Déconnexion réussie');
      router.replace(`/org/${org.slug}/admin/login`);
    }
  }, [router, org.slug]);

  // ─── Drawer contents (shared between the desktop footer link and the mobile drawer) ──
  const navItems = (
    <nav className="px-2 space-y-1">
      <DrawerLink href={`/org/${org.slug}/admin`} label="Tableau de bord" icon={<LayoutDashboard className="w-4 h-4" />} onNavigate={() => setDrawerOpen(false)} />
      <DrawerLink href={`/org/${org.slug}/admin/members`} label="Membres" icon={<Users className="w-4 h-4" />} onNavigate={() => setDrawerOpen(false)} />
      <DrawerLink href={`/org/${org.slug}/admin/buy-credits`} label="Acheter des crédits" icon={<CreditCard className="w-4 h-4" />} onNavigate={() => setDrawerOpen(false)} />
      {user.role === 'ORG_ADMIN' || user.role === 'PLATFORM_ADMIN' || user.role === 'SUPER_ADMIN' ? (
        <DrawerLink href={`/org/${org.slug}/admin/settings`} label="Paramètres" icon={<Settings className="w-4 h-4" />} onNavigate={() => setDrawerOpen(false)} />
      ) : null}
    </nav>
  );

  // ─── variant="footer": just the logout button (desktop) ──────────────────
  if (variant === 'footer') {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 text-sm mt-1"
        onClick={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <LogOut className="w-4 h-4 mr-2" />
        )}
        Déconnexion
      </Button>
    );
  }

  // ─── variant="mobile-topbar": hamburger + sticky header + drawer ─────────
  return (
    <>
      {/* Sticky mobile header (hidden on md+) */}
      <header className="md:hidden h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10 bg-white/[0.02]">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Ouvrir le menu"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-gold shrink-0" />
          <h1 className="font-semibold text-sm truncate">{org.name}</h1>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-72 z-50 md:hidden flex flex-col border-r border-white/10"
              style={{
                background: 'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270))',
              }}
            >
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full gold-border p-[2px] overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                    {org.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={org.logoUrl} alt={org.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <Building2 className="w-5 h-5 text-gold" />
                    )}
                  </div>
                  <h2 className="font-bold text-sm gold-gradient font-display truncate" title={org.name}>
                    {org.name}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground shrink-0"
                  aria-label="Fermer le menu"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <Separator className="bg-white/10" />

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2">
                {navItems}
              </div>

              <Separator className="bg-white/10" />

              <div className="p-3 space-y-1">
                {(user.role === 'PLATFORM_ADMIN' || user.role === 'SUPER_ADMIN') && (
                  <Button
                    variant="ghost"
                    asChild
                    className="w-full justify-start text-gold hover:text-gold hover:bg-gold/10 text-sm"
                  >
                    <Link href="/platform/admin">
                      <Crown className="w-4 h-4 mr-2" />
                      Espace Plateforme
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 text-sm"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4 mr-2" />
                  )}
                  Déconnexion
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Small drawer link helper ─────────────────────────────────────────────────

function DrawerLink({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
