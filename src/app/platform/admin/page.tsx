'use client'

// ════════════════════════════════════════════════════════════════════════════
// Platform Admin — Super Admin Production Studio (CONS-3 refactor).
//
// This file was 2638 lines (god component). It has been refactored:
//   - DashboardTab / WeddingsTab / UsersTab / AuditTab  → ./tabs/*.tsx
//   - Production Studio tabs (Templates, Themes, Components, Assets,
//     Deployments, Governance) → ./tabs/production/*.tsx
// The shell now contains: imports, usePlatformFetch, NAV_ITEMS, the auth
// gate, the sidebar/top bar, and the renderTabContent switch.
//
// ─── Phase 4A (MISSION 5.9.0 §20.6) — Preview Lab ────────────────────────────
// The Preview Lab lives at /platform/admin/preview/[weddingSlug] (a separate
// Server-Component route, auth-gated via getServerAuthUser + isPlatformAdmin).
// It's NOT a tab here — it's a standalone page with its own layout (no
// sidebar) so the iframes get maximum viewport width. Entry point: the
// WeddingsTab dropdown ("Lab Preview" item per wedding, added Phase 4A).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  LayoutGrid,
  LayoutDashboard,
  Heart,
  Users as UsersIcon,
  ScrollText,
  Crown,
  LogOut,
  X,
  Loader2,
  ExternalLink,
  Wallet,
  Rocket,
  TrendingUp,
  Building2,
  // Production Studio icons (CONS-3)
  FileText,
  Palette,
  Boxes,
  Image as ImageIcon,
  Cloud,
  ShieldCheck,
  // Mission 6.0 P3 — new Production Studio tab icons
  Package,           // P3.3 Products
  Layout,            // P3.2 Layouts
  Activity,          // P3.4 Experience + P3.11 Ops
  QrCode,            // P3.8 QR/Invitations
  Server,            // P3.11 Ops
  HeartPulse,        // P3.7 Platform Health
  // P4.1 — Guestbook moderation (Livre d'Or)
  BookOpen,
  // P4.7 — 2FA setup: re-using ShieldCheck (already imported above for the
  // Governance tab icon).
  // Phase 2E — Identity presets catalog tab.
  Sparkles,
  // 5.8.15 — Diagnostic Center
  Gauge,
} from 'lucide-react'

import dynamic from 'next/dynamic'

// Lazy-loaded heavy tabs (P1-UX-9 + P2-PERF-13).
const BillingTab = dynamic(() => import('./BillingTab').then((m) => m.BillingTab))
const OnboardingTab = dynamic(() => import('./OnboardingTab').then((m) => m.OnboardingTab))
const CollectionsFactoryTab = dynamic(() => import('./CollectionsFactoryTab').then((m) => m.CollectionsFactoryTab))
const ThemeCustomizer = dynamic(() => import('@/components/admin/ThemeCustomizer').then((m) => m.ThemeCustomizer), { ssr: false })
const MarketingControlPlane = dynamic(() => import('@/components/marketing/MarketingControlPlane'), { ssr: false })
const CommercialOS = dynamic(() => import('@/components/commercial/CommercialOS'), { ssr: false })

// Phase 2E (MISSION 5.9.0 §20.4) — Identity presets viewer (read-only catalog).
const IdentityPresetsManager = dynamic(() => import('./tabs/production/IdentityPresetsManager').then((m) => m.IdentityPresetsManager))

// Extracted tabs (CONS-3).
import { DashboardTab } from './tabs/DashboardTab'
import { WeddingsTab } from './tabs/WeddingsTab'
import { UsersTab } from './tabs/UsersTab'
import { AuditTab } from './tabs/AuditTab'
import { GuestbookTab } from './tabs/wedding/GuestbookTab'
// P4.7 — 2FA setup modal (reusable across all admin/staff roles)
import TwoFactorSetup from '@/components/auth/TwoFactorSetup'
import { SkeletonAdminShell } from '@/components/design-system'

// Production Studio tabs (CONS-3) — lazy-loaded.
// Mission 6.0 P1.7 — Organizations tab (lazy-loaded).
const OrganizationsTab = dynamic(() => import('./tabs/OrganizationsTab').then((m) => m.OrganizationsTab))
const TemplatesManager = dynamic(() => import('./tabs/production/TemplatesManager').then((m) => m.TemplatesManager))
const ThemesManager = dynamic(() => import('./tabs/production/ThemesManager').then((m) => m.ThemesManager))
const ComponentsRegistry = dynamic(() => import('./tabs/production/ComponentsRegistry').then((m) => m.ComponentsRegistry))
const AssetsLibrary = dynamic(() => import('./tabs/production/AssetsLibrary').then((m) => m.AssetsLibrary))
const DeploymentsPanel = dynamic(() => import('./tabs/production/DeploymentsPanel').then((m) => m.DeploymentsPanel))
const GovernancePanel = dynamic(() => import('./tabs/production/GovernancePanel').then((m) => m.GovernancePanel))

