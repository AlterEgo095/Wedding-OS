'use client'

// ════════════════════════════════════════════════════════════════════════════
// ProductManager — P3.3 Production Studio panel.
// CRUD for sellable pipeline artifacts (Products). A Product bundles 1+
// Collections + add-ons + pricing + licensing. It sits ABOVE Collection in
// the pipeline vision; on purchase an Entitlement row is created with
// productId set, and the resolveProducts pipeline stage embeds the Product
// into PublishedConfig.product.
//
// Routes consumed:
//   GET    /api/platform/products?status=&search=&licence=&page=&limit=
//   POST   /api/platform/products
//   GET    /api/platform/products/{id}
//   PATCH  /api/platform/products/{id}
//   DELETE /api/platform/products/{id}     (soft → status=ARCHIVED)
//   GET    /api/platform/collections?includeDrafts=true  (populate multi-select)
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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
  Package,
  Plus,
  Edit,
  Archive,
  DollarSign,
  RefreshCw,
  Loader2,
  MoreHorizontal,
  X,
} from 'lucide-react'


// ─── Types ────────────────────────────────────────────────────────────────────

interface AddOn {
  type: 'SMS_CREDITS' | 'EXPORT_CREDITS' | 'QR_CREDITS' | 'WHATSAPP_CREDITS'
  quantity: number
}

interface Feature {
  key: string
  value: string
}

interface BundleJson {
  collectionIds: string[]
  addOns: AddOn[]
  features: Feature[]
}

interface ProductRow {
  id: string
  name: string
  slug: string
  description: string
  bundleJson: BundleJson
  priceCents: number
  currency: string
  licence: string
  status: string
  createdAt: string
  updatedAt: string
}

interface CollectionOption {
  id: string
  slug: string
  name: string
  tier?: string
}

type Status = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type Licence = 'STANDARD' | 'EXCLUSIVE' | 'CUSTOM'
type Currency = 'USD' | 'EUR' | 'CDF'

interface FormState {
  name: string
  slug: string
  description: string
  priceDollars: string // displayed in dollars; converted × 100 to cents on submit
  currency: Currency
  licence: Licence
  status: Status
  collectionIds: string[]
  addOns: AddOn[]
  features: Feature[]
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  description: '',
  priceDollars: '0',
  currency: 'USD',
  licence: 'STANDARD',
  status: 'DRAFT',
  collectionIds: [],
  addOns: [],
  features: [],
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const LICENCE_BADGE: Record<string, string> = {
  STANDARD: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  EXCLUSIVE: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
  CUSTOM: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  CDF: 'FC',
}

const ADD_ON_TYPES: AddOn['type'][] = ['SMS_CREDITS', 'EXPORT_CREDITS', 'QR_CREDITS', 'WHATSAPP_CREDITS']

// ─── Helpers ───────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatPrice(cents: number, currency: string): string {
  const sym = (CURRENCY_SYMBOL as Record<string, string>)[currency] ?? ''
  const dollars = (cents / 100).toFixed(2)
  // For FC (CDF), put symbol after the number; for USD/EUR, before.
  if (currency === 'CDF') return `${dollars} ${sym}`
  return `${sym}${dollars}`
}

