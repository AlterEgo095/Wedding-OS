'use client'

// DashboardTab — extracted from src/app/platform/admin/page.tsx (CONS-3).
// Receives fetchWithAuth + setActiveTab from the parent page.

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

import {
  Heart,
  Crown,
  Users as UsersIcon,
  TrendingDown,
  UserPlus,
  Wallet,
  Rocket,
  Activity,
  Mail,
  UserCheck,
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

import { PLAN_METADATA, type Plan } from '@/lib/types'
import { formatDateTime } from '@/lib/format'

import {
  type DashboardData,
  type TabId,
  type FetchWithAuth,
  StatusBadge,
  PlanBadge,
  PLAN_CHART_COLORS,
  CHART_TOOLTIP_STYLE,
} from './shared'

export function DashboardTab({ fetchWithAuth, setActiveTab }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null>; setActiveTab: (tab: TabId) => void }) {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
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

  // P5.2-3 (HIGH-CMD-1 + HIGH-CMD-2): platform-wide invitations + check-ins.
  // Falls back to 0 if the API hasn't been updated yet (older deployments).
  const invitationsTotal = data.invitations?.total ?? 0
  const checkInsTotal = data.checkIns?.total ?? 0
  const checkInPct =
    data.guests.total > 0
      ? Math.round((checkInsTotal / data.guests.total) * 100)
      : 0

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
    // P5.2-3 / HIGH-CMD-1 — total invitations sent across all weddings.
    {
      title: 'Invitations',
      value: invitationsTotal,
      subtitle: 'Tous canaux confondus',
      icon: Mail,
      gradient: 'from-blue-500/20 to-blue-600/10',
      iconClass: 'text-blue-400',
    },
    // P5.2-3 / HIGH-CMD-2 — total guests checked in across all weddings.
    {
      title: 'Check-ins',
      value: checkInsTotal,
      subtitle: `${checkInPct}% des ${data.guests.total} invités`,
      icon: UserCheck,
      gradient: 'from-emerald-500/20 to-emerald-600/10',
      iconClass: 'text-emerald-400',
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
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

      {/* Mission 5.5: Actions Requises — unified pending view */}
      {data.pendingActions && (
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
          {/* New leads */}
          <Card className='glass-card gold-border border-0'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                <UserPlus className='w-4 h-4 text-gold' />
                Nouvelles demandes
                <span className='ml-auto text-lg font-bold text-gold'>{data.pendingActions.newLeadsCount}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 max-h-48 overflow-y-auto'>
              {data.pendingActions.recentLeads.length === 0 ? (
                <p className='text-xs text-muted-foreground text-center py-4'>Aucune demande en attente</p>
              ) : (
                data.pendingActions.recentLeads.map((lead) => (
                  <div key={lead.id} className='flex items-center justify-between p-2 rounded border border-gold/10 bg-white/[0.02]'>
                    <div className='min-w-0'>
                      <p className='text-xs font-medium truncate'>{lead.coupleLabel || lead.brideName + ' & ' + lead.groomName}</p>
                      <p className='text-[10px] text-muted-foreground'>{lead.plan} · {lead.email || lead.phone || '—'}</p>
                    </div>
                    <Button size='sm' variant='outline' className='h-7 text-[10px] shrink-0' onClick={() => { setActiveTab('onboarding'); }}>
                      Traiter
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pending payments */}
          <Card className='glass-card gold-border border-0'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                <Wallet className='w-4 h-4 text-gold' />
                Paiements à vérifier
                <span className='ml-auto text-lg font-bold text-gold'>{data.pendingActions.pendingPaymentsCount}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 max-h-48 overflow-y-auto'>
              {data.pendingActions.recentPendingPayments.length === 0 ? (
                <p className='text-xs text-muted-foreground text-center py-4'>Aucun paiement en attente</p>
              ) : (
                data.pendingActions.recentPendingPayments.map((pay) => (
                  <div key={pay.id} className='flex items-center justify-between p-2 rounded border border-gold/10 bg-white/[0.02]'>
                    <div className='min-w-0'>
                      <p className='text-xs font-medium truncate'>
                        {pay.order?.customer?.displayName || pay.order?.wedding?.coupleLabel || 'Paiement orphelin'}
                      </p>
                      <p className='text-[10px] text-muted-foreground'>
                        ${(pay.amount / 100).toFixed(2)} {pay.currency} · {pay.method}
                      </p>
                    </div>
                    <Button size='sm' variant='outline' className='h-7 text-[10px] shrink-0 bg-emerald-600/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/30' onClick={() => { setActiveTab('commercial'); }}>
                      Vérifier
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Draft weddings awaiting preparation */}
          <Card className='glass-card gold-border border-0'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                <Rocket className='w-4 h-4 text-gold' />
                À préparer / activer
                <span className='ml-auto text-lg font-bold text-gold'>{data.pendingActions.draftWeddingsCount}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 max-h-48 overflow-y-auto'>
              {data.pendingActions.recentDrafts.length === 0 ? (
                <p className='text-xs text-muted-foreground text-center py-4'>Aucun événement en préparation</p>
              ) : (
                data.pendingActions.recentDrafts.map((w) => (
                  <div key={w.id} className='flex items-center justify-between p-2 rounded border border-gold/10 bg-white/[0.02]'>
                    <div className='min-w-0'>
                      <p className='text-xs font-medium truncate'>{w.coupleLabel}</p>
                      <p className='text-[10px] text-muted-foreground'>
                        {w.plan} · {w.commercialStatus === 'PAID' ? 'Payé — prêt à publier' : w.commercialStatus || 'Non payé'}
                      </p>
                    </div>
                    <Button size='sm' variant='outline' className='h-7 text-[10px] shrink-0' onClick={() => { setActiveTab('weddings'); }}>
                      Ouvrir
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

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

