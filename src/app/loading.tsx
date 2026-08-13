/**
 * Mission 5.9.5 — Phase C
 * Route-level loading fallback for the marketing homepage.
 * Replaces the generic spinner with a premium gold-tinted admin-shell skeleton
 * that mirrors the post-hydration layout (no layout shift, no flash).
 */
import { SkeletonAdminShell } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <SkeletonAdminShell accent="gold" className="min-h-[calc(100vh-3.5rem)] rounded-none border-0" />
    </div>
  )
}
