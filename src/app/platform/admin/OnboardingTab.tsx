'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  Sparkles,
  Phone,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Plus,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Rocket,
  Eye,
  EyeOff,
  Wand2,
  MessageCircle,
  Copy,
  ExternalLink,
  Heart,
  Mail,
  MapPin,
  User,
  Lock,
  ArrowLeft,
  ArrowRight,
  FileText,
  AlertCircle,
  Link2,
  Wallet,
} from 'lucide-react'

import {
  PLAN_METADATA,
  generateSlug,
  isValidSlug,
  buildCoupleLabel,
  type Plan,
} from '@/lib/types'
import {
  BILLING_CYCLE_LABELS,
  PAYMENT_METHOD_LABELS,
  resolveAmountUsdCents,
  buildWhatsAppMessage,
  type BillingCycle,
  type PaymentMethod,
} from '@/lib/billing'
import { formatUsd, formatFcfa, formatDate, toDateInput } from '@/lib/format'

// ══════════════════════════════════════════════════════════════════════════════
// Types — mirror the API responses (Task 7-a contracts)
// ══════════════════════════════════════════════════════════════════════════════

type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'REJECTED'

interface Lead {
  id: string
  brideName: string
  groomName: string
  coupleLabel: string
  weddingDate: string | null
  venueCity: string | null
  email: string
  phone: string | null
  plan: Plan
  message: string | null
  status: LeadStatus
  notes: string | null
  convertedWeddingId: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
}

interface LeadsListResponse {
  leads: Lead[]
  total: number
  page: number
  limit: number
  summary: { NEW: number; CONTACTED: number; CONVERTED: number; REJECTED: number }
}

interface CreateWeddingResponse {
  wedding: {
    id: string
    slug: string
    brideName: string
    groomName: string
    coupleLabel: string
    status: string
    plan: Plan
    weddingDate: string | null
    venueCity: string | null
    timezone: string
    publishedAt: string | null
    createdAt: string
  }
  organizer: {
    id: string
    email: string
    name: string
    role: string
    weddingId: string
  }
  subscription: {
    id: string
    plan: Plan
    status: string
    amountAgreed: number | null
    billingCycle: BillingCycle
    paymentMethod: string | null
    whatsappPhone: string | null
    amountUsdCents: number
  }
  invoice: {
    id: string
    amountDue: number
    amountPaid: number
    currency: string
    billingCycle: BillingCycle
    status: string
    paymentMethod: string | null
  }
  whatsapp: {
    url: string
    recipient: string | null
    message: string
  }
  lead: { id: string; status: string; convertedWeddingId: string | null } | null
}

// ══════════════════════════════════════════════════════════════════════════════
// Display constants
// ══════════════════════════════════════════════════════════════════════════════

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Nouveau',
  CONTACTED: 'À contacter',
  CONVERTED: 'Converti',
  REJECTED: 'Rejeté',
}

const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  NEW: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CONTACTED: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  CONVERTED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  REJECTED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'CONVERTED', 'REJECTED']

const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'ANNUAL', 'ONE_TIME']
const PAYMENT_METHODS: PaymentMethod[] = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'OTHER']
const PAYMENT_METHOD_PLACEHOLDER = 'NONE'

const TIMEZONES = [
  'Africa/Kinshasa',
  'Africa/Lagos',
  'Africa/Abidjan',
  'Africa/Dakar',
  'Africa/Douala',
  'Africa/Libreville',
  'Africa/Cairo',
  'Africa/Johannesburg',
]

/**
 * Static plan catalog for the Step 2 selector. Mirrors the price/services info
 * from PLAN_METADATA + PLAN_LIMITS — duplicated here so the wizard card can
 * show media quota / staff count / domain flag without importing server-only
 * modules in the client bundle.
 */
const PLANS = [
  {
    id: 'TRIAL' as Plan,
    label: 'Essai Libre',
    priceUsd: 0,
    priceFcfa: 0,
    guests: '20',
    media: '100 Mo',
    staff: '1',
    customDomain: false,
    tagline: '14 jours d\'essai',
  },
  {
    id: 'ESSENTIEL' as Plan,
    label: 'Essentiel',
    priceUsd: 49,
    priceFcfa: 30000,
    guests: '200',
    media: '1 Go',
    staff: '2',
    customDomain: false,
    tagline: 'Pour les cérémonies intimistes',
  },
  {
    id: 'PREMIUM' as Plan,
    label: 'Premium',
    priceUsd: 99,
    priceFcfa: 60000,
    guests: '500',
    media: '5 Go',
    staff: '5',
    customDomain: true,
    popular: true,
    tagline: 'Le plus populaire',
  },
  {
    id: 'ELITE' as Plan,
    label: 'Élite',
    priceUsd: 199,
    priceFcfa: 120000,
    guests: 'Illimités',
    media: '20 Go',
    staff: 'Illimités',
    customDomain: true,
    whiteLabel: true,
    tagline: 'Pour les mariages d\'exception',
  },
]

const WIZARD_STEPS = [
  { id: 1, label: 'Couple' },
  { id: 2, label: 'Plan' },
  { id: 3, label: 'Tarifs' },
  { id: 4, label: 'Organisateur' },
  { id: 5, label: 'Vérification' },
]

// ══════════════════════════════════════════════════════════════════════════════
// Wizard form state
// ══════════════════════════════════════════════════════════════════════════════

interface WizardFormState {
  // Step 1 — Couple
  brideName: string
  groomName: string
  weddingDate: string // yyyy-mm-dd
  timezone: string
  venueName: string
  venueCity: string
  slug: string
  slugTouched: boolean
  // Step 2 — Plan
  plan: Plan
  // Step 3 — Pricing & billing
  billingCycle: BillingCycle
  amountAgreed: string // USD cents as string
  paymentMethod: PaymentMethod | ''
  whatsappPhone: string
  notes: string
  // Step 4 — Organizer
  organizerName: string
  organizerEmail: string
  organizerPassword: string
  showPassword: boolean
  // Step 5 — Options
  publish: boolean
}