// Mission 6.0 P3 — new Production Studio panels (lazy-loaded).
const BrandManager = dynamic(() => import('./tabs/production/BrandManager').then((m) => m.BrandManager))
const LayoutsManager = dynamic(() => import('./tabs/production/LayoutsManager').then((m) => m.LayoutsManager))
const ProductManager = dynamic(() => import('./tabs/production/ProductManager').then((m) => m.ProductManager))
const ExperienceManager = dynamic(() => import('./tabs/production/ExperienceManager').then((m) => m.ExperienceManager))
const PlatformHealthPanel = dynamic(() => import('./tabs/production/PlatformHealthPanel').then((m) => m.PlatformHealthPanel))
const QRInvitationsPanel = dynamic(() => import('./tabs/production/QRInvitationsPanel').then((m) => m.QRInvitationsPanel))
const OpsPanel = dynamic(() => import('./tabs/production/OpsPanel').then((m) => m.OpsPanel))

// 5.8.15 — Diagnostic Center (No-Code Command Center)
const DiagnosticCenterTab = dynamic(() => import('./tabs/DiagnosticCenterTab').then((m) => m.DiagnosticCenterTab))

import {
  type AuthUser,
  type TabId,
  type NavItem,
  type FetchWithAuth,
  getRoleLabel,
} from './tabs/shared'
import {
  AdminShell,
  type AdminShellSection,
  type AdminShellUser,
  type AdminShellBreadcrumb,
} from '@/components/admin/AdminShell'
// P4-FUSION — fused-section sub-navigation + pinned wedding context selector.
import { SectionTabBar } from '@/components/admin/SectionTabBar'
import { WeddingContextSelector } from '@/components/admin/WeddingContextSelector'

// useSyncExternalStore subscribe placeholder — we only need the getServerSnapshot
// vs getSnapshot split to detect "are we hydrated yet?" without triggering the
// react-hooks/set-state-in-effect lint rule. Mirrors the /w/[slug]/admin pattern
// (P1-UX-7) so the SSR pass and the first client render both produce the same
// loading skeleton, eliminating the hydration mismatch.
const emptySubscribe = (): (() => void) => () => {}
const getTrue = (): boolean => true
const getFalse = (): boolean => false

// ════════════════════════════════════════════════════════════════════════════
// NAV_ITEMS — Super Admin Production Studio (CONS-3).
// ════════════════════════════════════════════════════════════════════════════
// Mission 5.7 Phase 3 + CONS-3: progressive regrouping into 6 domains.
// Tab IDs are UNCHANGED for existing tabs (no deep-link breakage). The new
// Production Studio tabs (templates/themes/components-registry/assets/
// deployments/governance) are added under the "PRODUCTION STUDIO" section.

const NAV_ITEMS: NavItem[] = [
  // ── COMMAND CENTER ──
  { id: 'dashboard', label: "Vue d'ensemble", icon: LayoutDashboard },
  // 5.8.15 — No-Code Diagnostic Center
  { id: 'diagnostics', label: 'Diagnostic', icon: Gauge },
  // ── COMMERCIAL ──
  { id: 'commercial', label: 'Commercial OS', icon: TrendingUp },
  { id: 'billing', label: 'Facturation', icon: Wallet },
  { id: 'onboarding', label: 'Onboarding', icon: Rocket },
  // ── EVENT OPERATIONS ──
  { id: 'weddings', label: 'Mariages', icon: Heart },
  // ── P4.1: Guestbook moderation (Livre d'Or) ──
  { id: 'guestbook', label: "Livre d'Or", icon: BookOpen },
  // ── ORGANIZATIONS (P1.7 — B2B2C agency layer) ──
  { id: 'organizations', label: 'Organisations', icon: Building2 },
  // ── PRODUCTION STUDIO (CONS-3) ──
  { id: 'collections', label: 'Collections', icon: LayoutGrid },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'themes', label: 'Thèmes', icon: Palette },
  // Phase 2E (MISSION 5.9.0 §20.4) — Identity presets catalog (read-only viewer).
  { id: 'identities', label: 'Identités', icon: Sparkles },
  { id: 'components-registry', label: 'Composants', icon: Boxes },
  { id: 'assets', label: 'Assets', icon: ImageIcon },
  { id: 'deployments', label: 'Déploiements', icon: Cloud },
  { id: 'governance', label: 'Gouvernance', icon: ShieldCheck },
  // Mission 6.0 P3 — new Production Studio tabs
  { id: 'brands', label: 'Brands', icon: Palette },
  { id: 'layouts', label: 'Layouts', icon: Layout },
  { id: 'products', label: 'Produits', icon: Package },
  { id: 'experience', label: 'Experience', icon: Activity },
  { id: 'platform-health', label: 'Santé plateforme', icon: HeartPulse },
  { id: 'qr-invitations', label: 'QR & Invitations', icon: QrCode },
  { id: 'ops', label: 'Opérations', icon: Server },
  // ── SYSTEM ──
  { id: 'users', label: 'Utilisateurs', icon: UsersIcon },
  { id: 'audit', label: "Journal d'audit", icon: ScrollText },
]

