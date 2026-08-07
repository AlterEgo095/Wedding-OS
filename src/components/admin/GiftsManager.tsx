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
import { Plus, Pencil, Trash2, Loader2, Gift, Check, Mail, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

/**
 * GiftsManager — CONS-5-CLIENT-BACKEND
 *
 * Track wedding gifts: giver name, gift description, monetary amount (in
 * cents, displayed as currency), received date, thank-you note sent status.
 *
 * CRUD via /api/weddings/[id]/gifts (and /gifts/[giftId]).
 */

interface Gift {
  id: string
  giverName: string
  giftDescription: string | null
  amount: number // cents
  currency: string
  receivedAt: string | null
  thankYouSent: boolean
  note: string | null
  createdAt: string
}

interface Props {
  weddingId: string
}

const CURRENCIES = ['USD', 'EUR', 'MGA', 'GBP', 'CAD', 'AUD']

function formatMoney(cents: number, currency: string): string {
  const value = cents / 100
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function GiftsManager({ weddingId }: Props) {
  const [gifts, setGifts] = useState<Gift[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selected, setSelected] = useState<Gift | null>(null)
  const [filterThankYou, setFilterThankYou] = useState<'all' | 'pending' | 'sent'>('all')
  const [form, setForm] = useState({
    giverName: '',
    giftDescription: '',
    amount: '', // user-entered decimal string
    currency: 'USD',
    receivedAt: '',
    thankYouSent: false,
    note: '',
  })

  const fetchGifts = useCallback(async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/gifts`)
      if (res.ok) {
        const json = await res.json()
        setGifts(json.gifts || [])
      } else {
        toast.error('Erreur de chargement des cadeaux')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [weddingId])

  useEffect(() => {
    fetchGifts()
  }, [fetchGifts])

  const resetForm = () => {
    setForm({
      giverName: '',
      giftDescription: '',
      amount: '',
      currency: 'USD',
      receivedAt: '',
      thankYouSent: false,
      note: '',
    })
  }

  /** Convert user-entered decimal to integer cents (rounds half-up). */
  const parseAmountToCents = (input: string): number => {
    if (!input.trim()) return 0
    const num = Number.parseFloat(input.replace(',', '.'))
    if (Number.isNaN(num)) return 0
    return Math.round(num * 100)
  }

  /** Convert cents to a decimal string for the form input. */
  const centsToInput = (cents: number): string => {
    return (cents / 100).toString()
  }

  const buildPayload = () => ({
    giverName: form.giverName.trim(),
    giftDescription: form.giftDescription.trim() || null,
    amount: parseAmountToCents(form.amount),
    currency: form.currency,
    receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : null,
    thankYouSent: form.thankYouSent,
    note: form.note.trim() || null,
  })

  const handleAdd = async () => {
    if (!form.giverName.trim()) {
      toast.error('Le nom du donateur est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/gifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (res.ok) {
        const json = await res.json()
        setGifts((prev) => [json.gift, ...prev])
        toast.success('Cadeau enregistré')
        setShowAddDialog(false)
        resetForm()
      } else {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error || 'Erreur lors de l’enregistrement')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selected) return
    if (!form.giverName.trim()) {
      toast.error('Le nom du donateur est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/weddings/${weddingId}/gifts/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (res.ok) {
        const json = await res.json()
        setGifts((prev) => prev.map((g) => (g.id === selected.id ? json.gift : g)))
        toast.success('Cadeau mis à jour')
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
      const res = await fetch(`/api/weddings/${weddingId}/gifts/${selected.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setGifts((prev) => prev.filter((g) => g.id !== selected.id))
        toast.success('Cadeau supprimé')
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

  const toggleThankYou = async (g: Gift) => {
    // Optimistic update
    setGifts((prev) =>
      prev.map((x) => (x.id === g.id ? { ...x, thankYouSent: !x.thankYouSent } : x)),
    )
    try {
      const res = await fetch(`/api/weddings/${weddingId}/gifts/${g.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thankYouSent: !g.thankYouSent }),
      })
      if (!res.ok) {
        // Revert
        setGifts((prev) =>
          prev.map((x) => (x.id === g.id ? { ...x, thankYouSent: g.thankYouSent } : x)),
        )
        toast.error('Échec de la mise à jour')
      }
    } catch {
      setGifts((prev) =>
        prev.map((x) => (x.id === g.id ? { ...x, thankYouSent: g.thankYouSent } : x)),
      )
      toast.error('Erreur de connexion')
    }
  }

  const openEdit = (g: Gift) => {
    setSelected(g)
    setForm({
      giverName: g.giverName,
      giftDescription: g.giftDescription || '',
      amount: centsToInput(g.amount),
      currency: g.currency,
      receivedAt: g.receivedAt ? new Date(g.receivedAt).toISOString().slice(0, 10) : '',
      thankYouSent: g.thankYouSent,
      note: g.note || '',
    })
    setShowEditDialog(true)
  }

  const openDelete = (g: Gift) => {
    setSelected(g)
    setShowDeleteDialog(true)
  }

  // Stats
  const totalGifts = gifts.length
  const thankYouPending = gifts.filter((g) => !g.thankYouSent).length
  // Sum by currency
  const totalsByCurrency = gifts.reduce<Record<string, number>>((acc, g) => {
    acc[g.currency] = (acc[g.currency] || 0) + g.amount
    return acc
  }, {})

  const filteredGifts = gifts.filter((g) => {
    if (filterThankYou === 'pending') return !g.thankYouSent
    if (filterThankYou === 'sent') return g.thankYouSent
    return true
  })

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold gold-gradient font-display flex items-center gap-2">
            <Gift className="w-6 h-6" />
            Cadeaux
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Suivez les cadeaux reçus et les remerciements à envoyer.
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
          Nouveau cadeau
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <Gift className="w-8 h-8 text-gold-light" />
            <div>
              <div className="text-2xl font-bold">{totalGifts}</div>
              <div className="text-xs text-muted-foreground">Cadeaux enregistrés</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <Mail className="w-8 h-8 text-amber-400" />
            <div>
              <div className="text-2xl font-bold">{thankYouPending}</div>
              <div className="text-xs text-muted-foreground">Remerciements à envoyer</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-emerald-400" />
            <div>
              <div className="text-2xl font-bold">
                {Object.entries(totalsByCurrency).map(([cur, cents]) => (
                  <span key={cur} className="mr-2">
                    {formatMoney(cents, cur)}
                  </span>
                ))}
                {Object.keys(totalsByCurrency).length === 0 && '—'}
              </div>
              <div className="text-xs text-muted-foreground">Total reçu</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={filterThankYou === 'all' ? 'default' : 'outline'}
          className={
            filterThankYou === 'all'
              ? 'bg-gradient-gold text-white'
              : 'border-white/15 hover:bg-white/5'
          }
          onClick={() => setFilterThankYou('all')}
        >
          Tous ({totalGifts})
        </Button>
        <Button
          size="sm"
          variant={filterThankYou === 'pending' ? 'default' : 'outline'}
          className={
            filterThankYou === 'pending'
              ? 'bg-gradient-gold text-white'
              : 'border-white/15 hover:bg-white/5'
          }
          onClick={() => setFilterThankYou('pending')}
        >
          À remercier ({thankYouPending})
        </Button>
        <Button
          size="sm"
          variant={filterThankYou === 'sent' ? 'default' : 'outline'}
          className={
            filterThankYou === 'sent'
              ? 'bg-gradient-gold text-white'
              : 'border-white/15 hover:bg-white/5'
          }
          onClick={() => setFilterThankYou('sent')}
        >
          Remerciés ({totalGifts - thankYouPending})
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filteredGifts.length === 0 ? (
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-10 pb-10 text-center">
            <Gift className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Aucun cadeau dans cette catégorie.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {filteredGifts.map((g) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="bg-white/[0.02] border-white/10 hover:border-gold-light/40 transition-colors h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base truncate">{g.giverName}</CardTitle>
                      {g.amount > 0 && (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                          {formatMoney(g.amount, g.currency)}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {g.giftDescription && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {g.giftDescription}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Reçu le {formatDate(g.receivedAt)}</span>
                    </div>
                    {g.note && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">« {g.note} »</p>
                    )}
                    <div className="flex items-center gap-2 pt-2 flex-wrap">
                      <Button
                        size="sm"
                        variant={g.thankYouSent ? 'default' : 'outline'}
                        className={
                          g.thankYouSent
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
                        }
                        onClick={() => toggleThankYou(g)}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {g.thankYouSent ? 'Remercié' : 'À remercier'}
                      </Button>
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
            <DialogTitle>Nouveau cadeau</DialogTitle>
            <DialogDescription>
              Enregistrez un cadeau reçu (objet ou contribution financière).
            </DialogDescription>
          </DialogHeader>
          <GiftForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier le cadeau</DialogTitle>
            <DialogDescription>
              Mettez à jour les informations du cadeau de « {selected?.giverName} ».
            </DialogDescription>
          </DialogHeader>
          <GiftForm form={form} setForm={setForm} />
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
            <DialogTitle>Supprimer ce cadeau ?</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de supprimer le cadeau de « {selected?.giverName} ».
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
function GiftForm({
  form,
  setForm,
}: {
  form: {
    giverName: string
    giftDescription: string
    amount: string
    currency: string
    receivedAt: string
    thankYouSent: boolean
    note: string
  }
  setForm: (
    f: {
      giverName: string
      giftDescription: string
      amount: string
      currency: string
      receivedAt: string
      thankYouSent: boolean
      note: string
    },
  ) => void
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="gift-giver">Donateur</Label>
        <Input
          id="gift-giver"
          value={form.giverName}
          onChange={(e) => setForm({ ...form, giverName: e.target.value })}
          placeholder="Ex : M. et Mme Rakotomalala"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="gift-desc">Description du cadeau</Label>
        <Textarea
          id="gift-desc"
          value={form.giftDescription}
          onChange={(e) => setForm({ ...form, giftDescription: e.target.value })}
          placeholder="Ex : Service à thé en porcelaine, enveloppe, etc."
          rows={2}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="gift-amount">Montant</Label>
          <Input
            id="gift-amount"
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label>Devise</Label>
          <Select
            value={form.currency}
            onValueChange={(v) => setForm({ ...form, currency: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="gift-received">Reçu le</Label>
          <Input
            id="gift-received"
            type="date"
            value={form.receivedAt}
            onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="gift-note">Note</Label>
        <Textarea
          id="gift-note"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Remarque privée (mode de livraison, etc.)"
          rows={2}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.thankYouSent}
          onChange={(e) => setForm({ ...form, thankYouSent: e.target.checked })}
          className="w-4 h-4"
        />
        <span className="text-sm">Remerciement envoyé</span>
      </label>
    </div>
  )
}
