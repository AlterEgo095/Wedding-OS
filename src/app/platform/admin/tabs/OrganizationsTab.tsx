'use client'

// ════════════════════════════════════════════════════════════════════════════
// OrganizationsTab — Mission 6.0 P1.7
//
// Platform-admin UI for managing Organization entities (B2B2C agency layer).
// Talks to the 8 routes created in P1.6 under /api/platform/organizations/*.
//
// Features:
//   • Stats header (4 KPI cards)  → GET /api/platform/organizations/stats
//   • Search + status + plan filters
//   • Paginated table with row actions (view / edit / suspend / activate / archive)
//   • Create / Edit / Limits dialogs
//   • View-details dialog with org info + members management + recent weddings
//   • Invite-member flow (POST /members) + per-member role/status management
//     (PATCH + DELETE /members/[memberId])
//
// All fetches go through the shared `fetchWithAuth` helper (from ./shared) so
// CSRF + cookie auth + 401/403 handling are uniform with the rest of the
// platform admin shell.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  MoreVertical,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Ban,
  CheckCircle,
  Users as UsersIcon,
  Heart,
  Eye,
  SlidersHorizontal,
  UserPlus,
  Mail,
  Globe,
  Phone,
  MapPin,
  Palette,
  Calendar,
  AlertTriangle,
  ShieldCheck,
  CircleSlash,
} from 'lucide-react'

import { PLAN_METADATA, type Plan } from '@/lib/types'
import { formatDate, formatDateTime } from '@/lib/format'

import { type FetchWithAuth, getRoleLabel } from './shared'

// ─── Org-domain types ─────────────────────────────────────────────────────────
// These mirror the Prisma Organization + OrganizationMember models. We don't
// import from @prisma/client because the schema stores status/plan/role as
// plain String columns (no Prisma-generated enums) — the canonical union
// types live here in the UI layer.

export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'
export type OrgPlan = Plan // 'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE'
export type MemberStatus = 'PENDING' | 'ACTIVE' | 'REVOKED'
export type OrgRole = 'ORG_ADMIN' | 'ORG_MEMBER' | 'ORG_VIEWER'

export interface OrganizationRow {
  id: string
  slug: string
  name: string
  email: string
  phone: string | null
  logoUrl: string | null
  brandColor: string | null
  customDomain: string | null
  status: OrgStatus
  plan: OrgPlan
  maxWeddings: number
  maxMembers: number
  description: string | null
  websiteUrl: string | null
  address: string | null
  createdAt: string
  updatedAt: string
  _count?: { members: number; weddings: number }
}

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  role: OrgRole
  invitedBy: string | null
  invitedAt: string
  joinedAt: string | null
  status: MemberStatus
  user: {
    id: string
    email: string
    name: string
    role: string
    lastLoginAt?: string | null
  }
}

export interface OrganizationDetail extends OrganizationRow {
  members: OrganizationMember[]
  weddings: Array<{
    id: string
    slug: string
    coupleLabel: string
    status: string
    plan: string
    weddingDate: string | null
    createdAt: string
  }>
}

interface PaginatedOrganizations {
  organizations: OrganizationRow[]
  total: number
  page: number
  limit: number
}

interface OrgStats {
  total: number
  byStatus: Record<string, number>
  byPlan: Record<string, number>
  members: {
    total: number
    byStatus: Record<string, number>
  }
  weddings: {
    total: number
    byStatus: Record<string, number>
  }
  recentOrganizations: Array<{
    id: string
    slug: string
    name: string
    status: string
    plan: string
    createdAt: string
  }>
  growth?: {
    newOrganizations30d?: number
    newMembers30d?: number
  }
}

// ─── Form-state interfaces ────────────────────────────────────────────────────

interface OrgFormState {
  slug: string
  name: string
  email: string
  phone: string
  plan: OrgPlan
  maxWeddings: string
  maxMembers: string
  // Edit-only optional fields (ignored on create — backend defaults to null).
  logoUrl: string
  brandColor: string
  customDomain: string
  description: string
  websiteUrl: string
  address: string
}

const EMPTY_ORG_FORM: OrgFormState = {
  slug: '',
  name: '',
  email: '',
  phone: '',
  plan: 'TRIAL',
  maxWeddings: '1',
  maxMembers: '5',
  logoUrl: '',
  brandColor: '',
  customDomain: '',
  description: '',
  websiteUrl: '',
  address: '',
}

