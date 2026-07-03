'use client'

/**
 * Command Center — Quick Actions Panel
 *
 * A modal dialog that presents the most common admin actions as a grid of
 * tappable cards. Selecting an action navigates to the relevant section.
 *
 * Phase 1 — ÉTAPE 6 (Quick Actions).
 */

import { motion } from 'framer-motion'
import { Zap, ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { QUICK_ACTIONS, type QuickAction, type SectionId } from '../../_lib/constants'

interface QuickActionsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (section: SectionId) => void
}

const TONE_CLASSES: Record<QuickAction['tone'], string> = {
  gold: 'bg-gold/10 text-gold border-gold/30 hover:bg-gold/20',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20',
  rose: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
  sky: 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
}

export function QuickActionsPanel({ open, onOpenChange, onNavigate }: QuickActionsPanelProps) {
  const handleSelect = (section: SectionId) => {
    onOpenChange(false)
    onNavigate(section)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gold" />
            Actions rapides
          </DialogTitle>
          <DialogDescription>
            Accédez en un clic aux opérations les plus courantes du Command Center.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
          {QUICK_ACTIONS.map((action, i) => (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => handleSelect(action.section)}
              className={`group flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${TONE_CLASSES[action.tone]}`}
            >
              <div className="w-9 h-9 rounded-md bg-white/5 flex items-center justify-center shrink-0">
                <action.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">{action.label}</p>
                <p className="text-[11px] opacity-70 mt-0.5 leading-tight">{action.description}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </motion.button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
