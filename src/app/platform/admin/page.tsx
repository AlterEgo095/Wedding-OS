'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  Heart,
  Users as UsersIcon,
  ScrollText,
  Crown,
  LogOut,
  Menu as MenuIcon,
  X,
  Plus,
  Search,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Activity,
  TrendingDown,
  UserPlus,
  KeyRound,
  ExternalLink,
  Wallet,
  Rocket,
  Palette,
  PenTool,
  Send,
  CheckCircle,
  Pause,
  Play,
  Archive,
  Copy,
  Megaphone,
} from 'lucide-react'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

import { PLAN_METADATA, type Plan, type WeddingStatus } from '@/lib/types'
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PLAN_BADGE_CLASS,
  ROLE_BADGE_CLASS,
  PLAN_LIST,
  WEDDING_STATUS_LIST,
  getRoleLabel as getRoleLabelShared,
} from '@/lib/ui-labels'
import { formatDate, formatDateTime, toDateInput } from '@/lib/format'
import dynamic from 'next/dynamic'

// Heavy tab components are lazy-loaded (P1-UX-9 + P2-PERF-13) so the initial
// JS bundle for /platform/admin only contains the dashboard shell. Each tab is
// fetched on first activation. ssr:false for the two design-surface components
// (PenpotStudio, ThemeCustomizer) which use canvas/iframe APIs unavailable
// during SSR; the data tabs (Billing, Onboarding, CollectionsFactory) keep
// ssr:true (default) so they can participate in streaming.
const BillingTab = dynamic(() => import('./BillingTab').then((m) => m.BillingTab))
const OnboardingTab = dynamic(() => import('./OnboardingTab').then((m) => m.OnboardingTab))
const CollectionsFactoryTab = dynamic(() => import('./CollectionsFactoryTab').then((m) => m.CollectionsFactoryTab))
const ThemeCustomizer = dynamic(() => import('@/components/admin/ThemeCustomizer').then((m) => m.ThemeCustomizer), { ssr: false })
const PenpotStudio = dynamic(() => import('@/components/penpot/PenpotStudio').then((m) => m.PenpotStudio), { ssr: false })
const MarketingControlPlane = dynamic(() => import('@/components/marketing/MarketingControlPlane'), { ssr: false })

// useSyncExternalStore subscribe placeholder — we only need the getServerSnapshot
// vs getSnapshot split to detect "are we hydrated yet?" without triggering the
// react-hooks/set-state-in-effect lint rule. Mirrors the /w/[slug]/admin pattern
// (P1-UX-7) so the SSR pass and the first client render both produce the same
// loading skeleton, eliminating the hydration mismatch.
const emptySubscribe = (): (() => void) => () => {}
const getTrue = (): boolean => true
const getFalse = (): boolean => false

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  weddingId?: string | null
}

