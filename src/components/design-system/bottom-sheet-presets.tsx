'use client'

import * as React from 'react'
import {
  Heart,
  Users,
  Salad,
  UserPlus,
  Mail,
  Phone,
  Search,
  RotateCcw,
  AlertTriangle,
  Link2,
  MessageCircle,
  QrCode,
  Lock,
  Check,
  Copy,
} from 'lucide-react'
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetContent,
  BottomSheetFooter,
  type BottomSheetVariant,
} from './bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { TouchButton } from './touch-button'
import { cn } from '@/lib/utils'

/**
 * MISSION 5.9.5 — PHASE F
 * BottomSheet presets — composable content for short mobile forms.
 *
 * 6 presets addressant P2-2 (pas de bottom sheets pour formulaires
 * courts sur mobile) :
 *  - QuickRSVPSheet      — RSVP invité (blush/gold)
 *  - QuickAddGuestSheet  — admin ajouter invité (gold)
 *  - QuickFilterSheet    — filtres liste (emerald)
 *  - QuickConfirmSheet   — confirmation (default / red si danger)
 *  - QuickShareSheet     — partage social (gold)
 *  - QuickLoginSheet     — connexion rapide (emerald)
 *
 * Chaque preset wrappe un <BottomSheet> avec variant + accent cohérents.
 * Utilise shadcn/ui form primitives (Input, Label, Button, Textarea,
 * Select, Checkbox, RadioGroup) — pas de nouvelles dépendances npm.
 *
 * API : chaque preset prend `open` + `onOpenChange` (+ props spécifiques).
 * Le submit ferme le sheet (onOpenChange(false)).
 */

/* ============================================================
   1. QuickRSVPSheet — RSVP invité (blush/gold)
   ============================================================ */
export interface QuickRSVPSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Nom de l'invité (read-only si fourni, sinon input). */
  name?: string
  /** Slug mariage pour RSVP URL (optionnel). */
  weddingSlug?: string
}

export function QuickRSVPSheet({
  open,
  onOpenChange,
  name = '',
  weddingSlug,
}: QuickRSVPSheetProps) {
  const [attending, setAttending] = React.useState<'yes' | 'no' | ''>('')
  const [guests, setGuests] = React.useState('1')
  const [dietary, setDietary] = React.useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: POST /api/w/{weddingSlug}/rsvp with { attending, guests, dietary }
    onOpenChange(false)
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Confirmer ma présence"
      description={
        weddingSlug
          ? `RSVP pour le mariage ${weddingSlug}`
          : 'Indiquez votre présence et le nombre d\'accompagnateurs'
      }
      size="auto"
      variant="default"
    >
      <BottomSheetContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name — read-only si fourni, sinon input */}
          <div className="space-y-1.5">
            <Label htmlFor="rsvp-name">Nom</Label>
            <Input
              id="rsvp-name"
              defaultValue={name}
              placeholder="Votre nom"
              readOnly={Boolean(name)}
              aria-readonly={Boolean(name)}
            />
          </div>

          {/* Attending — radio Oui/Non */}
          <div className="space-y-1.5">
            <Label>Serez-vous présent&nbsp;?</Label>
            <RadioGroup
              value={attending}
              onValueChange={(v) => setAttending(v as 'yes' | 'no')}
              className="grid grid-cols-2 gap-2"
            >
              <Label
                htmlFor="rsvp-yes"
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 min-h-[44px] cursor-pointer transition-colors',
                  attending === 'yes' &&
                    'border-[var(--blush)] bg-[oklch(0.82_0.06_20/0.08)]',
                )}
              >
                <RadioGroupItem id="rsvp-yes" value="yes" />
                <Heart className="h-4 w-4 text-[var(--blush)]" aria-hidden />
                <span className="text-fluid-sm font-medium">Oui, avec plaisir</span>
              </Label>
              <Label
                htmlFor="rsvp-no"
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 min-h-[44px] cursor-pointer transition-colors',
                  attending === 'no' &&
                    'border-muted-foreground/40 bg-muted/40',
                )}
              >
                <RadioGroupItem id="rsvp-no" value="no" />
                <span className="text-fluid-sm font-medium">Hélas non</span>
              </Label>
            </RadioGroup>
          </div>

          {/* Number of guests — select 1-6 */}
          {attending === 'yes' && (
            <div className="space-y-1.5">
              <Label htmlFor="rsvp-guests">Nombre de personnes</Label>
              <Select value={guests} onValueChange={setGuests}>
                <SelectTrigger id="rsvp-guests" className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {['1', '2', '3', '4', '5', '6'].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n} {n === '1' ? 'personne' : 'personnes'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dietary restrictions — textarea */}
          {attending === 'yes' && (
            <div className="space-y-1.5">
              <Label htmlFor="rsvp-dietary" className="flex items-center gap-1.5">
                <Salad className="h-3.5 w-3.5 text-[var(--emerald-brand)]" aria-hidden />
                Restrictions alimentaires
              </Label>
              <Textarea
                id="rsvp-dietary"
                value={dietary}
                onChange={(e) => setDietary(e.target.value)}
                placeholder="Végétarien, allergies, sans gluten…"
                rows={3}
              />
            </div>
          )}
        </form>
      </BottomSheetContent>
      <BottomSheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => onOpenChange(false)}
          className="min-h-[44px]"
        >
          Annuler
        </Button>
        <TouchButton
          type="submit"
          variant="gold"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          className="sm:w-auto"
        >
          <Check className="h-4 w-4" aria-hidden />
          Confirmer
        </TouchButton>
      </BottomSheetFooter>
    </BottomSheet>
  )
}

