'use client'

/**
 * Wedding Portfolio Section — Phase 1 (Task 3-c)
 * ================================================
 *
 * A premium card-based portfolio of every wedding on the platform.
 * Replaces the legacy table-only view with a luxury grid of independent
 * wedding cards — each card surfaces the couple, status, plan, stats
 * (guests / tables / admins / media), and exposes the full CRUD +
 * lifecycle action surface:
 *
 *   • Open       — external link to /w/{slug}
 *   • Edit       — opens the create/edit dialog pre-filled
 *   • Activate   — PUT status=PUBLISHED
 *   • Deactivate — PUT status=SUSPENDED
 *   • Archive    — PUT status=ARCHIVED
 *   • Duplicate  — POST a clone with slug + `-copy-{ts}`, status DRAFT
 *   • Delete     — confirmation dialog → DELETE (blocked if isDefault)
 *
 * Design language: dark luxury theme, gold accents, glass-card +
 * gold-border classes, Framer Motion entrance animations, French labels.
 *
 * Zero-regression: pure new file, reuses existing API endpoints and
 * shared primitives (usePlatformFetch, StatusBadge, PlanBadge, …).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Heart,
  Plus,
  Search,
  ExternalLink,
  Pencil,
  MoreHorizontal,
  Trash2,
  Copy,
  Archive,
  Power,
  PowerOff,
  Users as UsersIcon,
  LayoutGrid,
  CalendarDays,
  MapPin,
  Crown,
  QrCode,
  Image as ImageIcon,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

import type {
  Wedding,
  PaginatedWeddings,
  FetchWithAuth,
  Plan,
  WeddingStatus,
} from '../../_lib/types'
import { usePlatformFetch } from '../../_lib/auth'
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  WEDDING_STATUSES,
  PLANS,
} from '../../_lib/constants'
import { StatusBadge, PlanBadge, formatDate, toDateInput } from '../../_lib/ui'
import { SectionHeader, EmptyState } from '../widgets/StatCard'
import { PLAN_METADATA } from '@/lib/types'

// ════════════════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 350

/** Form state shape — covers every field the create/edit dialog edits. */
interface WeddingFormState {
  slug: string
  brideName: string
  groomName: string
  weddingDate: string // yyyy-mm-dd (date input) — '' if not set
  venueName: string
  venueCity: string
  customDomain: string
  status: WeddingStatus
  plan: Plan
}

const EMPTY_FORM: WeddingFormState = {
  slug: '',
  brideName: '',
  groomName: '',
  weddingDate: '',
  venueName: '',
  venueCity: '',
  customDomain: '',
  status: 'DRAFT',
  plan: 'TRIAL',
}

/** Visual gradient palette used for the couple photo placeholder. */
const COUPLE_GRADIENTS: Array<{ from: string; to: string }> = [
  { from: 'from-rose-500/30', to: 'to-amber-500/20' },
  { from: 'from-violet-500/30', to: 'to-fuchsia-500/20' },
  { from: 'from-emerald-500/30', to: 'to-teal-500/20' },
  { from: 'from-sky-500/30', to: 'to-indigo-500/20' },
  { from: 'from-amber-500/30', to: 'to-orange-500/20' },
  { from: 'from-fuchsia-500/30', to: 'to-rose-500/20' },
]

/** Deterministic gradient pick per wedding (so cards stay stable across re-renders). */
function coupleGradient(id: string): { from: string; to: string } {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return COUPLE_GRADIENTS[Math.abs(hash) % COUPLE_GRADIENTS.length]
}

/** Build a 2-letter monogram from bride + groom names. */
function coupleMonogram(bride: string, groom: string): string {
  const b = (bride || '').trim()[0] || ''
  const g = (groom || '').trim()[0] || ''
  const mono = (b + g).toUpperCase()
  return mono || '♥'
}

