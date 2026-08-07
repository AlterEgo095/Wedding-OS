// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/admin/layout.tsx — Mission 6.0 P1.8 Org Admin Shell
// ══════════════════════════════════════════════════════════════════════════════
//
// Server Component. The auth gate for the org admin area.
//
// Flow:
//   1. Read slug from params.
//   2. getServerAuthUser() — refresh role + organizationId from DB (no stale
//      JWT claims).
//   3. If no user → redirect to /org/[slug]/admin/login.
//   4. If user.role is NOT org-scoped AND not platform admin → 403 (this is
//      the org client space, not the platform admin space).
//   5. Fetch the org by slug. If not found → notFound().
//   6. If user is org-scoped: verify user.organizationId === org.id, else 403.
//      (Platform admins bypass — they can preview any org.)
//   7. Render <ThemeInjector /> (P1.10 white-label, no-op on default domain),
//      a sidebar (server-rendered chrome), and children.
//
// The sidebar is split into a Server-rendered shell (org logo + name + nav)
// and a small client island (OrgAdminSidebar chrome — mobile hamburger,
// logout button). This keeps the layout itself a Server Component (per the
// task constraint) while still allowing interactivity.

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import Image from 'next/image';

import { db } from '@/lib/db';
import { getServerAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin } from '@/lib/types';
import { ROLE_LABELS, PLAN_LABELS } from '@/lib/ui-labels';
import { ThemeInjector } from '@/components/ThemeInjector';
import { OrgAdminSidebar } from './_components/OrgAdminSidebar';
import { Badge } from '@/components/ui/badge';

// Lucide icons used in the static sidebar markup (the interactive parts
// live in the client island — we keep the icon imports here for SSR).
import { Building2, Users, Settings, LayoutDashboard, Crown, CreditCard } from 'lucide-react';

// ─── Org-status labels (Organization.status is ACTIVE/SUSPENDED/ARCHIVED,
// distinct from WeddingStatus. Inline map to avoid coupling.) ────────────────
const ORG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgForLayout {
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

interface LayoutUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // ─── 1. Auth check ──────────────────────────────────────────────────────
  const user = await getServerAuthUser();
  if (!user) {
    redirect(`/org/${slug}/admin/login`);
  }

  // ─── 2. Role check — only org-scoped or platform admin may pass ────────
  // Per-wedding roles (ORGANIZER/RECEPTION/CONTROLLER) are NOT org members
  // and must use /w/[weddingSlug]/admin instead.
  const allowedRole = isOrgRole(user.role) || isPlatformAdmin(user.role);
  if (!allowedRole) {
    // Not authorized for this space — bounce them to the platform login so
    // they see a clear error. (Returning a 403 page directly would also work
    // but redirect keeps the URL clean.)
    redirect('/platform/login?error=org_role_required');
  }

  // ─── 3. Resolve the org by slug ────────────────────────────────────────
  const org = await db.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      brandColor: true,
      status: true,
      plan: true,
      maxWeddings: true,
      maxMembers: true,
    },
  });

  if (!org || org.status === 'ARCHIVED') {
    notFound();
  }

  // ─── 4. Org membership check (org-scoped users must belong to THIS org) ─
  if (isOrgRole(user.role) && user.organizationId !== org.id) {
    // The user is org-scoped but to a DIFFERENT org — deny.
    redirect('/platform/login?error=org_mismatch');
  }

  // ─── 5. Render shell ───────────────────────────────────────────────────
  // Pass a serializable subset of the user + org to the client island.
  const layoutUser: LayoutUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId ?? null,
  };
  const layoutOrg: OrgForLayout = {
    id: org.id,
    slug: org.slug,
    name: org.name,
    logoUrl: org.logoUrl,
    brandColor: org.brandColor,
    status: org.status,
    plan: org.plan,
    maxWeddings: org.maxWeddings,
    maxMembers: org.maxMembers,
  };

  const roleLabel = ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role;
  const planLabel = PLAN_LABELS[org.plan as keyof typeof PLAN_LABELS] || org.plan;
  const statusLabel = ORG_STATUS_LABELS[org.status] || org.status;

  return (
    <div
      className="min-h-screen text-foreground flex"
      style={{
        background:
          'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
      }}
    >
      <ThemeInjector />

      {/* ── Desktop sidebar (Server-rendered chrome) ────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-white/10 bg-white/[0.02]">
        {/* Org header */}
        <div className="p-4 flex items-center gap-3">
          <div className="relative shrink-0 w-10 h-10 rounded-full gold-border p-[2px] overflow-hidden bg-white/5 flex items-center justify-center">
            {layoutOrg.logoUrl ? (
              <Image
                src={layoutOrg.logoUrl}
                alt={layoutOrg.name}
                width={40}
                height={40}
                className="w-full h-full rounded-full object-cover"
                unoptimized
              />
            ) : (
              <Building2 className="w-5 h-5 text-gold" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm gold-gradient font-display truncate" title={layoutOrg.name}>
              {layoutOrg.name}
            </h2>
            <p className="text-[11px] text-muted-foreground truncate">
              {planLabel} · {statusLabel}
            </p>
          </div>
        </div>

        {/* Org badges */}
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-gold/15 text-gold border-gold/40">
            {planLabel}
          </Badge>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
            {statusLabel}
          </Badge>
        </div>

        {/* Nav */}
        <nav className="px-2 py-2 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
          <SidebarLink href={`/org/${slug}/admin`} label="Tableau de bord" icon={<LayoutDashboard className="w-4 h-4 shrink-0" />} />
          <SidebarLink href={`/org/${slug}/admin/members`} label="Membres" icon={<Users className="w-4 h-4 shrink-0" />} />
          <SidebarLink href={`/org/${slug}/admin/buy-credits`} label="Acheter des crédits" icon={<CreditCard className="w-4 h-4 shrink-0" />} />
          {isPlatformAdmin(user.role) || user.role === 'ORG_ADMIN' ? (
            <SidebarLink href={`/org/${slug}/admin/settings`} label="Paramètres" icon={<Settings className="w-4 h-4 shrink-0" />} />
          ) : null}
        </nav>

        {/* User + logout (client island for the logout button) */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold shrink-0">
              {layoutUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{layoutUser.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{roleLabel}</p>
            </div>
          </div>
          {isPlatformAdmin(user.role) && (
            <Link
              href="/platform/admin"
              className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-sm text-gold hover:bg-gold/10 transition-colors"
            >
              <Crown className="w-4 h-4" />
              Espace Plateforme
            </Link>
          )}
          {/* The logout + mobile menu live in the client island below */}
          <OrgAdminSidebar user={layoutUser} org={layoutOrg} variant="footer" />
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile top bar (hamburger + org name) — client island for toggle */}
        <OrgAdminSidebar user={layoutUser} org={layoutOrg} variant="mobile-topbar" />

        {/* Page content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Small presentational helper ──────────────────────────────────────────────

function SidebarLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