function bundleCounts(b: BundleJson | undefined | null): { collections: number; addOns: number; features: number } {
  if (!b) return { collections: 0, addOns: 0, features: 0 }
  return {
    collections: Array.isArray(b.collectionIds) ? b.collectionIds.length : 0,
    addOns: Array.isArray(b.addOns) ? b.addOns.length : 0,
    features: Array.isArray(b.features) ? b.features.length : 0,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductManager({ csrfToken }: { csrfToken: string }) {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [licenceFilter, setLicenceFilter] = useState<string>('ALL')

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [slugTouched, setSlugTouched] = useState(false)

  const [collections, setCollections] = useState<CollectionOption[]>([])
  const [loadingCollections, setLoadingCollections] = useState(false)

  // ── Load collections (for the multi-select). Fire once on mount. ─────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingCollections(true)
      try {
        const res = await fetch('/api/platform/collections?includeDrafts=true', { credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        const opts: CollectionOption[] = (json.collections || []).map((c: { id: string; slug: string; name: string; tier?: string }) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          tier: c.tier,
        }))
        if (!cancelled) setCollections(opts)
      } catch {
        // Non-fatal — the multi-select will just show an empty list.
      } finally {
        if (!cancelled) setLoadingCollections(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Load products ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      search,
      status: statusFilter,
      licence: licenceFilter,
    })
    try {
      const res = await fetch(`/api/platform/products?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setProducts(json.products || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des produits')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, licenceFilter])

  useEffect(() => { load() }, [load])

  // ── Modal handlers ────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSlugTouched(false)
    setShowDialog(true)
  }

  const openEdit = (p: ProductRow) => {
    setEditing(p)
    setForm({
      name: p.name,
      slug: p.slug,
      description: p.description,
      priceDollars: (p.priceCents / 100).toString(),
      currency: (p.currency as Currency) || 'USD',
      licence: (p.licence as Licence) || 'STANDARD',
      status: (p.status as Status) || 'DRAFT',
      collectionIds: Array.isArray(p.bundleJson?.collectionIds) ? p.bundleJson.collectionIds : [],
      addOns: Array.isArray(p.bundleJson?.addOns) ? p.bundleJson.addOns : [],
      features: Array.isArray(p.bundleJson?.features) ? p.bundleJson.features : [],
    })
    setSlugTouched(true) // don't auto-overwrite slug on edit
    setShowDialog(true)
  }

  const onNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: slugTouched ? f.slug : slugify(name),
    }))
  }

  const onSlugChange = (slug: string) => {
    setSlugTouched(true)
    setForm((f) => ({ ...f, slug: slugify(slug) }))
  }

  const toggleCollection = (id: string) => {
    setForm((f) => ({
      ...f,
      collectionIds: f.collectionIds.includes(id)
        ? f.collectionIds.filter((x) => x !== id)
        : [...f.collectionIds, id],
    }))
  }

  const addAddOn = () => {
    setForm((f) => ({
      ...f,
      addOns: [...f.addOns, { type: 'SMS_CREDITS', quantity: 0 }],
    }))
  }

  const updateAddOn = (idx: number, patch: Partial<AddOn>) => {
    setForm((f) => ({
      ...f,
      addOns: f.addOns.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }))
  }

  const removeAddOn = (idx: number) => {
    setForm((f) => ({ ...f, addOns: f.addOns.filter((_, i) => i !== idx) }))
  }

  const addFeature = () => {
    setForm((f) => ({
      ...f,
      features: [...f.features, { key: '', value: '' }],
    }))
  }

  const updateFeature = (idx: number, patch: Partial<Feature>) => {
    setForm((f) => ({
      ...f,
      features: f.features.map((ft, i) => (i === idx ? { ...ft, ...patch } : ft)),
    }))
  }

  const removeFeature = (idx: number) => {
    setForm((f) => ({ ...f, features: f.features.filter((_, i) => i !== idx) }))
  }

  // ── Submit (create or patch) ──────────────────────────────────────────────
  const submit = async () => {
    if (!form.name || !form.slug) {
      toast.error('Nom et slug requis')
      return
    }
    const priceCents = Math.round((parseFloat(form.priceDollars) || 0) * 100)
    if (priceCents < 0 || !Number.isFinite(priceCents)) {
      toast.error('Prix invalide')
      return
    }

    const payload = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      priceCents,
      currency: form.currency,
      licence: form.licence,
      status: form.status,
      bundleJson: {
        collectionIds: form.collectionIds,
        addOns: form.addOns.filter((a) => a.quantity > 0),
        features: form.features.filter((f) => f.key.trim() !== ''),
      },
    }

    setSaving(true)
    try {
      const url = editing
        ? `/api/platform/products/${editing.id}`
        : '/api/platform/products'
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
      toast.success(editing ? 'Produit mis à jour' : 'Produit créé')
      setShowDialog(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  // ── Archive (soft-delete) ──────────────────────────────────────────────────
  const archive = async (p: ProductRow) => {
    if (!confirm(`Archiver le produit « ${p.name} » ? Son statut passera à ARCHIVED.`)) return
    try {
      const res = await fetch(`/api/platform/products/${p.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success('Produit archivé')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-400" />
            Produits
          </h2>
          <p className="text-xs text-muted-foreground">
            Artifacts pipeline vendables (bundle Collections + add-ons + prix + licence).
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau produit
        </Button>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          {/* Filters */}
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
            <Select value={licenceFilter} onValueChange={(v) => { setLicenceFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Licence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les licences</SelectItem>
                <SelectItem value="STANDARD">STANDARD</SelectItem>
                <SelectItem value="EXCLUSIVE">EXCLUSIVE</SelectItem>
                <SelectItem value="CUSTOM">CUSTOM</SelectItem>
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
          ) : products.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Aucun produit. Cliquez sur « Nouveau produit » pour en créer un.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Prix</TableHead>
                    <TableHead>Licence</TableHead>
                    <TableHead className="text-center">Collections</TableHead>
                    <TableHead className="text-center">Add-ons</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const counts = bundleCounts(p.bundleJson)
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.slug}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_BADGE[p.status] || ''}`}>
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <DollarSign className="w-3 h-3 text-emerald-400" />
                            {formatPrice(p.priceCents, p.currency)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] uppercase ${LICENCE_BADGE[p.licence] || ''}`}>
                            {p.licence}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{counts.collections}</TableCell>
                        <TableCell className="text-center tabular-nums">{counts.addOns}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(p)}>
                                <Edit className="w-3.5 h-3.5 mr-2" />
                                Éditer
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-amber-400"
                                disabled={p.status === 'ARCHIVED'}
                                onClick={() => archive(p)}
                              >
                                <Archive className="w-3.5 h-3.5 mr-2" />
                                Archiver
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{total} produit(s) au total</p>
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              {editing ? 'Éditer le produit' : 'Nouveau produit'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name + slug */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="prod-name">Nom</Label>
                <Input
                  id="prod-name"
                  value={form.name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Royal Gold Complete"
                />
              </div>
              <div>
                <Label htmlFor="prod-slug">Slug</Label>
                <Input
                  id="prod-slug"
                  value={form.slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  placeholder="royal-gold-complete"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="prod-desc">Description</Label>
              <Textarea
                id="prod-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Price + currency + licence + status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label htmlFor="prod-price">Prix (devise)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    id="prod-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.priceDollars}
                    onChange={(e) => setForm({ ...form, priceDollars: e.target.value })}
                    className="pl-7 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <Label>Devise</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="CDF">CDF (FC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Licence</Label>
                <Select value={form.licence} onValueChange={(v) => setForm({ ...form, licence: v as Licence })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">STANDARD</SelectItem>
                    <SelectItem value="EXCLUSIVE">EXCLUSIVE</SelectItem>
                    <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="PUBLISHED">Publié</SelectItem>
                    <SelectItem value="ARCHIVED">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* bundleJson — collections multi-select */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Collections du bundle ({form.collectionIds.length})</Label>
                {loadingCollections && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="rounded-md border border-white/10 max-h-48">
                <ScrollArea className="h-48">
                  {collections.length === 0 && !loadingCollections ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      Aucune collection disponible. Créez d&apos;abord des Collections.
                    </p>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {collections.map((c) => {
                        const checked = form.collectionIds.includes(c.id)
                        return (
                          <li key={c.id}>
                            <label
                              className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer text-sm"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleCollection(c.id)}
                              />
                              <span className="font-medium">{c.name}</span>
                              <span className="font-mono text-xs text-muted-foreground ml-1">{c.slug}</span>
                              {c.tier && (
                                <Badge variant="outline" className="ml-auto text-[10px] uppercase">
                                  {c.tier}
                                </Badge>
                              )}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* bundleJson — add-ons */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Add-ons ({form.addOns.length})</Label>
                <Button variant="outline" size="sm" onClick={addAddOn}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Ajouter
                </Button>
              </div>
              {form.addOns.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aucun add-on.</p>
              ) : (
                <ul className="space-y-2">
                  {form.addOns.map((a, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Select
                        value={a.type}
                        onValueChange={(v) => updateAddOn(idx, { type: v as AddOn['type'] })}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ADD_ON_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        value={a.quantity}
                        onChange={(e) => updateAddOn(idx, { quantity: parseInt(e.target.value || '0', 10) || 0 })}
                        className="w-28 tabular-nums"
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeAddOn(idx)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* bundleJson — features */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Features ({form.features.length})</Label>
                <Button variant="outline" size="sm" onClick={addFeature}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Ajouter
                </Button>
              </div>
              {form.features.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aucune feature.</p>
              ) : (
                <ul className="space-y-2">
                  {form.features.map((f, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Input
                        value={f.key}
                        onChange={(e) => updateFeature(idx, { key: e.target.value })}
                        placeholder="CUSTOM_DOMAIN"
                        className="font-mono text-xs"
                      />
                      <Input
                        value={f.value}
                        onChange={(e) => updateFeature(idx, { value: e.target.value })}
                        placeholder="true"
                        className="font-mono text-xs"
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFeature(idx)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
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
    </div>
  )
}