// Maps each tab id to a section label. The sidebar renders a section header
// before the first item of each group. Undefined = no header (flat).
// P4-FUSION — 8-section IA (audit ADMIN-MAP §4).
//
// The former 25-item / 6-section sidebar is fused into 8 top-level sections.
// The PRODUCTION STUDIO catch-all (13 tabs mixing 4 concept families) is
// split per the audit finding:
//   CATALOGUE      — client-facing content (collections, templates, themes,
//                    identities, qr-invitations)
//   DESIGN SYSTÈME — design infrastructure (components-registry, assets,
//                    brands, layouts, products, experience)
//   OPÉRATIONS     — run concerns (deployments, platform-health, ops)
//
// Contract preserved:
//   - TabId SSOT unchanged (all ids intact, none renamed) — DashboardTab /
//     DiagnosticCenterTab setActiveTab callers keep working. The sub-tab
//     state IS activeTab; the section is derived from it.
//   - Zero tab component touched — sections only regroup them.
//   - 'appearance' / 'marketing' (legacy deep-link-only ids, not in
//     NAV_ITEMS) fall back to the overview section.

interface PlatformSectionDef {
  id: string
  label: string
  stripeColor: 'gold' | 'emerald' | 'rose' | 'violet' | 'slate'
  icon: React.ComponentType<{ className?: string }>
  itemIds: TabId[]
}

const PLATFORM_SECTION_DEFS: PlatformSectionDef[] = [
  { id: 'overview', label: "Vue d'ensemble", stripeColor: 'gold', icon: LayoutDashboard, itemIds: ['dashboard', 'diagnostics'] },
  { id: 'commercial', label: 'Commercial', stripeColor: 'emerald', icon: TrendingUp, itemIds: ['commercial', 'billing', 'onboarding'] },
  { id: 'weddings', label: 'Mariages', stripeColor: 'rose', icon: Heart, itemIds: ['weddings', 'guestbook'] },
  { id: 'organizations', label: 'Organisations', stripeColor: 'violet', icon: Building2, itemIds: ['organizations'] },
  { id: 'catalogue', label: 'Catalogue', stripeColor: 'violet', icon: Crown, itemIds: ['collections', 'templates', 'themes', 'identities', 'qr-invitations'] },
  { id: 'design-system', label: 'Design Système', stripeColor: 'gold', icon: Boxes, itemIds: ['components-registry', 'assets', 'brands', 'layouts', 'products', 'experience'] },
  { id: 'ops', label: 'Opérations', stripeColor: 'slate', icon: Cloud, itemIds: ['deployments', 'platform-health', 'ops'] },
  { id: 'system', label: 'Système', stripeColor: 'slate', icon: ShieldCheck, itemIds: ['users', 'governance', 'audit'] },
]

// P4-FUSION — section color vocabulary: gold / emerald / rose / violet / slate
// (see stripeColor field of PLATFORM_SECTION_DEFS).

// ════════════════════════════════════════════════════════════════════════════
// usePlatformFetch — wraps fetch with cookie auth + session-expiry handling
// ════════════════════════════════════════════════════════════════════════════
// P1-SEC-3: previously sent `Authorization: Bearer <token>` with a token
// read from localStorage. Now sends `credentials: 'include'` so the
// httpOnly `auth_token` cookie is attached automatically (XSS-resistant —
// client JS cannot read the cookie). The Authorization header is no longer
// set; the server's getTokenFromRequest falls back to the cookie.

