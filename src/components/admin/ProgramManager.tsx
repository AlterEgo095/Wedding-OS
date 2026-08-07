'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  MapPin,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * ProgramManager — CONS-5-CLIENT-BACKEND
 *
 * Manage the wedding-day program (timeline of the day: ceremony, cocktail,
 * dinner, dance, etc.). Different from EventTimeline which is the love-story
 * timeline.
 *
 * Each entry: scheduledAt, title, description, location, iconName, sortOrder.
 * CRUD via /api/weddings/[id]/program (and /program/[itemId]).
 */

interface ProgramItem {
  id: string
  scheduledAt: string | null
  title: string
  description: string | null
  location: string | null
  iconName: string | null
  sortOrder: number
  createdAt: string
}

interface Props {
  weddingId: string
}

// A curated subset of Lucide icon names that make sense for a wedding program.
// The iconName is stored as a string and resolved by the public site at render
// time. We keep this list small for the dropdown.
const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: 'Heart', label: 'Cœur' },
  { value: 'Church', label: 'Église' },
  { value: 'Rings', label: 'Alliances' },
  { value: 'Wine', label: 'Vin / Cocktail' },
  { value: 'UtensilsCrossed', label: 'Dîner' },
  { value: 'Cake', label: 'Gâteau' },
  { value: 'Music', label: 'Musique / Danse' },
  { value: 'Camera', label: 'Photos' },
  { value: 'Flower2', label: 'Fleurs' },
  { value: 'MapPin', label: 'Lieu' },
  { value: 'Sparkles', label: 'Surprise' },
  { value: 'Gift', label: 'Cadeaux' },
]

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

