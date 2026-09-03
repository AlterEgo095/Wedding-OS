// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/admin/page.tsx — Phase 3 Per-Wedding Admin Dashboard
// ══════════════════════════════════════════════════════════════════════════════
// Tenant-aware admin shell. Mirrors /admin/page.tsx exactly (same NAV_ITEMS,
// same sidebar, same mobile responsive behavior, same panels) but:
//
//   1. On mount (P1-SEC-3): call /api/me to check auth status. If 401,
//      redirect to /w/{slug}/admin/login.
//   2. Installs a GLOBAL fetch interceptor (useEffect once per slug) that wraps
//      window.fetch to auto-add the X-Wedding-Slug header on every /api/* call.
//      This lets ALL existing admin components (Dashboard, GuestManager, …)
//      work unchanged — they just call fetch('/api/…') and the interceptor
//      attaches the tenant header transparently. The interceptor also auto-
//      attaches the X-CSRF-Token header on state-changing requests (P1-SEC-7)
//      and sets credentials: 'include' so the httpOnly auth_token cookie is
//      sent automatically (P1-SEC-3).
//   3. Sidebar shows the wedding's coupleLabel + the user's name.
//   4. PLATFORM_ADMIN sees an extra "Plateforme" link to /platform/admin.
//   5. visibleNavItems filter includes PLATFORM_ADMIN for superAdminOnly tabs.
//   6. On logout / sessionExpired → clear localStorage + redirect to login.

'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Users, Grid3X3, Image as ImageIcon, Clock, Shield, Settings, LogOut,
  X, FileSearch, Music, Sparkles, Crown, Loader2, Palette, LayoutTemplate, BookOpen,
  Mail, QrCode,
  // CONS-5-CLIENT-BACKEND — icons for the 6 new organizer tabs
  Heart, Tag, Gift, CalendarDays, BarChart3,
  // P4.2 — Dietary preferences tab icon
  Utensils,
  // P4.7 — 2FA setup button (sidebar footer)
  ShieldCheck,
  // Phase 2F — context banner icons (Users already imported above; Calendar /
  // CircleCheck / MapPin cover the 4 wedding-admin context badges). ExternalLink
  // is used by the Statistics tab's NextActionCta (links to the public site).
  Calendar, CircleCheck, MapPin, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { isPlatformAdmin } from '@/lib/types';
// MISSION 5.9.2-B/C: Invitation Studio tab — no-code template selector + photo studio.
const InvitationStudioTab = dynamic(() => import('@/components/admin/InvitationStudioTab').then(m => m.InvitationStudioTab), { ssr: false });
import { useWedding } from '../wedding-context';
// Phase 4D — WhatsApp share button (used in the admin sidebar footer so the
// organizer can share the public wedding URL directly from the admin).
import { WhatsAppShare } from '@/components/wedding/WhatsAppShare';
import {
  AdminShell,
  type AdminShellSection,
  type AdminShellUser,
  type AdminShellBreadcrumb,
} from '@/components/admin/AdminShell';
import { NextActionCta } from '@/components/admin/NextActionCta';
// P4-FUSION — sub-navigation bar rendered inside fused sections (23 tabs → 10).
import { SectionTabBar } from '@/components/admin/SectionTabBar';
// Phase 4C — Impersonation banner (shown when a PLATFORM_ADMIN is
// impersonating the wedding admin via /api/platform/impersonate).
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';

import Dashboard from '@/components/admin/Dashboard';
import GuestManager from '@/components/admin/GuestManager';
import TableManager from '@/components/admin/TableManager';
import MediaManager from '@/components/admin/MediaManager';
import UserManager from '@/components/admin/UserManager';
import TimelineManager from '@/components/admin/TimelineManager';
import SettingsManager from '@/components/admin/SettingsManager';
import AccessLogManager from '@/components/admin/AccessLogManager';
import MusicManager from '@/components/admin/MusicManager';
import AppearanceManager from '@/components/admin/AppearanceManager';
import { ThemeCustomizer } from '@/components/admin/ThemeCustomizer';
import { DesignerTab } from '@/components/admin/DesignerTab';
import { CoupleStoryManager } from '@/components/admin/CoupleStoryManager';
// Mission 4.9 — wire InvitationManager + CheckInManager into the wedding admin
const InvitationManager = dynamic(() => import('@/components/admin/InvitationManager'), { ssr: false })
const CheckInManager = dynamic(() => import('@/components/admin/CheckInManager'), { ssr: false })
// CONS-5-CLIENT-BACKEND — lazy-load the 6 new organizer tab components.
const FamiliesManager = dynamic(() => import('@/components/admin/FamiliesManager'), { ssr: false })
const GroupsManager = dynamic(() => import('@/components/admin/GroupsManager'), { ssr: false })
const GiftsManager = dynamic(() => import('@/components/admin/GiftsManager'), { ssr: false })
const ProgramManager = dynamic(() => import('@/components/admin/ProgramManager'), { ssr: false })
const StatisticsPanel = dynamic(() => import('@/components/admin/StatisticsPanel'), { ssr: false })
const QRCodeManager = dynamic(() => import('@/components/admin/QRCodeManager'), { ssr: false })
// P4.2 — Dietary preferences admin stats card
import { DietaryStatsCard } from '@/components/admin/DietaryStatsCard'
// P4.7 — 2FA setup modal (reusable across all admin/staff roles)
import TwoFactorSetup from '@/components/auth/TwoFactorSetup'
// P1-9 (sprint P2): realtime widgets removed — the realtime mini-service was
// orphaned (pushRealtimeEvent had zero callers) and is being decommissioned.
import { SkeletonAdminShell } from '@/components/design-system'

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  weddingId?: string | null
}

