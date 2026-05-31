'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, UserCheck, Clock, CheckCircle, Grid3X3, Armchair, Activity, Heart } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { toast } from 'sonner'

interface DashboardData {
  totalGuests: number
  totalTables: number
  confirmedGuests: number
  pendingGuests: number
  declinedGuests: number
  checkedInGuests: number
  totalSeats: number
  occupiedSeats: number
  recentActivity: Array<{
    id: string
    action: string
    details: string | null
    createdAt: string
    user: { name: string; email: string } | null
  }>
  categoryStats: Array<{ category: string; count: number }>
}

interface DashboardProps {
  token: string
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

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmé',
  PENDING: 'En attente',
  DECLINED: 'Refusé',
}

export default function Dashboard({ token }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        toast.error('Session expirée')
        return
      }
      const json = await res.json()
      if (res.ok) {
        setData(json)
      } else {
        toast.error(json.error || 'Erreur de chargement')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [token])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const statusData = [
    { name: STATUS_LABELS.CONFIRMED, value: data.confirmedGuests, color: STATUS_COLORS.CONFIRMED },
    { name: STATUS_LABELS.PENDING, value: data.pendingGuests, color: STATUS_COLORS.PENDING },
    { name: STATUS_LABELS.DECLINED, value: data.declinedGuests, color: STATUS_COLORS.DECLINED },
  ].filter(d => d.value > 0)

  const categoryData = data.categoryStats.map(c => ({
    name: CATEGORY_LABELS[c.category] || c.category,
    count: c.count,
    fill: CATEGORY_COLORS[c.category] || '#8884d8',
  }))

  const metricCards = [
    { title: 'Total Invités', value: data.totalGuests, icon: Users, color: 'from-gold/20 to-gold-light/10' },
    { title: 'Confirmés', value: data.confirmedGuests, icon: UserCheck, color: 'from-green-500/20 to-green-600/10' },
    { title: 'En attente', value: data.pendingGuests, icon: Clock, color: 'from-amber-500/20 to-amber-600/10' },
    { title: 'Check-in', value: data.checkedInGuests, icon: CheckCircle, color: 'from-emerald-500/20 to-emerald-600/10' },
    { title: 'Tables', value: data.totalTables, icon: Grid3X3, color: 'from-violet-500/20 to-violet-600/10' },
  ]

  const seatOccupancy = data.totalSeats > 0 ? Math.round((data.occupiedSeats / data.totalSeats) * 100) : 0

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Couple Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl gold-border"
      >
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#1a1209] via-[#2a1f10] to-[#1a1209]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,168,83,0.12)_0%,transparent_70%)]" />

        {/* Ornamental top line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        <div className="relative flex items-center justify-between px-4 py-5 md:px-8 md:py-6">
          {/* Left Photo */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full gold-border p-[2px] overflow-hidden">
              <Image
                src="/upload/couple-photo-1.jpeg"
                alt="Alexandre"
                width={80}
                height={80}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-gold flex items-center justify-center">
              <Heart className="w-3 h-3 text-white fill-white" />
            </div>
          </div>

          {/* Center Text */}
          <div className="flex-1 text-center px-3 md:px-6">
            <div className="flex items-center justify-center gap-2 md:gap-3 mb-1">
              <span className="hidden sm:block h-px flex-1 max-w-16 bg-gradient-to-r from-transparent to-gold/50" />
              <div className="flourish text-gold/60 text-sm">✦</div>
              <span className="hidden sm:block h-px flex-1 max-w-16 bg-gradient-to-l from-transparent to-gold/50" />
            </div>
            <h2 className="font-display text-xl md:text-2xl lg:text-3xl gold-gradient font-semibold tracking-wide">
              Mariage Alexandre & Béatrice
            </h2>
            <div className="flex items-center justify-center gap-2 mt-1.5">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold/40" />
              <p className="text-xs md:text-sm text-gold-light/80 font-serif tracking-widest uppercase">
                15 Septembre 2025
              </p>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold/40" />
            </div>
          </div>

          {/* Right Photo */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full gold-border p-[2px] overflow-hidden">
              <Image
                src="/upload/couple-photo-2.png"
                alt="Béatrice"
                width={80}
                height={80}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Ornamental bottom line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      </motion.div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {metricCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Card className="glass-card gold-border overflow-hidden border-0">
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
                  <card.icon className="w-5 h-5 text-gold" />
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.title}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Seat Occupancy Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500/20 to-rose-600/10 flex items-center justify-center shrink-0">
              <Armchair className="w-5 h-5 text-rose-gold" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Occupation des places</p>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${seatOccupancy}%` }}
                    transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-gold"
                  />
                </div>
                <span className="text-sm font-semibold">{data.occupiedSeats}/{data.totalSeats} ({seatOccupancy}%)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Pie Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Répartition par Statut</CardTitle>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(20, 20, 35, 0.9)',
                        border: '1px solid rgba(212, 168, 83, 0.3)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Legend
                      formatter={(value: string) => <span style={{ color: '#ccc', fontSize: '12px' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                  Aucune donnée disponible
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Bar Chart */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Répartition par Catégorie</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fill: '#aaa', fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#ccc', fontSize: 12 }} width={70} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(20, 20, 35, 0.9)',
                        border: '1px solid rgba(212, 168, 83, 0.3)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                  Aucune donnée disponible
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.3 }}
      >
        <Card className="glass-card gold-border border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-gold" />
              Activité Récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {data.recentActivity.map((log, i) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.03 }}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-gold mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium text-gold">{log.user?.name || 'Système'}</span>
                        {' — '}
                        <span className="text-muted-foreground">{log.action.replace(/_/g, ' ')}</span>
                      </p>
                      {log.details && (
                        <p className="text-xs text-muted-foreground truncate">{log.details}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune activité récente</p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
