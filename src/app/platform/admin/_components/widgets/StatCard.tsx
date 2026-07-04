'use client'

/**
 * Command Center — StatCard Widget
 *
 * The foundational KPI tile used across the Dashboard, Analytics Center,
 * Wedding Portfolio, and Observability sections.
 *
 * Premium dark-luxury styling with: icon chip, label, big value, optional
 * delta (trend up/down), and optional subtitle.
 *
 * Phase 1 — ÉTAPE 5 (Widgets) + ÉTAPE 4 (Design System).
 */

import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export type StatTone = 'gold' | 'emerald' | 'violet' | 'rose' | 'sky' | 'amber' | 'zinc'

const TONE_ICON_BG: Record<StatTone, string> = {
  gold: 'bg-gold/15 text-gold',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  violet: 'bg-violet-500/15 text-violet-400',
  rose: 'bg-rose-500/15 text-rose-400',
  sky: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
  zinc: 'bg-zinc-500/15 text-zinc-400',
}

const TONE_ACCENT: Record<StatTone, string> = {
  gold: 'from-gold/10',
  emerald: 'from-emerald-500/10',
  violet: 'from-violet-500/10',
  rose: 'from-rose-500/10',
  sky: 'from-sky-500/10',
  amber: 'from-amber-500/10',
  zinc: 'from-zinc-500/10',
}

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: StatTone
  delta?: number
  deltaLabel?: string
  subtitle?: string
  loading?: boolean
  delay?: number
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'gold',
  delta,
  deltaLabel,
  subtitle,
  loading = false,
  delay = 0,
}: StatCardProps) {
  if (loading) {
    return (
      <Card className="bg-white/[0.02] border-white/10">
        <CardContent className="p-4">
          <div className="h-20 animate-pulse rounded bg-white/5" />
        </CardContent>
      </Card>
    )
  }

  const positive = typeof delta === 'number' ? delta >= 0 : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <Card
        className={`bg-white/[0.02] border-white/10 hover:border-white/20 transition-colors relative overflow-hidden`}
      >
        <div
          className={`absolute inset-0 bg-gradient-to-br ${TONE_ACCENT[tone]} to-transparent opacity-60 pointer-events-none`}
        />
        <CardContent className="p-4 relative">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium leading-tight">
              {label}
            </p>
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${TONE_ICON_BG[tone]}`}
            >
              <Icon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold mt-2 font-display tracking-tight">{value}</p>
          <div className="flex items-center gap-1.5 mt-1 min-h-[16px]">
            {typeof delta === 'number' && (
              <span
                className={`inline-flex items-center text-[11px] font-medium ${
                  positive ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {positive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {Math.abs(delta)}%
              </span>
            )}
            {(deltaLabel || subtitle) && (
              <span className="text-[11px] text-muted-foreground truncate">
                {deltaLabel || subtitle}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/**
 * Section header used by every section to keep typography consistent.
 */
export function SectionHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="w-9 h-9 rounded-md bg-gold/15 text-gold flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

/**
 * Empty state placeholder — used by sections that have no data yet
 * (e.g. AI Command before Phase 4, Media Center before first upload).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/**
 * Coming soon banner — used by placeholder sections (AI Command, Automation,
 * Penpot, Marketplace, Theme Center, Invitation Center) to communicate
 * that the architecture is ready but the engine arrives in a future phase.
 */
export function ComingSoonBanner({
  phase,
  title,
  description,
  ready,
}: {
  phase: string
  title: string
  description: string
  ready: Array<{ label: string; detail: string }>
}) {
  return (
    <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-gold/[0.06] to-transparent p-5 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gold px-2 py-0.5 rounded-full bg-gold/15">
          {phase}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Architecture prête · Engine à venir
        </span>
      </div>
      <h3 className="text-base font-semibold mt-2">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-2xl">{description}</p>
      {ready.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ready.map((r) => (
            <div key={r.label} className="rounded-md bg-white/[0.03] border border-white/10 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gold/80 font-medium">
                {r.label}
              </p>
              <p className="text-xs text-foreground/80 mt-0.5 leading-snug">{r.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
