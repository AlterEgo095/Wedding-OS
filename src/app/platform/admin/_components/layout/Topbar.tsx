'use client'

/**
 * Command Center — Topbar
 *
 * Premium top bar with: active section title, site link, quick-actions
 * launcher, notifications indicator, and user identity.
 */

import Link from 'next/link'
import { Menu, ExternalLink, LogOut, Zap, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { findSection } from '../../_lib/constants'
import { getRoleLabel } from '../../_lib/constants'
import type { SectionId, AuthUser } from '../../_lib/types'

interface TopbarProps {
  user: AuthUser
  activeSection: SectionId
  onOpenMobileSidebar: () => void
  onOpenQuickActions: () => void
  onLogout: () => void
  alertCount?: number
}

export function Topbar({
  user,
  activeSection,
  onOpenMobileSidebar,
  onOpenQuickActions,
  onLogout,
  alertCount = 0,
}: TopbarProps) {
  const section = findSection(activeSection)
  const Icon = section?.icon

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 md:hidden"
        onClick={onOpenMobileSidebar}
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4 h-4 text-gold shrink-0" />}
        <h1 className="font-semibold text-sm truncate">{section?.label ?? 'Command Center'}</h1>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenQuickActions}
          className="hidden sm:flex items-center gap-1.5 text-xs h-8"
        >
          <Zap className="w-3.5 h-3.5 text-gold" />
          <span>Actions rapides</span>
        </Button>

        <button
          className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {alertCount > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] bg-red-500 text-white border-0">
              {alertCount > 9 ? '9+' : alertCount}
            </Badge>
          )}
        </button>

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
          <div className="hidden lg:flex flex-col">
            <span className="text-xs font-medium leading-tight truncate max-w-[140px]">
              {user.name}
            </span>
            <span className="text-[10px] text-gold/70 uppercase tracking-wider leading-tight">
              {getRoleLabel(user.role)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
            onClick={onLogout}
            aria-label="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
