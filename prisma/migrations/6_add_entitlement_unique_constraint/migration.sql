-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 6: Add missing Entitlement unique constraint
-- ══════════════════════════════════════════════════════════════════════════════
-- Mission 5.3 — Fix schema drift: Entitlement @@unique([weddingId, type])
-- was in Prisma schema but missing from migration 4 SQL.
--
-- This caused provisionFromOrder to fail with:
--   "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint"
--
-- The index was created manually in production during M5.2.
-- This migration makes it official and reproducible from Git.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS (SQLite 3.33+)
-- Safe: no data loss, no table recreation.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "Entitlement_weddingId_type_key" ON "Entitlement"("weddingId", "type");
