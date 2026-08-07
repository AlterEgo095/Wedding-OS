'use client'

// ════════════════════════════════════════════════════════════════════════════
// OpsPanel — Super Admin Production Studio (Mission 6.0 P3.11).
//
// Dedicated ops-only dashboard surface. Surfaces ops metrics returned by
// `/api/platform/ops` (NOT the business KPIs that already live in
// DashboardTab / GovernancePanel):
//   • System health   — DB file size (SQLite pragma_page_count*page_size)
//   • Security events — last24h/last7d counts + per-action breakdown +
//                       50 most recent rows (table)
//   • Audit log total — single count "is the audit trail growing?"
//   • Error rates     — NOT yet returned by the API → "Non disponible"
//                       placeholder (do NOT modify the route — owned by
//                       another part of the system; P3.11 only owns the UI).
//
// Auto-refresh: ON by default, 60s interval. Toggle + "Refresh now" button.
// Refresh pattern mirrors DeploymentsPanel (useRef + setInterval) so we can
// cleanly tear down the timer on unmount or on toggle-off.
//
// Data shape (verified by reading /api/platform/ops/route.ts):
//   {
//     securityEvents: { last24h: number, last7d: number, byAction: Record<string, number> },
//     recentSecurityLogs: Array<{
//       id, action, details: any, ipAddress: string|null,
//       createdAt: string (ISO),
//       user: { email, role } | null,
//       wedding: { slug, brideName, groomName } | null
//     }>,
//     auditLogTotal: number,
//     dbFileSizeBytes: number
//   }
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Activity,
  ShieldAlert,
  Database,
  AlertCircle,
  RefreshCw,
  TrendingDown,
  Server,
} from 'lucide-react'

// fetchWithAuth signature — reused from the shared admin tabs module so we
// don't redeclare it (and inherit its lint-clean status).
import { type FetchWithAuth } from '../shared'

// ─── Types (mirrors the API response shape) ─────────────────────────────────

interface RecentSecurityLog {
  id: string
  action: string
  details: unknown
  ipAddress: string | null
  createdAt: string
  user: { email: string; role: string } | null
  wedding: { slug: string; brideName: string; groomName: string } | null
}