function usePlatformFetch() {
  const router = useRouter()
  const sessionExpiredRef = useRef(false)

  const onSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    try {
      fetch('/api/platform/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    toast.error('Session expirée, veuillez vous reconnecter')
    router.replace('/platform/login')
  }, [router])

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response | null> => {
      let res: Response
      try {
        res = await fetch(url, {
          ...init,
          credentials: 'include',
          headers: {
            ...(init?.headers || {}),
            ...maybeCsrfHeader(init?.method || 'GET'),
          },
        })
      } catch {
        toast.error('Erreur de connexion au serveur')
        return null
      }
      if (res.status === 401) {
        onSessionExpired()
        return null
      }
      if (res.status === 403) {
        try {
          const body = await res.clone().json()
          toast.error(body?.error || 'Accès refusé')
        } catch {
          toast.error('Accès refusé')
        }
        return null
      }
      return res
    },
    [onSessionExpired]
  )

  return { fetchWithAuth, onSessionExpired }
}

function maybeCsrfHeader(method: string): Record<string, string> {
  const m = method.toUpperCase()
  if (m !== 'POST' && m !== 'PUT' && m !== 'DELETE' && m !== 'PATCH') {
    return {}
  }
  if (typeof document === 'undefined') return {}
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
  if (!match) return {}
  const token = match.split('=').slice(1).join('=')
  return token ? { 'X-CSRF-Token': token } : {}
}

function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
  if (!match) return ''
  return match.split('=').slice(1).join('=')
}

// ════════════════════════════════════════════════════════════════════════════
// Main page — sidebar + top bar + tab content
// ════════════════════════════════════════════════════════════════════════════

