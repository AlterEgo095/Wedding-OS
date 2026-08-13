/**
 * Mission 5.9.5 — Phase C
 * Route-level loading fallback for /w/[slug]/admin.
 * Gold accent for wedding admin context. Mirrors the post-auth admin shell.
 * Identical to the auth-gate fallback (page.tsx:627) for a continuous skeleton.
 */
import { SkeletonAdminShell } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="min-h-screen">
      <SkeletonAdminShell accent="gold" className="min-h-screen rounded-none border-0" />
    </div>
  )
}
