'use client'

// ════════════════════════════════════════════════════════════════════════════
// GovernancePanel — Super Admin Production Studio (Mission 6.0 P3.7).
// REAL governance panel: deployment approvals + canary + staging + diff
// viewer + logs viewer.
//
// The previous GovernancePanel was a platform health dashboard (KPIs + recent
// activity feed) — misnamed per audit-6.0-B. That content was renamed to
// PlatformHealthPanel.tsx. This file is the new GovernancePanel that actually
// governs deployments.
//
// Sections:
//   1. Deployment Approvals — list of PENDING deployments, Approve/Reject
//      buttons. Approve flips PENDING→BUILDING + runs the pipeline. Reject
//      flips PENDING→CANCELLED + audit log.
//   2. Canary Deploy — for the most recent DEPLOYED deployment, "Promote
//      canary" sets a canary flag in logsJson + simulates a 0→100% traffic
//      ramp over 1 hour. "Full promote" finalizes (clears canary flag).
//      "Rollback canary" rolls back to the previous DEPLOYED deployment.
//   3. Staging — list of STAGING deployments. "Promote to production" flips
//      Wedding.publishedConfigJson from the staging deployment's configJson.
//   4. Diff Viewer — pick two deployments (A vs B), compare their configJson
//      line-by-line (LCS-based diff).
//   5. Logs Viewer — pick a deployment, show its pipeline stages as a
//      timeline (status badge + startedAt + finishedAt + logs + error).
//
// Uses fetchWithAuth (auto-injects X-CSRF-Token for POST/PUT/DELETE/PATCH)
// for ALL API calls — same prop signature as the previous GovernancePanel so
// page.tsx (line 343) needs no changes.
//
// API routes consumed:
//   GET  /api/platform/deployments?status=PENDING|STAGING|DEPLOYED   (list)
//   GET  /api/platform/deployments/{id}                              (full row)
//   GET  /api/platform/deployments/{id}/config                       (P3.5)
//   POST /api/platform/deployments/{id}/approve                      (P3.7)
//   POST /api/platform/deployments/{id}/reject                       (P3.7)
//   POST /api/platform/deployments/{id}/canary                       (P3.7)
//   POST /api/platform/deployments/{id}/promote-staging              (P3.7)
//   POST /api/platform/deployments/{id}/rollback                     (P3.5)
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ShieldCheck,
  Check,
  X,
  GitCompare,
  FileText,
  Activity,
  Rocket,
  ArrowUpCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  History,
  Eye,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeploymentRow {
  id: string
  weddingId: string | null
  templateId: string | null
  version: string
  status: string
  url: string | null
  createdAt: string
  updatedAt: string
  wedding: { id: string; slug: string; coupleLabel: string } | null
  template: { id: string; name: string; slug: string } | null
}

/** Full deployment row (from /api/platform/deployments/{id}) — includes
 *  triggeredBy + logsJson + configJson metadata we need for governance. */
interface DeploymentDetail extends DeploymentRow {
  triggeredBy?: string | null
  stages?: PipelineStage[]
  logs?: string[]
  error?: string | null
}

interface PipelineStage {
  name: string
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'
  startedAt: string | null
  finishedAt: string | null
  logs: string[]
  error: string | null
}

/** Canary metadata extracted from logsJson.canary. */
interface CanaryMeta {
  isCanary?: boolean
  canaryStartedAt?: string
  canaryTrafficPct?: number
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  BUILDING: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  DEPLOYED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
  CANCELLED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  STAGING: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  CANARY: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
}

const STAGE_BADGE: Record<string, string> = {
  PENDING: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  RUNNING: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  SUCCESS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

// ─── Diff algorithm (LCS-based line diff) ─────────────────────────────────────

type DiffLine =
  | { type: 'same'; text: string }
  | { type: 'add'; text: string }
  | { type: 'del'; text: string }

function diffLines(a: string[], b: string[]): DiffLine[] {
  const m = a.length
  const n = b.length
  // dp[i][j] = LCS length of a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  const out: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.unshift({ type: 'same', text: a[i - 1] })
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.unshift({ type: 'del', text: a[i - 1] })
      i--
    } else {
      out.unshift({ type: 'add', text: b[j - 1] })
      j--
    }
  }
  while (i > 0) {
    out.unshift({ type: 'del', text: a[i - 1] })
    i--
  }
  while (j > 0) {
    out.unshift({ type: 'add', text: b[j - 1] })
    j--
  }
  return out
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return iso
  }
}

