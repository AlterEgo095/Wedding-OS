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
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  LayoutGrid,
  LayoutDashboard,
  Heart,
  Users as UsersIcon,
  ScrollText,
  Crown,
  LogOut,
  Menu as MenuIcon,
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
} from 'lucide-react'

import dynamic from 'next/dynamic'

// Lazy-loaded heavy tabs (P1-UX-9 + P2-PERF-13).
const BillingTab = dynamic(() => import('./BillingTab').then((m) => m.BillingTab))
const OnboardingTab = dynamic(() => import('./OnboardingTab').then((m) => m.OnboardingTab))
const CollectionsFactoryTab = dynamic(() => import('./CollectionsFactoryTab').then((m) => m.CollectionsFactoryTab))
const ThemeCustomizer = dynamic(() => import('@/components/admin/ThemeCustomizer').then((m) => m.ThemeCustomizer), { ssr: false })
const MarketingControlPlane = dynamic(() => import('@/components/marketing/MarketingControlPlane'), { ssr: false })
const CommercialOS = dynamic(() => import('@/components/commercial/CommercialOS'), { ssr: false })

// Extracted tabs (CONS-3).
import { DashboardTab } from './tabs/DashboardTab'
import { WeddingsTab } from './tabs/WeddingsTab'
import { UsersTab } from './tabs/UsersTab'
import { AuditTab } from './tabs/AuditTab'

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

import {
  type AuthUser,
  type TabId,
  type NavItem,
  type FetchWithAuth,
  getRoleLabel,
} from './tabs/shared'

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
  // ── COMMERCIAL ──
  { id: 'commercial', label: 'Commercial OS', icon: TrendingUp },
  { id: 'billing', label: 'Facturation', icon: Wallet },
  { id: 'onboarding', label: 'Onboarding', icon: Rocket },
  // ── EVENT OPERATIONS ──
  { id: 'weddings', label: 'Mariages', icon: Heart },
  // ── ORGANIZATIONS (P1.7 — B2B2C agency layer) ──
  { id: 'organizations', label: 'Organisations', icon: Building2 },
  // ── PRODUCTION STUDIO (CONS-3) ──
  { id: 'collections', label: 'Collections', icon: LayoutGrid },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'themes', label: 'Thèmes', icon: Palette },
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
const NAV_SECTIONS: Record<string, string> = {
  dashboard: 'COMMAND CENTER',
  commercial: 'COMMERCIAL',
  weddings: 'EVENT OPERATIONS',
  organizations: 'ORGANIZATIONS',
  collections: 'PRODUCTION STUDIO',
  templates: 'PRODUCTION STUDIO',
  themes: 'PRODUCTION STUDIO',
  'components-registry': 'PRODUCTION STUDIO',
  assets: 'PRODUCTION STUDIO',
  deployments: 'PRODUCTION STUDIO',
  governance: 'PRODUCTION STUDIO',
  // Mission 6.0 P3 — new Production Studio tabs
  brands: 'PRODUCTION STUDIO',
  layouts: 'PRODUCTION STUDIO',
  products: 'PRODUCTION STUDIO',
  experience: 'PRODUCTION STUDIO',
  'platform-health': 'PRODUCTION STUDIO',
  'qr-invitations': 'PRODUCTION STUDIO',
  ops: 'PRODUCTION STUDIO',
  users: 'SYSTEM',
}

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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
    setSidebarOpen(false)
  }, [])

  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeTab)

  const renderContent = (): ReactNode => {
    switch (activeTab) {
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
        return <UsersTab fetchWithAuth={fetchWithAuth} />
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
      default:
        return <DashboardTab fetchWithAuth={fetchWithAuth} setActiveTab={setActiveTab} />
    }
  }

  // Loading skeleton during hydration / auth check.
  if (!mounted || !authChecked || !user || (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-gold" />
          <p className="text-xs text-muted-foreground">Chargement de la plateforme…</p>
        </div>
      </div>
    )
  }

  const SidebarHeader = (
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

  const SidebarNav = (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2">
      <nav className="px-2 space-y-1">
        {NAV_ITEMS.map((item, idx) => {
          const isActive = activeTab === item.id
          const section = NAV_SECTIONS[item.id]
          const prevItem = idx > 0 ? NAV_ITEMS[idx - 1] : null
          const showSectionHeader = section && (!prevItem || NAV_SECTIONS[prevItem.id] !== section)
          return (
            <div key={item.id}>
              {showSectionHeader && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gold/50">
                  {section}
                </p>
              )}
              <button
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-gold/15 text-gold font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="platform-sidebar-indicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-gold"
                  />
                )}
              </button>
            </div>
          )
        })}
      </nav>
    </div>
  )

  const SidebarFooter = (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3 px-2">
        <div className="w-9 h-9 rounded-full bg-gradient-gold flex items-center justify-center text-white text-sm font-bold shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{user.name}</p>
          <p className="text-[10px] text-gold/80 uppercase tracking-wider truncate">
            {getRoleLabel(user.role)}
          </p>
        </div>
      </div>
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
        onClick={() => window.location.href = '/'}
      >
        <X className="w-4 h-4 mr-2" />
        Retour au site
      </Button>
    </div>
  )

  return (
    <div className="h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/10 bg-white/[0.02]">
        {SidebarHeader}
        <Separator className="bg-white/10" />
        {SidebarNav}
        <Separator className="bg-white/10" />
        {SidebarFooter}
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute left-0 top-0 bottom-0 w-64 z-50 md:hidden flex flex-col border-r border-white/10"
              style={{
                background:
                  'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270))',
              }}
            >
              <div className="p-4 flex items-center justify-between">
                {SidebarHeader}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Separator className="bg-white/10" />
              {SidebarNav}
              <Separator className="bg-white/10" />
              {SidebarFooter}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10 bg-white/[0.02]">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <MenuIcon className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2">
            {activeNavItem && (
              <>
                <activeNavItem.icon className="w-4 h-4 text-gold" />
                <h1 className="font-semibold text-sm">{activeNavItem.label}</h1>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
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
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
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
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden shrink-0 flex items-center border-t border-white/10 bg-white/[0.02] safe-area-pb">
          {NAV_ITEMS.slice(0, 6).map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
                  isActive ? 'text-gold' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="truncate text-[10px]">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
