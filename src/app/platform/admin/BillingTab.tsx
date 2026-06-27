'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Wallet,
  MessageCircle,
  CheckCircle2,
  Plus,
  Search,
  ExternalLink,
  Copy,
  Loader2,
  TrendingUp,
  Clock,
  XCircle,
  DollarSign,
  Receipt,
} from 'lucide-react'

import { PLAN_METADATA, type Plan } from '@/lib/types'

// ══════════════════════════════════════════════════════════════════════════════
// Types — mirror the API responses
// ══════════════════════════════════════════════════════════════════════════════

interface SubscriptionSummary {
  id: string
  plan: Plan
  status: string
  amountAgreed: number | null
  currency: string
  billingCycle: string
  paymentMethod: string | null
  whatsappPhone: string | null
  notes: string | null
  paidAt: string | null
  activatedAt: string | null
  createdAt: string
  currentPeriodEnd: string | null
}

interface BillingWeddingRow {
  id: string
  slug: string
  coupleLabel: string
  status: string
  plan: Plan
  weddingDate: string | null
  createdAt: string
  subscription: SubscriptionSummary | null
  effectivePriceUsdCents: number
  planLabel: string
  invoicesCount: number
  openInvoicesCount: number
}

interface BillingOverviewResponse {
  weddings: BillingWeddingRow[]
  summary: {
    total: number
    active: number
    pending: number
    trial: number
    mrrUsd: number
    pendingUsd: number
  }
}

interface InvoiceRow {
  id: string
  subscriptionId: string
  weddingId: string
  amountDue: number
  amountPaid: number
  currency: string
  billingCycle: string
  status: string
  paymentMethod: string | null
  whatsappSentAt: string | null
  whatsappPhone: string | null
  confirmedBy: string | null
  notes: string | null
  paidAt: string | null
  createdAt: string
}

interface SubscriptionDetailResponse {
  wedding: {
    id: string
    slug: string
    coupleLabel: string
    plan: Plan
    status: string
  }
  subscription: SubscriptionSummary | null
}

interface InvoicesListResponse {
  wedding: { id: string; slug: string; coupleLabel: string }
  invoices: InvoiceRow[]
}

interface WhatsAppResponse {
  url: string
  message: string
  recipient: string | null
  plan: Plan
  amountUsdCents: number
  billingCycle: string
  currency: string
}

// ══════════════════════════════════════════════════════════════════════════════
// Display constants
// ══════════════════════════════════════════════════════════════════════════════

const SUB_STATUS_LABELS: Record<string, string> = {
  TRIALING: 'Essai',
  PENDING_PAYMENT: 'Paiement en attente',
  ACTIVE: 'Actif',
  PAST_DUE: 'En retard',
  SUSPENDED: 'Suspendu',
  CANCELED: 'Annulé',
  EXPIRED: 'Expiré',
}

const SUB_STATUS_BADGE: Record<string, string> = {
  TRIALING: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  PENDING_PAYMENT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PAST_DUE: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  SUSPENDED: 'bg-red-500/15 text-red-400 border-red-500/30',
  CANCELED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  EXPIRED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  OPEN: 'À payer',
  PAID: 'Payée',
  VOID: 'Annulée',
}

const INVOICE_STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  OPEN: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PAID: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  VOID: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const BILLING_CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'Mensuel',
  ANNUAL: 'Annuel',
  ONE_TIME: 'Unique',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CASH: 'Espèces',
  OTHER: 'Autre',
}

