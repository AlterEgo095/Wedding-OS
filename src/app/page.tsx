// ══════════════════════════════════════════════════════════════════════════════
// src/app/page.tsx — MARKETING OS HOMEPAGE (Mission 4.6)
// ══════════════════════════════════════════════════════════════════════════════
// This is the MARKETING PLATFORM homepage. It sells the product.
//
// PRE-MISSION-4.6 STATE (now fixed):
//   The homepage was a HYBRID — it loaded GuestAuthProvider, GuestAuthForm,
//   GuestPersonalSpace, PremiumGallery, OurStory, EventTimeline, MapSection
//   (all wedding-experience components) AND marketing sections. The visitor
//   couldn't tell if they were looking at a wedding invitation or a product
//   platform. The homepage depended on DEFAULT_WEDDING_SLUG (josue-hornella)
//   for its identity.
//
// POST-MISSION-4.6 STATE (this file):
//   The homepage is a pure MARKETING OS. It:
//     - does NOT render any guest-auth / gallery / story / timeline / map
//     - does NOT depend on a default wedding for its identity
//     - fetches Collections from DB (real data, not hardcoded)
//     - fetches portfolio events from DB (with explicit featured/portfolio flags)
//     - presents the platform as a product, with Josué & Hornella as a CASE STUDY
//
// The wedding EXPERIENCE lives at /w/[slug] (Event Experience OS).
// The ADMIN lives at /platform/* and /w/[slug]/admin/* (Event Operating System).
//
// Data sources:
//   - Collections: db.collection.findMany({ isActive: true, isPublished: true })
//   - Portfolio events: db.wedding.findMany({ status: PUBLISHED, isDefault: false })
//     with explicit classification (REAL_CLIENT vs DEMO based on slug prefix)
//   - Case study (Josué & Hornella): db.wedding.findUnique({ slug: 'josue-hornella' })
//     + its settings/stories/timeline counts (for proof of completeness)
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import type { Plan } from '@/lib/types'
import MarketingHero from '@/components/marketing/MarketingHero'
import ProductPromise from '@/components/marketing/ProductPromise'
import RealCapabilities from '@/components/marketing/RealCapabilities'
import CollectionsSection from '@/components/marketing/CollectionsSection'
import PortfolioSection from '@/components/marketing/PortfolioSection'
import CaseStudySection from '@/components/marketing/CaseStudySection'
import HowItWorks from '@/components/marketing/HowItWorks'
import ThreeWorldsSection from '@/components/marketing/ThreeWorldsSection'
import CommercialCTA from '@/components/marketing/CommercialCTA'
import MarketingFooter from '@/components/marketing/MarketingFooter'

export const revalidate = 60 // ISR — refresh marketing data every 60s

// ─── Portfolio classification ────────────────────────────────────────────────
// Distinguish REAL_CLIENT events from DEMO events. Demo events are the
// Three Worlds proof-of-concept weddings (world-a-royal, world-b-minimal,
// world-c-immersive). Real clients are everything else that is PUBLISHED.
const DEMO_SLUGS = new Set(['world-a-royal', 'world-b-minimal', 'world-c-immersive'])

interface PortfolioEvent {
  slug: string
  coupleLabel: string
  collectionSlug: string | null
  collectionName: string | null
  collectionPrimaryColor: string | null
  layout: string | null
  weddingDate: Date | null
  venueCity: string | null
  isRealClient: boolean
  guestCount: number
}

async function getPortfolioEvents(): Promise<PortfolioEvent[]> {
  const weddings = await db.wedding.findMany({
    where: {
      status: 'PUBLISHED',
      slug: { not: 'josue-hornella' }, // case study shown separately
    },
    select: {
      slug: true,
      coupleLabel: true,
      collectionId: true,
      weddingDate: true,
      venueCity: true,
      _count: { select: { guests: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Resolve collection info for each
  const collectionIds = [...new Set(weddings.map((w) => w.collectionId).filter(Boolean))] as string[]
  const collections = collectionIds.length > 0
    ? await db.collection.findMany({
        where: { id: { in: collectionIds } },
        select: { id: true, slug: true, name: true, themeSeed: true },
      })
    : []
  const collMap = new Map(collections.map((c) => [c.id, c]))

  return weddings.map((w) => {
    const coll = w.collectionId ? collMap.get(w.collectionId) : null
    let primaryColor: string | null = null
    let layout: string | null = null
    if (coll?.themeSeed) {
      try {
        const seed = JSON.parse(coll.themeSeed)
        primaryColor = seed.primaryColor || null
        layout = seed.layout || null
      } catch { /* ignore parse error */ }
    }
    return {
      slug: w.slug,
      coupleLabel: w.coupleLabel,
      collectionSlug: coll?.slug || null,
      collectionName: coll?.name || null,
      collectionPrimaryColor: primaryColor,
      layout,
      weddingDate: w.weddingDate,
      venueCity: w.venueCity,
      isRealClient: !DEMO_SLUGS.has(w.slug),
      guestCount: w._count.guests,
    }
  })
}

async function getCaseStudy() {
  const wedding = await db.wedding.findUnique({
    where: { slug: 'josue-hornella' },
    select: {
      slug: true,
      coupleLabel: true,
      brideName: true,
      groomName: true,
      weddingDate: true,
      venueName: true,
      venueCity: true,
      plan: true,
      _count: {
        select: { guests: true, tables: true, stories: true, timeline: true, media: true, settings: true },
      },
    },
  })
  if (!wedding) return null
  // Get a few settings for the case study display
  const settings = await db.settings.findMany({
    where: { weddingId: (await db.wedding.findUnique({ where: { slug: 'josue-hornella' }, select: { id: true } }))!.id },
    select: { key: true, value: true },
  })
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value
  return { ...wedding, settings: settingsMap }
}

async function getCollections() {
  return db.collection.findMany({
    where: { isActive: true, isPublished: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      category: true,
      tier: true,
      themeSeed: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 12,
  })
}

export default async function MarketingHome() {
  // Fetch all marketing data in parallel on the server (zero client-side fetches)
  const [collections, portfolioEvents, caseStudy] = await Promise.all([
    getCollections(),
    getPortfolioEvents(),
    getCaseStudy(),
  ])

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* SECTION 1 — HERO PLATFORM: What / Who / Action */}
      <MarketingHero />

      {/* SECTION 2 — PRODUCT PROMISE: Create → Design → Personalize → Invite → Organize → Publish → Operate */}
      <ProductPromise />

      {/* SECTION 3 — REAL CAPABILITIES (only what actually works) */}
      <RealCapabilities />

      {/* SECTION 4 — COLLECTIONS from DB (real data, not hardcoded) */}
      <CollectionsSection collections={collections} />

      {/* SECTION 5 — PORTFOLIO (real clients vs demos, explicitly distinguished) */}
      <PortfolioSection events={portfolioEvents} />

      {/* SECTION 6 — JOSUÉ & HORNELLA CASE STUDY (the proof, not the product) */}
      <CaseStudySection caseStudy={caseStudy} />

      {/* SECTION 7 — HOW IT WORKS (6 steps, each backed by a real feature) */}
      <HowItWorks />

      {/* SECTION 8 — THREE WORLDS (structural proof: 6 vs 4 vs 6 sections) */}
      <ThreeWorldsSection />

      {/* SECTION 9 — COMMERCIAL CTA (real onboarding, no fake checkout) */}
      <CommercialCTA />

      {/* Footer */}
      <MarketingFooter />
    </main>
  )
}