function safeJsonParseLocal<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** Compute the simulated canary traffic % based on canaryStartedAt.
 *  Linear ramp 0 → 100 over 1 hour. */
function canaryProgressPct(startedAt: string | null | undefined): number {
  if (!startedAt) return 0
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return 0
  const elapsed = Date.now() - start
  const pct = Math.floor((elapsed / (60 * 60 * 1000)) * 100)
  return Math.max(0, Math.min(100, pct))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GovernancePanel({
  fetchWithAuth,
}: {
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null>
}) {
  // ─── List state (all deployments, filtered client-side per section) ─────────
  const [allDeployments, setAllDeployments] = useState<DeploymentRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // ─── Section: Approvals (PENDING) ───────────────────────────────────────────
  const [approving, setApproving] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<DeploymentRow | null>(null)
  // Lazily-fetched detail (for triggeredBy) keyed by deployment id.
  const [detailCache, setDetailCache] = useState<Record<string, DeploymentDetail>>({})

  // ─── Section: Canary (most recent DEPLOYED) ─────────────────────────────────
  const [canaryBusy, setCanaryBusy] = useState<string | null>(null)
  const [canaryDetail, setCanaryDetail] = useState<DeploymentDetail | null>(null)
  const [canaryRollbackTarget, setCanaryRollbackTarget] = useState<DeploymentRow | null>(null)
  const [canaryPct, setCanaryPct] = useState(0)
  const canaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Section: Staging ───────────────────────────────────────────────────────
  const [promotingStaging, setPromotingStaging] = useState<string | null>(null)

  // ─── Section: Diff Viewer ───────────────────────────────────────────────────
  const [diffA, setDiffA] = useState<string>('')
  const [diffB, setDiffB] = useState<string>('')
  const [diffResult, setDiffResult] = useState<DiffLine[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffMeta, setDiffMeta] = useState<{
    aVersion: string
    bVersion: string
    same: boolean
  } | null>(null)

  // ─── Section: Logs Viewer ───────────────────────────────────────────────────
  const [logsId, setLogsId] = useState<string>('')
  const [logsDetail, setLogsDetail] = useState<DeploymentDetail | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)

  // ─── Load all deployments (filtered by status via the API where supported) ─
  const load = useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      // Fetch PENDING + STAGING + DEPLOYED in parallel. The list route accepts
      // a single status filter, so we fire 3 requests. limit=50 covers the
      // realistic backlog for each status.
      const [pendRes, stagRes, depRes] = await Promise.all([
        fetchWithAuth('/api/platform/deployments?status=PENDING&limit=50'),
        fetchWithAuth('/api/platform/deployments?status=STAGING&limit=50'),
        fetchWithAuth('/api/platform/deployments?status=DEPLOYED&limit=50'),
      ])
      const merged: DeploymentRow[] = []
      if (pendRes) {
        const j = await pendRes.json()
        if (Array.isArray(j.deployments)) merged.push(...j.deployments)
      }
      if (stagRes) {
        const j = await stagRes.json()
        if (Array.isArray(j.deployments)) merged.push(...j.deployments)
      }
      if (depRes) {
        const j = await depRes.json()
        if (Array.isArray(j.deployments)) merged.push(...j.deployments)
      }
      // Sort newest first (the API already sorts desc, but merging 3 lists
      // requires a re-sort to keep the combined view stable).
      merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      setAllDeployments(merged)
    } catch {
      setListError('Erreur lors du chargement des déploiements')
      toast.error('Erreur lors du chargement des déploiements')
    } finally {
      setLoadingList(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    load()
  }, [load])

  // ─── Poll every 5s when there are PENDING/BUILDING rows (so admin sees
  // approve/reject results + new staging/canary entries without manual refresh) ─
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const hasRunning = allDeployments.some((d) =>
      ['PENDING', 'BUILDING', 'STAGING'].includes(d.status),
    )
    if (hasRunning && pollRef.current === null) {
      pollRef.current = setInterval(() => {
        load()
      }, 5000)
    } else if (!hasRunning && pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current !== null && !hasRunning) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [allDeployments, load])

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (canaryTimerRef.current !== null) {
        clearInterval(canaryTimerRef.current)
        canaryTimerRef.current = null
      }
    }
  }, [])

  // ─── Lazy-load a deployment's full detail (triggeredBy + stages + canary meta) ─
  const loadDetail = useCallback(
    async (id: string): Promise<DeploymentDetail | null> => {
      if (detailCache[id]) return detailCache[id]
      const res = await fetchWithAuth(`/api/platform/deployments/${id}`)
      if (!res) return null
      const json = await res.json()
      const detail: DeploymentDetail = {
        ...(json.deployment as DeploymentRow),
        triggeredBy: (json.deployment as { triggeredBy?: string | null })?.triggeredBy ?? null,
        stages: (json.stages as PipelineStage[]) ?? [],
        logs: (json.logs as string[]) ?? [],
        error: (json.error as string | null) ?? null,
      }
      setDetailCache((prev) => ({ ...prev, [id]: detail }))
      return detail
    },
    [detailCache, fetchWithAuth],
  )

  // ─── Section: Approvals — handlers ──────────────────────────────────────────
  const pendingDeployments = useMemo(
    () => allDeployments.filter((d) => d.status === 'PENDING'),
    [allDeployments],
  )

  // Auto-load detail (for triggeredBy) for each PENDING row.
  useEffect(() => {
    pendingDeployments.forEach((d) => {
      if (!detailCache[d.id]) {
        loadDetail(d.id).catch(() => {
          /* toast already shown by fetchWithAuth on 401/403 */
        })
      }
    })
  }, [pendingDeployments, detailCache, loadDetail])

  const approve = async (d: DeploymentRow) => {
    setApproving(d.id)
    try {
      const res = await fetchWithAuth(`/api/platform/deployments/${d.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res) {
        // fetchWithAuth already toasted (401/403/network)
        return
      }
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || "Échec de l'approbation")
      }
      toast.success(
        json.status === 'DEPLOYED'
          ? `Déploiement approuvé — pipeline réussi (v${json.version})`
          : `Déploiement approuvé — pipeline terminé en échec (v${json.version})`,
      )
      // Bust the detail cache for this id (state changed) and reload.
      setDetailCache((prev) => {
        const next = { ...prev }
        delete next[d.id]
        return next
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'approbation")
    } finally {
      setApproving(null)
    }
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    const target = rejectTarget
    setRejecting(target.id)
    setRejectTarget(null)
    try {
      const res = await fetchWithAuth(`/api/platform/deployments/${target.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res) return
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Échec du rejet')
      }
      toast.success(`Déploiement ${target.version} rejeté (CANCELLED)`)
      setDetailCache((prev) => {
        const next = { ...prev }
        delete next[target.id]
        return next
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec du rejet')
    } finally {
      setRejecting(null)
    }
  }

  // ─── Section: Canary — handlers ─────────────────────────────────────────────
  const latestDeployed = useMemo(() => {
    const deployed = allDeployments.filter((d) => d.status === 'DEPLOYED')
    return deployed.length > 0 ? deployed[0] : null
  }, [allDeployments])

  // Fetch the latest DEPLOYED deployment's full detail (for canary metadata).
  useEffect(() => {
    if (!latestDeployed) {
      setCanaryDetail(null)
      return
    }
    let cancelled = false
    void (async () => {
      const detail = await loadDetail(latestDeployed.id)
      if (!cancelled && detail) {
        setCanaryDetail(detail)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [latestDeployed, loadDetail])

  // Extract canary metadata from canaryDetail's logsJson.
  const canaryMeta: CanaryMeta = useMemo(() => {
    if (!canaryDetail) return {}
    // The list endpoint doesn't return logsJson, but the detail endpoint
    // (which we use via loadDetail) doesn't either — it parses it into
    // stages + logs. To get the canary metadata, we'd need the raw logsJson.
    // Workaround: re-fetch with /config which returns the row's metadata.
    // For now, since /api/platform/deployments/{id} strips configJson AND
    // logsJson from the response, we cannot read canary metadata from the
    // existing endpoints. We'll re-fetch by hitting the deployments list
    // route which DOES include logsJson (see DEPLOYMENT_SELECT in list route).
    return {}
  }, [canaryDetail])

  // Actually, the deployments list route DOES select logsJson (verified
  // by reading deployments/route.ts). So we can read canary metadata from
  // the row that lives in allDeployments. Let me extract it from there.
  const canaryMetaFromList: CanaryMeta = useMemo(() => {
    if (!latestDeployed) return {}
    // The list route's DeploymentRow type doesn't include logsJson in the
    // TS interface, but the actual JSON response includes it. Cast to read.
    const row = latestDeployed as DeploymentRow & { logsJson?: string }
    if (!row.logsJson) return {}
    const parsed = safeJsonParseLocal<{
      canary?: CanaryMeta
      stages?: unknown
      logs?: string[]
    }>(row.logsJson, {})
    return parsed.canary ?? {}
  }, [latestDeployed])

  // Tick canary progress every 2s when a canary is active.
  useEffect(() => {
    if (canaryMetaFromList.isCanary && canaryMetaFromList.canaryStartedAt) {
      setCanaryPct(canaryProgressPct(canaryMetaFromList.canaryStartedAt))
      if (canaryTimerRef.current === null) {
        canaryTimerRef.current = setInterval(() => {
          setCanaryPct(canaryProgressPct(canaryMetaFromList.canaryStartedAt))
        }, 2000)
      }
    } else {
      if (canaryTimerRef.current !== null) {
        clearInterval(canaryTimerRef.current)
        canaryTimerRef.current = null
      }
      setCanaryPct(0)
    }
    return () => {
      if (canaryTimerRef.current !== null && !canaryMetaFromList.isCanary) {
        clearInterval(canaryTimerRef.current)
        canaryTimerRef.current = null
      }
    }
  }, [canaryMetaFromList.isCanary, canaryMetaFromList.canaryStartedAt])

  const callCanary = async (action: 'promote_canary' | 'full_promote' | 'rollback_canary') => {
    if (!latestDeployed) return
    setCanaryBusy(`${latestDeployed.id}:${action}`)
    try {
      const res = await fetchWithAuth(`/api/platform/deployments/${latestDeployed.id}/canary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res) return
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Échec de l\'action canary')
      }
      const msgMap: Record<string, string> = {
        promote_canary: 'Canary activé — ramp 0→100% sur 1h',
        full_promote: 'Canary finalisé — déploiement maintenant en production',
        rollback_canary: 'Canary annulé — rollback appliqué',
      }
      toast.success(msgMap[action] || 'Action canary effectuée')
      // Bust detail cache + reload list.
      setDetailCache((prev) => {
        const next = { ...prev }
        delete next[latestDeployed.id]
        return next
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de l\'action canary')
    } finally {
      setCanaryBusy(null)
    }
  }

  // ─── Section: Staging — handlers ────────────────────────────────────────────
  const stagingDeployments = useMemo(
    () => allDeployments.filter((d) => d.status === 'STAGING'),
    [allDeployments],
  )

  const promoteStaging = async (d: DeploymentRow) => {
    setPromotingStaging(d.id)
    try {
      const res = await fetchWithAuth(`/api/platform/deployments/${d.id}/promote-staging`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res) return
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Échec de la promotion staging → prod')
      }
      toast.success(`Déploiement ${d.version} promu en production`)
      setDetailCache((prev) => {
        const next = { ...prev }
        delete next[d.id]
        return next
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la promotion staging → prod')
    } finally {
      setPromotingStaging(null)
    }
  }

  // ─── Section: Diff Viewer — handlers ────────────────────────────────────────
  const diffOptions = useMemo(
    () =>
      allDeployments.map((d) => ({
        id: d.id,
        label: `${d.wedding?.coupleLabel ?? '—'} · v${d.version} · ${d.status}`,
      })),
    [allDeployments],
  )

  const runDiff = async () => {
    if (!diffA || !diffB) {
      toast.error('Sélectionnez deux déploiements à comparer')
      return
    }
    if (diffA === diffB) {
      toast.error('Sélectionnez deux déploiements DIFFÉRENTS')
      return
    }
    setDiffLoading(true)
    setDiffResult(null)
    setDiffMeta(null)
    try {
      const [resA, resB] = await Promise.all([
        fetchWithAuth(`/api/platform/deployments/${diffA}/config`),
        fetchWithAuth(`/api/platform/deployments/${diffB}/config`),
      ])
      if (!resA || !resB) return
      const jA = await resA.json()
      const jB = await resB.json()
      if (!resA.ok) throw new Error(jA?.error || 'Échec du chargement de la config A')
      if (!resB.ok) throw new Error(jB?.error || 'Échec du chargement de la config B')
      const txtA = JSON.stringify(jA.config ?? {}, null, 2)
      const txtB = JSON.stringify(jB.config ?? {}, null, 2)
      const linesA = txtA.split('\n')
      const linesB = txtB.split('\n')
      setDiffResult(diffLines(linesA, linesB))
      setDiffMeta({
        aVersion: jA.version ?? '?',
        bVersion: jB.version ?? '?',
        same: txtA === txtB,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la comparaison')
    } finally {
      setDiffLoading(false)
    }
  }

  // ─── Section: Logs Viewer — handlers ────────────────────────────────────────
  const loadLogs = useCallback(
    async (id: string) => {
      if (!id) {
        setLogsDetail(null)
        return
      }
      setLogsLoading(true)
      try {
        const res = await fetchWithAuth(`/api/platform/deployments/${id}`)
        if (!res) return
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json?.error || 'Échec du chargement des logs')
        }
        setLogsDetail({
          ...(json.deployment as DeploymentRow),
          triggeredBy: (json.deployment as { triggeredBy?: string | null })?.triggeredBy ?? null,
          stages: (json.stages as PipelineStage[]) ?? [],
          logs: (json.logs as string[]) ?? [],
          error: (json.error as string | null) ?? null,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Échec du chargement des logs')
        setLogsDetail(null)
      } finally {
        setLogsLoading(false)
      }
    },
    [fetchWithAuth],
  )

  useEffect(() => {
    if (logsId) {
      loadLogs(logsId)
    } else {
      setLogsDetail(null)
    }
  }, [logsId, loadLogs])

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gold" />
            Gouvernance
          </h2>
          <p className="text-xs text-muted-foreground">
            Approbations, canary, staging, diff viewer et logs viewer pour les déploiements.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loadingList}>
          <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {listError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {listError}
        </div>
      )}

      {/* ─── 1. Deployment Approvals ─────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-amber-400" />
            Approbations en attente
            {pendingDeployments.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] uppercase border-amber-500/30 bg-amber-500/15 text-amber-400">
                {pendingDeployments.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : pendingDeployments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              Aucun déploiement en attente d&apos;approbation.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mariage</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Déclenché par</TableHead>
                    <TableHead>Créé</TableHead>
                    <TableHead className="w-[200px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDeployments.map((d) => {
                    const detail = detailCache[d.id]
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          {d.wedding?.coupleLabel || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">{d.template?.name || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{d.version}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {detail?.triggeredBy ? (
                            <span className="font-mono">{detail.triggeredBy.slice(0, 8)}…</span>
                          ) : (
                            <Skeleton className="h-3 w-12" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(d.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 bg-emerald-600/90 hover:bg-emerald-600 text-white"
                              disabled={approving === d.id || rejecting === d.id}
                              onClick={() => approve(d)}
                              title="Approuver et lancer le pipeline"
                            >
                              {approving === d.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3 mr-1" />
                              )}
                              Approuver
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-red-500/40 text-red-400 hover:bg-red-500/10"
                              disabled={approving === d.id || rejecting === d.id}
                              onClick={() => setRejectTarget(d)}
                              title="Rejeter (CANCELLED)"
                            >
                              {rejecting === d.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <X className="w-3 h-3 mr-1" />
                              )}
                              Rejeter
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 2. Canary Deploy ────────────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Rocket className="w-4 h-4 text-fuchsia-400" />
            Déploiement Canary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!latestDeployed ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              Aucun déploiement DEPLOYED disponible pour un canary.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {latestDeployed.wedding?.coupleLabel || '—'}{' '}
                    <span className="font-mono text-xs text-muted-foreground">v{latestDeployed.version}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Créé {formatDateTime(latestDeployed.createdAt)} · {latestDeployed.template?.name || '—'}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase ${canaryMetaFromList.isCanary ? STATUS_BADGE.CANARY : STATUS_BADGE.DEPLOYED}`}
                >
                  {canaryMetaFromList.isCanary ? 'CANARY' : 'DEPLOYED'}
                </Badge>
              </div>

              {/* Canary progress bar */}
              {canaryMetaFromList.isCanary && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Trafic canary (simulé sur 1h)</span>
                    <span className="font-mono text-fuchsia-400">{canaryPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 to-fuchsia-300 transition-all duration-500"
                      style={{ width: `${canaryPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Débuté {formatDateTime(canaryMetaFromList.canaryStartedAt)}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!canaryMetaFromList.isCanary ? (
                  <Button
                    size="sm"
                    className="bg-fuchsia-600/90 hover:bg-fuchsia-600 text-white"
                    disabled={canaryBusy !== null}
                    onClick={() => callCanary('promote_canary')}
                  >
                    {canaryBusy === `${latestDeployed.id}:promote_canary` ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Rocket className="w-3 h-3 mr-1" />
                    )}
                    Promouvoir en canary
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      className="bg-emerald-600/90 hover:bg-emerald-600 text-white"
                      disabled={canaryBusy !== null || canaryPct < 100}
                      onClick={() => callCanary('full_promote')}
                      title={canaryPct < 100 ? 'Disponible quand le ramp atteint 100%' : 'Finaliser le canary → production 100%'}
                    >
                      {canaryBusy === `${latestDeployed.id}:full_promote` ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3 mr-1" />
                      )}
                      Full promote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                      disabled={canaryBusy !== null}
                      onClick={() => setCanaryRollbackTarget(latestDeployed)}
                    >
                      {canaryBusy === `${latestDeployed.id}:rollback_canary` ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <History className="w-3 h-3 mr-1" />
                      )}
                      Rollback canary
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── 3. Staging ───────────────────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-violet-400" />
            Staging
            {stagingDeployments.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] uppercase border-violet-500/30 bg-violet-500/15 text-violet-400">
                {stagingDeployments.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="space-y-2">
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : stagingDeployments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              Aucun déploiement en staging.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mariage</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Créé</TableHead>
                    <TableHead className="w-[200px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stagingDeployments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.wedding?.coupleLabel || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{d.version}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(d.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="bg-violet-600/90 hover:bg-violet-600 text-white"
                          disabled={promotingStaging === d.id}
                          onClick={() => promoteStaging(d)}
                        >
                          {promotingStaging === d.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <ArrowUpCircle className="w-3 h-3 mr-1" />
                          )}
                          Promouvoir en prod
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 4. Diff Viewer ───────────────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-sky-400" />
            Diff Viewer (comparaison de configs)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Déploiement A</Label>
              <Select value={diffA} onValueChange={setDiffA}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir A…" />
                </SelectTrigger>
                <SelectContent>
                  {diffOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Déploiement B</Label>
              <Select value={diffB} onValueChange={setDiffB}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir B…" />
                </SelectTrigger>
                <SelectContent>
                  {diffOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runDiff} disabled={diffLoading || !diffA || !diffB} className="bg-gold/90 hover:bg-gold text-black">
              {diffLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <GitCompare className="w-4 h-4 mr-1" />
              )}
              Comparer
            </Button>
          </div>

          {diffResult && diffMeta && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  A: <span className="font-mono text-gold">{diffMeta.aVersion}</span>
                  {' ↔ '}
                  B: <span className="font-mono text-gold">{diffMeta.bVersion}</span>
                </span>
                {diffMeta.same ? (
                  <Badge variant="outline" className="text-[10px] uppercase border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                    Identiques
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] uppercase border-sky-500/30 bg-sky-500/15 text-sky-400">
                    Différents
                  </Badge>
                )}
              </div>
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-white/10 bg-black/40 font-mono text-[11px]">
                {diffResult.map((line, idx) => {
                  const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
                  const cls =
                    line.type === 'add'
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : line.type === 'del'
                        ? 'bg-red-500/10 text-red-300'
                        : 'text-muted-foreground'
                  return (
                    <div key={idx} className={`flex ${cls}`}>
                      <span className="shrink-0 w-6 text-right pr-1 select-none opacity-50">{idx + 1}</span>
                      <span className="shrink-0 w-4 text-right pr-1 select-none opacity-70">{prefix}</span>
                      <span className="whitespace-pre-wrap break-all pl-1">{line.text || ' '}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 5. Logs Viewer ───────────────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            Logs Viewer (timeline du pipeline)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Déploiement</Label>
            <Select value={logsId} onValueChange={setLogsId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un déploiement…" />
              </SelectTrigger>
              <SelectContent>
                {diffOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!logsId && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Sélectionnez un déploiement pour afficher sa timeline de pipeline.
            </p>
          )}

          {logsId && logsLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

          {logsId && !logsLoading && logsDetail && (
            <div className="space-y-3">
              {/* Top-row summary */}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {logsDetail.wedding?.coupleLabel || '—'}{' '}
                    <span className="font-mono text-xs text-muted-foreground">v{logsDetail.version}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {logsDetail.template?.name || '—'} · déclenché par{' '}
                    <span className="font-mono">{logsDetail.triggeredBy?.slice(0, 8) ?? '—'}…</span>
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase ${STATUS_BADGE[logsDetail.status] || ''}`}
                >
                  {logsDetail.status}
                </Badge>
              </div>

              {/* Error banner if pipeline failed */}
              {logsDetail.error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Erreur pipeline:</p>
                    <pre className="whitespace-pre-wrap break-words mt-1">{logsDetail.error}</pre>
                  </div>
                </div>
              )}

              {/* Stages timeline */}
              {logsDetail.stages && logsDetail.stages.length > 0 ? (
                <div className="space-y-2">
                  {logsDetail.stages.map((stage) => {
                    const badge = STAGE_BADGE[stage.status] || STAGE_BADGE.PENDING
                    return (
                      <div
                        key={stage.name}
                        className="rounded-lg border border-white/10 bg-black/30 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {stage.status === 'SUCCESS' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : stage.status === 'FAILED' ? (
                              <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            ) : stage.status === 'RUNNING' ? (
                              <Loader2 className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-spin" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-zinc-500/40 shrink-0" />
                            )}
                            <span className="font-mono text-xs truncate">{stage.name}</span>
                          </div>
                          <Badge variant="outline" className={`text-[9px] uppercase ${badge}`}>
                            {stage.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] text-muted-foreground">
                          <span>Début: {formatDateTime(stage.startedAt)}</span>
                          <span>Fin: {formatDateTime(stage.finishedAt)}</span>
                        </div>
                        {stage.error && (
                          <pre className="mt-2 p-2 rounded bg-red-500/10 text-[10px] text-red-300 whitespace-pre-wrap break-words">
                            {stage.error}
                          </pre>
                        )}
                        {stage.logs && stage.logs.length > 0 && (
                          <pre className="mt-2 p-2 rounded bg-black/40 text-[10px] text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                            {stage.logs.join('\n')}
                          </pre>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground py-4">
                  Aucune étape de pipeline enregistrée pour ce déploiement.
                </p>
              )}

              {/* Aggregated logs (from logsJson.logs — post-rollback deployments use this) */}
              {logsDetail.logs && logsDetail.logs.length > 0 && (
                <details className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Logs agrégés ({logsDetail.logs.length} lignes)
                  </summary>
                  <pre className="mt-2 p-2 rounded bg-black/40 text-[10px] text-muted-foreground whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                    {logsDetail.logs.join('\n')}
                  </pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Reject Confirmation Dialog ───────────────────────────────────────── */}
      <Dialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeter le déploiement ?</DialogTitle>
            <DialogDescription>
              Le déploiement{' '}
              <span className="font-mono text-gold">
                v{rejectTarget?.version}
              </span>{' '}
              ({rejectTarget?.wedding?.coupleLabel || '—'}) sera marqué CANCELLED. Le pipeline ne sera PAS lancé. Action irreversible (audit-loggé).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Annuler
            </Button>
            <Button
              className="bg-red-600/90 hover:bg-red-600 text-white"
              disabled={rejecting !== null}
              onClick={confirmReject}
            >
              {rejecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Canary Rollback Confirmation Dialog ──────────────────────────────── */}
      <Dialog
        open={canaryRollbackTarget !== null}
        onOpenChange={(open) => !open && setCanaryRollbackTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rollback du canary ?</DialogTitle>
            <DialogDescription>
              Le canary sera annulé et le wedding sera restauré au précédent déploiement DEPLOYED. Un nouveau déploiement (version <span className="font-mono">rollback-…</span>) sera créé via le mécanisme de rollback P3.5.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCanaryRollbackTarget(null)}>
              Annuler
            </Button>
            <Button
              className="bg-red-600/90 hover:bg-red-600 text-white"
              disabled={canaryBusy !== null}
              onClick={() => {
                setCanaryRollbackTarget(null)
                void callCanary('rollback_canary')
              }}
            >
              {canaryBusy?.endsWith(':rollback_canary') ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <History className="w-4 h-4 mr-1" />
              )}
              Confirmer le rollback canary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
