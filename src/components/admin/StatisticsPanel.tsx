'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  UserCheck,
  Clock,
  CheckCircle,
  XCircle,
  Grid3X3,
  Gift,
  Image as ImageIcon,
  TrendingUp,
  Heart,
  Activity,
  Armchair,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { toast } from 'sonner'

/**
 * StatisticsPanel — CONS-5-CLIENT-BACKEND
 *
 * Read-only event statistics dashboard. Aggregates data from
 * /api/weddings/[id]/stats into KPI cards + charts.
 *
 * Shows: RSVP breakdown, attendance rate, seating utilisation,
 * guests per category/family/group, gift totals, media count.
 */

interface Stats {
  weddingId: string
  rsvp: {
    total: number
    confirmed: number
    pending: number
    declined: number
    responseRate: number
  }
  checkIn: {
    checkedIn: number
    attendanceRate: number
  }
  seating: {
    totalTables: number
    totalSeats: number
    occupiedSeats: number
    remainingSeats: number
    tables: Array<{
      id: string
      name: string
      number: number
      capacity: number
      guestCount: number
      occupancyRate: number
    }>
  }
  categories: Array<{ category: string; count: number }>
  families: Array<{ id: string; name: string; side: string; memberCount: number }>
  groups: Array<{ id: string; name: string; color: string | null; memberCount: number }>
  gifts: {
    total: number
    totalAmountCents: number
    byCurrency: Array<{ currency: string; amountCents: number; count: number }>
  }
  media: { total: number }
  program: { total: number }
  invitations: { total: number }
}

interface Props {
  weddingId: string
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: '#22c55e',
  PENDING: '#f59e0b',
  DECLINED: '#ef4444',
}

const CATEGORY_COLORS: Record<string, string> = {
  VIP: '#d4a853',
  FAMILLE: '#e88a6a',
  AMIS: '#6db3a0',
  SPONSORS: '#8b7ec8',
  COLLEGUES: '#5b9bd5',
}

const CATEGORY_LABELS: Record<string, string> = {
  VIP: 'VIP',
  FAMILLE: 'Famille',
  AMIS: 'Amis',
  SPONSORS: 'Sponsors',
  COLLEGUES: 'Collègues',
}

const SIDE_COLORS: Record<string, string> = {
  BRIDE: '#f43f5e',
  GROOM: '#0ea5e9',
  COMMON: '#a78bfa',
}

const SIDE_LABELS: Record<string, string> = {
  BRIDE: 'Côté mariée',
  GROOM: 'Côté marié',
  COMMON: 'Commun',
}

function formatMoney(cents: number, currency: string): string {
  const value = cents / 100
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

export default function StatisticsPanel({ weddingId }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/stats`)
      if (res.ok) {
        const json = await res.json()
        setStats(json.stats)
      } else {
        toast.error('Erreur de chargement des statistiques')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [weddingId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-bold gold-gradient font-display flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Statistiques
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Chargement…</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-6">
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-10 pb-10 text-center">
            <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Aucune statistique disponible.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const rsvpPieData = [
    { name: 'Confirmés', value: stats.rsvp.confirmed, color: STATUS_COLORS.CONFIRMED },
    { name: 'En attente', value: stats.rsvp.pending, color: STATUS_COLORS.PENDING },
    { name: 'Refusés', value: stats.rsvp.declined, color: STATUS_COLORS.DECLINED },
  ].filter((d) => d.value > 0)

  const categoryChartData = stats.categories.map((c) => ({
    name: CATEGORY_LABELS[c.category] || c.category,
    count: c.count,
    fill: CATEGORY_COLORS[c.category] || '#94a3b8',
  }))

  const tableChartData = stats.seating.tables.map((t) => ({
    name: `T${t.number}`,
    nameFull: t.name,
    Occupés: t.guestCount,
    Capacité: t.capacity,
  }))

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold gold-gradient font-display flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          Statistiques de l’événement
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d’ensemble des réponses RSVP, de l’occupation des tables et des cadeaux.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={Users}
          label="Invités"
          value={stats.rsvp.total}
          color="text-gold-light"
        />
        <KpiCard
          icon={UserCheck}
          label="Confirmés"
          value={stats.rsvp.confirmed}
          color="text-emerald-400"
        />
        <KpiCard
          icon={Clock}
          label="En attente"
          value={stats.rsvp.pending}
          color="text-amber-400"
        />
        <KpiCard
          icon={XCircle}
          label="Refusés"
          value={stats.rsvp.declined}
          color="text-rose-400"
        />
        <KpiCard
          icon={CheckCircle}
          label="Taux de réponse"
          value={`${stats.rsvp.responseRate}%`}
          color="text-sky-400"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={UserCheck}
          label="Présents (check-in)"
          value={stats.checkIn.checkedIn}
          color="text-emerald-400"
          subtitle={`Taux ${stats.checkIn.attendanceRate}%`}
        />
        <KpiCard
          icon={Grid3X3}
          label="Tables"
          value={stats.seating.totalTables}
          color="text-violet-400"
        />
        <KpiCard
          icon={Armchair}
          label="Places totales"
          value={stats.seating.totalSeats}
          color="text-sky-400"
          subtitle={`${stats.seating.remainingSeats} restantes`}
        />
        <KpiCard
          icon={Gift}
          label="Cadeaux"
          value={stats.gifts.total}
          color="text-rose-400"
        />
        <KpiCard
          icon={ImageIcon}
          label="Médias"
          value={stats.media.total}
          color="text-amber-400"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RSVP breakdown pie */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-gold-light" />
              Répartition RSVP
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rsvpPieData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Aucune réponse RSVP pour le moment.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={rsvpPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {rsvpPieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Categories bar */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-gold-light" />
              Invités par catégorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Aucune catégorie pour le moment.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 — table occupancy */}
      <Card className="bg-white/[0.02] border-white/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-gold-light" />
            Occupation des tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tableChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Aucune table définie pour le moment.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tableChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend />
                <Bar dataKey="Capacité" fill="#475569" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Occupés" fill="#d4a853" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Families + Groups breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="w-4 h-4 text-gold-light" />
              Familles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.families.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                Aucune famille créée.
              </div>
            ) : (
              <div className="space-y-2">
                {stats.families.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            SIDE_COLORS[f.side] || SIDE_COLORS.COMMON,
                        }}
                      />
                      <span className="text-sm truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({SIDE_LABELS[f.side] || f.side})
                      </span>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {f.memberCount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-gold-light" />
              Groupes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.groups.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                Aucun groupe créé.
              </div>
            ) : (
              <div className="space-y-2">
                {stats.groups.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: g.color || '#94a3b8' }}
                      />
                      <span className="text-sm truncate">{g.name}</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {g.memberCount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gift totals */}
      {stats.gifts.byCurrency.length > 0 && (
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="w-4 h-4 text-gold-light" />
              Total des cadeaux reçus
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.gifts.byCurrency.map((g) => (
                <motion.div
                  key={g.currency}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-lg bg-white/[0.04] border border-white/5 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs text-muted-foreground">{g.currency}</div>
                    <div className="text-xl font-bold gold-gradient">
                      {formatMoney(g.amountCents, g.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {g.count} cadeau{g.count > 1 ? 'x' : ''}
                    </div>
                  </div>
                  <Gift className="w-8 h-8 text-gold-light/40" />
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── KPI Card sub-component ─────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  color: string
  subtitle?: string
}) {
  return (
    <Card className="bg-white/[0.02] border-white/10">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  )
}
