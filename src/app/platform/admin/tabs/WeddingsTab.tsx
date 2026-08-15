'use client'

// WeddingsTab — extracted from src/app/platform/admin/page.tsx (CONS-3).
// Manages CRUD for all platform weddings.

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
  Plus,
  Search,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Heart,
  Send,
  CheckCircle,
  Pause,
  Play,
  Archive,
  EyeOff,
  Eye,
  Zap,
} from 'lucide-react'

import { PLAN_METADATA, type Plan, type WeddingStatus } from '@/lib/types'
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PLAN_BADGE_CLASS,
  PLAN_LIST,
  WEDDING_STATUS_LIST,
} from '@/lib/ui-labels'
import Link from 'next/link'
import { formatDate, toDateInput } from '@/lib/format'

import {
  type Wedding,
  type PaginatedWeddings,
  type FetchWithAuth,
  StatusBadge,
  PlanBadge,
  WEDDING_STATUSES,
  PLANS,
} from './shared'

// ════════════════════════════════════════════════════════════════════════════
// Weddings tab
// ════════════════════════════════════════════════════════════════════════════

interface WeddingFormState {
  slug: string
  brideName: string
  groomName: string
  weddingDate: string
  venueCity: string
  status: WeddingStatus
  plan: Plan
}

const EMPTY_WEDDING_FORM: WeddingFormState = {
  slug: '',
  brideName: '',
  groomName: '',
  weddingDate: '',
  venueCity: '',
  status: 'DRAFT',
  plan: 'TRIAL',
}

interface DuplicateFormState {
  newSlug: string
  newBrideName: string
  newGroomName: string
}

const EMPTY_DUPLICATE_FORM: DuplicateFormState = {
  newSlug: '',
  newBrideName: '',
  newGroomName: '',
}