type TabId = 'dashboard' | 'designer' | 'invitation-studio' | 'guests' | 'families' | 'groups' | 'invitations' | 'qrcodes' | 'check-in' | 'tables' | 'gifts' | 'media' | 'music' | 'timeline' | 'program' | 'dietary' | 'story' | 'stats' | 'users' | 'settings' | 'access-logs' | 'appearance' | 'theme'

interface NavItem {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  superAdminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'designer', label: 'Designer', icon: LayoutTemplate },
  // MISSION 5.9.2-B/C: Premium Invitation Studio — template selector + photo studio + live preview.
  { id: 'invitation-studio', label: 'Invitation Studio', icon: Crown },
  { id: 'guests', label: 'Invités', icon: Users },
  // CONS-5-CLIENT-BACKEND — organizer guest-grouping tabs.
  { id: 'families', label: 'Familles', icon: Heart },
  { id: 'groups', label: 'Groupes', icon: Tag },
  { id: 'invitations', label: 'Invitations', icon: Mail },
  { id: 'qrcodes', label: 'QR Codes', icon: QrCode },
  { id: 'check-in', label: 'Réception', icon: QrCode },
  { id: 'tables', label: 'Tables', icon: Grid3X3 },
  { id: 'gifts', label: 'Cadeaux', icon: Gift },
  { id: 'access-logs', label: 'Accès', icon: FileSearch },
  { id: 'media', label: 'Médias', icon: ImageIcon },
  { id: 'music', label: 'Musique', icon: Music },
  { id: 'timeline', label: 'Chronologie', icon: Clock },
  { id: 'program', label: 'Programme du jour', icon: CalendarDays },
  // P4.2 — Dietary preferences (Préférences alimentaires)
  { id: 'dietary', label: 'Préférences alimentaires', icon: Utensils },
  { id: 'story', label: 'Histoire', icon: BookOpen },
  { id: 'stats', label: 'Statistiques', icon: BarChart3 },
  { id: 'theme', label: 'Thème', icon: Palette },
  { id: 'appearance', label: 'Apparence', icon: Sparkles },
  { id: 'users', label: 'Utilisateurs', icon: Shield, superAdminOnly: true },
  { id: 'settings', label: 'Paramètres', icon: Settings, superAdminOnly: true },
]

// P4-FUSION — 10-section IA (audit ADMIN-MAP §4).
//
// The former 23-item / 6-meta-section sidebar is fused into 10 top-level
// sections following the audit's target IA:
//
//   VUE D'ENSEMBLE · CONTENU · DESIGN · INVITÉS · RSVP · ÉVÉNEMENT ·
//   MÉDIAS · LIVRAISON · ANALYTIQUE · PARAMÈTRES
//
// Contract preserved:
//   - TabId SSOT unchanged (all 23 ids intact, none renamed) — NextActionCta,
//     Dashboard CTAs and every setActiveTab caller keep working. The sub-tab
//     state IS activeTab; the section is derived from it.
//   - Zero manager component touched — sections only regroup them.
//   - superAdminOnly gating preserved (visibleNavItems filter still applies;
//     sections that would be empty after filtering are skipped).
// Sections with >1 sub-tabs render <SectionTabBar> above the content;
// single-sub-tab sections render their manager directly (zero extra chrome).

type SectionStripeColor = 'gold' | 'emerald' | 'rose' | 'violet' | 'slate';

interface NavSectionDef {
  id: string;
  label: string;
  stripeColor: SectionStripeColor;
  icon: React.ComponentType<{ className?: string }>;
  itemIds: TabId[];
}

const SECTION_DEFS: NavSectionDef[] = [
  { id: 'overview', label: "Vue d'ensemble", stripeColor: 'gold', icon: LayoutDashboard, itemIds: ['dashboard'] },
  { id: 'content', label: 'Contenu', stripeColor: 'rose', icon: BookOpen, itemIds: ['story', 'timeline', 'program', 'music', 'gifts'] },
  { id: 'design', label: 'Design', stripeColor: 'violet', icon: Palette, itemIds: ['designer', 'theme', 'appearance', 'invitation-studio'] },
  { id: 'guests', label: 'Invités', stripeColor: 'emerald', icon: Users, itemIds: ['guests', 'families', 'groups', 'dietary'] },
  { id: 'rsvp', label: 'RSVP', stripeColor: 'violet', icon: Mail, itemIds: ['invitations'] },
  { id: 'event', label: 'Événement', stripeColor: 'rose', icon: CalendarDays, itemIds: ['tables', 'check-in'] },
  { id: 'media', label: 'Médias', stripeColor: 'emerald', icon: ImageIcon, itemIds: ['media'] },
  { id: 'delivery', label: 'Livraison', stripeColor: 'gold', icon: QrCode, itemIds: ['qrcodes'] },
  { id: 'analytics', label: 'Analytique', stripeColor: 'slate', icon: BarChart3, itemIds: ['stats', 'access-logs'] },
  { id: 'settings', label: 'Paramètres', stripeColor: 'slate', icon: Settings, itemIds: ['settings', 'users'] },
]