interface Wedding {
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

interface UserRow {
  id: string
  email: string
  name: string
  role: string
  weddingId: string | null
  wedding?: { slug: string; coupleLabel: string } | null
  createdAt: string
}

interface AuditLog {
  id: string
  action: string
  details: string | null
  createdAt: string
  weddingId?: string | null
  user: { name: string; email: string; role?: string } | null
  wedding?: { slug: string; coupleLabel: string } | null
}

/**
 * Dashboard response shape — matches GET /api/platform/dashboard (Task 3-B).
 *
 * Note: `weddings`, `users`, `guests` are nested objects (the API groups them
 * for richer breakdowns), NOT plain numbers. The recentActivity entries do
 * NOT include the `wedding` relation — only `weddingId` — so the audit tab
 * shows "Plateforme" or a short weddingId hash instead of a slug.
 */
interface DashboardData {
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
  // Phase 5 analytics (optional — older API responses may omit these)
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

interface PaginatedWeddings {
  weddings: Wedding[]
  total: number
  page: number
  limit: number
}

interface PaginatedUsers {
  users: UserRow[]
  total: number
  page: number
  limit: number
}

type TabId = 'dashboard' | 'weddings' | 'users' | 'audit' | 'billing' | 'onboarding' | 'appearance' | 'studio' | 'collections' | 'marketing'

interface NavItem {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: 'weddings', label: 'Mariages', icon: Heart },
  { id: 'billing', label: 'Facturation', icon: Wallet },
  { id: 'onboarding', label: 'Onboarding', icon: Rocket },
  { id: 'users', label: 'Utilisateurs', icon: UsersIcon },
  { id: 'audit', label: "Journal d'audit", icon: ScrollText },
  { id: 'appearance', label: 'Apparence', icon: Palette },
  { id: 'studio', label: 'Studio Penpot', icon: PenTool },
  { id: 'collections', label: 'Collections Premium', icon: Crown },
  { id: 'marketing', label: 'Marketing OS', icon: Megaphone },
]

const WEDDING_STATUSES = WEDDING_STATUS_LIST
const PLANS = PLAN_LIST

// Re-export the shared getRoleLabel under a local name so existing call sites
// (getRoleLabel(user.role)) keep working unchanged. The shared helper lives in
// @/lib/ui-labels and handles the same fallback (raw role string) for unknown
// roles.
const getRoleLabel = getRoleLabelShared

// Chart colors per plan — used by the plan-distribution donut chart
const PLAN_CHART_COLORS: Record<string, string> = {
  ELITE: '#D4A853',
  PREMIUM: '#10b981',
  ESSENTIEL: '#8b5cf6',
  TRIAL: '#71717a',
}

// Shared tooltip styling for Recharts (dark luxury theme)
const CHART_TOOLTIP_STYLE = {
  background: 'oklch(0.16 0.02 270)',
  border: '1px solid rgba(212, 168, 83, 0.3)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
} as const

// ════════════════════════════════════════════════════════════════════════════
// usePlatformFetch — wraps fetch with cookie auth + session-expiry handling
// ════════════════════════════════════════════════════════════════════════════
// P1-SEC-3: previously sent `Authorization: Bearer <token>` with a token
// read from localStorage. Now sends `credentials: 'include'` so the
// httpOnly `auth_token` cookie is attached automatically (XSS-resistant —
// client JS cannot read the cookie). The Authorization header is no longer
// set; the server's getTokenFromRequest falls back to the cookie.

function usePlatformFetch() {
  const router = useRouter()
  const sessionExpiredRef = useRef(false)

  const onSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    // P1-SEC-3: best-effort cookie clear via logout endpoint.
    try {
      fetch('/api/platform/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem('admin_user') // UI-only cache; no token to clear
    } catch {
      /* ignore */
    }
    toast.error('Session expirée, veuillez vous reconnecter')
    router.replace('/platform/login')
  }, [router])

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response | null> => {
      let res: Response
      try {
        res = await fetch(url, {
          ...init,
          credentials: 'include', // P1-SEC-3: send the httpOnly auth cookie.
          headers: {
            ...(init?.headers || {}),
            // P1-SEC-7: attach CSRF token on state-changing requests.
            // The token is read from the csrf_token cookie (httpOnly=false)
            // and mirrored into the X-CSRF-Token header for the double-submit
            // pattern.
            ...maybeCsrfHeader(init?.method || 'GET'),
          },
        })
      } catch {
        toast.error('Erreur de connexion au serveur')
        return null
      }
      if (res.status === 401) {
        onSessionExpired()
        return null
      }
      if (res.status === 403) {
        // Could be a CSRF rejection OR a permission denial. Surface the
        // server's error message; the user can retry.
        try {
          const body = await res.clone().json()
          toast.error(body?.error || 'Accès refusé')
        } catch {
          toast.error('Accès refusé')
        }
        return null
      }
      return res
    },
    [onSessionExpired]
  )

  return { fetchWithAuth, onSessionExpired }
}

/**
 * Build the X-CSRF-Token header for state-changing requests. Reads the
 * `csrf_token` cookie (httpOnly=false, set by /api/csrf-token or the login
 * endpoint). Returns an empty object for GET requests (no CSRF needed).
 *
 * Returns an empty object if the cookie is missing — the server will reject
 * with 403 "Token CSRF invalide". The caller's UI should then prompt a
 * refresh of the CSRF token (e.g. by reloading the page).
 */
function maybeCsrfHeader(method: string): Record<string, string> {
  const m = method.toUpperCase()
  if (m !== 'POST' && m !== 'PUT' && m !== 'DELETE' && m !== 'PATCH') {
    return {}
  }
  if (typeof document === 'undefined') return {}
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
  if (!match) return {}
  const token = match.split('=').slice(1).join('=')
  return token ? { 'X-CSRF-Token': token } : {}
}

/**
 * Get the raw CSRF token string (for passing to child components that need
 * to make their own fetch calls with CSRF protection). Reads from the
 * csrf_token cookie (httpOnly=false).
 */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
  if (!match) return ''
  return match.split('=').slice(1).join('=')
}

// ════════════════════════════════════════════════════════════════════════════
// Small shared UI helpers
// ════════════════════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: WeddingStatus }) {
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${STATUS_BADGE_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${PLAN_BADGE_CLASS[plan]}`}>
      {PLAN_METADATA[plan]?.label || plan}
    </Badge>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${ROLE_BADGE_CLASS[role] || ''}`}>
      {getRoleLabel(role)}
    </Badge>
  )
}

// Date / time / money formatters are imported from @/lib/format (P2-CQ-3).
// The local copies were 1:1 duplicates of the shared helpers — kept the same
// call sites (`formatDate(iso)`, `formatDateTime(iso)`, `toDateInput(iso)`)
// so callers don't need updating.

// ════════════════════════════════════════════════════════════════════════════
// Dashboard tab
// ════════════════════════════════════════════════════════════════════════════