/** Slugify a free-text slug so admins can type spaces safely. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-component: Stat chip (used inside each card)
// ════════════════════════════════════════════════════════════════════════════

function StatChip({
  icon: Icon,
  label,
  value,
  tone = 'zinc',
}: {
  icon: LucideIcon
  label: string
  value: number
  tone?: 'zinc' | 'emerald' | 'gold' | 'violet'
}) {
  const toneClass: Record<string, string> = {
    zinc: 'text-zinc-400',
    emerald: 'text-emerald-400',
    gold: 'text-gold',
    violet: 'text-violet-400',
  }
  return (
    <div
      className="flex items-center gap-1.5 rounded-md bg-white/[0.03] border border-white/5 px-2 py-1.5"
      title={`${value} ${label}`}
    >
      <Icon className={`w-3.5 h-3.5 ${toneClass[tone]}`} />
      <span className="text-xs font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:inline">
        {label}
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-component: Wedding card (one per wedding)
// ════════════════════════════════════════════════════════════════════════════

interface WeddingCardProps {
  wedding: Wedding
  index: number
  onEdit: (w: Wedding) => void
  onDelete: (w: Wedding) => void
  onActivate: (w: Wedding) => void
  onDeactivate: (w: Wedding) => void
  onArchive: (w: Wedding) => void
  onDuplicate: (w: Wedding) => void
  busy: boolean
}

function WeddingCard({
  wedding: w,
  index,
  onEdit,
  onDelete,
  onActivate,
  onDeactivate,
  onArchive,
  onDuplicate,
  busy,
}: WeddingCardProps) {
  const grad = coupleGradient(w.id)
  const mono = coupleMonogram(w.brideName, w.groomName)
  const guests = w._count?.guests ?? 0
  const tables = w._count?.tables ?? 0
  const admins = w._count?.admins ?? 0
  const media = w._count?.media ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className="h-full"
    >
      <Card className="glass-card gold-border border-0 overflow-hidden h-full flex flex-col group transition-shadow hover:shadow-[0_12px_40px_-12px_oklch(0.72_0.12_85/0.25)]">
        {/* ─── Cover / photo placeholder ─────────────────────────────────── */}
        <div className={`relative h-32 bg-gradient-to-br ${grad.from} ${grad.to} overflow-hidden`}>
          {/* decorative grid pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle at 25% 25%, oklch(0.72 0.12 85 / 0.4) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }}
          />
          {/* monogram */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-4xl font-bold text-white/90 drop-shadow-lg tracking-tight">
              {mono}
            </span>
          </div>
          {/* status badge (top-left) */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <StatusBadge status={w.status} />
            {w.isDefault && (
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wide bg-gold/20 text-gold border-gold/50 backdrop-blur-sm"
              >
                <Crown className="w-2.5 h-2.5 mr-1" />
                Par défaut
              </Badge>
            )}
          </div>
          {/* plan badge (top-right) */}
          <div className="absolute top-2 right-2">
            <PlanBadge plan={w.plan} />
          </div>
        </div>

        {/* ─── Body ─────────────────────────────────────────────────────── */}
        <CardContent className="p-4 flex flex-col flex-1 gap-3">
          {/* Couple + slug */}
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold tracking-tight truncate">
              {w.coupleLabel || `${w.brideName} & ${w.groomName}` || 'Mariage sans nom'}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate font-mono">
              /w/{w.slug}
            </p>
          </div>

          {/* Date + venue */}
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 text-gold/70 shrink-0" />
              <span className={w.weddingDate ? 'text-foreground/80' : 'italic'}>
                {w.weddingDate ? formatDate(w.weddingDate) : 'Date non définie'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 text-gold/70 shrink-0" />
              <span className={w.venueCity ? 'text-foreground/80' : 'italic'}>
                {w.venueCity || 'Lieu non défini'}
              </span>
            </div>
          </div>

          <Separator className="bg-white/5" />

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-1.5">
            <StatChip icon={UsersIcon} label="Invités" value={guests} tone="emerald" />
            <StatChip icon={LayoutGrid} label="Tables" value={tables} tone="gold" />
            <StatChip icon={Crown} label="Admins" value={admins} tone="violet" />
            <StatChip icon={ImageIcon} label="Médias" value={media} />
          </div>

          {w.customDomain && (
            <div className="flex items-center gap-1.5 text-[11px] text-gold/90 bg-gold/5 border border-gold/15 rounded-md px-2 py-1.5">
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate font-mono">{w.customDomain}</span>
            </div>
          )}

          {/* ─── Actions ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 mt-auto pt-1">
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="h-8 flex-1 bg-white/5 hover:bg-white/10 border border-white/10"
            >
              <a href={`/w/${w.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Ouvrir
              </a>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-white/5 hover:bg-white/10 border border-white/10"
              onClick={() => onEdit(w)}
              title="Modifier"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 p-0 bg-white/5 hover:bg-white/10 border border-white/10"
                  disabled={busy}
                  title="Actions"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {w.status !== 'PUBLISHED' && (
                  <DropdownMenuItem onClick={() => onActivate(w)}>
                    <Power className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                    Activer
                  </DropdownMenuItem>
                )}
                {w.status !== 'SUSPENDED' && (
                  <DropdownMenuItem onClick={() => onDeactivate(w)}>
                    <PowerOff className="w-3.5 h-3.5 mr-2 text-amber-400" />
                    Suspendre
                  </DropdownMenuItem>
                )}
                {w.status !== 'ARCHIVED' && (
                  <DropdownMenuItem onClick={() => onArchive(w)}>
                    <Archive className="w-3.5 h-3.5 mr-2 text-zinc-400" />
                    Archiver
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onDuplicate(w)}>
                  <Copy className="w-3.5 h-3.5 mr-2 text-sky-400" />
                  Dupliquer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-300"
                  onClick={() => onDelete(w)}
                  disabled={w.isDefault}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-component: Create / Edit dialog
// ════════════════════════════════════════════════════════════════════════════

interface WeddingFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Wedding | null
  fetchWithAuth: FetchWithAuth
  onSaved: () => void
}

function WeddingFormDialog({
  open,
  onOpenChange,
  editing,
  fetchWithAuth,
  onSaved,
}: WeddingFormDialogProps) {
  const [form, setForm] = useState<WeddingFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof WeddingFormState, string>>>({})

  // Sync form when opening
  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        slug: editing.slug,
        brideName: editing.brideName,
        groomName: editing.groomName,
        weddingDate: toDateInput(editing.weddingDate),
        venueName: editing.venueName || '',
        venueCity: editing.venueCity || '',
        customDomain: editing.customDomain || '',
        status: editing.status,
        plan: editing.plan,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
  }, [open, editing])

  const update = <K extends keyof WeddingFormState>(key: K, value: WeddingFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const next: Partial<Record<keyof WeddingFormState, string>> = {}
    if (!form.slug.trim()) next.slug = 'Le slug est requis'
    else if (!/^[a-z0-9-]{3,32}$/.test(slugify(form.slug))) {
      next.slug = '3 à 32 caractères : lettres minuscules, chiffres, tirets'
    }
    if (!form.brideName.trim()) next.brideName = 'Requis'
    if (!form.groomName.trim()) next.groomName = 'Requis'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Veuillez corriger les champs requis')
      return
    }
    setSaving(true)

    const payload: Record<string, unknown> = {
      slug: slugify(form.slug),
      brideName: form.brideName.trim(),
      groomName: form.groomName.trim(),
      weddingDate: form.weddingDate ? new Date(form.weddingDate).toISOString() : null,
      venueName: form.venueName.trim() || undefined,
      venueCity: form.venueCity.trim() || undefined,
      status: form.status,
      plan: form.plan,
    }
    if (editing) {
      payload.customDomain = form.customDomain.trim() || null
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
        toast.success(editing ? 'Mariage mis à jour' : 'Mariage créé avec succès')
        onOpenChange(false)
        onSaved()
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-card/95 backdrop-blur-xl border-gold/20 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-gold" />
            {editing ? 'Modifier le mariage' : 'Créer un mariage'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Mettez à jour les informations de ce mariage.'
              : 'Configurez un nouveau mariage sur la plateforme.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {/* Slug */}
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="wf-slug" className="text-xs">
              Slug <span className="text-red-400">*</span>
            </Label>
            <Input
              id="wf-slug"
              value={form.slug}
              onChange={(e) => update('slug', e.target.value)}
              placeholder="marie-et-jean"
              className={`bg-white/5 border-white/10 font-mono text-sm ${
                errors.slug ? 'border-red-500/50' : ''
              }`}
              onBlur={() => update('slug', slugify(form.slug))}
            />
            {errors.slug ? (
              <p className="text-[10px] text-red-400">{errors.slug}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                URL publique : /w/{slugify(form.slug) || '...'}
              </p>
            )}
          </div>

          {/* Wedding date */}
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="wf-date" className="text-xs">
              Date du mariage
            </Label>
            <Input
              id="wf-date"
              type="date"
              value={form.weddingDate}
              onChange={(e) => update('weddingDate', e.target.value)}
              className="bg-white/5 border-white/10 text-sm"
            />
          </div>

          {/* Bride */}
          <div className="space-y-1.5">
            <Label htmlFor="wf-bride" className="text-xs">
              Mariée <span className="text-red-400">*</span>
            </Label>
            <Input
              id="wf-bride"
              value={form.brideName}
              onChange={(e) => update('brideName', e.target.value)}
              placeholder="Prénom de la mariée"
              className={`bg-white/5 border-white/10 text-sm ${
                errors.brideName ? 'border-red-500/50' : ''
              }`}
            />
            {errors.brideName && (
              <p className="text-[10px] text-red-400">{errors.brideName}</p>
            )}
          </div>

          {/* Groom */}
          <div className="space-y-1.5">
            <Label htmlFor="wf-groom" className="text-xs">
              Marié <span className="text-red-400">*</span>
            </Label>
            <Input
              id="wf-groom"
              value={form.groomName}
              onChange={(e) => update('groomName', e.target.value)}
              placeholder="Prénom du marié"
              className={`bg-white/5 border-white/10 text-sm ${
                errors.groomName ? 'border-red-500/50' : ''
              }`}
            />
            {errors.groomName && (
              <p className="text-[10px] text-red-400">{errors.groomName}</p>
            )}
          </div>

          {/* Venue name */}
          <div className="space-y-1.5">
            <Label htmlFor="wf-venue" className="text-xs">
              Nom du lieu
            </Label>
            <Input
              id="wf-venue"
              value={form.venueName}
              onChange={(e) => update('venueName', e.target.value)}
              placeholder="Salle, domaine, église…"
              className="bg-white/5 border-white/10 text-sm"
            />
          </div>

          {/* Venue city */}
          <div className="space-y-1.5">
            <Label htmlFor="wf-city" className="text-xs">
              Ville
            </Label>
            <Input
              id="wf-city"
              value={form.venueCity}
              onChange={(e) => update('venueCity', e.target.value)}
              placeholder="Kinshasa, Paris…"
              className="bg-white/5 border-white/10 text-sm"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs">Statut</Label>
            <Select
              value={form.status}
              onValueChange={(v) => update('status', v as WeddingStatus)}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEDDING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_BADGE_CLASS[s].split(' ')[0]}`} />
                      {STATUS_LABELS[s]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Plan */}
          <div className="space-y-1.5">
            <Label className="text-xs">Plan</Label>
            <Select
              value={form.plan}
              onValueChange={(v) => update('plan', v as Plan)}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLAN_METADATA[p]?.label || p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom domain — only on edit */}
          {editing && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="wf-domain" className="text-xs">
                Domaine personnalisé
              </Label>
              <Input
                id="wf-domain"
                value={form.customDomain}
                onChange={(e) => update('customDomain', e.target.value)}
                placeholder="mariage.example.com"
                className="bg-white/5 border-white/10 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Réservé aux plans Premium et Élite.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-muted-foreground hover:text-foreground"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-gold text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sauvegarde…
              </>
            ) : editing ? (
              'Enregistrer'
            ) : (
              'Créer le mariage'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-component: Delete confirmation dialog
// ════════════════════════════════════════════════════════════════════════════

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wedding: Wedding | null
  fetchWithAuth: FetchWithAuth
  onDeleted: () => void
}

function DeleteDialog({
  open,
  onOpenChange,
  wedding,
  fetchWithAuth,
  onDeleted,
}: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!wedding) return
    setDeleting(true)
    try {
      const res = await fetchWithAuth(`/api/platform/weddings/${wedding.id}`, {
        method: 'DELETE',
      })
      if (!res) {
        setDeleting(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Mariage supprimé définitivement')
        onOpenChange(false)
        onDeleted()
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-card/95 backdrop-blur-xl border-red-500/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="w-4 h-4" />
            Supprimer le mariage
          </DialogTitle>
          <DialogDescription>
            Cette action est irréversible. Toutes les données associées seront
            définitivement effacées.
          </DialogDescription>
        </DialogHeader>

        {wedding && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 my-2">
            <p className="text-sm font-medium text-foreground">
              {wedding.coupleLabel || `${wedding.brideName} & ${wedding.groomName}`}
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              /w/{wedding.slug}
            </p>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <UsersIcon className="w-3 h-3" />
                {wedding._count?.guests ?? 0} invités
              </span>
              <span className="flex items-center gap-1">
                <LayoutGrid className="w-3 h-3" />
                {wedding._count?.tables ?? 0} tables
              </span>
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                {wedding._count?.media ?? 0} médias
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Suppression…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer définitivement
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Main component: WeddingPortfolioSection
// ════════════════════════════════════════════════════════════════════════════

export function WeddingPortfolioSection() {
  const { fetchWithAuth } = usePlatformFetch()

  // ─── List state ──────────────────────────────────────────────────────────
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [planFilter, setPlanFilter] = useState<string>('ALL')

  // ─── Dialog state ────────────────────────────────────────────────────────
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editing, setEditing] = useState<Wedding | null>(null)
  const [deleting, setDeleting] = useState<Wedding | null>(null)

  // ─── Busy state (per-card action in-flight) ──────────────────────────────
  const [busyId, setBusyId] = useState<string | null>(null)

  // ─── Refs to dodge stale closures in debounce ────────────────────────────
  const searchRef = useRef(search)
  searchRef.current = search
  const statusRef = useRef(statusFilter)
  statusRef.current = statusFilter
  const planRef = useRef(planFilter)
  planRef.current = planFilter

  // ─── Loader ──────────────────────────────────────────────────────────────
  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(PAGE_SIZE),
      })
      if (searchRef.current) params.set('search', searchRef.current)
      if (statusRef.current !== 'ALL') params.set('status', statusRef.current)
      if (planRef.current !== 'ALL') params.set('plan', planRef.current)

      const res = await fetchWithAuth(`/api/platform/weddings?${params.toString()}`)
      if (!res) {
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as PaginatedWeddings
        setWeddings(json.weddings || [])
        setTotal(json.total || 0)
        setTotalPages(Math.max(1, Math.ceil((json.total || 0) / (json.limit || PAGE_SIZE))))
        setPage(json.page || targetPage)
      } catch {
        toast.error('Réponse invalide du serveur')
      } finally {
        setLoading(false)
      }
    },
    [fetchWithAuth],
  )

  // Initial + filter-driven load — `load` is intentionally excluded so
  // changing the search input doesn't re-trigger alongside filter changes.
  useEffect(() => {
    load(1)
  }, [statusFilter, planFilter, load])

  // Debounced search load
  useEffect(() => {
    const t = setTimeout(() => load(1), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search, load])

  // ─── Dialog openers ──────────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditing(null)
    setShowFormDialog(true)
  }, [])

  const openEdit = useCallback((w: Wedding) => {
    setEditing(w)
    setShowFormDialog(true)
  }, [])

  const openDelete = useCallback((w: Wedding) => {
    setDeleting(w)
    setShowDeleteDialog(true)
  }, [])

  // ─── Lifecycle actions (PUT status, POST duplicate) ──────────────────────
  const setStatus = useCallback(
    async (w: Wedding, status: WeddingStatus, successMsg: string) => {
      setBusyId(w.id)
      try {
        const res = await fetchWithAuth(`/api/platform/weddings/${w.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        if (!res) {
          setBusyId(null)
          return
        }
        const json = await res.json().catch(() => ({}))
        if (res.ok) {
          toast.success(successMsg)
          load(page)
        } else {
          toast.error(json.error || 'Erreur lors de la mise à jour')
        }
      } catch {
        toast.error('Erreur de connexion')
      } finally {
        setBusyId(null)
      }
    },
    [fetchWithAuth, load, page],
  )

  const handleActivate = useCallback(
    (w: Wedding) => setStatus(w, 'PUBLISHED', `Mariage « ${w.coupleLabel} » activé`),
    [setStatus],
  )
  const handleDeactivate = useCallback(
    (w: Wedding) => setStatus(w, 'SUSPENDED', `Mariage « ${w.coupleLabel} » suspendu`),
    [setStatus],
  )
  const handleArchive = useCallback(
    (w: Wedding) => setStatus(w, 'ARCHIVED', `Mariage « ${w.coupleLabel} » archivé`),
    [setStatus],
  )

  const handleDuplicate = useCallback(
    async (w: Wedding) => {
      setBusyId(w.id)
      const copySlug = `${w.slug}-copy-${Date.now()}`.slice(0, 32)
      try {
        const res = await fetchWithAuth('/api/platform/weddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: copySlug,
            brideName: w.brideName,
            groomName: w.groomName,
            weddingDate: w.weddingDate,
            venueName: w.venueName,
            venueCity: w.venueCity,
            status: 'DRAFT',
            plan: w.plan,
          }),
        })
        if (!res) {
          setBusyId(null)
          return
        }
        const json = await res.json().catch(() => ({}))
        if (res.ok) {
          toast.success(`Mariage dupliqué (slug : ${copySlug})`)
          load(1)
        } else {
          toast.error(json.error || 'Erreur lors de la duplication')
        }
      } catch {
        toast.error('Erreur de connexion')
      } finally {
        setBusyId(null)
      }
    },
    [fetchWithAuth, load],
  )

  // ─── Pagination handlers ─────────────────────────────────────────────────
  const goPrev = useCallback(() => {
    if (page > 1) load(page - 1)
  }, [page, load])
  const goNext = useCallback(() => {
    if (page < totalPages) load(page + 1)
  }, [page, totalPages, load])

  // ─── Derived display values ──────────────────────────────────────────────
  const resultStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const resultEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Wedding Portfolio"
        description="Vue panoramique des mariages de la plateforme — gestion CRUD complète et actions de cycle de vie."
        icon={Heart}
        actions={
          <Button
            onClick={openCreate}
            size="sm"
            className="bg-gradient-gold text-white shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Créer un mariage
          </Button>
        }
      />

      {/* ─── Filters bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Rechercher par slug, couple, ville, domaine…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/5 border-white/10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 bg-white/5 border-white/10">
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
                {PLAN_METADATA[p]?.label || p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Result summary + quick stats ─────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3 text-xs text-muted-foreground">
        <span>
          {loading ? (
            'Chargement…'
          ) : total === 0 ? (
            'Aucun mariage'
          ) : (
            <>
              Affichage de <span className="text-foreground font-medium">{resultStart}–{resultEnd}</span>{' '}
              sur <span className="text-foreground font-medium">{total}</span> mariage{total > 1 ? 's' : ''}
            </>
          )}
        </span>
        <span className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <QrCode className="w-3 h-3 text-gold/70" />
            Page {page} / {totalPages}
          </span>
        </span>
      </div>

      {/* ─── Grid of wedding cards ────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={`sk-${i}`} className="glass-card gold-border border-0 overflow-hidden">
              <Skeleton className="h-32 rounded-none" />
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-7" />
                  <Skeleton className="h-7" />
                  <Skeleton className="h-7" />
                  <Skeleton className="h-7" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : weddings.length === 0 ? (
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-0">
            <EmptyState
              icon={Heart}
              title="Aucun mariage à afficher"
              description={
                search || statusFilter !== 'ALL' || planFilter !== 'ALL'
                  ? 'Aucun mariage ne correspond à vos filtres. Essayez de les ajuster.'
                  : 'Créez votre premier mariage pour démarrer la plateforme.'
              }
              action={
                <Button
                  onClick={openCreate}
                  size="sm"
                  className="bg-gradient-gold text-white"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Créer un mariage
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {weddings.map((w, i) => (
            <WeddingCard
              key={w.id}
              wedding={w}
              index={i}
              onEdit={openEdit}
              onDelete={openDelete}
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
              onArchive={handleArchive}
              onDuplicate={handleDuplicate}
              busy={busyId === w.id}
            />
          ))}
        </div>
      )}

      {/* ─── Pagination ───────────────────────────────────────────────────── */}
      {!loading && total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={page <= 1}
            className="border-white/10 bg-white/5 hover:bg-white/10"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Précédent
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, idx) => {
              // Show a window of pages around current
              const start = Math.max(1, Math.min(page - 3, totalPages - 6))
              const pageNum = start + idx
              if (pageNum > totalPages) return null
              return (
                <Button
                  key={pageNum}
                  size="sm"
                  variant={pageNum === page ? 'default' : 'outline'}
                  onClick={() => load(pageNum)}
                  className={
                    pageNum === page
                      ? 'h-8 w-8 p-0 bg-gradient-gold text-white'
                      : 'h-8 w-8 p-0 border-white/10 bg-white/5 hover:bg-white/10'
                  }
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={page >= totalPages}
            className="border-white/10 bg-white/5 hover:bg-white/10"
          >
            Suivant
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ─── Dialogs ──────────────────────────────────────────────────────── */}
      <WeddingFormDialog
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        editing={editing}
        fetchWithAuth={fetchWithAuth}
        onSaved={() => load(page)}
      />
      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        wedding={deleting}
        fetchWithAuth={fetchWithAuth}
        onDeleted={() => load(1)}
      />
    </section>
  )
}
