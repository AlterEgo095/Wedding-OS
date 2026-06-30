// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/admin/page.tsx — Phase 3 Per-Wedding Admin Dashboard
// ══════════════════════════════════════════════════════════════════════════════
// Tenant-aware admin shell. Mirrors /admin/page.tsx exactly (same NAV_ITEMS,
// same sidebar, same mobile responsive behavior, same panels) but:
//
//   1. On mount: read admin_token from localStorage. If missing → redirect to
//      /w/{slug}/admin/login.
//   2. Installs a GLOBAL fetch interceptor (useEffect once per slug) that wraps
//      window.fetch to auto-add the X-Wedding-Slug header on every /api/* call.
//      This lets ALL existing admin components (Dashboard, GuestManager, …)
//      work unchanged — they just call fetch('/api/…') and the interceptor
//      attaches the tenant header transparently.
//   3. Sidebar shows the wedding's coupleLabel + the user's name.
//   4. PLATFORM_ADMIN sees an extra "Plateforme" link to /platform/admin.
//   5. visibleNavItems filter includes PLATFORM_ADMIN for superAdminOnly tabs.
//   6. On logout / sessionExpired → clear localStorage + redirect to login.

'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, Users, Grid3X3, Image as ImageIcon, Clock, Shield, Settings, LogOut,
  X, Menu, FileSearch, Music, Sparkles, Crown, Loader2, Palette, PenTool, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { isPlatformAdmin } from '@/lib/types';
import { useWedding } from '../wedding-context';

import Dashboard from '@/components/admin/Dashboard';
import GuestManager from '@/components/admin/GuestManager';
import TableManager from '@/components/admin/TableManager';
import MediaManager from '@/components/admin/MediaManager';
import UserManager from '@/components/admin/UserManager';
import TimelineManager from '@/components/admin/TimelineManager';
import SettingsManager from '@/components/admin/SettingsManager';
import AccessLogManager from '@/components/admin/AccessLogManager';
import MusicManager from '@/components/admin/MusicManager';
import AppearanceManager from '@/components/admin/AppearanceManager';
import { ThemeCustomizer } from '@/components/admin/ThemeCustomizer';
import { PenpotStudio } from '@/components/penpot/PenpotStudio';
import { CollectionLibrary } from '@/components/collections/CollectionLibrary';

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  weddingId?: string | null
}

type TabId = 'dashboard' | 'collections' | 'guests' | 'tables' | 'media' | 'music' | 'timeline' | 'users' | 'settings' | 'access-logs' | 'appearance' | 'theme' | 'studio'

interface NavItem {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  superAdminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'collections', label: 'Collections', icon: Layers },
  { id: 'guests', label: 'Invités', icon: Users },
  { id: 'tables', label: 'Tables', icon: Grid3X3 },
  { id: 'access-logs', label: 'Accès', icon: FileSearch },
  { id: 'media', label: 'Médias', icon: ImageIcon },
  { id: 'music', label: 'Musique', icon: Music },
  { id: 'timeline', label: 'Programme', icon: Clock },
  { id: 'theme', label: 'Thème', icon: Palette },
  { id: 'studio', label: 'Studio', icon: PenTool },
  { id: 'appearance', label: 'Apparence', icon: Sparkles },
  { id: 'users', label: 'Utilisateurs', icon: Shield, superAdminOnly: true },
  { id: 'settings', label: 'Paramètres', icon: Settings, superAdminOnly: true },
]

// Generic couple-photo fallback (exists in /public for every deployment).
// Avoids assuming the current wedding owns `/uploads/couple-photo-1.jpeg`
// (which is the default wedding's asset). The couple label is already
// derived from the wedding context (`wedding.coupleLabel`), so we never
// leak the default wedding's couple identity into another tenant's admin.
const COUPLE_PHOTO_FALLBACK = '/couple-hero.jpeg'

// useSyncExternalStore subscribe placeholder — we only need the getServerSnapshot
// vs getSnapshot split to detect "are we hydrated yet?" without triggering the
// react-hooks/set-state-in-effect lint rule.
const emptySubscribe = (): (() => void) => () => {}
const getTrue = (): boolean => true
const getFalse = (): boolean => false