export default function ProgramManager({ weddingId }: Props) {
  const [items, setItems] = useState<ProgramItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selected, setSelected] = useState<ProgramItem | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduledAt: '', // datetime-local string
    location: '',
    iconName: '',
    sortOrder: 0,
  })

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/program`)
      if (res.ok) {
        const json = await res.json()
        setItems(json.program || [])
      } else {
        toast.error('Erreur de chargement du programme')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [weddingId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      scheduledAt: '',
      location: '',
      iconName: '',
      sortOrder: items.length, // append at end by default
    })
  }

  const buildPayload = () => ({
    title: form.title.trim(),
    description: form.description.trim() || null,
    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    location: form.location.trim() || null,
    iconName: form.iconName || null,
    sortOrder: form.sortOrder,
  })

  const handleAdd = async () => {
    if (!form.title.trim()) {
      toast.error('Le titre est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/program`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (res.ok) {
        const json = await res.json()
        setItems((prev) => [...prev, json.programItem])
        toast.success('Élément ajouté au programme')
        setShowAddDialog(false)
        resetForm()
      } else {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error || 'Erreur lors de l’ajout')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selected) return
    if (!form.title.trim()) {
      toast.error('Le titre est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/program/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (res.ok) {
        const json = await res.json()
        setItems((prev) =>
          prev
            .map((p) => (p.id === selected.id ? json.programItem : p))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        )
        toast.success('Élément mis à jour')
        setShowEditDialog(false)
        setSelected(null)
        resetForm()
      } else {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error || 'Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/program/${selected.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setItems((prev) => prev.filter((p) => p.id !== selected.id))
        toast.success('Élément supprimé')
        setShowDeleteDialog(false)
        setSelected(null)
      } else {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  /** Move an item up/down by swapping sortOrder with neighbour. */
  const moveItem = async (item: ProgramItem, direction: 'up' | 'down') => {
    const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = sorted.findIndex((p) => p.id === item.id)
    if (idx < 0) return
    const swapWith = direction === 'up' ? sorted[idx - 1] : sorted[idx + 1]
    if (!swapWith) return
    // Optimistic: swap sortOrder values locally
    const newItemSort = swapWith.sortOrder
    const newSwapSort = item.sortOrder
    setItems((prev) =>
      prev
        .map((p) => {
          if (p.id === item.id) return { ...p, sortOrder: newItemSort }
          if (p.id === swapWith.id) return { ...p, sortOrder: newSwapSort }
          return p
        })
        .sort((a, b) => a.sortOrder - b.sortOrder),
    )
    // Persist both updates
    try {
      await Promise.all([
        fetch(`/api/weddings/${weddingId}/program/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: newItemSort }),
        }),
        fetch(`/api/weddings/${weddingId}/program/${swapWith.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: newSwapSort }),
        }),
      ])
    } catch {
      toast.error('Erreur de connexion (déplacement)')
      fetchItems()
    }
  }

  const openEdit = (p: ProgramItem) => {
    setSelected(p)
    setForm({
      title: p.title,
      description: p.description || '',
      scheduledAt: p.scheduledAt
        ? new Date(p.scheduledAt).toISOString().slice(0, 16)
        : '',
      location: p.location || '',
      iconName: p.iconName || '',
      sortOrder: p.sortOrder,
    })
    setShowEditDialog(true)
  }

  const openDelete = (p: ProgramItem) => {
    setSelected(p)
    setShowDeleteDialog(true)
  }

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold gold-gradient font-display flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Programme du jour
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Définissez le déroulé de la journée (cérémonie, cocktail, dîner, danse…).
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm()
            setShowAddDialog(true)
          }}
          className="bg-gradient-gold text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvel élément
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : sortedItems.length === 0 ? (
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-10 pb-10 text-center">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Le programme est vide pour le moment.</p>
            <Button
              className="mt-4 bg-gradient-gold text-white"
              onClick={() => {
                resetForm()
                setShowAddDialog(true)
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter le premier élément
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {sortedItems.map((p, idx) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <Card className="bg-white/[0.02] border-white/10 hover:border-gold-light/40 transition-colors">
                  <CardContent className="pt-4 pb-4 flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:bg-white/5"
                        disabled={idx === 0}
                        onClick={() => moveItem(p, 'up')}
                        title="Monter"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <GripVertical className="w-4 h-4 text-muted-foreground/40" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:bg-white/5"
                        disabled={idx === sortedItems.length - 1}
                        onClick={() => moveItem(p, 'down')}
                        title="Descendre"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex flex-col items-center gap-1 pt-2 min-w-16">
                      <Clock className="w-5 h-5 text-gold-light" />
                      <span className="text-sm font-medium tabular-nums">
                        {formatTime(p.scheduledAt)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base truncate">{p.title}</h3>
                        {p.iconName && (
                          <Badge variant="outline" className="text-muted-foreground shrink-0">
                            {p.iconName}
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {p.description}
                        </p>
                      )}
                      {p.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{p.location}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 hover:bg-white/5"
                        onClick={() => openEdit(p)}
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-rose-300 hover:bg-rose-500/10"
                        onClick={() => openDelete(p)}
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvel élément de programme</DialogTitle>
            <DialogDescription>
              Ajoutez une étape au déroulé de la journée.
            </DialogDescription>
          </DialogHeader>
          <ProgramForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier l’élément</DialogTitle>
            <DialogDescription>
              Mettez à jour « {selected?.title} ».
            </DialogDescription>
          </DialogHeader>
          <ProgramForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cet élément ?</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de supprimer « {selected?.title} » du programme.
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleDelete}
              disabled={saving}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Form sub-component ─────────────────────────────────────────────────────
function ProgramForm({
  form,
  setForm,
}: {
  form: {
    title: string
    description: string
    scheduledAt: string
    location: string
    iconName: string
    sortOrder: number
  }
  setForm: (
    f: {
      title: string
      description: string
      scheduledAt: string
      location: string
      iconName: string
      sortOrder: number
    },
  ) => void
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="prog-title">Titre</Label>
        <Input
          id="prog-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Ex : Cérémonie religieuse"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="prog-time">Heure prévue</Label>
          <Input
            id="prog-time"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prog-location">Lieu</Label>
          <Input
            id="prog-location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Ex : Église Saint-Augustin"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prog-desc">Description</Label>
        <Textarea
          id="prog-desc"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Détails (durée, intervenants, etc.)"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Icône (affichée côté public)</Label>
          <Select
            value={form.iconName || '__none__'}
            onValueChange={(v) => setForm({ ...form, iconName: v === '__none__' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Aucune" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Aucune</SelectItem>
              {ICON_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="prog-sort">Position (ordre)</Label>
          <Input
            id="prog-sort"
            type="number"
            min="0"
            value={form.sortOrder}
            onChange={(e) =>
              setForm({ ...form, sortOrder: parseInt(e.target.value || '0', 10) || 0 })
            }
          />
        </div>
      </div>
    </div>
  )
}
