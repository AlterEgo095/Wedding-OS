'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard, Users, Grid3X3, Image as ImageIcon, Clock, Shield, Settings, LogOut,
  X, Menu, FileSearch, Music, Sparkles
} from 'lucide-react'
import { toast } from 'sonner'

import LoginForm from '@/components/admin/LoginForm'
// P1-SEC-3: auth is now cookie-based. The admin shell checks auth status via
// /api/me on mount (no localStorage token read). All child components still
// take a `token` prop for backwards compat — they send
// `Authorization: Bearer ${token}` which is empty; the server's
// getTokenFromRequest falls back to the httpOnly auth_token cookie.
import Dashboard from '@/components/admin/Dashboard'
import GuestManager from '@/components/admin/GuestManager'
import TableManager from '@/components/admin/TableManager'
import MediaManager from '@/components/admin/MediaManager'
import UserManager from '@/components/admin/UserManager'
import TimelineManager from '@/components/admin/TimelineManager'
import SettingsManager from '@/components/admin/SettingsManager'
import AccessLogManager from '@/components/admin/AccessLogManager'
import MusicManager from '@/components/admin/MusicManager'
import AppearanceManager from '@/components/admin/AppearanceManager'
import { isPlatformAdmin } from '@/lib/types'

/**
 * Compute the couple display label from a settings map (object form).
 * Falls back to "Mariage" when names are not yet configured so we never
 * leak "Josué & Hornella" (the default wedding's couple) into another
 * wedding's admin shell.
 */
function deriveCoupleLabel(settings: Record<string, string> | null | undefined): string {
  const bride = settings?.bride_name?.trim() || ''
  const groom = settings?.groom_name?.trim() || ''
  if (bride && groom) return `${groom} & ${bride}`
  if (bride || groom) return bride || groom
  return 'Mariage'
}

/** Derive the couple photo URL from settings, with a generic fallback. */
function deriveCouplePhoto(settings: Record<string, string> | null | undefined): string {
  return settings?.couple_photo_1?.trim() || '/couple-hero.jpeg'
}

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

type TabId = 'dashboard' | 'guests' | 'tables' | 'media' | 'music' | 'timeline' | 'users' | 'settings' | 'access-logs' | 'appearance'

interface NavItem {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  superAdminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'guests', label: 'Invités', icon: Users },
  { id: 'tables', label: 'Tables', icon: Grid3X3 },
  { id: 'access-logs', label: 'Accès', icon: FileSearch },
  { id: 'media', label: 'Médias', icon: ImageIcon },
  { id: 'music', label: 'Musique', icon: Music },
  { id: 'timeline', label: 'Programme', icon: Clock },
  { id: 'appearance', label: 'Apparence', icon: Sparkles },
  { id: 'users', label: 'Utilisateurs', icon: Shield, superAdminOnly: true },
  { id: 'settings', label: 'Paramètres', icon: Settings, superAdminOnly: true },
]