/* ============================================================
   2. QuickAddGuestSheet — admin ajouter invité (gold)
   ============================================================ */
export interface QuickAddGuestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired with form data on submit. */
  onSubmit?: (data: { name: string; email: string; phone: string; side: string }) => void
}

export function QuickAddGuestSheet({
  open,
  onOpenChange,
  onSubmit,
}: QuickAddGuestSheetProps) {
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    side: 'both',
  })

  const update = (key: keyof typeof form, value: string) =>
    setForm((p) => ({ ...p, [key]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.(form)
    setForm({ name: '', email: '', phone: '', side: 'both' })
    onOpenChange(false)
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter un invité"
      description="Saisissez les coordonnées de l'invité — un email d'invitation sera envoyé."
      size="auto"
      variant="premium"
    >
      <BottomSheetContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-name" className="flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-[var(--gold)]" aria-hidden />
              Nom complet
            </Label>
            <Input
              id="add-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Jean Dupont"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-[var(--gold)]" aria-hidden />
              Email
            </Label>
            <Input
              id="add-email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="jean@exemple.fr"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-[var(--gold)]" aria-hidden />
              Téléphone
            </Label>
            <Input
              id="add-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+33 6 12 34 56 78"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-side" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-[var(--gold)]" aria-hidden />
              Côté
            </Label>
            <Select
              value={form.side}
              onValueChange={(v) => update('side', v)}
            >
              <SelectTrigger id="add-side" className="w-full">
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bride">Mariée</SelectItem>
                <SelectItem value="groom">Marié</SelectItem>
                <SelectItem value="both">Les deux / Commun</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </BottomSheetContent>
      <BottomSheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => onOpenChange(false)}
          className="min-h-[44px]"
        >
          Annuler
        </Button>
        <TouchButton
          type="submit"
          variant="gold"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          className="sm:w-auto"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Ajouter
        </TouchButton>
      </BottomSheetFooter>
    </BottomSheet>
  )
}

/* ============================================================
   3. QuickFilterSheet — filtres liste (emerald)
   ============================================================ */
export interface QuickFilterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply?: (filters: {
    search: string
    statuses: string[]
    side: string
  }) => void
}

