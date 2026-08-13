/**
 * MISSION 5.9.5 — PHASE E
 * Presets d'actions rapides (FAB) pour les 6 contextes de rôles
 * de la plateforme AENEWS.
 *
 * Chaque preset est un tableau d'objets `FabAction` (data pure,
 * avec référence aux composants icône Lucide).
 *
 * Server-safe : pas de `'use client'`, pas d'imports React hooks,
 * seulement des données + des références d'icônes (composants Lucide
 * sont des values runtime mais peuvent être sérialisées en RSC payload).
 *
 * Contextes :
 *  1. PUBLIC_FAB_ACTIONS          — marketing public (/, /showcase) — 3 actions
 *  2. WEDDING_PUBLIC_FAB_ACTIONS  — page mariage publique /w/[slug] — 3 actions (ancres)
 *  3. WEDDING_ADMIN_FAB_ACTIONS   — admin mariage /w/[slug]/admin — 3 actions
 *  4. PLATFORM_ADMIN_FAB_ACTIONS  — admin plateforme /platform/admin — 3 actions
 *  5. ORG_ADMIN_FAB_ACTIONS       — admin organisation /org/[slug]/admin — 3 actions
 *
 * Convention : max 3-5 actions par FAB (ergonomie mobile — éviter le scroll).
 * Labels courts (≤ 22 caractères) pour rester lisible dans le menu expandable.
 */

import {
  Plus,
  Users,
  MessageSquare,
  Upload,
  FileText,
  Settings,
  CreditCard,
  UserPlus,
  Heart,
  Table as TableIcon,
  LogIn,
  Sparkles,
} from 'lucide-react'
import type { FabAction } from './fab'

/* ----------------------------------------------------------------
   1. PUBLIC_FAB_ACTIONS — marketing public
   Utilisé sur /, /showcase (et /onboarding, /org/signup avec accent blush)
---------------------------------------------------------------- */
export const PUBLIC_FAB_ACTIONS: FabAction[] = [
  {
    id: 'create-event',
    label: 'Créer un événement',
    icon: Plus,
    href: '/onboarding',
    accent: 'gold',
  },
  {
    id: 'view-themes',
    label: 'Voir les thèmes',
    icon: Sparkles,
    href: '/showcase',
    accent: 'blush',
  },
  {
    id: 'login',
    label: 'Connexion',
    icon: LogIn,
    href: '/platform/login',
    accent: 'default',
  },
]

/* ----------------------------------------------------------------
   2. WEDDING_PUBLIC_FAB_ACTIONS — page mariage publique
   Utilisé sur /w/[slug] — actions pour l'invité
---------------------------------------------------------------- */
export const WEDDING_PUBLIC_FAB_ACTIONS = (slug: string): FabAction[] => [
  {
    id: 'find-table',
    label: 'Trouver ma table',
    icon: TableIcon,
    href: `/w/${slug}#tables`,
    accent: 'blush',
  },
  {
    id: 'confirm-rsvp',
    label: 'Confirmer ma présence',
    icon: Heart,
    href: `/w/${slug}#rsvp`,
    accent: 'blush',
  },
  {
    id: 'guestbook',
    label: 'Livre d\'or',
    icon: MessageSquare,
    href: `/w/${slug}#guestbook`,
    accent: 'gold',
  },
]

/* ----------------------------------------------------------------
   3. WEDDING_ADMIN_FAB_ACTIONS — admin mariage
   Utilisé sur /w/[slug]/admin — actions de gestion rapide
---------------------------------------------------------------- */
export const WEDDING_ADMIN_FAB_ACTIONS = (slug: string): FabAction[] => [
  {
    id: 'add-guest',
    label: 'Ajouter un invité',
    icon: UserPlus,
    href: `/w/${slug}/admin?tab=guests&action=add`,
    accent: 'gold',
  },
  {
    id: 'new-message',
    label: 'Nouveau message',
    icon: MessageSquare,
    href: `/w/${slug}/admin?tab=guestbook`,
    accent: 'blush',
  },
  {
    id: 'import-csv',
    label: 'Importer CSV',
    icon: Upload,
    href: `/w/${slug}/admin?tab=guests&action=import`,
    accent: 'default',
  },
]

