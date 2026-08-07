// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/admin/page.tsx — Phase 3 Per-Wedding Admin Dashboard
// ══════════════════════════════════════════════════════════════════════════════
// Tenant-aware admin shell. Mirrors /admin/page.tsx exactly (same NAV_ITEMS,
// same sidebar, same mobile responsive behavior, same panels) but:
//
//   1. On mount (P1-SEC-3): call /api/me to check auth status. If 401,
//      redirect to /w/{slug}/admin/login.
//   2. Installs a GLOBAL fetch interceptor (useEffect once per slug) that wraps
//      window.fetch to auto-add the X-Wedding-Slug header on every /api/* call.
//      This lets ALL existing admin components (Dashboard, GuestManager, …)
//      work unchanged — they just call fetch('/api/…') and the interceptor
//      attaches the tenant header transparently. The interceptor also auto-
//      attaches the X-CSRF-Token header on state-changing requests (P1-SEC-7)
//      and sets credentials: 'include' so the httpOnly auth_token cookie is
//      sent automatically (P1-SEC-3).
//   3. Sidebar shows the wedding's coupleLabel + the user's name.
//   4. PLATFORM_ADMIN sees an extra "Plateforme" link to /platform/admin.
//   5. visibleNavItems filter includes PLATFORM_ADMIN for superAdminOnly tabs.
//   6. On logout / sessionExpired → clear localStorage + redirect to login.

'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, Users, Grid3X3, Image as ImageIcon, Clock, Shield, Settings, LogOut,
  X, Menu, FileSearch, Music, Sparkles, Crown, Loader2, Palette, LayoutTemplate, BookOpen,
  Mail, QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
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
import { DesignerTab } from '@/components/admin/DesignerTab';
import { CoupleStoryManager } from '@/components/admin/CoupleStoryManager';
// Mission 4.9 — wire InvitationManager + CheckInManager into the wedding admin
const InvitationManager = dynamic(() => import('@/components/admin/InvitationManager'), { ssr: false })
const CheckInManager = dynamic(() => import('@/components/admin/CheckInManager'), { ssr: false })

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  weddingId?: string | null
}

type TabId = 'dashboard' | 'designer' | 'guests' | 'invitations' | 'check-in' | 'tables' | 'media' | 'music' | 'timeline' | 'story' | 'users' | 'settings' | 'access-logs' | 'appearance' | 'theme'

interface NavItem {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  superAdminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'designer', label: 'Designer', icon: LayoutTemplate },
  { id: 'guests', label: 'Invités', icon: Users },
  { id: 'invitations', label: 'Invitations', icon: Mail },
  { id: 'check-in', label: 'Réception', icon: QrCode },
  { id: 'tables', label: 'Tables', icon: Grid3X3 },
  { id: 'access-logs', label: 'Accès', icon: FileSearch },
  { id: 'media', label: 'Médias', icon: ImageIcon },
  { id: 'music', label: 'Musique', icon: Music },
  { id: 'timeline', label: 'Programme', icon: Clock },
  { id: 'story', label: 'Histoire', icon: BookOpen },
  { id: 'theme', label: 'Thème', icon: Palette },
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

/** Read CSRF token from cookie (for child components that make their own fetch calls) */
function getCsrfTokenFromCookie(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((row) => row.startsWith('csrf_token='))
  return match ? match.split('=').slice(1).join('=') : ''
}

