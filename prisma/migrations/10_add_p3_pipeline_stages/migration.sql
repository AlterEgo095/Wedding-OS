-- ══════════════════════════════════════════════════════════════════════════════
-- Mission 6.0 P3 — Pipeline & Production Studio (4 new stages + 6 new models)
-- ══════════════════════════════════════════════════════════════════════════════
-- Adds: Brand, Layout, Product, ExperienceEvent, ExperienceVariant, ExperienceReport
-- Adds FK columns: Organization.brandId, Wedding.brandId, Wedding.layoutId,
--                  Template.layoutId, Entitlement.productId
-- All additions are nullable/additive — zero regression for existing rows.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── P3.1 — Brand ────────────────────────────────────────────────────────────
CREATE TABLE "Brand" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "name"            TEXT NOT NULL,
    "slug"            TEXT NOT NULL UNIQUE,
    "description"     TEXT NOT NULL DEFAULT '',
    "logoAssetId"     TEXT,
    "logoUrl"         TEXT,
    "voiceToneJson"   TEXT NOT NULL DEFAULT '{}',
    "iconographyJson" TEXT NOT NULL DEFAULT '{}',
    "colorsJson"      TEXT NOT NULL DEFAULT '{}',
    "typographyJson"  TEXT NOT NULL DEFAULT '{}',
    "status"          TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       DATETIME NOT NULL
);
CREATE INDEX "Brand_status_idx" ON "Brand"("status");

-- ─── P3.2 — Layout ───────────────────────────────────────────────────────────
CREATE TABLE "Layout" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "name"         TEXT NOT NULL,
    "slug"         TEXT NOT NULL UNIQUE,
    "description"  TEXT NOT NULL DEFAULT '',
    "sectionsJson" TEXT NOT NULL DEFAULT '[]',
    "propsJson"    TEXT NOT NULL DEFAULT '{}',
    "thumbnailUrl" TEXT,
    "version"      INTEGER NOT NULL DEFAULT 1,
    "status"       TEXT NOT NULL DEFAULT 'DRAFT',
    "isBuiltIn"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL
);
CREATE INDEX "Layout_status_idx" ON "Layout"("status");

-- ─── P3.3 — Product ──────────────────────────────────────────────────────────
CREATE TABLE "Product" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "name"        TEXT NOT NULL,
    "slug"        TEXT NOT NULL UNIQUE,
    "description" TEXT NOT NULL DEFAULT '',
    "bundleJson"  TEXT NOT NULL DEFAULT '{}',
    "priceCents"  INTEGER NOT NULL DEFAULT 0,
    "currency"    TEXT NOT NULL DEFAULT 'USD',
    "licence"     TEXT NOT NULL DEFAULT 'STANDARD',
    "status"      TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL
);
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- ─── P3.4 — Experience (3 tables) ────────────────────────────────────────────
CREATE TABLE "ExperienceEvent" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "weddingId"   TEXT NOT NULL,
    "guestId"     TEXT,
    "eventType"   TEXT NOT NULL,
    "sectionId"   TEXT,
    "variantId"   TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE
);
CREATE INDEX "ExperienceEvent_weddingId_createdAt_idx" ON "ExperienceEvent"("weddingId", "createdAt");
CREATE INDEX "ExperienceEvent_weddingId_eventType_idx" ON "ExperienceEvent"("weddingId", "eventType");

CREATE TABLE "ExperienceVariant" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "weddingId"   TEXT NOT NULL,
    "sectionId"   TEXT NOT NULL,
    "variantCode" TEXT NOT NULL,
    "trafficPct"  INTEGER NOT NULL DEFAULT 50,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE,
    UNIQUE ("weddingId", "sectionId", "variantCode")
);
CREATE INDEX "ExperienceVariant_weddingId_sectionId_idx" ON "ExperienceVariant"("weddingId", "sectionId");

CREATE TABLE "ExperienceReport" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "weddingId"   TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd"   DATETIME NOT NULL,
    "granularity" TEXT NOT NULL DEFAULT 'DAILY',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE,
    UNIQUE ("weddingId", "periodStart", "granularity")
);
CREATE INDEX "ExperienceReport_weddingId_periodStart_idx" ON "ExperienceReport"("weddingId", "periodStart");

