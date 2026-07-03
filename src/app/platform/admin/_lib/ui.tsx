'use client'

/**
 * Command Center — Shared UI primitives
 *
 * Badges + date formatters extracted from the legacy monolithic page.tsx.
 * Every section imports these so status/plan/role rendering stays
 * perfectly consistent across the Command Center.
 */

import { Badge } from '@/components/ui/badge'
import { PLAN_METADATA } from '@/lib/types'
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PLAN_BADGE_CLASS,
  ROLE_BADGE_CLASS,
  getRoleLabel,
} from './constants'
import type { Plan, WeddingStatus } from './types'

export function StatusBadge({ status }: { status: WeddingStatus }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide ${STATUS_BADGE_CLASS[status]}`}
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide ${PLAN_BADGE_CLASS[plan]}`}
    >
      {PLAN_METADATA[plan]?.label || plan}
    </Badge>
  )
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide ${ROLE_BADGE_CLASS[role] || ''}`}
    >
      {getRoleLabel(role)}
    </Badge>
  )
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}j ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function actionBadgeClass(action: string): string {
  if (action.includes('CREATE')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (action.includes('UPDATE')) return 'bg-sky-500/15 text-sky-400 border-sky-500/30'
  if (action.includes('DELETE')) return 'bg-red-500/15 text-red-400 border-red-500/30'
  if (action.includes('LOGIN') || action.includes('LOGOUT'))
    return 'bg-violet-500/15 text-violet-400 border-violet-500/30'
  if (action.includes('BILLING') || action.includes('INVOICE'))
    return 'bg-gold/15 text-gold border-gold/40'
  return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
}
