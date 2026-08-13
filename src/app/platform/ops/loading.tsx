/**
 * Mission 5.9.5 — Phase C
 * Route-level loading fallback for /platform/ops.
 * Ops dashboard = KPI row + table. Emerald accent.
 */
import { SkeletonMetric, SkeletonTable } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonMetric key={i} accent="emerald" />
          ))}
        </div>
        {/* Ops table */}
        <SkeletonTable accent="emerald" />
      </div>
    </div>
  )
}
