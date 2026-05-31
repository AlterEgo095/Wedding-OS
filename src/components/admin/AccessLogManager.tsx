'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck, AlertTriangle, Eye, Users, BarChart3,
  RefreshCw, LogIn, LogOut, Ban, QrCode, Link, Search,
  Fingerprint, Clock, Monitor, Smartphone, Globe,
  ShieldAlert, TrendingUp, Activity, Server, ChevronDown,
  ChevronUp, CheckCircle2, XCircle, HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

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
    category: string
    status: string
    checkedIn: boolean
  } | null
}

interface AccessStats {
  totalLogins: number
  totalAccessDenied: number
  totalAuthFailed: number
  totalBruteForce: number
  totalFingerprintMismatches: number
  totalLinkVisits: number
  totalQRScans: number
  totalSearches: number
  totalSearchBlocked: number
  viewedInvitations: number
  totalGuests: number
  confirmedGuests: number
  checkedInGuests: number
  activeSessions: number
  viewRate: number
  confirmationRate: number
  checkInRate: number
  recentAccessDenied: number
  suspiciousIPs: { ip: string; count: number }[]
  categoryBreakdown: { category: string; count: number }[]
}

const actionConfig: Record<string, { label: string; icon: typeof LogIn; color: string; bg: string }> = {
  LOGIN: { label: 'Connexion', icon: LogIn, color: 'text-green-500', bg: 'bg-green-500/10' },
  VIEW_INVITATION: { label: 'Consultation', icon: Eye, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  SEARCH: { label: 'Recherche nom', icon: Search, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  SEARCH_BLOCKED: { label: 'Recherche bloquée', icon: Ban, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ACCESS_DENIED: { label: 'Accès refusé', icon: Ban, color: 'text-red-500', bg: 'bg-red-500/10' },
  LOGOUT: { label: 'Déconnexion', icon: LogOut, color: 'text-gray-500', bg: 'bg-gray-500/10' },
  QR_SCAN: { label: 'Scan QR', icon: QrCode, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  LINK_VISIT: { label: 'Lien visité', icon: Link, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  AUTH_FAILED: { label: 'Auth échouée', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  INVALID_SESSION: { label: 'Session invalide', icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  AUTH_RATE_LIMITED: { label: 'Rate limité', icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  BRUTE_FORCE_BLOCKED: { label: 'Brute force', icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-600/10' },
  FINGERPRINT_MISMATCH: { label: 'Empreinte invalide', icon: Fingerprint, color: 'text-orange-500', bg: 'bg-orange-500/10' },
}

function parseUserAgent(ua: string): { browser: string; os: string; device: string; isMobile: boolean } {
  let browser = 'Inconnu'
  let os = 'Inconnu'
  let device = 'Desktop'
  let isMobile = false

  if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera'

  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) { os = 'Android'; isMobile = true }
  else if (ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; isMobile = true }

  if (isMobile) device = 'Mobile'
  else if (ua.includes('iPad') || ua.includes('Tablet')) device = 'Tablet'

  return { browser, os, device, isMobile }
}

const categoryLabels: Record<string, string> = {
  VIP: 'VIP',
  FAMILLE: 'Famille',
  AMIS: 'Amis',
  SPONSORS: 'Sponsor',
  COLLEGUES: 'Collègues',
}

const categoryColors: Record<string, string> = {
  VIP: 'bg-amber-500/10 text-amber-600',
  FAMILLE: 'bg-rose-500/10 text-rose-600',
  AMIS: 'bg-emerald-500/10 text-emerald-600',
  SPONSORS: 'bg-purple-500/10 text-purple-600',
  COLLEGUES: 'bg-cyan-500/10 text-cyan-600',
}

const statusIcons: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  CONFIRMED: { icon: CheckCircle2, color: 'text-green-500' },
  DECLINED: { icon: XCircle, color: 'text-red-500' },
  PENDING: { icon: HelpCircle, color: 'text-amber-500' },
}

export default function AccessLogManager({ token }: AccessLogManagerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<AccessStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [showSuspiciousIPs, setShowSuspiciousIPs] = useState(false)
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter) params.set('action', filter)
      params.set('limit', '200')

      const res = await fetch(`/api/guest/access-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401) {
        toast.error('Session expirée')
        return
      }
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

  const formatTimeAgo = (dateStr: string) => {
    const now = new Date()
    const date = new Date(dateStr)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'À l\'instant'
    if (diffMins < 60) return `Il y a ${diffMins}min`
    if (diffHours < 24) return `Il y a ${diffHours}h`
    return `Il y a ${diffDays}j`
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold gold-gradient">Centre de Sécurité</h2>
          <p className="text-sm text-muted-foreground font-display mt-1">
            Surveillance complète des accès invités et sécurité
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

      {/* ─── Primary Stats Grid ─── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
            className="glass-card p-4 rounded-xl text-center"
          >
            <Users className="size-5 text-gold mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.totalGuests}</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Total invités</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card p-4 rounded-xl text-center"
          >
            <Eye className="size-5 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.viewRate}%</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Taux consultation</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-4 rounded-xl text-center"
          >
            <CheckCircle2 className="size-5 text-emerald-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.confirmationRate}%</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Taux confirmation</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card p-4 rounded-xl text-center"
          >
            <LogIn className="size-5 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.totalLogins}</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Connexions</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-4 rounded-xl text-center relative"
          >
            <AlertTriangle className="size-5 text-red-500 mx-auto mb-2" />
            <p className="text-2xl font-bold font-serif">{stats.recentAccessDenied}</p>
            <p className="text-[10px] font-display tracking-wide uppercase text-muted-foreground">Accès refusés (24h)</p>
            {stats.recentAccessDenied > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </motion.div>
        </div>
      )}

      {/* ─── Secondary Stats ─── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-3 rounded-xl text-center">
            <Activity className="size-4 text-emerald-500 mx-auto mb-1.5" />
            <p className="text-lg font-bold font-serif">{stats.activeSessions}</p>
            <p className="text-[9px] font-display tracking-wide uppercase text-muted-foreground">Sessions actives</p>
          </div>
          <div className="glass-card p-3 rounded-xl text-center">
            <Search className="size-4 text-cyan-500 mx-auto mb-1.5" />
            <p className="text-lg font-bold font-serif">{stats.totalSearches}</p>
            <p className="text-[9px] font-display tracking-wide uppercase text-muted-foreground">Recherches nom</p>
          </div>
          <div className="glass-card p-3 rounded-xl text-center">
            <Fingerprint className="size-4 text-orange-500 mx-auto mb-1.5" />
            <p className="text-lg font-bold font-serif">{stats.totalFingerprintMismatches}</p>
            <p className="text-[9px] font-display tracking-wide uppercase text-muted-foreground">Empreintes suspectes</p>
          </div>
          <div className="glass-card p-3 rounded-xl text-center">
            <ShieldAlert className="size-4 text-red-600 mx-auto mb-1.5" />
            <p className="text-lg font-bold font-serif">{stats.totalBruteForce}</p>
            <p className="text-[9px] font-display tracking-wide uppercase text-muted-foreground">Attaques brute force</p>
          </div>
        </div>
      )}

      {/* ─── Category Breakdown ─── */}
      {stats && stats.categoryBreakdown.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <button
            onClick={() => setShowCategoryBreakdown(!showCategoryBreakdown)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-gold" />
              <span className="text-sm font-display font-bold tracking-wide uppercase">Répartition par catégorie</span>
            </div>
            {showCategoryBreakdown ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </button>
          {showCategoryBreakdown && (
            <div className="px-4 pb-4 space-y-2">
              {stats.categoryBreakdown.map((cat) => (
                <div key={cat.category} className="flex items-center gap-3">
                  <Badge className={`${categoryColors[cat.category] || 'bg-gray-500/10 text-gray-600'} text-xs font-display font-bold border-0 px-2 py-0.5`}>
                    {categoryLabels[cat.category] || cat.category}
                  </Badge>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold/40 rounded-full transition-all duration-500"
                      style={{ width: `${stats.totalGuests > 0 ? (cat.count / stats.totalGuests) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-display font-bold w-8 text-right">{cat.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Suspicious IPs ─── */}
      {stats && stats.suspiciousIPs.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <button
            onClick={() => setShowSuspiciousIPs(!showSuspiciousIPs)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-red-500" />
              <span className="text-sm font-display font-bold tracking-wide uppercase">IPs suspectes</span>
              <Badge className="bg-red-500/10 text-red-500 text-[10px] border-0 px-2 py-0">
                {stats.suspiciousIPs.length}
              </Badge>
            </div>
            {showSuspiciousIPs ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </button>
          {showSuspiciousIPs && (
            <div className="px-4 pb-4 space-y-2">
              {stats.suspiciousIPs.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                  <Server className="size-3.5 text-red-400" />
                  <span className="text-xs font-mono text-foreground flex-1">{entry.ip}</span>
                  <Badge className="bg-red-500/10 text-red-500 text-[10px] border-0 px-2 py-0">
                    {entry.count} tentative{entry.count > 1 ? 's' : ''}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Filter ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-display text-muted-foreground font-bold uppercase tracking-wide">Filtrer :</span>
        {['', 'LOGIN', 'SEARCH', 'SEARCH_BLOCKED', 'VIEW_INVITATION', 'ACCESS_DENIED', 'AUTH_FAILED', 'BRUTE_FORCE_BLOCKED', 'FINGERPRINT_MISMATCH', 'LOGOUT'].map((action) => (
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

      {/* ─── Logs List ─── */}
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
              const uaInfo = log.userAgent ? parseUserAgent(log.userAgent) : null
              const statusInfo = log.guest?.status ? statusIcons[log.guest.status] : null

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.5) }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
                >
                  {/* Action icon */}
                  <div className={`shrink-0 w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center mt-0.5`}>
                    <Icon className={`size-4 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-display font-semibold truncate">
                        {log.guest ? `${log.guest.firstName} ${log.guest.lastName}` : 'Inconnu'}
                      </span>
                      <Badge variant="outline" className={`${config.bg} ${config.color} border-0 text-[10px] font-display font-bold px-2 py-0`}>
                        {config.label}
                      </Badge>
                      {log.guest?.category && (
                        <Badge className={`${categoryColors[log.guest.category] || ''} text-[9px] font-display font-bold border-0 px-1.5 py-0`}>
                          {categoryLabels[log.guest.category] || log.guest.category}
                        </Badge>
                      )}
                      {statusInfo && log.guest && (
                        <statusInfo.icon className={`size-3 ${statusInfo.color}`} />
                      )}
                    </div>
                    {log.details && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{log.details}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {log.ipAddress && log.ipAddress !== 'unknown' && (
                        <span className="text-[10px] text-muted-foreground/50 font-mono flex items-center gap-1">
                          <Globe className="size-2.5" />
                          {log.ipAddress}
                        </span>
                      )}
                      {uaInfo && (
                        <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                          {uaInfo.isMobile ? <Smartphone className="size-2.5" /> : <Monitor className="size-2.5" />}
                          {uaInfo.browser} · {uaInfo.os}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-muted-foreground font-display">{formatTimeAgo(log.createdAt)}</p>
                    <p className="text-[9px] text-muted-foreground/40 font-display">{formatDate(log.createdAt)}</p>
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
