'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { BottomNav, type BottomNavVariant } from './bottom-nav'
import type { BottomNavItem } from './bottom-nav'
import {
  PUBLIC_NAV,
  WEDDING_PUBLIC_NAV,
  WEDDING_ADMIN_NAV,
  PLATFORM_ADMIN_NAV,
  ORG_ADMIN_NAV,
} from './bottom-nav-presets'

/**
 * MISSION 5.9.5 — PHASE B
 * SmartBottomNav — wrapper auto-détectant le contexte de rôle via
 * le pathname, et choisissant le preset BottomNav approprié.
 *
 * Logique de détection (par ordre de priorité) :
 *  1. /platform/admin       → PLATFORM_ADMIN_NAV
 *  2. /w/[slug]/admin       → WEDDING_ADMIN_NAV(slug)
 *  3. /org/[slug]/admin     → ORG_ADMIN_NAV(slug)
 *  4. /w/[slug]             → WEDDING_PUBLIC_NAV
 *  5. fallback (/, /showcase, /onboarding, etc.) → PUBLIC_NAV
 *
 * Routes EXCLUES (la barre n'est PAS rendue) :
 *  - /platform/login (layout focused)
 *  - /platform/forgot-password, /platform/reset-password
 *  - /w/[slug]/invite/[code] (guest auth flow, full-screen)
 *  - /w/[slug]/admin/login, /org/[slug]/admin/login
 *  - Routes API, _next, etc. (jamais rendues côté client de toute façon)
 *
 * État actif :
 *  - Contextes admin : dérive de ?tab=X ou 'dashboard' par défaut
 *  - Contexte wedding public : 'accueil' par défaut (le scroll-spy est
 *    géré séparément par la page si besoin — pas critique pour la démo)
 *
 * Le composant est wrappé dans <Suspense> car useSearchParams() exige
 * un boundary CSR en Next.js 16 (App Router).
 */

/* ----------------------------------------------------------------
   Routes exclues — patterns de path
---------------------------------------------------------------- */
const EXCLUDED_PATTERNS: RegExp[] = [
  /^\/platform\/login$/,
  /^\/platform\/forgot-password/,
  /^\/platform\/reset-password/,
  /^\/w\/[^/]+\/invite\//,
  /^\/w\/[^/]+\/admin\/login/,
  /^\/org\/[^/]+\/admin\/login/,
]

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PATTERNS.some((re) => re.test(pathname))
}

/* ----------------------------------------------------------------
   Détection du contexte
---------------------------------------------------------------- */
type DetectedContext =
  | { kind: 'platform-admin' }
  | { kind: 'wedding-admin'; slug: string }
  | { kind: 'org-admin'; slug: string }
  | { kind: 'wedding-public'; slug: string }
  | { kind: 'public' }

function detectContext(pathname: string): DetectedContext | null {
  if (!pathname) return null

  // 1. Platform admin
  if (pathname.startsWith('/platform/admin')) {
    return { kind: 'platform-admin' }
  }

  // 2. Wedding admin — /w/[slug]/admin...
  const weddingAdmin = pathname.match(/^\/w\/([^/]+)\/admin(?:\/|$|\?)/)
  if (weddingAdmin) {
    return { kind: 'wedding-admin', slug: weddingAdmin[1] }
  }

  // 3. Org admin — /org/[slug]/admin...
  const orgAdmin = pathname.match(/^\/org\/([^/]+)\/admin(?:\/|$|\?)/)
  if (orgAdmin) {
    return { kind: 'org-admin', slug: orgAdmin[1] }
  }

  // 4. Wedding public — /w/[slug] (sans /admin)
  const weddingPublic = pathname.match(/^\/w\/([^/]+)(?:\/|$|\?)/)
  if (weddingPublic) {
    return { kind: 'wedding-public', slug: weddingPublic[1] }
  }

  // 5. Fallback public
  return { kind: 'public' }
}

/* ----------------------------------------------------------------
   Inner component (consomme useSearchParams — doit être dans Suspense)
---------------------------------------------------------------- */
function SmartBottomNavInner() {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()

  // Ne rien rendre sur les routes exclues
  if (isExcluded(pathname)) return null

  const ctx = detectContext(pathname)
  if (!ctx) return null

  let items: BottomNavItem[] = []
  let activeId: string | undefined
  let variant: BottomNavVariant = 'default'

  switch (ctx.kind) {
    case 'platform-admin': {
      items = PLATFORM_ADMIN_NAV
      const tab = searchParams?.get('tab')
      activeId = tab
        ? items.find((it) => it.href?.includes(`tab=${tab}`))?.id ?? 'overview'
        : 'overview'
      variant = 'default'
      break
    }
    case 'wedding-admin': {
      items = WEDDING_ADMIN_NAV(ctx.slug)
      const tab = searchParams?.get('tab')
      activeId = tab
        ? items.find((it) => it.href?.includes(`tab=${tab}`))?.id ?? 'dashboard'
        : 'dashboard'
      variant = 'default'
      break
    }
    case 'org-admin': {
      items = ORG_ADMIN_NAV(ctx.slug)
      const tab = searchParams?.get('tab')
      activeId = tab
        ? items.find((it) => it.href?.includes(`tab=${tab}`))?.id ?? 'dashboard'
        : 'dashboard'
      // Contexte org → accent émeraude pour différencier visuellement
      variant = 'emerald'
      break
    }
    case 'wedding-public': {
      items = WEDDING_PUBLIC_NAV
      // Pour le contexte public mariage, l'état actif devrait idéalement
      // suivre le scroll (scroll-spy). Pour la démo on reste sur 'accueil'.
      // La page peut surcharger en passant son propre <BottomNav activeId=...>.
      activeId = 'accueil'
      variant = 'gold'
      break
    }
    case 'public': {
      items = PUBLIC_NAV
      // Pas d'activeId forcé — dérivation automatique depuis pathname
      variant = 'default'
      break
    }
  }

  if (items.length === 0) return null

  return (
    <>
      {/* Spacer mobile-only — réserve la hauteur du BottomNav fixed pour
          éviter que le contenu en bas de page ne soit masqué sous la barre.
          Même visibilité que le BottomNav (md:hidden). */}
      <div
        aria-hidden="true"
        className="h-14 pb-safe md:hidden"
        // Hauteur = 56px (h-14) + env(safe-area-inset-bottom) via pb-safe.
        // Doit matcher la hauteur du BottomNav (h-14 + pb-safe).
      />
      <BottomNav items={items} activeId={activeId} variant={variant} />
    </>
  )
}

/* ----------------------------------------------------------------
   Export — wrapper Suspense (requis par Next.js 16 pour useSearchParams)
---------------------------------------------------------------- */
export function SmartBottomNav() {
  return (
    <React.Suspense fallback={null}>
      <SmartBottomNavInner />
    </React.Suspense>
  )
}
