/**
 * Mission 5.9.5 — Phase C
 * Route-level loading fallback for /onboarding/*.
 * Onboarding is a form wizard — show a premium form skeleton.
 */
import { SkeletonForm, SkeletonDashboardCard } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <SkeletonDashboardCard accent="gold" />
        <SkeletonForm accent="gold" />
      </div>
    </div>
  )
}
