import type { ReactNode } from 'react'

/**
 * Platform layout — minimal server component wrapper.
 *
 * The platform admin area (/platform/login and /platform/admin) is cross-tenant:
 * it does NOT need a WeddingContext. We just provide the dark luxury gradient
 * background that the rest of the app uses, so the platform pages blend in
 * visually with /admin and /.
 *
 * Children are rendered directly. Each platform page is a client component
 * responsible for its own auth gating (localStorage admin_token check).
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen text-foreground"
      style={{
        background:
          'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
      }}
    >
      {children}
    </div>
  )
}
