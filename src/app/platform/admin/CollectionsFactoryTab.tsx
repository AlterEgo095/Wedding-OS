'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit, Trash2, Rocket, Eye, Star, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTIONS FACTORY TAB — Real CRUD (Slice 3)
// ══════════════════════════════════════════════════════════════════════════════
// Reads from /api/collections (DB source of truth). Supports:
//   - Create new Collection (name, slug, category, theme colors/fonts/layout)
//   - Edit Collection metadata + theme
//   - Publish/Unpublish
//   - Delete (soft — archive)
//
// After creation, a collection can be assigned to a wedding via the Designer tab
// (which calls /api/collections/deploy).
// ══════════════════════════════════════════════════════════════════════════════

interface DBCollection {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  tier: string
  status: string
  version: string
  isActive: boolean
  isPublished: boolean
  sortOrder: number
  themeSeed: string
  luxuryPreset: string | null
  thumbnailUrl: string | null
  createdAt: string
}

interface ThemeSeed {
  primaryColor: string
  accentColor: string
  fontDisplay: string
  fontBody: string
  layout: string
}

const LAYOUTS = [
  { value: 'royal', label: 'Royal — 6 sections, luxe cérémoniel' },
  { value: 'classic', label: 'Classique — 6 sections, élégant' },
  { value: 'minimal', label: 'Minimal — 4 sections, éditorial' },
  { value: 'destination', label: 'Destination — 6 sections, galerie en premier' },
  { value: 'modern', label: 'Moderne — 5 sections, programme en premier' },
]

const CATEGORIES = ['LUXURY', 'CLASSIC', 'AFRICAN', 'MINIMAL', 'DESTINATION', 'CUSTOM']

