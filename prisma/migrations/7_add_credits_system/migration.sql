-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 7: Phase P2.1 — Credits System (3 new tables)
-- ══════════════════════════════════════════════════════════════════════════════
-- Mission 6.0 P2.1 — Add Credit, CreditTransaction, CreditBalance models for
-- the 5-type consumable credits system (Invitations / SMS / WhatsApp / QR / Export).
--
-- All 3 tables are tenant-scoped (weddingId NOT NULL, organizationId nullable
-- for white-label org-level credits). Cascade on wedding delete.
--
-- Idempotent: uses IF NOT EXISTS everywhere. Safe: no data loss.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Credit table (per-wedding balance, one row per type)
CREATE TABLE IF NOT EXISTS "Credit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weddingId" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Credit_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE,
    CONSTRAINT "Credit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Credit_weddingId_type_key" ON "Credit"("weddingId", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "Credit_organizationId_type_key" ON "Credit"("organizationId", "type");
CREATE INDEX IF NOT EXISTS "Credit_organizationId_idx" ON "Credit"("organizationId");

-- 2. CreditTransaction table (immutable ledger of every credit movement)
CREATE TABLE IF NOT EXISTS "CreditTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weddingId" TEXT NOT NULL,
    "organizationId" TEXT,
    "creditType" TEXT NOT NULL,
    "creditId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceOrderId" TEXT,
    "sourceDeliveryJobId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditTransaction_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE,
    CONSTRAINT "CreditTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL,
    CONSTRAINT "CreditTransaction_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE SET NULL,
    CONSTRAINT "CreditTransaction_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "CommercialOrder"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "CreditTransaction_weddingId_createdAt_idx" ON "CreditTransaction"("weddingId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditTransaction_organizationId_createdAt_idx" ON "CreditTransaction"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditTransaction_creditType_reason_idx" ON "CreditTransaction"("creditType", "reason");

-- 3. CreditBalance table (aggregated snapshot for dashboards)
CREATE TABLE IF NOT EXISTS "CreditBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weddingId" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "lifetimePurchased" INTEGER NOT NULL DEFAULT 0,
    "lifetimeConsumed" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRefunded" INTEGER NOT NULL DEFAULT 0,
    "currentBalance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditBalance_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE,
    CONSTRAINT "CreditBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditBalance_weddingId_type_key" ON "CreditBalance"("weddingId", "type");
CREATE INDEX IF NOT EXISTS "CreditBalance_organizationId_type_idx" ON "CreditBalance"("organizationId", "type");
