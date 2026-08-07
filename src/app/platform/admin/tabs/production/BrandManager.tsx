'use client'

// ════════════════════════════════════════════════════════════════════════════
// BrandManager — Super Admin Production Studio (P3.1 — Brand Studio).
// CRUD for platform-wide brand identities (logo, voice, colors, typography).
// Uses /api/platform/brands (+ /api/platform/brands/{id} for PATCH/DELETE).
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
import {
  Palette,
  Plus,
  Pencil,
  Archive,
  MoreHorizontal,
  Loader2,
  RefreshCw,
} from 'lucide-react'

interface BrandRow {
  id: string
  name: string
  slug: string
  description: string
  logoAssetId: string | null
  logoUrl: string | null
  voiceToneJson: string
  iconographyJson: string
  colorsJson: string
  typographyJson: string
  status: string
  createdAt: string
  updatedAt: string
}

interface FormState {
  name: string
  slug: string
  description: string
  logoUrl: string
  voiceToneJson: string
  iconographyJson: string
  colorsJson: string
  typographyJson: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  description: '',
  logoUrl: '',
  voiceToneJson: '{\n  "tone": "luxe",\n  "vocabulary": [],\n  "do": [],\n  "dont": []\n}',
  iconographyJson: '{\n  "style": "minimal",\n  "motifs": []\n}',
  colorsJson: '{\n  "primary": "#0a0a0a",\n  "accent": "#c9a961",\n  "background": "#fafafa",\n  "text": "#1a1a1a"\n}',
  typographyJson: '{\n  "displayFont": "Cormorant Garamond",\n  "bodyFont": "Inter",\n  "weights": [400, 500, 700]\n}',
  status: 'DRAFT',
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const JSON_FIELDS: Array<{ key: keyof FormState; label: string; placeholder: string }> = [
  { key: 'voiceToneJson', label: 'Voix & ton (JSON)', placeholder: '{ "tone": "luxe", "do": [], "dont": [] }' },
  { key: 'iconographyJson', label: 'Iconographie (JSON)', placeholder: '{ "style": "minimal", "motifs": [] }' },
  { key: 'colorsJson', label: 'Couleurs (JSON)', placeholder: '{ "primary": "#0a0a0a", "accent": "#c9a961" }' },
  { key: 'typographyJson', label: 'Typographie (JSON)', placeholder: '{ "displayFont": "Cormorant", "bodyFont": "Inter" }' },
]

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

export function BrandManager({ csrfToken }: { csrfToken: string }) {
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<BrandRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      limit: '100',
      search,
      status: statusFilter,
    })
    try {
      const res = await fetch(`/api/platform/brands?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setBrands(json.brands || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des brands')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowDialog(true)
  }

  const openEdit = (b: BrandRow) => {
    setEditing(b)
    setForm({
      name: b.name,
      slug: b.slug,
      description: b.description,
      logoUrl: b.logoUrl || '',
      voiceToneJson: prettyJson(b.voiceToneJson),
      iconographyJson: prettyJson(b.iconographyJson),
      colorsJson: prettyJson(b.colorsJson),
      typographyJson: prettyJson(b.typographyJson),
      status: (b.status as FormState['status']) || 'DRAFT',
    })
    setShowDialog(true)
  }

  const submit = async () => {
    if (!form.name || !form.slug) {
      toast.error('Nom et slug requis')
      return
    }
    // Validate all JSON fields client-side before posting.
    for (const field of JSON_FIELDS) {
      const v = form[field.key] as string
      try {
        JSON.parse(v)
      } catch {
        toast.error(`${field.label}: JSON invalide`)
        return
      }
    }

    setSaving(true)
    try {
      const url = editing
        ? `/api/platform/brands/${editing.id}`
        : '/api/platform/brands'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
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
      toast.success(editing ? 'Brand mise à jour' : 'Brand créée')
      setShowDialog(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (b: BrandRow) => {
    if (!confirm(`Archiver la brand « ${b.name} » ? Elle ne sera plus sélectionnable pour les nouveaux weddings.`)) return
    try {
      const res = await fetch(`/api/platform/brands/${b.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success('Brand archivée')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Brands
          </h2>
          <p className="text-xs text-muted-foreground">
            Identités de marque (logo, voix, couleurs, typographie) attachables aux
            weddings et organisations via <code className="text-[10px]">brandId</code>.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle brand
        </Button>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Rechercher par nom ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
          ) : brands.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucune brand. Cliquez sur « Nouvelle brand » pour en créer une.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Logo</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créée le</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        {b.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={b.logoUrl}
                            alt={b.name}
                            className="w-10 h-10 rounded-md object-contain bg-white/5 border border-white/10"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-white/5 border border-white/10 flex items-center justify-center">
                            <Palette className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{b.name}</span>
                          {b.description ? (
                            <span className="text-[11px] text-muted-foreground line-clamp-1">
                              {b.description}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {b.slug}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${STATUS_BADGE[b.status] || ''}`}
                        >
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(b.createdAt).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(b)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Éditer
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-amber-400"
                              onClick={() => archive(b)}
                              disabled={b.status === 'ARCHIVED'}
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

          <p className="text-xs text-muted-foreground">{total} brand(s) au total</p>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              {editing ? 'Éditer la brand' : 'Nouvelle brand'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="brand-name">Nom</Label>
                <Input
                  id="brand-name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value
                    // Auto-generate slug from name ONLY on create (not on edit,
                    // to avoid clobbering an established slug).
                    setForm({
                      ...form,
                      name,
                      slug: editing ? form.slug : slugify(name),
                    })
                  }}
                />
              </div>
              <div>
                <Label htmlFor="brand-slug">Slug</Label>
                <Input
                  id="brand-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({ ...form, slug: slugify(e.target.value) })
                  }
                  placeholder="aenews-luxury"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="brand-desc">Description</Label>
              <Textarea
                id="brand-desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                placeholder="Identité de marque pour weddings luxe AENEWS…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="brand-logo">URL du logo</Label>
                <Input
                  id="brand-logo"
                  value={form.logoUrl}
                  onChange={(e) =>
                    setForm({ ...form, logoUrl: e.target.value })
                  }
                  placeholder="https://cdn.example.com/logo.svg"
                />
                {form.logoUrl ? (
                  <div className="mt-2 p-2 rounded-md bg-white/5 border border-white/10 inline-flex">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.logoUrl}
                      alt="preview"
                      className="w-16 h-16 object-contain"
                    />
                  </div>
                ) : null}
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              {JSON_FIELDS.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`brand-${field.key}`}>{field.label}</Label>
                  <Textarea
                    id={`brand-${field.key}`}
                    value={form[field.key] as string}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    rows={6}
                    className="font-mono text-xs"
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
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