-- ─── FK columns (additive — all nullable) ────────────────────────────────────
ALTER TABLE "Organization" ADD COLUMN "brandId" TEXT;
ALTER TABLE "Wedding"      ADD COLUMN "brandId"  TEXT;
ALTER TABLE "Wedding"      ADD COLUMN "layoutId" TEXT;
ALTER TABLE "Template"     ADD COLUMN "layoutId" TEXT;
ALTER TABLE "Entitlement"  ADD COLUMN "productId" TEXT;

-- Foreign keys (deferred to allow cycles; SQLite supports FK after ALTER)
-- Note: SQLite doesn't support ADD FOREIGN KEY directly; Prisma client enforces
-- relations at the application layer. For data integrity, the schema.prisma
-- @relation declarations are the source of truth and Prisma generate will
-- emit the proper FK constraints on the next migrate reset. For additive
-- nullable columns, the absence of a DB-level FK is acceptable (matches the
-- existing pattern used by Wedding.collectionId, Wedding.customerId, etc.).

-- ─── Seed: migrate the 5 built-in layouts from LAYOUT_SECTIONS (manifest.ts) ─
-- These rows have isBuiltIn=true so the UI can badge them. Their sectionsJson
-- contains the same sections as the hardcoded LAYOUT_SECTIONS map. Designers
-- can clone + extend them without touching code.
INSERT INTO "Layout" ("id", "name", "slug", "description", "sectionsJson", "propsJson", "version", "status", "isBuiltIn", "createdAt", "updatedAt") VALUES
  (lower(hex(randomblob(12))), 'Royal', 'royal',
   'Layout royal — sections complètes avec countdown, galerie, timeline, RSVP, livestream',
   '[{"id":"hero","type":"hero","visible":true},{"id":"countdown","type":"countdown","visible":true},{"id":"story","type":"story","visible":true},{"id":"timeline","type":"timeline","visible":true},{"id":"gallery","type":"gallery","visible":true},{"id":"rsvp","type":"rsvp","visible":true},{"id":"venue","type":"venue","visible":true},{"id":"livestream","type":"livestream","visible":true},{"id":"gifts","type":"gifts","visible":true},{"id":"faq","type":"faq","visible":true}]',
   '{}', 1, 'PUBLISHED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(12))), 'Classic', 'classic',
   'Layout classic — sections essentielles sans livestream',
   '[{"id":"hero","type":"hero","visible":true},{"id":"countdown","type":"countdown","visible":true},{"id":"story","type":"story","visible":true},{"id":"timeline","type":"timeline","visible":true},{"id":"gallery","type":"gallery","visible":true},{"id":"rsvp","type":"rsvp","visible":true},{"id":"venue","type":"venue","visible":true},{"id":"gifts","type":"gifts","visible":true},{"id":"faq","type":"faq","visible":true}]',
   '{}', 1, 'PUBLISHED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(12))), 'Minimal', 'minimal',
   'Layout minimaliste — hero, countdown, RSVP, venue uniquement',
   '[{"id":"hero","type":"hero","visible":true},{"id":"countdown","type":"countdown","visible":true},{"id":"rsvp","type":"rsvp","visible":true},{"id":"venue","type":"venue","visible":true}]',
   '{}', 1, 'PUBLISHED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(12))), 'Destination', 'destination',
   'Layout destination — sections voyage, hébergement, galerie',
   '[{"id":"hero","type":"hero","visible":true},{"id":"countdown","type":"countdown","visible":true},{"id":"story","type":"story","visible":true},{"id":"travel","type":"travel","visible":true},{"id":"accommodation","type":"accommodation","visible":true},{"id":"gallery","type":"gallery","visible":true},{"id":"rsvp","type":"rsvp","visible":true},{"id":"venue","type":"venue","visible":true},{"id":"faq","type":"faq","visible":true}]',
   '{}', 1, 'PUBLISHED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(12))), 'Modern', 'modern',
   'Layout moderne — sections complètes avec playlist et QR',
   '[{"id":"hero","type":"hero","visible":true},{"id":"countdown","type":"countdown","visible":true},{"id":"story","type":"story","visible":true},{"id":"timeline","type":"timeline","visible":true},{"id":"gallery","type":"gallery","visible":true},{"id":"rsvp","type":"rsvp","visible":true},{"id":"venue","type":"venue","visible":true},{"id":"playlist","type":"playlist","visible":true},{"id":"qr","type":"qr","visible":true},{"id":"gifts","type":"gifts","visible":true}]',
   '{}', 1, 'PUBLISHED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
