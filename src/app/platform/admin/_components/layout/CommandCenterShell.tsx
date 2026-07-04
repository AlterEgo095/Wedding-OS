'use client'

/**
 * Command Center — Shell
 *
 * The operational skeleton of the AENEWS Wedding OS Command Center.
 * Wraps Sidebar + Topbar + content area + Quick Actions panel.
 *
 * This shell is the single point of entry for the platform admin. It:
 *  - gates on PLATFORM_ADMIN / SUPER_ADMIN role
 *  - renders the enterprise grouped sidebar
 *  - renders the topbar with quick actions + notifications
 *  - delegates content rendering to the active section
 *
 * Phase 1 — ÉTAPE 2 (Command Center) + ÉTAPE 3 (Navigation Enterprise).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { QuickActionsPanel } from './QuickActionsPanel'
import type { AuthUser } from '../../_lib/types'
import type { SectionId } from '../../_lib/constants'

interface CommandCenterShellProps {
  user: AuthUser
  activeSection: SectionId
  onSectionChange: (s: SectionId) => void
  onLogout: () => void
  alertCount?: number
  children: ReactNode
}

export function CommandCenterShell({
  user,
  activeSection,
  onSectionChange,
  onLogout,
  alertCount = 0,
  children,
}: CommandCenterShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)

  const handleSectionChange = useCallback(
    (s: SectionId) => {
      onSectionChange(s)
      setMobileSidebarOpen(false)
    },
    [onSectionChange],
  )

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        user={user}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onLogout={onLogout}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Topbar
          user={user}
          activeSection={activeSection}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenQuickActions={() => setQuickActionsOpen(true)}
          onLogout={onLogout}
          alertCount={alertCount}
        />

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="min-h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <QuickActionsPanel
        open={quickActionsOpen}
        onOpenChange={setQuickActionsOpen}
        onNavigate={handleSectionChange}
      />
    </div>
  )
}

/**
 * Loading skeleton shown while the auth gate resolves (SSR → client
 * hydration). Mirrors the legacy pattern so users see a neutral spinner
 * instead of a flash of unauthenticated content.
 */
export function CommandCenterLoading() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
        <p className="text-xs text-muted-foreground">Chargement du Command Center…</p>
      </div>
    </div>
  )
}

/**
 * Hook: useCommandCenterAuth
 *
 * Encapsulates the client-side auth gate logic (read user from localStorage,
 * redirect to /platform/login if missing or not platform admin, handle
 * logout). Returns the user + logout handler.
 */
export function useCommandCenterAuth() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const token = localStorage.getItem('admin_token')
      const rawUser = localStorage.getItem('admin_user')
      if (!token || !rawUser) return null
      return JSON.parse(rawUser) as AuthUser
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!user) {
      toast.error('Veuillez vous connecter')
      router.replace('/platform/login')
      return
    }
    if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN') {
      toast.error('Accès refusé')
      router.replace('/platform/login')
    }
  }, [user, router])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/platform/logout', { method: 'POST' })
    } catch {
      /* ignore — clear local anyway */
    }
    try {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    setUser(null)
    toast.success('Déconnexion réussie')
    router.replace('/platform/login')
  }, [router])

  return { user, logout }
}