export default function PerWeddingAdminPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()
  const wedding = useWedding()

  // mounted: false on SSR and during the very first client render (hydration),
  // then true once React swaps to the client snapshot. This lets us render a
  // stable loading screen during hydration and avoid mismatches when the
  // server-rendered HTML has no token but the client does (via localStorage).
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse)

  // ─── Auth state ────────────────────────────────────────────────────────────
  // Lazy initializers read localStorage once on the client (matching the
  // /admin/page.tsx pattern). On the server they return null. We don't access
  // these in the render output until `mounted` is true, so there is no
  // hydration mismatch.
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_token')
    }
    return null
  })
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('admin_user')
        return saved ? (JSON.parse(saved) as AuthUser) : null
      } catch {
        return null
      }
    }
    return null
  })

  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sessionExpiredRef = useRef(false)

  // ─── Install global fetch interceptor (useLayoutEffect — runs before any
  // child useEffect, so the X-Wedding-Slug header is in place by the time
  // admin components like Dashboard, GuestManager, etc. fire their initial
  // /api/* requests. Otherwise the first fetch would silently fall back to
  // the default wedding and show wrong data.)
  useLayoutEffect(() => {
    const originalFetch = window.fetch
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.startsWith('/api/')) {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        )
        // Auto-attach the wedding slug for tenant scoping (existing behavior)
        if (!headers.has('X-Wedding-Slug')) {
          headers.set('X-Wedding-Slug', slug)
        }
        // Consolidation fix: also auto-attach the admin Bearer token from
        // localStorage so components that don't receive an explicit `token`
        // prop (ThemeCustomizer, PenpotStudio) can still call authenticated
        // PUT/POST endpoints. Additive: if a component already sets
        // Authorization (GuestManager, TableManager, etc.), we don't override.
        if (!headers.has('Authorization')) {
          const t = localStorage.getItem('admin_token')
          if (t) {
            headers.set('Authorization', `Bearer ${t}`)
          }
        }
        init = { ...init, headers }
      }
      return originalFetch(input as RequestInfo, init)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [slug])

  // ─── Mount: redirect if no token (separate from interceptor so the
  // interceptor installs synchronously regardless of auth state)
  useEffect(() => {
    if (!token || !user) {
      router.replace(`/w/${slug}/admin/login`)
      return
    }
  }, [slug, router, token, user])

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = useCallback(
    (showMessage = true) => {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      setToken(null)
      setUser(null)
      if (showMessage) toast.success('Déconnexion réussie')
      router.replace(`/w/${slug}/admin/login`)
    },
    [slug, router]
  )

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    setToken(null)
    setUser(null)
    toast.error('Session expirée, veuillez vous reconnecter')
    router.replace(`/w/${slug}/admin/login`)
  }, [slug, router])

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId)
    setSidebarOpen(false)
  }, [])

  // PLATFORM_ADMIN and SUPER_ADMIN both see the superAdminOnly tabs.
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || isPlatformAdmin(user?.role || '')
  )

  const renderContent = () => {
    if (!token) return null

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard token={token} onSessionExpired={handleSessionExpired} />
      case 'collections':
        // Collection Engine (Phase 1) — the couple-facing Collection Product catalog.
        // Lists all Collections accessible to the wedding's billing plan and lets
        // the couple apply one. The fetch interceptor installed above attaches
        // X-Wedding-Slug + Authorization headers transparently.
        return <CollectionLibrary slug={slug} />
      case 'guests':
        return <GuestManager token={token} onSessionExpired={handleSessionExpired} />
      case 'tables':
        return <TableManager token={token} onSessionExpired={handleSessionExpired} />
      case 'media':
        return <MediaManager token={token} onSessionExpired={handleSessionExpired} />
      case 'music':
        return <MusicManager token={token} onSessionExpired={handleSessionExpired} />
      case 'timeline':
        return <TimelineManager token={token} onSessionExpired={handleSessionExpired} />
      case 'users':
        return <UserManager token={token} userRole={user?.role || ''} onSessionExpired={handleSessionExpired} />
      case 'access-logs':
        return <AccessLogManager token={token} onSessionExpired={handleSessionExpired} />
      case 'settings':
        return <SettingsManager token={token} userRole={user?.role || ''} onSessionExpired={handleSessionExpired} />
      case 'theme':
        // Consolidation fix: mount ThemeCustomizer in the tenant admin so couples
        // can edit their own wedding's colors + fonts. The explicit `slug` prop
        // bypasses the platform-admin wedding picker and scopes all /api/theme
        // calls to this wedding via the fetch interceptor installed above.
        return <ThemeCustomizer slug={slug} />
      case 'studio':
        // Penpot native integration: the official design Studio of Wedding OS.
        // Embeds Penpot via iframe, syncs design tokens with the Theme Engine,
        // and lets couples design their invitations visually. Coexists with
        // LuxuryVisualEngine (ambiance overlay) and ThemeInjector (token injection).
        return <PenpotStudio slug={slug} />
      case 'appearance':
        return <AppearanceManager token={token} onSessionExpired={handleSessionExpired} />
      default:
        return <Dashboard token={token} onSessionExpired={handleSessionExpired} />
    }
  }

  const activeNavItem = visibleNavItems.find((item) => item.id === activeTab)
  const coupleLabel = wedding.coupleLabel || slug

  // ─── Loading screen during SSR / hydration / missing-token window ──────────
  if (!mounted || !token || !user) {
    return (
      <div
        className="h-screen flex flex-col items-center justify-center gap-4"
        style={{
          background:
            'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
        }}
      >
        <div className="w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center shadow-lg">
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement de l&apos;espace administrateur…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex" style={{
      background: 'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
    }}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-white/10 bg-white/[0.02]">
        {/* Sidebar Header */}
        <div className="p-4 flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full gold-border p-[2px] overflow-hidden">
              <Image
                src={COUPLE_PHOTO_FALLBACK}
                alt={coupleLabel}
                width={40}
                height={40}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm gold-gradient font-display truncate" title={coupleLabel}>
              {coupleLabel}
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {user?.name || 'Non connecté'}
            </p>
          </div>
        </div>

        <Separator className="bg-white/10" />

        {/* Nav Items */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2">
          <nav className="px-2 space-y-1">
            {visibleNavItems.map((item) => {
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
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
                      layoutId="sidebar-indicator"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-gold"
                    />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        <Separator className="bg-white/10" />
        <div className="p-3">
          <div className="flex items-center gap-2 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.role}</p>
            </div>
          </div>
          {isPlatformAdmin(user.role) && (
            <Button
              variant="ghost"
              asChild
              className="w-full justify-start text-gold hover:text-gold hover:bg-gold/10 text-sm mb-1"
            >
              <Link href="/platform/admin">
                <Crown className="w-4 h-4 mr-2" />
                Plateforme
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 text-sm"
            onClick={() => handleLogout()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Déconnexion
          </Button>
          <Button
            variant="ghost"
            asChild
            className="w-full justify-start text-muted-foreground hover:text-foreground text-sm mt-1"
          >
            <Link href={`/w/${slug}`}>
              <X className="w-4 h-4 mr-2" />
              Retour au site
            </Link>
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
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
              className="absolute left-0 top-0 bottom-0 w-70 z-50 md:hidden flex flex-col border-r border-white/10"
              style={{
                background: 'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270))',
              }}
            >
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full gold-border p-[2px] overflow-hidden shrink-0">
                    <Image
                      src={COUPLE_PHOTO_FALLBACK}
                      alt={coupleLabel}
                      width={40}
                      height={40}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <h2 className="font-bold text-sm gold-gradient font-display truncate" title={coupleLabel}>
                    {coupleLabel}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground shrink-0"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <Separator className="bg-white/10" />

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2">
                <nav className="px-2 space-y-1">
                  {visibleNavItems.map((item) => {
                    const isActive = activeTab === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                          isActive
                            ? 'bg-gold/15 text-gold font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              <Separator className="bg-white/10" />

              <div className="p-3 space-y-1">
                {isPlatformAdmin(user.role) && (
                  <Button
                    variant="ghost"
                    asChild
                    className="w-full justify-start text-gold hover:text-gold hover:bg-gold/10 text-sm"
                  >
                    <Link href="/platform/admin">
                      <Crown className="w-4 h-4 mr-2" />
                      Plateforme
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 text-sm"
                  onClick={() => handleLogout()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Déconnexion
                </Button>
                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start text-muted-foreground hover:text-foreground text-sm"
                >
                  <Link href={`/w/${slug}`}>
                    <X className="w-4 h-4 mr-2" />
                    Retour au site
                  </Link>
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10 bg-white/[0.02]">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            {activeNavItem && (
              <>
                <activeNavItem.icon className="w-4 h-4 text-gold shrink-0" />
                <h1 className="font-semibold text-sm truncate">{activeNavItem.label}</h1>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              asChild
              size="sm"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              <Link href={`/w/${slug}`}>
                <X className="w-4 h-4 mr-1" />
                Retour au site
              </Link>
            </Button>
          </div>
        </header>

        {/* Content — Scrollable area */}
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

        {/* Mobile Bottom Tab Bar */}
        <nav className="md:hidden shrink-0 flex items-center border-t border-white/10 bg-white/[0.02] safe-area-pb">
          {visibleNavItems.slice(0, 5).map((item) => {
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