export function CollectionsFactoryTab() {
  const [collections, setCollections] = useState<DBCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<DBCollection | null>(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    category: 'CUSTOM',
    primaryColor: '#D4AF37',
    accentColor: '#1a1a2e',
    fontDisplay: 'Cormorant Garamond',
    fontBody: 'Inter',
    layout: 'classic',
  })

  const fetchCollections = useCallback(async () => {
    try {
      // Fetch ALL collections (including unpublished) — platform admin view
      const res = await fetch('/api/platform/collections?includeDrafts=true')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setCollections(Array.isArray(data) ? data : data.collections || [])
    } catch {
      toast.error('Erreur lors du chargement des collections')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCollections() }, [fetchCollections])

  const resetForm = () => {
    setForm({
      name: '', slug: '', description: '', category: 'CUSTOM',
      primaryColor: '#D4AF37', accentColor: '#1a1a2e',
      fontDisplay: 'Cormorant Garamond', fontBody: 'Inter', layout: 'classic',
    })
    setEditing(null)
  }

  const openCreate = () => {
    resetForm()
    setShowCreate(true)
  }

  const openEdit = (c: DBCollection) => {
    const ts: ThemeSeed = JSON.parse(c.themeSeed || '{}')
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      category: c.category,
      primaryColor: ts.primaryColor || '#D4AF37',
      accentColor: ts.accentColor || '#1a1a2e',
      fontDisplay: ts.fontDisplay || 'Cormorant Garamond',
      fontBody: ts.fontBody || 'Inter',
      layout: ts.layout || 'classic',
    })
    setEditing(c)
    setShowCreate(true)
  }

  const saveCollection = async () => {
    if (!form.name || !form.slug) {
      toast.error('Nom et slug sont requis')
      return
    }

    const themeSeed: ThemeSeed = {
      primaryColor: form.primaryColor,
      accentColor: form.accentColor,
      fontDisplay: form.fontDisplay,
      fontBody: form.fontBody,
      layout: form.layout,
    }

    const body = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      category: form.category,
      themeSeed,
    }

    try {
      if (editing) {
        // Update existing
        const res = await fetch(`/api/collections/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error || 'Failed')
        }
        toast.success('Collection mise à jour')
      } else {
        // Create new
        const res = await fetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error || 'Failed')
        }
        toast.success('Collection créée')
      }
      setShowCreate(false)
      resetForm()
      fetchCollections()
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'))
    }
  }

  const publishCollection = async (c: DBCollection) => {
    try {
      const res = await fetch(`/api/collections/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: true, status: 'PUBLIE' }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(`${c.name} publiée`)
      fetchCollections()
    } catch {
      toast.error('Erreur lors de la publication')
    }
  }

  const deleteCollection = async (c: DBCollection) => {
    if (!confirm(`Archiver la collection "${c.name}" ?`)) return
    try {
      const res = await fetch(`/api/collections/${c.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed')
      }
      toast.success(`${c.name} archivée`)
      fetchCollections()
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'))
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif flex items-center gap-2">
            <Layers className="w-6 h-6" /> Collection Factory
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Créez et gérez des Collections depuis l'interface — aucune modification de code
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nouvelle Collection
        </Button>
      </div>

      {/* Collections grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {collections.map(c => {
          const ts: ThemeSeed = JSON.parse(c.themeSeed || '{}')
          return (
            <Card key={c.id} className="p-4 space-y-3">
              {/* Preview swatch */}
              <div
                className="w-full h-24 rounded-lg flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${ts.primaryColor || '#ccc'}, ${ts.accentColor || '#333'})`,
                }}
              >
                <span className="text-white font-serif text-lg drop-shadow-lg" style={{ fontFamily: ts.fontDisplay }}>
                  {c.name}
                </span>
              </div>

              {/* Info */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">{c.name}</h3>
                  <Badge variant="outline" className="text-xs">{c.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">/{c.slug} · v{c.version}</p>
                <p className="text-xs text-muted-foreground">
                  Layout: {ts.layout || 'classic'} · {ts.primaryColor}
                </p>
              </div>

              {/* Status badges */}
              <div className="flex gap-1 flex-wrap">
                {c.isPublished ? (
                  <Badge className="bg-green-100 text-green-800 text-xs">Publiée</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 text-xs">Brouillon</Badge>
                )}
                <Badge variant="outline" className="text-xs">{c.status}</Badge>
              </div>

              {/* Actions */}
              <div className="flex gap-1 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(c)}>
                  <Edit className="w-3 h-3 mr-1" /> Éditer
                </Button>
                {!c.isPublished && (
                  <Button variant="outline" size="sm" onClick={() => publishCollection(c)}>
                    <Rocket className="w-3 h-3" />
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => deleteCollection(c)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {collections.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucune collection. Créez la première !</p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Éditer la Collection' : 'Nouvelle Collection'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nom</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Royal Sapphire" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="royal-sapphire" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Layout (structure de page)</Label>
              <Select value={form.layout} onValueChange={v => setForm({ ...form, layout: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LAYOUTS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Couleur primaire</Label>
              <div className="flex gap-2">
                <Input type="color" value={form.primaryColor} onChange={e => setForm({ ...form, primaryColor: e.target.value })} className="w-12 h-10 p-1" />
                <Input value={form.primaryColor} onChange={e => setForm({ ...form, primaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Couleur d'accent</Label>
              <div className="flex gap-2">
                <Input type="color" value={form.accentColor} onChange={e => setForm({ ...form, accentColor: e.target.value })} className="w-12 h-10 p-1" />
                <Input value={form.accentColor} onChange={e => setForm({ ...form, accentColor: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Police d'affichage</Label>
              <Input value={form.fontDisplay} onChange={e => setForm({ ...form, fontDisplay: e.target.value })} />
            </div>
            <div>
              <Label>Police de corps</Label>
              <Input value={form.fontBody} onChange={e => setForm({ ...form, fontBody: e.target.value })} />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg p-4 text-center" style={{
            background: `linear-gradient(135deg, ${form.primaryColor}, ${form.accentColor})`,
          }}>
            <span className="text-white text-xl" style={{ fontFamily: form.fontDisplay }}>
              {form.name || 'Aperçu'}
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm() }}>
              Annuler
            </Button>
            <Button onClick={saveCollection}>
              {editing ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