interface OpsData {
  securityEvents: {
    last24h: number
    last7d: number
    byAction: Record<string, number>
  }
  recentSecurityLogs: RecentSecurityLog[]
  auditLogTotal: number
  dbFileSizeBytes: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000

// DB-size thresholds (per task spec).
const DB_GREEN_MB = 500
const DB_AMBER_MB = 1024

// Action-code → short human label for the security events table.
// Anything not in this map just falls back to the raw action code.
const ACTION_LABELS: Record<string, string> = {
  AUTH_FAILED: 'Échec auth.',
  AUTH_RATE_LIMITED: 'Rate limit auth.',
  BRUTE_FORCE_BLOCKED: 'Brute force',
  FINGERPRINT_MISMATCH: 'Empreinte',
  INVALID_SESSION: 'Session invalide',
  ACCESS_DENIED: 'Accès refusé',
  LOOKUP_RATE_LIMITED: 'Rate limit lookup',
  LOGIN: 'Connexion',
  LOGOUT: 'Déconnexion',
  PASSWORD_RESET_REQUESTED: 'Reset demandé',
  PASSWORD_RESET_USED: 'Reset utilisé',
  TWO_FACTOR_ENABLED: '2FA ON',
  TWO_FACTOR_DISABLED: '2FA OFF',
}

// Tailwind classes for action-code badges (info / warn / danger).
function actionBadgeClass(action: string): string {
  switch (action) {
    case 'AUTH_FAILED':
    case 'BRUTE_FORCE_BLOCKED':
    case 'FINGERPRINT_MISMATCH':
    case 'ACCESS_DENIED':
    case 'TWO_FACTOR_DISABLED':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'AUTH_RATE_LIMITED':
    case 'LOOKUP_RATE_LIMITED':
    case 'INVALID_SESSION':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'LOGIN':
    case 'LOGOUT':
    case 'PASSWORD_RESET_REQUESTED':
    case 'PASSWORD_RESET_USED':
    case 'TWO_FACTOR_ENABLED':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    default:
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return `il y a ${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `il y a ${min}min`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `il y a ${hr}h`
    const day = Math.floor(hr / 24)
    return `il y a ${day}j`
  } catch {
    return iso
  }
}

// Pick the DB-size color bucket. Returns Tailwind text + bar classes for
// a custom div-based gauge (avoids relying on the shadcn Progress indicator
// recolor which would need an arbitrary variant).
function dbSizeBucket(bytes: number): {
  label: string
  textClass: string
  barBg: string
  pct: number
} {
  const mb = bytes / (1024 * 1024)
  let label: string
  let textClass: string
  let barBg: string
  if (mb < DB_GREEN_MB) {
    label = 'Sain'
    textClass = 'text-emerald-400'
    barBg = 'bg-emerald-500'
  } else if (mb < DB_AMBER_MB) {
    label = 'Vigilance'
    textClass = 'text-amber-400'
    barBg = 'bg-amber-500'
  } else {
    label = 'Critique'
    textClass = 'text-red-400'
    barBg = 'bg-red-500'
  }
  // Gauge fills relative to 1GB (1024MB) so 500MB ≈ 50%.
  const pct = Math.min(100, Math.max(2, (mb / 1024) * 100))
  return { label, textClass, barBg, pct }
}

// Build a 24-bucket hourly sparkline from a list of security log timestamps.
// Each bucket is the count of events in that hour, oldest → newest left-to-right.
function buildHourlyBuckets(logs: RecentSecurityLog[]): number[] {
  const now = Date.now()
  const buckets: number[] = new Array(24).fill(0)
  for (const log of logs) {
    const t = new Date(log.createdAt).getTime()
    if (Number.isNaN(t)) continue
    const diffH = Math.floor((now - t) / (60 * 60 * 1000))
    if (diffH < 0 || diffH >= 24) continue
    // index 0 = most recent hour, 23 = 23h ago → reverse for left-to-right
    buckets[23 - diffH] += 1
  }
  return buckets
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OpsPanel({ fetchWithAuth }: { fetchWithAuth: FetchWithAuth }) {
  const [data, setData] = useState<OpsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    // Don't flip to loading skeleton on auto-refresh ticks — only on first
    // mount and on manual "Refresh now" clicks. This matches DeploymentsPanel.
    const isFirst = !data
    if (isFirst) setLoading(true)
    const res = await fetchWithAuth('/api/platform/ops')
    if (!res) {
      // fetchWithAuth already toasts on 401/403/network errors.
      if (isFirst) setLoading(false)
      return
    }
    try {
      const json = (await res.json()) as OpsData
      setData(json)
      setLastUpdated(new Date())
    } catch {
      toast.error('Réponse invalide du serveur ops')
    } finally {
      if (isFirst) setLoading(false)
    }
  }, [fetchWithAuth, data])

  useEffect(() => {
    load()
  }, [load])

  // Auto-refresh timer. Starts/stops cleanly when the toggle flips.
  useEffect(() => {
    if (!autoRefresh) {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    pollRef.current = setInterval(() => { load() }, REFRESH_INTERVAL_MS)
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [autoRefresh, load])

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [])

  // ─── Derived values ──────────────────────────────────────────────────────
  const dbSizeBytes = data?.dbFileSizeBytes ?? 0
  const dbBucket = dbSizeBucket(dbSizeBytes)
  const auditTotal = data?.auditLogTotal ?? 0
  const secLast24h = data?.securityEvents.last24h ?? 0
  const secLast7d = data?.securityEvents.last7d ?? 0
  const byAction = data?.securityEvents.byAction ?? {}
  const recentLogs = data?.recentSecurityLogs ?? []

  // Top 5 actions by frequency (last 24h, derived from the API's byAction map).
  const topActions = Object.entries(byAction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const topActionsMax = topActions.length > 0 ? topActions[0][1] : 1

  // 24h hourly sparkline.
  const hourly = buildHourlyBuckets(recentLogs)
  const hourlyMax = Math.max(1, ...hourly)

  // Top 5 users by activity (from recent logs — capped at 50 by the API).
  const userCounts = new Map<string, { email: string; count: number }>()
  for (const log of recentLogs) {
    const email = log.user?.email || 'Anonyme'
    const existing = userCounts.get(email)
    if (existing) existing.count += 1
    else userCounts.set(email, { email, count: 1 })
  }
  const topUsers = Array.from(userCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // ─── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  // ─── KPI cards ───────────────────────────────────────────────────────────
  const kpiCards = [
    {
      title: 'DB taille',
      value: formatBytes(dbSizeBytes),
      subtitle: `SQLite · ${dbBucket.label}`,
      icon: Database,
      gradient: 'from-emerald-500/20 to-emerald-600/10',
      iconClass: dbBucket.textClass,
    },
    {
      title: 'Logs audit (total)',
      value: auditTotal.toLocaleString('fr-FR'),
      subtitle: 'toutes actions',
      icon: Activity,
      gradient: 'from-sky-500/20 to-sky-600/10',
      iconClass: 'text-sky-400',
    },
    {
      title: 'Sécurité 24h',
      value: secLast24h.toLocaleString('fr-FR'),
      subtitle: 'événements sécurité',
      icon: ShieldAlert,
      gradient: 'from-amber-500/20 to-amber-600/10',
      iconClass: 'text-amber-400',
    },
    {
      title: 'Sécurité 7j',
      value: secLast7d.toLocaleString('fr-FR'),
      subtitle: 'tendances hebdo',
      icon: TrendingDown,
      gradient: 'from-violet-500/20 to-violet-600/10',
      iconClass: 'text-violet-400',
    },
  ]

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ─── Header + controls ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-gold" />
            Opérations
          </h2>
          <p className="text-xs text-muted-foreground">
            Métriques ops-only (sécurité, taille DB, audit) — source&nbsp;: /api/platform/ops.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Auto-refresh"
            />
            <span>Auto-refresh 60s</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </Button>
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground/70">
              MAJ {lastUpdated.toLocaleTimeString('fr-FR')}
            </span>
          )}
        </div>
      </div>

      {/* ─── KPI cards row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((c) => (
          <Card key={c.title} className="glass-card gold-border border-0 overflow-hidden">
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center mb-3`}>
                <c.icon className={`w-5 h-5 ${c.iconClass}`} />
              </div>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.title}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{c.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── System Health ─────────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="w-4 h-4 text-gold" />
            Santé système
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* DB size gauge */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Taille SQLite (page_count × page_size)</span>
              <span className={`font-semibold ${dbBucket.textClass}`}>
                {formatBytes(dbSizeBytes)} · {dbBucket.label}
              </span>
            </div>
            {/* Custom div-based gauge — avoids arbitrary-variant recolor of
                the shadcn Progress indicator and gives us direct color control. */}
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${dbBucket.barBg}`}
                style={{ width: `${dbBucket.pct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              Seuils&nbsp;: &lt;{DB_GREEN_MB}MB sain · {DB_GREEN_MB}MB–1GB vigilance · &gt;1GB critique.
            </p>
          </div>

          {/* Container status — N/A (API doesn't expose it) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Server className="w-3.5 h-3.5" />
                Conteneur app
              </div>
              <p className="text-sm font-medium mt-1 text-muted-foreground/70">
                Non disponible
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                /api/platform/ops ne retourne pas le statut conteneur
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="w-3.5 h-3.5" />
                Conteneur redis
              </div>
              <p className="text-sm font-medium mt-1 text-muted-foreground/70">
                Non disponible
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                /api/platform/ops ne retourne pas le statut conteneur
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="w-3.5 h-3.5" />
                Uptime
              </div>
              <p className="text-sm font-medium mt-1 text-muted-foreground/70">
                Non disponible
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                /api/platform/ops ne retourne pas l&apos;uptime
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Security Events (counts + recent table) ──────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Événements sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 24h count cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Total 24h</p>
              <p className="text-2xl font-bold text-amber-400">{secLast24h}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Total 7j</p>
              <p className="text-2xl font-bold text-violet-400">{secLast7d}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Auth échecs 24h</p>
              <p className="text-2xl font-bold text-red-400">
                {byAction.AUTH_FAILED ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Rate-limits 24h</p>
              <p className="text-2xl font-bold text-orange-400">
                {(byAction.AUTH_RATE_LIMITED ?? 0) + (byAction.LOOKUP_RATE_LIMITED ?? 0)}
              </p>
            </div>
          </div>

          {/* Recent security events table */}
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Quand</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Mariage</TableHead>
                  <TableHead className="w-24 text-right">Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      Aucun événement sécurité récent. 🎉
                    </TableCell>
                  </TableRow>
                ) : (
                  recentLogs.slice(0, 25).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{formatRelative(log.createdAt)}</div>
                        <div className="text-[10px] text-muted-foreground/60">
                          {formatDateTime(log.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${actionBadgeClass(log.action)}`}
                        >
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.ipAddress || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.user ? (
                          <span>
                            <span className="font-medium">{log.user.email}</span>
                            <span className="text-[10px] text-muted-foreground/60 ml-1">
                              ({log.user.role})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">Anonyme</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.wedding ? (
                          <span className="font-mono">/{log.wedding.slug}</span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[10px] text-muted-foreground/70 max-w-xs truncate">
                        {log.details
                          ? typeof log.details === 'string'
                            ? log.details.slice(0, 60)
                            : JSON.stringify(log.details).slice(0, 60)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            25 premiers des 50 derniers logs sécurité retournés par l&apos;API.
          </p>
        </CardContent>
      </Card>

      {/* ─── Audit Log Summary (totals + bar chart + top users + sparkline) ── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-sky-400" />
            Résumé audit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Total */}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{auditTotal.toLocaleString('fr-FR')}</span>
            <span className="text-xs text-muted-foreground">
              entrées AuditLog (total, toutes actions)
            </span>
          </div>

          {/* Top 5 actions by frequency (CSS bars) */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Top 5 actions sécurité (24h, dérivé du byAction retourné par l&apos;API)
            </p>
            {topActions.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">
                Aucune action sécurité enregistrée dans les dernières 24h.
              </p>
            ) : (
              <div className="space-y-2">
                {topActions.map(([action, count]) => (
                  <div key={action} className="flex items-center gap-3">
                    <span className="w-32 text-xs font-mono text-muted-foreground truncate">
                      {ACTION_LABELS[action] || action}
                    </span>
                    <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500/80 to-sky-400/80 transition-all"
                        style={{ width: `${(count / topActionsMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-semibold tabular-nums">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top 5 users by activity (table) */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Top 5 utilisateurs par activité (50 derniers logs sécurité)
            </p>
            {topUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">
                Aucune activité utilisateur récente.
              </p>
            ) : (
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead className="w-24 text-right">Événements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topUsers.map((u) => (
                      <TableRow key={u.email}>
                        <TableCell className="text-xs font-medium">{u.email}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* 24h sparkline (CSS, no chart lib) */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Activité sécurité — 24 dernières heures (par heure)
            </p>
            <div className="flex items-end gap-0.5 h-16">
              {hourly.map((count, idx) => {
                const h = (count / hourlyMax) * 100
                const isPeak = count === hourlyMax && count > 0
                return (
                  <div
                    key={idx}
                    title={`H-${23 - idx}h : ${count} événement(s)`}
                    className="flex-1 min-w-[6px] rounded-t transition-all"
                    style={{
                      height: `${Math.max(2, h)}%`,
                      backgroundColor: isPeak
                        ? 'rgb(248 113 113 / 0.9)'
                        : count > 0
                          ? 'rgb(56 189 248 / 0.7)'
                          : 'rgba(255,255,255,0.05)',
                    }}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>-24h</span>
              <span>-12h</span>
              <span>maintenant</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Error Rates (N/A — API doesn't expose) ───────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="w-4 h-4 text-red-400" />
            Taux d&apos;erreur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground/70" />
              <span className="text-sm text-muted-foreground">
                Données non disponibles
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70">
              L&apos;endpoint <code className="font-mono bg-white/5 px-1 rounded">/api/platform/ops</code>{' '}
              ne retourne pas encore les taux d&apos;erreur (5xx, endpoints en erreur,
              logs d&apos;erreur récents). Ce panneau est réservé UI — la route API est
              propriété d&apos;une autre partie du système et ne doit pas être modifiée
              par P3.11. L&apos;orchestrateur pourra planifier une extension backend
              séparée pour exposer ces métriques.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