export function QuickFilterSheet({
  open,
  onOpenChange,
  onApply,
}: QuickFilterSheetProps) {
  const [search, setSearch] = React.useState('')
  const [statuses, setStatuses] = React.useState<string[]>([])
  const [side, setSide] = React.useState('all')

  const toggleStatus = (s: string) =>
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )

  const handleApply = () => {
    onApply?.({ search, statuses, side })
    onOpenChange(false)
  }

  const handleReset = () => {
    setSearch('')
    setStatuses([])
    setSide('all')
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filtrer"
      description="Affinez la liste des invités par recherche, statut et côté."
      size="auto"
      variant="default"
    >
      <BottomSheetContent>
        <div className="space-y-4">
          {/* Search input */}
          <div className="space-y-1.5">
            <Label htmlFor="filter-search" className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-[var(--emerald-brand)]" aria-hidden />
              Rechercher
            </Label>
            <Input
              id="filter-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, email…"
            />
          </div>

          {/* Status checkboxes */}
          <div className="space-y-2">
            <Label>Statut</Label>
            <div className="space-y-2">
              {[
                { id: 'confirmed', label: 'Confirmé' },
                { id: 'pending', label: 'En attente' },
                { id: 'declined', label: 'Décliné' },
              ].map((s) => (
                <Label
                  key={s.id}
                  htmlFor={`filter-status-${s.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 min-h-[44px] cursor-pointer hover:bg-accent/40 transition-colors"
                >
                  <Checkbox
                    id={`filter-status-${s.id}`}
                    checked={statuses.includes(s.id)}
                    onCheckedChange={() => toggleStatus(s.id)}
                  />
                  <span className="text-fluid-sm font-medium">{s.label}</span>
                </Label>
              ))}
            </div>
          </div>

          {/* Side select */}
          <div className="space-y-1.5">
            <Label htmlFor="filter-side">Côté</Label>
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger id="filter-side" className="w-full">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="bride">Mariée</SelectItem>
                <SelectItem value="groom">Marié</SelectItem>
                <SelectItem value="both">Commun</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </BottomSheetContent>
      <BottomSheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={handleReset}
          className="min-h-[44px]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Réinitialiser
        </Button>
        <TouchButton
          type="button"
          variant="emerald"
          size="lg"
          fullWidth
          onClick={handleApply}
          className="sm:w-auto"
        >
          <Check className="h-4 w-4" aria-hidden />
          Appliquer
        </TouchButton>
      </BottomSheetFooter>
    </BottomSheet>
  )
}

/* ============================================================
   4. QuickConfirmSheet — confirmation (default / red si danger)
   ============================================================ */
export interface QuickConfirmSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  /** Si true, bouton confirm en rouge (destructive). */
  danger?: boolean
}

export function QuickConfirmSheet({
  open,
  onOpenChange,
  title = 'Confirmer',
  message = 'Êtes-vous sûr de vouloir effectuer cette action ?',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  danger = false,
}: QuickConfirmSheetProps) {
  const variant: BottomSheetVariant = danger ? 'default' : 'default'

  const handleConfirm = () => {
    onConfirm?.()
    onOpenChange(false)
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={message}
      size="auto"
      variant={variant}
    >
      <BottomSheetContent>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              danger
                ? 'bg-destructive/10 text-destructive'
                : 'bg-[var(--gold)]/10 text-[var(--gold)]',
            )}
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-fluid-sm text-muted-foreground pt-1.5 text-pretty">
            {message}
          </p>
        </div>
      </BottomSheetContent>
      <BottomSheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => onOpenChange(false)}
          className="min-h-[44px]"
        >
          {cancelLabel}
        </Button>
        <TouchButton
          type="button"
          variant={danger ? 'destructive' : 'gold'}
          size="lg"
          fullWidth
          onClick={handleConfirm}
          className="sm:w-auto"
        >
          {danger && <AlertTriangle className="h-4 w-4" aria-hidden />}
          {confirmLabel}
        </TouchButton>
      </BottomSheetFooter>
    </BottomSheet>
  )
}

/* ============================================================
   5. QuickShareSheet — partage social (gold)
   ============================================================ */
export interface QuickShareSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** URL à partager. */
  url?: string
  /** Titre / sujet du partage. */
  title?: string
}

export function QuickShareSheet({
  open,
  onOpenChange,
  url = typeof window !== 'undefined' ? window.location.href : '',
  title = 'Partager cette page',
}: QuickShareSheetProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Silent fail — clipboard API may be unavailable
    }
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`
  const emailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Partager"
      description="Partagez ce lien via votre canal préféré."
      size="auto"
      variant="premium"
    >
      <BottomSheetContent>
        <div className="space-y-3">
          {/* URL preview + copy */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <Link2 className="h-4 w-4 shrink-0 text-[var(--gold)]" aria-hidden />
            <span className="flex-1 truncate text-fluid-xs font-mono text-muted-foreground">
              {url}
            </span>
            <TouchButton
              type="button"
              size="sm"
              variant={copied ? 'emerald' : 'outline'}
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Copié
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copier
                </>
              )}
            </TouchButton>
          </div>

          {/* Share options grid */}
          <div className="grid grid-cols-3 gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 min-h-[80px]',
                'hover:bg-accent/40 transition-colors justify-center',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <MessageCircle className="h-6 w-6 text-[var(--emerald-brand)]" aria-hidden />
              <span className="text-fluid-xs font-medium">WhatsApp</span>
            </a>
            <a
              href={emailUrl}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 min-h-[80px]',
                'hover:bg-accent/40 transition-colors justify-center',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <Mail className="h-6 w-6 text-[var(--gold)]" aria-hidden />
              <span className="text-fluid-xs font-medium">Email</span>
            </a>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 min-h-[80px]',
                'hover:bg-accent/40 transition-colors justify-center',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <QrCode className="h-6 w-6 text-[var(--blush)]" aria-hidden />
              <span className="text-fluid-xs font-medium">QR Code</span>
            </button>
          </div>
        </div>
      </BottomSheetContent>
      <BottomSheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => onOpenChange(false)}
          className="min-h-[44px] w-full sm:w-auto"
        >
          Fermer
        </Button>
      </BottomSheetFooter>
    </BottomSheet>
  )
}

/* ============================================================
   6. QuickLoginSheet — connexion rapide (emerald)
   ============================================================ */
export interface QuickLoginSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit?: (data: { email: string; password: string }) => void
}

export function QuickLoginSheet({
  open,
  onOpenChange,
  onSubmit,
}: QuickLoginSheetProps) {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.({ email, password })
    onOpenChange(false)
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Connexion"
      description="Accédez à votre espace mariage en quelques secondes."
      size="auto"
      variant="default"
    >
      <BottomSheetContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-[var(--emerald-brand)]" aria-hidden />
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[var(--emerald-brand)]" aria-hidden />
              Mot de passe
            </Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onOpenChange(false)
            }}
            className="inline-block text-fluid-xs text-[var(--emerald-brand)] hover:underline"
          >
            Mot de passe oublié ?
          </a>
        </form>
      </BottomSheetContent>
      <BottomSheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => onOpenChange(false)}
          className="min-h-[44px]"
        >
          Annuler
        </Button>
        <TouchButton
          type="submit"
          variant="emerald"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          className="sm:w-auto"
        >
          Se connecter
        </TouchButton>
      </BottomSheetFooter>
    </BottomSheet>
  )
}