function DashboardTab({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchWithAuth('/api/platform/dashboard')
    if (!res) {
      setLoading(false)
      return
    }
    try {
      const json = (await res.json()) as DashboardData
      setData(json)
    } catch {
      toast.error('Réponse invalide du serveur')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) return null

  // Phase 5 server-computed analytics — accurate across all PUBLISHED weddings.
  // Falls back gracefully if the revenue/churn/growth sections are absent.
  const mrr = data.revenue?.mrr ?? 0
  const arpu = data.revenue?.arpu ?? 0
  const activeCount = data.weddings.byStatus?.PUBLISHED ?? 0
  const churnRate = data.churn?.churnRate ?? 0
  const suspended30d = data.churn?.suspended30d ?? 0
  const archived30d = data.churn?.archived30d ?? 0
  const newWeddings30d = data.growth?.newWeddings30d ?? 0
  const newGuests30d = data.growth?.newGuests30d ?? 0

  // Chart datasets — MRR over 6 months + plan distribution donut
  const mrrSeries = data.revenue?.mrrSeries ?? []
  const planBreakdown =
    (data.revenue?.byPlan ?? []).length > 0
      ? data.revenue!.byPlan
      : Object.entries(data.weddings.byPlan ?? {}).map(([plan, count]) => ({
          plan,
          count,
          mrr: count * (PLAN_METADATA[plan as Plan]?.priceUsd ?? 0),
        }))

  const kpiCards = [
    {
      title: 'Total Mariages',
      value: data.weddings.total,
      subtitle: `${activeCount} publiés · ${newWeddings30d} nouveaux 30j`,
      icon: Heart,
      gradient: 'from-gold/20 to-gold-light/10',
      iconClass: 'text-gold',
    },
    {
      title: 'MRR',
      value: `$${mrr}`,
      subtitle: `ARPU $${arpu} · ${activeCount} actif${activeCount > 1 ? 's' : ''}`,
      icon: Crown,
      gradient: 'from-amber-500/20 to-amber-600/10',
      iconClass: 'text-amber-400',
    },
    {
      title: 'Invités',
      value: data.guests.total,
      subtitle: `${data.guests.last7days ?? 0} 7j · ${newGuests30d} 30j`,
      icon: UsersIcon,
      gradient: 'from-violet-500/20 to-violet-600/10',
      iconClass: 'text-violet-400',
    },
    {
      title: "Taux d'attrition",
      value: `${churnRate}%`,
      subtitle: `${suspended30d} suspendus · ${archived30d} archivés 30j`,
      icon: TrendingDown,
      gradient: 'from-red-500/20 to-red-600/10',
      iconClass: 'text-red-400',
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {kpiCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Card className="glass-card gold-border border-0 overflow-hidden">
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-3`}>
                  <card.icon className={`w-5 h-5 ${card.iconClass}`} />
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.title}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{card.subtitle}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts row — MRR evolution + plan distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* MRR area chart (6-month series) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="lg:col-span-3"
        >
          <Card className="glass-card gold-border border-0 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Crown className="w-4 h-4 text-gold" />
                Évolution du MRR
                <span className="ml-auto text-sm font-bold text-gold">${mrr}/mois</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mrrSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mrrSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D4A853" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#D4A853" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: '#D4A853', fontWeight: 600 }}
                      formatter={(value: number) => [`$${value}`, 'MRR']}
                    />
                    <Area type="monotone" dataKey="mrr" stroke="#D4A853" strokeWidth={2} fill="url(#mrrGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée de revenu
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Plan distribution donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="lg:col-span-2"
        >
          <Card className="glass-card gold-border border-0 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4 text-gold" />
                Répartition par plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {planBreakdown.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={planBreakdown}
                        dataKey="count"
                        nameKey="plan"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {planBreakdown.map((entry) => (
                          <Cell key={entry.plan} fill={PLAN_CHART_COLORS[entry.plan] ?? '#71717a'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number, name: string) => [
                          `${value} mariage${value > 1 ? 's' : ''}`,
                          PLAN_METADATA[name as Plan]?.label ?? name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 w-full">
                    {planBreakdown.map((entry) => (
                      <div key={entry.plan} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: PLAN_CHART_COLORS[entry.plan] ?? '#71717a' }}
                        />
                        <span className="text-muted-foreground flex-1 truncate">
                          {PLAN_METADATA[entry.plan as Plan]?.label ?? entry.plan}
                        </span>
                        <span className="font-medium">{entry.count}</span>
                        <span className="text-gold text-[10px] tabular-nums">${entry.mrr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  Aucun mariage
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Two-column lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent weddings */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <Card className="glass-card gold-border border-0 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4 text-gold" />
                Mariages récents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentWeddings && data.recentWeddings.length > 0 ? (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                  {data.recentWeddings.slice(0, 5).map((w, i) => (
                    <motion.div
                      key={w.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.05 }}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors border border-white/5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center text-white shrink-0">
                        <Heart className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{w.coupleLabel}</p>
                        <p className="text-xs text-muted-foreground truncate">/w/{w.slug}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge status={w.status} />
                        <PlanBadge plan={w.plan} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Aucun mariage récent
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent activity */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <Card className="glass-card gold-border border-0 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-gold" />
                Activité récente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentActivity && data.recentActivity.length > 0 ? (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                  {data.recentActivity.slice(0, 20).map((log, i) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.03 }}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <div className="w-2 h-2 rounded-full bg-gold mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium text-gold">{log.user?.name || 'Système'}</span>
                          {' — '}
                          <span className="text-muted-foreground">{log.action.replace(/_/g, ' ').toLowerCase()}</span>
                        </p>
                        {log.details && (
                          <p className="text-xs text-muted-foreground truncate">{log.details}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Aucune activité récente
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Weddings tab
// ════════════════════════════════════════════════════════════════════════════

interface WeddingFormState {
  slug: string
  brideName: string
  groomName: string
  weddingDate: string
  venueCity: string
  status: WeddingStatus
  plan: Plan
}

const EMPTY_WEDDING_FORM: WeddingFormState = {
  slug: '',
  brideName: '',
  groomName: '',
  weddingDate: '',
  venueCity: '',
  status: 'DRAFT',
  plan: 'TRIAL',
}

interface DuplicateFormState {
  newSlug: string
  newBrideName: string
  newGroomName: string
}

const EMPTY_DUPLICATE_FORM: DuplicateFormState = {
  newSlug: '',
  newBrideName: '',
  newGroomName: '',
}

function WeddingsTab({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [planFilter, setPlanFilter] = useState<string>('ALL')

  // Dialog state
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [editing, setEditing] = useState<Wedding | null>(null)
  const [deleting, setDeleting] = useState<Wedding | null>(null)
  const [duplicating, setDuplicating] = useState<Wedding | null>(null)
  const [form, setForm] = useState<WeddingFormState>(EMPTY_WEDDING_FORM)
  const [duplicateForm, setDuplicateForm] = useState<DuplicateFormState>(EMPTY_DUPLICATE_FORM)
  const [saving, setSaving] = useState(false)
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null)

  const LIMIT = 20
  const searchRef = useRef(search)
  searchRef.current = search

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(LIMIT),
      })
      if (searchRef.current) params.set('search', searchRef.current)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (planFilter !== 'ALL') params.set('plan', planFilter)

      const res = await fetchWithAuth(`/api/platform/weddings?${params.toString()}`)
      if (!res) {
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as PaginatedWeddings
        setWeddings(json.weddings || [])
        setTotal(json.total || 0)
        // API returns { total, page, limit } — compute totalPages client-side.
        setTotalPages(Math.max(1, Math.ceil((json.total || 0) / (json.limit || LIMIT))))
        setPage(json.page || targetPage)
      } catch {
        toast.error('Réponse invalide du serveur')
      } finally {
        setLoading(false)
      }
    },
    [fetchWithAuth, statusFilter, planFilter]
  )

  useEffect(() => {
    load(1)
  }, [statusFilter, planFilter, load])

  // Debounced search trigger
  useEffect(() => {
    const t = setTimeout(() => {
      load(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search, load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_WEDDING_FORM)
    setShowFormDialog(true)
  }

  const openEdit = (w: Wedding) => {
    setEditing(w)
    setForm({
      slug: w.slug,
      brideName: w.brideName,
      groomName: w.groomName,
      weddingDate: toDateInput(w.weddingDate),
      venueCity: w.venueCity || '',
      status: w.status,
      plan: w.plan,
    })
    setShowFormDialog(true)
  }

  const handleSave = async () => {
    if (!form.slug || !form.brideName || !form.groomName) {
      toast.error('Slug, mariée et marié sont requis')
      return
    }
    setSaving(true)
    const payload: Record<string, unknown> = {
      slug: form.slug.trim().toLowerCase(),
      brideName: form.brideName.trim(),
      groomName: form.groomName.trim(),
      weddingDate: form.weddingDate ? new Date(form.weddingDate).toISOString() : null,
      venueCity: form.venueCity.trim() || null,
      status: form.status,
      plan: form.plan,
    }
    try {
      const url = editing
        ? `/api/platform/weddings/${editing.id}`
        : '/api/platform/weddings'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(editing ? 'Mariage mis à jour' : 'Mariage créé')
        setShowFormDialog(false)
        setEditing(null)
        setForm(EMPTY_WEDDING_FORM)
        load(page)
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      const res = await fetchWithAuth(`/api/platform/weddings/${deleting.id}`, {
        method: 'DELETE',
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Mariage supprimé')
        setShowDeleteDialog(false)
        setDeleting(null)
        load(1)
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  // ─── Status quick-action (Phase 3 ÉTAPE 5) ────────────────────────────────
  // Single-shot status transition via the dropdown menu. The backend enforces
  // the lifecycle (DRAFT→PUBLISHED, PUBLISHED→COMPLETED, etc.) — invalid
  // transitions return 400 and we surface the error in a toast.
  const handleStatusChange = async (w: Wedding, newStatus: WeddingStatus) => {
    setStatusChangingId(w.id)
    try {
      const res = await fetchWithAuth(`/api/platform/weddings/${w.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res) {
        setStatusChangingId(null)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Statut mis à jour : ${STATUS_LABELS[newStatus]}`)
        load(page)
      } else {
        toast.error(json.error || 'Transition de statut invalide')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setStatusChangingId(null)
    }
  }

  // ─── Duplicate wedding (Phase 3 ÉTAPE 5) ──────────────────────────────────
  const openDuplicate = (w: Wedding) => {
    setDuplicating(w)
    setDuplicateForm({
      newSlug: `${w.slug}-copie`,
      newBrideName: w.brideName,
      newGroomName: w.groomName,
    })
    setShowDuplicateDialog(true)
  }

  const handleDuplicate = async () => {
    if (!duplicating) return
    if (!duplicateForm.newSlug.trim()) {
      toast.error('Le slug est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithAuth(
        `/api/platform/weddings/${duplicating.id}/duplicate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newSlug: duplicateForm.newSlug.trim().toLowerCase(),
            newBrideName: duplicateForm.newBrideName.trim() || undefined,
            newGroomName: duplicateForm.newGroomName.trim() || undefined,
          }),
        }
      )
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Mariage dupliqué vers /w/${json.wedding?.slug || duplicateForm.newSlug}`)
        setShowDuplicateDialog(false)
        setDuplicating(null)
        setDuplicateForm(EMPTY_DUPLICATE_FORM)
        load(1)
      } else {
        toast.error(json.error || 'Erreur lors de la duplication')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header + filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Mariages</h2>
          <p className="text-sm text-muted-foreground">{total} mariage{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate} size="sm" className="bg-gradient-gold text-white shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Créer un mariage
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par slug, nom du couple…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/5 border-white/10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            {WEDDING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les plans</SelectItem>
            {PLANS.map((p) => (
              <SelectItem key={p} value={p}>
                {PLAN_METADATA[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Couple</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Plan</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Invités</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Créé le</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-white/5">
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : weddings.length === 0 ? (
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Heart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucun mariage trouvé</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  weddings.map((w) => (
                    <TableRow
                      key={w.id}
                      className="border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{w.coupleLabel || `${w.brideName} & ${w.groomName}`}</span>
                          <span className="text-xs text-muted-foreground">/w/{w.slug}</span>
                          {w.isDefault && (
                            <Badge variant="outline" className="mt-1 text-[10px] w-fit bg-gold/10 text-gold border-gold/30">
                              défaut
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={w.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <PlanBadge plan={w.plan} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(w.weddingDate)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {w._count?.guests ?? 0}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {formatDate(w.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-11 w-11" disabled={statusChangingId === w.id}>
                              {statusChangingId === w.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="w-4 h-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(w)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/w/${w.slug}`} target="_blank" className="flex items-center cursor-pointer">
                                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                                Voir le site
                              </Link>
                            </DropdownMenuItem>

                            {/* ─── Status quick-actions (Phase 3 ÉTAPE 5) ─── */}
                            <DropdownMenuSeparator />
                            {w.status === 'DRAFT' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(w, 'PUBLISHED')}>
                                <Send className="w-3.5 h-3.5 mr-2" />
                                Publier
                              </DropdownMenuItem>
                            )}
                            {w.status === 'PUBLISHED' && (
                              <>
                                <DropdownMenuItem onClick={() => handleStatusChange(w, 'COMPLETED')}>
                                  <CheckCircle className="w-3.5 h-3.5 mr-2" />
                                  Marquer comme terminé
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(w, 'SUSPENDED')}>
                                  <Pause className="w-3.5 h-3.5 mr-2" />
                                  Suspendre
                                </DropdownMenuItem>
                              </>
                            )}
                            {w.status === 'SUSPENDED' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(w, 'PUBLISHED')}>
                                <Play className="w-3.5 h-3.5 mr-2" />
                                Réactiver
                              </DropdownMenuItem>
                            )}
                            {w.status !== 'ARCHIVED' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(w, 'ARCHIVED')}>
                                <Archive className="w-3.5 h-3.5 mr-2" />
                                Archiver
                              </DropdownMenuItem>
                            )}

                            {/* ─── Duplicate (always available) ─── */}
                            <DropdownMenuItem onClick={() => openDuplicate(w)}>
                              <Copy className="w-3.5 h-3.5 mr-2" />
                              Dupliquer
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400 focus:text-red-300"
                              onClick={() => {
                                setDeleting(w)
                                setShowDeleteDialog(true)
                              }}
                              disabled={w.isDefault}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} / {Math.max(totalPages, 1)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
          >
            Suivant <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient">
              {editing ? 'Modifier le mariage' : 'Créer un mariage'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="josue-hornella"
                className="bg-white/5 border-white/10"
              />
              <p className="text-[10px] text-muted-foreground">
                URL publique : /w/&lt;slug&gt;
              </p>
            </div>
            <div className="space-y-2">
              <Label>Mariée *</Label>
              <Input
                value={form.brideName}
                onChange={(e) => setForm({ ...form, brideName: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Marié *</Label>
              <Input
                value={form.groomName}
                onChange={(e) => setForm({ ...form, groomName: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Date du mariage</Label>
              <Input
                type="date"
                value={form.weddingDate}
                onChange={(e) => setForm({ ...form, weddingDate: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Ville du lieu</Label>
              <Input
                value={form.venueCity}
                onChange={(e) => setForm({ ...form, venueCity: e.target.value })}
                placeholder="Kinshasa"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as WeddingStatus })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEDDING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select
                value={form.plan}
                onValueChange={(v) => setForm({ ...form, plan: v as Plan })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLAN_METADATA[p].label} — ${PLAN_METADATA[p].priceUsd}/mois
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowFormDialog(false)
                setEditing(null)
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.slug || !form.brideName || !form.groomName}
              className="bg-gradient-gold text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer le mariage{' '}
            <strong className="text-foreground">{deleting?.coupleLabel}</strong> ? Cette action
            supprimera également tous les invités, tables, médias et paramètres associés.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate dialog (Phase 3 ÉTAPE 5) */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <Copy className="w-4 h-4" />
              Dupliquer le mariage
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Crée une copie <strong className="text-foreground">Brouillon</strong> de{' '}
            <strong className="text-foreground">{duplicating?.coupleLabel}</strong> avec le thème,
            la timeline, l'histoire du couple et les paramètres. Les invités, tables, médias et
            journaux ne sont pas copiés.
          </p>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>Nouveau slug *</Label>
              <Input
                value={duplicateForm.newSlug}
                onChange={(e) => setDuplicateForm({ ...duplicateForm, newSlug: e.target.value })}
                placeholder="nouveau-mariage"
                className="bg-white/5 border-white/10"
              />
              <p className="text-[10px] text-muted-foreground">
                URL publique : /w/&lt;slug&gt; — 3 à 32 caractères, minuscules, chiffres ou tirets.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mariée</Label>
                <Input
                  value={duplicateForm.newBrideName}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, newBrideName: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Marié</Label>
                <Input
                  value={duplicateForm.newGroomName}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, newGroomName: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Laissez vide pour reprendre les noms du mariage source.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowDuplicateDialog(false)
                setDuplicating(null)
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={saving || !duplicateForm.newSlug.trim()}
              className="bg-gradient-gold text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Copy className="w-4 h-4 mr-1" />
              Dupliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Users tab
// ════════════════════════════════════════════════════════════════════════════

interface UserFormState {
  name: string
  email: string
  password: string
  role: string
  weddingId: string
}

const EMPTY_USER_FORM: UserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'ORGANIZER',
  weddingId: '',
}

const USER_ROLES = [
  { value: 'PLATFORM_ADMIN', label: 'Administrateur Plateforme', needsWedding: false },
  { value: 'ORGANIZER', label: 'Organisateur', needsWedding: true },
  { value: 'RECEPTION', label: 'Réception', needsWedding: true },
  { value: 'CONTROLLER', label: 'Contrôleur', needsWedding: true },
]

function UsersTab({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')

  // Dialog state
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<UserRow | null>(null)
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM)
  const [saving, setSaving] = useState(false)
  const [weddingOptions, setWeddingOptions] = useState<Array<{ id: string; slug: string; coupleLabel: string }>>([])

  const LIMIT = 20
  const searchRef = useRef(search)
  searchRef.current = search

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(LIMIT),
      })
      if (searchRef.current) params.set('search', searchRef.current)
      if (roleFilter !== 'ALL') params.set('role', roleFilter)

      const res = await fetchWithAuth(`/api/platform/users?${params.toString()}`)
      if (!res) {
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as PaginatedUsers
        setUsers(json.users || [])
        setTotal(json.total || 0)
        setTotalPages(Math.max(1, Math.ceil((json.total || 0) / (json.limit || LIMIT))))
        setPage(json.page || targetPage)
      } catch {
        toast.error('Réponse invalide du serveur')
      } finally {
        setLoading(false)
      }
    },
    [fetchWithAuth, roleFilter]
  )

  useEffect(() => {
    load(1)
  }, [roleFilter, load])

  useEffect(() => {
    const t = setTimeout(() => {
      load(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search, load])

  // Fetch weddings for the role↔wedding select (only when opening the form)
  const fetchWeddings = useCallback(async () => {
    if (weddingOptions.length > 0) return
    const res = await fetchWithAuth('/api/platform/weddings?limit=100')
    if (!res) return
    try {
      const json = (await res.json()) as PaginatedWeddings
      setWeddingOptions(
        (json.weddings || []).map((w) => ({ id: w.id, slug: w.slug, coupleLabel: w.coupleLabel }))
      )
    } catch {
      /* ignore — wedding select will just be empty */
    }
  }, [fetchWithAuth, weddingOptions.length])

  const openCreate = useCallback(async () => {
    setEditing(null)
    setForm(EMPTY_USER_FORM)
    setShowFormDialog(true)
    await fetchWeddings()
  }, [fetchWeddings])

  const openEdit = useCallback(
    async (u: UserRow) => {
      setEditing(u)
      setForm({
        name: u.name,
        email: u.email,
        password: '', // blank = keep current
        role: u.role === 'SUPER_ADMIN' ? 'PLATFORM_ADMIN' : u.role,
        weddingId: u.weddingId || '',
      })
      setShowFormDialog(true)
      await fetchWeddings()
    },
    [fetchWeddings]
  )

  const handleSave = async () => {
    const roleConfig = USER_ROLES.find((r) => r.value === form.role)
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Nom et email sont requis')
      return
    }
    if (!editing && form.password.length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères')
      return
    }
    if (editing && form.password && form.password.length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères')
      return
    }
    if (roleConfig?.needsWedding && !form.weddingId) {
      toast.error('Un mariage est requis pour ce rôle')
      return
    }

    setSaving(true)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      weddingId: roleConfig?.needsWedding ? form.weddingId : null,
    }
    if (form.password) {
      payload.password = form.password
    }

    try {
      const url = editing
        ? `/api/platform/users/${editing.id}`
        : '/api/platform/users'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(editing ? 'Utilisateur mis à jour' : 'Utilisateur créé')
        setShowFormDialog(false)
        setEditing(null)
        setForm(EMPTY_USER_FORM)
        load(page)
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      const res = await fetchWithAuth(`/api/platform/users/${deleting.id}`, {
        method: 'DELETE',
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Utilisateur supprimé')
        setShowDeleteDialog(false)
        setDeleting(null)
        load(1)
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const selectedRoleConfig = USER_ROLES.find((r) => r.value === form.role)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Utilisateurs</h2>
          <p className="text-sm text-muted-foreground">{total} utilisateur{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate} size="sm" className="bg-gradient-gold text-white shrink-0">
          <UserPlus className="w-4 h-4 mr-1" /> Créer un utilisateur
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/5 border-white/10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-white/5 border-white/10">
            <SelectValue placeholder="Rôle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les rôles</SelectItem>
            <SelectItem value="PLATFORM_ADMIN">Administrateur Plateforme</SelectItem>
            <SelectItem value="ORGANIZER">Organisateur</SelectItem>
            <SelectItem value="RECEPTION">Réception</SelectItem>
            <SelectItem value="CONTROLLER">Contrôleur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Nom</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Email</TableHead>
                  <TableHead className="text-xs">Rôle</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mariage</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Créé le</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-white/5">
                      <TableCell colSpan={6}>
                        <Skeleton className="h-8 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      <UsersIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucun utilisateur trouvé</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-sm">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {u.wedding ? (
                          <Link
                            href={`/w/${u.wedding.slug}`}
                            target="_blank"
                            className="hover:text-gold transition-colors"
                          >
                            {u.wedding.coupleLabel}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-11 w-11">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(u)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400 focus:text-red-300"
                              onClick={() => {
                                setDeleting(u)
                                setShowDeleteDialog(true)
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} / {Math.max(totalPages, 1)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>
            Suivant <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              {editing ? "Modifier l'utilisateur" : 'Créer un utilisateur'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nom complet *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jean Dupont"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jean@exemple.com"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v, weddingId: v === 'PLATFORM_ADMIN' ? '' : form.weddingId })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mariage {selectedRoleConfig?.needsWedding ? '*' : '(non requis)'}</Label>
              <Select
                value={form.weddingId}
                onValueChange={(v) => setForm({ ...form, weddingId: v })}
                disabled={!selectedRoleConfig?.needsWedding}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {weddingOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.coupleLabel} <span className="text-muted-foreground">/w/{w.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                {editing ? 'Mot de passe (laisser vide pour conserver)' : 'Mot de passe *'}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? '••••••••' : 'Minimum 8 caractères'}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowFormDialog(false)
                setEditing(null)
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name || !form.email || (!editing && !form.password)}
              className="bg-gradient-gold text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer l&apos;utilisateur{' '}
            <strong className="text-foreground">{deleting?.name}</strong> ({deleting?.email}) ? Cette action est
            irréversible.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Audit tab — reuses /api/platform/dashboard's recentActivity field
// ════════════════════════════════════════════════════════════════════════════

const ACTION_BADGE_CLASS: Record<string, string> = {
  CREATE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  UPDATE: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
  LOGIN: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  LOGOUT: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  DEFAULT: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

function actionBadgeClass(action: string): string {
  const prefix = action.split('_')[0]
  return ACTION_BADGE_CLASS[prefix] || ACTION_BADGE_CLASS.DEFAULT
}

function AuditTab({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchWithAuth('/api/platform/dashboard')
    if (!res) {
      setLoading(false)
      return
    }
    try {
      const json = (await res.json()) as DashboardData
      setLogs(json.recentActivity || [])
    } catch {
      toast.error('Réponse invalide du serveur')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-gold" />
          Journal d&apos;audit
        </h2>
        <p className="text-sm text-muted-foreground">
          Les 20 actions les plus récentes sur la plateforme
        </p>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Horodatage</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Utilisateur</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mariage</TableHead>
                  <TableHead className="text-xs">Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-white/5">
                      <TableCell colSpan={5}>
                        <Skeleton className="h-8 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucune entrée d&apos;audit</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} className="border-white/5 hover:bg-white/5 transition-colors align-top">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase tracking-wide ${actionBadgeClass(log.action)}`}
                        >
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {log.user ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{log.user.name}</span>
                            <span className="text-xs text-muted-foreground">{log.user.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Système</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {log.wedding ? (
                          <Link
                            href={`/w/${log.wedding.slug}`}
                            target="_blank"
                            className="hover:text-gold transition-colors"
                          >
                            {log.wedding.coupleLabel}
                          </Link>
                        ) : log.weddingId ? (
                          // Dashboard endpoint doesn't include the wedding relation —
                          // surface a short id hash so the operator can still tell which
                          // tenant the audit entry belongs to.
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            #{log.weddingId.slice(-6)}
                          </span>
                        ) : (
                          <span className="text-gold/70">Plateforme</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">
                        {log.details || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Main page — sidebar + top bar + tab content
// ════════════════════════════════════════════════════════════════════════════

export default function PlatformAdminPage() {
  const router = useRouter()
  const { fetchWithAuth } = usePlatformFetch()
  // mounted: false on SSR and during the very first client render (hydration),
  // then true once React swaps to the client snapshot. This lets us render a
  // stable loading screen during hydration and avoid the P1-UX-7 mismatch
  // (server HTML has no user, client may have one from the cookie).
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse)
  // P1-SEC-3: user state is hydrated from /api/me on mount (cookie-based
  // auth — no localStorage token read).
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // P1-SEC-3: check auth status on mount via /api/me. The httpOnly cookie is
  // sent automatically (same-origin fetch). If 200, populate user state. If
  // 401, user stays null and the effect below redirects to /platform/login.
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
            try {
              localStorage.setItem('admin_user', JSON.stringify(data.user))
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* network error — leave user as null */
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Auth gate — redirect to /platform/login if not authenticated or not a
  // platform admin. Runs once authChecked flips to true.
  useEffect(() => {
    if (!authChecked) return
    if (!user) {
      toast.error('Veuillez vous connecter')
      router.replace('/platform/login')
      return
    }
    if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN') {
      toast.error('Accès refusé')
      router.replace('/platform/login')
    }
  }, [authChecked, user, router])

  const handleLogout = useCallback(async () => {
    // Best-effort server-side logout (clears the httpOnly cookie + CSRF cookie)
    try {
      await fetch('/api/platform/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore — clear local anyway */
    }
    try {
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    setUser(null)
    toast.success('Déconnexion réussie')
    router.replace('/platform/login')
  }, [router])

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId)
    setSidebarOpen(false)
  }, [])

  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeTab)

  const renderContent = (): ReactNode => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab fetchWithAuth={fetchWithAuth} />
      case 'weddings':
        return <WeddingsTab fetchWithAuth={fetchWithAuth} />
      case 'billing':
        return <BillingTab fetchWithAuth={fetchWithAuth} />
      case 'onboarding':
        return <OnboardingTab fetchWithAuth={fetchWithAuth} />
      case 'users':
        return <UsersTab fetchWithAuth={fetchWithAuth} />
      case 'audit':
        return <AuditTab fetchWithAuth={fetchWithAuth} />
      case 'appearance':
        return <ThemeCustomizer />
      case 'studio':
        // Penpot Studio — the official design Studio of Wedding OS.
        // Platform admin can link a Penpot file per wedding and sync design tokens.
        // The PenpotStudio component reads the active wedding from the ThemeCustomizer
        // wedding picker (same X-Wedding-Slug header pattern).
        return <PenpotStudio />
      case 'collections':
        return <CollectionsFactoryTab />
      case 'marketing':
        return <MarketingControlPlane csrfToken={getCsrfToken()} />
      default:
        return <DashboardTab fetchWithAuth={fetchWithAuth} />
    }
  }

  // Render a neutral loading skeleton during hydration (mounted=false) or
  // while the /api/me auth check is in flight (authChecked=false). Once
  // authChecked is true and user is null (or not a platform admin), the
  // effect above will redirect to /platform/login.
  if (!mounted || !authChecked || !user || (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-gold" />
          <p className="text-xs text-muted-foreground">Chargement de la plateforme…</p>
        </div>
      </div>
    )
  }

  const SidebarHeader = (
    <div className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center shrink-0 shadow-lg">
        <Crown className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-sm gold-gradient font-display tracking-wide truncate">
          Heureux Mariage
        </h2>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Plateforme Admin
        </p>
      </div>
    </div>
  )

  const SidebarNav = (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2">
      <nav className="px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
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
                  layoutId="platform-sidebar-indicator"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-gold"
                />
              )}
            </button>
          )
        })}
      </nav>
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
        onClick={handleLogout}
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
  )

  return (
    <div className="h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/10 bg-white/[0.02]">
        {SidebarHeader}
        <Separator className="bg-white/10" />
        {SidebarNav}
        <Separator className="bg-white/10" />
        {SidebarFooter}
      </aside>

      {/* Mobile sidebar overlay */}
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
              className="absolute left-0 top-0 bottom-0 w-64 z-50 md:hidden flex flex-col border-r border-white/10"
              style={{
                background:
                  'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270))',
              }}
            >
              <div className="p-4 flex items-center justify-between">
                {SidebarHeader}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Separator className="bg-white/10" />
              {SidebarNav}
              <Separator className="bg-white/10" />
              {SidebarFooter}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10 bg-white/[0.02]">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <MenuIcon className="w-5 h-5" />
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
              <div className="hidden sm:flex flex-col">
                <span className="text-xs font-medium leading-tight">{user.name}</span>
                <span className="text-[10px] text-gold/70 uppercase tracking-wider leading-tight">
                  {getRoleLabel(user.role)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                onClick={handleLogout}
                aria-label="Déconnexion"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
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
          </AnimatePresence>
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden shrink-0 flex items-center border-t border-white/10 bg-white/[0.02] safe-area-pb">
          {NAV_ITEMS.map((item) => {
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
      </div>
    </div>
  )
}
