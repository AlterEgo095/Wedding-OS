'use client'

// ════════════════════════════════════════════════════════════════════════════
// PlatformHealthPanel — Super Admin Production Studio (Mission 6.0 P3.7).
// Renamed from GovernancePanel (audit-6.0-B): the previous "GovernancePanel"
// was a platform health dashboard (KPIs + recent activity), not a real
// governance panel. The real GovernancePanel now lives in GovernancePanel.tsx
// (deployment approvals + canary + staging + diff viewer + logs viewer).
//
// This panel aggregates data from:
//   - /api/platform/dashboard  (business KPIs)
//   - /api/platform/ops        (security events + DB size)
//   - /api/platform/deployments (deployment counts)
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Heart,
  Users,
  Cloud,
  Activity,
  ShieldCheck,
  Database,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'

interface DashboardData {
  weddings: { total: number; byStatus: Record<string, number> }
  users: { total: number; byRole: Record<string, number>; platformAdmins: number }
  guests: { total: number; last7days: number }
  recentActivity: Array<{
    id: string
    action: string
    details: string | null
    createdAt: string
    user: { name: string; email: string; role?: string } | null
  }>
}

interface OpsData {
  securityEvents: { last24h: number; last7d: number; byAction: Record<string, number> }
  auditLogTotal: number
  dbFileSizeBytes: number
}

interface DeploymentsData {
  total: number
  failed?: number
  succeeded?: number
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return iso
  }
}

export function PlatformHealthPanel({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [ops, setOps] = useState<OpsData | null>(null)
  const [deploys, setDeploys] = useState<DeploymentsData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dashRes, opsRes, depRes] = await Promise.all([
        fetchWithAuth('/api/platform/dashboard'),
        fetchWithAuth('/api/platform/ops'),
        // MISSION-5.9.0 Phase 0.10: fetch last 100 deployments (was limit=1) to compute real error rate.
        fetchWithAuth('/api/platform/deployments?limit=100'),
      ])
      if (dashRes) {
        const json = await dashRes.json()
        setDashboard(json as DashboardData)
      }
      if (opsRes) {
        const json = await opsRes.json()
        setOps(json as OpsData)
      }
      if (depRes) {
        const json = await depRes.json()
        // MISSION-5.9.0 Phase 0.10: capture deployment status breakdown to compute real error rate.
        // Previously only json.total was destructured, leaving errorRate stuck at 0.
        const deployments = Array.isArray(json.deployments) ? json.deployments : []
        const failed = deployments.filter((d: { status?: string }) => d.status === 'FAILED').length
        const succeeded = deployments.filter((d: { status?: string }) => d.status === 'SUCCESS').length
        setDeploys({ total: json.total ?? deployments.length ?? 0, failed, succeeded })
      }
    } catch {
      toast.error('Erreur lors du chargement de la santé de la plateforme')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => { load() }, [load])

  const activeWeddings = dashboard?.weddings.byStatus?.PUBLISHED ?? 0
  const totalGuests = dashboard?.guests.total ?? 0
  const securityEvents24h = ops?.securityEvents.last24h ?? 0
  const dbSize = ops?.dbFileSizeBytes ?? 0
  const totalDeploys = deploys?.total ?? 0
  const auditTotal = ops?.auditLogTotal ?? 0

  // MISSION-5.9.0 Phase 0.10: real error rate from deployment status counts.
  // Previously this was `totalDeploys > 0 ? 0 : 0` — a stuck-at-zero ternary
  // that always displayed 0% regardless of actual FAILED deployments.
  const failedDeploys = deploys?.failed ?? 0
  const errorRate = totalDeploys > 0 ? (failedDeploys / totalDeploys) * 100 : 0

  const kpiCards = [
    {
      title: 'Mariages actifs',
      value: activeWeddings,
      subtitle: `${dashboard?.weddings.total ?? 0} total`,
      icon: Heart,
      gradient: 'from-gold/20 to-gold-light/10',
      iconClass: 'text-gold',
    },
    {
      title: 'Invités',
      value: totalGuests,
      subtitle: `${dashboard?.guests.last7days ?? 0} 7j`,
      icon: Users,
      gradient: 'from-violet-500/20 to-violet-600/10',
      iconClass: 'text-violet-400',
    },
    {
      title: 'Déploiements',
      value: totalDeploys,
      subtitle: 'tous statuts',
      icon: Cloud,
      gradient: 'from-sky-500/20 to-sky-600/10',
      iconClass: 'text-sky-400',
    },
    {
      title: "Taux d'erreur",
      value: `${errorRate}%`,
      subtitle: 'déploiements FAILED',
      icon: AlertCircle,
      gradient: 'from-red-500/20 to-red-600/10',
      iconClass: 'text-red-400',
    },
    {
      title: 'Événements sécurité',
      value: securityEvents24h,
      subtitle: '24 dernières heures',
      icon: ShieldCheck,
      gradient: 'from-amber-500/20 to-amber-600/10',
      iconClass: 'text-amber-400',
    },
    {
      title: 'Taille DB',
      value: formatBytes(dbSize),
      subtitle: `${auditTotal} logs audit`,
      icon: Database,
      gradient: 'from-emerald-500/20 to-emerald-600/10',
      iconClass: 'text-emerald-400',
    },
  ]

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-gold" />
            Santé de la plateforme
          </h2>
          <p className="text-xs text-muted-foreground">
            Vue agrégée de la santé de la plateforme (mariages, invités, déploiements, sécurité, DB).
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
      )}

      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-gold" />
            Activité récente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard?.recentActivity && dashboard.recentActivity.length > 0 ? (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
              {dashboard.recentActivity.slice(0, 20).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-gold mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium text-gold">{log.user?.name || 'Système'}</span>
                      {' — '}
                      <span className="text-muted-foreground">
                        {log.action.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </p>
                    {log.details && (
                      <p className="text-xs text-muted-foreground truncate">{log.details}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucune activité récente.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
