'use client'

// ════════════════════════════════════════════════════════════════════════════
// DeploymentsPanel — Super Admin Production Studio (CONS-3-SUPER-ADMIN).
// Updated CONS-6-PIPELINE: trigger new deployments + retry failed + poll.
// Updated Mission 6.0 P3.5: rollback to a previous deployment + view config.
// Lists all wedding frontend deployments across all weddings.
// Uses /api/platform/deployments + /api/platform/{weddings,templates,themes,collections}.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw, ExternalLink, Loader2, Cloud, Plus, Rocket, History, Eye } from 'lucide-react'

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

interface WeddingOption {
  id: string
  slug: string
  coupleLabel: string
  status: string
}
interface TemplateOption {
  id: string
  name: string
  slug: string
  status: string
  version: number
}
interface ThemeOption {
  id: string
  name: string
  slug: string
  status: string
  isBuiltIn: boolean
}
interface CollectionOption {
  id: string
  slug: string
  name: string
  version: string
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  BUILDING: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  DEPLOYED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

// Deployment statuses that count as "running" (polling triggers when any
// row matches). PENDING = created but not yet started; BUILDING = pipeline
// executing. Once a row reaches DEPLOYED or FAILED, polling pauses.
const RUNNING_STATUSES = new Set(['PENDING', 'BUILDING'])

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return iso
  }
}

