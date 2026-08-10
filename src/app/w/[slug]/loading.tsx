/**
 * Loading UI for /w/[slug]/* routes (P2-PERF-18, Phase 2A enhanced).
 *
 * Next.js App Router shows this fallback while the wedding public page
 * (async Server Component) resolves `getCachedWeddingData` +
 * `getCachedWeddingPageData` server-side. Both fetches are ISR-cached so
 * this skeleton is only visible on the very first request for a wedding
 * (or after a cache invalidation / cold start).
 *
 * Phase 2A enhancement: replaced the previous centered spinner with a
 * hero + section skeleton that mirrors the actual manifest-driven layout.
 * This gives the visitor an immediate visual sense of "an invitation is
 * loading here" rather than a tiny spinner in the middle of a blank page
 * (CLS is also lower because the reserved space matches the final layout).
 *
 * Server-renderable (no 'use client' directive, no hooks) so Next.js can
 * stream it as the route-level Suspense fallback without client JS.
 */
export default function Loading() {
  return (
    <div
      className="min-h-screen w-full flex flex-col"
      role="status"
      aria-live="polite"
      aria-label="Chargement de l'invitation"
    >
      {/* ─── Hero skeleton (mirrors <HeroSection> / <CinematicHero>) ─── */}
      <div
        className="relative w-full h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
        }}
      >
        <div className="shimmer absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative z-10 text-center space-y-4 px-4">
          <div
            className="inline-block w-16 h-16 rounded-full bg-gradient-gold animate-pulse mx-auto"
            aria-hidden="true"
          />
          <div className="space-y-2">
            <div className="h-8 w-64 mx-auto rounded-md bg-white/10 animate-pulse" />
            <div className="h-4 w-48 mx-auto rounded-md bg-white/5 animate-pulse" />
          </div>
          <p className="text-amber-200/70 text-xs tracking-widest uppercase">
            Chargement de l&apos;invitation…
          </p>
        </div>
      </div>

      {/* ─── Section skeletons (mirrors a 3-section stack) ─── */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-12 space-y-16">
        {[0, 1, 2].map((i) => (
          <section
            key={i}
            className="space-y-4"
            aria-hidden="true"
          >
            <div className="h-6 w-48 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded-md bg-muted/20 animate-pulse" />
            <div className="h-4 w-5/6 rounded-md bg-muted/20 animate-pulse" />
            <div className="h-4 w-4/6 rounded-md bg-muted/20 animate-pulse" />
          </section>
        ))}
      </div>

      {/* sr-only announcement for screen readers */}
      <span className="sr-only">Chargement en cours, veuillez patienter.</span>
    </div>
  );
}
