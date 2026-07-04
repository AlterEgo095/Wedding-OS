/**
 * Command Center — Shared Constants & Badges
 *
 * Extracted from the legacy monolithic page.tsx so every section renders
 * consistent badges, labels and chart colors. Pure data module.
 */

import {
  LayoutDashboard,
  Heart,
  Users as UsersIcon,
  ScrollText,
  Wallet,
  Rocket,
  Palette,
  Sparkles,
  Image as ImageIcon,
  BarChart3,
  Zap,
  Mail,
  PenTool,
  ShoppingBag,
  Activity,
  Crown,
  type LucideIcon,
} from 'lucide-react'

import type { Plan, WeddingStatus } from './types'

// ════════════════════════════════════════════════════════════════════════════
// Command Center Navigation — grouped enterprise sections
// ════════════════════════════════════════════════════════════════════════════

export type SectionId =
  | 'dashboard'
  | 'portfolio'
  | 'workspace'
  | 'ai'
  | 'media'
  | 'analytics'
  | 'automation'
  | 'theme'
  | 'invitation'
  | 'penpot'
  | 'marketplace'
  | 'observability'
  | 'billing'
  | 'onboarding'
  | 'users'
  | 'audit'
  | 'appearance'

export interface NavSection {
  group: string
  items: Array<{ id: SectionId; label: string; icon: LucideIcon; badge?: string }>
}

/**
 * Enterprise navigation — grouped into logical sections so the admin can
 * reach any module in ≤ 2 clicks. Existing tabs (billing, onboarding,
 * users, audit, appearance) are preserved in their natural groups.
 */
export const NAV_GROUPS: NavSection[] = [
  {
    group: 'Pilotage',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'portfolio', label: 'Wedding Portfolio', icon: Heart },
      { id: 'workspace', label: 'Wedding Workspace', icon: Crown },
    ],
  },
  {
    group: 'Centres',
    items: [
      { id: 'ai', label: 'AI Command', icon: Sparkles },
      { id: 'media', label: 'Media Center', icon: ImageIcon },
      { id: 'analytics', label: 'Analytics Center', icon: BarChart3 },
      { id: 'automation', label: 'Automation Center', icon: Zap },
    ],
  },
  {
    group: 'Engines',
    items: [
      { id: 'theme', label: 'Theme Center', icon: Palette },
      { id: 'invitation', label: 'Invitation Center', icon: Mail },
      { id: 'penpot', label: 'Penpot Studio', icon: PenTool },
      { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    ],
  },
  {
    group: 'Système',
    items: [
      { id: 'observability', label: 'Observabilité', icon: Activity },
      { id: 'billing', label: 'Facturation', icon: Wallet },
      { id: 'onboarding', label: 'Onboarding', icon: Rocket },
    ],
  },
  {
    group: 'Administration',
    items: [
      { id: 'users', label: 'Utilisateurs', icon: UsersIcon },
      { id: 'audit', label: "Journal d'audit", icon: ScrollText },
      { id: 'appearance', label: 'Apparence', icon: Palette },
    ],
  },
]

export const ALL_SECTION_IDS: SectionId[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id))

export function findSection(id: SectionId): { label: string; icon: LucideIcon } | undefined {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.id === id)
    if (item) return { label: item.label, icon: item.icon }
  }
  return undefined
}

// ════════════════════════════════════════════════════════════════════════════
// Statuses, Plans, Roles
// ════════════════════════════════════════════════════════════════════════════

export const WEDDING_STATUSES: WeddingStatus[] = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'ARCHIVED', 'SUSPENDED']
export const PLANS: Plan[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE']

export const STATUS_LABELS: Record<WeddingStatus, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  COMPLETED: 'Terminé',
  ARCHIVED: 'Archivé',
  SUSPENDED: 'Suspendu',
}

export const STATUS_BADGE_CLASS: Record<WeddingStatus, string> = {
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  COMPLETED: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  SUSPENDED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export const PLAN_BADGE_CLASS: Record<Plan, string> = {
  ELITE: 'bg-gold/15 text-gold border-gold/40',
  PREMIUM: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ESSENTIEL: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  TRIAL: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'Administrateur Plateforme',
  SUPER_ADMIN: 'Super Admin',
  ORGANIZER: 'Organisateur',
  RECEPTION: 'Réception',
  CONTROLLER: 'Contrôleur',
}

export const ROLE_BADGE_CLASS: Record<string, string> = {
  PLATFORM_ADMIN: 'bg-gold/15 text-gold border-gold/40',
  SUPER_ADMIN: 'bg-gold/15 text-gold border-gold/40',
  ORGANIZER: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  RECEPTION: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  CONTROLLER: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role
}

// ════════════════════════════════════════════════════════════════════════════
// Chart styling — dark luxury theme
// ════════════════════════════════════════════════════════════════════════════

export const PLAN_CHART_COLORS: Record<string, string> = {
  ELITE: '#D4A853',
  PREMIUM: '#10b981',
  ESSENTIEL: '#8b5cf6',
  TRIAL: '#71717a',
}

export const STATUS_CHART_COLORS: Record<string, string> = {
  PUBLISHED: '#10b981',
  DRAFT: '#f59e0b',
  ARCHIVED: '#71717a',
  SUSPENDED: '#ef4444',
}

export const CHART_TOOLTIP_STYLE = {
  background: 'oklch(0.16 0.02 270)',
  border: '1px solid rgba(212, 168, 83, 0.3)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
} as const

// ════════════════════════════════════════════════════════════════════════════
// Quick Actions catalog — used by the QuickActionsPanel widget
// ════════════════════════════════════════════════════════════════════════════

export interface QuickAction {
  id: string
  label: string
  description: string
  icon: LucideIcon
  section: SectionId
  tone: 'gold' | 'emerald' | 'violet' | 'rose' | 'sky' | 'amber'
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'create-wedding',
    label: 'Créer un mariage',
    description: 'Onboarder un nouveau couple',
    icon: Heart,
    section: 'onboarding',
    tone: 'gold',
  },
  {
    id: 'import-guests',
    label: 'Importer des invités',
    description: 'Liste DOCX/CSV/XLSX',
    icon: UsersIcon,
    section: 'workspace',
    tone: 'emerald',
  },
  {
    id: 'export',
    label: 'Exporter',
    description: 'Données & rapports',
    icon: LayoutDashboard,
    section: 'analytics',
    tone: 'sky',
  },
  {
    id: 'generate-qr',
    label: 'Générer QR',
    description: 'Codes invitation',
    icon: Mail,
    section: 'invitation',
    tone: 'violet',
  },
  {
    id: 'create-invitations',
    label: 'Créer invitations',
    description: 'Templates & envoi',
    icon: Mail,
    section: 'invitation',
    tone: 'rose',
  },
  {
    id: 'publish',
    label: 'Publier',
    description: 'Activer un mariage',
    icon: Rocket,
    section: 'portfolio',
    tone: 'emerald',
  },
  {
    id: 'backup',
    label: 'Sauvegarder',
    description: 'Snapshot DB & médias',
    icon: Activity,
    section: 'observability',
    tone: 'amber',
  },
  {
    id: 'archive',
    label: 'Archiver',
    description: 'Mariage terminé → archive',
    icon: ScrollText,
    section: 'portfolio',
    tone: 'gold',
  },
]
