'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, Pencil, Trash2, Loader2, Users, Heart, Mail, Phone } from 'lucide-react'
import { toast } from 'sonner'

/**
 * FamiliesManager — CONS-5-CLIENT-BACKEND
 *
 * Manage guest families (group guests by family: bride side / groom side /
 * common). Each family has a name, a side (BRIDE/GROOM/COMMON), and an
 * optional contact (phone + email).
 *
 * CRUD via /api/weddings/[id]/families (and /families/[familyId]).
 * Tenant-scoped automatically via the admin page's fetch interceptor
 * (X-Wedding-Slug + CSRF + credentials).
 */

interface Family {
  id: string
  name: string
  side: string // BRIDE | GROOM | COMMON
  contactPhone: string | null
  contactEmail: string | null
  memberCount: number
  createdAt: string
}

interface Props {
  weddingId: string
}

const SIDE_LABELS: Record<string, string> = {
  BRIDE: 'Côté mariée',
  GROOM: 'Côté marié',
  COMMON: 'Commun',
}

const SIDE_BADGE: Record<string, string> = {
  BRIDE: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  GROOM: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  COMMON: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
}

export default function FamiliesManager({ weddingId }: Props) {
  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selected, setSelected] = useState<Family | null>(null)
  const [form, setForm] = useState({
    name: '',
    side: 'COMMON' as 'BRIDE' | 'GROOM' | 'COMMON',
    contactPhone: '',
    contactEmail: '',
  })

  const fetchFamilies = useCallback(async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/families`)
      if (res.ok) {
        const json = await res.json()
        setFamilies(json.families || [])
      } else {
        toast.error('Erreur de chargement des familles')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [weddingId])

  useEffect(() => {
    fetchFamilies()
  }, [fetchFamilies])

  const resetForm = () => {
    setForm({ name: '', side: 'COMMON', contactPhone: '', contactEmail: '' })
  }

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/families`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          side: form.side,
          contactPhone: form.contactPhone.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setFamilies((prev) => [...prev, json.family].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Famille créée')
        setShowAddDialog(false)
        resetForm()
      } else {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selected) return
    if (!form.name.trim()) {
      toast.error('Le nom est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/families/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          side: form.side,
          contactPhone: form.contactPhone.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setFamilies((prev) =>
          prev
            .map((f) => (f.id === selected.id ? json.family : f))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        toast.success('Famille mise à jour')
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
      const res = await fetch(`/api/weddings/${weddingId}/families/${selected.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setFamilies((prev) => prev.filter((f) => f.id !== selected.id))
        toast.success('Famille supprimée')
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

  const openEdit = (f: Family) => {
    setSelected(f)
    setForm({
      name: f.name,
      side: (f.side as 'BRIDE' | 'GROOM' | 'COMMON') || 'COMMON',
      contactPhone: f.contactPhone || '',
      contactEmail: f.contactEmail || '',
    })
    setShowEditDialog(true)
  }

  const openDelete = (f: Family) => {
    setSelected(f)
    setShowDeleteDialog(true)
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold gold-gradient font-display flex items-center gap-2">
            <Heart className="w-6 h-6" />
            Familles
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Regroupez vos invités par famille (côté mariée, côté marié, commun).
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
          Nouvelle famille
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <Users className="w-8 h-8 text-gold-light" />
            <div>
              <div className="text-2xl font-bold">{families.length}</div>
              <div className="text-xs text-muted-foreground">Familles</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <Heart className="w-8 h-8 text-rose-400" />
            <div>
              <div className="text-2xl font-bold">
                {families.filter((f) => f.side === 'BRIDE').length}
              </div>
              <div className="text-xs text-muted-foreground">Côté mariée</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <Heart className="w-8 h-8 text-sky-400" />
            <div>
              <div className="text-2xl font-bold">
                {families.filter((f) => f.side === 'GROOM').length}
              </div>
              <div className="text-xs text-muted-foreground">Côté marié</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : families.length === 0 ? (
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-10 pb-10 text-center">
            <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Aucune famille créée pour le moment.</p>
            <Button
              className="mt-4 bg-gradient-gold text-white"
              onClick={() => {
                resetForm()
                setShowAddDialog(true)
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Créer la première famille
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {families.map((f) => (
              <motion.div
                key={f.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="bg-white/[0.02] border-white/10 hover:border-gold-light/40 transition-colors h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base truncate">{f.name}</CardTitle>
                      <Badge variant="outline" className={SIDE_BADGE[f.side] || SIDE_BADGE.COMMON}>
                        {SIDE_LABELS[f.side] || f.side}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{f.memberCount} membre{f.memberCount > 1 ? 's' : ''}</span>
                    </div>
                    {f.contactPhone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        <span className="truncate">{f.contactPhone}</span>
                      </div>
                    )}
                    {f.contactEmail && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{f.contactEmail}</span>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/15 hover:bg-white/5"
                        onClick={() => openEdit(f)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        onClick={() => openDelete(f)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Supprimer
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle famille</DialogTitle>
            <DialogDescription>
              Créez une famille pour regrouper des invités (les mariés, les parents, etc.).
            </DialogDescription>
          </DialogHeader>
          <FamilyForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la famille</DialogTitle>
            <DialogDescription>
              Mettez à jour les informations de la famille « {selected?.name} ».
            </DialogDescription>
          </DialogHeader>
          <FamilyForm form={form} setForm={setForm} />
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
            <DialogTitle>Supprimer la famille ?</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de supprimer la famille « {selected?.name} ».
              {selected && selected.memberCount > 0 && (
                <> Les {selected.memberCount} invités rattachés ne seront pas supprimés, ils seront simplement détachés de cette famille.</>
              )}
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
function FamilyForm({
  form,
  setForm,
}: {
  form: {
    name: string
    side: 'BRIDE' | 'GROOM' | 'COMMON'
    contactPhone: string
    contactEmail: string
  }
  setForm: (
    f: {
      name: string
      side: 'BRIDE' | 'GROOM' | 'COMMON'
      contactPhone: string
      contactEmail: string
    },
  ) => void
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="family-name">Nom de la famille</Label>
        <Input
          id="family-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ex : Famille Rakotomalala"
        />
      </div>
      <div className="space-y-2">
        <Label>Côté</Label>
        <Select value={form.side} onValueChange={(v) => setForm({ ...form, side: v as 'BRIDE' | 'GROOM' | 'COMMON' })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BRIDE">Côté mariée</SelectItem>
            <SelectItem value="GROOM">Côté marié</SelectItem>
            <SelectItem value="COMMON">Commun</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="family-phone">Téléphone contact</Label>
          <Input
            id="family-phone"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            placeholder="+261 ..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="family-email">Email contact</Label>
          <Input
            id="family-email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            placeholder="famille@exemple.com"
          />
        </div>
      </div>
    </div>
  )
}
