'use client'

// ════════════════════════════════════════════════════════════════════════════
// ThemesManager — Super Admin Production Studio (CONS-3-SUPER-ADMIN).
// CRUD for visual theme presets. Uses /api/platform/themes.
//
// P3.9 enhancements:
//  • Palette swatch in card (pre-existing — kept).
//  • Preview modal: color swatches + font samples (Cormorant / Inter) +
//    a mock hero section using the theme's colors.
//  • Duplicate button per row (clone with `-copy` slug suffix).
//  • Status filter (DRAFT / PUBLISHED / ARCHIVED).
//  • "Built-in only" toggle filter (isBuiltIn field).
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Pencil, Trash2, MoreHorizontal, Loader2, RefreshCw, Copy, Eye } from 'lucide-react'


interface ThemeRow {
  id: string
  name: string
  slug: string
  paletteJson: string
  fontDisplay: string | null
  fontBody: string | null
  isBuiltIn: boolean
  status: string
  createdAt: string
  updatedAt: string
}

interface FormState {
  name: string
  slug: string
  primaryColor: string
  accentColor: string
  backgroundColor: string
  fontDisplay: string
  fontBody: string
  isBuiltIn: boolean
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  primaryColor: '#D4A853',
  accentColor: '#C8785A',
  backgroundColor: '#0f0f17',
  fontDisplay: 'Cormorant Garamond',
  fontBody: 'Inter',
  isBuiltIn: false,
  status: 'PUBLISHED',
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

function parsePalette(json: string): { primary: string; accent: string; bg: string } {
  try {
    const obj = JSON.parse(json)
    return {
      primary: obj.primary || '#D4A853',
      accent: obj.accent || '#C8785A',
      bg: obj.background || '#0f0f17',
    }
  } catch {
    return { primary: '#D4A853', accent: '#C8785A', bg: '#0f0f17' }
  }
}

export function ThemesManager({ csrfToken }: { csrfToken: string }) {
  const [themes, setThemes] = useState<ThemeRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [builtinOnly, setBuiltinOnly] = useState(false)

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<ThemeRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Preview modal state
  const [preview, setPreview] = useState<ThemeRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: '1', limit: '50', search, status: statusFilter })
    try {
      const res = await fetch(`/api/platform/themes?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      let list: ThemeRow[] = json.themes || []
      // Client-side built-in filter (API doesn't support isBuiltIn param yet —
      // filtering here is cheap since limit=50 covers the typical catalog).
      if (builtinOnly) list = list.filter((t) => t.isBuiltIn)
      setThemes(list)
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des thèmes')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, builtinOnly])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowDialog(true)
  }

  const openEdit = (t: ThemeRow) => {
    const p = parsePalette(t.paletteJson)
    setEditing(t)
    setForm({
      name: t.name,
      slug: t.slug,
      primaryColor: p.primary,
      accentColor: p.accent,
      backgroundColor: p.bg,
      fontDisplay: t.fontDisplay || '',
      fontBody: t.fontBody || '',
      isBuiltIn: t.isBuiltIn,
      status: (t.status as FormState['status']) || 'PUBLISHED',
    })
    setShowDialog(true)
  }

  const submit = async () => {
    if (!form.name || !form.slug) {
      toast.error('Nom et slug requis')
      return
    }
    setSaving(true)
    const paletteJson = JSON.stringify({
      primary: form.primaryColor,
      accent: form.accentColor,
      background: form.backgroundColor,
    })
    const payload = {
      name: form.name,
      slug: form.slug,
      paletteJson,
      fontDisplay: form.fontDisplay || null,
      fontBody: form.fontBody || null,
      isBuiltIn: form.isBuiltIn,
      status: form.status,
    }
    try {
      const url = editing ? `/api/platform/themes/${editing.id}` : '/api/platform/themes'
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
      toast.success(editing ? 'Thème mis à jour' : 'Thème créé')
      setShowDialog(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  // P3.9 — Duplicate theme (clone with `-copy` slug).
  const duplicate = async (t: ThemeRow) => {
    const baseSlug = `${t.slug}-copy`
    setSaving(true)
    try {
      let attempt = 0
      let lastErr = ''
      while (attempt < 5) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
        const res = await fetch('/api/platform/themes', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({
            name: `${t.name} (copie)`,
            slug,
            paletteJson: t.paletteJson,
            fontDisplay: t.fontDisplay,
            fontBody: t.fontBody,
            isBuiltIn: false, // copies are never built-in
            status: 'DRAFT',
          }),
        })
        if (res.ok) {
          toast.success(`Thème dupliqué → ${slug}`)
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

  const remove = async (t: ThemeRow) => {
    if (t.isBuiltIn) {
      toast.error('Les thèmes intégrés ne peuvent pas être supprimés')
      return
    }
    if (!confirm(`Supprimer le thème "${t.name}" ?`)) return
    try {
      const res = await fetch(`/api/platform/themes/${t.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success('Thème supprimé')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Thèmes</h2>
          <p className="text-xs text-muted-foreground">
            Palettes de couleurs + polices prêtes à l'emploi.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau thème
        </Button>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Input
              placeholder="Rechercher…"
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
            {/* P3.9 — Built-in only toggle */}
            <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-white/10 cursor-pointer hover:bg-white/5">
              <input
                type="checkbox"
                checked={builtinOnly}
                onChange={(e) => setBuiltinOnly(e.target.checked)}
                className="accent-gold"
              />
              Built-in uniquement
            </label>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : themes.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucun thème.
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {themes.map((t) => {
                const p = parsePalette(t.paletteJson)
                return (
                  <Card key={t.id} className="border border-white/10 overflow-hidden">
                    <div
                      className="h-16 flex items-center justify-center text-xs font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${p.primary}, ${p.accent})`,
                        color: '#fff',
                      }}
                    >
                      {t.name}
                    </div>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{t.slug}</span>
                        {t.isBuiltIn && (
                          <Badge variant="outline" className="text-[9px] uppercase bg-gold/10 text-gold border-gold/30">
                            Built-in
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[9px] uppercase ${STATUS_BADGE[t.status] || ''}`}>
                          {t.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {t.fontDisplay} · {t.fontBody}
                      </p>
                      {/* P3.9 — explicit palette swatches with hex labels */}
                      <div className="flex items-center gap-1 pt-1">
                        <span className="w-3 h-3 rounded-full" style={{ background: p.primary }} title={`Primaire ${p.primary}`} />
                        <span className="w-3 h-3 rounded-full" style={{ background: p.accent }} title={`Accent ${p.accent}`} />
                        <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: p.bg }} title={`Fond ${p.bg}`} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto">
                              <MoreHorizontal className="w-3 h-3" />
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
                              disabled={t.isBuiltIn}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{total} thème(s)</p>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Éditer le thème' : 'Nouveau thème'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nom</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Primaire</Label>
                <div className="flex gap-2">
                  <input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="w-10 h-9 rounded border border-white/10 bg-transparent" />
                  <Input value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Accent</Label>
                <div className="flex gap-2">
                  <input type="color" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} className="w-10 h-9 rounded border border-white/10 bg-transparent" />
                  <Input value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Fond</Label>
                <div className="flex gap-2">
                  <input type="color" value={form.backgroundColor} onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })} className="w-10 h-9 rounded border border-white/10 bg-transparent" />
                  <Input value={form.backgroundColor} onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Police titres</Label>
                <Input value={form.fontDisplay} onChange={(e) => setForm({ ...form, fontDisplay: e.target.value })} />
              </div>
              <div>
                <Label>Police texte</Label>
                <Input value={form.fontBody} onChange={(e) => setForm({ ...form, fontBody: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as FormState['status'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="PUBLISHED">Publié</SelectItem>
                    <SelectItem value="ARCHIVED">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.isBuiltIn} onChange={(e) => setForm({ ...form, isBuiltIn: e.target.checked })} />
                  Thème intégré (built-in)
                </label>
              </div>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Aperçu thème · {preview?.name}
              <span className="ml-2 text-xs font-mono text-muted-foreground">{preview?.slug}</span>
            </DialogTitle>
          </DialogHeader>
          {preview && (() => {
            const p = parsePalette(preview.paletteJson)
            return (
              <div className="space-y-4">
                {/* Color swatches */}
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-2">Palette</div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Primaire', color: p.primary },
                      { label: 'Accent', color: p.accent },
                      { label: 'Fond', color: p.bg },
                    ].map((sw) => (
                      <div key={sw.label} className="border border-white/10 rounded-lg p-3 flex items-center gap-3">
                        <span
                          className="w-10 h-10 rounded-full border border-white/20"
                          style={{ background: sw.color }}
                        />
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">{sw.label}</div>
                          <div className="text-xs font-mono">{sw.color}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Font samples */}
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-2">Polices</div>
                  <div className="border border-white/10 rounded-lg p-4 space-y-3">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">
                        Titres — {preview.fontDisplay || '(non définie)'}
                      </div>
                      <div
                        style={{
                          fontFamily: preview.fontDisplay || 'Cormorant Garamond, serif',
                          fontSize: '32px',
                          color: p.primary,
                        }}
                      >
                        Heureux Mariage
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">
                        Texte — {preview.fontBody || '(non définie)'}
                      </div>
                      <div
                        style={{
                          fontFamily: preview.fontBody || 'Inter, sans-serif',
                          fontSize: '14px',
                          color: p.bg === '#ffffff' || p.bg === '#fff' ? '#000' : '#fff',
                        }}
                      >
                        Bienvenue à notre mariage. Célébrons ensemble ce moment unique
                        rempli d&apos;amour et de joie.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mock hero section */}
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-2">
                    Aperçu Hero (maquette)
                  </div>
                  <div
                    className="rounded-lg border border-white/10 p-8 text-center"
                    style={{ background: p.bg }}
                  >
                    <div
                      style={{
                        fontFamily: preview.fontDisplay || 'Cormorant Garamond, serif',
                        color: p.primary,
                        fontSize: '40px',
                        lineHeight: 1.1,
                      }}
                    >
                      Marie &amp; Jean
                    </div>
                    <div
                      style={{
                        fontFamily: preview.fontBody || 'Inter, sans-serif',
                        color: '#fff',
                        opacity: 0.85,
                        fontSize: '14px',
                        marginTop: '8px',
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                      }}
                    >
                      12 Juin 2026 · Paris
                    </div>
                    <div
                      style={{
                        width: '60px',
                        height: '2px',
                        background: p.accent,
                        margin: '16px auto 0',
                      }}
                    />
                  </div>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground uppercase">Statut</div>
                    <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_BADGE[preview.status] || ''}`}>
                      {preview.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-muted-foreground uppercase">Built-in</div>
                    <span className="font-medium">{preview.isBuiltIn ? 'Oui' : 'Non'}</span>
                  </div>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
