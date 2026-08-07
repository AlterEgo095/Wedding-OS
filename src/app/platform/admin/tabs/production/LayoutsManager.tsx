'use client'

// ════════════════════════════════════════════════════════════════════════════
// LayoutsManager — Super Admin Production Studio (P3.2 — Layouts stage UI).
// CRUD for the Layout model (P3-Foundation). Uses /api/platform/layouts.
//
// Built-in layouts (royal, classic, minimal, destination, modern) are read-only
// in the table — the "Archive" button is disabled for them, and editing them
// is allowed (so designers can tweak section orderings on the canonical rows)
// but the recommended workflow is to CLONE them first and edit the copy.
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
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Plus,
  Search,
  Pencil,
  Copy,
  Archive,
  Trash2,
  MoreHorizontal,
  Loader2,
  RefreshCw,
  Layout as LayoutIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionType =
  | 'hero'
  | 'story'
  | 'gallery'
  | 'timeline'
  | 'map'
  | 'guest-auth'

const SECTION_TYPES: SectionType[] = [
  'hero',
  'story',
  'gallery',
  'timeline',
  'map',
  'guest-auth',
]

interface SectionItem {
  id: string
  type: SectionType
  enabled: boolean
  order: number
  props?: Record<string, unknown>
}

interface LayoutRow {
  id: string
  name: string
  slug: string
  description: string
  thumbnailUrl: string | null
  sectionsJson: string
  propsJson: string
  version: number
  status: string
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
}

interface FormState {
  name: string
  slug: string
  description: string
  thumbnailUrl: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  sections: SectionItem[]
  propsJson: string
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  description: '',
  thumbnailUrl: '',
  status: 'DRAFT',
  sections: [],
  propsJson: '{}',
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseSections(json: string | null | undefined): SectionItem[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (s): s is SectionItem =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as SectionItem).id === 'string' &&
          typeof (s as SectionItem).type === 'string' &&
          typeof (s as SectionItem).enabled === 'boolean' &&
          typeof (s as SectionItem).order === 'number'
      )
      .map((s) => ({ ...s }))
  } catch {
    return []
  }
}