const PLAN_BADGE_CLASS: Record<Plan, string> = {
  ELITE: 'bg-gold/15 text-gold border-gold/40',
  PREMIUM: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ESSENTIEL: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  TRIAL: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const PLANS: Plan[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE']
const SUB_STATUSES = ['TRIALING', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED']
const BILLING_CYCLES = ['MONTHLY', 'ANNUAL', 'ONE_TIME']
const PAYMENT_METHODS = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'OTHER']

// ══════════════════════════════════════════════════════════════════════════════
// Form state
// ══════════════════════════════════════════════════════════════════════════════

interface SubscriptionFormState {
  plan: Plan
  status: string
  billingCycle: string
  amountAgreed: string // USD cents as string for input
  paymentMethod: string
  whatsappPhone: string
  notes: string
}

const EMPTY_FORM: SubscriptionFormState = {
  plan: 'TRIAL',
  status: 'TRIALING',
  billingCycle: 'MONTHLY',
  amountAgreed: '',
  paymentMethod: '',
  whatsappPhone: '',
  notes: '',
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatFcfa(cents: number): string {
  const usd = cents / 100
  return `${Math.round(usd * 600).toLocaleString('fr-FR')} FCFA`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Main BillingTab component
// ══════════════════════════════════════════════════════════════════════════════

export function BillingTab({
  fetchWithAuth,
}: {
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null>
}) {
  const [data, setData] = useState<BillingOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [planFilter, setPlanFilter] = useState('ALL')

  // Editor dialog state
  const [editing, setEditing] = useState<BillingWeddingRow | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [subscriptionDetail, setSubscriptionDetail] = useState<SubscriptionSummary | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [form, setForm] = useState<SubscriptionFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null) // invoice id being acted upon

  // WhatsApp modal state
  const [whatsappData, setWhatsappData] = useState<WhatsAppResponse | null>(null)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [generatingWhatsapp, setGeneratingWhatsapp] = useState(false)

  const searchRef = useRef(search)
  searchRef.current = search

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (searchRef.current) params.set('search', searchRef.current)
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    if (planFilter !== 'ALL') params.set('plan', planFilter)
    const res = await fetchWithAuth(`/api/platform/billing/weddings?${params.toString()}`)
    if (!res) {
      setLoading(false)
      return
    }
    try {
      const json = (await res.json()) as BillingOverviewResponse
      setData(json)
    } catch {
      toast.error('Réponse invalide du serveur')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, statusFilter, planFilter])

  useEffect(() => {
    load()
  }, [statusFilter, planFilter, load])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(), 350)
    return () => clearTimeout(t)
  }, [search, load])

  // ─── Open subscription editor for a wedding ─────────────────────────────
  const openEditor = async (row: BillingWeddingRow) => {
    setEditing(row)
    setEditorOpen(true)
    setForm(EMPTY_FORM)
    setSubscriptionDetail(null)
    setInvoices([])

    // Fetch current subscription detail + invoices in parallel
    const [subRes, invRes] = await Promise.all([
      fetchWithAuth(`/api/platform/weddings/${row.id}/subscription`),
      fetchWithAuth(`/api/platform/weddings/${row.id}/invoices`),
    ])
    if (subRes) {
      try {
        const json = (await subRes.json()) as SubscriptionDetailResponse
        if (json.subscription) {
          setSubscriptionDetail(json.subscription)
          setForm({
            plan: json.subscription.plan,
            status: json.subscription.status,
            billingCycle: json.subscription.billingCycle,
            amountAgreed:
              json.subscription.amountAgreed != null
                ? String(json.subscription.amountAgreed)
                : '',
            paymentMethod: json.subscription.paymentMethod || '',
            whatsappPhone: json.subscription.whatsappPhone || '',
            notes: json.subscription.notes || '',
          })
        } else {
          // No subscription yet — default to wedding's current plan
          setForm({
            ...EMPTY_FORM,
            plan: row.plan,
          })
        }
      } catch {
        /* ignore */
      }
    }
    if (invRes) {
      try {
        const json = (await invRes.json()) as InvoicesListResponse
        setInvoices(json.invoices || [])
      } catch {
        /* ignore */
      }
    }
  }

  // ─── Save subscription ──────────────────────────────────────────────────
  const handleSaveSubscription = async () => {
    if (!editing) return
    setSaving(true)
    const payload: Record<string, unknown> = {
      plan: form.plan,
      status: form.status,
      billingCycle: form.billingCycle,
      paymentMethod: form.paymentMethod || null,
      whatsappPhone: form.whatsappPhone.trim() || null,
      notes: form.notes.trim() || null,
    }
    if (form.amountAgreed.trim()) {
      const n = Number(form.amountAgreed)
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Prix personnalisé invalide (entier en centimes USD)')
        setSaving(false)
        return
      }
      payload.amountAgreed = Math.round(n)
    } else {
      payload.amountAgreed = null
    }

    const res = await fetchWithAuth(
      `/api/platform/weddings/${editing.id}/subscription`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    setSaving(false)
    if (!res) return
    if (res.ok) {
      toast.success('Abonnement enregistré')
      const json = (await res.json()) as { subscription: SubscriptionSummary }
      setSubscriptionDetail(json.subscription)
      await load() // refresh overview
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Erreur lors de la sauvegarde')
    }
  }

  // ─── Generate WhatsApp message ──────────────────────────────────────────
  const handleGenerateWhatsApp = async () => {
    if (!editing) return
    setGeneratingWhatsapp(true)
    const res = await fetchWithAuth(
      `/api/platform/weddings/${editing.id}/subscription/whatsapp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: form.plan,
          billingCycle: form.billingCycle,
          whatsappPhone: form.whatsappPhone.trim() || null,
          notes: form.notes.trim() || null,
        }),
      },
    )
    setGeneratingWhatsapp(false)
    if (!res) return
    if (res.ok) {
      const json = (await res.json()) as WhatsAppResponse
      setWhatsappData(json)
      setWhatsappOpen(true)
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Erreur lors de la génération du message')
    }
  }

  // ─── Create invoice ─────────────────────────────────────────────────────
  const handleCreateInvoice = async () => {
    if (!editing) return
    setCreatingInvoice(true)
    const res = await fetchWithAuth(
      `/api/platform/weddings/${editing.id}/invoices`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: form.plan,
          billingCycle: form.billingCycle,
          paymentMethod: form.paymentMethod || null,
          whatsappPhone: form.whatsappPhone.trim() || null,
          notes: form.notes.trim() || null,
        }),
      },
    )
    setCreatingInvoice(false)
    if (!res) return
    if (res.ok) {
      toast.success('Facture créée')
      const json = (await res.json()) as { invoice: InvoiceRow }
      setInvoices((prev) => [json.invoice, ...prev])
      await load()
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Erreur lors de la création de la facture')
    }
  }

  // ─── Mark invoice as paid ───────────────────────────────────────────────
  const handleMarkPaid = async (invoice: InvoiceRow) => {
    if (!editing) return
    setActionLoading(invoice.id)
    const res = await fetchWithAuth(`/api/platform/invoices/${invoice.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'PAID',
        paymentMethod: invoice.paymentMethod || form.paymentMethod || null,
      }),
    })
    setActionLoading(null)
    if (!res) return
    if (res.ok) {
      toast.success('Facture marquée comme payée')
      const json = (await res.json()) as { invoice: InvoiceRow }
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoice.id ? json.invoice : inv)),
      )
      await load()
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Erreur lors du marquage')
    }
  }

  // ─── Void invoice ───────────────────────────────────────────────────────
  const handleVoidInvoice = async (invoice: InvoiceRow) => {
    if (!editing) return
    setActionLoading(invoice.id)
    const res = await fetchWithAuth(`/api/platform/invoices/${invoice.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VOID' }),
    })
    setActionLoading(null)
    if (!res) return
    if (res.ok) {
      toast.success('Facture annulée')
      const json = (await res.json()) as { invoice: InvoiceRow }
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoice.id ? json.invoice : inv)),
      )
      await load()
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Erreur lors de l\'annulation')
    }
  }

  // ─── Copy WhatsApp message to clipboard ─────────────────────────────────
  const handleCopyMessage = async () => {
    if (!whatsappData) return
    try {
      await navigator.clipboard.writeText(whatsappData.message)
      toast.success('Message copié dans le presse-papiers')
    } catch {
      toast.error('Impossible de copier le message')
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════════

  const summary = data?.summary

  return (
    <div className="space-y-6">
      {/* ─── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard
          icon={<Wallet className="w-4 h-4" />}
          label="Total mariages"
          value={summary?.total ?? 0}
          loading={loading}
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Actifs"
          value={summary?.active ?? 0}
          loading={loading}
          accent="emerald"
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          label="En attente"
          value={summary?.pending ?? 0}
          loading={loading}
          accent="amber"
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="MRR (USD)"
          value={`$${(summary?.mrrUsd ?? 0).toFixed(2)}`}
          loading={loading}
          accent="gold"
        />
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="À recouvrer"
          value={`$${(summary?.pendingUsd ?? 0).toFixed(2)}`}
          loading={loading}
          accent="orange"
        />
      </div>

      {/* ─── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un couple ou slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card/50 border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-card/50">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            {SUB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {SUB_STATUS_LABELS[s] || s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-card/50">
            <SelectValue placeholder="Tous les plans" />
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

      {/* ─── Weddings table ─────────────────────────────────────────────── */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4 text-gold" />
            Abonnements & Facturation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.weddings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aucun mariage trouvé</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Couple</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Prix</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead className="text-center">Factures</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.weddings.map((w) => {
                    const sub = w.subscription
                    return (
                      <TableRow key={w.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">
                              {w.coupleLabel}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              /w/{w.slug}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={PLAN_BADGE_CLASS[w.plan]}
                          >
                            {PLAN_METADATA[w.plan].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {sub ? (
                            <Badge
                              variant="outline"
                              className={SUB_STATUS_BADGE[sub.status] || ''}
                            >
                              {SUB_STATUS_LABELS[sub.status] || sub.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {formatUsd(w.effectivePriceUsdCents)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatFcfa(w.effectivePriceUsdCents)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {sub
                              ? BILLING_CYCLE_LABELS[sub.billingCycle] || sub.billingCycle
                              : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-sm">{w.invoicesCount}</span>
                            {w.openInvoicesCount > 0 && (
                              <span className="text-xs text-amber-400">
                                {w.openInvoicesCount} en attente
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditor(w)}
                          >
                            <Wallet className="w-3.5 h-3.5 mr-1" />
                            Gérer
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Subscription editor dialog ─────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-gold" />
              {editing?.coupleLabel} — Facturation
            </DialogTitle>
            <DialogDescription>
              Gérez l'abonnement, générez un message WhatsApp pour le couple,
              et suivez les paiements reçus.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-5">
              {/* ── Plan selector with services preview ───────────────── */}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Plan & Services inclus
                </Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                  {PLANS.map((p) => {
                    const selected = form.plan === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, plan: p }))}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          selected
                            ? 'border-gold bg-gold/10 ring-1 ring-gold/30'
                            : 'border-border bg-card/30 hover:border-gold/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm">
                            {PLAN_METADATA[p].label}
                          </span>
                          {selected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-gold" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {PLAN_METADATA[p].priceUsd === 0
                            ? 'Gratuit'
                            : `$${PLAN_METADATA[p].priceUsd}/mois`}
                        </div>
                        <PlanServicesMini plan={p} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Form fields ─────────────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sub-status" className="text-xs">
                    Statut abonnement
                  </Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger id="sub-status" className="mt-1 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUB_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SUB_STATUS_LABELS[s] || s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="sub-cycle" className="text-xs">
                    Cycle de facturation
                  </Label>
                  <Select
                    value={form.billingCycle}
                    onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v }))}
                  >
                    <SelectTrigger id="sub-cycle" className="mt-1 bg-background/50">
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
                  <Label htmlFor="sub-amount" className="text-xs">
                    Prix personnalisé (centimes USD){' '}
                    <span className="text-muted-foreground">
                      — vide = prix par défaut
                    </span>
                  </Label>
                  <Input
                    id="sub-amount"
                    type="number"
                    min={0}
                    step={100}
                    placeholder="ex: 9900 pour $99.00"
                    value={form.amountAgreed}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amountAgreed: e.target.value }))
                    }
                    className="mt-1 bg-background/50"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {form.amountAgreed
                      ? `Soit ${formatUsd(Number(form.amountAgreed) || 0)} (${formatFcfa(Number(form.amountAgreed) || 0)})`
                      : `Défaut : ${formatUsd(PLAN_METADATA[form.plan].priceUsd * 100)} (${formatFcfa(PLAN_METADATA[form.plan].priceUsd * 100)})`}
                  </p>
                </div>

                <div>
                  <Label htmlFor="sub-payment" className="text-xs">
                    Mode de paiement
                  </Label>
                  <Select
                    value={form.paymentMethod}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, paymentMethod: v === 'NONE' ? '' : v }))
                    }
                  >
                    <SelectTrigger id="sub-payment" className="mt-1 bg-background/50">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">—</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="sub-phone" className="text-xs">
                    Téléphone WhatsApp du couple
                  </Label>
                  <Input
                    id="sub-phone"
                    type="tel"
                    placeholder="ex: +243 970 000 000"
                    value={form.whatsappPhone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, whatsappPhone: e.target.value }))
                    }
                    className="mt-1 bg-background/50"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="sub-notes" className="text-xs">
                    Notes de négociation
                  </Label>
                  <Textarea
                    id="sub-notes"
                    rows={2}
                    placeholder="ex: Remise de 10% pour paiement anticipé, 2 mois offerts, etc."
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    className="mt-1 bg-background/50"
                  />
                </div>
              </div>

              {/* ── Action buttons ──────────────────────────────────────── */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={handleSaveSubscription}
                  disabled={saving}
                  className="bg-gold hover:bg-gold/90 text-white"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Enregistrer
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerateWhatsApp}
                  disabled={generatingWhatsapp}
                >
                  {generatingWhatsapp ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MessageCircle className="w-4 h-4 mr-2" />
                  )}
                  Générer WhatsApp
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCreateInvoice}
                  disabled={creatingInvoice}
                >
                  {creatingInvoice ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Créer une facture
                </Button>
              </div>

              <Separator />

              {/* ── Invoice list ────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gold" />
                    Factures ({invoices.length})
                  </h4>
                </div>
                {invoices.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    Aucune facture. Cliquez « Créer une facture » pour en
                    émettre une.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                    {invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/30 gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {formatUsd(inv.amountDue)}
                            </span>
                            <Badge
                              variant="outline"
                              className={INVOICE_STATUS_BADGE[inv.status] || ''}
                            >
                              {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {BILLING_CYCLE_LABELS[inv.billingCycle] || inv.billingCycle}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(inv.createdAt)}
                            {inv.paymentMethod && (
                              <>
                                {' · '}
                                {PAYMENT_METHOD_LABELS[inv.paymentMethod] || inv.paymentMethod}
                              </>
                            )}
                            {inv.paidAt && (
                              <>
                                {' · payée le '}
                                {formatDate(inv.paidAt)}
                              </>
                            )}
                          </div>
                          {inv.notes && (
                            <div className="text-xs text-muted-foreground italic mt-1 truncate">
                              « {inv.notes} »
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {inv.status === 'OPEN' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkPaid(inv)}
                              disabled={actionLoading === inv.id}
                              className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            >
                              {actionLoading === inv.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              )}
                              Payée
                            </Button>
                          )}
                          {(inv.status === 'OPEN' || inv.status === 'DRAFT') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVoidInvoice(inv)}
                              disabled={actionLoading === inv.id}
                              className="text-red-400 hover:bg-red-500/10"
                            >
                              {actionLoading === inv.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── WhatsApp message modal ─────────────────────────────────────── */}
      <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-400" />
              Message WhatsApp
            </DialogTitle>
            <DialogDescription>
              {whatsappData?.recipient
                ? `Destinataire : ${whatsappData.recipient}`
                : 'Aucun numéro — l\'utilisateur choisira le destinataire dans WhatsApp'}
            </DialogDescription>
          </DialogHeader>

          {whatsappData && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Aperçu du message
                </Label>
                <Textarea
                  readOnly
                  value={whatsappData.message}
                  rows={16}
                  className="mt-2 font-mono text-xs bg-background/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded border border-border bg-card/30">
                  <div className="text-muted-foreground">Plan</div>
                  <div className="font-medium">
                    {PLAN_METADATA[whatsappData.plan].label}
                  </div>
                </div>
                <div className="p-2 rounded border border-border bg-card/30">
                  <div className="text-muted-foreground">Montant</div>
                  <div className="font-medium">
                    {formatUsd(whatsappData.amountUsdCents)} ({formatFcfa(whatsappData.amountUsdCents)})
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCopyMessage}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier
                </Button>
                <Button
                  asChild
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <a
                    href={whatsappData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Ouvrir WhatsApp
                  </a>
                </Button>
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
  accent?: 'gold' | 'emerald' | 'amber' | 'orange'
}) {
  const accentClass =
    accent === 'gold'
      ? 'text-gold'
      : accent === 'emerald'
        ? 'text-emerald-400'
        : accent === 'amber'
          ? 'text-amber-400'
          : accent === 'orange'
            ? 'text-orange-400'
            : 'text-foreground'

  return (
    <Card className="bg-card/50 border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={`${accentClass}`}>{icon}</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className={`text-2xl font-bold ${accentClass}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  )
}

function PlanServicesMini({ plan }: { plan: Plan }) {
  const limits: Record<Plan, { guests: string; media: string; staff: string }> = {
    TRIAL: { guests: '20 invités', media: '100 Mo', staff: '1 compte' },
    ESSENTIEL: { guests: '200 invités', media: '1 Go', staff: '2 comptes' },
    PREMIUM: { guests: '500 invités', media: '5 Go', staff: '5 comptes' },
    ELITE: { guests: 'Illimités', media: '20 Go', staff: '10 comptes' },
  }
  const l = limits[plan]
  return (
    <ul className="text-[11px] text-muted-foreground space-y-0.5">
      <li>· {l.guests}</li>
      <li>· {l.media}</li>
      <li>· {l.staff}</li>
    </ul>
  )
}
