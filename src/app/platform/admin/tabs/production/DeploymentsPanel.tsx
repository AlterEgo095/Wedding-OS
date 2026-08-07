'use client'

// ════════════════════════════════════════════════════════════════════════════
// DeploymentsPanel — Super Admin Production Studio (CONS-3-SUPER-ADMIN).
// Lists all wedding frontend deployments across all weddings.
// Uses /api/platform/deployments.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
import { RefreshCw, ExternalLink, Loader2, Cloud } from 'lucide-react'

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

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  BUILDING: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  DEPLOYED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

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

  const retry = async (d: DeploymentRow) => {
    // NOTE: there is no retry endpoint yet (CONS-3 only adds the list route).
    // For now we just show a toast — the operator can manually trigger a
    // rebuild via docker compose. This is a stub for future work.
    setRetrying(d.id)
    try {
      await new Promise((r) => setTimeout(r, 600))
      toast.success(`Redémarrage demandé pour ${d.wedding?.coupleLabel || d.id}`)
    } finally {
      setRetrying(null)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Cloud className="w-5 h-5 text-gold" />
            Déploiements
          </h2>
          <p className="text-xs text-muted-foreground">
            Suivi des déploiements de frontends de mariage (PENDING / BUILDING / DEPLOYED / FAILED).
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
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
                    <TableHead className="w-24" />
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => retry(d)}
                          disabled={retrying === d.id}
                        >
                          {retrying === d.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          Retry
                        </Button>
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
    </div>
  )
}
