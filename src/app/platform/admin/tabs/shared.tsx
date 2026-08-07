'use client'

// ════════════════════════════════════════════════════════════════════════════
// shared.tsx — shared types, fetchWithAuth signature, small UI helpers
// extracted from the god component src/app/platform/admin/page.tsx (CONS-3).
//
// All tab components under ./ import from here so they don't re-declare the
// types. The main page.tsx also imports the same types + helpers.
// ════════════════════════════════════════════════════════════════════════════

import { Badge } from '@/components/ui/badge'
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PLAN_BADGE_CLASS,
  ROLE_BADGE_CLASS,
  PLAN_LIST,
  WEDDING_STATUS_LIST,
  getRoleLabel as getRoleLabelShared,
} from '@/lib/ui-labels'
import { PLAN_METADATA, type Plan, type WeddingStatus } from '@/lib/types'

// ─── Shared types ────────────────────────────────────────────────────────────

export type { Plan, WeddingStatus } from '@/lib/types'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  weddingId?: string | null
}

export interface Wedding {
  id: string
  slug: string
  brideName: string
  groomName: string
  coupleLabel: string
  status: WeddingStatus
  plan: Plan
  weddingDate: string | null
  venueCity: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
  _count?: { guests: number; admins: number }
}

export interface UserRow {
  id: string
  email: string
  name: string
  role: string
  weddingId: string | null
  wedding?: { slug: string; coupleLabel: string } | null
  createdAt: string
}

export interface AuditLog {
  id: string
  action: string
  details: string | null
  createdAt: string
  weddingId?: string | null
  user: { name: string; email: string; role?: string } | null
  wedding?: { slug: string; coupleLabel: string } | null
}

export interface DashboardData {
  weddings: { total: number; byStatus: Record<string, number>; byPlan: Record<string, number> }
  users: { total: number; byRole: Record<string, number>; platformAdmins: number }
  guests: { total: number; last7days: number }
  recentWeddings: Array<{
    id: string
    slug: string
    coupleLabel: string
    status: WeddingStatus
    plan: Plan
    createdAt: string
  }>
  recentActivity: AuditLog[]
  revenue?: {
    mrr: number
    arpu: number
    byPlan: Array<{ plan: string; count: number; mrr: number }>
    mrrSeries: Array<{ month: string; label: string; mrr: number; weddings: number }>
  }
  churn?: {
    suspended30d: number
    archived30d: number
    churnRate: number
  }
  growth?: {
    newWeddings30d: number
    newGuests30d: number
    newWeddingsSeries: Array<{ month: string; label: string; count: number }>
  }
  pendingActions?: {
    newLeadsCount: number
    recentLeads: Array<{
      id: string
      brideName: string
      groomName: string
      coupleLabel: string
      email: string | null
      phone: string | null
      plan: string
      status: string
      createdAt: string
    }>
    pendingPaymentsCount: number
    recentPendingPayments: Array<{
      id: string
      amount: number
      currency: string
      method: string
      submittedAt: string | null
      order: {
        wedding: { id: string; slug: string; coupleLabel: string } | null
        customer: { displayName: string } | null
      } | null
    }>
    draftWeddingsCount: number
    recentDrafts: Array<{
      id: string
      slug: string
      coupleLabel: string
      plan: string
      commercialStatus: string | null
      createdAt: string
    }>
  }
}

export interface PaginatedWeddings {
  weddings: Wedding[]
  total: number
  page: number
  limit: number
}

export interface PaginatedUsers {
  users: UserRow[]
  total: number
  page: number
  limit: number
}

// TabId lives here so all tabs + the main page can reference it.
// Production Studio tabs (CONS-3) are appended at the end.
export type TabId =
  | 'dashboard'
  | 'weddings'
  | 'users'
  | 'audit'
  | 'billing'
  | 'onboarding'
  | 'appearance'
  | 'collections'
  | 'marketing'
  | 'commercial'

export interface NavItem {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// fetchWithAuth signature — used by every tab.
export type FetchWithAuth = (url: string, init?: RequestInit) => Promise<Response | null>

// ─── Shared labels (re-exported for convenience) ─────────────────────────────

export {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PLAN_BADGE_CLASS,
  ROLE_BADGE_CLASS,
  PLAN_LIST,
  WEDDING_STATUS_LIST,
}

export const WEDDING_STATUSES = WEDDING_STATUS_LIST
export const PLANS = PLAN_LIST

export function getRoleLabel(role: string): string {
  return getRoleLabelShared(role)
}

// ─── Chart constants ─────────────────────────────────────────────────────────

export const PLAN_CHART_COLORS: Record<string, string> = {
  ELITE: '#D4A853',
  PREMIUM: '#10b981',
  ESSENTIEL: '#8b5cf6',
  TRIAL: '#71717a',
}

export const CHART_TOOLTIP_STYLE = {
  background: 'oklch(0.16 0.02 270)',
  border: '1px solid rgba(212, 168, 83, 0.3)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
} as const

// ─── Small shared UI helpers ─────────────────────────────────────────────────

export function StatusBadge({ status }: { status: WeddingStatus }) {
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${STATUS_BADGE_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${PLAN_BADGE_CLASS[plan]}`}>
      {PLAN_METADATA[plan]?.label || plan}
    </Badge>
  )
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${ROLE_BADGE_CLASS[role] || ''}`}>
      {getRoleLabel(role)}
    </Badge>
  )
}