function safeParseProps(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

function countSections(json: string | null | undefined): number {
  return safeParseSections(json).length
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LayoutsManager({ csrfToken }: { csrfToken: string }) {
  const [layouts, setLayouts] = useState<LayoutRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [builtInFilter, setBuiltInFilter] = useState<string>('ALL')

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<LayoutRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      search,
      status: statusFilter,
    })
    if (builtInFilter !== 'ALL') params.set('isBuiltIn', builtInFilter)
    try {
      const res = await fetch(`/api/platform/layouts?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setLayouts(json.layouts || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des layouts')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, builtInFilter])

  useEffect(() => {
    load()
  }, [load])

  // ─── Form helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowDialog(true)
  }

  const openEdit = (l: LayoutRow) => {
    setEditing(l)
    setForm({
      name: l.name,
      slug: l.slug,
      description: l.description,
      thumbnailUrl: l.thumbnailUrl || '',
      status: (l.status as FormState['status']) || 'DRAFT',
      sections: safeParseSections(l.sectionsJson),
      propsJson: l.propsJson || '{}',
    })
    setShowDialog(true)
  }

  // ─── Section editor ────────────────────────────────────────────────────────

  const addSection = () => {
    setForm((f) => ({
      ...f,
      sections: [
        ...f.sections,
        {
          id: `section-${f.sections.length + 1}`,
          type: 'hero',
          enabled: true,
          order: f.sections.length,
        },
      ],
    }))
  }

  const updateSection = (index: number, patch: Partial<SectionItem>) => {
    setForm((f) => {
      const next = [...f.sections]
      next[index] = { ...next[index], ...patch }
      return { ...f, sections: next }
    })
  }

  const removeSection = (index: number) => {
    setForm((f) => {
      const next = f.sections.filter((_, i) => i !== index)
      // Re-number order to keep the list contiguous.
      return {
        ...f,
        sections: next.map((s, i) => ({ ...s, order: i })),
      }
    })
  }

  // ─── API actions ───────────────────────────────────────────────────────────

  const submit = async () => {
    if (!form.name || !form.slug) {
      toast.error('Nom et slug requis')
      return
    }
    // Validate propsJson is parseable.
    let propsObj: Record<string, unknown> = {}
    try {
      propsObj = form.propsJson.trim() ? JSON.parse(form.propsJson) : {}
      if (propsObj && typeof propsObj !== 'object') throw new Error('not an object')
      if (Array.isArray(propsObj)) throw new Error('must be object, not array')
    } catch {
      toast.error('propsJson invalide — doit être un objet JSON')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        thumbnailUrl: form.thumbnailUrl || null,
        status: form.status,
        sectionsJson: form.sections,
        propsJson: propsObj,
      }
      const url = editing
        ? `/api/platform/layouts/${editing.id}`
        : '/api/platform/layouts'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
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
      toast.success(editing ? 'Layout mis à jour' : 'Layout créé')
      setShowDialog(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const clone = async (l: LayoutRow) => {
    setSaving(true)
    try {
      const payload = {
        name: `${l.name} (copie)`,
        slug: slugify(`${l.slug}-copie`),
        description: l.description,
        thumbnailUrl: l.thumbnailUrl || null,
        status: 'DRAFT' as const,
        sectionsJson: safeParseSections(l.sectionsJson),
        propsJson: safeParseProps(l.propsJson),
      }
      const res = await fetch('/api/platform/layouts', {
        method: 'POST',
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
      toast.success(`Layout cloné : ${payload.slug}`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (l: LayoutRow) => {
    if (l.isBuiltIn) {
      toast.error('Les layouts natifs ne peuvent pas être archivés')
      return
    }
    if (!confirm(`Archiver le layout "${l.name}" ? (statut → ARCHIVED)`)) return
    try {
      const res = await fetch(`/api/platform/layouts/${l.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success('Layout archivé')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutIcon className="w-5 h-5 text-amber-400" />
            Layouts
          </h2>
          <p className="text-xs text-muted-foreground">
            Gérez les layouts (section orderings + default props) utilisés par le
            pipeline de déploiement. Les 5 layouts natifs sont en lecture seule —
            clonez-les pour personnaliser.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau layout
        </Button>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="max-w-xs"
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
            >
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
            <Select
              value={builtInFilter}
              onValueChange={(v) => {
                setBuiltInFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous</SelectItem>
                <SelectItem value="true">Natif</SelectItem>
                <SelectItem value="false">Personnalisé</SelectItem>
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
          ) : layouts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucun layout. Cliquez sur « Nouveau layout » pour en créer un.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Sections</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {layouts.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {l.slug}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${STATUS_BADGE[l.status] || ''}`}
                        >
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {l.isBuiltIn ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase bg-amber-500/15 text-amber-400 border-amber-500/30"
                          >
                            Natif
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase bg-sky-500/15 text-sky-400 border-sky-500/30"
                          >
                            Perso
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>v{l.version}</TableCell>
                      <TableCell>{countSections(l.sectionsJson)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(l.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(l)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Éditer
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => clone(l)}>
                              <Copy className="w-3.5 h-3.5 mr-2" />
                              Cloner
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400"
                              disabled={l.isBuiltIn}
                              onClick={() => archive(l)}
                            >
                              <Archive className="w-3.5 h-3.5 mr-2" />
                              Archiver
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

          <p className="text-xs text-muted-foreground">{total} layout(s) au total</p>
        </CardContent>
      </Card>

      {/* ─── Create / Edit dialog ─────────────────────────────────────────────── */}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Éditer le layout' : 'Nouveau layout'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lyt-name">Nom</Label>
                <Input
                  id="lyt-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lyt-slug">Slug</Label>
                <Input
                  id="lyt-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({ ...form, slug: slugify(e.target.value) })
                  }
                  placeholder="mon-layout"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="lyt-desc">Description</Label>
              <Textarea
                id="lyt-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="lyt-thumb">URL miniature</Label>
              <Input
                id="lyt-thumb"
                value={form.thumbnailUrl}
                onChange={(e) =>
                  setForm({ ...form, thumbnailUrl: e.target.value })
                }
                placeholder="https://…"
              />
            </div>
            <div>
              <Label>Statut</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({ ...form, status: v as FormState['status'] })
                }
              >
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

            {/* ─── Sections editor ───────────────────────────────────────────── */}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sections ({form.sections.length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={addSection}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Ajouter
                </Button>
              </div>
              {form.sections.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Aucune section. Cliquez sur « Ajouter » pour commencer.
                </p>
              ) : (
                <div className="space-y-2 rounded-lg border border-white/10 p-2">
                  {form.sections.map((s, i) => (
                    <div
                      key={`${s.id}-${i}`}
                      className="grid grid-cols-[auto_1fr_180px_auto_auto] gap-2 items-center"
                    >
                      <Checkbox
                        checked={s.enabled}
                        onCheckedChange={(v) =>
                          updateSection(i, { enabled: v === true })
                        }
                      />
                      <Input
                        value={s.id}
                        onChange={(e) => updateSection(i, { id: e.target.value })}
                        placeholder="section-id"
                        className="font-mono text-xs"
                      />
                      <Select
                        value={s.type}
                        onValueChange={(v) =>
                          updateSection(i, { type: v as SectionType })
                        }
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SECTION_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground w-12 text-center">
                        #{s.order}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400"
                        onClick={() => removeSection(i)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Props JSON editor ─────────────────────────────────────────── */}

            <div>
              <Label htmlFor="lyt-props">Props par défaut (JSON)</Label>
              <Textarea
                id="lyt-props"
                value={form.propsJson}
                onChange={(e) => setForm({ ...form, propsJson: e.target.value })}
                rows={4}
                className="font-mono text-xs"
                placeholder='{"hero":{"variant":"split"}}'
              />
              <p className="text-xs text-muted-foreground mt-1">
                Objet JSON — props par défaut par section (ex. variant du hero).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