const EMPTY_FORM: WizardFormState = {
  brideName: '',
  groomName: '',
  weddingDate: '',
  timezone: 'Africa/Kinshasa',
  venueName: '',
  venueCity: '',
  slug: '',
  slugTouched: false,
  plan: 'PREMIUM',
  billingCycle: 'MONTHLY',
  amountAgreed: '',
  paymentMethod: '',
  whatsappPhone: '',
  notes: '',
  organizerName: '',
  organizerEmail: '',
  organizerPassword: '',
  showPassword: false,
  publish: false,  // Mission 5.5: default to DRAFT — publish only after payment verification
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

// P2-CQ-3: formatters imported from @/lib/format — local copies deleted.
// formatUsd / formatFcfa / formatDate / toDateInput are imported from
// @/lib/format. The previous local `formatFcfa` used `usdCentsToFcfa(cents)`;
// the lib version computes the same value inline via FCFA_TO_USD_RATE —
// functionally identical.

/** Generate a random 12-character password (mixed alphanumeric). */
function generateRandomPassword(length = 12): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  for (let i = 0; i < length; i++) {
    out += chars[arr[i] % chars.length]
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// Main OnboardingTab component
// ══════════════════════════════════════════════════════════════════════════════

export function OnboardingTab({
  fetchWithAuth,
}: {
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null>
}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | LeadStatus>('ALL')
  const [summary, setSummary] = useState<LeadsListResponse['summary']>({
    NEW: 0,
    CONTACTED: 0,
    CONVERTED: 0,
    REJECTED: 0,
  })

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [form, setForm] = useState<WizardFormState>(EMPTY_FORM)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [sourceLead, setSourceLead] = useState<Lead | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<CreateWeddingResponse | null>(null)
  const [slugChecking, setSlugChecking] = useState(false)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'available' | 'taken' | 'invalid'>('idle')

  // Notes dialog
  const [notesLead, setNotesLead] = useState<Lead | null>(null)
  const [notesValue, setNotesValue] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesSaving, setNotesSaving] = useState(false)

  // Reject confirmation
  const [rejectLead, setRejectLead] = useState<Lead | null>(null)

  const LIMIT = 20
  const searchRef = useRef(search)
  searchRef.current = search

  // ─── Fetch leads ────────────────────────────────────────────────────────
  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(LIMIT),
      })
      if (searchRef.current) params.set('search', searchRef.current)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetchWithAuth(`/api/onboarding/leads?${params.toString()}`)
      if (!res) {
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as LeadsListResponse
        setLeads(json.leads || [])
        setTotal(json.total || 0)
        setTotalPages(Math.max(1, Math.ceil((json.total || 0) / (json.limit || LIMIT))))
        setPage(json.page || targetPage)
        setSummary(json.summary || { NEW: 0, CONTACTED: 0, CONVERTED: 0, REJECTED: 0 })
      } catch {
        toast.error('Réponse invalide du serveur')
      } finally {
        setLoading(false)
      }
    },
    [fetchWithAuth, statusFilter],
  )

  useEffect(() => {
    load(1)
  }, [statusFilter, load])

  // Debounced search (300ms)
  useEffect(() => {
    const t = setTimeout(() => load(1), 300)
    return () => clearTimeout(t)
  }, [search, load])

  // ─── Lead status mutations ──────────────────────────────────────────────
  const patchLead = useCallback(
    async (lead: Lead, patch: { status?: LeadStatus; notes?: string | null }) => {
      const res = await fetchWithAuth(`/api/onboarding/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res) return false
      if (res.ok) {
        const json = (await res.json()) as { lead: Lead }
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? json.lead : l)))
        // Refresh summary counts (cheapest path: reload)
        load(page)
        return true
      }
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Erreur lors de la mise à jour du lead')
      return false
    },
    [fetchWithAuth, load, page],
  )

  const handleMarkContacted = useCallback(
    (lead: Lead) => patchLead(lead, { status: 'CONTACTED' }),
    [patchLead],
  )
  const handleMarkConverted = useCallback(
    (lead: Lead) => patchLead(lead, { status: 'CONVERTED' }),
    [patchLead],
  )
  const handleConfirmReject = useCallback(async () => {
    if (!rejectLead) return
    const ok = await patchLead(rejectLead, { status: 'REJECTED' })
    if (ok) toast.success('Lead rejeté')
    setRejectLead(null)
  }, [rejectLead, patchLead])

  // ─── Notes dialog ────────────────────────────────────────────────────────
  const openNotes = useCallback((lead: Lead) => {
    setNotesLead(lead)
    setNotesValue(lead.notes || '')
    setNotesOpen(true)
  }, [])

  const handleSaveNotes = useCallback(async () => {
    if (!notesLead) return
    setNotesSaving(true)
    const ok = await patchLead(notesLead, { notes: notesValue.trim() || null })
    setNotesSaving(false)
    if (ok) {
      toast.success('Note enregistrée')
      setNotesOpen(false)
    }
  }, [notesLead, notesValue, patchLead])

  // ─── Wizard ──────────────────────────────────────────────────────────────
  const openWizardCreate = useCallback(() => {
    setForm(EMPTY_FORM)
    setLeadId(null)
    setSourceLead(null)
    setWizardStep(1)
    setSlugStatus('idle')
    setWizardOpen(true)
  }, [])

  const openWizardFromLead = useCallback((lead: Lead) => {
    setForm({
      ...EMPTY_FORM,
      brideName: lead.brideName,
      groomName: lead.groomName,
      weddingDate: toDateInput(lead.weddingDate),
      venueCity: lead.venueCity || '',
      plan: lead.plan,
      whatsappPhone: lead.phone || '',
      organizerEmail: lead.email || '',
      // Auto-suggest slug from lead names
      slug: generateSlug(lead.brideName, lead.groomName),
      slugTouched: false,
    })
    setLeadId(lead.id)
    setSourceLead(lead)
    setWizardStep(1)
    setSlugStatus('idle')
    setWizardOpen(true)
  }, [])

  // Auto-suggest slug when bride/groom names change (only if user hasn't manually edited)
  useEffect(() => {
    if (!wizardOpen) return
    if (form.slugTouched) return
    if (!form.brideName.trim() && !form.groomName.trim()) return
    const suggested = generateSlug(form.brideName, form.groomName)
    if (suggested !== form.slug) {
      setForm((f) => ({ ...f, slug: suggested }))
      setSlugStatus('idle')
    }
  }, [form.brideName, form.groomName, form.slugTouched, form.slug, wizardOpen])

  // ─── Slug availability check ─────────────────────────────────────────────
  const checkSlugAvailability = useCallback(async () => {
    const slug = form.slug.trim().toLowerCase()
    if (!slug) {
      toast.error('Veuillez saisir un slug')
      return
    }
    if (!isValidSlug(slug)) {
      setSlugStatus('invalid')
      return
    }
    setSlugChecking(true)
    const res = await fetchWithAuth(`/api/platform/weddings?search=${encodeURIComponent(slug)}&limit=50`)
    setSlugChecking(false)
    if (!res) return
    try {
      const json = (await res.json()) as { weddings: Array<{ slug: string }> }
      const exists = (json.weddings || []).some((w) => w.slug.toLowerCase() === slug)
      setSlugStatus(exists ? 'taken' : 'available')
      if (!exists) toast.success(`Slug "${slug}" disponible`)
      else toast.error(`Slug "${slug}" déjà utilisé`)
    } catch {
      toast.error('Impossible de vérifier le slug')
    }
  }, [fetchWithAuth, form.slug])

  // ─── Step validation ─────────────────────────────────────────────────────
  const validateStep = useCallback((step: number): string | null => {
    if (step === 1) {
      if (!form.brideName.trim()) return 'Le prénom de la mariée est requis'
      if (!form.groomName.trim()) return 'Le prénom du marié est requis'
      if (!form.slug.trim()) return 'Le slug est requis'
      if (!isValidSlug(form.slug.trim().toLowerCase())) {
        return 'Slug invalide (3-32 caractères, minuscules, chiffres et traits d\'union)'
      }
    }
    if (step === 4) {
      if (!form.organizerName.trim()) return 'Le nom de l\'organisateur est requis'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.organizerEmail.trim())) {
        return 'Adresse e-mail organisateur invalide'
      }
      if (form.organizerPassword.length < 8) {
        return 'Le mot de passe doit comporter au moins 8 caractères'
      }
    }
    return null
  }, [form])

  const handleNext = useCallback(() => {
    const err = validateStep(wizardStep)
    if (err) {
      toast.error(err)
      return
    }
    setWizardStep((s) => Math.min(5, s + 1))
  }, [wizardStep, validateStep])

  const handleBack = useCallback(() => {
    setWizardStep((s) => Math.max(1, s - 1))
  }, [])

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    // Final validation across all steps
    for (const s of [1, 4]) {
      const err = validateStep(s)
      if (err) {
        setWizardStep(s)
        toast.error(err)
        return
      }
    }
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      brideName: form.brideName.trim(),
      groomName: form.groomName.trim(),
      weddingDate: form.weddingDate ? new Date(form.weddingDate).toISOString() : undefined,
      timezone: form.timezone,
      venueName: form.venueName.trim() || undefined,
      venueCity: form.venueCity.trim() || undefined,
      slug: form.slug.trim().toLowerCase(),
      plan: form.plan,
      billingCycle: form.billingCycle,
      paymentMethod: form.paymentMethod || undefined,
      whatsappPhone: form.whatsappPhone.trim() || undefined,
      notes: form.notes.trim() || undefined,
      organizerName: form.organizerName.trim(),
      organizerEmail: form.organizerEmail.trim().toLowerCase(),
      organizerPassword: form.organizerPassword,
      publish: form.publish,
    }
    if (form.amountAgreed.trim()) {
      const n = Number(form.amountAgreed)
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Prix personnalisé invalide (entier en centimes USD)')
        setSubmitting(false)
        return
      }
      payload.amountAgreed = Math.round(n)
    }
    if (leadId) payload.leadId = leadId

    const res = await fetchWithAuth('/api/onboarding/create-wedding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSubmitting(false)
    if (!res) return

    if (res.ok) {
      const json = (await res.json()) as CreateWeddingResponse
      setWizardOpen(false)
      setSuccess(json)
      toast.success('Mariage créé avec succès ! 💍')
      // Refresh leads list (the converted lead will now show CONVERTED status)
      load(1)
    } else if (res.status === 400 || res.status === 409) {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Données invalides')
    } else {
      toast.error('Une erreur est survenue. Veuillez réessayer.')
    }
  }, [form, leadId, validateStep, fetchWithAuth, load])

  const handleCloseSuccess = useCallback(() => {
    setSuccess(null)
    load(1)
  }, [load])

  const handleCopySuccessMessage = useCallback(async () => {
    if (!success) return
    try {
      await navigator.clipboard.writeText(success.whatsapp.message)
      toast.success('Message copié dans le presse-papiers')
    } catch {
      toast.error('Impossible de copier le message')
    }
  }, [success])

  // ─── Derived: live price preview for Step 3 ──────────────────────────────
  const liveAmountUsdCents = useMemo(() => {
    const custom = form.amountAgreed.trim()
      ? Number(form.amountAgreed)
      : null
    if (custom != null && Number.isFinite(custom) && custom > 0) {
      return Math.round(custom)
    }
    return resolveAmountUsdCents(form.plan, null, form.billingCycle)
  }, [form.amountAgreed, form.plan, form.billingCycle])

  const liveWhatsAppPreview = useMemo(() => {
    const coupleLabel = buildCoupleLabel(form.brideName, form.groomName)
    if (!coupleLabel || coupleLabel === 'Mariage') return ''
    return buildWhatsAppMessage({
      coupleLabel,
      plan: form.plan,
      amountUsdCents: liveAmountUsdCents,
      billingCycle: form.billingCycle,
      weddingSlug: form.slug.trim().toLowerCase() || 'slug',
      notes: form.notes.trim() || null,
    })
  }, [form.brideName, form.groomName, form.plan, liveAmountUsdCents, form.billingCycle, form.slug, form.notes])

  // ════════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Sparkles className="w-4 h-4" />}
          label="Nouveaux leads"
          value={summary.NEW}
          loading={loading}
          accent="gold"
        />
        <SummaryCard
          icon={<Phone className="w-4 h-4" />}
          label="À contacter"
          value={summary.CONTACTED}
          loading={loading}
          accent="teal"
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Convertis"
          value={summary.CONVERTED}
          loading={loading}
          accent="emerald"
        />
        <SummaryCard
          icon={<XCircle className="w-4 h-4" />}
          label="Rejetés"
          value={summary.REJECTED}
          loading={loading}
          accent="muted"
        />
      </div>

      {/* ─── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher (mariée, marié, e-mail, téléphone)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card/50 border-border"
            aria-label="Rechercher un lead"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'ALL' | LeadStatus)}
        >
          <SelectTrigger className="w-full sm:w-48 bg-card/50" aria-label="Filtrer par statut">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => load(page)}
          disabled={loading}
          aria-label="Rafraîchir"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Rafraîchir
        </Button>
        <Button
          onClick={openWizardCreate}
          className="bg-gold hover:bg-gold/90 text-white shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          Créer un mariage
        </Button>
      </div>

      {/* ─── Leads table ────────────────────────────────────────────────── */}
      <Card className="bg-card/50 border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Rocket className="w-10 h-10 mx-auto mb-3 text-gold/60" />
              <p className="text-sm text-muted-foreground mb-4">
                Aucun lead pour ce filtre.
              </p>
              <Button
                onClick={openWizardCreate}
                className="bg-gold hover:bg-gold/90 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Créer un mariage directement
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Couple</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Plan souhaité</TableHead>
                    <TableHead>Date mariage</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{lead.coupleLabel}</span>
                          {lead.venueCity && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {lead.venueCity}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs flex items-center gap-1">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            {lead.email}
                          </span>
                          {lead.phone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {lead.phone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={planBadgeClass(lead.plan)}>
                          {PLAN_METADATA[lead.plan].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(lead.weddingDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={LEAD_STATUS_BADGE[lead.status]}>
                          {LEAD_STATUS_LABELS[lead.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(lead.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openWizardFromLead(lead)}>
                              <Rocket className="w-3.5 h-3.5 mr-2" />
                              Ouvrir le wizard
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleMarkContacted(lead)}
                              disabled={lead.status === 'CONTACTED' || lead.status === 'CONVERTED'}
                            >
                              <Phone className="w-3.5 h-3.5 mr-2" />
                              Marquer à contacter
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleMarkConverted(lead)}
                              disabled={lead.status === 'CONVERTED'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                              Marquer converti
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openNotes(lead)}>
                              <FileText className="w-3.5 h-3.5 mr-2" />
                              {lead.notes ? 'Modifier la note' : 'Ajouter une note'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setRejectLead(lead)}
                              disabled={lead.status === 'REJECTED'}
                              className="text-red-400 focus:text-red-400"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-2" />
                              Rejeter
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Pagination ─────────────────────────────────────────────────── */}
      {leads.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} / {Math.max(totalPages, 1)} · {total} lead{total > 1 ? 's' : ''}
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
      )}

      {/* ─── Wizard dialog ──────────────────────────────────────────────── */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-gold" />
              {sourceLead ? 'Convertir un lead en mariage' : 'Créer un mariage'}
            </DialogTitle>
            <DialogDescription>
              Configurez le mariage, le plan, la facturation et le compte
              organisateur en 5 étapes.
            </DialogDescription>
          </DialogHeader>

          {/* Lead source banner */}
          {sourceLead && (
            <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold shrink-0" />
              <div className="text-sm">
                <span className="text-muted-foreground">Conversion du lead :</span>{' '}
                <span className="font-medium">{sourceLead.coupleLabel}</span>
                <span className="text-muted-foreground"> · {sourceLead.email}</span>
              </div>
            </div>
          )}

          {/* Stepper */}
          <div className="space-y-2">
            <Progress value={(wizardStep / 5) * 100} className="h-1.5 bg-white/10" />
            <div className="flex flex-wrap gap-2">
              {WIZARD_STEPS.map((s) => {
                const isActive = s.id === wizardStep
                const isDone = s.id < wizardStep
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                      isActive
                        ? 'bg-gold/15 text-gold'
                        : isDone
                          ? 'text-emerald-400'
                          : 'text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-gold text-white'
                          : isDone
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-white/10'
                      }`}
                    >
                      {isDone ? '✓' : s.id}
                    </span>
                    {s.label}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step content */}
          <div className="min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={wizardStep}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.18 }}
              >
                {wizardStep === 1 && (
                  <CoupleStep
                    form={form}
                    setForm={setForm}
                    slugStatus={slugStatus}
                    slugChecking={slugChecking}
                    onCheckSlug={checkSlugAvailability}
                  />
                )}
                {wizardStep === 2 && <PlanStep form={form} setForm={setForm} />}
                {wizardStep === 3 && (
                  <PricingStep
                    form={form}
                    setForm={setForm}
                    liveAmountUsdCents={liveAmountUsdCents}
                    liveWhatsAppPreview={liveWhatsAppPreview}
                  />
                )}
                {wizardStep === 4 && <OrganizerStep form={form} setForm={setForm} />}
                {wizardStep === 5 && (
                  <ReviewStep
                    form={form}
                    setForm={setForm}
                    liveAmountUsdCents={liveAmountUsdCents}
                    liveWhatsAppPreview={liveWhatsAppPreview}
                    sourceLead={sourceLead}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={wizardStep === 1 || submitting}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Précédent
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setWizardOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              {wizardStep < 5 ? (
                <Button
                  onClick={handleNext}
                  className="bg-gold hover:bg-gold/90 text-white"
                >
                  Suivant
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-gold hover:bg-gold/90 text-white"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="w-4 h-4 mr-2" />
                  )}
                  {form.publish ? 'Créer et publier' : 'Créer en brouillon'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Notes dialog ─────────────────────────────────────────────────── */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold" />
              Note interne — {notesLead?.coupleLabel}
            </DialogTitle>
            <DialogDescription>
              Cette note est privée (invisible du couple). Utilisée pour suivre
              la négociation, le contexte, etc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={6}
              placeholder="ex: A demandé une remise de 10%. Rappeler lundi pour finaliser."
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              className="bg-background/50"
              aria-label="Note interne"
            />
            <p className="text-xs text-muted-foreground">
              {notesValue.length} / 2000 caractères
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesOpen(false)} disabled={notesSaving}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveNotes}
              disabled={notesSaving}
              className="bg-gold hover:bg-gold/90 text-white"
            >
              {notesSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reject confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={!!rejectLead} onOpenChange={(open) => !open && setRejectLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter ce lead ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le lead <strong>{rejectLead?.coupleLabel}</strong> sera marqué comme
              rejeté. Cette action peut être annulée en modifiant le statut
              ultérieurement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Rejeter le lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Success dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!success} onOpenChange={(open) => !open && handleCloseSuccess()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-gold" />
              Mariage créé avec succès ! 💍
            </DialogTitle>
            <DialogDescription>
              Le mariage, le compte organisateur, l&apos;abonnement et la première
              facture ont été créés en une seule transaction.
            </DialogDescription>
          </DialogHeader>

          {success && (
            <div className="space-y-4">
              {/* Wedding summary */}
              <SuccessCard
                icon={<Heart className="w-4 h-4 text-gold" />}
                title="Mariage"
              >
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Field label="Couple" value={success.wedding.coupleLabel} />
                  <Field
                    label="Statut"
                    value={
                      <Badge variant="outline" className={weddingStatusBadge(success.wedding.status)}>
                        {success.wedding.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}
                      </Badge>
                    }
                  />
                  <Field label="Slug" value={`/${success.wedding.slug}`} />
                  <Field label="Plan" value={PLAN_METADATA[success.wedding.plan].label} />
                  <Field
                    label="Lien public"
                    value={
                      <Link
                        href={`/w/${success.wedding.slug}`}
                        target="_blank"
                        className="text-gold hover:underline inline-flex items-center gap-1"
                      >
                        /w/{success.wedding.slug}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    }
                  />
                  <Field
                    label="Publié le"
                    value={success.wedding.publishedAt ? formatDate(success.wedding.publishedAt) : '—'}
                  />
                </div>
              </SuccessCard>

              {/* Organizer credentials */}
              <SuccessCard
                icon={<User className="w-4 h-4 text-gold" />}
                title="Compte organisateur"
              >
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Field label="Nom" value={success.organizer.name} />
                  <Field label="Rôle" value="Organisateur" />
                  <Field label="E-mail" value={success.organizer.email} />
                  <Field
                    label="Mot de passe"
                    value={
                      <span className="text-muted-foreground italic flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Communiqué au couple
                      </span>
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Connexion au panneau d&apos;administration du mariage via{' '}
                  <Link
                    href={`/w/${success.wedding.slug}/admin`}
                    target="_blank"
                    className="text-gold hover:underline"
                  >
                    /w/{success.wedding.slug}/admin
                  </Link>
                </p>
              </SuccessCard>

              {/* Subscription + Invoice */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SuccessCard
                  icon={<Wallet className="w-4 h-4 text-gold" />}
                  title="Abonnement"
                >
                  <div className="space-y-1 text-sm">
                    <Field label="Plan" value={PLAN_METADATA[success.subscription.plan].label} />
                    <Field
                      label="Statut"
                      value={
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                          Paiement en attente
                        </Badge>
                      }
                    />
                    <Field
                      label="Montant"
                      value={`${formatUsd(success.subscription.amountUsdCents)} (${formatFcfa(success.subscription.amountUsdCents)})`}
                    />
                    <Field
                      label="Cycle"
                      value={BILLING_CYCLE_LABELS[success.subscription.billingCycle]}
                    />
                  </div>
                </SuccessCard>

                <SuccessCard
                  icon={<FileText className="w-4 h-4 text-gold" />}
                  title="Facture"
                >
                  <div className="space-y-1 text-sm">
                    <Field
                      label="N°"
                      value={<code className="text-xs">{success.invoice.id.slice(-8)}</code>}
                    />
                    <Field
                      label="Montant dû"
                      value={formatUsd(success.invoice.amountDue)}
                    />
                    <Field
                      label="Statut"
                      value={
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                          À payer
                        </Badge>
                      }
                    />
                    <Field
                      label="Cycle"
                      value={BILLING_CYCLE_LABELS[success.invoice.billingCycle]}
                    />
                  </div>
                </SuccessCard>
              </div>

              {success.lead && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Lead source marqué comme <strong>converti</strong> et lié à ce
                    mariage.
                  </span>
                </div>
              )}

              {/* WhatsApp section */}
              <SuccessCard
                icon={<MessageCircle className="w-4 h-4 text-emerald-400" />}
                title="Message WhatsApp à envoyer au couple"
              >
                <Textarea
                  readOnly
                  value={success.whatsapp.message}
                  rows={10}
                  className="font-mono text-xs bg-background/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {success.whatsapp.recipient
                    ? `Destinataire : ${success.whatsapp.recipient}`
                    : 'Aucun numéro — l\'utilisateur choisira le destinataire dans WhatsApp'}
                </p>
              </SuccessCard>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCopySuccessMessage}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copier le message
                  </Button>
                  <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <a
                      href={success.whatsapp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Ouvrir WhatsApp
                    </a>
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/w/${success.wedding.slug}`} target="_blank">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Voir le mariage
                    </Link>
                  </Button>
                  <Button
                    onClick={handleCloseSuccess}
                    className="bg-gold hover:bg-gold/90 text-white"
                  >
                    Fermer
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════════════════════

function planBadgeClass(plan: Plan): string {
  return {
    ELITE: 'bg-gold/15 text-gold border-gold/40',
    PREMIUM: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    ESSENTIEL: 'bg-gold-dark/15 text-gold-dark border-gold-dark/30',
    TRIAL: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  }[plan]
}

function weddingStatusBadge(status: string): string {
  if (status === 'PUBLISHED') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (status === 'DRAFT') return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
}

function SummaryCard({
  icon,
  label,
  value,
  loading,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  loading?: boolean
  accent?: 'gold' | 'emerald' | 'teal' | 'muted'
}) {
  const accentClass =
    accent === 'gold'
      ? 'text-gold'
      : accent === 'emerald'
        ? 'text-emerald-400'
        : accent === 'teal'
          ? 'text-teal-400'
          : 'text-muted-foreground'

  return (
    <Card className="bg-card/50 border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={accentClass}>{icon}</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className={`text-2xl font-bold ${accentClass}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Wizard step components ─────────────────────────────────────────────────

type SetForm = React.Dispatch<React.SetStateAction<WizardFormState>>
type FormRef = { form: WizardFormState; setForm: SetForm }

function CoupleStep({
  form,
  setForm,
  slugStatus,
  slugChecking,
  onCheckSlug,
}: FormRef & {
  slugStatus: 'idle' | 'available' | 'taken' | 'invalid'
  slugChecking: boolean
  onCheckSlug: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wiz-bride" className="text-xs">
            Prénom de la mariée <span className="text-red-400">*</span>
          </Label>
          <Input
            id="wiz-bride"
            value={form.brideName}
            onChange={(e) => setForm((f) => ({ ...f, brideName: e.target.value }))}
            className="mt-1 bg-background/50"
            placeholder="ex: Marie"
            aria-label="Prénom de la mariée"
            required
          />
        </div>
        <div>
          <Label htmlFor="wiz-groom" className="text-xs">
            Prénom du marié <span className="text-red-400">*</span>
          </Label>
          <Input
            id="wiz-groom"
            value={form.groomName}
            onChange={(e) => setForm((f) => ({ ...f, groomName: e.target.value }))}
            className="mt-1 bg-background/50"
            placeholder="ex: Jean"
            aria-label="Prénom du marié"
            required
          />
        </div>
        <div>
          <Label htmlFor="wiz-date" className="text-xs">
            Date du mariage <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Input
            id="wiz-date"
            type="date"
            value={form.weddingDate}
            onChange={(e) => setForm((f) => ({ ...f, weddingDate: e.target.value }))}
            className="mt-1 bg-background/50"
            aria-label="Date du mariage"
          />
        </div>
        <div>
          <Label htmlFor="wiz-tz" className="text-xs">
            Fuseau horaire
          </Label>
          <Select
            value={form.timezone}
            onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          >
            <SelectTrigger id="wiz-tz" className="mt-1 bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="wiz-venue-name" className="text-xs">
            Nom du lieu <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Input
            id="wiz-venue-name"
            value={form.venueName}
            onChange={(e) => setForm((f) => ({ ...f, venueName: e.target.value }))}
            className="mt-1 bg-background/50"
            placeholder="ex: Hôtel Pullman"
            aria-label="Nom du lieu"
          />
        </div>
        <div>
          <Label htmlFor="wiz-venue-city" className="text-xs">
            Ville <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Input
            id="wiz-venue-city"
            value={form.venueCity}
            onChange={(e) => setForm((f) => ({ ...f, venueCity: e.target.value }))}
            className="mt-1 bg-background/50"
            placeholder="ex: Kinshasa"
            aria-label="Ville"
          />
        </div>
      </div>

      <Separator />

      <div>
        <Label htmlFor="wiz-slug" className="text-xs">
          Slug (URL publique) <span className="text-red-400">*</span>
        </Label>
        <div className="flex gap-2 mt-1">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="wiz-slug"
              value={form.slug}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  slug: e.target.value,
                  slugTouched: true,
                }))
              }
              className="pl-10 bg-background/50 font-mono"
              placeholder="ex: marie-jean"
              aria-label="Slug URL publique"
              required
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onCheckSlug}
            disabled={slugChecking || !form.slug.trim()}
          >
            {slugChecking ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Vérifier
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          URL publique : <code className="text-foreground">/w/{form.slug || 'slug'}</code>
          {' · '}
          3 à 32 caractères (minuscules, chiffres, traits d&apos;union).
        </p>
        {slugStatus === 'available' && (
          <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Slug disponible
          </p>
        )}
        {slugStatus === 'taken' && (
          <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Ce slug est déjà utilisé par un autre mariage
          </p>
        )}
        {slugStatus === 'invalid' && (
          <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Slug invalide (3-32 caractères alphanumériques minuscules)
          </p>
        )}
      </div>
    </div>
  )
}

function PlanStep({ form, setForm }: FormRef) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Choisissez un plan
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {PLANS.map((p) => {
            const selected = form.plan === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, plan: p.id }))}
                className={`text-left p-4 rounded-lg border transition-all relative ${
                  selected
                    ? 'border-gold bg-gold/10 ring-1 ring-gold/30'
                    : 'border-border bg-card/30 hover:border-gold/40'
                }`}
                aria-pressed={selected}
                aria-label={`Plan ${p.label}`}
              >
                {p.popular && (
                  <span className="absolute -top-2 right-3 bg-gold text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                    Populaire
                  </span>
                )}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-base">{p.label}</span>
                  {selected && <CheckCircle2 className="w-4 h-4 text-gold" />}
                </div>
                <div className="text-sm text-muted-foreground mb-2">{p.tagline}</div>
                <div className="flex items-baseline gap-2 mb-3">
                  {p.priceUsd === 0 ? (
                    <span className="text-2xl font-bold text-foreground">Gratuit</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-foreground">
                        ${p.priceUsd}
                      </span>
                      <span className="text-xs text-muted-foreground">/ mois</span>
                      <span className="text-xs text-muted-foreground">
                        · {p.priceFcfa.toLocaleString('fr-FR')} FCFA
                      </span>
                    </>
                  )}
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    {p.guests} invités
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    {p.media} de médias
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    {p.staff} compte{p.staff === '1' ? '' : 's'} staff
                  </li>
                  <li className="flex items-center gap-1.5">
                    {p.customDomain ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Domaine personnalisé
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 text-zinc-500" />
                        Sous-domaine Heureux Mariage
                      </>
                    )}
                  </li>
                  {p.whiteLabel && (
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Marque blanche
                    </li>
                  )}
                </ul>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PricingStep({
  form,
  setForm,
  liveAmountUsdCents,
  liveWhatsAppPreview,
}: FormRef & {
  liveAmountUsdCents: number
  liveWhatsAppPreview: string
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wiz-cycle" className="text-xs">
            Cycle de facturation
          </Label>
          <Select
            value={form.billingCycle}
            onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as BillingCycle }))}
          >
            <SelectTrigger id="wiz-cycle" className="mt-1 bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_CYCLES.map((c) => (
                <SelectItem key={c} value={c}>
                  {BILLING_CYCLE_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="wiz-amount" className="text-xs">
            Prix personnalisé (centimes USD){' '}
            <span className="text-muted-foreground">— vide = prix du plan</span>
          </Label>
          <Input
            id="wiz-amount"
            type="number"
            min={0}
            step={100}
            placeholder="ex: 9900 pour $99.00"
            value={form.amountAgreed}
            onChange={(e) => setForm((f) => ({ ...f, amountAgreed: e.target.value }))}
            className="mt-1 bg-background/50"
            aria-label="Prix personnalisé en centimes USD"
          />
        </div>
        <div>
          <Label htmlFor="wiz-payment" className="text-xs">
            Mode de paiement
          </Label>
          <Select
            value={form.paymentMethod || PAYMENT_METHOD_PLACEHOLDER}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                paymentMethod: v === PAYMENT_METHOD_PLACEHOLDER ? '' : (v as PaymentMethod),
              }))
            }
          >
            <SelectTrigger id="wiz-payment" className="mt-1 bg-background/50">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PAYMENT_METHOD_PLACEHOLDER}>—</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="wiz-phone" className="text-xs">
            Téléphone WhatsApp du couple
          </Label>
          <Input
            id="wiz-phone"
            type="tel"
            placeholder="ex: +243 970 000 000"
            value={form.whatsappPhone}
            onChange={(e) => setForm((f) => ({ ...f, whatsappPhone: e.target.value }))}
            className="mt-1 bg-background/50"
            aria-label="Téléphone WhatsApp du couple"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Numéro du couple pour l&apos;envoi de l&apos;offre WhatsApp.
          </p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="wiz-notes" className="text-xs">
            Notes de négociation <span className="text-muted-foreground">(optionnel)</span>
          </Label>
          <Textarea
            id="wiz-notes"
            rows={2}
            placeholder="ex: Remise de 10% pour paiement anticipé"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="mt-1 bg-background/50"
            aria-label="Notes de négociation"
          />
        </div>
      </div>

      <Separator />

      <div className="rounded-lg border border-gold/20 bg-gold/5 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Prix affiché
          </span>
          <div className="text-right">
            <div className="text-lg font-bold text-gold">
              {formatUsd(liveAmountUsdCents)}{' '}
              <span className="text-xs text-muted-foreground font-normal">
                / {BILLING_CYCLE_LABELS[form.billingCycle].toLowerCase()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              ≈ {formatFcfa(liveAmountUsdCents)}
            </div>
          </div>
        </div>
      </div>

      {liveWhatsAppPreview && (
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Aperçu du message WhatsApp
          </Label>
          <Textarea
            readOnly
            value={liveWhatsAppPreview}
            rows={8}
            className="mt-1 font-mono text-xs bg-background/50"
            aria-label="Aperçu du message WhatsApp"
          />
        </div>
      )}
    </div>
  )
}

