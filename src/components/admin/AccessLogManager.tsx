'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck, AlertTriangle, Eye, Users, BarChart3,
  RefreshCw, LogIn, LogOut, Ban, QrCode, Link, Search
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface AccessLogManagerProps {
  token: string
}

interface LogEntry {
  id: string
  guestId: string | null
  action: string
  details: string | null
  userAgent: string | null
  ipAddress: string | null
  referrer: string | null
  createdAt: string
  guest: {
    id: string
    firstName: string
    lastName: string
    invitationCode: string
  } | null
}

interface AccessStats {
  totalLogins: number
  totalAccessDenied: number
  viewedInvitations: number
  totalGuests: number
  viewRate: number
}

const actionConfig: Record<string, { label: string; icon: typeof LogIn; color: string; bg: string }> = {
  LOGIN: { label: 'Connexion', icon: LogIn, color: 'text-green-500', bg: 'bg-green-500/10' },
  VIEW_INVITATION: { label: 'Consultation', icon: Eye, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  ACCESS_DENIED: { label: 'Accès refusé', icon: Ban, color: 'text-red-500', bg: 'bg-red-500/10' },
  LOGOUT: { label: 'Déconnexion', icon: LogOut, color: 'text-gray-500', bg: 'bg-gray-500/10' },
  QR_SCAN: { label: 'Scan QR', icon: QrCode, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  LINK_VISIT: { label: 'Lien visité', icon: Link, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  AUTH_FAILED: { label: 'Auth échouée', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  INVALID_SESSION: { label: 'Session invalide', icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  AUTH_RATE_LIMITED: { label: 'Rate limité', icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
}

export default function AccessLogManager({ token }: AccessLogManagerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<AccessStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter) params.set('action', filter)
      params.set('limit', '200')

      const res = await fetch(`/api/guest/access-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setStats(data.stats || null)
      }
    } catch (error) {
      console.error('Fetch access logs error:', error)
    } finally {
      setLoading(false)
    }
  }, [token, filter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold gold-gradient">Journal d&apos;Accès</h2>
          <p className="text-sm text-muted-foreground font-display mt-1">
            Surveillance des accès invités et tentatives de connexion
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          className="border-white/10 hover:border-gold/30 text-muted-foreground"
        >
          <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="glass-card p-4 rounded-xl text-center">
            <Users className="size-5 text-gold mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.totalGuests}</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Total invités</p>
          </div>
          <div className="glass-card p-4 rounded-xl text-center">
            <Eye className="size-5 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.viewedInvitations}</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Invitations consultées</p>
          </div>
          <div className="glass-card p-4 rounded-xl text-center">
            <BarChart3 className="size-5 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.viewRate}%</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Taux de consultation</p>
          </div>
          <div className="glass-card p-4 rounded-xl text-center">
            <LogIn className="size-5 text-emerald-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.totalLogins}</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Connexions</p>
          </div>
          <div className="glass-card p-4 rounded-xl text-center">
            <AlertTriangle className="size-5 text-red-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.totalAccessDenied}</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Accès refusés</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-display text-muted-foreground font-bold uppercase tracking-wide">Filtrer :</span>
        {['', 'LOGIN', 'VIEW_INVITATION', 'ACCESS_DENIED', 'AUTH_FAILED', 'LOGOUT'].map((action) => (
          <button
            key={action}
            onClick={() => setFilter(action)}
            className={`px-3 py-1.5 rounded-full text-xs font-display font-bold transition-all ${
              filter === action
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'bg-white/5 text-muted-foreground border border-white/10 hover:border-gold/20'
            }`}
          >
            {action || 'Tous'}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="shimmer h-14 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto custom-scrollbar space-y-2">
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <Search className="size-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-display">Aucun log trouvé</p>
            </div>
          ) : (
            logs.map((log, i) => {
              const config = actionConfig[log.action] || {
                label: log.action,
                icon: Eye,
                color: 'text-gray-500',
                bg: 'bg-gray-500/10',
              }
              const Icon = config.icon

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
                >
                  {/* Action icon */}
                  <div className={`shrink-0 w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
                    <Icon className={`size-4 ${config.color}`} />
                  </div>

                  {/* Guest info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-display font-semibold truncate">
                        {log.guest ? `${log.guest.firstName} ${log.guest.lastName}` : 'Inconnu'}
                      </span>
                      <Badge variant="outline" className={`${config.bg} ${config.color} border-0 text-[10px] font-display font-bold px-2 py-0`}>
                        {config.label}
                      </Badge>
                    </div>
                    {log.details && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{log.details}</p>
                    )}
                    {log.ipAddress && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">IP: {log.ipAddress}</p>
                    )}
                  </div>

                  {/* Date */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground font-display">{formatDate(log.createdAt)}</p>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