export function WeddingsTab({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [planFilter, setPlanFilter] = useState<string>('ALL')

  // Dialog state
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [editing, setEditing] = useState<Wedding | null>(null)
  const [deleting, setDeleting] = useState<Wedding | null>(null)
  const [duplicating, setDuplicating] = useState<Wedding | null>(null)
  const [form, setForm] = useState<WeddingFormState>(EMPTY_WEDDING_FORM)
  const [duplicateForm, setDuplicateForm] = useState<DuplicateFormState>(EMPTY_DUPLICATE_FORM)
  const [saving, setSaving] = useState(false)
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null)

  const LIMIT = 20
  const searchRef = useRef(search)
  searchRef.current = search

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(LIMIT),
      })
      if (searchRef.current) params.set('search', searchRef.current)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (planFilter !== 'ALL') params.set('plan', planFilter)

      const res = await fetchWithAuth(`/api/platform/weddings?${params.toString()}`)
      if (!res) {
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as PaginatedWeddings
        setWeddings(json.weddings || [])
        setTotal(json.total || 0)
        // API returns { total, page, limit } — compute totalPages client-side.
        setTotalPages(Math.max(1, Math.ceil((json.total || 0) / (json.limit || LIMIT))))
        setPage(json.page || targetPage)
      } catch {
        toast.error('Réponse invalide du serveur')
      } finally {
        setLoading(false)
      }
    },
    [fetchWithAuth, statusFilter, planFilter]
  )

  useEffect(() => {
    load(1)
  }, [statusFilter, planFilter, load])

  // Debounced search trigger
  useEffect(() => {
    const t = setTimeout(() => {
      load(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search, load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_WEDDING_FORM)
    setShowFormDialog(true)
  }

  const openEdit = (w: Wedding) => {
    setEditing(w)
    setForm({
      slug: w.slug,
      brideName: w.brideName,
      groomName: w.groomName,
      weddingDate: toDateInput(w.weddingDate),
      venueCity: w.venueCity || '',
      status: w.status,
      plan: w.plan,
    })
    setShowFormDialog(true)
  }

  const handleSave = async () => {
    if (!form.slug || !form.brideName || !form.groomName) {
      toast.error('Slug, mariée et marié sont requis')
      return
    }
    setSaving(true)
    const payload: Record<string, unknown> = {
      slug: form.slug.trim().toLowerCase(),
      brideName: form.brideName.trim(),
      groomName: form.groomName.trim(),
      weddingDate: form.weddingDate ? new Date(form.weddingDate).toISOString() : null,
      venueCity: form.venueCity.trim() || null,
      status: form.status,
      plan: form.plan,
    }
    try {
      const url = editing
        ? `/api/platform/weddings/${editing.id}`
        : '/api/platform/weddings'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(editing ? 'Mariage mis à jour' : 'Mariage créé')
        setShowFormDialog(false)
        setEditing(null)
        setForm(EMPTY_WEDDING_FORM)
        load(page)
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      // 5.8.17 FIX-P0-P1 (FIX 4): send {confirm: true} in the body so the
      // server-side CONFIRMATION_REQUIRED guard on DELETE
      // /api/platform/weddings/{id} passes. The UI dialog is already shown
      // (setShowDeleteDialog), this is the matching server-side check.
      const res = await fetchWithAuth(`/api/platform/weddings/${deleting.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Mariage supprimé')
        setShowDeleteDialog(false)
        setDeleting(null)
        load(1)
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  // ─── Status quick-action (Phase 3 ÉTAPE 5) ────────────────────────────────
  // Single-shot status transition via the dropdown menu. The backend enforces
  // the lifecycle (DRAFT→PUBLISHED, PUBLISHED→COMPLETED, etc.) — invalid
  // transitions return 400 and we surface the error in a toast.
  const handleStatusChange = async (w: Wedding, newStatus: WeddingStatus) => {
    setStatusChangingId(w.id)
    try {
      const res = await fetchWithAuth(`/api/platform/weddings/${w.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res) {
        setStatusChangingId(null)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Statut mis à jour : ${STATUS_LABELS[newStatus]}`)
        load(page)
      } else {
        toast.error(json.error || 'Transition de statut invalide')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setStatusChangingId(null)
    }
  }

  // ─── 5.8.16 P1-01: Activate TRIAL wedding (no-code publish enabler) ───────
  const handleActivateTrial = async (w: Wedding) => {
    setStatusChangingId(w.id)
    try {
      const res = await fetchWithAuth(`/api/platform/weddings/${w.id}/activate-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res) {
        setStatusChangingId(null)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(json.alreadyActive
          ? `L'essai est déjà activé pour ${w.coupleLabel}.`
          : `Essai activé pour ${w.coupleLabel}. Vous pouvez maintenant publier.`)
        load(page)
      } else {
        toast.error(json.error || 'Activation échouée')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setStatusChangingId(null)
    }
  }

  // ─── Duplicate wedding (Phase 3 ÉTAPE 5) ──────────────────────────────────
  const openDuplicate = (w: Wedding) => {
    setDuplicating(w)
    setDuplicateForm({
      newSlug: `${w.slug}-copie`,
      newBrideName: w.brideName,
      newGroomName: w.groomName,
    })
    setShowDuplicateDialog(true)
  }

  const handleDuplicate = async () => {
    if (!duplicating) return
    if (!duplicateForm.newSlug.trim()) {
      toast.error('Le slug est requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithAuth(
        `/api/platform/weddings/${duplicating.id}/duplicate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newSlug: duplicateForm.newSlug.trim().toLowerCase(),
            newBrideName: duplicateForm.newBrideName.trim() || undefined,
            newGroomName: duplicateForm.newGroomName.trim() || undefined,
          }),
        }
      )
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Mariage dupliqué vers /w/${json.wedding?.slug || duplicateForm.newSlug}`)
        setShowDuplicateDialog(false)
        setDuplicating(null)
        setDuplicateForm(EMPTY_DUPLICATE_FORM)
        load(1)
      } else {
        toast.error(json.error || 'Erreur lors de la duplication')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header + filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Mariages</h2>
          <p className="text-sm text-muted-foreground">{total} mariage{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate} size="sm" className="bg-gradient-gold text-white shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Créer un mariage
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par slug, nom du couple…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/5 border-white/10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            {WEDDING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les plans</SelectItem>
            {PLANS.map((p) => (
              <SelectItem key={p} value={p}>
                {PLAN_METADATA[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Couple</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Plan</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Invités</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Créé le</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-white/5">
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : weddings.length === 0 ? (
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Heart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucun mariage trouvé</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  weddings.map((w) => (
                    <TableRow
                      key={w.id}
                      className="border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{w.coupleLabel || `${w.brideName} & ${w.groomName}`}</span>
                          <span className="text-xs text-muted-foreground">/w/{w.slug}</span>
                          {w.isDefault && (
                            <Badge variant="outline" className="mt-1 text-[10px] w-fit bg-gold/10 text-gold border-gold/30">
                              défaut
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={w.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <PlanBadge plan={w.plan} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(w.weddingDate)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {w._count?.guests ?? 0}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {formatDate(w.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-11 w-11" disabled={statusChangingId === w.id}>
                              {statusChangingId === w.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="w-4 h-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(w)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/w/${w.slug}`} target="_blank" className="flex items-center cursor-pointer">
                                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                                Voir le site
                              </Link>
                            </DropdownMenuItem>
                            {/* Phase 4A (MISSION 5.9.0 §20.6) — Preview Lab entry point.
                                Opens /platform/admin/preview/[slug] in a new tab so the
                                admin keeps their place in the weddings list. */}
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/platform/admin/preview/${w.slug}`}
                                target="_blank"
                                className="flex items-center cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 mr-2" />
                                Lab Preview
                              </Link>
                            </DropdownMenuItem>

                            {/* ─── Status quick-actions (Phase 3 ÉTAPE 5) ─── */}
                            <DropdownMenuSeparator />
                            {w.status === 'DRAFT' && w.plan === 'TRIAL' && (
                              <DropdownMenuItem onClick={() => handleActivateTrial(w)}>
                                <Zap className="w-3.5 h-3.5 mr-2" />
                                Activer l'essai
                              </DropdownMenuItem>
                            )}
                            {w.status === 'DRAFT' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(w, 'PUBLISHED')}>
                                <Send className="w-3.5 h-3.5 mr-2" />
                                Publier
                              </DropdownMenuItem>
                            )}
                            {w.status === 'PUBLISHED' && (
                              <>
                                <DropdownMenuItem onClick={() => handleStatusChange(w, 'COMPLETED')}>
                                  <CheckCircle className="w-3.5 h-3.5 mr-2" />
                                  Marquer comme terminé
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(w, 'SUSPENDED')}>
                                  <Pause className="w-3.5 h-3.5 mr-2" />
                                  Suspendre
                                </DropdownMenuItem>
                                {/* P5.1 — Unpublish: take wedding offline without deleting data */}
                                <DropdownMenuItem onClick={() => handleStatusChange(w, 'UNPUBLISHED')}>
                                  <EyeOff className="w-3.5 h-3.5 mr-2" />
                                  Dépublier
                                </DropdownMenuItem>
                              </>
                            )}
                            {/* P5.1 — Republish from UNPUBLISHED state */}
                            {w.status === 'UNPUBLISHED' && (
                              <>
                                <DropdownMenuItem onClick={() => handleStatusChange(w, 'PUBLISHED')}>
                                  <Send className="w-3.5 h-3.5 mr-2" />
                                  Republier
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(w, 'DRAFT')}>
                                  <Archive className="w-3.5 h-3.5 mr-2" />
                                  Remettre en brouillon
                                </DropdownMenuItem>
                              </>
                            )}
                            {w.status === 'SUSPENDED' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(w, 'PUBLISHED')}>
                                <Play className="w-3.5 h-3.5 mr-2" />
                                Réactiver
                              </DropdownMenuItem>
                            )}
                            {w.status !== 'ARCHIVED' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(w, 'ARCHIVED')}>
                                <Archive className="w-3.5 h-3.5 mr-2" />
                                Archiver
                              </DropdownMenuItem>
                            )}

                            {/* ─── Duplicate (always available) ─── */}
                            <DropdownMenuItem onClick={() => openDuplicate(w)}>
                              <Copy className="w-3.5 h-3.5 mr-2" />
                              Dupliquer
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400 focus:text-red-300"
                              onClick={() => {
                                setDeleting(w)
                                setShowDeleteDialog(true)
                              }}
                              disabled={w.isDefault}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} / {Math.max(totalPages, 1)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
          >
            Suivant <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient">
              {editing ? 'Modifier le mariage' : 'Créer un mariage'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="josue-hornella"
                className="bg-white/5 border-white/10"
              />
              <p className="text-[10px] text-muted-foreground">
                URL publique : /w/&lt;slug&gt;
              </p>
            </div>
            <div className="space-y-2">
              <Label>Mariée *</Label>
              <Input
                value={form.brideName}
                onChange={(e) => setForm({ ...form, brideName: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Marié *</Label>
              <Input
                value={form.groomName}
                onChange={(e) => setForm({ ...form, groomName: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Date du mariage</Label>
              <Input
                type="date"
                value={form.weddingDate}
                onChange={(e) => setForm({ ...form, weddingDate: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Ville du lieu</Label>
              <Input
                value={form.venueCity}
                onChange={(e) => setForm({ ...form, venueCity: e.target.value })}
                placeholder="Kinshasa"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as WeddingStatus })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEDDING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select
                value={form.plan}
                onValueChange={(v) => setForm({ ...form, plan: v as Plan })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLAN_METADATA[p].label} — ${PLAN_METADATA[p].priceUsd}/mois
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowFormDialog(false)
                setEditing(null)
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.slug || !form.brideName || !form.groomName}
              className="bg-gradient-gold text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer le mariage{' '}
            <strong className="text-foreground">{deleting?.coupleLabel}</strong> ? Cette action
            supprimera également tous les invités, tables, médias et paramètres associés.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate dialog (Phase 3 ÉTAPE 5) */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <Copy className="w-4 h-4" />
              Dupliquer le mariage
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Crée une copie <strong className="text-foreground">Brouillon</strong> de{' '}
            <strong className="text-foreground">{duplicating?.coupleLabel}</strong> avec le thème,
            la timeline, l'histoire du couple et les paramètres. Les invités, tables, médias et
            journaux ne sont pas copiés.
          </p>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>Nouveau slug *</Label>
              <Input
                value={duplicateForm.newSlug}
                onChange={(e) => setDuplicateForm({ ...duplicateForm, newSlug: e.target.value })}
                placeholder="nouveau-mariage"
                className="bg-white/5 border-white/10"
              />
              <p className="text-[10px] text-muted-foreground">
                URL publique : /w/&lt;slug&gt; — 3 à 32 caractères, minuscules, chiffres ou tirets.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mariée</Label>
                <Input
                  value={duplicateForm.newBrideName}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, newBrideName: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Marié</Label>
                <Input
                  value={duplicateForm.newGroomName}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, newGroomName: e.target.value })}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Laissez vide pour reprendre les noms du mariage source.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowDuplicateDialog(false)
                setDuplicating(null)
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={saving || !duplicateForm.newSlug.trim()}
              className="bg-gradient-gold text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Copy className="w-4 h-4 mr-1" />
              Dupliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
