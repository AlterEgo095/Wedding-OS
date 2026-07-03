'use client'

/**
 * Observability Section — Phase 1.
 *
 * Live system-health console for the platform admin. Polls the read-only
 * GET /api/platform/health endpoint every 30s and renders:
 *
 *   1. Alert banner — red if any `critical` alert, amber if any `warn`,
 *      green "Système nominal" otherwise.
 *   2. KPI row (4 StatCards): Uptime, CPU %, RAM %, Storage uploads bytes.
 *   3. Detail grid: Node.js, CPU, Memory, Storage, Database, Services —
 *      each card surfaces a focused slice of the SystemHealth payload.
 *
 * Auto-refresh is implemented with a 30s `setInterval` + a manual "Refresh"
 * button. A pulsing green dot indicates the live loop is running.
 *
 * Auth: handled at the API layer (PLATFORM_ADMIN).
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Database as DatabaseIcon,
  Server,
  Clock,
  Gauge,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Box,
  Terminal,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import type { SystemHealth } from '../../_lib/types'
import { usePlatformFetch } from '../../_lib/auth'
import { formatBytes, formatUptime, formatDateTime } from '../../_lib/ui'
import { StatCard, SectionHeader } from '../widgets/StatCard'

const REFRESH_INTERVAL_MS = 30 * 1000

interface DetailRow {
  label: string
  value: string | number
  mono?: boolean
}

function DetailRowItem({ label, value, mono }: DetailRow) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-xs font-medium text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function DetailCard({
  icon: Icon,
  title,
  rows,
  loading,
  delay = 0,
}: {
  icon: typeof Cpu
  title: string
  rows: DetailRow[]
  loading: boolean
  delay?: number
}) {
  return (
    <Card
      className="bg-white/[0.02] border-white/10"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="w-4 h-4 text-gold" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: Math.max(3, rows.length || 3) }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <DetailRowItem key={r.label} {...r} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ObservabilitySection() {
  const { fetchWithAuth } = usePlatformFetch()
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const fetchInFlight = useRef(false)

  const load = useCallback(async () => {
    // Guard against overlapping fetches (interval fires while manual refresh
    // is still in flight).
    if (fetchInFlight.current) return
    fetchInFlight.current = true
    setRefreshing(true)
    const res = await fetchWithAuth('/api/platform/health')
    if (!res) {
      // 401/403 already handled by usePlatformFetch — stop the loop.
      fetchInFlight.current = false
      setRefreshing(false)
      return
    }
    try {
      const json = (await res.json()) as SystemHealth
      setHealth(json)
      setLastUpdated(new Date())
      setError(null)
    } catch {
      setError('Réponse invalide du serveur')
    } finally {
      setLoading(false)
      setRefreshing(false)
      fetchInFlight.current = false
    }
  }, [fetchWithAuth])

  // Initial fetch + 30s polling loop.
  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [load])

  // ── Alerts ─────────────────────────────────────────────────────────────
  const criticalAlerts = health?.alerts.filter((a) => a.level === 'critical') ?? []
  const warnAlerts = health?.alerts.filter((a) => a.level === 'warn') ?? []
  const hasCritical = criticalAlerts.length > 0
  const hasWarn = !hasCritical && warnAlerts.length > 0

  const alertBannerClass = hasCritical
    ? 'border-red-500/40 bg-red-500/10 text-red-300'
    : hasWarn
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'

  const alertIcon = hasCritical ? AlertTriangle : hasWarn ? AlertTriangle : ShieldCheck
  const AlertIcon = alertIcon
  const alertTitle = hasCritical
    ? 'Système critique'
    : hasWarn
      ? 'Avertissements système'
      : 'Système nominal'
  const alertDescription = hasCritical
    ? `${criticalAlerts.length} alerte(s) critique(s) — intervention requise.`
    : hasWarn
      ? `${warnAlerts.length} avertissement(s) — surveiller l'évolution.`
      : 'Tous les indicateurs sont dans les normes.'

  // ── KPI values ─────────────────────────────────────────────────────────
  const uptimeStr = health ? formatUptime(health.uptimeSeconds) : '—'
  const cpuPct = health?.cpu.usagePercent ?? 0
  const ramPct = health?.memory.systemUsedPercent ?? 0
  const uploadsBytes = health?.storage.uploadsBytes ?? 0
  const uploadsFiles = health?.storage.uploadsFiles ?? 0

  // ── Detail rows ────────────────────────────────────────────────────────
  const nodeRows: DetailRow[] = health
    ? [
        { label: 'Version', value: health.node.version, mono: true },
        { label: 'Plateforme', value: health.node.platform, mono: true },
        { label: 'Architecture', value: health.node.arch, mono: true },
        { label: 'Uptime', value: uptimeStr },
      ]
    : []

  const cpuRows: DetailRow[] = health
    ? [
        { label: 'Cœurs', value: health.cpu.cores },
        {
          label: 'Charge 1m',
          value: health.cpu.loadAverage[0]?.toFixed(2) ?? '0.00',
          mono: true,
        },
        {
          label: 'Charge 5m',
          value: health.cpu.loadAverage[1]?.toFixed(2) ?? '0.00',
          mono: true,
        },
        {
          label: 'Charge 15m',
          value: health.cpu.loadAverage[2]?.toFixed(2) ?? '0.00',
          mono: true,
        },
        { label: 'Usage %', value: `${cpuPct}%` },
      ]
    : []

  const memRows: DetailRow[] = health
    ? [
        { label: 'RSS', value: `${health.memory.rssMb} MB`, mono: true },
        {
          label: 'Tas utilisé',
          value: `${health.memory.heapUsedMb} MB`,
          mono: true,
        },
        {
          label: 'Tas alloué',
          value: `${health.memory.heapTotalMb} MB`,
          mono: true,
        },
        { label: 'Externe', value: `${health.memory.externalMb} MB`, mono: true },
        {
          label: 'Array buffers',
          value: `${health.memory.arrayBuffersMb} MB`,
          mono: true,
        },
        {
          label: 'Système total',
          value: `${health.memory.systemTotalMb} MB`,
          mono: true,
        },
        {
          label: 'Système libre',
          value: `${health.memory.systemFreeMb} MB`,
          mono: true,
        },
        { label: 'Système utilisé %', value: `${health.memory.systemUsedPercent}%` },
      ]
    : []

  const storageRows: DetailRow[] = health
    ? [
        { label: 'Chemin uploads', value: health.storage.uploadsPath, mono: true },
        { label: 'Taille uploads', value: formatBytes(health.storage.uploadsBytes), mono: true },
        { label: 'Fichiers', value: uploadsFiles },
        { label: 'Chemin DB', value: health.storage.dbPath, mono: true },
        { label: 'Taille DB', value: formatBytes(health.storage.dbBytes), mono: true },
      ]
    : []

  const dbRows: DetailRow[] = health
    ? [
        { label: 'Provider', value: health.database.provider, mono: true },
        { label: 'Mariages', value: health.database.weddings },
        { label: 'Utilisateurs', value: health.database.users },
        { label: 'Invités', value: health.database.guests },
        { label: 'Logs d\'audit', value: health.database.auditLogs },
        {
          label: 'Dernier audit',
          value: health.database.lastAuditAt
            ? formatDateTime(health.database.lastAuditAt)
            : '—',
        },
      ]
    : []

  const servicesRows: DetailRow[] = health
    ? [
        {
          label: 'Dev server',
          value: health.services.devServer ? 'Actif' : 'Inactif',
        },
        {
          label: 'Docker',
          value: health.services.docker ? 'Détecté' : 'Non détecté',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Observabilité"
        description="Santé du système en temps réel"
        icon={Activity}
        actions={
          <div className="flex items-center gap-2">
            {/* Live pulse indicator */}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live · 30s
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              disabled={refreshing}
              className="h-7 gap-1.5 text-[11px] border-white/15 hover:border-gold/40"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Rafraîchir
            </Button>
          </div>
        }
      />

      {/* ── Alert banner ────────────────────────────────────────────────── */}
      <div
        className={`rounded-xl border p-4 flex items-start gap-3 ${alertBannerClass}`}
        role="alert"
      >
        <AlertIcon className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{alertTitle}</p>
          <p className="text-xs opacity-90 mt-0.5">{alertDescription}</p>
          {health && (hasCritical || hasWarn) && (
            <ul className="mt-2 space-y-1">
              {[...criticalAlerts, ...warnAlerts].map((a, i) => (
                <li key={`${a.code}-${i}`} className="text-[11px] flex items-start gap-1.5">
                  <span className="opacity-60">›</span>
                  <span className="font-mono opacity-90">{a.code}:</span>
                  <span className="opacity-90">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {lastUpdated && (
          <span className="text-[10px] opacity-70 shrink-0 hidden sm:block">
            {formatDateTime(lastUpdated.toISOString())}
          </span>
        )}
      </div>

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Uptime"
          value={uptimeStr}
          icon={Clock}
          tone="emerald"
          loading={loading}
          subtitle={error ? 'Indisponible' : undefined}
        />
        <StatCard
          label="CPU"
          value={`${cpuPct}%`}
          icon={Cpu}
          tone={cpuPct > 75 ? 'amber' : 'gold'}
          loading={loading}
          subtitle={error ? 'Indisponible' : undefined}
        />
        <StatCard
          label="RAM"
          value={`${ramPct}%`}
          icon={MemoryStick}
          tone={ramPct > 75 ? 'amber' : 'sky'}
          loading={loading}
          subtitle={error ? 'Indisponible' : undefined}
        />
        <StatCard
          label="Stockage"
          value={formatBytes(uploadsBytes)}
          icon={HardDrive}
          tone="violet"
          loading={loading}
          subtitle={error ? 'Indisponible' : `${uploadsFiles} fichiers`}
        />
      </div>

      {/* ── Detail grid ─────────────────────────────────────────────────── */}
      {error ? (
        <Card className="bg-white/[0.02] border-red-500/30">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-300">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              className="mt-3 h-8 gap-1.5 border-white/15"
            >
              <RefreshCw className="w-3 h-3" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DetailCard
            icon={Terminal}
            title="Node.js"
            rows={nodeRows}
            loading={loading}
            delay={0}
          />
          <DetailCard
            icon={Cpu}
            title="CPU"
            rows={cpuRows}
            loading={loading}
            delay={50}
          />
          <DetailCard
            icon={MemoryStick}
            title="Mémoire"
            rows={memRows}
            loading={loading}
            delay={100}
          />
          <DetailCard
            icon={HardDrive}
            title="Stockage"
            rows={storageRows}
            loading={loading}
            delay={150}
          />
          <DetailCard
            icon={DatabaseIcon}
            title="Base de données"
            rows={dbRows}
            loading={loading}
            delay={200}
          />
          <DetailCard
            icon={Server}
            title="Services"
            rows={servicesRows}
            loading={loading}
            delay={250}
          />
        </div>
      )}

      {/* ── Footer: timestamp + provider pills ──────────────────────────── */}
      {!loading && health && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] text-muted-foreground pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3 h-3" />
            <span>Snapshot · {formatDateTime(health.timestamp)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box className="w-3 h-3" />
            <Badge
              variant="outline"
              className={`text-[9px] uppercase tracking-wide ${
                health.services.devServer
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
              }`}
            >
              {health.services.devServer ? 'Dev server actif' : 'Prod mode'}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[9px] uppercase tracking-wide ${
                health.services.docker
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
              }`}
            >
              {health.services.docker ? 'Docker détecté' : 'Hôte natif'}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}
