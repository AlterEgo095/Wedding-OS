/**
 * MISSION 5.9.5 — PHASE B
 * Presets de navigation mobile pour les 5 contextes de rôles
 * de la plateforme AENEWS.
 *
 * Chaque preset est un tableau d'items BottomNav (data pure,
 * avec référence aux composants icône Lucide).
 *
 * Contextes :
 *  1. PUBLIC_NAV       — marketing public (/, /showcase, /onboarding, /login) — 4 items
 *  2. WEDDING_PUBLIC_NAV — page mariage publique /w/[slug] — 5 items (ancres)
 *  3. WEDDING_ADMIN_NAV — admin mariage /w/[slug]/admin — 5 items (slug-paramétrique)
 *  4. PLATFORM_ADMIN_NAV — admin plateforme /platform/admin — 5 items
 *  5. ORG_ADMIN_NAV    — admin organisation /org/[slug]/admin — 4 items (slug-paramétrique)
 *
 * Convention : max 5 items par barre (ergonomie mobile — pouce reachable).
 * Labels courts (≤ 10 caractères) pour éviter la troncature visuelle.
 */

import {
  Home,
  Palette,
  Rocket,
  LogIn,
  Heart,
  CalendarClock,
  MapPin,
  BookOpen,
  LayoutDashboard,
  Users,
  CalendarDays,
  Image as ImageIcon,
  Settings,
  ScrollText,
} from 'lucide-react'
import type { BottomNavItem } from './bottom-nav'

/* ----------------------------------------------------------------
   1. PUBLIC_NAV — marketing public (4 items)
   Utilisé sur /, /showcase, /onboarding, /platform/login
---------------------------------------------------------------- */
export const PUBLIC_NAV: BottomNavItem[] = [
  { id: 'accueil', label: 'Accueil', icon: Home, href: '/' },
  { id: 'themes', label: 'Thèmes', icon: Palette, href: '/showcase' },
  { id: 'creer', label: 'Créer', icon: Rocket, href: '/onboarding' },
  { id: 'connexion', label: 'Connexion', icon: LogIn, href: '/platform/login' },
]

/* ----------------------------------------------------------------
   2. WEDDING_PUBLIC_NAV — page mariage publique (5 items, ancres)
   Utilisé sur /w/[slug] — scroll intra-page
---------------------------------------------------------------- */
export const WEDDING_PUBLIC_NAV: BottomNavItem[] = [
  { id: 'accueil', label: 'Accueil', icon: Home, anchor: '#accueil' },
  { id: 'histoire', label: 'Histoire', icon: Heart, anchor: '#histoire' },
  { id: 'programme', label: 'Programme', icon: CalendarClock, anchor: '#programme' },
  { id: 'lieu', label: 'Lieu', icon: MapPin, anchor: '#lieu' },
  { id: 'guestbook', label: 'Livre d\'or', icon: BookOpen, anchor: '#guestbook' },
]

/* ----------------------------------------------------------------
   3. WEDDING_ADMIN_NAV — admin mariage (5 items, slug-paramétrique)
   Utilisé sur /w/[slug]/admin — les 5 actions les plus utilisées
   parmi les 23 items de la sidebar desktop
---------------------------------------------------------------- */
export const WEDDING_ADMIN_NAV: (slug: string) => BottomNavItem[] = (slug) => [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: `/w/${slug}/admin`,
  },
  {
    id: 'guests',
    label: 'Invités',
    icon: Users,
    href: `/w/${slug}/admin?tab=guests`,
    badge: 243, // exemple — nombre d'invités en attente
  },
  {
    id: 'program',
    label: 'Programme',
    icon: CalendarDays,
    href: `/w/${slug}/admin?tab=program`,
  },
  {
    id: 'media',
    label: 'Galerie',
    icon: ImageIcon,
    href: `/w/${slug}/admin?tab=media`,
  },
  {
    id: 'settings',
    label: 'Réglages',
    icon: Settings,
    href: `/w/${slug}/admin?tab=settings`,
  },
]

/* ----------------------------------------------------------------
   4. PLATFORM_ADMIN_NAV — admin plateforme (5 items)
   Utilisé sur /platform/admin
---------------------------------------------------------------- */
export const PLATFORM_ADMIN_NAV: BottomNavItem[] = [
  {
    id: 'overview',
    label: 'Ensemble',
    icon: LayoutDashboard,
    href: '/platform/admin',
  },
  {
    id: 'weddings',
    label: 'Mariages',
    icon: Heart,
    href: '/platform/admin?tab=weddings',
  },
  {
    id: 'themes',
    label: 'Thèmes',
    icon: Palette,
    href: '/platform/admin?tab=themes',
  },
  {
    id: 'users',
    label: 'Utilisateurs',
    icon: Users,
    href: '/platform/admin?tab=users',
  },
  {
    id: 'audit',
    label: 'Audit',
    icon: ScrollText,
    href: '/platform/admin?tab=audit',
  },
]

/* ----------------------------------------------------------------
   5. ORG_ADMIN_NAV — admin organisation (4 items, slug-paramétrique)
   Utilisé sur /org/[slug]/admin
---------------------------------------------------------------- */
export const ORG_ADMIN_NAV: (slug: string) => BottomNavItem[] = (slug) => [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: `/org/${slug}/admin`,
  },
  {
    id: 'weddings',
    label: 'Mariages',
    icon: Heart,
    href: `/org/${slug}/admin?tab=weddings`,
  },
  {
    id: 'members',
    label: 'Membres',
    icon: Users,
    href: `/org/${slug}/admin?tab=members`,
  },
  {
    id: 'settings',
    label: 'Paramètres',
    icon: Settings,
    href: `/org/${slug}/admin?tab=settings`,
  },
]

/* ----------------------------------------------------------------
   Registre pour introspection / démo
---------------------------------------------------------------- */
export const ALL_PRESETS = {
  PUBLIC_NAV,
  WEDDING_PUBLIC_NAV,
  WEDDING_ADMIN_NAV,
  PLATFORM_ADMIN_NAV,
  ORG_ADMIN_NAV,
} as const
