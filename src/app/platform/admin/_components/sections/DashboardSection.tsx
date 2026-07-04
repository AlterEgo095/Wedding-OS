'use client'

/**
 * Command Center — Dashboard Section (Global Overview)
 *
 * The landing page of the AENEWS Wedding OS Command Center.
 * Aggregates platform-wide KPIs, system health, alerts, recent activity,
 * recent weddings, and quick actions into a single glanceable view.
 *
 * Reuses the existing GET /api/platform/dashboard endpoint (no new API)
 * and the new GET /api/platform/health endpoint (read-only observability).
 *
 * Phase 1 — ÉTAPE 2 (Dashboard) + ÉTAPE 5 (Widgets) + ÉTAPE 7 (Observability).
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
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
import {
  Heart,
  Users as UsersIcon,
  Calendar,
  CalendarCheck,
  Download,
  QrCode,
  CheckCircle2,
  Activity,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Crown,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { usePlatformFetch } from '../../_lib/auth'
import {
  STATUS_LABELS,
  PLAN_CHART_COLORS,
  STATUS_CHART_COLORS,
  CHART_TOOLTIP_STYLE,
  QUICK_ACTIONS,
  type SectionId,
} from '../../_lib/constants'
import { StatusBadge, PlanBadge, formatDate, formatDateTime, formatBytes, formatUptime, actionBadgeClass } from '../../_lib/ui'
import type { DashboardData, SystemHealth, AuditLog } from '../../_lib/types'
import { StatCard, SectionHeader } from '../widgets/StatCard'

interface DashboardSectionProps {
  onNavigate: (section: SectionId) => void
}

export function DashboardSection({ onNavigate }: DashboardSectionProps) {
  const { fetchWithAuth } = usePlatformFetch()
  const [data, setData] = useState<DashboardData | null>(null)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [dashRes, healthRes] = await Promise.all([
      fetchWithAuth('/api/platform/dashboard'),
      fetchWithAuth('/api/platform/health').catch(() => null),
    ])
    if (dashRes) {
      try {
        setData(await dashRes.json())
      } catch {
        toast.error('Réponse dashboard invalide')
      }
    }
    if (healthRes && healthRes.ok) {
      try {
        setHealth(await healthRes.json())
      } catch {
        /* non-critical */
      }
    }
    setLoading(false)
  }, [fetchWithAuth])

  useEffect(() => {
    // Standard data-fetching pattern — load() calls setState (setLoading,
    // setData, setHealth) which triggers the react-hooks/set-state-in-effect
    // rule, but this is the canonical fetch-on-mount + fetch-on-deps-change
    // shape used throughout this codebase (see legacy UsersTab, AuditTab, etc).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Derived KPIs
  const totalWeddings = data?.weddings.total ?? 0
  const activeWeddings = data?.weddings.byStatus.PUBLISHED ?? 0
  const draftWeddings = data?.weddings.byStatus.DRAFT ?? 0
  const archivedWeddings = data?.weddings.byStatus.ARCHIVED ?? 0
  const suspendedWeddings = data?.weddings.byStatus.SUSPENDED ?? 0
  const totalGuests = data?.guests.total ?? 0
  const guests7d = data?.guests.last7days ?? 0
  const totalUsers = data?.users.total ?? 0
  const platformAdmins = data?.users.platformAdmins ?? 0
  const mrr = data?.revenue?.mrr ?? 0
  const newWeddings30d = data?.growth?.newWeddings30d ?? 0

  // Chart data
  const statusChartData = data
    ? Object.entries(data.weddings.byStatus).map(([name, value]) => ({ name, value }))
    : []
  const planChartData = data
    ? Object.entries(data.weddings.byPlan).map(([name, value]) => ({ name, value }))
    : []
  const growthSeries = data?.growth?.newWeddingsSeries ?? []

  // Alerts
  const criticalAlerts = health?.alerts.filter((a) => a.level === 'critical') ?? []
  const warnAlerts = health?.alerts.filter((a) => a.level === 'warn') ?? []
  const alertCount = criticalAlerts.length + warnAlerts.length

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SectionHeader
        title="Command Center"
        description="Vue globale de la plateforme AENEWS Wedding OS — mariages, invités, système et alertes en temps réel."
        icon={Crown}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            Actualiser
          </Button>
        }
      />

      {/* Alerts banner */}
      {health && alertCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-lg border p-3 flex items-start gap-3 ${
            criticalAlerts.length > 0
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
          }`}
        >
          <AlertTriangle
            className={`w-4 h-4 mt-0.5 shrink-0 ${
              criticalAlerts.length > 0 ? 'text-red-400' : 'text-amber-400'
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {criticalAlerts.length > 0
                ? `${criticalAlerts.length} alerte(s) critique(s)`
                : `${warnAlerts.length} avertissement(s)`}
            </p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {[...criticalAlerts, ...warnAlerts].slice(0, 3).map((a) => (
                <li key={a.code}>• {a.message}</li>
              ))}
            </ul>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs shrink-0"
            onClick={() => onNavigate('observability')}
          >
            Détails <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </motion.div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total mariages"
          value={totalWeddings}
          icon={Heart}
          tone="gold"
          delta={newWeddings30d > 0 ? undefined : undefined}
          subtitle={`+${newWeddings30d} (30j)`}
          loading={loading}
          delay={0}
        />
        <StatCard
          label="Actifs (publiés)"
          value={activeWeddings}
          icon={CheckCircle2}
          tone="emerald"
          subtitle={`${draftWeddings} brouillons`}
          loading={loading}
          delay={0.05}
        />
        <StatCard
          label="Total invités"
          value={totalGuests}
          icon={UsersIcon}
          tone="violet"
          subtitle={`+${guests7d} (7j)`}
          loading={loading}
          delay={0.1}
        />
        <StatCard
          label="Utilisateurs"
          value={totalUsers}
          icon={Crown}
          tone="sky"
          subtitle={`${platformAdmins} admins`}
          loading={loading}
          delay={0.15}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status distribution donut */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              Répartition par statut
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-44 w-full rounded" />
            ) : statusChartData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                Aucune donnée
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {statusChartData.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_CHART_COLORS[entry.name] ?? '#71717a'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: number, n: string) => [v, STATUS_LABELS[n as keyof typeof STATUS_LABELS] ?? n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {statusChartData.length > 0 && !loading && (
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {statusChartData.map((s) => (
                  <div key={s.name} className="flex items-center gap-1.5 text-[10px]">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: STATUS_CHART_COLORS[s.name] ?? '#71717a' }}
                    />
                    <span className="text-muted-foreground">
                      {STATUS_LABELS[s.name as keyof typeof STATUS_LABELS] ?? s.name}: {s.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plan distribution donut */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              Répartition par plan
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-44 w-full rounded" />
            ) : planChartData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                Aucune donnée
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={planChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {planChartData.map((entry) => (
                      <Cell key={entry.name} fill={PLAN_CHART_COLORS[entry.name] ?? '#71717a'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {planChartData.length > 0 && !loading && (
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {planChartData.map((p) => (
                  <div key={p.name} className="flex items-center gap-1.5 text-[10px]">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: PLAN_CHART_COLORS[p.name] ?? '#71717a' }}
                    />
                    <span className="text-muted-foreground">
                      {p.name}: {p.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Growth area chart */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              Croissance mariages (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-44 w-full rounded" />
            ) : growthSeries.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                Pas assez de données
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={growthSeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D4A853" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#D4A853" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#D4A853"
                    strokeWidth={2}
                    fill="url(#growthGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions strip */}
      <Card className="bg-white/[0.02] border-white/10">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium shrink-0 pr-2">
              Actions rapides
            </span>
            {QUICK_ACTIONS.slice(0, 6).map((action) => (
              <button
                key={action.id}
                onClick={() => onNavigate(action.section)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs transition-colors shrink-0"
              >
                <action.icon className="w-3 h-3 text-gold" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity + Recent weddings + System health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent activity */}
        <Card className="bg-white/[0.02] border-white/10 lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-gold" />
              Activité récente
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => onNavigate('audit')}
            >
              Tout voir <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : (data?.recentActivity?.length ?? 0) === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Aucune activité récente
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
                {(data?.recentActivity ?? []).slice(0, 8).map((log: AuditLog) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-white/5 transition-colors"
                  >
                    <Badge
                      variant="outline"
                      className={`text-[9px] uppercase tracking-wide shrink-0 ${actionBadgeClass(log.action)}`}
                    >
                      {log.action.replace(/_/g, ' ')}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">
                        <span className="font-medium">{log.user?.name ?? 'Système'}</span>
                        {log.wedding && (
                          <span className="text-muted-foreground"> · {log.wedding.coupleLabel}</span>
                        )}
                      </p>
                      {log.details && (
                        <p className="text-[10px] text-muted-foreground truncate">{log.details}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System health mini */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  criticalAlerts.length > 0
                    ? 'bg-red-400 animate-pulse'
                    : warnAlerts.length > 0
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                }`}
              />
              Santé système
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => onNavigate('observability')}
            >
              Détails <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {loading || !health ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full rounded" />
                ))}
              </div>
            ) : (
              <>
                <HealthRow label="Uptime" value={formatUptime(health.uptimeSeconds)} />
                <HealthRow
                  label="CPU"
                  value={`${health.cpu.usagePercent.toFixed(1)}%`}
                  tone={health.cpu.usagePercent > 75 ? 'warn' : 'ok'}
                />
                <HealthRow
                  label="RAM système"
                  value={`${health.memory.systemUsedPercent.toFixed(1)}%`}
                  tone={health.memory.systemUsedPercent > 85 ? 'warn' : 'ok'}
                />
                <HealthRow
                  label="Stockage uploads"
                  value={formatBytes(health.storage.uploadsBytes)}
                  subtitle={`${health.storage.uploadsFiles} fichiers`}
                />
                <HealthRow
                  label="Base de données"
                  value={formatBytes(health.storage.dbBytes)}
                  subtitle={`${health.database.weddings} mariages`}
                />
                <HealthRow
                  label="Docker"
                  value={health.services.docker ? 'Actif' : 'Non détecté'}
                  tone={health.services.docker ? 'ok' : 'muted'}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent weddings */}
      <Card className="bg-white/[0.02] border-white/10">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-gold" />
            Mariages récents
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => onNavigate('portfolio')}
          >
            Portfolio <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded" />
              ))}
            </div>
          ) : (data?.recentWeddings?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Aucun mariage créé pour l&apos;instant
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(data?.recentWeddings ?? []).slice(0, 6).map((w) => (
                <Link
                  key={w.id}
                  href={`/w/${w.slug}`}
                  target="_blank"
                  className="flex items-center gap-3 p-2.5 rounded-md bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 transition-all group"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {w.coupleLabel.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate group-hover:text-gold transition-colors">
                      {w.coupleLabel}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      /w/{w.slug} · {formatDate(w.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <StatusBadge status={w.status} />
                    <PlanBadge plan={w.plan} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function HealthRow({
  label,
  value,
  subtitle,
  tone = 'default',
}: {
  label: string
  value: string
  subtitle?: string
  tone?: 'ok' | 'warn' | 'muted' | 'default'
}) {
  const valueColor =
    tone === 'warn'
      ? 'text-amber-400'
      : tone === 'ok'
        ? 'text-emerald-400'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground'
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-1.5">
        {subtitle && <span className="text-[10px] text-muted-foreground/70">{subtitle}</span>}
        <span className={`font-medium ${valueColor}`}>{value}</span>
      </div>
    </div>
  )
}
