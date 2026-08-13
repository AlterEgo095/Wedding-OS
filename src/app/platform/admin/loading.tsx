/**
 * Mission 5.9.5 — Phase C
 * Route-level loading fallback for /platform/admin/*.
 * Mirrors the post-auth admin shell with emerald accent.
 * This makes the route-level fallback identical to the auth-gate fallback
 * (page.tsx:470) — so the user sees ONE continuous skeleton whether the
 * wait is server-side (RSC streaming) or client-side (auth check).
 */
import { SkeletonAdminShell } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="min-h-screen">
      <SkeletonAdminShell accent="emerald" className="min-h-screen rounded-none border-0" />
    </div>
  )
}
