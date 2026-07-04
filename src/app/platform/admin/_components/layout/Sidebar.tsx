'use client'

/**
 * Command Center — Sidebar (Enterprise Navigation)
 *
 * Premium, responsive, professional, scalable navigation.
 * Grouped into 5 sections (Pilotage, Centres, Engines, Système, Administration)
 * so the admin reaches any module in ≤ 2 clicks.
 *
 * Mobile: collapses into an overlay drawer (animated with Framer Motion).
 */

import { motion } from 'framer-motion'
import { Crown, X, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { NAV_GROUPS, type SectionId } from '../../_lib/constants'
import { getRoleLabel } from '../../_lib/constants'
import type { AuthUser } from '../../_lib/types'

interface SidebarProps {
  user: AuthUser
  activeSection: SectionId
  onSectionChange: (s: SectionId) => void
  onLogout: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({
  user,
  activeSection,
  onSectionChange,
  onLogout,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const SidebarHeader = (
    <div className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center shrink-0 shadow-lg">
        <Crown className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-sm gold-gradient font-display tracking-wide truncate">
          AENEWS Wedding OS
        </h2>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Command Center
        </p>
      </div>
    </div>
  )

  const SidebarNav = (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.group} className="px-2 mb-3">
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {group.group}
          </p>
          <nav className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-gold/15 text-gold font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="cc-sidebar-indicator"
                      className="w-1.5 h-1.5 rounded-full bg-gold"
                    />
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      ))}
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
        onClick={onLogout}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Déconnexion
      </Button>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-white/10 bg-white/[0.02]">
        {SidebarHeader}
        <Separator className="bg-white/10" />
        {SidebarNav}
        <Separator className="bg-white/10" />
        {SidebarFooter}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
            aria-hidden
          />
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute left-0 top-0 bottom-0 w-72 flex flex-col border-r border-white/10"
            style={{
              background: 'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270))',
            }}
          >
            <div className="p-4 flex items-center justify-between">
              {SidebarHeader}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={onMobileClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <Separator className="bg-white/10" />
            {SidebarNav}
            <Separator className="bg-white/10" />
            {SidebarFooter}
          </motion.aside>
        </div>
      )}
    </>
  )
}
