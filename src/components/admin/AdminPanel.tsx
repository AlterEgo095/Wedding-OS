'use client'

import { useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard, Users, Grid3X3, Image as ImageIcon, Clock, Shield, Settings, LogOut,
  X, Menu, FileSearch, Music, Sparkles
} from 'lucide-react'
import { toast } from 'sonner'

import LoginForm from './LoginForm'
import Dashboard from './Dashboard'
import GuestManager from './GuestManager'
import TableManager from './TableManager'
import MediaManager from './MediaManager'
import UserManager from './UserManager'
import TimelineManager from './TimelineManager'
import SettingsManager from './SettingsManager'
import AccessLogManager from './AccessLogManager'
import MusicManager from './MusicManager'
import AppearanceManager from './AppearanceManager'

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
  onAdminStateChange?: (isLoggedIn: boolean) => void
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

export default function AdminPanel({ isOpen, onClose, onAdminStateChange }: AdminPanelProps) {
  // Use lazy initializer to read from localStorage on client only
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
        return saved ? JSON.parse(saved) : null
      } catch {
        return null
      }
    }
    return null
  })
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sessionExpiredRef = useRef(false)

  const handleLogin = useCallback((newToken: string, newUser: AuthUser) => {
    sessionExpiredRef.current = false
    setToken(newToken)
    setUser(newUser)
    onAdminStateChange?.(true)
  }, [onAdminStateChange])

  const handleLogout = useCallback((showMessage = true) => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    onAdminStateChange?.(false)
    if (showMessage) toast.success('Déconnexion réussie')
  }, [onAdminStateChange])

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
    (item) => !item.superAdminOnly || user?.role === 'SUPER_ADMIN'
  )

  const renderContent = () => {
    if (!token) return null

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Main Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative flex w-full h-full bg-background"
            style={{
              background: 'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
            }}
          >
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-white/10 bg-white/[0.02]">
              {/* Sidebar Header */}
              <div className="p-4 flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full gold-border p-[2px] overflow-hidden">
                    <Image
                      src="/uploads/couple-photo-1.jpeg"
                      alt="Josué & Hornella"
                      width={40}
                      height={40}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-sm gold-gradient font-display">Josué & Hornella</h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.name || 'Non connecté'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  <X className="w-4 h-4" />
                </Button>
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

              {/* User Info & Logout */}
              {user && (
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
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Déconnexion
                  </Button>
                </div>
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
                            src="/uploads/couple-photo-1.jpeg"
                            alt="Josué & Hornella"
                            width={40}
                            height={40}
                            className="w-full h-full rounded-full object-cover"
                          />
                        </div>
                        <h2 className="font-bold text-sm gold-gradient font-display">Josué & Hornella</h2>
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
                      <div className="p-3">
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 text-sm"
                          onClick={handleLogout}
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Déconnexion
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
                  {activeNavItem && (
                    <>
                      <activeNavItem.icon className="w-4 h-4 text-gold" />
                      <h1 className="font-semibold text-sm">{activeNavItem.label}</h1>
                    </>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground md:hidden"
                    onClick={onClose}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </header>

              {/* Content — Scrollable area */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                  {token && user ? (
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
              {token && user && (
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
