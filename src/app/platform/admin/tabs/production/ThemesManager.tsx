'use client'

// ════════════════════════════════════════════════════════════════════════════
// ThemesManager — Commercial-grade Theme Catalog (MISSION 5.9.2 Phase 2 + P3-A).
//
// Combines 5 Phase 2 tasks (they share state, must live in one file):
//   P2-1  Rebuilt card grid: preview thumbnail, name, style, palette,
//         typography, quality score, badges, CTAs (Aperçu / Comparer /
//         Détails / Utiliser) + CRUD dropdown.
//   P2-2  Search + filter (search, tier, category, status, premium, recommended).
//   P2-3  Compare-two-themes mode (side-by-side sheet).
//   P2-4  Theme detail sheet (full characteristics, sections, components, assets).
//   P2-6  "Use this theme" CTA → POST /api/platform/themes/[id]/apply.
//
// Preserved from P3.9:
//   • Create/Edit dialog (extended with P0/P1 fields: tier, category, version,
//     identity, isPremium, isRecommended, isDefault).
//   • Preview modal (color swatches + font samples + mock hero).
//   • Duplicate + Delete actions (in dropdown).
//   • CSRF token via the `csrfToken` prop.
//
// Integrates with subagent P2-7 quality endpoint (graceful fallback if 404):
//   GET /api/platform/themes/[id]/quality → { overall, tier, dimensions, findings }
//
// API contracts used:
//   GET /api/platform/themes?status=&search=&tier=&category=&isPremium=&isRecommended=&approvalStatus=&page=&limit=
//   POST /api/platform/themes (create)
//   PUT /api/platform/themes/[id] (update — auto-bumps version on substantive edits)
//   DELETE /api/platform/themes/[id]
//   POST /api/platform/themes/[id]/apply { weddingId } (CSRF: X-CSRF-Token)
//   GET /api/platform/weddings?page=&limit= (for the apply wedding selector)
//
// ─── MISSION 5.9.2 P3-A — Commercial lock + approval workflow (Tasks 1+2+3+4) ──
//
//   Each card now shows:
//     • A red "🔒 Verrouillé" overlay badge when theme.isLocked (with tooltip
//       showing lockedAt + lockedBy).
//     • A colored approval-status badge (DRAFT=grey, REVIEW=amber,
//       APPROVED=emerald, PUBLISHED=blue, LOCKED=red) near the category line.
//     • A workflow CTA row at the bottom — the visible button(s) depend on the
//       current approvalStatus:
//         DRAFT     → [Soumettre]                          (→ REVIEW)
//         REVIEW    → [Approuver] [Rejeter]                (→ APPROVED / DRAFT)
//         APPROVED  → [Publier]                            (→ PUBLISHED)
//         PUBLISHED → [Verrouiller]                        (→ LOCKED via transition)
//         LOCKED    → [Déverrouiller]                      (→ PUBLISHED via transition)
//     • A lock toggle in the dropdown (Verrouiller / Déverrouiller) — operates
//       independently of the workflow (uses /lock + /unlock endpoints, not
//       /transition) so admins can lock a theme at any workflow stage.
//     • Edit + Supprimer items grey out + disable when theme.isLocked is true
//       (423 is the server-side backstop — this is a UX hint).
//
//   New filter: "Approbation" dropdown (Tous / DRAFT / REVIEW / APPROVED /
//   PUBLISHED / LOCKED) at the right end of the filter bar.
//
//   API additions:
//     POST /api/platform/themes/[id]/lock          { reason? } → 200
//     POST /api/platform/themes/[id]/unlock        { reason? } → 200
//     POST /api/platform/themes/[id]/transition    { to, notes? } → 200
//
//   Server-side lock enforcement (Task 2):
//     PUT /api/platform/themes/[id] → 423 Locked when theme.isLocked
//     DELETE /api/platform/themes/[id] → 423 Locked when theme.isLocked
//     (the 423 backstop means even if a user bypasses the UI disable, the
//      mutation is rejected by the API.)
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Plus, Pencil, Trash2, MoreHorizontal, Loader2, RefreshCw, Copy, Eye,
  Crown, Star, Check, GitCompare, Info, Type, Layers, Sparkles, X,
  // P3-A — lock + approval workflow icons
  Lock, Unlock, Send, CheckCircle2, ShieldCheck, ArrowRight, RotateCcw,
  // P4-5 — theme asset management icon (save button in AssetsEditor)
  Save,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThemeColors {
  primary?: string | null
  primaryLight?: string | null
  primaryDark?: string | null
  accent?: string | null
  accentLight?: string | null
  surface?: string | null
  surfaceDeep?: string | null
  text?: string | null
  textMuted?: string | null
  /** Legacy palette shape uses `background` instead of `surface`. */
  background?: string | null
}

interface ThemeFonts {
  display?: string | null
  body?: string | null
  displayWeight?: string | null
  bodyWeight?: string | null
}

interface ThemeConfig {
  description?: string | null
  colors?: ThemeColors
  fonts?: ThemeFonts
  pattern?: string | null
  ambiance?: string | null
  motionTier?: string | null
  layout?: string | null
  features?: string[] | null
  source?: string | null
  isLegacy?: boolean
  isIdentity?: boolean
  basePresetSlug?: string | null
  sectionOverrides?: unknown
  preview?: { bg?: string; text?: string; swatch?: string[] } | null
  copyTone?: string | null
}

interface ThemeRow {
  id: string
  name: string
  slug: string
  paletteJson: string
  fontDisplay: string | null
  fontBody: string | null
  isBuiltIn: boolean
  status: string
  createdAt: string
  updatedAt: string
  // P0/P1 fields
  isPremium: boolean
  isRecommended: boolean
  isDefault: boolean
  tier: string
  category: string | null
  version: string
  identity: string | null
  configJson: string
  // P3-A — lock + approval workflow fields (all optional for backward compat
  // with API responses that don't include them yet — though the deployed API
  // always returns them now)
  isLocked?: boolean
  lockedAt?: string | null
  lockedBy?: string | null
  approvalStatus?: string
  approvedAt?: string | null
  approvedBy?: string | null
  // P4-5 — theme assets JSON (background + pattern image URLs).
  // Optional for backward compat with older API responses that don't return
  // it yet (the deployed /api/platform/themes returns it once the THEME_SELECT
  // patch is applied — see README.md deploy note).
  assetsJson?: string
}

interface WeddingRow {
  id: string
  slug: string
  coupleLabel: string | null
  brideName: string | null
  groomName: string | null
  weddingDate: string | null
  venueName: string | null
  venueCity: string | null
  status: string | null
  plan: string | null
}

interface QualityScore {
  overall: number
  tier: 'good' | 'warning' | 'critical'
}

type QualityMap = Record<string, QualityScore | null | undefined>

type FormStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type FormTier = 'FREE' | 'STANDARD' | 'PREMIUM' | 'EXCLUSIVE'

// P3-A — approval workflow states. SEPARATE from the publication `status`
// (DRAFT/PUBLISHED/ARCHIVED). A theme can be PUBLISHED (visible) + REVIEW
// (pending re-approval after an edit) at the same time.
type ApprovalState = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'LOCKED'
type ApprovalFilter = 'ALL' | ApprovalState

