-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 5: Plan OS — DB-backed plans, pricing, limits, entitlements
-- ══════════════════════════════════════════════════════════════════════════════
-- Mission 5.1 — Plan OS: Migration from code-only to DB-backed.
--
-- Migrates the hardcoded PLAN_LIMITS + PLAN_METADATA from src/lib/types.ts
-- into a proper DB-backed Plan model with:
--   - identity (code, name, description)
--   - pricing (priceUsdCents, priceFcfa, currency)
--   - limits (maxGuests, maxMediaBytes, maxAdmins, customDomainAllowed)
--   - lifecycle (DRAFT, ACTIVE, INACTIVE, ARCHIVED)
--   - visibility (isPublic, sortOrder)
--
-- All prices in Int minor units (cents) — NO floats.
-- Existing events (legacy) are NOT affected — they keep their Wedding.plan
-- field which references the Plan.code.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "priceUsdCents" INTEGER NOT NULL DEFAULT 0,
    "priceFcfa" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "maxGuests" INTEGER NOT NULL DEFAULT -1,
    "maxMediaBytes" INTEGER NOT NULL DEFAULT -1,
    "maxAdmins" INTEGER NOT NULL DEFAULT 1,
    "customDomainAllowed" BOOLEAN NOT NULL DEFAULT false,
    "bulkInvitationsAllowed" BOOLEAN NOT NULL DEFAULT true,
    "checkInAllowed" BOOLEAN NOT NULL DEFAULT true,
    "designerAllowed" BOOLEAN NOT NULL DEFAULT true,
    "premiumCollectionsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE INDEX "Plan_status_idx" ON "Plan"("status");
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");

-- Seed: migrate existing plans from code config
-- TRIAL: free, 20 guests, 100MB media, 1 admin, no custom domain
INSERT INTO "Plan" ("id", "code", "name", "description", "status", "isPublic", "sortOrder", "priceUsdCents", "priceFcfa", "currency", "maxGuests", "maxMediaBytes", "maxAdmins", "customDomainAllowed", "bulkInvitationsAllowed", "checkInAllowed", "designerAllowed", "premiumCollectionsAllowed")
VALUES (lower(hex(randomblob(12))), 'TRIAL', 'Essai Libre', 'Pour découvrir la plateforme', 'ACTIVE', 1, 0, 0, 0, 'usd', 20, 104857600, 1, 0, 1, 1, 1, 0);

-- ESSENTIEL: $49, 200 guests, 1GB media, 2 admins, no custom domain
INSERT INTO "Plan" ("id", "code", "name", "description", "status", "isPublic", "sortOrder", "priceUsdCents", "priceFcfa", "currency", "maxGuests", "maxMediaBytes", "maxAdmins", "customDomainAllowed", "bulkInvitationsAllowed", "checkInAllowed", "designerAllowed", "premiumCollectionsAllowed")
VALUES (lower(hex(randomblob(12))), 'ESSENTIEL', 'Essentiel', 'Pour les mariages intimes', 'ACTIVE', 1, 1, 4900, 30000, 'usd', 200, 1073741824, 2, 0, 1, 1, 1, 0);

-- PREMIUM: $99, 500 guests, 5GB media, 5 admins, custom domain
INSERT INTO "Plan" ("id", "code", "name", "description", "status", "isPublic", "sortOrder", "priceUsdCents", "priceFcfa", "currency", "maxGuests", "maxMediaBytes", "maxAdmins", "customDomainAllowed", "bulkInvitationsAllowed", "checkInAllowed", "designerAllowed", "premiumCollectionsAllowed")
VALUES (lower(hex(randomblob(12))), 'PREMIUM', 'Premium', 'Pour les mariages premium', 'ACTIVE', 1, 2, 9900, 60000, 'usd', 500, 5368709120, 5, 1, 1, 1, 1, 1);

-- ELITE: $199, unlimited guests, unlimited media, 10 admins, custom domain
INSERT INTO "Plan" ("id", "code", "name", "description", "status", "isPublic", "sortOrder", "priceUsdCents", "priceFcfa", "currency", "maxGuests", "maxMediaBytes", "maxAdmins", "customDomainAllowed", "bulkInvitationsAllowed", "checkInAllowed", "designerAllowed", "premiumCollectionsAllowed")
VALUES (lower(hex(randomblob(12))), 'ELITE', 'Élite', 'Pour les mariages d''exception', 'ACTIVE', 1, 3, 19900, 120000, 'usd', -1, -1, 10, 1, 1, 1, 1, 1);
