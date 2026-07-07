-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 3: Add portfolio governance fields to Wedding
-- ══════════════════════════════════════════════════════════════════════════════
-- Mission 4.7 Phase 4 — Portfolio Governance.
--
-- Replaces the implicit slug-based classification (DEMO_SLUGS set in page.tsx)
-- with explicit DB-backed governance fields. The admin can now control:
--   - portfolioVisible: whether the event appears in the marketing portfolio
--   - portfolioType: CLIENT | DEMO | INTERNAL
--   - portfolioOrder: display order in the portfolio section
--   - caseStudyEnabled: whether the event is featured as the case study
--   - featured: whether the event is highlighted
--
-- All fields are nullable/additive — existing weddings default to sensible
-- values via the application layer (no data migration needed).
-- ══════════════════════════════════════════════════════════════════════════════

-- portfolioVisible: null = use defaults (PUBLISHED non-default weddings visible)
--   Explicit true/false overrides the default.
ALTER TABLE "Wedding" ADD COLUMN "portfolioVisible" BOOLEAN;

-- portfolioType: 'CLIENT' | 'DEMO' | 'INTERNAL' — null = deduced from slug (transitional)
ALTER TABLE "Wedding" ADD COLUMN "portfolioType" TEXT;

-- portfolioOrder: integer for explicit ordering — null = sort by createdAt desc
ALTER TABLE "Wedding" ADD COLUMN "portfolioOrder" INTEGER;

-- caseStudyEnabled: true = this event is THE case study (typically josue-hornella)
ALTER TABLE "Wedding" ADD COLUMN "caseStudyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- featured: highlighted in the portfolio (sticky/top placement)
ALTER TABLE "Wedding" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

-- Index for portfolio queries (visible events ordered by portfolioOrder)
CREATE INDEX "Wedding_portfolioVisible_portfolioOrder_idx" ON "Wedding"("portfolioVisible", "portfolioOrder");
