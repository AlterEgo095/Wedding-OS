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
// Mission 4.6: force dynamic rendering — the homepage fetches from DB at
// request time (Collections, portfolio events, case study). Static prerender
// would fail without DATABASE_URL at build time. ISR (revalidate=60) still
// applies, giving near-instant responses with fresh data every minute.
export const dynamic = 'force-dynamic'

// ─── Portfolio governance (Mission 4.7 Phase 4) ──────────────────────────────
// Classification is now DB-backed (portfolioVisible, portfolioType,
// caseStudyEnabled, portfolioOrder, featured) — NO MORE slug-based deduction.
// The admin controls visibility/type/order via /api/platform/weddings/[id]/portfolio.
//
// Transitional fallback: if portfolioType is null (not yet set by admin),
// we deduce from slug ONLY for the Three Worlds (known demos). Everything
// else defaults to CLIENT. This fallback is removed once the admin sets
// explicit governance on all events.
const KNOWN_DEMO_SLUGS = new Set(['world-a-royal', 'world-b-minimal', 'world-c-immersive'])

interface PortfolioEvent {
  slug: string
  coupleLabel: string
  collectionSlug: string | null
  collectionName: string | null
  collectionPrimaryColor: string | null
  layout: string | null
  weddingDate: Date | null
  venueCity: string | null
  portfolioType: string // CLIENT | DEMO | INTERNAL
  isRealClient: boolean // true when portfolioType === CLIENT (for backward compat)
  guestCount: number
}

async function getPortfolioEvents(): Promise<PortfolioEvent[]> {
  // Fetch weddings that are explicitly visible OR have no governance set yet
  // (transitional — default visible for PUBLISHED non-default weddings).
  // INTERNAL events are hidden from the public portfolio.
  const weddings = await db.wedding.findMany({
    where: {
      status: 'PUBLISHED',
      isDefault: false,
      // Visible if portfolioVisible is true OR (null AND not INTERNAL)
      // We filter INTERNAL out in code to handle the null case.
    },
    select: {
      slug: true,
      coupleLabel: true,
      collectionId: true,
      weddingDate: true,
      venueCity: true,
      portfolioVisible: true,
      portfolioType: true,
      portfolioOrder: true,
      caseStudyEnabled: true,
      featured: true,
      _count: { select: { guests: true } },
    },
    orderBy: [{ featured: 'desc' }, { portfolioOrder: 'asc' }, { createdAt: 'desc' }],
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

  return weddings
    .map((w) => {
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
      // Determine portfolioType: explicit DB value, or transitional fallback
      const portfolioType = w.portfolioType || (KNOWN_DEMO_SLUGS.has(w.slug) ? 'DEMO' : 'CLIENT')
      // Determine visibility: explicit DB value, or default (visible if not INTERNAL)
      const visible = w.portfolioVisible !== null ? w.portfolioVisible : (portfolioType !== 'INTERNAL')
      // Skip case study (shown separately) and non-visible events
      if (w.caseStudyEnabled || !visible) return null
      return {
        slug: w.slug,
        coupleLabel: w.coupleLabel,
        collectionSlug: coll?.slug || null,
        collectionName: coll?.name || null,
        collectionPrimaryColor: primaryColor,
        layout,
        weddingDate: w.weddingDate,
        venueCity: w.venueCity,
        portfolioType,
        isRealClient: portfolioType === 'CLIENT',
        guestCount: w._count.guests,
      }
    })
    .filter((e): e is PortfolioEvent => e !== null)
}

async function getCaseStudy() {
  // Mission 4.7: case study is now governed by caseStudyEnabled flag.
  // Fall back to josue-hornella if no wedding has the flag set (transitional).
  let wedding = await db.wedding.findFirst({
    where: { caseStudyEnabled: true },
    select: {
      id: true,
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
  if (!wedding) {
    // Transitional fallback: use josue-hornella if no case study is configured
    wedding = await db.wedding.findUnique({
      where: { slug: 'josue-hornella' },
      select: {
        id: true,
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
  }
  if (!wedding) return null
  // Get a few settings for the case study display
  const settings = await db.settings.findMany({
    where: { weddingId: wedding.id },
    select: { key: true, value: true },
  })
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value
  return { ...wedding, settings: settingsMap }
}

async function getCollections() {
  // Mission 4.7 Phase 5 — Collection Publishing Governance.
  // Only show Collections that are:
  //   - isActive=true (catalog visibility flag)
  //   - isPublished=true (deployability gate)
  //   - status NOT IN (BROUILLON, EN_COURS, VALIDATION, ARCHIVE)
  //     (DRAFT/pending Collections are never shown publicly; ARCHIVED is hidden)
  return db.collection.findMany({
    where: {
      isActive: true,
      isPublished: true,
      status: { notIn: ['BROUILLON', 'EN_COURS', 'VALIDATION', 'ARCHIVE'] },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      category: true,
      tier: true,
      themeSeed: true,
      sortOrder: true,
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
