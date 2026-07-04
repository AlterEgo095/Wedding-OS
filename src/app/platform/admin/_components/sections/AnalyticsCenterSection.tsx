'use client'

/**
 * Analytics Center Section — Phase 1.
 *
 * Centralized analytics dashboard pulling real metrics from
 * GET /api/platform/dashboard (weddings total, byStatus, byPlan, guests,
 * revenue.mrr, growth.newWeddings30d) and rendering them as:
 *
 *   1. A row of 4 StatCard KPIs (Total mariages, Total invités, MRR,
 *      Nouveaux mariages 30j).
 *   2. Two donut charts (recharts) side-by-side:
 *        - Left:  weddings by status  (STATUS_CHART_COLORS)
 *        - Right: weddings by plan    (PLAN_CHART_COLORS)
 *   3. A "Widgets à venir" grid of 8 placeholder tiles (Visiteurs,
 *      Téléchargements, Scans QR, Confirmations, Pays, Appareils, Trafic,
 *      Évolution) — each badged "Bientôt disponible".
 *
 * Phase 2 will plug in real web analytics (page views, devices, geo) —
 * the widgets live here so the admin sees the full analytics surface.
 */

import { useEffect, useState, useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
} from 'recharts'
import {
  BarChart3,
  Heart,
  Users as UsersIcon,
  Wallet,
  TrendingUp,
  Eye,
  Download,
  QrCode,
  CheckCircle2,
  Globe,
  Smartphone,
  Activity,
  LineChart as LineChartIcon,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

import type { DashboardData } from '../../_lib/types'
import { usePlatformFetch } from '../../_lib/auth'
import {
  STATUS_CHART_COLORS,
  PLAN_CHART_COLORS,
  CHART_TOOLTIP_STYLE,
  STATUS_LABELS,
} from '../../_lib/constants'
import { PLAN_METADATA } from '@/lib/types'
import { StatCard, SectionHeader } from '../widgets/StatCard'

interface ChartDatum {
  name: string
  value: number
  color: string
  key: string
}

/** Coming-soon analytics widgets — Phase 2 (web analytics engine). */
const COMING_WIDGETS: Array<{
  key: string
  label: string
  description: string
  icon: LucideIcon
}> = [
  { key: 'visitors', label: 'Visiteurs', description: 'Visiteurs uniques 30j', icon: Eye },
  { key: 'downloads', label: 'Téléchargements', description: 'Téléchargements média', icon: Download },
  { key: 'qr', label: 'Scans QR', description: 'Scans codes d\'invitation', icon: QrCode },
  { key: 'confirmations', label: 'Confirmations', description: 'RSVP confirmés / période', icon: CheckCircle2 },
  { key: 'countries', label: 'Pays', description: 'Répartition géographique', icon: Globe },
  { key: 'devices', label: 'Appareils', description: 'Mobile / desktop / tablette', icon: Smartphone },
  { key: 'traffic', label: 'Trafic', description: 'Sources de trafic', icon: Activity },
  { key: 'evolution', label: 'Évolution', description: 'Tendances sur 6 mois', icon: LineChartIcon },
]

/** Format MRR in USD with thousands separators. */
function formatMrr(mrr: number): string {
  if (!mrr) return '$0'
  return `$${mrr.toLocaleString('en-US')}`
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]
  const datum = p.payload as ChartDatum
  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p className="font-medium">{datum.name}</p>
      <p className="opacity-80">{datum.value} mariage{datum.value > 1 ? 's' : ''}</p>
    </div>
  )
}

