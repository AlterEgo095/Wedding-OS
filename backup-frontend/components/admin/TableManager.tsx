'use client'

import { useState, useEffect } from 'react'
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus, Pencil, Trash2, Loader2, Users, Grid3X3
} from 'lucide-react'
import { toast } from 'sonner'

interface TableInfo {
  id: string
  name: string
  number: number
  capacity: number
  guestCount: number
  location: string | null
  createdAt: string
}

interface GuestInfo {
  id: string
  firstName: string
  lastName: string
  seats: number
  category: string
  tableId: string | null
}

interface TableManagerProps {
  token: string
  onSessionExpired: () => void
}

export default function TableManager({ token, onSessionExpired }: TableManagerProps) {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [guests, setGuests] = useState<GuestInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showGuestDialog, setShowGuestDialog] = useState(false)
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
  const [tableGuests, setTableGuests] = useState<GuestInfo[]>([])

  // Form
  const [form, setForm] = useState({
    name: '',
    number: 0,
    capacity: 8,
  })

  // Move guest dialog
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [movingGuest, setMovingGuest] = useState<GuestInfo | null>(null)
  const [targetTableId, setTargetTableId] = useState('')

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/tables', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { onSessionExpired(); return }
      if (res.ok) {
        const json = await res.json()
        setTables(json.tables)
      }
    } catch {
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllGuests = async () => {
    try {
      const res = await fetch('/api/guests?limit=500', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const json = await res.json()
        setGuests(json.guests.map((g: { id: string; firstName: string; lastName: string; seats: number; category: string; tableId: string | null }) => ({
          id: g.id,
          firstName: g.firstName,
          lastName: g.lastName,
          seats: g.seats,
          category: g.category,
          tableId: g.tableId,
        })))
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchTables()
    fetchAllGuests()
  }, [token])

  const resetForm = () => {
    setForm({ name: '', number: 0, capacity: 8 })
  }

  const handleAdd = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Table ajoutée')
        setShowAddDialog(false)
        resetForm()
        fetchTables()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedTable) return
    setSaving(true)
    try {
      const res = await fetch('/api/tables', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: selectedTable.id, ...form }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Table modifiée')
        setShowEditDialog(false)
        setSelectedTable(null)
        resetForm()
        fetchTables()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedTable) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tables?id=${selectedTable.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Table supprimée')
        setShowDeleteDialog(false)
        setSelectedTable(null)
        fetchTables()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const openEditDialog = (table: TableInfo) => {
    setSelectedTable(table)
    setForm({
      name: table.name,
      number: table.number,
      capacity: table.capacity,
    })
    setShowEditDialog(true)
  }

  const openGuestDialog = (table: TableInfo) => {
    setSelectedTable(table)
    const tGuests = guests.filter(g => g.tableId === table.id)
    setTableGuests(tGuests)
    setShowGuestDialog(true)
  }

  const openMoveDialog = (guest: GuestInfo) => {
    setMovingGuest(guest)
    setTargetTableId('')
    setShowMoveDialog(true)
  }

  const handleMoveGuest = async () => {
    if (!movingGuest || !targetTableId) return
    setSaving(true)
    try {
      const actualTableId = targetTableId === 'none' ? null : targetTableId
      const res = await fetch(`/api/guests/${movingGuest.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tableId: actualTableId }),
      })
      if (res.ok) {
        toast.success('Invité déplacé')
        setShowMoveDialog(false)
        setMovingGuest(null)
        await fetchTables()
        await fetchAllGuests()
        if (selectedTable) {
          const tGuests = guests.filter(g => g.tableId === selectedTable.id)
          setTableGuests(tGuests)
        }
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const getTableColor = (guestCount: number, capacity: number) => {
    if (guestCount >= capacity) return 'border-green-500/50 bg-green-500/10'
    if (guestCount > 0) return 'border-amber-500/50 bg-amber-500/10'
    return 'border-white/10 bg-white/5'
  }

  const getTableDotColor = (guestCount: number, capacity: number) => {
    if (guestCount >= capacity) return 'bg-green-500'
    if (guestCount > 0) return 'bg-amber-500'
    return 'bg-white/30'
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestion des Tables</h2>
          <p className="text-sm text-muted-foreground">{tables.length} table{tables.length > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true) }} size="sm" className="bg-gradient-gold text-white">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Visual Floor Plan */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Grid3X3 className="w-4 h-4" /> Plan de salle
        </h3>
        {tables.length === 0 ? (
          <Card className="glass-card gold-border border-0">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Grid3X3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune table configurée</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            <AnimatePresence>
              {tables.map((table, i) => (
                <motion.div
                  key={table.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card
                    className={`glass-card border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${getTableColor(table.guestCount, table.capacity)}`}
                    onClick={() => openGuestDialog(table)}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center">
                      {/* Circular table representation */}
                      <div className="w-16 h-16 rounded-full border-2 border-white/20 flex items-center justify-center mb-3 relative">
                        <div className={`w-2 h-2 rounded-full absolute top-1 right-1 ${getTableDotColor(table.guestCount, table.capacity)}`} />
                        <span className="text-lg font-bold">#{table.number}</span>
                      </div>
                      <p className="font-medium text-sm truncate w-full">{table.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Users className="w-3 h-3 inline mr-1" />
                        {table.guestCount}/{table.capacity}
                      </p>
                      <div className="flex gap-1 mt-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); openEditDialog(table) }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-300"
                          onClick={(e) => { e.stopPropagation(); setSelectedTable(table); setShowDeleteDialog(true) }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Complète</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Partielle</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/30" /> Vide</span>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Ajouter une table</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Table 1" />
            </div>
            <div className="space-y-2">
              <Label>Numéro *</Label>
              <Input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Capacité</Label>
              <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 8 })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !form.name} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Modifier la table</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Numéro *</Label>
              <Input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Capacité</Label>
              <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 8 })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>Annuler</Button>
            <Button onClick={handleEdit} disabled={saving || !form.name} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer <strong>{selectedTable?.name}</strong> ?
          </p>
          {selectedTable && selectedTable.guestCount > 0 && (
            <p className="text-xs text-amber-400">
              ⚠ Cette table a {selectedTable.guestCount} invité{selectedTable.guestCount > 1 ? 's' : ''} assigné{selectedTable.guestCount > 1 ? 's' : ''}. Réassignez-les d&apos;abord.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving || (selectedTable?.guestCount ?? 0) > 0}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest List for Table Dialog */}
      <Dialog open={showGuestDialog} onOpenChange={setShowGuestDialog}>
        <DialogContent className="glass-card gold-border max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-gradient">
              {selectedTable?.name} — Invités
            </DialogTitle>
          </DialogHeader>
          {tableGuests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun invité assigné</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tableGuests.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <div>
                    <p className="text-sm font-medium">{g.firstName} {g.lastName}</p>
                    <p className="text-xs text-muted-foreground">{g.seats} place{g.seats > 1 ? 's' : ''}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openMoveDialog(g)} className="text-gold">
                    Déplacer
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Move Guest Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Déplacer l&apos;invité</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Déplacer <strong>{movingGuest?.firstName} {movingGuest?.lastName}</strong> vers :
          </p>
          <Select value={targetTableId} onValueChange={setTargetTableId}>
            <SelectTrigger><SelectValue placeholder="Sélectionner une table" /></SelectTrigger>
            <SelectContent>
              {tables
                .filter(t => t.id !== selectedTable?.id)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} (#{t.number}) — {t.guestCount}/{t.capacity}
                  </SelectItem>
                ))}
              <SelectItem value="none">Aucune table</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowMoveDialog(false)}>Annuler</Button>
            <Button onClick={handleMoveGuest} disabled={saving || !targetTableId} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Déplacer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
