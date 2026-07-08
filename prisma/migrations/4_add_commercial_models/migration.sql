-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 4: Commercial OS — Customer, Deal, Order, Payment, Entitlement, Delivery
-- ══════════════════════════════════════════════════════════════════════════════
-- Mission 5.0 — Commercial Operations, Delivery & SaaS Readiness.
--
-- Adds the commercial domain layer:
--   Customer       — real customer entity (separate from Wedding)
--   Deal           — sales pipeline (Lead → Customer → Deal → Order)
--   Order          — commercial order with items
--   OrderItem      — line items (plan, add-on, custom)
--   Payment        — payment with manual verification flow
--   Entitlement    — explicit rights (plan/addon/manual/legacy)
--   DeliveryJob    — delivery tracking (LINK/QR/EMAIL/SMS/WHATSAPP)
--   DeliveryAttempt — per-provider attempt log
--
-- Also adds to Wedding:
--   customerId        — link to Customer (nullable, additive)
--   commercialStatus  — LEAD/PENDING_PAYMENT/PAID/IN_PRODUCTION/READY/LIVE/COMPLETED/ARCHIVED/CANCELLED
--
-- Money: all amounts in Int minor units (cents) — NO floats.
-- ══════════════════════════════════════════════════════════════════════════════

-- CreateTable: Customer
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "country" TEXT DEFAULT 'CD',
    "currency" TEXT DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: Deal
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "weddingId" TEXT,
    "title" TEXT NOT NULL,
    "estimatedValue" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" DATETIME,
    "lostReason" TEXT,
    "wonAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: Order (commercial order, not to be confused with sortOrder)
CREATE TABLE "CommercialOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "dealId" TEXT,
    "weddingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "confirmedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommercialOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommercialOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommercialOrder_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: OrderItem
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "planId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "weddingId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "senderName" TEXT,
    "senderPhone" TEXT,
    "proofUrl" TEXT,
    "submittedAt" DATETIME,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: Entitlement
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weddingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'PLAN',
    "value" TEXT NOT NULL DEFAULT 'true',
    "sourceOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entitlement_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entitlement_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "CommercialOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: DeliveryJob
CREATE TABLE "DeliveryJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weddingId" TEXT NOT NULL,
    "invitationId" TEXT,
    "guestId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "destination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryJob_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryJob_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryJob_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: DeliveryAttempt
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryJobId" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "error" TEXT,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryAttempt_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add columns to Wedding (additive, nullable)
ALTER TABLE "Wedding" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Wedding" ADD COLUMN "commercialStatus" TEXT;

-- CreateIndex: unique constraints
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex: non-unique indexes
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Deal_customerId_idx" ON "Deal"("customerId");
CREATE INDEX "Deal_stage_idx" ON "Deal"("stage");
CREATE INDEX "CommercialOrder_customerId_idx" ON "CommercialOrder"("customerId");
CREATE INDEX "CommercialOrder_status_idx" ON "CommercialOrder"("status");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Entitlement_weddingId_idx" ON "Entitlement"("weddingId");
CREATE INDEX "DeliveryJob_weddingId_idx" ON "DeliveryJob"("weddingId");
CREATE INDEX "DeliveryJob_status_idx" ON "DeliveryJob"("status");
CREATE INDEX "DeliveryAttempt_deliveryJobId_idx" ON "DeliveryAttempt"("deliveryJobId");
CREATE INDEX "Wedding_customerId_idx" ON "Wedding"("customerId");

-- AddForeignKey: Wedding.customerId → Customer.id
ALTER TABLE "Wedding" ADD CONSTRAINT "Wedding_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mission 5.0 fix: unique constraint on CommercialOrder.dealId (1:1 relation)
CREATE UNIQUE INDEX "CommercialOrder_dealId_key" ON "CommercialOrder"("dealId");