/** Donut chart — shared renderer for status & plan breakdowns. */
function DonutChart({
  data,
  loading,
  emptyLabel,
}: {
  data: ChartDatum[]
  loading: boolean
  emptyLabel: string
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (loading) {
    return (
      <div className="h-[220px] flex items-center justify-center">
        <Skeleton className="h-40 w-40 rounded-full bg-white/5" />
      </div>
    )
  }
  if (total === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Legend row under each donut. */
function ChartLegend({ data }: { data: ChartDatum[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-2">
      {data.map((d) => (
        <div key={d.key} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: d.color }}
          />
          <span className="text-[11px] text-muted-foreground">{d.name}</span>
          <span className="text-[11px] font-medium">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

export function AnalyticsCenterSection() {
  const { fetchWithAuth } = usePlatformFetch()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const res = await fetchWithAuth('/api/platform/dashboard')
      if (cancelled) return
      if (!res) {
        setError('Erreur de connexion au serveur')
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as DashboardData
        if (cancelled) return
        setData(json)
      } catch {
        if (!cancelled) setError('Réponse invalide du serveur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [fetchWithAuth])

  // Memoize chart data so recharts doesn't recompute on every render.
  const statusData = useMemo<ChartDatum[]>(() => {
    if (!data) return []
    return Object.entries(data.weddings.byStatus)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        key,
        name: STATUS_LABELS[key as keyof typeof STATUS_LABELS] ?? key,
        value,
        color: STATUS_CHART_COLORS[key] ?? '#71717a',
      }))
  }, [data])

  const planData = useMemo<ChartDatum[]>(() => {
    if (!data) return []
    return Object.entries(data.weddings.byPlan)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        key,
        name: PLAN_METADATA[key as keyof typeof PLAN_METADATA]?.label ?? key,
        value,
        color: PLAN_CHART_COLORS[key] ?? '#71717a',
      }))
  }, [data])

  const weddingsTotal = data?.weddings.total ?? 0
  const guestsTotal = data?.guests.total ?? 0
  const mrr = data?.revenue?.mrr ?? 0
  const newWeddings30d = data?.growth?.newWeddings30d ?? 0

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Analytics Center"
        description="Tableau de bord analytique centralisé — métriques plateforme en temps réel"
        icon={BarChart3}
        actions={
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide text-gold border-gold/40"
          >
            Live
          </Badge>
        }
      />

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total mariages"
          value={weddingsTotal}
          icon={Heart}
          tone="gold"
          loading={loading}
          subtitle={error ? 'Indisponible' : undefined}
          delay={0}
        />
        <StatCard
          label="Total invités"
          value={guestsTotal}
          icon={UsersIcon}
          tone="emerald"
          loading={loading}
          subtitle={error ? 'Indisponible' : undefined}
          delay={0.05}
        />
        <StatCard
          label="MRR"
          value={formatMrr(mrr)}
          icon={Wallet}
          tone="violet"
          loading={loading}
          subtitle={error ? 'Indisponible' : 'Revenu mensuel récurrent'}
          delay={0.1}
        />
        <StatCard
          label="Nouveaux mariages 30j"
          value={newWeddings30d}
          icon={TrendingUp}
          tone="sky"
          loading={loading}
          subtitle={error ? 'Indisponible' : undefined}
          delay={0.15}
        />
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-emerald-400" />
              Mariages par statut
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={statusData}
              loading={loading}
              emptyLabel="Aucun mariage à afficher"
            />
            {!loading && statusData.length > 0 && <ChartLegend data={statusData} />}
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gold" />
              Mariages par plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={planData}
              loading={loading}
              emptyLabel="Aucun mariage à afficher"
            />
            {!loading && planData.length > 0 && <ChartLegend data={planData} />}
          </CardContent>
        </Card>
      </div>

      {/* ── Coming-soon widgets ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold">Widgets à venir</h3>
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide bg-amber-500/10 text-amber-400 border-amber-500/30"
          >
            Phase 2 · Web analytics
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {COMING_WIDGETS.map((w) => {
            const Icon = w.icon
            return (
              <Card
                key={w.key}
                className="bg-white/[0.02] border-white/10 hover:border-white/20 transition-colors"
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-md bg-white/5 text-muted-foreground flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase tracking-wide bg-amber-500/10 text-amber-400 border-amber-500/30"
                    >
                      Bientôt
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{w.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {w.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 text-center pt-2">
          {error}
        </p>
      )}
    </div>
  )
}
