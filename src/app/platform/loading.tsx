/**
 * Mission 5.9.5 — Phase C
 * Route-level loading fallback for /platform/*.
 * Emerald accent for platform/admin context.
 */
import { SkeletonAdminShell } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <SkeletonAdminShell accent="emerald" className="min-h-[calc(100vh-3.5rem)] rounded-none border-0" />
    </div>
  )
}
