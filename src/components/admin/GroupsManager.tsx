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
import { Plus, Pencil, Trash2, Loader2, Users, Tag } from 'lucide-react'
import { toast } from 'sonner'

/**
 * GroupsManager — CONS-5-CLIENT-BACKEND
 *
 * Manage guest groups (any categorisation useful for seating / messaging /
 * filtering: friends, colleagues, VIP, church, etc.). Different from Families
 * (blood-relation based) — Groups are organiser-defined.
 *
 * CRUD via /api/weddings/[id]/groups (and /groups/[groupId]).
 */

interface Group {
  id: string
  name: string
  color: string | null
  memberCount: number
  createdAt: string
}

interface Props {
  weddingId: string
}

export default function GroupsManager({ weddingId }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selected, setSelected] = useState<Group | null>(null)
  const [form, setForm] = useState({ name: '', color: '#d4a853' })

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/groups`)
      if (res.ok) {
        const json = await res.json()
        setGroups(json.groups || [])
      } else {
        toast.error('Erreur de chargement des groupes')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [weddingId])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const resetForm = () => {
    setForm({ name: '', color: '#d4a853' })
  }

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          color: form.color || null,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setGroups((prev) => [...prev, json.group].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Groupe créé')
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
      const res = await fetch(`/api/weddings/${weddingId}/groups/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          color: form.color || null,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setGroups((prev) =>
          prev
            .map((g) => (g.id === selected.id ? json.group : g))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        toast.success('Groupe mis à jour')
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
      const res = await fetch(`/api/weddings/${weddingId}/groups/${selected.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setGroups((prev) => prev.filter((g) => g.id !== selected.id))
        toast.success('Groupe supprimé')
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

  const openEdit = (g: Group) => {
    setSelected(g)
    setForm({ name: g.name, color: g.color || '#d4a853' })
    setShowEditDialog(true)
  }

  const openDelete = (g: Group) => {
    setSelected(g)
    setShowDeleteDialog(true)
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold gold-gradient font-display flex items-center gap-2">
            <Tag className="w-6 h-6" />
            Groupes
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Catégorisez vos invités par groupes (amis, collègues, VIP, église…).
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
          Nouveau groupe
        </Button>
      </div>

      {/* Stats */}
      <Card className="bg-white/[0.02] border-white/10">
        <CardContent className="pt-6 flex items-center gap-3">
          <Users className="w-8 h-8 text-gold-light" />
          <div>
            <div className="text-2xl font-bold">{groups.length}</div>
            <div className="text-xs text-muted-foreground">Groupes définis</div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-10 pb-10 text-center">
            <Tag className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Aucun groupe créé pour le moment.</p>
            <Button
              className="mt-4 bg-gradient-gold text-white"
              onClick={() => {
                resetForm()
                setShowAddDialog(true)
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Créer le premier groupe
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {groups.map((g) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="bg-white/[0.02] border-white/10 hover:border-gold-light/40 transition-colors h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base truncate flex items-center gap-2">
                        {g.color && (
                          <span
                            className="inline-block w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: g.color }}
                          />
                        )}
                        {g.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-muted-foreground">
                        {g.memberCount} invité{g.memberCount > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/15 hover:bg-white/5"
                        onClick={() => openEdit(g)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        onClick={() => openDelete(g)}
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
            <DialogTitle>Nouveau groupe</DialogTitle>
            <DialogDescription>
              Créez un groupe pour catégoriser vos invités (amis, collègues, VIP…).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="group-name">Nom du groupe</Label>
              <Input
                id="group-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex : Amis d’enfance"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-color">Couleur</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="group-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
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
            <DialogTitle>Modifier le groupe</DialogTitle>
            <DialogDescription>
              Mettez à jour le groupe « {selected?.name} ».
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="group-name-edit">Nom du groupe</Label>
              <Input
                id="group-name-edit"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-color-edit">Couleur</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="group-color-edit"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
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
            <DialogTitle>Supprimer le groupe ?</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de supprimer le groupe « {selected?.name} ».
              {selected && selected.memberCount > 0 && (
                <> Les {selected.memberCount} invités rattachés ne seront pas supprimés, ils seront simplement détachés de ce groupe.</>
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