interface LimitsFormState {
  maxWeddings: string
  maxMembers: string
}

interface InviteMemberFormState {
  email: string
  role: OrgRole
}

const EMPTY_INVITE_FORM: InviteMemberFormState = {
  email: '',
  role: 'ORG_MEMBER',
}

// ─── Display metadata (org-specific — separate from wedding labels) ───────────
//
// The task spec mandates:
//   Status badges: ACTIVE=green, SUSPENDED=amber, ARCHIVED=gray
//   Plan badges:   TRIAL=gray, ESSENTIEL=blue, PREMIUM=purple, ELITE=gold
// These intentionally differ from the wedding PLAN_BADGE_CLASS in @/lib/ui-labels
// (which uses gold/emerald/gold-dark/zinc) — organizations have their own
// visual identity to distinguish B2B2C entities from per-wedding plans.

const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
}

const ORG_STATUS_BADGE_CLASS: Record<OrgStatus, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SUSPENDED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const ORG_PLAN_LABELS: Record<OrgPlan, string> = {
  TRIAL: 'Essai',
  ESSENTIEL: 'Essentiel',
  PREMIUM: 'Premium',
  ELITE: 'Élite',
}

const ORG_PLAN_BADGE_CLASS: Record<OrgPlan, string> = {
  TRIAL: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  ESSENTIEL: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  PREMIUM: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  ELITE: 'bg-gold/15 text-gold border-gold/40',
}

const ORG_PLAN_LIST: OrgPlan[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE']
const ORG_STATUS_LIST: OrgStatus[] = ['ACTIVE', 'SUSPENDED', 'ARCHIVED']

const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  PENDING: 'En attente',
  ACTIVE: 'Actif',
  REVOKED: 'Révoqué',
}

const MEMBER_STATUS_BADGE_CLASS: Record<MemberStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  REVOKED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const ORG_ROLE_LIST: OrgRole[] = ['ORG_ADMIN', 'ORG_MEMBER', 'ORG_VIEWER']

const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  ORG_ADMIN: 'Admin Organisation',
  ORG_MEMBER: 'Membre Organisation',
  ORG_VIEWER: 'Observateur',
}

// ─── Small badge components ───────────────────────────────────────────────────

function OrgStatusBadge({ status }: { status: OrgStatus }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide ${ORG_STATUS_BADGE_CLASS[status] || ''}`}
    >
      {ORG_STATUS_LABELS[status] || status}
    </Badge>
  )
}

function OrgPlanBadge({ plan }: { plan: OrgPlan }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide ${ORG_PLAN_BADGE_CLASS[plan] || ''}`}
    >
      {ORG_PLAN_LABELS[plan] || plan}
    </Badge>
  )
}

function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide ${MEMBER_STATUS_BADGE_CLASS[status] || ''}`}
    >
      {MEMBER_STATUS_LABELS[status] || status}
    </Badge>
  )
}

function OrgRoleBadge({ role }: { role: OrgRole }) {
  const cls: Record<OrgRole, string> = {
    ORG_ADMIN: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    ORG_MEMBER: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    ORG_VIEWER: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  }
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${cls[role] || ''}`}>
      {ORG_ROLE_LABELS[role] || role}
    </Badge>
  )
}

// ─── Stats KPI cards ──────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  iconClass: string
}

