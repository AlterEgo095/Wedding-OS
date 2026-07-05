-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 2: Add Collection engine tables + PasswordResetToken
-- ══════════════════════════════════════════════════════════════════════════════
-- Mission 4.0 Phase 2 — Schema reproducibility.
--
-- These 4 tables were added to the Prisma schema after 0_init but never got
-- their own migration. On the VPS production DB they were created by
-- `prisma db push` (the docker-entrypoint fallback). This migration makes
-- them part of the official migration history so a fresh `prisma migrate
-- deploy` from scratch produces a schema identical to production.
--
-- Tables added:
--   - Collection (catalog product: themeSeed, luxuryPreset, lifecycle)
--   - CollectionVariant (A/B/C/D palette overrides per Collection)
--   - CollectionModule (34 slots across 5 packs, Penpot frame mapping)
--   - PasswordResetToken (P1-SEC-9 password reset flow)
-- ══════════════════════════════════════════════════════════════════════════════

-- CreateTable: Collection
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'LUXURY',
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "penpotFileUrl" TEXT,
    "penpotFileId" TEXT,
    "themeSeed" TEXT NOT NULL,
    "luxuryPreset" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMMERCIALISE',
    "version" TEXT NOT NULL DEFAULT '0.1.0',
    "authorId" TEXT,
    "submittedAt" DATETIME,
    "publishedAt" DATETIME,
    "commercializedAt" DATETIME,
    "archivedAt" DATETIME,
    "penpotTokenId" TEXT,
    "lastFrameSyncAt" DATETIME,
    "qualityScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: CollectionVariant
CREATE TABLE "CollectionVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paletteOverride" TEXT,
    "penpotPageId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionVariant_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: CollectionModule
CREATE TABLE "CollectionModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "pack" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "frameId" TEXT,
    "penpotPageId" TEXT,
    "frameName" TEXT,
    "autoMapped" BOOLEAN NOT NULL DEFAULT false,
    "guestTier" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollectionModule_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: PasswordResetToken
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex: unique constraints
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
CREATE UNIQUE INDEX "CollectionVariant_collectionId_code_key" ON "CollectionVariant"("collectionId", "code");
CREATE UNIQUE INDEX "CollectionModule_collectionId_pack_slot_key" ON "CollectionModule"("collectionId", "pack", "slot");
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex: non-unique indexes
CREATE INDEX "CollectionVariant_collectionId_idx" ON "CollectionVariant"("collectionId");
CREATE INDEX "CollectionModule_collectionId_idx" ON "CollectionModule"("collectionId");
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- AddForeignKey: Collection.authorId → AdminUser.id (SET NULL on delete)
-- Note: AdminUser table already exists from 0_init migration.
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