export default function PlatformAdminPage() {
  const router = useRouter()
  const { fetchWithAuth } = usePlatformFetch()
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  // P4.7: 2FA setup modal — visible to ALL logged-in platform users.
  const [twoFactorOpen, setTwoFactorOpen] = useState(false)

  // P1-SEC-3: check auth status on mount via /api/me.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data?.user) {
            setUser(data.user as AuthUser)
            try {
              localStorage.setItem('admin_user', JSON.stringify(data.user))
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* network error — leave user as null */
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Auth gate — redirect to /platform/login if not authenticated or not a
  // platform admin. Runs once authChecked flips to true.
  useEffect(() => {
    if (!authChecked) return
    if (!user) {
      toast.error('Veuillez vous connecter')
      router.replace('/platform/login')
      return
    }
    if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN') {
      toast.error('Accès refusé')
      router.replace('/platform/login')
    }
  }, [authChecked, user, router])

  // Phase 4C — When the middleware's impersonation auto-expiry redirects
  // here with ?impersonation_expired=1, surface a one-shot toast so the
  // admin understands why they were bounced out of the wedding admin.
  // We use window.location.search (not useSearchParams) to avoid adding a
  // Suspense boundary to this already-complex page.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('impersonation_expired') === '1') {
      toast.info("Session d'impersonation expirée", {
        description: 'La session de 30 minutes est terminée. Vous pouvez relancer l\'impersonation si nécessaire.',
      })
      // Clean the query param so the toast doesn't re-fire on refresh.
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, '', cleanUrl)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/platform/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore — clear local anyway */
    }
    try {
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    setUser(null)
    toast.success('Déconnexion réussie')
    router.replace('/platform/login')
  }, [router])

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId)
  }, [])

  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeTab)

  // ─── P4-FUSION — derived section state ──────────────────────────────
  // The section is DERIVED from activeTab (no parallel state to desync).
  // Fallback guarantees a defined section for any TabId (covers the legacy
  // deep-link-only ids 'appearance' / 'marketing').
  const activeSectionDef =
    PLATFORM_SECTION_DEFS.find((s) => s.itemIds.includes(activeTab)) ??
    PLATFORM_SECTION_DEFS[0]

  const handleSectionChange = useCallback((sectionId: string) => {
    const def = PLATFORM_SECTION_DEFS.find((s) => s.id === sectionId)
    if (def) setActiveTab(def.itemIds[0])
  }, [])

  const renderContent = (): ReactNode => {
    switch (activeTab) {
      case 'diagnostics':
        return <DiagnosticCenterTab fetchWithAuth={fetchWithAuth} setActiveTab={setActiveTab} />
      case 'dashboard':
        return <DashboardTab fetchWithAuth={fetchWithAuth} setActiveTab={setActiveTab} />
      case 'weddings':
        return <WeddingsTab fetchWithAuth={fetchWithAuth} />
      case 'organizations':
        return <OrganizationsTab fetchWithAuth={fetchWithAuth} />
      case 'billing':
        return <BillingTab fetchWithAuth={fetchWithAuth} />
      case 'onboarding':
        return <OnboardingTab fetchWithAuth={fetchWithAuth} />
      case 'users':
        // Phase 4C — pass currentRole so UsersTab can gate the "Impersoner"
        // button on PLATFORM_ADMIN / SUPER_ADMIN (defense-in-depth).
        return <UsersTab fetchWithAuth={fetchWithAuth} currentRole={user?.role || ''} />
      case 'audit':
        return <AuditTab fetchWithAuth={fetchWithAuth} />
      case 'appearance':
        return <ThemeCustomizer />
      case 'collections':
        return <CollectionsFactoryTab csrfToken={getCsrfToken()} />
      case 'marketing':
        return <MarketingControlPlane csrfToken={getCsrfToken()} />
      case 'commercial':
        return <CommercialOS csrfToken={getCsrfToken()} />
      // ── Production Studio (CONS-3) ──
      case 'templates':
        return <TemplatesManager csrfToken={getCsrfToken()} />
      case 'themes':
        return <ThemesManager csrfToken={getCsrfToken()} />
      // Phase 2E (MISSION 5.9.0 §20.4) — Identity presets catalog (read-only).
      case 'identities':
        return <IdentityPresetsManager />
      case 'components-registry':
        return <ComponentsRegistry csrfToken={getCsrfToken()} />
      case 'assets':
        return <AssetsLibrary csrfToken={getCsrfToken()} />
      case 'deployments':
        return <DeploymentsPanel csrfToken={getCsrfToken()} />
      case 'governance':
        return <GovernancePanel fetchWithAuth={fetchWithAuth} />
      // Mission 6.0 P3 — new Production Studio tabs
      case 'brands':
        return <BrandManager csrfToken={getCsrfToken()} />
      case 'layouts':
        return <LayoutsManager csrfToken={getCsrfToken()} />
      case 'products':
        return <ProductManager csrfToken={getCsrfToken()} />
      case 'experience':
        return <ExperienceManager csrfToken={getCsrfToken()} />
      case 'platform-health':
        return <PlatformHealthPanel fetchWithAuth={fetchWithAuth} />
      case 'qr-invitations':
        return <QRInvitationsPanel csrfToken={getCsrfToken()} />
      case 'ops':
        return <OpsPanel fetchWithAuth={fetchWithAuth} />
      case 'guestbook':
        return <GuestbookTab fetchWithAuth={fetchWithAuth} />
      default:
        return <DashboardTab fetchWithAuth={fetchWithAuth} setActiveTab={setActiveTab} />
    }
  }

  // Loading skeleton during hydration / auth check.
  if (!mounted || !authChecked || !user || (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return <SkeletonAdminShell accent="emerald" className="min-h-screen rounded-none border-0" />
  }

  // ─── Build <AdminShell> props ──────────────────────────────────────────────
  // Phase 1D: chrome extracted into the reusable <AdminShell> primitive.
  // P4-FUSION: the sidebar renders the 8 top-level sections as a flat nav
  // (one item per section — no section headers). Sub-navigation lives in the
  // content area via <SectionTabBar>.

  const sections: AdminShellSection[] = PLATFORM_SECTION_DEFS.map((sectionDef) => ({
    id: `sec-${sectionDef.id}`,
    label: undefined, // flat top-level nav — no section header
    stripeColor: sectionDef.stripeColor,
    items: [
      {
        href: `#sec-${sectionDef.id}`,
        label: sectionDef.label,
        icon: <sectionDef.icon className="w-4 h-4 shrink-0" />,
        active: activeSectionDef.id === sectionDef.id,
        onNavigate: () => handleSectionChange(sectionDef.id),
      },
    ],
  }))

  // ─── Breadcrumbs (updated P4-FUSION)
  // Plateforme (link to /platform/admin) > Section label > Sub-tab label
  // (only when the section has >1 sub-tabs — for single-sub-tab sections the
  // section label IS the page). The last item is rendered with text-gold (no
  // link).
  const breadcrumbs: AdminShellBreadcrumb[] = [
    { label: 'Plateforme', href: '/platform/admin' },
    ...(activeSectionDef.itemIds.length > 1
      ? [
          { label: activeSectionDef.label },
          { label: activeNavItem?.label || activeSectionDef.label },
        ]
      : [{ label: activeSectionDef.label }]),
  ]

  const brand = (
    <div className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center shrink-0 shadow-lg">
        <Crown className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-sm gold-gradient font-display tracking-wide truncate">
          Heureux Mariage
        </h2>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Plateforme Admin
        </p>
      </div>
    </div>
  )

  const sidebarFooter = (
    <>
      <Button
        variant="ghost"
        className="w-full justify-start text-gold hover:text-gold hover:bg-gold/10 text-sm mb-1"
        onClick={() => setTwoFactorOpen(true)}
      >
        <ShieldCheck className="w-4 h-4 mr-2" />
        Sécurité 2FA
      </Button>
      <Button
        variant="ghost"
        className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 text-sm"
        onClick={handleLogout}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Déconnexion
      </Button>
      <Button
        variant="ghost"
        className="w-full justify-start text-muted-foreground hover:text-foreground text-sm mt-1"
        onClick={() => { window.location.href = '/' }}
      >
        <X className="w-4 h-4 mr-2" />
        Retour au site
      </Button>
    </>
  )

  const mobileBottomBar = (
    <nav className="md:hidden shrink-0 flex items-center border-t border-white/10 bg-white/[0.02] safe-area-pb">
      {PLATFORM_SECTION_DEFS.slice(0, 5).map((def) => {
        const isActive = activeSectionDef.id === def.id
        return (
          <button
            key={def.id}
            onClick={() => handleSectionChange(def.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive ? 'text-gold' : 'text-muted-foreground'
            }`}
          >
            <def.icon className="w-5 h-5" />
            <span className="truncate text-[10px]">{def.label}</span>
          </button>
        )
      })}
    </nav>
  )

  const topBarRight = (
    <>
      {/* P4-FUSION — pinned wedding context selector (audit ADMIN-MAP §2:
          "What wedding am I managing ?" was unanswered on the platform
          console). Persists the selected slug in localStorage and exposes
          direct jumps to the wedding console + Preview Lab. */}
      <WeddingContextSelector fetchWithAuth={fetchWithAuth} />
      <Link
        href="/"
        className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span>Voir le site</span>
      </Link>
      <div className="flex items-center gap-2 pl-2 border-l border-white/10">
        <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="hidden sm:flex flex-col">
          <span className="text-xs font-medium leading-tight">{user.name}</span>
          <span className="text-[10px] text-gold/70 uppercase tracking-wider leading-tight">
            {getRoleLabel(user.role)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-red-400 hover:text-red-300 hover:bg-red-400/10"
          onClick={handleLogout}
          aria-label="Déconnexion"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </>
  )

  // P4-FUSION: the page title shows the SECTION (the stable top-level place),
  // not the sub-tab — the sub-tab bar below (when present) carries the
  // in-section position.
  const pageTitle = (
    <>
      <activeSectionDef.icon className="w-4 h-4 text-gold" />
      <h1 className="font-semibold text-sm">{activeSectionDef.label}</h1>
    </>
  )

  const shellUser: AdminShellUser = {
    name: user.name,
    email: user.email,
    roleLabel: getRoleLabel(user.role),
    avatarInitial: user.name.charAt(0).toUpperCase(),
  }

  return (
    <>
      <AdminShell
        sections={sections}
        user={shellUser}
        brand={brand}
        sidebarFooter={sidebarFooter}
        sidebarWidth="w-60"
        mobileDrawerWidth="w-64"
        pageTitle={pageTitle}
        breadcrumbs={breadcrumbs}
        topBarRight={topBarRight}
        mobileBottomBar={mobileBottomBar}
      >
        {/* P4-FUSION — sub-tab bar for multi-manager sections (rendered
            OUTSIDE AnimatePresence so switching sub-tabs doesn't remount
            the bar itself). Single-sub-tab sections render no bar. */}
        <SectionTabBar
          consoleId="platform"
          items={activeSectionDef.itemIds.map((id) => ({
            id,
            label: NAV_ITEMS.find((n) => n.id === id)?.label || id,
          }))}
          activeId={activeTab}
          onChange={handleTabChange}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="min-h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </AdminShell>

      {/* P4.7 — 2FA setup modal (accessible from the sidebar footer) */}
      <TwoFactorSetup
        open={twoFactorOpen}
        onOpenChange={setTwoFactorOpen}
        onSuccess={() => {
          setTwoFactorOpen(false)
          toast.success('2FA activée avec succès')
        }}
      />
    </>
  )
}