interface FormState {
  name: string
  slug: string
  primaryColor: string
  accentColor: string
  backgroundColor: string
  fontDisplay: string
  fontBody: string
  isBuiltIn: boolean
  status: FormStatus
  // P0/P1 fields
  tier: FormTier
  category: string
  version: string
  identity: string
  isPremium: boolean
  isRecommended: boolean
  isDefault: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  primaryColor: '#D4A853',
  accentColor: '#C8785A',
  backgroundColor: '#0f0f17',
  fontDisplay: 'Cormorant Garamond',
  fontBody: 'Inter',
  isBuiltIn: false,
  status: 'PUBLISHED',
  tier: 'STANDARD',
  category: 'CLASSIC',
  version: '1.0.0',
  identity: '',
  isPremium: false,
  isRecommended: false,
  isDefault: false,
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const TIER_BADGE: Record<string, string> = {
  EXCLUSIVE: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  PREMIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  STANDARD: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  FREE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

const TIER_DOT: Record<string, string> = {
  EXCLUSIVE: 'bg-yellow-400',
  PREMIUM: 'bg-amber-400',
  STANDARD: 'bg-zinc-400',
  FREE: 'bg-emerald-400',
}

const QUALITY_BADGE: Record<string, string> = {
  good: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
}

// ─── P3-A — approval workflow constants ──────────────────────────────────────
//
// Color mapping (matches the spec):
//   DRAFT     → grey       (not yet submitted — neutral)
//   REVIEW    → amber      (awaiting decision — caution)
//   APPROVED  → emerald    (approved — success)
//   PUBLISHED → blue       (live in catalog — info)
//   LOCKED    → red        (commercially frozen — danger)
//
// Labels are French for UI rendering.

const APPROVAL_BADGE: Record<ApprovalState, string> = {
  DRAFT: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  REVIEW: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PUBLISHED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  LOCKED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const APPROVAL_LABEL: Record<ApprovalState, string> = {
  DRAFT: 'Brouillon',
  REVIEW: 'En revue',
  APPROVED: 'Approuvé',
  PUBLISHED: 'Publié',
  LOCKED: 'Verrouillé',
}

const APPROVAL_DOT: Record<ApprovalState, string> = {
  DRAFT: 'bg-zinc-400',
  REVIEW: 'bg-amber-400',
  APPROVED: 'bg-emerald-400',
  PUBLISHED: 'bg-blue-400',
  LOCKED: 'bg-red-400',
}

const APPROVAL_OPTIONS: { value: ApprovalFilter; label: string }[] = [
  { value: 'ALL', label: 'Tous les statuts d\'approbation' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'REVIEW', label: 'En revue' },
  { value: 'APPROVED', label: 'Approuvé' },
  { value: 'PUBLISHED', label: 'Publié' },
  { value: 'LOCKED', label: 'Verrouillé' },
]

/**
 * Coerce a stored approvalStatus string into our typed ApprovalState union.
 * Falls back to 'DRAFT' when the value is missing or unrecognized (the server
 * defaults new themes to DRAFT so this is just defensive).
 */
function coerceApproval(s: string | null | undefined): ApprovalState {
  if (s === 'DRAFT' || s === 'REVIEW' || s === 'APPROVED' || s === 'PUBLISHED' || s === 'LOCKED') {
    return s
  }
  return 'DRAFT'
}

/**
 * Map of allowed forward/back transitions — used by the UI to know which
 * workflow buttons to render. MUST match the server-side matrix in
 * /api/platform/themes/[id]/transition (the server is the source of truth —
 * this is just a UX hint to disable obviously-invalid buttons).
 */
const APPROVAL_TRANSITIONS: Record<ApprovalState, ApprovalState[]> = {
  DRAFT: ['REVIEW'],
  REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'REVIEW'],
  PUBLISHED: ['LOCKED'],
  LOCKED: ['PUBLISHED'],
}

/**
 * Workflow button definitions per current state. Each button has:
 *   - to: target state (sent to /transition as { to })
 *   - label: button text
 *   - icon: lucide icon component
 *   - variant: shadcn button variant
 *   - destructive: if true, render in red (e.g. Rejeter)
 */
interface WorkflowButton {
  to: ApprovalState
  label: string
  icon: typeof Send
  variant: 'default' | 'outline' | 'destructive' | 'ghost' | 'secondary'
  destructive?: boolean
}

function workflowButtonsFor(state: ApprovalState): WorkflowButton[] {
  switch (state) {
    case 'DRAFT':
      return [
        { to: 'REVIEW', label: 'Soumettre', icon: Send, variant: 'default' },
      ]
    case 'REVIEW':
      return [
        { to: 'APPROVED', label: 'Approuver', icon: CheckCircle2, variant: 'default' },
        { to: 'DRAFT', label: 'Rejeter', icon: RotateCcw, variant: 'outline', destructive: true },
      ]
    case 'APPROVED':
      return [
        { to: 'PUBLISHED', label: 'Publier', icon: ArrowRight, variant: 'default' },
      ]
    case 'PUBLISHED':
      return [
        { to: 'LOCKED', label: 'Verrouiller', icon: Lock, variant: 'default' },
      ]
    case 'LOCKED':
      return [
        { to: 'PUBLISHED', label: 'Déverrouiller', icon: Unlock, variant: 'outline' },
      ]
  }
}

const TIER_OPTIONS: { value: FormTier; label: string }[] = [
  { value: 'FREE', label: 'Free' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'EXCLUSIVE', label: 'Exclusive' },
]

const CATEGORY_OPTIONS = [
  'ROYAL', 'LUXURY', 'EDITORIAL', 'MINIMAL', 'ROMANTIC', 'BOTANICAL',
  'CINEMATIC', 'AFRICAN', 'CHAMPAGNE', 'DESTINATION', 'CLASSIC',
]

const IDENTITY_PRESET_SLUGS = [
  'royal-luxury',
  'minimal-editorial',
  'botanical-romance',
  'cinematic-dark',
  'modern-champagne',
]

const SCROLLBAR_CSS = `
.themes-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.themes-scroll::-webkit-scrollbar-track { background: transparent; }
.themes-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
.themes-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.24); }
.themes-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
`.trim()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseConfig(json: string): ThemeConfig | null {
  if (!json) return null
  try {
    return JSON.parse(json) as ThemeConfig
  } catch {
    return null
  }
}

/**
 * Extract a 3-color palette for backward-compat with the legacy form.
 * Reads paletteJson (stored as { primary, accent, primaryLight, primaryDark,
 * accentLight, surface, surfaceDeep, text, textMuted, background }).
 */
function parsePalette(json: string): { primary: string; accent: string; bg: string } {
  try {
    const obj = JSON.parse(json)
    return {
      primary: obj.primary || '#D4A853',
      accent: obj.accent || '#C8785A',
      bg: obj.background || obj.surface || '#0f0f17',
    }
  } catch {
    return { primary: '#D4A853', accent: '#C8785A', bg: '#0f0f17' }
  }
}

/** Returns the rich color set from configJson.colors OR fallback to paletteJson. */
function getThemeColors(theme: ThemeRow): ThemeColors {
  const cfg = parseConfig(theme.configJson)
  if (cfg?.colors) {
    return { ...cfg.colors, background: cfg.colors.surface ?? null }
  }
  try {
    const obj = JSON.parse(theme.paletteJson || '{}')
    return { ...obj, background: obj.background || obj.surface || null }
  } catch {
    return { primary: '#D4A853', accent: '#C8785A', background: '#0f0f17' }
  }
}

function getThemeConfig(theme: ThemeRow): ThemeConfig | null {
  return parseConfig(theme.configJson)
}

function getFeatures(theme: ThemeRow): string[] {
  const cfg = getThemeConfig(theme)
  return cfg?.features && Array.isArray(cfg.features) ? cfg.features : []
}

/** Pick a readable text color (white/black) for a hex background. */
function readableTextOn(hex: string | null | undefined): string {
  if (!hex) return '#ffffff'
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  // Relative luminance (sRGB→linear approximation).
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.6 ? '#0a0a0a' : '#ffffff'
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function qualityTier(score: number): 'good' | 'warning' | 'critical' {
  if (score >= 80) return 'good'
  if (score >= 50) return 'warning'
  return 'critical'
}

function tierDotClass(tier: string): string {
  return TIER_DOT[tier] || 'bg-zinc-500'
}

// ─── Sub-component: PaletteSwatches ──────────────────────────────────────────

function PaletteSwatches({ colors, size = 14 }: { colors: ThemeColors; size?: number }) {
  const list: { label: string; color?: string | null }[] = [
    { label: 'Primaire', color: colors.primary },
    { label: 'Accent', color: colors.accent },
    { label: 'Surface', color: colors.surface ?? colors.background },
    { label: 'Primaire clair', color: colors.primaryLight },
    { label: 'Primaire foncé', color: colors.primaryDark },
  ]
  return (
    <div className="flex items-center gap-1.5">
      {list.map((sw) => (
        <span
          key={sw.label}
          title={`${sw.label} · ${sw.color || '—'}`}
          className="rounded-full border border-white/20 ring-1 ring-black/10"
          style={{ width: size, height: size, background: sw.color || 'transparent' }}
        />
      ))}
    </div>
  )
}

// ─── Sub-component: ApprovalBadge (P3-A) ─────────────────────────────────────

function ApprovalBadge({
  status,
  size = 'sm',
}: {
  status: ApprovalState
  size?: 'sm' | 'xs'
}) {
  const cls = APPROVAL_BADGE[status]
  const label = APPROVAL_LABEL[status]
  const sizeCls = size === 'xs' ? 'text-[9px]' : 'text-[10px]'
  return (
    <Badge
      className={`uppercase ${sizeCls} ${cls}`}
      title={`Statut d'approbation: ${label}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${APPROVAL_DOT[status]} mr-1`} />
      {label}
    </Badge>
  )
}

// ─── Sub-component: ThemeCard (P2-1 + P3-A) ─────────────────────────────────

interface ThemeCardProps {
  theme: ThemeRow
  quality: QualityScore | null
  qualityLoading: boolean
  isSelectedForCompare: boolean
  compareDisabled: boolean
  onPreview: () => void
  onToggleCompare: () => void
  onDetails: () => void
  onApply: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  saving: boolean
  // P3-A — lock + approval workflow callbacks
  onLock: () => void
  onUnlock: () => void
  onTransition: (to: ApprovalState) => void
  /** When true, this card's lock/unlock/transition is in-flight (buttons show spinner). */
  busy: boolean
}

function ThemeCard(props: ThemeCardProps) {
  const {
    theme, quality, qualityLoading, isSelectedForCompare, compareDisabled,
    onPreview, onToggleCompare, onDetails, onApply, onEdit, onDuplicate, onDelete, saving,
    onLock, onUnlock, onTransition, busy,
  } = props
  const colors = getThemeColors(theme)
  const cfg = getThemeConfig(theme)
  const features = getFeatures(theme)
  const surface = colors.surface || colors.background || '#0f0f17'
  const primary = colors.primary || '#D4AF37'
  const ambiance = cfg?.ambiance || null
  const pattern = cfg?.pattern || null
  const previewBg = ambiance ? `${ambiance}, ${surface}` : surface
  const tierBadgeClass = TIER_BADGE[theme.tier] || TIER_BADGE.STANDARD
  const qTier = quality ? quality.tier : null
  const qBadgeClass = qTier ? QUALITY_BADGE[qTier] : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'

  // P3-A — derived lock + approval state
  const isLocked = theme.isLocked === true
  const approvalStatus = coerceApproval(theme.approvalStatus)
  const workflowButtons = workflowButtonsFor(approvalStatus)
  const lockedAtLabel = theme.lockedAt ? formatDate(theme.lockedAt) : '—'
  const lockedByLabel = theme.lockedBy || '—'
  const lockTooltip = isLocked
    ? `Verrouillé le ${lockedAtLabel} par ${lockedByLabel}`
    : ''

  const iconBtn = 'h-8 w-8 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0'

  return (
    <Card className="border border-white/10 overflow-hidden flex flex-col hover:border-white/20 transition-colors py-0">
      {/* Preview thumbnail */}
      <div
        className="relative h-32 flex items-center justify-center overflow-hidden"
        style={{ background: previewBg }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: theme.fontDisplay || 'Cormorant Garamond, serif',
            fontSize: '44px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: primary,
            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          M<span style={{ color: colors.accent || primary }}>&amp;</span>J
        </span>

        {/* Pattern label */}
        {pattern && pattern !== 'none' && (
          <Badge className="absolute bottom-1 left-1 text-[9px] uppercase bg-black/40 text-white/80 border-white/10">
            {pattern}
          </Badge>
        )}

        {/* Badges row top-right */}
        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
          <Badge className={`text-[9px] uppercase ${tierBadgeClass}`}>{theme.tier}</Badge>
          {theme.isPremium && (
            <Badge className="text-[9px] uppercase bg-amber-500/20 text-amber-300 border-amber-500/40 gap-0.5">
              <Crown className="w-2.5 h-2.5" /> Premium
            </Badge>
          )}
          {theme.isRecommended && (
            <Badge className="text-[9px] uppercase bg-yellow-500/20 text-yellow-300 border-yellow-500/40 gap-0.5">
              <Star className="w-2.5 h-2.5" /> Recommandé
            </Badge>
          )}
          {theme.isDefault && (
            <Badge className="text-[9px] uppercase bg-blue-500/20 text-blue-300 border-blue-500/40">
              Défaut
            </Badge>
          )}
        </div>

        {/* P3-A — Commercial lock overlay badge (top-left, red) */}
        {isLocked && (
          <Badge
            className="absolute top-1.5 left-1.5 text-[9px] uppercase bg-red-500/25 text-red-200 border-red-500/50 gap-0.5 backdrop-blur-sm"
            title={lockTooltip}
          >
            <Lock className="w-2.5 h-2.5" /> Verrouillé
          </Badge>
        )}
      </div>

      <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
        {/* Name + slug */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm truncate" title={theme.name}>{theme.name}</h3>
            {theme.isBuiltIn && (
              <Badge variant="outline" className="text-[9px] uppercase bg-gold/10 text-gold border-gold/30 shrink-0">
                Built-in
              </Badge>
            )}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground truncate">{theme.slug}</div>
        </div>

        {/* Category + version + P3-A approval badge */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          {theme.category && (
            <Badge variant="outline" className="text-[9px] uppercase">{theme.category}</Badge>
          )}
          <span className="font-mono">v{theme.version || '1.0.0'}</span>
          {cfg?.isLegacy && (
            <Badge variant="outline" className="text-[9px] uppercase bg-zinc-500/10 text-zinc-400">
              Legacy
            </Badge>
          )}
          {/* P3-A — approval workflow status badge */}
          <ApprovalBadge status={approvalStatus} size="xs" />
        </div>

        {/* Palette swatches */}
        <div className="flex items-center gap-1.5">
          <PaletteSwatches colors={colors} />
          <span className="ml-auto text-[9px] text-muted-foreground font-mono">
            {colors.primary || '—'}
          </span>
        </div>

        {/* Typography */}
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5 truncate">
            <Type className="w-3 h-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">Titres:</span>
            <span
              className="truncate"
              style={{ fontFamily: theme.fontDisplay || 'Cormorant Garamond, serif' }}
            >
              {theme.fontDisplay || '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <Type className="w-3 h-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">Texte:</span>
            <span
              className="truncate"
              style={{ fontFamily: theme.fontBody || 'Inter, sans-serif' }}
            >
              {theme.fontBody || '—'}
            </span>
          </div>
        </div>

        {/* Quality + features count */}
        <div className="flex items-center gap-2 text-[10px] flex-wrap">
          <Badge
            className={`uppercase ${qBadgeClass}`}
            title={quality ? `Score ${quality.overall}/100` : 'Indisponible'}
          >
            {qualityLoading ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> …</>
            ) : quality ? (
              <><Sparkles className="w-3 h-3" /> {quality.overall}/100 · {qTier}</>
            ) : (
              <><X className="w-3 h-3" /> N/A</>
            )}
          </Badge>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Layers className="w-3 h-3" />
            {features.length} section{features.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* P3-A — Approval workflow buttons row (contextual, based on approvalStatus) */}
        {workflowButtons.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {workflowButtons.map((btn) => {
              const Icon = btn.icon
              const destructiveCls = btn.destructive
                ? 'text-red-400 hover:text-red-300 border-red-500/30'
                : ''
              return (
                <Button
                  key={`${btn.to}-${btn.label}`}
                  size="sm"
                  variant={btn.variant}
                  className={`h-7 text-[11px] px-2 ${destructiveCls}`}
                  onClick={() => onTransition(btn.to)}
                  disabled={busy}
                  title={`${btn.label} → ${APPROVAL_LABEL[btn.to]}`}
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Icon className="w-3 h-3 mr-1" />
                  )}
                  {btn.label}
                </Button>
              )
            })}
          </div>
        )}

        {/* CTAs */}
        <div className="mt-auto pt-2 flex items-center gap-1 border-t border-white/5">
          <Button
            variant="ghost"
            size="icon"
            className={iconBtn}
            onClick={onPreview}
            aria-label="Aperçu"
            title="Aperçu"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            variant={isSelectedForCompare ? 'default' : 'ghost'}
            size="icon"
            className={iconBtn}
            onClick={onToggleCompare}
            disabled={compareDisabled}
            aria-label={isSelectedForCompare ? 'Retirer de la comparaison' : 'Ajouter à la comparaison'}
            aria-pressed={isSelectedForCompare}
            title={compareDisabled && !isSelectedForCompare ? 'Comparaison pleine (2/2)' : 'Comparer'}
          >
            <GitCompare className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={iconBtn}
            onClick={onDetails}
            aria-label="Détails"
            title="Détails"
          >
            <Info className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`${iconBtn} text-emerald-400 hover:text-emerald-300`}
            onClick={onApply}
            aria-label="Utiliser ce thème"
            title="Utiliser ce thème"
          >
            <Check className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" aria-label="Plus d'actions">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* P3-A — Edit disabled when locked (server returns 423; this is a UX hint) */}
              <DropdownMenuItem
                onClick={onEdit}
                disabled={isLocked}
                title={isLocked ? 'Thème verrouillé' : undefined}
              >
                <Pencil className="w-3.5 h-3.5 mr-2" />
                Éditer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} disabled={saving || isLocked}>
                <Copy className="w-3.5 h-3.5 mr-2" />
                Dupliquer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* P3-A — Lock / Unlock toggle (independent of workflow — uses /lock + /unlock) */}
              {isLocked ? (
                <DropdownMenuItem onClick={onUnlock} disabled={busy}>
                  <Unlock className="w-3.5 h-3.5 mr-2" />
                  Déverrouiller
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onLock} disabled={busy}>
                  <Lock className="w-3.5 h-3.5 mr-2" />
                  Verrouiller
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-400"
                onClick={onDelete}
                disabled={theme.isBuiltIn || isLocked}
                title={isLocked ? 'Thème verrouillé' : undefined}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-component: CompareSheet (P2-3) ──────────────────────────────────────

function CompareRow({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/5 last:border-0">
      <div className="text-xs text-muted-foreground uppercase font-medium">{label}</div>
      <div className="text-xs min-w-0">{a}</div>
      <div className="text-xs min-w-0">{b}</div>
    </div>
  )
}

function BoolCell({ v }: { v: boolean | null | undefined }) {
  return (
    <Badge
      variant="outline"
      className={
        v
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-zinc-500/10 text-zinc-500'
      }
    >
      {v ? 'Oui' : 'Non'}
    </Badge>
  )
}

function CompareSheet({
  open, onOpenChange, themes, onClose, onClear,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  themes: ThemeRow[]
  onClose: () => void
  onClear: () => void
}) {
  const a = themes[0]
  const b = themes[1]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col themes-scroll">
        <SheetHeader className="bg-background/95 backdrop-blur border-b border-white/10 p-4">
          <SheetTitle>Comparaison de thèmes</SheetTitle>
          <SheetDescription>
            Comparaison côte-à-côte des caractéristiques.
          </SheetDescription>
        </SheetHeader>

        {a && b ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-1 themes-scroll">
              {/* Header row with names */}
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/10 mb-2">
                <div className="text-xs text-muted-foreground uppercase">Critère</div>
                <div className="text-sm font-bold truncate">{a.name}</div>
                <div className="text-sm font-bold truncate">{b.name}</div>
              </div>

              <CompareRow
                label="Slug"
                a={<span className="font-mono">{a.slug}</span>}
                b={<span className="font-mono">{b.slug}</span>}
              />
              <CompareRow
                label="Tier"
                a={<Badge className={`text-[9px] uppercase ${TIER_BADGE[a.tier] || ''}`}>{a.tier}</Badge>}
                b={<Badge className={`text-[9px] uppercase ${TIER_BADGE[b.tier] || ''}`}>{b.tier}</Badge>}
              />
              <CompareRow label="Catégorie" a={a.category || '—'} b={b.category || '—'} />
              <CompareRow
                label="Version"
                a={<span className="font-mono">{a.version}</span>}
                b={<span className="font-mono">{b.version}</span>}
              />
              <CompareRow label="Identité" a={a.identity || '—'} b={b.identity || '—'} />
              <CompareRow
                label="Statut"
                a={<Badge variant="outline" className={`text-[9px] uppercase ${STATUS_BADGE[a.status] || ''}`}>{a.status}</Badge>}
                b={<Badge variant="outline" className={`text-[9px] uppercase ${STATUS_BADGE[b.status] || ''}`}>{b.status}</Badge>}
              />
              <CompareRow label="Premium" a={<BoolCell v={a.isPremium} />} b={<BoolCell v={b.isPremium} />} />
              <CompareRow label="Recommandé" a={<BoolCell v={a.isRecommended} />} b={<BoolCell v={b.isRecommended} />} />
              <CompareRow label="Défaut" a={<BoolCell v={a.isDefault} />} b={<BoolCell v={b.isDefault} />} />
              <CompareRow label="Built-in" a={<BoolCell v={a.isBuiltIn} />} b={<BoolCell v={b.isBuiltIn} />} />

              {/* P3-A — approval workflow + commercial lock comparison */}
              <CompareRow
                label="Approbation"
                a={<ApprovalBadge status={coerceApproval(a.approvalStatus)} size="xs" />}
                b={<ApprovalBadge status={coerceApproval(b.approvalStatus)} size="xs" />}
              />
              <CompareRow
                label="Verrouillé"
                a={<BoolCell v={a.isLocked} />}
                b={<BoolCell v={b.isLocked} />}
              />
              {(a.isLocked || b.isLocked) && (
                <CompareRow
                  label="Verrouillé le"
                  a={<span className="font-mono text-[10px]">{a.lockedAt ? formatDate(a.lockedAt) : '—'}</span>}
                  b={<span className="font-mono text-[10px]">{b.lockedAt ? formatDate(b.lockedAt) : '—'}</span>}
                />
              )}

              <CompareRow
                label="Palette"
                a={<PaletteSwatches colors={getThemeColors(a)} size={12} />}
                b={<PaletteSwatches colors={getThemeColors(b)} size={12} />}
              />
              <CompareRow
                label="Polices"
                a={<span className="truncate block">{a.fontDisplay} · {a.fontBody}</span>}
                b={<span className="truncate block">{b.fontDisplay} · {b.fontBody}</span>}
              />

              {(() => {
                const cfgA = getThemeConfig(a)
                const cfgB = getThemeConfig(b)
                return (
                  <>
                    <CompareRow label="Pattern" a={cfgA?.pattern || '—'} b={cfgB?.pattern || '—'} />
                    <CompareRow
                      label="Ambiance"
                      a={cfgA?.ambiance ? 'Définie' : '—'}
                      b={cfgB?.ambiance ? 'Définie' : '—'}
                    />
                    <CompareRow label="Motion" a={cfgA?.motionTier || '—'} b={cfgB?.motionTier || '—'} />
                    <CompareRow label="Layout" a={cfgA?.layout || '—'} b={cfgB?.layout || '—'} />
                  </>
                )
              })()}

              <CompareRow
                label="Sections"
                a={
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto themes-scroll">
                    {getFeatures(a).length ? (
                      getFeatures(a).map((f) => (
                        <Badge key={f} variant="outline" className="text-[9px]">{f}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                }
                b={
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto themes-scroll">
                    {getFeatures(b).length ? (
                      getFeatures(b).map((f) => (
                        <Badge key={f} variant="outline" className="text-[9px]">{f}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                }
              />

              <CompareRow
                label="Créé le"
                a={<span className="font-mono text-[10px]">{formatDate(a.createdAt)}</span>}
                b={<span className="font-mono text-[10px]">{formatDate(b.createdAt)}</span>}
              />
              <CompareRow
                label="Modifié le"
                a={<span className="font-mono text-[10px]">{formatDate(a.updatedAt)}</span>}
                b={<span className="font-mono text-[10px]">{formatDate(b.updatedAt)}</span>}
              />
            </div>

            <SheetFooter className="border-t border-white/10 p-4 flex-row gap-2">
              <Button variant="outline" size="sm" onClick={onClear}>
                <X className="w-4 h-4 mr-2" />
                Vider la sélection
              </Button>
              <Button size="sm" onClick={onClose} className="ml-auto">
                Fermer
              </Button>
            </SheetFooter>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sélectionnez 2 thèmes via le bouton <GitCompare className="inline w-3 h-3 mx-1" /> pour les comparer.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Sub-component: ThemeDetailSheet (P2-4) ──────────────────────────────────

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xs truncate">{value}</div>
    </div>
  )
}

function Chip({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-0.5'
          : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20 text-[10px] gap-0.5'
      }
    >
      {children}
    </Badge>
  )
}

// ─── Sub-component: AssetsEditor (P4-5) ───────────────────────────────────────
// Edits a theme's assetsJson (background image + pattern image) via the
// dedicated /assets PATCH endpoint. Locked themes render read-only with a
// notice — the server is the backstop (423) but we surface the state in UX.

/** Valid CSS background-repeat values for the pattern tile. */
type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'

const PATTERN_REPEAT_OPTIONS: { value: PatternRepeat; label: string }[] = [
  { value: 'repeat', label: 'Répété (repeat)' },
  { value: 'repeat-x', label: 'Horizontal (repeat-x)' },
  { value: 'repeat-y', label: 'Vertical (repeat-y)' },
  { value: 'no-repeat', label: 'Aucune (no-repeat)' },
]

/**
 * Parse the stored assetsJson into a flat editable shape. Falls back to
 * empty strings + default 'repeat' when the JSON is missing/invalid so the
 * form is always controllable.
 */
function parseAssetsJson(json: string | null | undefined): {
  backgroundUrl: string
  backgroundAlt: string
  patternUrl: string
  patternRepeat: PatternRepeat
} {
  const fallback = {
    backgroundUrl: '',
    backgroundAlt: '',
    patternUrl: '',
    patternRepeat: 'repeat' as PatternRepeat,
  }
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const bg = parsed.background
    const pat = parsed.pattern
    const bgUrl =
      bg && typeof bg === 'object' && 'url' in bg &&
      typeof (bg as { url: unknown }).url === 'string'
        ? (bg as { url: string }).url
        : ''
    const bgAlt =
      bg && typeof bg === 'object' && 'alt' in bg &&
      typeof (bg as { alt: unknown }).alt === 'string'
        ? (bg as { alt: string }).alt
        : ''
    const patUrl =
      pat && typeof pat === 'object' && 'url' in pat &&
      typeof (pat as { url: unknown }).url === 'string'
        ? (pat as { url: string }).url
        : ''
    const patRepeatRaw =
      pat && typeof pat === 'object' && 'repeat' in pat &&
      typeof (pat as { repeat: unknown }).repeat === 'string'
        ? (pat as { repeat: string }).repeat
        : 'repeat'
    const patRepeat: PatternRepeat =
      patRepeatRaw === 'repeat' || patRepeatRaw === 'repeat-x' ||
      patRepeatRaw === 'repeat-y' || patRepeatRaw === 'no-repeat'
        ? patRepeatRaw
        : 'repeat'
    return {
      backgroundUrl: bgUrl,
      backgroundAlt: bgAlt,
      patternUrl: patUrl,
      patternRepeat: patRepeat,
    }
  } catch {
    return fallback
  }
}

function AssetsEditor({
  theme, csrfToken, onSaved,
}: {
  theme: ThemeRow
  csrfToken: string
  onSaved: () => void
}) {
  const isLocked = !!theme.isLocked
  const [bgUrl, setBgUrl] = useState('')
  const [bgAlt, setBgAlt] = useState('')
  const [patUrl, setPatUrl] = useState('')
  const [patRepeat, setPatRepeat] = useState<PatternRepeat>('repeat')
  const [saving, setSaving] = useState(false)

  // Re-initialise from the theme's assetsJson whenever the theme changes
  // (e.g. after a save triggers a catalog refresh that updates `theme`).
  useEffect(() => {
    const a = parseAssetsJson(theme.assetsJson)
    setBgUrl(a.backgroundUrl)
    setBgAlt(a.backgroundAlt)
    setPatUrl(a.patternUrl)
    setPatRepeat(a.patternRepeat)
  }, [theme.id, theme.assetsJson])

  const save = async () => {
    setSaving(true)
    try {
      // Build the patch — null clears a key, omitted keys are left untouched.
      // The server merges into the existing assetsJson so we only need to send
      // what we want to change.
      const body: Record<string, unknown> = {}
      const trimmedBgUrl = bgUrl.trim()
      const trimmedPatUrl = patUrl.trim()
      body.background = trimmedBgUrl
        ? { url: trimmedBgUrl, ...(bgAlt.trim() ? { alt: bgAlt.trim() } : {}) }
        : null
      body.pattern = trimmedPatUrl
        ? { url: trimmedPatUrl, repeat: patRepeat }
        : null
      const res = await fetch(`/api/platform/themes/${theme.id}/assets`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error || `Erreur ${res.status}`)
      }
      toast.success('Assets enregistrés')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const clearBackground = () => { setBgUrl(''); setBgAlt('') }
  const clearPattern = () => { setPatUrl(''); setPatRepeat('repeat') }
  const hasBg = bgUrl.trim() !== '' || bgAlt.trim() !== ''
  const hasPat = patUrl.trim() !== '' || patRepeat !== 'repeat'

  return (
    <section className="space-y-3">
      <h3 className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Assets du thème</h3>

      {isLocked && (
        <div className="text-[11px] flex items-center gap-2 p-2 rounded-md border border-red-500/30 bg-red-500/10 text-red-300">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>Thème verrouillé — assets en lecture seule</span>
        </div>
      )}

      {/* Arrière-plan (background image) */}
      <div className="space-y-2 border border-white/10 rounded-md p-3">
        <div className="text-[10px] uppercase text-muted-foreground">Arrière-plan</div>
        <div className="grid gap-1.5">
          <Label htmlFor="asset-bg-url" className="text-[10px] text-muted-foreground">URL de l&apos;image</Label>
          <Input
            id="asset-bg-url"
            value={bgUrl}
            onChange={(e) => setBgUrl(e.target.value)}
            placeholder="https://… ou data:image/…"
            disabled={isLocked || saving}
            className="text-xs font-mono"
          />
          <Label htmlFor="asset-bg-alt" className="text-[10px] text-muted-foreground">Texte alternatif (accessibilité)</Label>
          <Input
            id="asset-bg-alt"
            value={bgAlt}
            onChange={(e) => setBgAlt(e.target.value)}
            placeholder="Description courte de l&apos;image"
            disabled={isLocked || saving}
            className="text-xs"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearBackground}
          disabled={isLocked || saving || !hasBg}
          title="Effacer l&apos;arrière-plan"
        >
          <X className="w-3 h-3 mr-1" />
          Effacer
        </Button>
        {/* Live preview — 16:9 box with the background image */}
        {bgUrl.trim() && (
          <div
            className="mt-1 w-full aspect-video rounded-md border border-white/10 overflow-hidden bg-zinc-950"
            style={{
              backgroundImage: `url('${bgUrl.trim()}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            aria-label="Aperçu de l&apos;arrière-plan"
          />
        )}
      </div>

      {/* Motif (pattern image) */}
      <div className="space-y-2 border border-white/10 rounded-md p-3">
        <div className="text-[10px] uppercase text-muted-foreground">Motif</div>
        <div className="grid gap-1.5">
          <Label htmlFor="asset-pat-url" className="text-[10px] text-muted-foreground">URL du motif</Label>
          <Input
            id="asset-pat-url"
            value={patUrl}
            onChange={(e) => setPatUrl(e.target.value)}
            placeholder="https://… ou data:image/…"
            disabled={isLocked || saving}
            className="text-xs font-mono"
          />
          <Label htmlFor="asset-pat-repeat" className="text-[10px] text-muted-foreground">Mode de répétition</Label>
          <Select
            value={patRepeat}
            onValueChange={(v) => setPatRepeat(v as PatternRepeat)}
            disabled={isLocked || saving}
          >
            <SelectTrigger id="asset-pat-repeat" className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATTERN_REPEAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearPattern}
          disabled={isLocked || saving || !hasPat}
          title="Effacer le motif"
        >
          <X className="w-3 h-3 mr-1" />
          Effacer
        </Button>
        {/* Live preview — 200x200 box with the pattern tiled */}
        {patUrl.trim() && (
          <div
            className="mt-1 w-full rounded-md border border-white/10 overflow-hidden bg-zinc-950"
            style={{
              height: 200,
              backgroundImage: `url('${patUrl.trim()}')`,
              backgroundRepeat: patRepeat,
              backgroundSize: patRepeat === 'no-repeat' ? 'contain' : 'auto',
            }}
            aria-label="Aperçu du motif"
          />
        )}
      </div>

      <Button
        type="button"
        onClick={save}
        disabled={isLocked || saving}
        className="w-full"
      >
        {saving
          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          : <Save className="w-4 h-4 mr-2" />}
        Enregistrer les assets
      </Button>
    </section>
  )
}

function ThemeDetailSheet({
  theme, open, onOpenChange, onPreview, onApply, csrfToken, onAssetsSaved,
}: {
  theme: ThemeRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onPreview: () => void
  onApply: () => void
  // P4-5 — CSRF token for the /assets PATCH endpoint + callback to refresh
  // the catalog after a successful save (so the new assetsJson propagates).
  csrfToken: string
  onAssetsSaved: () => void
}) {
  const colors = theme ? getThemeColors(theme) : {}
  const cfg = theme ? getThemeConfig(theme) : null
  const features = theme ? getFeatures(theme) : []
  const surface = colors.surface || colors.background || '#0f0f17'
  const ambiance = cfg?.ambiance || null
  const previewBg = ambiance ? `${ambiance}, ${surface}` : surface
  const primary = colors.primary || '#D4AF37'
  const sectionTitle = 'text-xs text-muted-foreground uppercase tracking-wider font-semibold'

  return (
    <Sheet open={open && !!theme} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col themes-scroll">
        <SheetHeader className="p-4 border-b border-white/10">
          <SheetTitle className="flex items-center gap-2">
            <span className="truncate">{theme?.name}</span>
            {theme && (
              <Badge className={`text-[9px] uppercase ${TIER_BADGE[theme.tier] || ''}`}>{theme.tier}</Badge>
            )}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">{theme?.slug}</SheetDescription>
        </SheetHeader>

        {theme && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 themes-scroll">
            {/* Larger preview thumbnail */}
            <div
              className="relative h-40 rounded-lg flex items-center justify-center overflow-hidden border border-white/10"
              style={{ background: previewBg }}
            >
              <span
                style={{
                  fontFamily: theme.fontDisplay || 'Cormorant Garamond, serif',
                  fontSize: '56px',
                  fontWeight: 700,
                  color: primary,
                  textShadow: '0 2px 12px rgba(0,0,0,0.4)',
                }}
              >
                M<span style={{ color: colors.accent || primary }}>&amp;</span>J
              </span>
            </div>

            {/* Identité */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>Identité</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Nom" value={theme.name} />
                <Field label="Slug" value={<span className="font-mono">{theme.slug}</span>} />
                <Field label="Tier" value={<Badge className={`text-[9px] uppercase ${TIER_BADGE[theme.tier] || ''}`}>{theme.tier}</Badge>} />
                <Field label="Catégorie" value={theme.category || '—'} />
                <Field label="Version" value={<span className="font-mono">{theme.version}</span>} />
                <Field label="Identité" value={theme.identity || '—'} />
                <Field label="Statut" value={<Badge variant="outline" className={`text-[9px] uppercase ${STATUS_BADGE[theme.status] || ''}`}>{theme.status}</Badge>} />
                <Field label="Source" value={cfg?.source || '—'} />
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                <Chip active={theme.isPremium}><Crown className="w-3 h-3" /> Premium</Chip>
                <Chip active={theme.isRecommended}><Star className="w-3 h-3" /> Recommandé</Chip>
                <Chip active={theme.isDefault}>Défaut</Chip>
                <Chip active={theme.isBuiltIn}>Built-in</Chip>
                {cfg?.isLegacy && <Chip active>Legacy</Chip>}
                {cfg?.isIdentity && <Chip active>Identity</Chip>}
              </div>
            </section>

            {/* P3-A — Approbation & Verrouillage (lock + workflow state + audit fields) */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>Approbation &amp; Verrouillage</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field
                  label="Statut d'approbation"
                  value={<ApprovalBadge status={coerceApproval(theme.approvalStatus)} />}
                />
                <Field
                  label="Verrouillé"
                  value={
                    theme.isLocked ? (
                      <Badge className="text-[9px] uppercase bg-red-500/15 text-red-400 border-red-500/30 gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> Oui
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] uppercase bg-zinc-500/10 text-zinc-500">
                        Non
                      </Badge>
                    )
                  }
                />
                <Field
                  label="Approuvé le"
                  value={<span className="font-mono text-[10px]">{theme.approvedAt ? formatDate(theme.approvedAt) : '—'}</span>}
                />
                <Field
                  label="Approuvé par"
                  value={<span className="font-mono text-[10px]">{theme.approvedBy || '—'}</span>}
                />
                <Field
                  label="Verrouillé le"
                  value={<span className="font-mono text-[10px]">{theme.lockedAt ? formatDate(theme.lockedAt) : '—'}</span>}
                />
                <Field
                  label="Verrouillé par"
                  value={<span className="font-mono text-[10px]">{theme.lockedBy || '—'}</span>}
                />
              </div>
              {/* Visual workflow progress indicator */}
              <div className="flex items-center gap-1 pt-1 text-[9px] uppercase">
                {(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'LOCKED'] as const).map((s, idx, arr) => {
                  const currentIdx = arr.indexOf(coerceApproval(theme.approvalStatus))
                  const isReached = idx <= currentIdx
                  const isCurrent = s === coerceApproval(theme.approvalStatus)
                  return (
                    <div key={s} className="flex items-center gap-1 flex-1">
                      <div
                        className={`flex-1 h-1 rounded-full ${isReached ? APPROVAL_DOT[s] : 'bg-zinc-700'}`}
                        title={APPROVAL_LABEL[s]}
                      />
                      {isCurrent && (
                        <span className={`shrink-0 ${APPROVAL_BADGE[s].split(' ')[1]}`}>●</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Palette */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>Palette</h3>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['Primaire', colors.primary],
                  ['Primaire clair', colors.primaryLight],
                  ['Primaire foncé', colors.primaryDark],
                  ['Accent', colors.accent],
                  ['Accent clair', colors.accentLight],
                  ['Surface', colors.surface ?? colors.background],
                  ['Surface profonde', colors.surfaceDeep],
                  ['Texte', colors.text],
                  ['Texte muted', colors.textMuted],
                ] as const).map(([label, color]) => (
                  <div key={label} className="border border-white/10 rounded-md p-2 flex items-center gap-2 min-w-0">
                    <span
                      className="w-6 h-6 rounded-full border border-white/20 shrink-0"
                      style={{ background: color || 'transparent' }}
                    />
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase text-muted-foreground truncate">{label}</div>
                      <div className="text-[10px] font-mono truncate">{color || '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Typographie */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>Typographie</h3>
              <div className="border border-white/10 rounded-md p-3 space-y-3">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">
                    Titres · {theme.fontDisplay || '(non définie)'}
                    {cfg?.fonts?.displayWeight ? ` · ${cfg.fonts.displayWeight}` : ''}
                  </div>
                  <div
                    style={{
                      fontFamily: theme.fontDisplay || 'Cormorant Garamond, serif',
                      fontSize: '32px',
                      fontWeight: Number(cfg?.fonts?.displayWeight) || 700,
                      color: primary,
                      lineHeight: 1.1,
                    }}
                  >
                    Mariage
                  </div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">
                    Texte · {theme.fontBody || '(non définie)'}
                    {cfg?.fonts?.bodyWeight ? ` · ${cfg.fonts.bodyWeight}` : ''}
                  </div>
                  <div
                    style={{
                      fontFamily: theme.fontBody || 'Inter, sans-serif',
                      fontSize: '14px',
                      color: colors.text || readableTextOn(colors.surface || colors.background),
                    }}
                  >
                    Bienvenue à notre mariage. Célébrons ensemble ce moment unique
                    rempli d&apos;amour et de joie, entourés de nos proches.
                  </div>
                </div>
              </div>
            </section>

            {/* Ambiance */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>Ambiance visuelle</h3>
              <div className="border border-white/10 rounded-md p-3 space-y-2">
                <div className="text-xs">
                  <span className="text-muted-foreground">Motif: </span>
                  <span className="font-mono">{cfg?.pattern || '—'}</span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Motion tier: </span>
                  <span className="font-mono">{cfg?.motionTier || '—'}</span>
                </div>
                {ambiance && (
                  <div
                    className="h-20 rounded border border-white/10"
                    style={{ background: ambiance, backgroundSize: 'cover' }}
                    title={ambiance}
                  />
                )}
              </div>
            </section>

            {/* Layout & sections */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>Layout &amp; sections</h3>
              <div className="text-xs mb-2">
                <span className="text-muted-foreground">Layout: </span>
                <span className="font-mono">{cfg?.layout || '—'}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {features.length ? (
                  features.map((f) => (
                    <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Aucune section déclarée</span>
                )}
              </div>
            </section>

            {/* Description */}
            {cfg?.description && (
              <section className="space-y-2">
                <h3 className={sectionTitle}>Description</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{cfg.description}</p>
              </section>
            )}

            {/* Raw configJson */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>ConfigJson brut</h3>
              <pre className="text-[10px] font-mono bg-zinc-950/50 border border-white/10 rounded-md p-3 max-h-48 overflow-auto themes-scroll whitespace-pre-wrap break-all">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(theme.configJson), null, 2)
                  } catch {
                    return theme.configJson
                  }
                })()}
              </pre>
            </section>

            {/* Métadonnées */}
            <section className="space-y-2">
              <h3 className={sectionTitle}>Métadonnées</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Créé le" value={<span className="font-mono text-[10px]">{formatDate(theme.createdAt)}</span>} />
                <Field label="Modifié le" value={<span className="font-mono text-[10px]">{formatDate(theme.updatedAt)}</span>} />
              </div>
            </section>

            {/* P4-5 — Assets du thème (background + pattern image management) */}
            <AssetsEditor
              theme={theme}
              csrfToken={csrfToken}
              onSaved={onAssetsSaved}
            />
          </div>
        )}

        <SheetFooter className="border-t border-white/10 p-4 flex-row gap-2">
          <Button variant="outline" size="sm" onClick={onPreview} disabled={!theme}>
            <Eye className="w-4 h-4 mr-2" />
            Aperçu
          </Button>
          <Button size="sm" onClick={onApply} className="ml-auto" disabled={!theme}>
            <Check className="w-4 h-4 mr-2" />
            Utiliser ce thème
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ─── Sub-component: ApplyDialog (P2-6) ──────────────────────────────────────

function ApplyDialog({
  theme, csrfToken, open, onOpenChange,
}: {
  theme: ThemeRow | null
  csrfToken: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [weddings, setWeddings] = useState<WeddingRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [weddingId, setWeddingId] = useState('')
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingList(true)
    setWeddingId('')
    fetch('/api/platform/weddings?page=1&limit=50', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('fetch failed')
        const json = await res.json()
        if (cancelled) return
        setWeddings(json.weddings || [])
      })
      .catch(() => {
        if (!cancelled) {
          setWeddings([])
          toast.error('Impossible de charger la liste des mariages')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false)
      })
    return () => { cancelled = true }
  }, [open])

  const apply = async () => {
    if (!theme) return
    if (!weddingId) {
      toast.error('Sélectionnez un mariage')
      return
    }
    setApplying(true)
    try {
      const res = await fetch(`/api/platform/themes/${theme.id}/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ weddingId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      toast.success(`Thème « ${theme.name} » appliqué au mariage`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Appliquer le thème « {theme?.name} »</DialogTitle>
          <DialogDescription>
            Sélectionnez le mariage destinataire. Le changement est immédiat (cache invalidé).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="wedding-select">Mariage destinataire</Label>
            {loadingList ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Chargement de la liste…
              </div>
            ) : weddings.length === 0 ? (
              <div className="text-xs p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 mt-2">
                Aucun mariage disponible. Créez d&apos;abord un mariage dans la plateforme.
              </div>
            ) : (
              <Select value={weddingId} onValueChange={setWeddingId}>
                <SelectTrigger id="wedding-select" className="mt-1.5">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {weddings.map((w) => {
                    const label = w.coupleLabel || `${w.brideName || '?'} & ${w.groomName || '?'}`
                    const dateLabel = w.weddingDate
                      ? ` — ${new Date(w.weddingDate).toLocaleDateString('fr-FR')}`
                      : ''
                    return (
                      <SelectItem key={w.id} value={w.id}>
                        {label}{dateLabel}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="text-xs p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Cette action va écraser le thème actuel du mariage sélectionné.
              Le changement est immédiat (cache invalidé).
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={apply} disabled={applying || !weddingId || weddings.length === 0}>
            {applying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-component: ThemeFormDialog (P3.9 extended with P0/P1 fields) ────────

function ThemeFormDialog({
  open, onOpenChange, editing, form, setForm, saving, onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: ThemeRow | null
  form: FormState
  setForm: (f: FormState) => void
  saving: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto themes-scroll">
        <DialogHeader>
          <DialogTitle>{editing ? 'Éditer le thème' : 'Nouveau thème'}</DialogTitle>
          <DialogDescription>
            {editing ? `Modifier « ${editing.name} »` : 'Créer un nouveau thème dans le catalogue'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Name + slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="f-name">Nom</Label>
              <Input id="f-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="f-slug">Slug</Label>
              <Input
                id="f-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              />
            </div>
          </div>

          {/* P0/P1: tier + category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="f-tier">Tier</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v as FormTier })}>
                <SelectTrigger id="f-tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="f-cat">Catégorie</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="f-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* P0/P1: version + identity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="f-version">Version (semver)</Label>
              <Input
                id="f-version"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.0.0"
              />
            </div>
            <div>
              <Label htmlFor="f-identity">Identité (preset)</Label>
              <Select
                value={form.identity || 'none'}
                onValueChange={(v) => setForm({ ...form, identity: v === 'none' ? '' : v })}
              >
                <SelectTrigger id="f-identity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {IDENTITY_PRESET_SLUGS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-3 gap-3">
            {([
              ['Primaire', 'primaryColor', 'Couleur primaire'],
              ['Accent', 'accentColor', 'Couleur accent'],
              ['Fond', 'backgroundColor', 'Couleur de fond'],
            ] as const).map(([label, field, ariaLabel]) => (
              <div key={field}>
                <Label htmlFor={`f-${field}`}>{label}</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-10 h-9 rounded border border-white/10 bg-transparent"
                    aria-label={ariaLabel}
                  />
                  <Input
                    id={`f-${field}`}
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Fonts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="f-display">Police titres</Label>
              <Input
                id="f-display"
                value={form.fontDisplay}
                onChange={(e) => setForm({ ...form, fontDisplay: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="f-body">Police texte</Label>
              <Input
                id="f-body"
                value={form.fontBody}
                onChange={(e) => setForm({ ...form, fontBody: e.target.value })}
              />
            </div>
          </div>

          {/* Status + flags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="f-status">Statut</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as FormStatus })}>
                <SelectTrigger id="f-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Brouillon</SelectItem>
                  <SelectItem value="PUBLISHED">Publié</SelectItem>
                  <SelectItem value="ARCHIVED">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Options</Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isBuiltIn}
                    onChange={(e) => setForm({ ...form, isBuiltIn: e.target.checked })}
                  />
                  Built-in
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isPremium}
                    onChange={(e) => setForm({ ...form, isPremium: e.target.checked })}
                  />
                  Premium
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isRecommended}
                    onChange={(e) => setForm({ ...form, isRecommended: e.target.checked })}
                  />
                  Recommandé
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  />
                  Défaut
                </label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? 'Mettre à jour' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-component: PreviewDialog (P3.9 — kept, lightly enhanced) ────────────

function PreviewDialog({
  theme, open, onOpenChange, onApply,
}: {
  theme: ThemeRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onApply: () => void
}) {
  const colors = theme ? getThemeColors(theme) : {}
  const cfg = theme ? getThemeConfig(theme) : null
  const features = theme ? getFeatures(theme) : []
  const p = theme ? parsePalette(theme.paletteJson) : { primary: '#D4A853', accent: '#C8785A', bg: '#0f0f17' }
  const ambiance = cfg?.ambiance || null
  const previewBg = ambiance ? `${ambiance}, ${p.bg}` : p.bg

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto themes-scroll">
        <DialogHeader>
          <DialogTitle>
            Aperçu thème · {theme?.name}
            <span className="ml-2 text-xs font-mono text-muted-foreground">{theme?.slug}</span>
          </DialogTitle>
          <DialogDescription>Maquette visuelle du thème appliqué à un mariage</DialogDescription>
        </DialogHeader>

        {theme && (
          <div className="space-y-4">
            {/* Color swatches — extended with all available colors */}
            <div>
              <div className="text-xs text-muted-foreground uppercase mb-2">Palette</div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ['Primaire', colors.primary],
                  ['Accent', colors.accent],
                  ['Fond', colors.surface ?? colors.background],
                  ['Primaire clair', colors.primaryLight],
                  ['Primaire foncé', colors.primaryDark],
                  ['Accent clair', colors.accentLight],
                ] as const).map(([label, color]) => {
                  if (!color) return null
                  return (
                    <div key={label} className="border border-white/10 rounded-lg p-3 flex items-center gap-3 min-w-0">
                      <span
                        className="w-10 h-10 rounded-full border border-white/20 shrink-0"
                        style={{ background: color }}
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                        <div className="text-xs font-mono truncate">{color}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Font samples */}
            <div>
              <div className="text-xs text-muted-foreground uppercase mb-2">Polices</div>
              <div className="border border-white/10 rounded-lg p-4 space-y-3">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">
                    Titres — {theme.fontDisplay || '(non définie)'}
                  </div>
                  <div style={{ fontFamily: theme.fontDisplay || 'Cormorant Garamond, serif', fontSize: '32px', color: p.primary }}>
                    Heureux Mariage
                  </div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">
                    Texte — {theme.fontBody || '(non définie)'}
                  </div>
                  <div
                    style={{
                      fontFamily: theme.fontBody || 'Inter, sans-serif',
                      fontSize: '14px',
                      color: colors.text || readableTextOn(colors.surface || colors.background),
                    }}
                  >
                    Bienvenue à notre mariage. Célébrons ensemble ce moment unique
                    rempli d&apos;amour et de joie.
                  </div>
                </div>
              </div>
            </div>

            {/* Mock hero section */}
            <div>
              <div className="text-xs text-muted-foreground uppercase mb-2">Aperçu Hero (maquette)</div>
              <div className="rounded-lg border border-white/10 p-8 text-center overflow-hidden" style={{ background: previewBg }}>
                <div style={{ fontFamily: theme.fontDisplay || 'Cormorant Garamond, serif', color: p.primary, fontSize: '40px', lineHeight: 1.1 }}>
                  Marie &amp; Jean
                </div>
                <div
                  style={{
                    fontFamily: theme.fontBody || 'Inter, sans-serif',
                    color: colors.text || '#fff',
                    opacity: 0.85,
                    fontSize: '14px',
                    marginTop: '8px',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                  }}
                >
                  12 Juin 2026 · Paris
                </div>
                <div style={{ width: '60px', height: '2px', background: p.accent, margin: '16px auto 0' }} />
              </div>
            </div>

            {/* Features chips */}
            {features.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-2">
                  Sections ({features.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {features.map((f) => (
                    <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground uppercase">Statut</div>
                <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_BADGE[theme.status] || ''}`}>
                  {theme.status}
                </Badge>
              </div>
              <div>
                <div className="text-muted-foreground uppercase">Tier</div>
                <Badge variant="outline" className={`text-[10px] uppercase ${TIER_BADGE[theme.tier] || ''}`}>
                  {theme.tier}
                </Badge>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button onClick={onApply} disabled={!theme}>
            <Check className="w-4 h-4 mr-2" />
            Utiliser ce thème
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ThemesManager({ csrfToken }: { csrfToken: string }) {
  // Catalog state
  const [themes, setThemes] = useState<ThemeRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')  // debounced
  const [tierFilter, setTierFilter] = useState<string>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [premiumOnly, setPremiumOnly] = useState(false)
  const [recommendedOnly, setRecommendedOnly] = useState(false)
  // P3-A — approval workflow filter (Tous / DRAFT / REVIEW / APPROVED / PUBLISHED / LOCKED)
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('ALL')

  // Quality scores (P2-7 integration)
  const [qualityMap, setQualityMap] = useState<QualityMap>({})
  const [qualityLoading, setQualityLoading] = useState(false)

  // Compare selection (max 2)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  // Detail sheet
  const [detailTheme, setDetailTheme] = useState<ThemeRow | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Apply dialog
  const [applyTheme, setApplyTheme] = useState<ThemeRow | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)

  // Preview modal (P3.9 — kept)
  const [preview, setPreview] = useState<ThemeRow | null>(null)

  // Create/Edit dialog (P3.9 — extended)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<ThemeRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // P3-A — Set of theme IDs currently in-flight for lock/unlock/transition.
  // Used to disable the workflow + lock buttons on the affected card (and
  // show a spinner). Other cards remain interactive.
  const [busyThemeIds, setBusyThemeIds] = useState<Set<string>>(new Set())

  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyThemeIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  // ─── Debounce search input (300ms) ──────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // ─── Load themes (re-fetches on any filter change) ─────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: '1',
      limit: '200',
      search,
      status: statusFilter,
    })
    if (tierFilter !== 'ALL') params.set('tier', tierFilter)
    if (categoryFilter !== 'ALL') params.set('category', categoryFilter)
    if (premiumOnly) params.set('isPremium', 'true')
    if (recommendedOnly) params.set('isRecommended', 'true')
    // P3-A — approval workflow filter
    if (approvalFilter !== 'ALL') params.set('approvalStatus', approvalFilter)
    try {
      const res = await fetch(`/api/platform/themes?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setThemes(json.themes || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erreur lors du chargement des thèmes')
      setThemes([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, tierFilter, categoryFilter, premiumOnly, recommendedOnly, approvalFilter, refreshKey])

  useEffect(() => { load() }, [load])

  // ─── Fetch quality scores in parallel (P2-7) ───────────────────────────────
  // Staggered by 50ms to avoid 21 simultaneous requests. Failures stored as
  // null in the map (so the card shows "N/A"). Endpoint may 404 if P2-7 is
  // not yet deployed — handled gracefully.
  useEffect(() => {
    if (themes.length === 0) {
      setQualityMap({})
      return
    }
    let cancelled = false
    setQualityLoading(true)

    const fetchAll = async () => {
      const results: QualityMap = {}
      const tasks = themes.map((t, idx) =>
        new Promise<void>((resolve) => {
          // Stagger only for catalogs under 30 items. Above that the browser's
          // own concurrency limit (~6 per origin) acts as a natural throttle.
          const delay = themes.length <= 30 ? idx * 50 : 0
          setTimeout(async () => {
            try {
              const res = await fetch(`/api/platform/themes/${t.id}/quality`, { credentials: 'include' })
              if (!res.ok) {
                results[t.id] = null
              } else {
                const json = await res.json()
                const overall = typeof json.overall === 'number' ? json.overall : 0
                const tier = json.tier === 'good' || json.tier === 'warning' || json.tier === 'critical'
                  ? json.tier
                  : qualityTier(overall)
                results[t.id] = { overall, tier }
              }
            } catch {
              results[t.id] = null
            } finally {
              resolve()
            }
          }, delay)
        }),
      )
      await Promise.all(tasks)
      if (!cancelled) {
        setQualityMap(results)
        setQualityLoading(false)
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [themes])

  // ─── Compare handlers ──────────────────────────────────────────────────────
  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id)
        if (next.length < 2) setCompareOpen(false)
        return next
      }
      if (prev.length >= 2) {
        // Replace oldest.
        return [prev[1], id]
      }
      const next = [...prev, id]
      if (next.length === 2) {
        setCompareOpen(true)
      }
      return next
    })
  }, [])

  const clearCompare = useCallback(() => {
    setCompareIds([])
    setCompareOpen(false)
  }, [])

  const compareThemes = useMemo(
    () => compareIds
      .map((id) => themes.find((t) => t.id === id))
      .filter((t): t is ThemeRow => Boolean(t)),
    [compareIds, themes],
  )

  // ─── CRUD handlers (preserved + extended) ──────────────────────────────────
  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowDialog(true)
  }

  const openEdit = useCallback((t: ThemeRow) => {
    const p = parsePalette(t.paletteJson)
    setEditing(t)
    setForm({
      name: t.name,
      slug: t.slug,
      primaryColor: p.primary,
      accentColor: p.accent,
      backgroundColor: p.bg,
      fontDisplay: t.fontDisplay || '',
      fontBody: t.fontBody || '',
      isBuiltIn: t.isBuiltIn,
      status: (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(t.status) ? t.status : 'PUBLISHED') as FormStatus,
      tier: (['FREE', 'STANDARD', 'PREMIUM', 'EXCLUSIVE'].includes(t.tier) ? t.tier : 'STANDARD') as FormTier,
      category: t.category || 'CLASSIC',
      version: t.version || '1.0.0',
      identity: t.identity || '',
      isPremium: t.isPremium,
      isRecommended: t.isRecommended,
      isDefault: t.isDefault,
    })
    setShowDialog(true)
  }, [])

  const submit = async () => {
    if (!form.name || !form.slug) {
      toast.error('Nom et slug requis')
      return
    }
    setSaving(true)
    const paletteJson = JSON.stringify({
      primary: form.primaryColor,
      accent: form.accentColor,
      background: form.backgroundColor,
    })
    const payload = {
      name: form.name,
      slug: form.slug,
      paletteJson,
      fontDisplay: form.fontDisplay || null,
      fontBody: form.fontBody || null,
      isBuiltIn: form.isBuiltIn,
      status: form.status,
      // P0/P1 fields
      tier: form.tier,
      category: form.category || null,
      version: form.version || '1.0.0',
      identity: form.identity || null,
      isPremium: form.isPremium,
      isRecommended: form.isRecommended,
      isDefault: form.isDefault,
    }
    try {
      const url = editing ? `/api/platform/themes/${editing.id}` : '/api/platform/themes'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success(editing ? 'Thème mis à jour' : 'Thème créé')
      setShowDialog(false)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const duplicate = async (t: ThemeRow) => {
    const baseSlug = `${t.slug}-copy`
    setSaving(true)
    try {
      let attempt = 0
      let lastErr = ''
      while (attempt < 5) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
        const res = await fetch('/api/platform/themes', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({
            name: `${t.name} (copie)`,
            slug,
            paletteJson: t.paletteJson,
            fontDisplay: t.fontDisplay,
            fontBody: t.fontBody,
            isBuiltIn: false, // copies are never built-in
            status: 'DRAFT',
            // Copy P0/P1 metadata (but never premium/default/built-in)
            tier: t.tier,
            category: t.category,
            version: t.version,
            configJson: t.configJson,
            isPremium: false,
            isRecommended: false,
            isDefault: false,
          }),
        })
        if (res.ok) {
          toast.success(`Thème dupliqué → ${slug}`)
          setRefreshKey((k) => k + 1)
          return
        }
        if (res.status === 409) {
          attempt++
          continue
        }
        const body = await res.json().catch(() => ({}))
        lastErr = body?.error || 'Erreur serveur'
        break
      }
      throw new Error(lastErr || 'Impossible de dupliquer (slug en conflit)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t: ThemeRow) => {
    if (t.isBuiltIn) {
      toast.error('Les thèmes intégrés ne peuvent pas être supprimés')
      return
    }
    if (!confirm(`Supprimer le thème "${t.name}" ?`)) return
    try {
      const res = await fetch(`/api/platform/themes/${t.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Erreur serveur')
      }
      toast.success('Thème supprimé')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  // ─── P3-A — Lock / Unlock / Transition handlers ─────────────────────────────
  // Each marks the affected theme as busy (so its buttons show a spinner),
  // fires the corresponding API endpoint, then refreshes the catalog. Other
  // cards remain interactive throughout.

  const handleLock = useCallback(async (t: ThemeRow) => {
    const reason = window.prompt(`Raison du verrouillage de « ${t.name} » ?`, '') ?? ''
    markBusy(t.id, true)
    try {
      const res = await fetch(`/api/platform/themes/${t.id}/lock`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      toast.success(`Thème « ${t.name} » verrouillé`)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      markBusy(t.id, false)
    }
  }, [csrfToken, markBusy])

  const handleUnlock = useCallback(async (t: ThemeRow) => {
    const reason = window.prompt(`Raison du déverrouillage de « ${t.name} » ?`, '') ?? ''
    markBusy(t.id, true)
    try {
      const res = await fetch(`/api/platform/themes/${t.id}/unlock`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      toast.success(`Thème « ${t.name} » déverrouillé`)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      markBusy(t.id, false)
    }
  }, [csrfToken, markBusy])

  const handleTransition = useCallback(async (t: ThemeRow, to: ApprovalState) => {
    const notes = window.prompt(`Notes pour la transition → ${APPROVAL_LABEL[to]} ?`, '') ?? ''
    markBusy(t.id, true)
    try {
      const res = await fetch(`/api/platform/themes/${t.id}/transition`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ to, notes: notes.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      toast.success(`Thème « ${t.name} » → ${APPROVAL_LABEL[to]}`)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      markBusy(t.id, false)
    }
  }, [csrfToken, markBusy])

  // ─── Derived: tier breakdown for results count ──────────────────────────────
  const tierBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of themes) {
      counts[t.tier] = (counts[t.tier] || 0) + 1
    }
    return counts
  }, [themes])

  const hasActiveFilters =
    premiumOnly || recommendedOnly ||
    search !== '' ||
    tierFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    approvalFilter !== 'ALL'

  const resetFilters = () => {
    setSearchInput('')
    setSearch('')
    setTierFilter('ALL')
    setCategoryFilter('ALL')
    setStatusFilter('ALL')
    setPremiumOnly(false)
    setRecommendedOnly(false)
    setApprovalFilter('ALL')
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-4 md:p-6 min-h-[60vh]">
      {/* Inline custom scrollbar styling (scoped to .themes-scroll class) */}
      <style dangerouslySetInnerHTML={{ __html: SCROLLBAR_CSS }} />

      {/* 1. Header bar */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Catalogue de Thèmes</h2>
          <p className="text-xs text-muted-foreground">Choisissez votre expérience</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCompareOpen(true)}
            disabled={compareIds.length === 0}
          >
            <GitCompare className="w-4 h-4 mr-2" />
            Comparer ({compareIds.length})
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Rafraîchir"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Rafraîchir</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nouveau thème
          </Button>
        </div>
      </div>

      {/* 2. Search + Filter bar */}
      <Card className="glass-card gold-border border-0 py-0">
        <CardContent className="p-3 space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Input
              placeholder="Rechercher par nom ou slug…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="max-w-xs"
              aria-label="Recherche"
            />
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[140px]" aria-label="Filtrer par tier">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les tiers</SelectItem>
                {TIER_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]" aria-label="Filtrer par catégorie">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les catégories</SelectItem>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" aria-label="Filtrer par statut">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                <SelectItem value="DRAFT">Brouillon</SelectItem>
                <SelectItem value="PUBLISHED">Publié</SelectItem>
                <SelectItem value="ARCHIVED">Archivé</SelectItem>
              </SelectContent>
            </Select>
            {/* P3-A — approval workflow filter */}
            <Select value={approvalFilter} onValueChange={(v) => setApprovalFilter(v as ApprovalFilter)}>
              <SelectTrigger className="w-[160px]" aria-label="Filtrer par approbation">
                <SelectValue placeholder="Approbation" />
              </SelectTrigger>
              <SelectContent>
                {APPROVAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={premiumOnly ? 'default' : 'outline'}
              size="icon"
              onClick={() => setPremiumOnly((v) => !v)}
              aria-pressed={premiumOnly}
              aria-label="Premium uniquement"
              title="Premium uniquement"
            >
              <Crown className="w-4 h-4" />
            </Button>
            <Button
              variant={recommendedOnly ? 'default' : 'outline'}
              size="icon"
              onClick={() => setRecommendedOnly((v) => !v)}
              aria-pressed={recommendedOnly}
              aria-label="Recommandés uniquement"
              title="Recommandés uniquement"
            >
              <Star className="w-4 h-4" />
            </Button>
          </div>

          {/* Results count + tier breakdown */}
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {total} thème{total !== 1 ? 's' : ''}
            </span>
            <span>·</span>
            {Object.entries(tierBreakdown).map(([t, n]) => (
              <span key={t} className="flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${tierDotClass(t)}`} />
                {t}: {n}
              </span>
            ))}
            {hasActiveFilters && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="underline hover:text-foreground"
                >
                  Réinitialiser les filtres
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Card grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : themes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">
            Aucun thème ne correspond aux filtres.
          </p>
          {hasActiveFilters ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
              Réinitialiser les filtres
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setRefreshKey((k) => k + 1)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Réessayer
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {themes.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              quality={qualityMap[t.id] ?? null}
              qualityLoading={qualityLoading && qualityMap[t.id] === undefined}
              isSelectedForCompare={compareIds.includes(t.id)}
              compareDisabled={compareIds.length >= 2 && !compareIds.includes(t.id)}
              onPreview={() => setPreview(t)}
              onToggleCompare={() => toggleCompare(t.id)}
              onDetails={() => { setDetailTheme(t); setDetailOpen(true) }}
              onApply={() => { setApplyTheme(t); setApplyOpen(true) }}
              onEdit={() => openEdit(t)}
              onDuplicate={() => duplicate(t)}
              onDelete={() => remove(t)}
              saving={saving}
              // P3-A — lock + approval workflow
              onLock={() => handleLock(t)}
              onUnlock={() => handleUnlock(t)}
              onTransition={(to) => handleTransition(t, to)}
              busy={busyThemeIds.has(t.id)}
            />
          ))}
        </div>
      )}

      {/* 4. Compare sheet */}
      <CompareSheet
        open={compareOpen}
        onOpenChange={setCompareOpen}
        themes={compareThemes}
        onClose={() => setCompareOpen(false)}
        onClear={clearCompare}
      />

      {/* 5. Detail sheet */}
      <ThemeDetailSheet
        theme={detailTheme}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onPreview={() => {
          if (detailTheme) setPreview(detailTheme)
        }}
        onApply={() => {
          if (detailTheme) {
            setApplyTheme(detailTheme)
            setApplyOpen(true)
          }
        }}
        // P4-5 — pass the CSRF token + catalog-refresh callback so the
        // AssetsEditor inside the sheet can PATCH /assets and the catalog
        // refreshes to reflect the new assetsJson.
        csrfToken={csrfToken}
        onAssetsSaved={() => setRefreshKey((k) => k + 1)}
      />

      {/* 6. Apply dialog */}
      <ApplyDialog
        theme={applyTheme}
        csrfToken={csrfToken}
        open={applyOpen}
        onOpenChange={setApplyOpen}
      />

      {/* 7. Create/Edit dialog (extended with P0/P1 fields) */}
      <ThemeFormDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        editing={editing}
        form={form}
        setForm={setForm}
        saving={saving}
        onSubmit={submit}
      />

      {/* Preview modal (P3.9 — kept) */}
      <PreviewDialog
        theme={preview}
        open={!!preview}
        onOpenChange={(o) => { if (!o) setPreview(null) }}
        onApply={() => {
          if (preview) {
            setApplyTheme(preview)
            setApplyOpen(true)
          }
        }}
      />
    </div>
  )
}