export function DeploymentsPanel({ csrfToken: _csrfToken }: { csrfToken: string }) {
  const [deployments, setDeployments] = useState<DeploymentRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [retrying, setRetrying] = useState<string | null>(null)

  // P3.5 — Rollback state
  const [rollbackTarget, setRollbackTarget] = useState<DeploymentRow | null>(null)
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  // P3.5 — View config state
  const [viewConfigFor, setViewConfigFor] = useState<DeploymentRow | null>(null)
  const [viewConfigData, setViewConfigData] = useState<string>('')
  const [loadingConfig, setLoadingConfig] = useState(false)

  // New Deployment dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [weddings, setWeddings] = useState<WeddingOption[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [themes, setThemes] = useState<ThemeOption[]>([])
  const [collections, setCollections] = useState<CollectionOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [selectedWedding, setSelectedWedding] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedTheme, setSelectedTheme] = useState<string>('')
  const [selectedCollection, setSelectedCollection] = useState<string>('none')
  const [deploying, setDeploying] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: '1', limit: '50', status: statusFilter })
    try {
      const res = await fetch(`/api/platform/deployments?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setDeployments(json.deployments || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des déploiements')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  // ─── Poll every 3s when any deployment is RUNNING (PENDING/BUILDING) ───────
  useEffect(() => {
    const hasRunning = deployments.some((d) => RUNNING_STATUSES.has(d.status))
    if (hasRunning && pollRef.current === null) {
      pollRef.current = setInterval(() => { load() }, 3000)
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
  }, [deployments, load])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [])

  // ─── Load dropdown options when the dialog opens ───────────────────────────
  const loadOptions = useCallback(async () => {
    setOptionsLoading(true)
    try {
      const [wRes, tRes, thRes, cRes] = await Promise.all([
        fetch('/api/platform/weddings?page=1&limit=200', { credentials: 'include' }),
        fetch('/api/platform/templates?page=1&limit=200', { credentials: 'include' }),
        fetch('/api/platform/themes?page=1&limit=200', { credentials: 'include' }),
        fetch('/api/platform/collections', { credentials: 'include' }),
      ])
      const wJson = wRes.ok ? await wRes.json() : { weddings: [] }
      const tJson = tRes.ok ? await tRes.json() : { templates: [] }
      const thJson = thRes.ok ? await thRes.json() : { themes: [] }
      const cJson = cRes.ok ? await cRes.json() : { collections: [] }
      setWeddings(wJson.weddings || [])
      // Only show PUBLISHED templates (ARCHIVED/DRAFT shouldn't be deployed)
      setTemplates((tJson.templates || []).filter((t: TemplateOption) => t.status === 'PUBLISHED'))
      // Only show PUBLISHED themes
      setThemes((thJson.themes || []).filter((t: ThemeOption) => t.status === 'PUBLISHED'))
      setCollections(cJson.collections || [])
    } catch {
      toast.error('Erreur lors du chargement des options')
    } finally {
      setOptionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (dialogOpen) {
      loadOptions()
    }
  }, [dialogOpen, loadOptions])

  // ─── Trigger a new deployment ─────────────────────────────────────────────
  const triggerDeploy = async () => {
    if (!selectedWedding || !selectedTemplate || !selectedTheme) {
      toast.error('Sélectionnez un mariage, un template et un thème')
      return
    }
    setDeploying(true)
    try {
      const body: Record<string, unknown> = {
        weddingId: selectedWedding,
        templateId: selectedTemplate,
        themeId: selectedTheme,
      }
      if (selectedCollection !== 'none') {
        body.collectionId = selectedCollection
      }
      const res = await fetch('/api/platform/deployments/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Échec du déploiement')
      }
      toast.success(
        json.status === 'DEPLOYED'
          ? `Déploiement réussi (v${json.version})`
          : `Pipeline terminé en échec (v${json.version}) — voir logs`
      )
      setDialogOpen(false)
      // Reset form
      setSelectedWedding('')
      setSelectedTemplate('')
      setSelectedTheme('')
      setSelectedCollection('none')
      // Reload list (will start polling because new row is PENDING→BUILDING)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec du déploiement')
    } finally {
      setDeploying(false)
    }
  }

  const retry = async (d: DeploymentRow) => {
    setRetrying(d.id)
    try {
      const res = await fetch(`/api/platform/deployments/${d.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Échec du retry')
      }
      toast.success(
        json.status === 'DEPLOYED'
          ? `Retry réussi (v${json.version})`
          : `Retry terminé en échec (v${json.version}) — voir logs`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec du retry')
    } finally {
      setRetrying(null)
    }
  }

  // ─── P3.5 — Rollback to a previous DEPLOYED deployment ────────────────────
  // confirm → POST /api/platform/deployments/{id}/rollback → refresh list.
  const confirmRollback = async () => {
    if (!rollbackTarget) return
    const target = rollbackTarget
    setRollingBack(target.id)
    try {
      const res = await fetch(`/api/platform/deployments/${target.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Échec du rollback')
      }
      toast.success(
        `Rollback réussi — wedding restauré à v${target.version} (nouveau déploiement v${json.version})`
      )
      setRollbackTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec du rollback')
    } finally {
      setRollingBack(null)
    }
  }

  // ─── P3.5 — Open the View-config modal for a deployment ───────────────────
  // Fetches the full PublishedConfig snapshot from /api/platform/deployments/{id}/config
  // and displays it pretty-printed in a modal.
  const openConfigView = async (d: DeploymentRow) => {
    setViewConfigFor(d)
    setViewConfigData('')
    setLoadingConfig(true)
    try {
      const res = await fetch(`/api/platform/deployments/${d.id}/config`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Échec du chargement de la config')
      }
      if (!json.hasConfig || json.config === null) {
        setViewConfigData('// Aucun configJson enregistré pour ce déploiement.\n// (Déploiement pré-P0.6 ou échoué avant l\'étape publishFrontend.)')
      } else {
        setViewConfigData(JSON.stringify(json.config, null, 2))
      }
    } catch (e) {
      setViewConfigData(`// Erreur: ${e instanceof Error ? e.message : 'échec inconnu'}`)
      toast.error(e instanceof Error ? e.message : 'Échec du chargement de la config')
    } finally {
      setLoadingConfig(false)
    }
  }

  const hasRunning = deployments.some((d) => RUNNING_STATUSES.has(d.status))

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Cloud className="w-5 h-5 text-gold" />
            Déploiements
            {hasRunning && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-sky-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Polling 3s
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Suivi des déploiements de frontends de mariage (PENDING / BUILDING / DEPLOYED / FAILED).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setDialogOpen(true)} size="sm" className="bg-gold/90 hover:bg-gold text-black">
            <Plus className="w-4 h-4 mr-1" />
            Nouveau déploiement
          </Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="BUILDING">En construction</SelectItem>
              <SelectItem value="DEPLOYED">Déployé</SelectItem>
              <SelectItem value="FAILED">Échoué</SelectItem>
            </SelectContent>
          </Select>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : deployments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucun déploiement enregistré.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mariage</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="w-[280px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.wedding?.coupleLabel || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">{d.template?.name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{d.version}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_BADGE[d.status] || ''}`}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(d.createdAt)}
                      </TableCell>
                      <TableCell>
                        {d.url ? (
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Ouvrir
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => retry(d)}
                            disabled={retrying === d.id || d.status === 'DEPLOYED'}
                            title={d.status === 'FAILED' ? 'Relancer le pipeline' : 'Disponible uniquement pour les déploiements échoués'}
                          >
                            {retrying === d.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                            Retry
                          </Button>
                          {d.status === 'DEPLOYED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => setRollbackTarget(d)}
                              disabled={rollingBack === d.id}
                              title="Restaurer la config de ce déploiement (crée un nouveau déploiement rollback-*)"
                            >
                              {rollingBack === d.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <History className="w-3 h-3 mr-1" />
                              )}
                              Rollback
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => openConfigView(d)}
                            title="Voir le PublishedConfig JSON"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Config
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{total} déploiement(s)</p>
        </CardContent>
      </Card>

      {/* ─── New Deployment Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-gold" />
              Nouveau déploiement
            </DialogTitle>
            <DialogDescription>
              Déclenche le pipeline de déploiement frontend (9 étapes). Seul un Super Admin peut déployer.
            </DialogDescription>
          </DialogHeader>

          {optionsLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="d-wedding">Mariage *</Label>
                <Select value={selectedWedding} onValueChange={setSelectedWedding}>
                  <SelectTrigger id="d-wedding">
                    <SelectValue placeholder="Sélectionnez un mariage" />
                  </SelectTrigger>
                  <SelectContent>
                    {weddings.length === 0 ? (
                      <SelectItem value="__none" disabled>Aucun mariage</SelectItem>
                    ) : (
                      weddings.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.coupleLabel || w.slug} ({w.status})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="d-template">Template *</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger id="d-template">
                    <SelectValue placeholder="Sélectionnez un template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      <SelectItem value="__none" disabled>Aucun template PUBLISHED</SelectItem>
                    ) : (
                      templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} (v{t.version})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="d-theme">Thème *</Label>
                <Select value={selectedTheme} onValueChange={setSelectedTheme}>
                  <SelectTrigger id="d-theme">
                    <SelectValue placeholder="Sélectionnez un thème" />
                  </SelectTrigger>
                  <SelectContent>
                    {themes.length === 0 ? (
                      <SelectItem value="__none" disabled>Aucun thème PUBLISHED</SelectItem>
                    ) : (
                      themes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} {t.isBuiltIn ? '(built-in)' : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="d-collection">Collection (optionnel)</Label>
                <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                  <SelectTrigger id="d-collection">
                    <SelectValue placeholder="Aucune collection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucune —</SelectItem>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} (v{c.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={deploying}>
              Annuler
            </Button>
            <Button
              onClick={triggerDeploy}
              disabled={deploying || optionsLoading || !selectedWedding || !selectedTemplate || !selectedTheme}
              className="bg-gold/90 hover:bg-gold text-black"
            >
              {deploying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Déploiement…
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Déployer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── P3.5 — Rollback Confirmation Dialog ──────────────────────────── */}
      <Dialog open={rollbackTarget !== null && rollingBack === null} onOpenChange={(o) => { if (!o) setRollbackTarget(null) }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              Confirmer le rollback
            </DialogTitle>
            <DialogDescription>
              Cette action va restaurer la configuration du déploiement{' '}
              <span className="font-mono text-amber-300">{rollbackTarget?.version}</span>{' '}
              du mariage{' '}
              <span className="font-medium text-foreground">{rollbackTarget?.wedding?.coupleLabel || rollbackTarget?.wedding?.slug || '—'}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p className="text-muted-foreground">
              Un <strong>nouveau déploiement</strong> sera créé avec la version{' '}
              <span className="font-mono text-amber-300">rollback-{rollbackTarget?.version}</span>,
              la configuration publishedConfigJson du mariage sera restaurée, et le cache ISR
              sera invalidé. Le déploiement original est <strong>préservé</strong> (piste d'audit).
            </p>
            <p className="text-amber-400 text-xs">
              ⚠️ Si le mariage est actuellement PUBLISHED, le statut sera conservé. Les
              mariages ARCHIVED ou SUSPENDED ne seront pas réactivés automatiquement.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>
              Annuler
            </Button>
            <Button
              onClick={confirmRollback}
              className="bg-amber-500/90 hover:bg-amber-500 text-black"
            >
              <History className="w-4 h-4 mr-2" />
              Confirmer le rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── P3.5 — Rolling back overlay (shown while rollback is in flight) ── */}
      <Dialog open={rollingBack !== null} onOpenChange={() => { /* no-op — wait for completion */ }}>
        <DialogContent className="sm:max-w-[400px]" >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              Rollback en cours…
            </DialogTitle>
            <DialogDescription>
              Restauration de la configuration — ne pas fermer cette fenêtre.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* ─── P3.5 — View Config Modal ──────────────────────────────────────── */}
      <Dialog open={viewConfigFor !== null} onOpenChange={(o) => { if (!o) { setViewConfigFor(null); setViewConfigData('') } }}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-gold" />
              Configuration publiée
            </DialogTitle>
            <DialogDescription>
              PublishedConfig JSON pour le déploiement{' '}
              <span className="font-mono text-gold">{viewConfigFor?.version}</span>
              {viewConfigFor?.wedding && (
                <>
                  {' '}(mariage: {viewConfigFor.wedding.coupleLabel || viewConfigFor.wedding.slug})
                </>
              )}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[55vh] rounded-md border border-white/10 bg-black/40 p-3">
            {loadingConfig ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 rounded" />
                ))}
              </div>
            ) : (
              <pre className="text-[11px] leading-relaxed font-mono text-emerald-300 whitespace-pre-wrap break-all">
                {viewConfigData || '// Aucune donnée'}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (viewConfigData) {
                  navigator.clipboard.writeText(viewConfigData).then(
                    () => toast.success('Config copiée dans le presse-papier'),
                    () => toast.error('Échec de la copie')
                  )
                }
              }}
              disabled={loadingConfig || !viewConfigData}
            >
              Copier
            </Button>
            <Button variant="outline" onClick={() => { setViewConfigFor(null); setViewConfigData('') }}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
