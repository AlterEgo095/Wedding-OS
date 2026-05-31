'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus, Pencil, Trash2, Loader2, Clock, ArrowUp, ArrowDown
} from 'lucide-react'
import { toast } from 'sonner'

interface TimelineEvent {
  id: string
  time: string
  activity: string
  location: string | null
  description: string | null
  order: number
  createdAt: string
}

interface TimelineManagerProps {
  token: string
}

export default function TimelineManager({ token }: TimelineManagerProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)

  // Form
  const [form, setForm] = useState({
    time: '',
    activity: '',
    location: '',
    description: '',
    order: 0,
  })

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/timeline')
      if (res.ok) {
        const json = await res.json()
        setEvents(json.events)
      }
    } catch {
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const resetForm = () => {
    setForm({ time: '', activity: '', location: '', description: '', order: 0 })
  }

  const handleAdd = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          location: form.location || null,
          description: form.description || null,
          order: form.order || events.length,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Événement ajouté')
        setShowAddDialog(false)
        resetForm()
        fetchEvents()
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
    if (!selectedEvent) return
    setSaving(true)
    try {
      const res = await fetch('/api/timeline', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: selectedEvent.id,
          ...form,
          location: form.location || null,
          description: form.description || null,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Événement modifié')
        setShowEditDialog(false)
        setSelectedEvent(null)
        resetForm()
        fetchEvents()
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
    if (!selectedEvent) return
    setSaving(true)
    try {
      const res = await fetch(`/api/timeline?id=${selectedEvent.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('Événement supprimé')
        setShowDeleteDialog(false)
        setSelectedEvent(null)
        fetchEvents()
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

  const handleReorder = async (event: TimelineEvent, direction: 'up' | 'down') => {
    const idx = events.findIndex(e => e.id === event.id)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === events.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const swapEvent = events[swapIdx]

    try {
      // Update both events with swapped orders
      await Promise.all([
        fetch('/api/timeline', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: event.id, order: swapEvent.order }),
        }),
        fetch('/api/timeline', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: swapEvent.id, order: event.order }),
        }),
      ])
      fetchEvents()
    } catch {
      toast.error('Erreur de réordonnancement')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Programme</h2>
          <p className="text-sm text-muted-foreground">{events.length} événement{events.length > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { resetForm(); setForm(prev => ({ ...prev, order: events.length })); setShowAddDialog(true) }} size="sm" className="bg-gradient-gold text-white">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Timeline */}
      {events.length === 0 ? (
        <Card className="glass-card gold-border border-0">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucun événement programmé</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gold/20 hidden sm:block" />

          <AnimatePresence>
            {events.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
                className="relative"
              >
                <Card className="glass-card gold-border border-0 mb-3 sm:ml-14">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-gold">{event.time}</span>
                          {event.location && (
                            <span className="text-xs text-muted-foreground">📍 {event.location}</span>
                          )}
                        </div>
                        <p className="font-medium">{event.activity}</p>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === 0}
                          onClick={() => handleReorder(event, 'up')}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === events.length - 1}
                          onClick={() => handleReorder(event, 'down')}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setSelectedEvent(event)
                            setForm({
                              time: event.time,
                              activity: event.activity,
                              location: event.location || '',
                              description: event.description || '',
                              order: event.order,
                            })
                            setShowEditDialog(true)
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-300"
                          onClick={() => { setSelectedEvent(event); setShowDeleteDialog(true) }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline dot */}
                <div className="absolute left-4 top-5 w-4 h-4 rounded-full bg-gold border-2 border-background hidden sm:block" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-card gold-border max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Ajouter un événement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Heure *</Label>
                <Input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="14:00" />
              </div>
              <div className="space-y-2">
                <Label>Ordre</Label>
                <Input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Activité *</Label>
              <Input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} placeholder="Cérémonie" />
            </div>
            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Jardin principal" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description optionnelle" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !form.time || !form.activity} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="glass-card gold-border max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Modifier l&apos;événement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Heure *</Label>
                <Input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Ordre</Label>
                <Input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Activité *</Label>
              <Input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>Annuler</Button>
            <Button onClick={handleEdit} disabled={saving || !form.time || !form.activity} className="bg-gradient-gold text-white">
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
            Supprimer <strong>{selectedEvent?.activity}</strong> ?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