// Generic couple-photo fallback (exists in /public for every deployment).
// Avoids assuming the current wedding owns `/uploads/couple-photo-1.jpeg`
// (which is the default wedding's asset). The couple label is already
// derived from the wedding context (`wedding.coupleLabel`), so we never
// leak the default wedding's couple identity into another tenant's admin.
const COUPLE_PHOTO_FALLBACK = '/couple-hero.jpeg'

/** Read CSRF token from cookie (for child components that make their own fetch calls) */
function getCsrfTokenFromCookie(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((row) => row.startsWith('csrf_token='))
  return match ? match.split('=').slice(1).join('=') : ''
}

export default function PerWeddingAdminPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()
  const wedding = useWedding()

  // mounted: false on SSR and during the very first client render (hydration),
  // then true once the mount effect runs. This lets us render a stable loading
  // screen during hydration and avoid mismatches.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // ─── Auth state ────────────────────────────────────────────────────────────
  // P1-SEC-3: token is no longer read from localStorage. We keep the `token`
  // state for backwards-compat with child components (Dashboard, GuestManager,
  // …) that still take a `token` prop and send `Authorization: Bearer ${token}`.
  // The value is always `''` — the server's getTokenFromRequest falls back to
  // the httpOnly auth_token cookie when the bearer value is empty.
  const [token, setToken] = useState<string>('')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [activeTab, setActiveTabState] = useState<TabId>('dashboard')
  // P4.7: 2FA setup modal — visible to ALL logged-in admin/staff users.
  const [twoFactorOpen, setTwoFactorOpen] = useState(false)
  const sessionExpiredRef = useRef(false)

  // ─── P4-FUSION tranche 4 — URL-addressable tabs (?tab=) ───────────────
  // Tab changes are mirrored into the URL via replaceState so a refresh,
  // a shared link or browser back/forward keep the operator's position.
  // The name & signature are unchanged: every existing caller
  // (handleTabChange, handleSectionChange, SectionTabBar, child props)
  // mirrors the URL automatically — single write path, no parallel state.
  const setActiveTab = useCallback((tabId: TabId) => {
    setActiveTabState(tabId)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tabId)
    window.history.replaceState({}, '', url.toString())
  }, [])

  // ─── Phase 4C — Impersonation state ──────────────────────────────────────
  // When a PLATFORM_ADMIN is impersonating a wedding admin, the
  // impersonation_session cookie is set by /api/platform/impersonate. We
  // poll /api/platform/impersonate/status on mount + on each focus to
  // decide whether to render the <ImpersonationBanner> (fixed-top amber
  // warning with a live countdown + an "Arrêter" button).
  //
  // The status response (200) carries:
  //   { impersonating, targetUser, adminUser, expiresAt, expiresAtIso, remainingMs }
  // We only render the banner when impersonating === true.
  interface ImpersonationStatus {
    impersonating: boolean
    targetUser?: { id: string; name: string; email: string; role: string }
    expiresAt?: number
    expired?: boolean
  }
  const [impersonation, setImpersonation] = useState<ImpersonationStatus | null>(null)

  // ─── Install global fetch interceptor (useLayoutEffect — runs before any
  // child useEffect, so the X-Wedding-Slug header is in place by the time
  // admin components like Dashboard, GuestManager, etc. fire their initial
  // /api/* requests. Otherwise the first fetch would silently fall back to
  // the default wedding and show wrong data.)
  //
  // P1-SEC-3: we no longer inject `Authorization: Bearer <token>` here. The
  // httpOnly auth_token cookie is sent automatically on same-origin fetches
  // (the default `credentials: 'same-origin'` setting). We DO still inject
  // the X-Wedding-Slug header for tenant scoping.
  //
  // P1-SEC-7: we also inject the X-CSRF-Token header on state-changing
  // requests (POST/PUT/DELETE/PATCH) by reading the csrf_token cookie
  // (httpOnly=false, set by login or /api/csrf-token).
  useLayoutEffect(() => {
    const originalFetch = window.fetch
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.startsWith('/api/')) {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        )
        // Auto-attach the wedding slug for tenant scoping (existing behavior)
        if (!headers.has('X-Wedding-Slug')) {
          headers.set('X-Wedding-Slug', slug)
        }
        // P1-SEC-7: auto-attach CSRF token on state-changing requests.
        // Reads from the csrf_token cookie (httpOnly=false). If the cookie
        // is missing (e.g. user navigated here without going through login
        // — unlikely but possible), the server will reject with 403.
        const method = (init?.method || 'GET').toUpperCase()
        const isStateChanging =
          method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH'
        if (isStateChanging && !headers.has('X-CSRF-Token')) {
          const csrfMatch = document.cookie
            .split('; ')
            .find((row) => row.startsWith('csrf_token='))
          if (csrfMatch) {
            const csrfToken = csrfMatch.split('=').slice(1).join('=')
            if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
          }
        }
        // P1-SEC-3: ensure credentials are included so the httpOnly auth
        // cookie is sent.
        init = { ...init, headers, credentials: 'include' }
      }
      return originalFetch(input as RequestInfo, init)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [slug])

  // ─── Mount: check auth via /api/me. If not authed, redirect to login.
  // (Separate from the interceptor so the interceptor installs synchronously
  // regardless of auth state.)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data?.user) {
            setUser(data.user as AuthUser)
            setToken('') // empty — server uses cookie
            try {
              localStorage.setItem('admin_user', JSON.stringify(data.user))
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* network error — leave user as null */
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Redirect to login if not authenticated (after the /api/me check completes).
  // Mission 5.3.2: Also deny access if an ORGANIZER tries to open a foreign wedding admin.
  // PLATFORM_ADMIN/SUPER_ADMIN can access any wedding. ORGANIZER must match their own weddingId.
  useEffect(() => {
    if (!authChecked) return
    if (!user) {
      router.replace(`/w/${slug}/admin/login`)
      return
    }
    // Tenant authorization check: non-platform-admins can only access their own wedding
    if (!isPlatformAdmin(user.role) && user.weddingId !== wedding.id) {
      // Foreign admin access denied — redirect to their own admin
      toast.error("Vous n'avez pas accès à cet événement.")
      if (user.weddingId) {
        // Redirect to their own wedding admin
        const ownSlug = slug // fallback — can't easily resolve their slug here
        // Use the wedding context to find their own slug
        // Since we can't resolve their slug from weddingId alone client-side,
        // redirect to /platform/admin or show access denied
        router.replace('/platform/admin')
      } else {
        router.replace('/')
      }
    }
  }, [authChecked, user, slug, router, wedding.id])

  // ─── P4-FUSION tranche 4 — deep-link seed (?tab=<id>) ─────────────────
  // The URL is the SSOT for the active tab. A ?tab=<id> present at load
  // selects that tab once auth resolves. Ids hidden for the current role
  // (superAdminOnly) are ignored — same rule as the sidebar's
  // visibleNavItems filter, so a non-superadmin can never be dropped onto
  // a hidden tab via a crafted link.
  useEffect(() => {
    if (!authChecked || !user) return
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (!requested) return
    const visible = NAV_ITEMS.some(
      (item) => item.id === requested &&
        (!item.superAdminOnly || isPlatformAdmin(user?.role || ''))
    )
    if (visible) setActiveTabState(requested as TabId)
  }, [authChecked, user])

  // Browser back/forward between ?tab= states follows the URL (raw state —
  // the URL already carries the tab, no replaceState needed).
  useEffect(() => {
    if (!authChecked || !user) return
    const onPopState = () => {
      const requested = new URLSearchParams(window.location.search).get('tab')
      if (!requested) return
      const visible = NAV_ITEMS.some(
        (item) => item.id === requested &&
          (!item.superAdminOnly || isPlatformAdmin(user?.role || ''))
      )
      if (visible) setActiveTabState(requested as TabId)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [authChecked, user])

  // ─── Phase 4C — Check impersonation status on mount ───────────────────────
  // Fires once after auth check completes. If impersonating, the banner
  // renders fixed-top with a countdown; the rest of the admin shell is
  // pushed down by ~banner height via padding-top on the outer wrapper.
  //
  // We also re-check on window focus so a banner that was started in
  // another tab is picked up when the admin returns to this tab.
  useEffect(() => {
    if (!authChecked || !user) return
    let cancelled = false

    const checkImpersonation = async () => {
      try {
        const res = await fetch('/api/platform/impersonate/status', {
          credentials: 'include',
        })
        if (cancelled) return
        if (res.ok) {
          const data = (await res.json()) as ImpersonationStatus
          setImpersonation(data)
        } else {
          setImpersonation({ impersonating: false })
        }
      } catch {
        if (!cancelled) setImpersonation({ impersonating: false })
      }
    }

    checkImpersonation()
    window.addEventListener('focus', checkImpersonation)
    return () => {
      cancelled = true
      window.removeEventListener('focus', checkImpersonation)
    }
  }, [authChecked, user])

  // Phase 4C — Stop impersonation handler (called by the banner's "Arrêter"
  // button + by the countdown auto-expiry). POSTs to /stop, then redirects
  // to /platform/admin. The server restores the admin's auth_token cookie
  // from the impersonation_session's embedded originalToken + clears the
  // impersonation cookie. On failure, we still redirect to /platform/admin
  // (the middleware's auto-expiry will clean up the cookies on the next
  // request — the admin's session is never lost).
  const handleStopImpersonation = useCallback(async () => {
    try {
      await fetch('/api/platform/impersonate/stop', {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      /* ignore — redirect anyway, middleware will clean up */
    }
    toast.success("Session d'impersonation terminée")
    router.replace('/platform/admin')
  }, [router])

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = useCallback(
    async (showMessage = true) => {
      // Best-effort server-side logout (clears httpOnly + CSRF cookies).
      try {
        await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem('admin_token') // legacy cleanup (no-op if empty)
        localStorage.removeItem('admin_user')
      } catch {
        /* ignore */
      }
      setToken('')
      setUser(null)
      if (showMessage) toast.success('Déconnexion réussie')
      router.replace(`/w/${slug}/admin/login`)
    },
    [slug, router]
  )

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    try {
      localStorage.removeItem('admin_token') // legacy cleanup
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    setToken('')
    setUser(null)
    toast.error('Session expirée, veuillez vous reconnecter')
    router.replace(`/w/${slug}/admin/login`)
  }, [slug, router])

  // ─── fetchWithAuth ─────────────────────────────────────────────────────────
  // P4.2: DietaryStatsCard (and future P4 components) use the same fetchWithAuth
  // signature as platform/admin. We wrap fetch() with credentials + auto-401
  // handling. The global fetch interceptor (installed above) already attaches
  // X-Wedding-Slug + X-CSRF-Token on /api/* requests, so this wrapper just
  // adds the auth-state side effects (toast on error, redirect on 401).
  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response | null> => {
      try {
        const res = await fetch(url, { ...init, credentials: 'include' })
        if (res.status === 401) {
          handleSessionExpired()
          return null
        }
        if (res.status === 403) {
          try {
            const body = await res.clone().json()
            toast.error(body?.error || 'Accès refusé')
          } catch {
            toast.error('Accès refusé')
          }
          return null
        }
        return res
      } catch {
        toast.error('Erreur de connexion au serveur')
        return null
      }
    },
    [handleSessionExpired]
  )

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId)
  }, [])

  // PLATFORM_ADMIN and SUPER_ADMIN both see the superAdminOnly tabs.
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || isPlatformAdmin(user?.role || '')
  )

  // ─── P4-FUSION — derived section state ──────────────────────────────
  // The section is DERIVED from activeTab (no parallel state to desync).
  // Fallback guarantees a defined section for any TabId.
  const activeSectionDef =
    SECTION_DEFS.find((s) => s.itemIds.includes(activeTab)) ?? SECTION_DEFS[0]

  const handleSectionChange = useCallback(
    (sectionId: string) => {
      const def = SECTION_DEFS.find((s) => s.id === sectionId)
      if (!def) return
      // Land on the first VISIBLE sub-tab (superAdminOnly gating-aware).
      const firstVisible = def.itemIds.find((id) =>
        visibleNavItems.some((v) => v.id === id)
      )
      if (firstVisible) setActiveTab(firstVisible)
    },
    [visibleNavItems]
  )

  const renderContent = () => {
    if (!user) return null

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard token={token} onSessionExpired={handleSessionExpired} />
      case 'guests':
        return (
          <div className="space-y-6">
            <GuestManager token={token} onSessionExpired={handleSessionExpired} />
            <NextActionCta
              label="Prochaine étape: Créer des invitations"
              href="#invitations"
              icon={<Mail className="w-4 h-4" />}
              onClick={() => handleTabChange('invitations')}
            />
          </div>
        )
      case 'tables':
        return <TableManager token={token} onSessionExpired={handleSessionExpired} />
      case 'media':
        return <MediaManager token={token} onSessionExpired={handleSessionExpired} />
      case 'music':
        return <MusicManager token={token} onSessionExpired={handleSessionExpired} />
      case 'timeline':
        return <TimelineManager token={token} onSessionExpired={handleSessionExpired} />
      case 'users':
        return <UserManager token={token} userRole={user?.role || ''} onSessionExpired={handleSessionExpired} />
      case 'access-logs':
        return <AccessLogManager token={token} onSessionExpired={handleSessionExpired} />
      case 'invitations':
        return (
          <div className="space-y-6">
            <InvitationManager weddingId={wedding.id} weddingSlug={slug} csrfToken={getCsrfTokenFromCookie()} />
            <NextActionCta
              label="Prochaine étape: Générer les QR codes"
              href="#qrcodes"
              icon={<QrCode className="w-4 h-4" />}
              onClick={() => handleTabChange('qrcodes')}
            />
          </div>
        )
      case 'check-in':
        // P1-9 (sprint P2): the LiveCheckInFeed that used to sit above
        // CheckInManager was removed with the orphaned realtime pipeline.
        return (
          <div className="space-y-6">
            <CheckInManager weddingSlug={slug} csrfToken={getCsrfTokenFromCookie()} />
            <NextActionCta
              label="Prochaine étape: Voir les statistiques"
              href="#stats"
              icon={<BarChart3 className="w-4 h-4" />}
              onClick={() => handleTabChange('stats')}
            />
          </div>
        )
      case 'settings':
        return <SettingsManager token={token} userRole={user?.role || ''} onSessionExpired={handleSessionExpired} />
      case 'theme':
        // Consolidation fix: mount ThemeCustomizer in the tenant admin so couples
        // can edit their own wedding's colors + fonts. The explicit `slug` prop
        // bypasses the platform-admin wedding picker and scopes all /api/theme
        // calls to this wedding via the fetch interceptor installed above.
        return <ThemeCustomizer slug={slug} />
      case 'invitation-studio':
        // MISSION 5.9.2-B/C: Premium Invitation Studio — no-code template + photo + preview.
        return (
          <InvitationStudioTab
            weddingId={wedding.id}
            weddingSlug={slug}
            csrfToken={getCsrfTokenFromCookie()}
            onSessionExpired={handleSessionExpired}
          />
        )
      case 'designer':
        // Slice 2: Real Experience Builder — controls sections, theme, collection.
        // Phase 4B: pass userRole (for the quality gate override button) +
        // onNavigateToTab (so the scorecard's "Corriger" buttons can deep-link
        // into the relevant admin tab — e.g. 'media' to upload more gallery
        // images, 'theme' to customize the brand, etc.).
        return (
          <DesignerTab
            weddingId={wedding.id}
            weddingSlug={slug}
            userRole={user?.role || ''}
            onNavigateToTab={(tabId) => handleTabChange(tabId as TabId)}
          />
        )
      case 'story':
        // Slice 4: Couple Story admin CRUD — API already existed, UI was missing
        return <CoupleStoryManager weddingSlug={slug} />
      case 'appearance':
        return <AppearanceManager token={token} onSessionExpired={handleSessionExpired} />
      // CONS-5-CLIENT-BACKEND — 6 new organizer tab cases.
      case 'families':
        return <FamiliesManager weddingId={wedding.id} />
      case 'groups':
        return <GroupsManager weddingId={wedding.id} />
      case 'gifts':
        return <GiftsManager weddingId={wedding.id} />
      case 'program':
        return <ProgramManager weddingId={wedding.id} />
      // P4.2 — Dietary preferences stats card
      case 'dietary':
        return <DietaryStatsCard weddingId={wedding.id} fetchWithAuth={fetchWithAuth} />
      case 'stats':
        return (
          <div className="space-y-6">
            <StatisticsPanel weddingId={wedding.id} />
            <NextActionCta
              label="Prochaine étape: Partager le site"
              href={`/w/${slug}`}
              icon={<ExternalLink className="w-4 h-4" />}
            />
          </div>
        )
      case 'qrcodes':
        return (
          <div className="space-y-6">
            <QRCodeManager weddingId={wedding.id} weddingSlug={slug} />
            <NextActionCta
              label="Prochaine étape: Activer le check-in"
              href="#check-in"
              icon={<QrCode className="w-4 h-4" />}
              onClick={() => handleTabChange('check-in')}
            />
          </div>
        )
      default:
        return <Dashboard token={token} onSessionExpired={handleSessionExpired} />
    }
  }

  const activeNavItem = visibleNavItems.find((item) => item.id === activeTab)
  const coupleLabel = wedding.coupleLabel || slug

  // ─── Loading screen during SSR / hydration / pre-auth-check window ──────────
  // NOTE: `token` is intentionally NOT part of this gate. Under cookie-based
  // auth (P1-SEC-3) `token` is always the empty string — the server reads the
  // httpOnly auth_token cookie. Gating on `!token` would permanently trap the
  // page on this loading screen. The real auth gate is `!user` (populated from
  // /api/me) — once authChecked is true, user is either set (show admin) or
  // null (the redirect effect sends the visitor to the login page).
  if (!mounted || !authChecked || !user) {
    return <SkeletonAdminShell accent="gold" className="min-h-screen rounded-none border-0" />
  }

  // ─── Build <AdminShell> props ──────────────────────────────────────────────
  // Phase 1D: chrome extracted into the reusable <AdminShell> primitive.
  // P4-FUSION: the sidebar renders the 10 top-level sections as a flat nav
  // (one item per section — no section headers). Sub-navigation lives in the
  // content area via <SectionTabBar>. The visibleNavItems filter
  // (superAdminOnly gating for non-platform-admins) is preserved — sections
  // that would be empty after filtering are skipped.

  const sections: AdminShellSection[] = SECTION_DEFS.map((sectionDef): AdminShellSection | null => {
    const sectionItems = sectionDef.itemIds
      .map((id) => visibleNavItems.find((item) => item.id === id))
      .filter((item): item is NavItem => item !== undefined)
    if (sectionItems.length === 0) return null
    return {
      id: `sec-${sectionDef.id}`,
      label: undefined, // flat top-level nav — no section header
      stripeColor: sectionDef.stripeColor,
      items: [
        {
          href: `#sec-${sectionDef.id}`,
          label: sectionDef.label,
          icon: <sectionDef.icon className="w-4 h-4 shrink-0" />,
          active: activeSectionDef.id === sectionDef.id,
          onNavigate: () => handleSectionChange(sectionDef.id),
          superAdminOnly: sectionItems.every((item) => item.superAdminOnly),
        },
      ],
    }
  }).filter((section): section is AdminShellSection => section !== null)

  const brand = (
    <div className="p-4 flex items-center gap-3">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full gold-border p-[2px] overflow-hidden">
          <Image
            src={COUPLE_PHOTO_FALLBACK}
            alt={coupleLabel}
            width={40}
            height={40}
            className="w-full h-full rounded-full object-cover"
          />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-sm gold-gradient font-display truncate" title={coupleLabel}>
          {coupleLabel}
        </h2>
        <p className="text-xs text-muted-foreground truncate">
          {user?.name || 'Non connecté'}
        </p>
      </div>
    </div>
  )

  // ─── Context banner (Phase 2F — prominent 4-badge row) ──────────────────
  // Renders above the nav with a gold-tinted background. 4 badges:
  //   👤 CoupleLabel  📅 Wedding date  ✅ Status  📍 VenueCity
  // Status badge color: emerald (PUBLISHED) / amber (DRAFT) / rose (ARCHIVED).
  // Date + VenueCity badges are conditionally rendered (skipped when null).
  const statusUpper = (wedding.status || '').toUpperCase()
  const statusColorClass =
    statusUpper === 'PUBLISHED' ? 'text-emerald-400'
    : statusUpper === 'DRAFT' ? 'text-amber-400'
    : statusUpper === 'ARCHIVED' ? 'text-rose-400'
    : 'text-gold'
  const statusLabel =
    statusUpper === 'PUBLISHED' ? 'Publié'
    : statusUpper === 'DRAFT' ? 'Brouillon'
    : statusUpper === 'ARCHIVED' ? 'Archivé'
    : (wedding.status || '—')

  const contextBanner = (
    <div className="px-4 py-3 bg-gold/5 border-b border-gold/20 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      <div className="flex items-center gap-1.5 min-w-0" title={`Couple: ${coupleLabel}`}>
        <Users className="w-3.5 h-3.5 text-gold shrink-0" />
        <span className="truncate font-medium">{coupleLabel}</span>
      </div>
      {wedding.weddingDate && (
        <div className="flex items-center gap-1.5 min-w-0" title="Date du mariage">
          <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
          <span className="truncate">
            {new Date(wedding.weddingDate).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      )}
      <div className="flex items-center gap-1.5 min-w-0" title={`Statut: ${statusLabel}`}>
        <CircleCheck className={`w-3.5 h-3.5 shrink-0 ${statusColorClass}`} />
        <span className={`truncate ${statusColorClass}`}>{statusLabel}</span>
      </div>
      {wedding.venueCity && (
        <div className="flex items-center gap-1.5 min-w-0" title={`Lieu: ${wedding.venueCity}`}>
          <MapPin className="w-3.5 h-3.5 text-gold shrink-0" />
          <span className="truncate">{wedding.venueCity}</span>
        </div>
      )}
    </div>
  )

  // ─── Breadcrumbs (updated P4-FUSION) ─────────────────────────────────────────────
  // CoupleLabel (link) > Section label > Sub-tab label (only when the section
  // has >1 visible sub-tabs — for single-sub-tab sections the section label
  // IS the page). The last breadcrumb is the current page — rendered with
  // text-gold (no link).
  const visibleSubTabs = activeSectionDef.itemIds.filter((id) =>
    visibleNavItems.some((v) => v.id === id)
  )
  const breadcrumbs: AdminShellBreadcrumb[] = [
    { label: coupleLabel, href: `/w/${slug}/admin` },
    ...(visibleSubTabs.length > 1
      ? [
          { label: activeSectionDef.label },
          { label: activeNavItem?.label || activeSectionDef.label },
        ]
      : [{ label: activeSectionDef.label }]),
  ]

  // Phase 4D — Pre-format the wedding date + venue for the WhatsAppShare
  // button in the sidebar footer. The wedding context exposes weddingDate as
  // an ISO string (or null), so we format it client-side to "26 juin 2026"
  // (fr-FR long-month format). Venue is composed from venueName + venueCity
  // like the InvitationSection does on the public page. We compute these once
  // per render — cheap (no DB call, just a Date parse + locale format).
  const adminShareDate = wedding.weddingDate
    ? new Date(wedding.weddingDate).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : undefined;
  const adminShareVenue = [wedding.venueName, wedding.venueCity]
    .filter(Boolean)
    .join(' • ') || undefined;

  const sidebarFooter = (
    <>
      <Button
        variant="ghost"
        className="w-full justify-start text-gold hover:text-gold hover:bg-gold/10 text-sm mb-1"
        onClick={() => setTwoFactorOpen(true)}
      >
        <ShieldCheck className="w-4 h-4 mr-2" />
        Sécurité 2FA
      </Button>
      {isPlatformAdmin(user.role) && (
        <Button
          variant="ghost"
          asChild
          className="w-full justify-start text-gold hover:text-gold hover:bg-gold/10 text-sm mb-1"
        >
          <Link href="/platform/admin">
            <Crown className="w-4 h-4 mr-2" />
            Plateforme
          </Link>
        </Button>
      )}
      {/* Phase 4D — "Partager l'invitation" quick action. Renders the same
          <WhatsAppShare> component used on the public wedding page (Invitation
          Section + CtaSection), so the organizer can share the PUBLIC wedding
          URL (no invite token — they're sharing the bare site link, not a
          personalized invitation). The button fires the same
          /api/w/share-event audit-log POST, so shares from the admin are
          tracked in the same audit trail as shares from guests. */}
      <WhatsAppShare
        weddingSlug={slug}
        weddingNames={coupleLabel}
        weddingDate={adminShareDate}
        venue={adminShareVenue}
        variant="ghost"
        size="sm"
        label="Partager l'invitation"
        className="w-full justify-start text-sm mb-1"
      />
      <Button
        variant="ghost"
        className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 text-sm"
        onClick={() => handleLogout()}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Déconnexion
      </Button>
      <Button
        variant="ghost"
        asChild
        className="w-full justify-start text-muted-foreground hover:text-foreground text-sm mt-1"
      >
        <Link href={`/w/${slug}`}>
          <X className="w-4 h-4 mr-2" />
          Retour au site
        </Link>
      </Button>
    </>
  )

  const mobileBottomBar = (
    <nav className="md:hidden shrink-0 flex items-center border-t border-white/10 bg-white/[0.02] safe-area-pb">
      {SECTION_DEFS.slice(0, 5).map((def) => {
        const isActive = activeSectionDef.id === def.id
        return (
          <button
            key={def.id}
            onClick={() => handleSectionChange(def.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive ? 'text-gold' : 'text-muted-foreground'
            }`}
          >
            <def.icon className="w-5 h-5" />
            <span className="truncate text-[10px]">{def.label}</span>
          </button>
        )
      })}
    </nav>
  )

  const topBarRight = (
    <Button
      variant="ghost"
      asChild
      size="sm"
      className="text-muted-foreground hover:text-foreground text-xs"
    >
      <Link href={`/w/${slug}`}>
        <X className="w-4 h-4 mr-1" />
        Retour au site
      </Link>
    </Button>
  )

  // P4-FUSION: the page title shows the SECTION (the stable top-level place),
  // not the sub-tab — the sub-tab bar below (when present) carries the
  // in-section position.
  const pageTitle = (
    <>
      <activeSectionDef.icon className="w-4 h-4 text-gold shrink-0" />
      <h1 className="font-semibold text-sm truncate">{activeSectionDef.label}</h1>
    </>
  )

  const shellUser: AdminShellUser = {
    name: user.name,
    email: user.email,
    // Wedding admin shows the raw role string (preserves existing visual).
    roleLabel: user.role,
    avatarInitial: user.name.charAt(0).toUpperCase(),
  }

  // ─── Phase 4C — Impersonation banner rendering ──────────────────────────
  // The banner is `position: fixed; top: 0` and overlays the AdminShell.
  // We add top padding to the outer wrapper when impersonating so the
  // banner doesn't cover the top bar / sidebar brand. The banner's height
  // is ~48px on desktop (single row) — we use a slightly larger padding
  // (52px) to add a small visual gap. On mobile the banner wraps to 2
  // rows; the padding is also fine (the content scrolls underneath).
  const isImpersonating =
    !!impersonation &&
    impersonation.impersonating === true &&
    !!impersonation.targetUser &&
    typeof impersonation.expiresAt === 'number'

  return (
    <>
      {isImpersonating && impersonation?.targetUser && impersonation.expiresAt && (
        <ImpersonationBanner
          targetName={impersonation.targetUser.name}
          targetRole={impersonation.targetUser.role}
          expiresAt={impersonation.expiresAt}
          onStop={handleStopImpersonation}
        />
      )}
      <div className={isImpersonating ? 'pt-[52px]' : ''}>
        <AdminShell
          sections={sections}
          user={shellUser}
          contextBanner={contextBanner}
          brand={brand}
          sidebarFooter={sidebarFooter}
          sidebarWidth="w-64"
          pageTitle={pageTitle}
          breadcrumbs={breadcrumbs}
          topBarRight={topBarRight}
          mobileBottomBar={mobileBottomBar}
        >
          {/* P4-FUSION — sub-tab bar for multi-manager sections (rendered
              OUTSIDE AnimatePresence so switching sub-tabs doesn't remount
              the bar itself). Single-sub-tab sections render no bar. */}
          <SectionTabBar
            consoleId="wedding"
            items={visibleSubTabs.map((id) => ({
              id,
              label: NAV_ITEMS.find((n) => n.id === id)?.label || id,
            }))}
            activeId={activeTab}
            onChange={handleTabChange}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="min-h-full"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </AdminShell>
      </div>

      {/* P4.7 — 2FA setup modal (accessible from the sidebar footer) */}
      <TwoFactorSetup
        open={twoFactorOpen}
        onOpenChange={setTwoFactorOpen}
        onSuccess={() => {
          setTwoFactorOpen(false)
          toast.success('2FA activée avec succès')
        }}
      />
    </>
  )
}