function OrganizerStep({ form, setForm }: FormRef) {
  const handleGenerate = () => {
    const pwd = generateRandomPassword(12)
    setForm((f) => ({ ...f, organizerPassword: pwd, showPassword: true }))
    toast.success('Mot de passe généré')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="wiz-org-name" className="text-xs">
            Nom de l&apos;organisateur <span className="text-red-400">*</span>
          </Label>
          <Input
            id="wiz-org-name"
            value={form.organizerName}
            onChange={(e) => setForm((f) => ({ ...f, organizerName: e.target.value }))}
            className="mt-1 bg-background/50"
            placeholder="ex: Marie Dupont"
            aria-label="Nom de l'organisateur"
            required
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="wiz-org-email" className="text-xs">
            E-mail de connexion <span className="text-red-400">*</span>
          </Label>
          <Input
            id="wiz-org-email"
            type="email"
            value={form.organizerEmail}
            onChange={(e) => setForm((f) => ({ ...f, organizerEmail: e.target.value }))}
            className="mt-1 bg-background/50"
            placeholder="ex: marie@example.com"
            aria-label="E-mail de connexion organisateur"
            required
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Email de connexion du couple (ou de l&apos;organisateur).
          </p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="wiz-org-pwd" className="text-xs">
            Mot de passe <span className="text-red-400">*</span>{' '}
            <span className="text-muted-foreground">(min. 8 caractères)</span>
          </Label>
          <div className="flex gap-2 mt-1">
            <div className="relative flex-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="wiz-org-pwd"
                type={form.showPassword ? 'text' : 'password'}
                value={form.organizerPassword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, organizerPassword: e.target.value }))
                }
                className="pl-10 pr-10 bg-background/50"
                placeholder="••••••••"
                aria-label="Mot de passe organisateur"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, showPassword: !f.showPassword }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={form.showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {form.showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <Button type="button" variant="outline" onClick={handleGenerate}>
              <Wand2 className="w-4 h-4 mr-2" />
              Générer
            </Button>
          </div>
          {form.organizerPassword && form.organizerPassword.length < 8 && (
            <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Le mot de passe doit comporter au moins 8 caractères
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">
            Ces identifiants permettent au couple de se connecter à{' '}
            <code className="text-foreground">/w/{form.slug || 'slug'}/admin</code>
          </p>
        </div>
      </div>
    </div>
  )
}

function ReviewStep({
  form,
  setForm,
  liveAmountUsdCents,
  liveWhatsAppPreview,
  sourceLead,
}: FormRef & {
  liveAmountUsdCents: number
  liveWhatsAppPreview: string
  sourceLead: Lead | null
}) {
  return (
    <div className="space-y-4">
      {sourceLead && (
        <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-gold shrink-0" />
          <span>
            Lead source : <strong>{sourceLead.coupleLabel}</strong> ({sourceLead.email})
          </span>
        </div>
      )}

      {/* Couple */}
      <ReviewSection title="Couple" icon={<Heart className="w-4 h-4 text-gold" />}>
        <ReviewItem label="Mariée" value={form.brideName} />
        <ReviewItem label="Marié" value={form.groomName} />
        <ReviewItem
          label="Date"
          value={form.weddingDate ? formatDate(form.weddingDate) : '—'}
        />
        <ReviewItem label="Fuseau" value={form.timezone} />
        <ReviewItem label="Lieu" value={[form.venueName, form.venueCity].filter(Boolean).join(' · ') || '—'} />
        <ReviewItem label="Slug" value={<code>/w/{form.slug}</code>} />
      </ReviewSection>

      {/* Plan */}
      <ReviewSection title="Plan & Tarification" icon={<Wallet className="w-4 h-4 text-gold" />}>
        <ReviewItem label="Plan" value={PLAN_METADATA[form.plan].label} />
        <ReviewItem
          label="Cycle"
          value={BILLING_CYCLE_LABELS[form.billingCycle]}
        />
        <ReviewItem
          label="Montant"
          value={`${formatUsd(liveAmountUsdCents)} (${formatFcfa(liveAmountUsdCents)})`}
        />
        <ReviewItem
          label="Paiement"
          value={form.paymentMethod ? PAYMENT_METHOD_LABELS[form.paymentMethod] : '—'}
        />
        <ReviewItem label="WhatsApp" value={form.whatsappPhone || '—'} />
        {form.notes && (
          <ReviewItem
            label="Notes"
            value={<span className="italic text-muted-foreground">« {form.notes} »</span>}
          />
        )}
      </ReviewSection>

      {/* Organizer */}
      <ReviewSection title="Compte organisateur" icon={<User className="w-4 h-4 text-gold" />}>
        <ReviewItem label="Nom" value={form.organizerName} />
        <ReviewItem label="E-mail" value={form.organizerEmail} />
        <ReviewItem
          label="Mot de passe"
          value={
            <span className="text-muted-foreground">
              {'•'.repeat(Math.min(form.organizerPassword.length, 12))} ({form.organizerPassword.length} caractères)
            </span>
          }
        />
      </ReviewSection>

      {/* WhatsApp preview */}
      {liveWhatsAppPreview && (
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Message WhatsApp final
          </Label>
          <Textarea
            readOnly
            value={liveWhatsAppPreview}
            rows={6}
            className="mt-1 font-mono text-xs bg-background/50"
          />
        </div>
      )}

      <Separator />

      {/* Publish toggle */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card/30 p-3">
        <Switch
          id="wiz-publish"
          checked={form.publish}
          onCheckedChange={(v) => setForm((f) => ({ ...f, publish: v }))}
          aria-label="Publier immédiatement"
        />
        <div className="flex-1">
          <Label htmlFor="wiz-publish" className="text-sm font-medium cursor-pointer">
            Publier immédiatement
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {form.publish
              ? 'Le mariage sera visible publiquement dès la création. Le couple peut accéder à /w/' + form.slug + ' immédiatement.'
              : 'Le mariage sera créé en brouillon (non visible publiquement). Vous pourrez le publier plus tard.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function ReviewSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-3">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {children}
      </div>
    </div>
  )
}

function ReviewItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm">{value || '—'}</span>
    </div>
  )
}

function SuccessCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  )
}
