/**
 * Command Center — Shared Types
 *
 * Extracted from the legacy monolithic page.tsx (Phase 0) so that every
 * Command Center section can import the same contracts without duplicating
 * them. Pure type module — zero runtime, zero side-effects.
 *
 * Phase 1 — AENEWS Wedding OS Command Center.
 */

import type { Plan, WeddingStatus } from '@/lib/types'

export type { Plan, WeddingStatus }

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  weddingId?: string | null
}

/**
 * Command Center section identifiers — re-exported from the constants module
 * (the canonical source, kept in sync with the NAV_GROUPS items array).
 */
export type { SectionId } from './constants'

/**
 * Authenticated fetch helper signature — wraps `fetch` with credentials and
 * anti-CSRF headers. Implemented in the page shell and passed down to every
 * section so they never call raw `fetch` against platform endpoints. Returns
 * `null` on auth-expiry so the caller can short-circuit without throwing.
 */
export type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response | null>

export interface Wedding {
  id: string
  slug: string
  brideName: string
  groomName: string
  coupleLabel: string
  status: WeddingStatus
  plan: Plan
  weddingDate: string | null
  venueName: string | null
  venueCity: string | null
  customDomain: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  _count?: { guests: number; tables: number; media: number; admins: number }
}

export interface UserRow {
  id: string
  email: string
  name: string
  role: string
  weddingId: string | null
  lastLoginAt: string | null
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

/**
 * Dashboard response shape — matches GET /api/platform/dashboard.
 */
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

/**
 * System health snapshot — returned by the read-only
 * GET /api/platform/health endpoint (Phase 1 Observability).
 *
 * All values are best-effort and collected without modifying any existing
 * backend module. CPU/RAM come from Node.js `os` + `process.memoryUsage()`.
 */
export interface SystemHealth {
  timestamp: string
  uptimeSeconds: number
  node: { version: string; platform: string; arch: string }
  cpu: { loadAverage: number[]; cores: number; usagePercent: number }
  memory: {
    rssMb: number
    heapUsedMb: number
    heapTotalMb: number
    externalMb: number
    arrayBuffersMb: number
    systemTotalMb: number
    systemFreeMb: number
    systemUsedPercent: number
  }
  storage: {
    uploadsPath: string
    uploadsBytes: number
    uploadsFiles: number
    dbPath: string
    dbBytes: number
  }
  database: {
    provider: string
    weddings: number
    users: number
    guests: number
    auditLogs: number
    lastAuditAt: string | null
  }
  services: {
    devServer: boolean
    docker: boolean
  }
  alerts: Array<{ level: 'info' | 'warn' | 'critical'; code: string; message: string }>
}
