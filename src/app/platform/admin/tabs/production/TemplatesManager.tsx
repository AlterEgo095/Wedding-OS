'use client'

// ════════════════════════════════════════════════════════════════════════════
// TemplatesManager — Super Admin Production Studio (CONS-3-SUPER-ADMIN).
// CRUD for wedding site templates. Uses /api/platform/templates.
//
// P3.9 enhancements:
//  • Layout selector in create/edit modal (fetches /api/platform/layouts).
//  • Duplicate button per row (clones with `-copy` slug suffix).
//  • Preview modal showing pretty-printed schemaJson + section IDs list.
//  • Status filter (DRAFT/PUBLISHED/ARCHIVED) + search box (pre-existing).
//  • Pagination 20/page (pre-existing).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
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
import { Plus, Search, Pencil, Trash2, MoreHorizontal, Loader2, RefreshCw, Copy, Eye, ChevronLeft, ChevronRight } from 'lucide-react'


interface TemplateRow {
  id: string
  name: string
  slug: string
  description: string
  thumbnailUrl: string | null
  schemaJson: string
  version: number
  status: string
  layoutId: string | null
  createdAt: string
  updatedAt: string
}

interface LayoutOption {
  id: string
  name: string
  slug: string
  isBuiltIn: boolean
}

interface FormState {
  name: string
  slug: string
  description: string
  thumbnailUrl: string
  schemaJson: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  layoutId: string // '' = none
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  description: '',
  thumbnailUrl: '',
  schemaJson: '{}',
  status: 'DRAFT',
  layoutId: '',
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const PAGE_SIZE = 20

/**
 * Extract section IDs from a template schemaJson. Best-effort — accepts
 * { sections: [{ id }] } OR { sections: ["id1","id2"] } OR an array of
 * section objects directly. Returns [] if nothing parseable is found.
 */
function extractSectionIds(schemaJson: string): string[] {
  try {
    const obj = JSON.parse(schemaJson)
    const sections =
      Array.isArray(obj) ? obj
        : Array.isArray(obj?.sections) ? obj.sections
        : Array.isArray(obj?.sectionsJson) ? obj.sectionsJson
        : []
    return sections
      .map((s: unknown) => {
        if (typeof s === 'string') return s
        if (s && typeof s === 'object' && 'id' in s) return String((s as { id: unknown }).id)
        return ''
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function TemplatesManager({ csrfToken }: { csrfToken: string }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Layouts for the layout selector dropdown (fetched once on mount).
  const [layouts, setLayouts] = useState<LayoutOption[]>([])
  const [layoutsLoading, setLayoutsLoading] = useState(false)

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<TemplateRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Preview modal state
  const [preview, setPreview] = useState<TemplateRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      search,
      status: statusFilter,
    })
    try {
      const res = await fetch(`/api/platform/templates?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setTemplates(json.templates || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des templates')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  // Load layouts (PUBLISHED only — designers can clone drafts if they want
  // more, but the picker only shows ready-to-use layouts).
  const loadLayouts = useCallback(async () => {
    setLayoutsLoading(true)
    try {
      const res = await fetch('/api/platform/layouts?status=PUBLISHED&limit=100', { credentials: 'include' })
      if (!res.ok) throw new Error('layouts fetch failed')
      const json = await res.json()
      setLayouts(json.layouts || [])
    } catch {
      // Non-fatal: selector still works, just empty.
      setLayouts([])
    } finally {
      setLayoutsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadLayouts() }, [loadLayouts])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowDialog(true)
  }

  const openEdit = (t: TemplateRow) => {
    setEditing(t)
    setForm({
      name: t.name,
      slug: t.slug,
      description: t.description,
      thumbnailUrl: t.thumbnailUrl || '',
      schemaJson: t.schemaJson,
      status: (t.status as FormState['status']) || 'DRAFT',
      layoutId: t.layoutId || '',
    })
    setShowDialog(true)
  }

  const submit = async () => {
    if (!form.name || !form.slug) {
      toast.error('Nom et slug requis')
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      thumbnailUrl: form.thumbnailUrl || null,
      layoutId: form.layoutId || null,
    }
    try {
      const url = editing
        ? `/api/platform/templates/${editing.id}`
        : '/api/platform/templates'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success(editing ? 'Template mis à jour' : 'Template créé')
      setShowDialog(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  // P3.9 — Duplicate: clone the template with a `-copy` slug suffix.
  // Server enforces slug uniqueness, so we suffix until we find a free slug.
  const duplicate = async (t: TemplateRow) => {
    const baseSlug = `${t.slug}-copy`
    setSaving(true)
    try {
      // Attempt direct POST; if 409 (slug clash), increment suffix.
      let attempt = 0
      let lastErr = ''
      while (attempt < 5) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
        const res = await fetch('/api/platform/templates', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({
            name: `${t.name} (copie)`,
            slug,
            description: t.description,
            thumbnailUrl: t.thumbnailUrl || null,
            schemaJson: t.schemaJson,
            status: 'DRAFT',
            layoutId: t.layoutId || null,
          }),
        })
        if (res.ok) {
          toast.success(`Template dupliqué → ${slug}`)
          load()
          return
        }
        if (res.status === 409) {
          attempt++
          continue
        }
        const body = await res.json().catch(() => ({}))
        lastErr = body?.error || 'Erreur serveur'
        break
      }
      throw new Error(lastErr || 'Impossible de dupliquer (slug en conflit)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t: TemplateRow) => {
    if (!confirm(`Supprimer le template "${t.name}" ?`)) return
    try {
      const res = await fetch(`/api/platform/templates/${t.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!res.ok) throw new Error('Erreur serveur')
      toast.success('Template supprimé')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const layoutName = (layoutId: string | null) => {
    if (!layoutId) return null
    const l = layouts.find((x) => x.id === layoutId || x.slug === layoutId)
    return l ? l.name : layoutId
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Templates</h2>
          <p className="text-xs text-muted-foreground">
            Gérez les templates de sites de mariage réutilisables.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau template
        </Button>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                <SelectItem value="DRAFT">Brouillon</SelectItem>
                <SelectItem value="PUBLISHED">Publié</SelectItem>
                <SelectItem value="ARCHIVED">Archivé</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucun template. Cliquez sur « Nouveau template » pour en créer un.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Layout</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{t.slug}</TableCell>
                      <TableCell>
                        {layoutName(t.layoutId) ? (
                          <Badge variant="outline" className="text-[10px] uppercase bg-sky-500/10 text-sky-400 border-sky-500/30">
                            {layoutName(t.layoutId)}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>v{t.version}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_BADGE[t.status] || ''}`}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(t)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Éditer
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPreview(t)}>
                              <Eye className="w-3.5 h-3.5 mr-2" />
                              Aperçu
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicate(t)} disabled={saving}>
                              <Copy className="w-3.5 h-3.5 mr-2" />
                              Dupliquer
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400"
                              onClick={() => remove(t)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {total} template(s) au total · page {page}/{totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Suivant
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Éditer le template' : 'Nouveau template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tpl-name">Nom</Label>
                <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="tpl-slug">Slug</Label>
                <Input
                  id="tpl-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="mon-template"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea
                id="tpl-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="tpl-thumb">URL miniature</Label>
              <Input
                id="tpl-thumb"
                value={form.thumbnailUrl}
                onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
                placeholder="https://…"
              />
            </div>
            {/* P3.9 — Layout selector */}
            <div>
              <Label htmlFor="tpl-layout">Layout associé (P3.2)</Label>
              <Select
                value={form.layoutId || '__none__'}
                onValueChange={(v) => setForm({ ...form, layoutId: v === '__none__' ? '' : v })}
              >
                <SelectTrigger id="tpl-layout">
                  <SelectValue placeholder={layoutsLoading ? 'Chargement…' : 'Aucun layout'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Aucun layout —</SelectItem>
                  {layouts.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} <span className="text-[10px] text-muted-foreground">({l.slug}{l.isBuiltIn ? ' · built-in' : ''})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Le pipeline <code>resolveLayouts</code> lira les sections de ce layout
                à la place du mappage <code>LAYOUT_SECTIONS</code> codé en dur.
              </p>
            </div>
            <div>
              <Label htmlFor="tpl-schema">Schéma (JSON)</Label>
              <Textarea
                id="tpl-schema"
                value={form.schemaJson}
                onChange={(e) => setForm({ ...form, schemaJson: e.target.value })}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as FormState['status'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Brouillon</SelectItem>
                  <SelectItem value="PUBLISHED">Publié</SelectItem>
                  <SelectItem value="ARCHIVED">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* P3.9 — Preview Modal */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null) }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Aperçu · {preview?.name}
              <span className="ml-2 text-xs font-mono text-muted-foreground">{preview?.slug}</span>
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground uppercase">Version</div>
                  <div className="font-medium">v{preview.version}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase">Statut</div>
                  <div>
                    <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_BADGE[preview.status] || ''}`}>
                      {preview.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase">Layout</div>
                  <div className="font-medium">{layoutName(preview.layoutId) || '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase">Sections détectées</div>
                  <div className="font-medium">{extractSectionIds(preview.schemaJson).length}</div>
                </div>
              </div>

              {preview.thumbnailUrl && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Miniature</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.thumbnailUrl}
                    alt={preview.name}
                    className="max-h-40 rounded border border-white/10"
                  />
                </div>
              )}

              {/* Section IDs visual list */}
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">
                  Sections (IDs extraits du schemaJson)
                </div>
                {extractSectionIds(preview.schemaJson).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Aucun identifiant de section détecté. Le schemaJson ne contient pas
                    de tableau <code>sections</code>.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {extractSectionIds(preview.schemaJson).map((id, i) => (
                      <Badge
                        key={`${id}-${i}`}
                        variant="outline"
                        className="text-[10px] uppercase bg-sky-500/10 text-sky-400 border-sky-500/30 font-mono"
                      >
                        {i + 1}. {id}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Pretty-printed schemaJson */}
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">
                  Schéma JSON (pretty-printé)
                </div>
                <pre className="bg-black/40 border border-white/10 rounded p-3 text-[11px] font-mono overflow-x-auto max-h-72">
                  {prettyJson(preview.schemaJson)}
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
