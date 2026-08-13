/**
 * Mission 5.9.5 — Phase C
 * Route-level loading fallback for /w/[slug] (wedding public page).
 * Premium gold-tinted wedding hero skeleton — mirrors the actual
 * wedding hero layout (60vh media + centered title + CTA buttons).
 *
 * Replaces the Phase 2A hand-rolled animate-pulse divs with the
 * design-system Skeleton primitive for token consistency.
 */
import { SkeletonWeddingHero } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <SkeletonWeddingHero accent="gold" className="min-h-screen rounded-none border-0" />
      <span className="sr-only" aria-live="polite">
        Chargement de l&apos;invitation en cours, veuillez patienter.
      </span>
    </div>
  )
}