function KpiCard({ title, value, subtitle, icon: Icon, gradient, iconClass }: KpiCardProps) {
  return (
    <Card className="glass-card gold-border border-0 overflow-hidden">
      <CardContent className="p-4">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-3`}>
          <Icon className={`w-5 h-5 ${iconClass}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrganizationsTab({ fetchWithAuth }: { fetchWithAuth: FetchWithAuth }) {
  // List state
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [planFilter, setPlanFilter] = useState<string>('ALL')

  // Stats state
  const [stats, setStats] = useState<OrgStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Dialog state
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showLimitsDialog, setShowLimitsDialog] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [editing, setEditing] = useState<OrganizationRow | null>(null)
  const [deleting, setDeleting] = useState<OrganizationRow | null>(null)
  const [limitsOrg, setLimitsOrg] = useState<OrganizationRow | null>(null)
  const [detailsOrg, setDetailsOrg] = useState<OrganizationDetail | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [form, setForm] = useState<OrgFormState>(EMPTY_ORG_FORM)
  const [limitsForm, setLimitsForm] = useState<LimitsFormState>({ maxWeddings: '1', maxMembers: '5' })
  const [saving, setSaving] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // Invite member state (inside details dialog)
  const [inviteForm, setInviteForm] = useState<InviteMemberFormState>(EMPTY_INVITE_FORM)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [memberActionId, setMemberActionId] = useState<string | null>(null)

  const LIMIT = 20
  const searchRef = useRef(search)
  searchRef.current = search

  // ─── Load list ──────────────────────────────────────────────────────────────
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

      const res = await fetchWithAuth(`/api/platform/organizations?${params.toString()}`)
      if (!res) {
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as PaginatedOrganizations
        setOrganizations(json.organizations || [])
        setTotal(json.total || 0)
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

  // ─── Load stats ─────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const res = await fetchWithAuth('/api/platform/organizations/stats')
    if (!res) {
      setStatsLoading(false)
      return
    }
    try {
      const json = (await res.json()) as OrgStats
      setStats(json)
    } catch {
      toast.error('Impossible de charger les statistiques')
    } finally {
      setStatsLoading(false)
    }
  }, [fetchWithAuth])

  // Initial load + reload on filter change
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

  // Stats: load once on mount, then refresh after every successful mutation.
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // ─── Range info for pagination footer ───────────────────────────────────────
  const rangeText = useMemo(() => {
    if (total === 0) return '0–0 sur 0'
    const from = (page - 1) * LIMIT + 1
    const to = Math.min(page * LIMIT, total)
    return `${from}–${to} sur ${total}`
  }, [page, total])

  // ─── Create / Edit handlers ─────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_ORG_FORM)
    setShowFormDialog(true)
  }

  const openEdit = (o: OrganizationRow) => {
    setEditing(o)
    setForm({
      slug: o.slug,
      name: o.name,
      email: o.email,
      phone: o.phone || '',
      plan: o.plan,
      maxWeddings: String(o.maxWeddings),
      maxMembers: String(o.maxMembers),
      logoUrl: o.logoUrl || '',
      brandColor: o.brandColor || '',
      customDomain: o.customDomain || '',
      description: o.description || '',
      websiteUrl: o.websiteUrl || '',
      address: o.address || '',
    })
    setShowFormDialog(true)
  }

  const handleSave = async () => {
    if (!form.slug.trim() || !form.name.trim() || !form.email.trim()) {
      toast.error('Slug, nom et email sont requis')
      return
    }
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(form.slug.trim())) {
      toast.error('Slug invalide (kebab-case minuscule)')
      return
    }
    const maxW = parseInt(form.maxWeddings, 10)
    const maxM = parseInt(form.maxMembers, 10)
    if (!Number.isFinite(maxW) || maxW < 1) {
      toast.error('Limite de mariages invalide')
      return
    }
    if (!Number.isFinite(maxM) || maxM < 1) {
      toast.error('Limite de membres invalide')
      return
    }

    setSaving(true)
    const basePayload: Record<string, unknown> = {
      slug: form.slug.trim().toLowerCase(),
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      plan: form.plan,
      maxWeddings: maxW,
      maxMembers: maxM,
    }
    if (editing) {
      // Edit-only optional fields — send null when blank so the API can clear them.
      basePayload.logoUrl = form.logoUrl.trim() || null
      basePayload.brandColor = form.brandColor.trim() || null
      basePayload.customDomain = form.customDomain.trim() || null
      basePayload.description = form.description.trim() || null
      basePayload.websiteUrl = form.websiteUrl.trim() || null
      basePayload.address = form.address.trim() || null
      // slug is immutable post-create — exclude from PATCH body.
      delete basePayload.slug
    }
    try {
      const url = editing
        ? `/api/platform/organizations/${editing.id}`
        : '/api/platform/organizations'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(editing ? 'Organisation mise à jour' : 'Organisation créée')
        setShowFormDialog(false)
        setEditing(null)
        setForm(EMPTY_ORG_FORM)
        load(page)
        loadStats()
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  // ─── Suspend / Activate / Archive handlers ──────────────────────────────────
  const handleSuspend = async (o: OrganizationRow) => {
    setActionLoadingId(o.id)
    try {
      const res = await fetchWithAuth(`/api/platform/organizations/${o.id}/suspend`, {
        method: 'POST',
      })
      if (!res) {
        setActionLoadingId(null)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Organisation suspendue')
        load(page)
        loadStats()
      } else {
        toast.error(json.error || 'Erreur lors de la suspension')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleActivate = async (o: OrganizationRow) => {
    setActionLoadingId(o.id)
    try {
      const res = await fetchWithAuth(`/api/platform/organizations/${o.id}/activate`, {
        method: 'POST',
      })
      if (!res) {
        setActionLoadingId(null)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Organisation activée')
        load(page)
        loadStats()
      } else {
        toast.error(json.error || "Erreur lors de l'activation")
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleArchive = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      const res = await fetchWithAuth(`/api/platform/organizations/${deleting.id}`, {
        method: 'DELETE',
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Organisation archivée')
        setShowDeleteDialog(false)
        setDeleting(null)
        load(1)
        loadStats()
      } else {
        toast.error(json.error || "Erreur lors de l'archivage")
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  // ─── Limits dialog ──────────────────────────────────────────────────────────
  const openLimits = (o: OrganizationRow) => {
    setLimitsOrg(o)
    setLimitsForm({
      maxWeddings: String(o.maxWeddings),
      maxMembers: String(o.maxMembers),
    })
    setShowLimitsDialog(true)
  }

  const handleSaveLimits = async () => {
    if (!limitsOrg) return
    const maxW = parseInt(limitsForm.maxWeddings, 10)
    const maxM = parseInt(limitsForm.maxMembers, 10)
    if (!Number.isFinite(maxW) || maxW < 1) {
      toast.error('Limite de mariages invalide')
      return
    }
    if (!Number.isFinite(maxM) || maxM < 1) {
      toast.error('Limite de membres invalide')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithAuth(`/api/platform/organizations/${limitsOrg.id}/limits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxWeddings: maxW, maxMembers: maxM }),
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Limites mises à jour')
        // Backend may return warnings[] when new limits drop below current active counts.
        if (Array.isArray(json.warnings) && json.warnings.length > 0) {
          toast.warning(json.warnings.join(' '), { duration: 8000 })
        }
        setShowLimitsDialog(false)
        setLimitsOrg(null)
        load(page)
        loadStats()
        // If the details dialog is open for the same org, refresh it.
        if (detailsOrg?.id === limitsOrg.id) {
          void loadDetails(limitsOrg.id)
        }
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour des limites')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  // ─── Details dialog ─────────────────────────────────────────────────────────
  const loadDetails = useCallback(
    async (orgId: string) => {
      setDetailsLoading(true)
      const res = await fetchWithAuth(`/api/platform/organizations/${orgId}`)
      if (!res) {
        setDetailsLoading(false)
        return
      }
      try {
        const json = (await res.json()) as { organization: OrganizationDetail }
        setDetailsOrg(json.organization || null)
      } catch {
        toast.error('Impossible de charger les détails')
      } finally {
        setDetailsLoading(false)
      }
    },
    [fetchWithAuth]
  )

  const openDetails = (o: OrganizationRow) => {
    setShowDetailsDialog(true)
    void loadDetails(o.id)
  }

  // ─── Member management ──────────────────────────────────────────────────────
  const handleInviteMember = async () => {
    if (!detailsOrg) return
    if (!inviteForm.email.trim()) {
      toast.error('Email requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithAuth(
        `/api/platform/organizations/${detailsOrg.id}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: inviteForm.email.trim().toLowerCase(),
            role: inviteForm.role,
          }),
        }
      )
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Membre ajouté')
        setInviteForm(EMPTY_INVITE_FORM)
        setShowInviteForm(false)
        void loadDetails(detailsOrg.id)
        loadStats()
      } else {
        // 404 → "L'utilisateur doit d'abord créer un compte" — display as-is.
        toast.error(json.error || "Erreur lors de l'invitation")
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateMember = async (
    memberId: string,
    patch: { role?: OrgRole; status?: 'ACTIVE' | 'REVOKED' }
  ) => {
    if (!detailsOrg) return
    setMemberActionId(memberId)
    try {
      const res = await fetchWithAuth(
        `/api/platform/organizations/${detailsOrg.id}/members/${memberId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }
      )
      if (!res) {
        setMemberActionId(null)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Membre mis à jour')
        void loadDetails(detailsOrg.id)
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setMemberActionId(null)
    }
  }

  const handleRevokeMember = async (memberId: string) => {
    if (!detailsOrg) return
    setMemberActionId(memberId)
    try {
      const res = await fetchWithAuth(
        `/api/platform/organizations/${detailsOrg.id}/members/${memberId}`,
        { method: 'DELETE' }
      )
      if (!res) {
        setMemberActionId(null)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Membre révoqué')
        void loadDetails(detailsOrg.id)
        loadStats()
      } else {
        toast.error(json.error || 'Erreur lors de la révocation')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setMemberActionId(null)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  // Stats KPI cards — derived from the stats endpoint. Falls back to 0s while loading.
  const activeCount = stats?.byStatus?.ACTIVE ?? 0
  const suspendedCount = stats?.byStatus?.SUSPENDED ?? 0
  const archivedCount = stats?.byStatus?.ARCHIVED ?? 0
  const totalMembers = stats?.members?.total ?? 0
  const newOrgs30d = stats?.growth?.newOrganizations30d ?? 0
  const newMembers30d = stats?.growth?.newMembers30d ?? 0

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold" />
            Organisations
          </h2>
          <p className="text-sm text-muted-foreground">{total} organisation{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate} size="sm" className="bg-gradient-gold text-white shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Créer une organisation
        </Button>
      </div>

      {/* Stats KPI grid */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            {
              title: 'Total Organisations',
              value: stats?.total ?? 0,
              subtitle: `${newOrgs30d} nouvelles 30j`,
              icon: Building2,
              gradient: 'from-gold/20 to-gold-light/10',
              iconClass: 'text-gold',
            },
            {
              title: 'Actives',
              value: activeCount,
              subtitle: archivedCount > 0 ? `${archivedCount} archivées` : 'Toutes opérationnelles',
              icon: CheckCircle,
              gradient: 'from-emerald-500/20 to-emerald-600/10',
              iconClass: 'text-emerald-400',
            },
            {
              title: 'Suspendues',
              value: suspendedCount,
              subtitle: suspendedCount === 0 ? 'Aucune suspension' : 'À traiter',
              icon: Ban,
              gradient: 'from-amber-500/20 to-amber-600/10',
              iconClass: 'text-amber-400',
            },
            {
              title: 'Membres',
              value: totalMembers,
              subtitle: `${newMembers30d} nouveaux 30j`,
              icon: UsersIcon,
              gradient: 'from-violet-500/20 to-violet-600/10',
              iconClass: 'text-violet-400',
            },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <KpiCard {...card} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, slug, email…"
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
            {ORG_STATUS_LIST.map((s) => (
              <SelectItem key={s} value={s}>
                {ORG_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-44 bg-white/5 border-white/10">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les plans</SelectItem>
            {ORG_PLAN_LIST.map((p) => (
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
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Nom</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Plan</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Membres</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mariages</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Créé le</TableHead>
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
                ) : organizations.length === 0 ? (
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm mb-3">Aucune organisation. Créez la première !</p>
                      <Button onClick={openCreate} size="sm" className="bg-gradient-gold text-white">
                        <Plus className="w-4 h-4 mr-1" /> Créer une organisation
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  organizations.map((o) => (
                    <TableRow
                      key={o.id}
                      className="border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <TableCell>
                        <div className="flex flex-col min-w-[180px]">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{o.name}</span>
                            {o.brandColor && (
                              <span
                                className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                                style={{ backgroundColor: o.brandColor }}
                                aria-label="Couleur de marque"
                              />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">/org/{o.slug}</span>
                          {o.customDomain && (
                            <span className="text-[10px] text-gold/70 flex items-center gap-1 mt-0.5">
                              <Globe className="w-3 h-3" /> {o.customDomain}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <OrgPlanBadge plan={o.plan} />
                      </TableCell>
                      <TableCell>
                        <OrgStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <UsersIcon className="w-3.5 h-3.5" />
                          {o._count?.members ?? 0}
                          <span className="text-[10px] text-muted-foreground/70">/ {o.maxMembers}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5" />
                          {o._count?.weddings ?? 0}
                          <span className="text-[10px] text-muted-foreground/70">/ {o.maxWeddings}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(o.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11"
                              disabled={actionLoadingId === o.id}
                            >
                              {actionLoadingId === o.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MoreVertical className="w-4 h-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {o.name}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDetails(o)}>
                              <Eye className="w-3.5 h-3.5 mr-2" />
                              Voir les détails
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(o)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openLimits(o)}>
                              <SlidersHorizontal className="w-3.5 h-3.5 mr-2" />
                              Modifier les limites
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {o.status === 'ACTIVE' && (
                              <DropdownMenuItem onClick={() => handleSuspend(o)}>
                                <Ban className="w-3.5 h-3.5 mr-2" />
                                Suspendre
                              </DropdownMenuItem>
                            )}
                            {o.status === 'SUSPENDED' && (
                              <DropdownMenuItem onClick={() => handleActivate(o)}>
                                <CheckCircle className="w-3.5 h-3.5 mr-2" />
                                Activer
                              </DropdownMenuItem>
                            )}
                            {o.status !== 'ARCHIVED' && (
                              <DropdownMenuItem
                                className="text-red-400 focus:text-red-300"
                                onClick={() => {
                                  setDeleting(o)
                                  setShowDeleteDialog(true)
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                Archiver
                              </DropdownMenuItem>
                            )}
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">{rangeText}</p>
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

      {/* ─── Create / Edit dialog ───────────────────────────────────────────── */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="glass-card gold-border max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {editing ? 'Modifier l\'organisation' : 'Créer une organisation'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editing
                ? `Mettez à jour les informations de ${editing.name}.`
                : 'Renseignez les informations de base. Vous pourrez compléter le branding plus tard.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="agence-mariage-cd"
                disabled={!!editing}
                className="bg-white/5 border-white/10"
              />
              <p className="text-[10px] text-muted-foreground">
                URL publique : /org/&lt;slug&gt; — kebab-case minuscule.{editing ? ' Non modifiable.' : ''}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Nom *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Agence Mariage Congo"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@agence.fr"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+243 …"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select
                value={form.plan}
                onValueChange={(v) => setForm({ ...form, plan: v as OrgPlan })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_PLAN_LIST.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLAN_METADATA[p].label} — ${PLAN_METADATA[p].priceUsd}/mois
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max. mariages</Label>
              <Input
                type="number"
                min={1}
                value={form.maxWeddings}
                onChange={(e) => setForm({ ...form, maxWeddings: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Max. membres</Label>
              <Input
                type="number"
                min={1}
                value={form.maxMembers}
                onChange={(e) => setForm({ ...form, maxMembers: e.target.value })}
                className="bg-white/5 border-white/10"
              />
            </div>

            {/* Edit-only optional fields */}
            {editing && (
              <>
                <div className="sm:col-span-2">
                  <Separator className="bg-white/10 my-1" />
                  <p className="text-[10px] uppercase tracking-widest text-gold/50 pt-2">
                    Branding & White Label
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Logo (URL)</Label>
                  <Input
                    value={form.logoUrl}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    placeholder="https://…/logo.png"
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Couleur de marque (hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.brandColor}
                      onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                      placeholder="#D4A853"
                      className="bg-white/5 border-white/10"
                    />
                    {form.brandColor && /^#[0-9a-fA-F]{3,8}$/.test(form.brandColor) && (
                      <span
                        className="w-10 h-9 rounded border border-white/20 shrink-0"
                        style={{ backgroundColor: form.brandColor }}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Domaine personnalisé</Label>
                  <Input
                    value={form.customDomain}
                    onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
                    placeholder="mariage-agence.fr"
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Site web</Label>
                  <Input
                    value={form.websiteUrl}
                    onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                    placeholder="https://agence.fr"
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Adresse</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Kinshasa, RDC"
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Agence spécialisée dans l'événementiel matrimonial…"
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </>
            )}
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
              disabled={saving || !form.slug || !form.name || !form.email}
              className="bg-gradient-gold text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Archive (delete) confirmation ──────────────────────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Confirmer l&apos;archivage
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Voulez-vous archiver l&apos;organisation{' '}
            <strong className="text-foreground">{deleting?.name}</strong> ? Elle sera masquée des
            listes actives mais l&apos;historique (audit, mariages, membres) est conservé. Cette
            action est réversible par intervention technique uniquement.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleArchive} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Archiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Limits dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showLimitsDialog} onOpenChange={setShowLimitsDialog}>
        <DialogContent className="glass-card gold-border max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Limites — {limitsOrg?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Ajustez les quotas de mariages et de membres. Baisser une limite sous le nombre
              actuel ne supprime pas les éléments existants (un avertissement sera affiché).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max. mariages</Label>
              <Input
                type="number"
                min={1}
                value={limitsForm.maxWeddings}
                onChange={(e) => setLimitsForm({ ...limitsForm, maxWeddings: e.target.value })}
                className="bg-white/5 border-white/10"
              />
              <p className="text-[10px] text-muted-foreground">
                Actuels : {limitsOrg?._count?.weddings ?? 0}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Max. membres</Label>
              <Input
                type="number"
                min={1}
                value={limitsForm.maxMembers}
                onChange={(e) => setLimitsForm({ ...limitsForm, maxMembers: e.target.value })}
                className="bg-white/5 border-white/10"
              />
              <p className="text-[10px] text-muted-foreground">
                Actifs : {limitsOrg?._count?.members ?? 0}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowLimitsDialog(false)}>Annuler</Button>
            <Button onClick={handleSaveLimits} disabled={saving} className="bg-gradient-gold text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Enregistrer les limites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Details dialog (with tabs: Info / Membres / Mariages) ──────────── */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="glass-card gold-border max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {detailsOrg?.name || 'Organisation'}
              {detailsOrg && <OrgStatusBadge status={detailsOrg.status} />}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {detailsOrg ? `/org/${detailsOrg.slug}` : 'Chargement…'}
            </DialogDescription>
          </DialogHeader>

          {detailsLoading || !detailsOrg ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gold" />
            </div>
          ) : (
            <Tabs defaultValue="info" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info" className="text-xs">Informations</TabsTrigger>
                <TabsTrigger value="members" className="text-xs">
                  Membres ({detailsOrg.members.length})
                </TabsTrigger>
                <TabsTrigger value="weddings" className="text-xs">
                  Mariages ({detailsOrg._count?.weddings ?? detailsOrg.weddings.length})
                </TabsTrigger>
              </TabsList>

              {/* Info tab */}
              <TabsContent value="info" className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                  <InfoRow icon={Mail} label="Email" value={detailsOrg.email} />
                  <InfoRow icon={Phone} label="Téléphone" value={detailsOrg.phone} />
                  <InfoRow icon={Globe} label="Site web" value={detailsOrg.websiteUrl} />
                  <InfoRow icon={Globe} label="Domaine white-label" value={detailsOrg.customDomain} />
                  <InfoRow icon={MapPin} label="Adresse" value={detailsOrg.address} />
                  <InfoRow icon={Palette} label="Couleur de marque" value={detailsOrg.brandColor} />
                  <InfoRow icon={Building2} label="Plan" value={ORG_PLAN_LABELS[detailsOrg.plan]} />
                  <InfoRow icon={Calendar} label="Créé le" value={formatDateTime(detailsOrg.createdAt)} />
                  <InfoRow
                    icon={SlidersHorizontal}
                    label="Quotas"
                    value={`${detailsOrg._count?.weddings ?? 0}/${detailsOrg.maxWeddings} mariages · ${detailsOrg._count?.members ?? 0}/${detailsOrg.maxMembers} membres`}
                  />
                </div>
                {detailsOrg.description && (
                  <div className="mt-3">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Description
                    </Label>
                    <p className="text-sm mt-1 text-muted-foreground">{detailsOrg.description}</p>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowDetailsDialog(false)
                      openEdit(detailsOrg)
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowDetailsDialog(false)
                      openLimits(detailsOrg)
                    }}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 mr-1" /> Limites
                  </Button>
                  {detailsOrg.status === 'ACTIVE' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDetailsDialog(false)
                        void handleSuspend(detailsOrg)
                      }}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" /> Suspendre
                    </Button>
                  )}
                  {detailsOrg.status === 'SUSPENDED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDetailsDialog(false)
                        void handleActivate(detailsOrg)
                      }}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Activer
                    </Button>
                  )}
                </div>
              </TabsContent>

              {/* Members tab */}
              <TabsContent value="members" className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div className="flex items-center justify-between py-2">
                  <p className="text-xs text-muted-foreground">
                    {detailsOrg.members.length} membre{detailsOrg.members.length > 1 ? 's' : ''} ·{' '}
                    {detailsOrg._count?.members ?? 0} actif{(detailsOrg._count?.members ?? 0) > 1 ? 's' : ''}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowInviteForm((v) => !v)}
                    disabled={detailsOrg.status === 'ARCHIVED'}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Inviter
                  </Button>
                </div>

                {showInviteForm && (
                  <div className="mb-3 p-3 rounded-lg border border-gold/20 bg-gold/5">
                    <p className="text-xs text-muted-foreground mb-2">
                      L&apos;utilisateur doit déjà avoir un compte. Saisissez son email et son rôle
                      dans cette organisation.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                      <Input
                        type="email"
                        placeholder="email@exemple.fr"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        className="bg-white/5 border-white/10"
                      />
                      <Select
                        value={inviteForm.role}
                        onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as OrgRole })}
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 w-full sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORG_ROLE_LIST.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ORG_ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleInviteMember}
                          disabled={saving || !inviteForm.email.trim()}
                          className="bg-gradient-gold text-white"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ajouter'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowInviteForm(false)
                            setInviteForm(EMPTY_INVITE_FORM)
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {detailsOrg.members.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <UsersIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucun membre pour le moment.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailsOrg.members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 p-2 rounded border border-white/5 bg-white/[0.02]"
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(m.user.name || m.user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.user.name || m.user.email}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {m.user.email} · compte : {getRoleLabel(m.user.role)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <OrgRoleBadge role={m.role} />
                          <MemberStatusBadge status={m.status} />
                          {memberActionId === m.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Rôle
                                </DropdownMenuLabel>
                                {ORG_ROLE_LIST.map((r) => (
                                  <DropdownMenuItem
                                    key={r}
                                    onClick={() => handleUpdateMember(m.id, { role: r })}
                                    disabled={m.role === r}
                                  >
                                    {ORG_ROLE_LABELS[r]}
                                    {m.role === r && <CheckCircle className="w-3 h-3 ml-auto" />}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                {m.status !== 'ACTIVE' && (
                                  <DropdownMenuItem onClick={() => handleUpdateMember(m.id, { status: 'ACTIVE' })}>
                                    <ShieldCheck className="w-3.5 h-3.5 mr-2" />
                                    Réactiver
                                  </DropdownMenuItem>
                                )}
                                {m.status !== 'REVOKED' && (
                                  <DropdownMenuItem
                                    className="text-red-400 focus:text-red-300"
                                    onClick={() => handleRevokeMember(m.id)}
                                  >
                                    <CircleSlash className="w-3.5 h-3.5 mr-2" />
                                    Révoquer
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Weddings tab */}
              <TabsContent value="weddings" className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <p className="text-xs text-muted-foreground py-2">
                  {detailsOrg.weddings.length} mariages récents ·{' '}
                  {detailsOrg._count?.weddings ?? 0} au total
                </p>
                {detailsOrg.weddings.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Heart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucun mariage pour le moment.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailsOrg.weddings.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-3 p-2 rounded border border-white/5 bg-white/[0.02]"
                      >
                        <div className="w-9 h-9 rounded bg-gold/15 flex items-center justify-center shrink-0">
                          <Heart className="w-4 h-4 text-gold" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{w.coupleLabel}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            /w/{w.slug} · créé le {formatDate(w.createdAt)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase bg-white/5">
                          {w.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${ORG_PLAN_BADGE_CLASS[w.plan as OrgPlan] || ''}`}
                        >
                          {ORG_PLAN_LABELS[w.plan as OrgPlan] || w.plan}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Helper sub-component for the Info tab ────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value || '—'}</p>
      </div>
    </div>
  )
}
