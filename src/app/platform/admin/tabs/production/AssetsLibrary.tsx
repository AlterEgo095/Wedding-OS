'use client'

// ════════════════════════════════════════════════════════════════════════════
// AssetsLibrary — Super Admin Production Studio (CONS-3-SUPER-ADMIN).
// Platform media assets library. Uses /api/platform/assets.
//
// P3.9 enhancements:
//  • Thumbnail preview in card (pre-existing for image; expanded with explicit
//    IMAGE / VIDEO / FONT / ICON / DOCUMENT type filter).
//  • "Copy URL" button per row (clipboard API).
//  • "Preview" button per row (modal with full image / video / font sample).
//  • Bulk upload area (drag-and-drop multiple files — TODO note: the actual
//    upload endpoint /api/platform/assets/bulk-upload does not exist yet;
//    dropped files are queued locally and shown in a list, with a disabled
//    "Upload all" button + tooltip explaining the missing endpoint).
//  • Status filter + search: PlatformAsset has no `status` column — we use the
//    Type filter as the second-axis filter (already pre-existing).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Pencil, Trash2, MoreHorizontal, Loader2, RefreshCw, Copy, Eye, Link2, Upload, FileWarning } from 'lucide-react'


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

// P3.9 — expanded type filter (5 types per task spec; only image/video/font
// are currently POSTable via the API — icon/document show as future types).
const ALL_TYPE_FILTERS = [
  { value: 'image', label: 'IMAGE' },
  { value: 'video', label: 'VIDEO' },
  { value: 'font', label: 'FONT' },
  { value: 'icon', label: 'ICON' },
  { value: 'document', label: 'DOCUMENT' },
]

