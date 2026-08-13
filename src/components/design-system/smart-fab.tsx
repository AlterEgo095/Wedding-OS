'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Plus, Heart } from 'lucide-react'
import { FAB, type FabAccent } from './fab'
import { getFabActionsForContext } from './fab-presets'

/**
 * MISSION 5.9.5 — PHASE E
 * SmartFAB — wrapper auto-détectant le contexte de rôle via le pathname,
 * et choisissant le preset FAB approprié.
 *
 * Miroir de la logique de SmartBottomNav (même détection, mêmes routes
 * exclues) — mais pour les ACTIONS RAPIDES (vs navigation).
 *
 * Logique de détection (par ordre de priorité) :
 *  1. /platform/admin       → PLATFORM_ADMIN_FAB_ACTIONS (emerald, Plus)
 *  2. /w/[slug]/admin       → WEDDING_ADMIN_FAB_ACTIONS(slug) (gold, Plus)
 *  3. /org/[slug]/admin     → ORG_ADMIN_FAB_ACTIONS(slug) (emerald, Plus)
 *  4. /w/[slug]             → WEDDING_PUBLIC_FAB_ACTIONS(slug) (blush, Heart)
 *  5. /onboarding, /org/signup → PUBLIC_FAB_ACTIONS (blush, Plus)
 *  6. fallback (/, /showcase) → PUBLIC_FAB_ACTIONS (gold, Plus)
 *
 * Routes EXCLUES (pas de FAB) — miroir de SmartBottomNav :
 *  - /platform/login, /platform/forgot-password, /platform/reset-password
 *  - /w/[slug]/invite/[code] (guest auth flow)
 *  - /w/[slug]/admin/login, /org/[slug]/admin/login
 *
 * Le composant est wrappé dans <Suspense> car les futurs usages pourraient
 * consommer useSearchParams (deep links `?action=add`) — belt-and-suspenders.
 *
 * Position : bottom-20 right-4 mobile-only (au-dessus du BottomNav fixed
 * h-14 + pb-safe). md:hidden (desktop a sidebar/drawer pour actions).
 * !fixed !z-50 pour override cascade layers (même pattern que BottomNav).
 */

/* ----------------------------------------------------------------
   Inner component — détection contexte + render FAB
---------------------------------------------------------------- */
function SmartFABInner() {
  const pathname = usePathname() ?? ''

  // Récupère les actions via le helper partagé (server-safe).
  // Si null → route exclue → on ne rend pas le FAB.
  const actions = getFabActionsForContext(pathname)
  if (!actions || actions.length === 0) return null

  // Détermine l'accent + l'icône principale selon le contexte
  let accent: FabAccent = 'gold'
  let MainIcon: React.ComponentType<{ className?: string }> = Plus

  // 1. Platform admin → emerald, Plus
  if (pathname.startsWith('/platform/admin')) {
    accent = 'emerald'
    MainIcon = Plus
  }
  // 2. Wedding admin → gold, Plus
  else if (/^\/w\/[^/]+\/admin(?:\/|$|\?)/.test(pathname)) {
    accent = 'gold'
    MainIcon = Plus
  }
  // 3. Org admin → emerald, Plus
  else if (/^\/org\/[^/]+\/admin(?:\/|$|\?)/.test(pathname)) {
    accent = 'emerald'
    MainIcon = Plus
  }
  // 4. Wedding public → blush, Heart (romantique)
  else if (/^\/w\/[^/]+(?:\/|$|\?)/.test(pathname)) {
    accent = 'blush'
    MainIcon = Heart
  }
  // 5. Onboarding / org signup → blush (création = romantique)
  else if (pathname.startsWith('/onboarding') || pathname.startsWith('/org/signup')) {
    accent = 'blush'
    MainIcon = Plus
  }
  // 6. Fallback public → gold, Plus
  else {
    accent = 'gold'
    MainIcon = Plus
  }

  return (
    <FAB
      actions={actions}
      icon={MainIcon}
      accent={accent}
      size="md"
      label="Actions rapides"
    />
  )
}

/* ----------------------------------------------------------------
   Export — wrapper Suspense (requis par Next.js 16 pour useSearchParams
   — même si SmartFAB n'utilise que usePathname actuellement, le wrapper
   sécurise les futurs usages + reste cohérent avec SmartBottomNav).
---------------------------------------------------------------- */
export function SmartFAB() {
  return (
    <React.Suspense fallback={null}>
      <SmartFABInner />
    </React.Suspense>
  )
}
