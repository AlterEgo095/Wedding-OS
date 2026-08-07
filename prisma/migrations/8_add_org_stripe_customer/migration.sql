-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 8 — Add stripeCustomerId to Organization (P2.5)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Adds a nullable, unique stripeCustomerId column to the Organization table
-- so each org can be linked to a Stripe Customer for credit-pack billing.
--
-- Applied manually to the live docker volume DB on 2026-08-07 alongside the
-- schema.prisma update. This SQL file exists for reproducibility (e.g. when
-- provisioning a fresh database via `prisma migrate deploy`).

ALTER TABLE "Organization" ADD COLUMN "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeCustomerId_key"
  ON "Organization"("stripeCustomerId");