/* ----------------------------------------------------------------
   4. PLATFORM_ADMIN_FAB_ACTIONS — admin plateforme
   Utilisé sur /platform/admin
---------------------------------------------------------------- */
export const PLATFORM_ADMIN_FAB_ACTIONS: FabAction[] = [
  {
    id: 'create-wedding',
    label: 'Créer un mariage',
    icon: Plus,
    href: '/platform/admin?tab=weddings&action=new',
    accent: 'gold',
  },
  {
    id: 'new-admin',
    label: 'Nouvel admin',
    icon: UserPlus,
    href: '/platform/admin?tab=admins&action=new',
    accent: 'emerald',
  },
  {
    id: 'report',
    label: 'Rapport',
    icon: FileText,
    href: '/platform/admin?tab=reports',
    accent: 'default',
  },
]

/* ----------------------------------------------------------------
   5. ORG_ADMIN_FAB_ACTIONS — admin organisation
   Utilisé sur /org/[slug]/admin
---------------------------------------------------------------- */
export const ORG_ADMIN_FAB_ACTIONS = (slug: string): FabAction[] => [
  {
    id: 'invite-member',
    label: 'Inviter membre',
    icon: UserPlus,
    href: `/org/${slug}/admin/members?action=invite`,
    accent: 'emerald',
  },
  {
    id: 'buy-credits',
    label: 'Acheter crédits',
    icon: CreditCard,
    href: `/org/${slug}/admin/buy-credits`,
    accent: 'gold',
  },
  {
    id: 'settings',
    label: 'Paramètres',
    icon: Settings,
    href: `/org/${slug}/admin/settings`,
    accent: 'default',
  },
]

/* ----------------------------------------------------------------
   Registre pour introspection / démo
---------------------------------------------------------------- */
export const ALL_FAB_PRESETS = {
  PUBLIC_FAB_ACTIONS,
  WEDDING_PUBLIC_FAB_ACTIONS,
  WEDDING_ADMIN_FAB_ACTIONS,
  PLATFORM_ADMIN_FAB_ACTIONS,
  ORG_ADMIN_FAB_ACTIONS,
} as const

/* ----------------------------------------------------------------
   Helper — getFabActionsForContext
   Miroir de la logique de détection de SmartBottomNav.
   Prend un pathname, retourne les actions FAB appropriées, ou null
   si la route est exclue (login, invite flow, etc.).
---------------------------------------------------------------- */

// Routes exclues — patterns de path (même logique que SmartBottomNav)
const FAB_EXCLUDED_PATTERNS: RegExp[] = [
  /^\/platform\/login$/,
  /^\/platform\/forgot-password/,
  /^\/platform\/reset-password/,
  /^\/w\/[^/]+\/invite\//,
  /^\/w\/[^/]+\/admin\/login/,
  /^\/org\/[^/]+\/admin\/login/,
]

export function getFabActionsForContext(pathname: string): FabAction[] | null {
  if (!pathname) return null
  // Excluded routes → pas de FAB
  if (FAB_EXCLUDED_PATTERNS.some((re) => re.test(pathname))) return null

  // 1. Platform admin
  if (pathname.startsWith('/platform/admin')) {
    return PLATFORM_ADMIN_FAB_ACTIONS
  }

  // 2. Wedding admin — /w/[slug]/admin...
  const weddingAdmin = pathname.match(/^\/w\/([^/]+)\/admin(?:\/|$|\?)/)
  if (weddingAdmin) {
    return WEDDING_ADMIN_FAB_ACTIONS(weddingAdmin[1])
  }

  // 3. Org admin — /org/[slug]/admin...
  const orgAdmin = pathname.match(/^\/org\/([^/]+)\/admin(?:\/|$|\?)/)
  if (orgAdmin) {
    return ORG_ADMIN_FAB_ACTIONS(orgAdmin[1])
  }

  // 4. Wedding public — /w/[slug] (sans /admin)
  const weddingPublic = pathname.match(/^\/w\/([^/]+)(?:\/|$|\?)/)
  if (weddingPublic) {
    return WEDDING_PUBLIC_FAB_ACTIONS(weddingPublic[1])
  }

  // 5. Onboarding / org signup — création d'événement (romantique)
  if (pathname.startsWith('/onboarding') || pathname.startsWith('/org/signup')) {
    return PUBLIC_FAB_ACTIONS
  }

  // 6. Fallback public — /, /showcase, etc.
  return PUBLIC_FAB_ACTIONS
}
