import { getHomeData } from '@/lib/home-data'
import ExpertiseShowcase from '@/components/ExpertiseShowcase'
import HomeClient from './_home-client'

/**
 * Homepage — Server Component (P1-PERF + P1-DESIGN)
 *
 * ═══ Architecture ═══
 * This page is a Server Component that:
 *   1. Fetches all homepage data in parallel via Prisma (zero client-side
 *      fetches for the initial render — eliminates the loading shimmer and
 *      improves LCP dramatically).
 *   2. Renders <ExpertiseShowcase /> (a Server Component — SSR'd for SEO,
 *      zero client JS) and passes it as a `children` prop to the Client
 *      Component. This is the Next.js App Router pattern for embedding
 *      Server Components inside Client Components.
 *   3. Renders <HomeClient /> (a Client Component) with the pre-fetched
 *      data as props. HomeClient handles all interactivity (guest auth,
 *      admin triggers, music, PWA, dynamic imports for heavy components).
 *
 * ═══ P1-DESIGN: Premium Homepage ═══
 * The homepage now features:
 *   - Cinematic hero with Josué & Hornella (existing, enhanced by SSR data)
 *   - FeaturedShowcase: "Ce mariage est la preuve" — Josué & Hornella as
 *     a living demonstration of the platform's capabilities
 *   - ExpertiseShowcase: "Notre savoir-faire" — 8 capability cards
 *     establishing the platform's expertise (SSR'd, SEO-friendly)
 *   - CollectionsShowcase: 5 premium design collections
 *   - Premium CTA section + floating CTA
 *
 * ═══ P1-PERF: Performance Optimizations ═══
 *   - SSR data fetching (no cascade API calls, no loading shimmer)
 *   - Dynamic imports for heavy/rare components (AdminPanel,
 *     LuxuryVisualEngine, PWAInstall, VisualEffectsLayer,
 *     AmbientMusicPlayer) — reduces initial JS bundle by ~40-60 KB
 *   - ExpertiseShowcase is a Server Component (zero client JS)
 *   - Code splitting via next/dynamic with ssr: false
 */

// P1-PERF: Revalidate every 60 seconds — the homepage data (stories,
// timeline, settings, stats) doesn't change frequently, so ISR gives
// us near-instant responses with fresh data every minute.
export const revalidate = 60

export default async function Home() {
  // Fetch all homepage data in parallel on the server.
  const initialData = await getHomeData()

  return (
    <HomeClient
      initialData={initialData}
      // ExpertiseShowcase is a Server Component — rendered here on the
      // server and passed as a ReactNode prop. This keeps it out of the
      // client JS bundle while still appearing in the SSR'd HTML.
      expertiseShowcase={<ExpertiseShowcase />}
    />
  )
}