export default function PerWeddingAdminPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()
  const wedding = useWedding()

  // mounted: false on SSR and during the very first client render (hydration),
  // then true once the mount effect runs. This lets us render a stable loading
  // screen during hydration and avoid mismatches.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // ─── Auth state ────────────────────────────────────────────────────────────
  // P1-SEC-3: token is no longer read from localStorage. We keep the `token`
  // state for backwards-compat with child components (Dashboard, GuestManager,
  // …) that still take a `token` prop and send `Authorization: Bearer ${token}`.
  // The value is always `''` — the server's getTokenFromRequest falls back to
  // the httpOnly auth_token cookie when the bearer value is empty.
  const [token, setToken] = useState<string>('')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sessionExpiredRef = useRef(false)

  // ─── Install global fetch interceptor (useLayoutEffect — runs before any
  // child useEffect, so the X-Wedding-Slug header is in place by the time
  // admin components like Dashboard, GuestManager, etc. fire their initial
  // /api/* requests. Otherwise the first fetch would silently fall back to
  // the default wedding and show wrong data.)
  //
  // P1-SEC-3: we no longer inject `Authorization: Bearer <token>` here. The
  // httpOnly auth_token cookie is sent automatically on same-origin fetches
  // (the default `credentials: 'same-origin'` setting). We DO still inject
  // the X-Wedding-Slug header for tenant scoping.
  //
  // P1-SEC-7: we also inject the X-CSRF-Token header on state-changing
  // requests (POST/PUT/DELETE/PATCH) by reading the csrf_token cookie
  // (httpOnly=false, set by login or /api/csrf-token).
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
        // P1-SEC-7: auto-attach CSRF token on state-changing requests.
        // Reads from the csrf_token cookie (httpOnly=false). If the cookie
        // is missing (e.g. user navigated here without going through login
        // — unlikely but possible), the server will reject with 403.
        const method = (init?.method || 'GET').toUpperCase()
        const isStateChanging =
          method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH'
        if (isStateChanging && !headers.has('X-CSRF-Token')) {
          const csrfMatch = document.cookie
            .split('; ')
            .find((row) => row.startsWith('csrf_token='))
          if (csrfMatch) {
            const csrfToken = csrfMatch.split('=').slice(1).join('=')
            if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
          }
        }
        // P1-SEC-3: ensure credentials are included so the httpOnly auth
        // cookie is sent.
        init = { ...init, headers, credentials: 'include' }
      }
      return originalFetch(input as RequestInfo, init)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [slug])

  // ─── Mount: check auth via /api/me. If not authed, redirect to login.
  // (Separate from the interceptor so the interceptor installs synchronously
  // regardless of auth state.)
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
            setToken('') // empty — server uses cookie
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

  // Redirect to login if not authenticated (after the /api/me check completes).
  // Mission 5.3.2: Also deny access if an ORGANIZER tries to open a foreign wedding admin.
  // PLATFORM_ADMIN/SUPER_ADMIN can access any wedding. ORGANIZER must match their own weddingId.
  useEffect(() => {
    if (!authChecked) return
    if (!user) {
      router.replace(`/w/${slug}/admin/login`)
      return
    }
    // Tenant authorization check: non-platform-admins can only access their own wedding
    if (!isPlatformAdmin(user.role) && user.weddingId !== wedding.id) {
      // Foreign admin access denied — redirect to their own admin
      toast.error("Vous n'avez pas accès à cet événement.")
      if (user.weddingId) {
        // Redirect to their own wedding admin
        const ownSlug = slug // fallback — can't easily resolve their slug here
        // Use the wedding context to find their own slug
        // Since we can't resolve their slug from weddingId alone client-side,
        // redirect to /platform/admin or show access denied
        router.replace('/platform/admin')
      } else {
        router.replace('/')
      }
    }
  }, [authChecked, user, slug, router, wedding.id])

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = useCallback(
    async (showMessage = true) => {
      // Best-effort server-side logout (clears httpOnly + CSRF cookies).
      try {
        await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem('admin_token') // legacy cleanup (no-op if empty)
        localStorage.removeItem('admin_user')
      } catch {
        /* ignore */
      }
      setToken('')
      setUser(null)
      if (showMessage) toast.success('Déconnexion réussie')
      router.replace(`/w/${slug}/admin/login`)
    },
    [slug, router]
  )

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    try {
      localStorage.removeItem('admin_token') // legacy cleanup
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    setToken('')
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
    if (!user) return null

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard token={token} onSessionExpired={handleSessionExpired} />
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
      case 'invitations':
        return <InvitationManager weddingId={wedding.id} weddingSlug={slug} csrfToken={getCsrfTokenFromCookie()} />
      case 'check-in':
        return <CheckInManager weddingSlug={slug} csrfToken={getCsrfTokenFromCookie()} />
      case 'settings':
        return <SettingsManager token={token} userRole={user?.role || ''} onSessionExpired={handleSessionExpired} />
      case 'theme':
        // Consolidation fix: mount ThemeCustomizer in the tenant admin so couples
        // can edit their own wedding's colors + fonts. The explicit `slug` prop
        // bypasses the platform-admin wedding picker and scopes all /api/theme
        // calls to this wedding via the fetch interceptor installed above.
        return <ThemeCustomizer slug={slug} />
      case 'designer':
        // Slice 2: Real Experience Builder — controls sections, theme, collection
        return <DesignerTab weddingId={wedding.id} weddingSlug={slug} />
      case 'story':
        // Slice 4: Couple Story admin CRUD — API already existed, UI was missing
        return <CoupleStoryManager weddingSlug={slug} />
      case 'appearance':
        return <AppearanceManager token={token} onSessionExpired={handleSessionExpired} />
      default:
        return <Dashboard token={token} onSessionExpired={handleSessionExpired} />
    }
  }

  const activeNavItem = visibleNavItems.find((item) => item.id === activeTab)
  const coupleLabel = wedding.coupleLabel || slug

  // ─── Loading screen during SSR / hydration / pre-auth-check window ──────────
  // NOTE: `token` is intentionally NOT part of this gate. Under cookie-based
  // auth (P1-SEC-3) `token` is always the empty string — the server reads the
  // httpOnly auth_token cookie. Gating on `!token` would permanently trap the
  // page on this loading screen. The real auth gate is `!user` (populated from
  // /api/me) — once authChecked is true, user is either set (show admin) or
  // null (the redirect effect sends the visitor to the login page).
  if (!mounted || !authChecked || !user) {
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
                  className="h-11 w-11 text-muted-foreground shrink-0"
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