export default function AdminPage() {
  // P1-SEC-3: token is no longer stored in localStorage. We keep the `token`
  // state for backwards-compat with child components (Dashboard,
  // GuestManager, …) that still send `Authorization: Bearer ${token}` —
  // they'll send an empty bearer, and the server falls back to the
  // httpOnly auth_token cookie. The empty string is the no-op value.
  const [token, setToken] = useState<string>('')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sessionExpiredRef = useRef(false)

  // P1-SEC-3: check auth status on mount via /api/me. The httpOnly cookie is
  // sent automatically (same-origin fetch). If 200, populate user state. If
  // 401, user stays null and the LoginForm renders.
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
          }
        }
      } catch {
        /* network error — leave user as null, LoginForm will show */
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Couple label from settings (avoids hardcoding "Josué & Hornella"). Defaults
  // to a generic "Mariage" until the settings fetch resolves.
  const [settings, setSettings] = useState<Record<string, string> | null>(null)
  const coupleLabel = deriveCoupleLabel(settings)
  const couplePhoto = deriveCouplePhoto(settings)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings && typeof data.settings === 'object') {
          setSettings(data.settings as Record<string, string>)
        }
      })
      .catch(() => {})
  }, [])

  // P1-SEC-3: LoginForm now passes only `user` (the auth cookie was set by
  // the login API). We keep `token` as an empty string for child-component
  // backwards-compat.
  const handleLogin = useCallback((newUser: AuthUser) => {
    sessionExpiredRef.current = false
    setToken('')
    setUser(newUser)
  }, [])

  const handleLogout = useCallback(async (showMessage = true) => {
    // Best-effort server-side logout (clears the httpOnly cookie).
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore — clear local state anyway */
    }
    setToken('')
    setUser(null)
    try {
      localStorage.removeItem('admin_token') // legacy cleanup (no-op if empty)
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    if (showMessage) toast.success('Déconnexion réussie')
  }, [])

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    handleLogout(false)
    toast.error('Session expirée, veuillez vous reconnecter')
  }, [handleLogout])

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId)
    setSidebarOpen(false)
  }, [])

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || isPlatformAdmin(user?.role || '')
  )

  const renderContent = () => {
    // P1-SEC-3: gate on `user` (not `token`) since token is now always ''
    // and the httpOnly cookie is the real auth signal.
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
      case 'settings':
        return <SettingsManager token={token} userRole={user?.role || ''} onSessionExpired={handleSessionExpired} />
      case 'appearance':
        return <AppearanceManager token={token} onSessionExpired={handleSessionExpired} />
      default:
        return <Dashboard token={token} onSessionExpired={handleSessionExpired} />
    }
  }

  const activeNavItem = visibleNavItems.find((item) => item.id === activeTab)

  // P1-SEC-3: show a loading skeleton until the /api/me check completes.
  // This prevents a flash of the LoginForm for users who ARE authenticated
  // (their cookie exists but hasn't been read yet).
  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-gold animate-pulse" />
          <p className="text-xs text-muted-foreground">Chargement…</p>
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
                src={couplePhoto}
                alt={coupleLabel}
                width={40}
                height={40}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm gold-gradient font-display truncate" title={coupleLabel}>{coupleLabel}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {user?.name || 'Non connecté'}
            </p>
          </div>
        </div>

        <Separator className="bg-white/10" />

        {/* Nav Items */}
        {user && (
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
        )}

        {user && (
          <>
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
                className="w-full justify-start text-muted-foreground hover:text-foreground text-sm mt-1"
                onClick={() => window.location.href = '/'}
              >
                <X className="w-4 h-4 mr-2" />
                Retour au site
              </Button>
            </div>
          </>
        )}
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
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full gold-border p-[2px] overflow-hidden">
                    <Image
                      src={couplePhoto}
                      alt={coupleLabel}
                      width={40}
                      height={40}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <h2 className="font-bold text-sm gold-gradient font-display truncate" title={coupleLabel}>{coupleLabel}</h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
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

              {user && (
                <div className="p-3 space-y-1">
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
                    className="w-full justify-start text-muted-foreground hover:text-foreground text-sm"
                    onClick={() => window.location.href = '/'}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Retour au site
                  </Button>
                </div>
              )}
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

          <div className="flex items-center gap-2">
            {activeNavItem && user && (
              <>
                <activeNavItem.icon className="w-4 h-4 text-gold" />
                <h1 className="font-semibold text-sm">{activeNavItem.label}</h1>
              </>
            )}
            {!user && (
              <h1 className="font-semibold text-sm gold-gradient">Administration</h1>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!user && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => window.location.href = '/'}
              >
                <X className="w-4 h-4 mr-1" />
                Retour au site
              </Button>
            )}
          </div>
        </header>

        {/* Content — Scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {user ? (
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
            ) : (
              <motion.div
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-h-full flex items-center justify-center"
              >
                <LoginForm onLogin={handleLogin} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Bottom Tab Bar */}
        {user && (
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
        )}
      </div>
    </div>
  )
}