const TYPE_BADGE: Record<string, string> = {
  image: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  video: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  font: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  icon: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  document: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const TYPE_ICON_EMOJI: Record<string, string> = {
  image: '🖼️',
  video: '🎬',
  font: '🔤',
  icon: '✨',
  document: '📄',
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

interface QueuedFile {
  file: File
  id: string
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

  // Preview modal state
  const [preview, setPreview] = useState<AssetRow | null>(null)

  // Bulk upload queue
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // P3.9 — Copy URL to clipboard (with legacy fallback).
  const copyUrl = async (a: AssetRow) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(a.url)
      } else {
        // Legacy fallback for non-secure contexts.
        const ta = document.createElement('textarea')
        ta.value = a.url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success('URL copiée dans le presse-papier')
    } catch {
      toast.error('Impossible de copier l\'URL')
    }
  }

  // P3.9 — Bulk upload handlers (drag-and-drop).
  // TODO(P3.10+): the backend endpoint /api/platform/assets/bulk-upload does
  // not exist yet. Files are queued locally; the "Upload all" button is
  // disabled with a tooltip explaining the missing endpoint. When the
  // endpoint lands, flip the disabled flag + wire the FormData POST.
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const queued: QueuedFile[] = Array.from(fileList).map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }))
    setQueuedFiles((prev) => [...prev, ...queued])
    toast.info(`${queued.length} fichier(s) en file d'attente (endpoint bulk-upload à venir)`)
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const removeFromQueue = (id: string) => {
    setQueuedFiles((prev) => prev.filter((q) => q.id !== id))
  }

  const uploadAllQueued = async () => {
    // TODO(P3.10+): replace with real bulk-upload POST once the endpoint exists.
    toast.info('Le téléchargement multiple sera bientôt disponible. Utilisez le téléchargement individuel pour le moment.')
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
            {/* P3.9 — expanded Type filter (5 types per task spec). */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les types</SelectItem>
                {ALL_TYPE_FILTERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* P3.9 — Bulk upload drag-and-drop area */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-gold bg-gold/5'
                : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
            />
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Glissez-déposez plusieurs fichiers ici, ou{' '}
              <span className="text-gold underline">cliquez pour sélectionner</span>.
            </p>
            <p className="text-[10px] text-amber-400/80 mt-1 flex items-center justify-center gap-1">
              <FileWarning className="w-3 h-3" />
              Le téléchargement multiple sera bientôt disponible —
              les fichiers sont uniquement mis en file d&apos;attente localement pour le moment.
            </p>
          </div>

          {/* Queued files list */}
          {queuedFiles.length > 0 && (
            <div className="border border-white/10 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground uppercase">
                  File d&apos;attente ({queuedFiles.length})
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setQueuedFiles([])}
                  >
                    Vider
                  </Button>
                  <Button
                    size="sm"
                    onClick={uploadAllQueued}
                    disabled
                    title="Endpoint bulk-upload à implémenter (P3.10+)"
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Télécharger tout
                  </Button>
                </div>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {queuedFiles.map((q) => (
                  <li
                    key={q.id}
                    className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-white/[0.02] border border-white/5"
                  >
                    <span className="flex-1 truncate font-mono">{q.file.name}</span>
                    <span className="text-muted-foreground">{formatSize(q.file.size)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 text-red-400"
                      onClick={(e) => { e.stopPropagation(); removeFromQueue(q.id) }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                  <div className="h-24 bg-white/[0.02] flex items-center justify-center text-3xl relative">
                    {a.type === 'image' && a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{TYPE_ICON_EMOJI[a.type] || '📄'}</span>
                    )}
                    {/* P3.9 — Top-right type badge */}
                    <Badge
                      variant="outline"
                      className={`absolute top-1 right-1 text-[9px] uppercase ${TYPE_BADGE[a.type] || ''}`}
                    >
                      {a.type}
                    </Badge>
                  </div>
                  <CardContent className="p-2 space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium truncate flex-1">{a.name}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreHorizontal className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreview(a)}>
                            <Eye className="w-3.5 h-3.5 mr-2" />
                            Aperçu
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyUrl(a)}>
                            <Link2 className="w-3.5 h-3.5 mr-2" />
                            Copier l&apos;URL
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => remove(a)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {a.type} · {formatSize(a.sizeBytes)}
                    </p>
                    {/* P3.9 — explicit Copy URL button (visible, not just in dropdown) */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-[10px]"
                      onClick={() => copyUrl(a)}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copier l&apos;URL
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{total} asset(s)</p>
        </CardContent>
      </Card>

      {/* Create Dialog */}
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

      {/* P3.9 — Preview Modal */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Aperçu · {preview?.name}
              <span className="ml-2 text-xs font-mono text-muted-foreground">{preview?.type}</span>
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground uppercase">Type</div>
                  <Badge variant="outline" className={`text-[10px] uppercase ${TYPE_BADGE[preview.type] || ''}`}>
                    {preview.type}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase">Taille</div>
                  <div className="font-medium">{formatSize(preview.sizeBytes)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase">Créé le</div>
                  <div className="font-medium">
                    {new Date(preview.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div className="col-span-1 md:col-span-1">
                  <div className="text-muted-foreground uppercase">Actions</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => copyUrl(preview)}
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copier URL
                  </Button>
                </div>
              </div>

              {/* Full preview based on type */}
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-2">Aperçu</div>
                {preview.type === 'image' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="max-w-full max-h-[50vh] mx-auto rounded border border-white/10"
                  />
                )}
                {preview.type === 'video' && (
                  <video
                    src={preview.url}
                    controls
                    className="max-w-full max-h-[50vh] mx-auto rounded border border-white/10"
                  >
                    Votre navigateur ne supporte pas la lecture vidéo.
                  </video>
                )}
                {preview.type === 'font' && (
                  <div
                    className="border border-white/10 rounded-lg p-6 text-center"
                    style={{ fontFamily: preview.name }}
                  >
                    <div className="text-3xl mb-2">ABCDEFG abcdefg 0123</div>
                    <div className="text-sm opacity-70">
                      The quick brown fox jumps over the lazy dog.
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-2">
                      Police appliquée via <code>font-family: {preview.name}</code>
                    </div>
                  </div>
                )}
                {!['image', 'video', 'font'].includes(preview.type) && (
                  <div className="border border-white/10 rounded-lg p-8 text-center">
                    <div className="text-5xl mb-2">{TYPE_ICON_EMOJI[preview.type] || '📄'}</div>
                    <p className="text-xs text-muted-foreground">
                      Pas d&apos;aperçu visuel disponible pour ce type.
                    </p>
                  </div>
                )}
              </div>

              {/* URL display */}
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">URL</div>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={preview.url}
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyUrl(preview)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Metadata */}
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">Métadonnées</div>
                <pre className="bg-black/40 border border-white/10 rounded p-3 text-[11px] font-mono overflow-x-auto max-h-40">
                  {prettyJson(preview.metadata)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
