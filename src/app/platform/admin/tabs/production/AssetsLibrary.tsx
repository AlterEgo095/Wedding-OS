'use client'

// ════════════════════════════════════════════════════════════════════════════
// AssetsLibrary — Super Admin Production Studio (CONS-3-SUPER-ADMIN).
// Platform media assets library. Uses /api/platform/assets.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, Pencil, Trash2, MoreHorizontal, Loader2, RefreshCw } from 'lucide-react'


interface AssetRow {
  id: string
  name: string
  type: string
  url: string
  sizeBytes: number
  metadata: string
  createdAt: string
}

interface FormState {
  name: string
  type: 'image' | 'video' | 'font'
  url: string
  sizeBytes: number
  metadata: string
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'image',
  url: '',
  sizeBytes: 0,
  metadata: '{}',
}

const TYPE_ICON: Record<string, string> = {
  image: '🖼️',
  video: '🎬',
  font: '🔤',
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssetsLibrary({ csrfToken }: { csrfToken: string }) {
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')

  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: '1', limit: '50', search, type: typeFilter })
    try {
      const res = await fetch(`/api/platform/assets?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setAssets(json.assets || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des assets')
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!form.name || !form.url) {
      toast.error('Nom et URL requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/platform/assets', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success('Asset enregistré')
      setShowDialog(false)
      setForm(EMPTY_FORM)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a: AssetRow) => {
    if (!confirm(`Supprimer l'asset "${a.name}" ? (Le fichier sous-jacent n'est PAS supprimé.)`)) return
    try {
      const res = await fetch(`/api/platform/assets/${a.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!res.ok) throw new Error('Erreur serveur')
      toast.success('Asset supprimé')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Assets</h2>
          <p className="text-xs text-muted-foreground">
            Bibliothèque de médias (images, vidéos, polices) — référencés par URL.
          </p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setShowDialog(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Référencer un asset
        </Button>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les types</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="video">Vidéos</SelectItem>
                <SelectItem value="font">Polices</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucun asset. Cliquez sur « Référencer un asset » pour en ajouter un.
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {assets.map((a) => (
                <Card key={a.id} className="border border-white/10 overflow-hidden">
                  <div className="h-24 bg-white/[0.02] flex items-center justify-center text-3xl">
                    {a.type === 'image' && a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{TYPE_ICON[a.type] || '📄'}</span>
                    )}
                  </div>
                  <CardContent className="p-2 space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium truncate flex-1">{a.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-400"
                        onClick={() => remove(a)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {a.type} · {formatSize(a.sizeBytes)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{total} asset(s)</p>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Référencer un asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nom</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as FormState['type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Vidéo</SelectItem>
                    <SelectItem value="font">Police</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Taille (octets)</Label>
                <Input
                  type="number"
                  value={form.sizeBytes}
                  onChange={(e) => setForm({ ...form, sizeBytes: parseInt(e.target.value || '0', 10) })}
                />
              </div>
              <div>
                <Label>Métadonnées (JSON)</Label>
                <Input
                  value={form.metadata}
                  onChange={(e) => setForm({ ...form, metadata: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
