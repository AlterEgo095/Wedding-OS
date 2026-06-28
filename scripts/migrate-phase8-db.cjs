/**
 * migrate-phase8-db.cjs — Emergency DB migration for Phase 8 deploy
 *
 * The new container's init-db.js only creates legacy tables (AdminUser, Guest, etc.)
 * but NOT the multi-tenant tables (Wedding, Theme, Subscription, Invoice, etc.)
 * added in Phases 1-7. This script creates ALL missing tables + seeds data.
 *
 * Run INSIDE the container: docker exec wedding-app node /app/migrate-phase8-db.cjs
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function tableExists(name) {
  try {
    const r = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`
    );
    return r.length > 0;
  } catch {
    return false;
  }
}

async function exec(sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
    return true;
  } catch (e) {
    console.error('SQL error:', e.message, '| SQL:', sql.slice(0, 100));
    return false;
  }
}

const TABLES = [
  // Phase 1 — Multi-tenant foundation
  {
    name: 'Wedding',
    sql: `CREATE TABLE IF NOT EXISTS "Wedding" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "slug" TEXT NOT NULL,
      "brideName" TEXT NOT NULL DEFAULT '',
      "groomName" TEXT NOT NULL DEFAULT '',
      "coupleLabel" TEXT NOT NULL DEFAULT '',
      "weddingDate" DATETIME,
      "timezone" TEXT NOT NULL DEFAULT 'Africa/Kinshasa',
      "venueName" TEXT,
      "venueAddress" TEXT,
      "venueCity" TEXT,
      "venueLat" TEXT,
      "venueLng" TEXT,
      "venueReference" TEXT,
      "status" TEXT NOT NULL DEFAULT 'DRAFT',
      "plan" TEXT NOT NULL DEFAULT 'TRIAL',
      "customDomain" TEXT,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "publishedAt" DATETIME,
      CONSTRAINT "Wedding_slug_key" UNIQUE ("slug"),
      CONSTRAINT "Wedding_customDomain_key" UNIQUE ("customDomain")
    )`
  },
  {
    name: 'Subscription',
    sql: `CREATE TABLE IF NOT EXISTS "Subscription" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "weddingId" TEXT NOT NULL,
      "plan" TEXT NOT NULL DEFAULT 'TRIAL',
      "status" TEXT NOT NULL DEFAULT 'TRIALING',
      "amountAgreed" INTEGER,
      "currency" TEXT NOT NULL DEFAULT 'usd',
      "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
      "currentPeriodStart" DATETIME,
      "currentPeriodEnd" DATETIME,
      "cancelAt" DATETIME,
      "trialEndsAt" DATETIME,
      "activatedAt" DATETIME,
      "paidAt" DATETIME,
      "paymentMethod" TEXT,
      "whatsappPhone" TEXT,
      "notes" TEXT,
      "stripeCustomerId" TEXT,
      "stripeSubscriptionId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Subscription_weddingId_key" UNIQUE ("weddingId"),
      CONSTRAINT "Subscription_stripeCustomerId_key" UNIQUE ("stripeCustomerId"),
      CONSTRAINT "Subscription_stripeSubscriptionId_key" UNIQUE ("stripeSubscriptionId")
    )`,
    dropFirst: true
  },
  {
    name: 'Invoice',
    sql: `CREATE TABLE IF NOT EXISTS "Invoice" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "weddingId" TEXT NOT NULL,
      "subscriptionId" TEXT,
      "number" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'FCFA',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "dueDate" DATETIME,
      "paidDate" DATETIME,
      "paymentMethod" TEXT,
      "paymentReference" TEXT,
      "notes" TEXT,
      "stripeInvoiceId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Invoice_number_key" UNIQUE ("number")
    )`
  },
  {
    name: 'UsageCounter',
    sql: `CREATE TABLE IF NOT EXISTS "UsageCounter" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "weddingId" TEXT NOT NULL,
      "metric" TEXT NOT NULL,
      "value" INTEGER NOT NULL DEFAULT 0,
      "period" TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UsageCounter_weddingId_metric_period_key" UNIQUE ("weddingId", "metric", "period")
    )`
  },
  {
    name: 'Theme',
    sql: `CREATE TABLE IF NOT EXISTS "Theme" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "weddingId" TEXT NOT NULL,
      "primaryColor" TEXT NOT NULL DEFAULT '#D4A853',
      "accentColor" TEXT NOT NULL DEFAULT '#C8785A',
      "fontDisplay" TEXT NOT NULL DEFAULT 'Cormorant Garamond',
      "fontBody" TEXT NOT NULL DEFAULT 'Inter',
      "layout" TEXT NOT NULL DEFAULT 'classic',
      "customizations" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Theme_weddingId_key" UNIQUE ("weddingId")
    )`
  },
  {
    name: 'MusicTrack',
    sql: `CREATE TABLE IF NOT EXISTS "MusicTrack" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "weddingId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "artist" TEXT,
      "url" TEXT,
      "duration" INTEGER,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'Invitation',
    sql: `CREATE TABLE IF NOT EXISTS "Invitation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "weddingId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "guestId" TEXT,
      "maxUses" INTEGER NOT NULL DEFAULT 1,
      "uses" INTEGER NOT NULL DEFAULT 0,
      "expiresAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Invitation_code_key" UNIQUE ("code")
    )`
  },
  {
    name: 'Lead',
    sql: `CREATE TABLE IF NOT EXISTS "Lead" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "brideName" TEXT NOT NULL,
      "groomName" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "phone" TEXT,
      "weddingDate" DATETIME,
      "venueCity" TEXT,
      "message" TEXT,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "convertedWeddingId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  },
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS "Wedding_status_idx" ON "Wedding"("status")',
  'CREATE INDEX IF NOT EXISTS "Wedding_plan_idx" ON "Wedding"("plan")',
  'CREATE INDEX IF NOT EXISTS "Wedding_isDefault_idx" ON "Wedding"("isDefault")',
  'CREATE INDEX IF NOT EXISTS "Invoice_weddingId_idx" ON "Invoice"("weddingId")',
  'CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status")',
  'CREATE INDEX IF NOT EXISTS "MusicTrack_weddingId_idx" ON "MusicTrack"("weddingId")',
  'CREATE INDEX IF NOT EXISTS "Invitation_weddingId_idx" ON "Invitation"("weddingId")',
  'CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status")',
  'CREATE INDEX IF NOT EXISTS "UsageCounter_weddingId_idx" ON "UsageCounter"("weddingId")',
];

async function main() {
  console.log('=== PHASE 8 DB MIGRATION ===');

  // 1. Create tables
  console.log('\n--- Creating multi-tenant tables ---');
  for (const t of TABLES) {
    const exists = await tableExists(t.name);
    if (exists && t.dropFirst) {
      console.log(`  🗑️  Dropping ${t.name} for full re-create...`);
      await exec(`DROP TABLE IF EXISTS "${t.name}"`);
      await exec(t.sql);
      console.log(`  ✅ Re-created ${t.name}`);
    } else if (exists) {
      console.log(`  ⏭️  ${t.name} already exists`);
    } else {
      await exec(t.sql);
      console.log(`  ✅ Created ${t.name}`);
    }
  }

  // 2. Create indexes
  console.log('\n--- Creating indexes ---');
  for (const idx of INDEXES) {
    await exec(idx);
  }
  console.log('  ✅ Indexes ready');

  // 3. Add missing columns to legacy tables
  console.log('\n--- Adding missing columns to legacy tables ---');
  const columnAdds = [
    ['AdminUser', 'weddingId', 'TEXT'],
    ['AdminUser', 'lastLoginAt', 'DATETIME'],
    ['Guest', 'weddingId', 'TEXT'],
    ['Settings', 'weddingId', 'TEXT'],
    ['EventTimeline', 'weddingId', 'TEXT'],
    ['CoupleStory', 'weddingId', 'TEXT'],
    ['Table', 'weddingId', 'TEXT'],
    ['Media', 'weddingId', 'TEXT'],
    ['AuditLog', 'weddingId', 'TEXT'],
    ['GuestSession', 'weddingId', 'TEXT'],
    ['GuestAccessLog', 'weddingId', 'TEXT'],
  ];
  for (const [table, col, type] of columnAdds) {
    if (await tableExists(table)) {
      try {
        await exec(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${type}`);
        console.log(`  ✅ Added ${col} to ${table}`);
      } catch {
        // Column already exists — ignore
      }
    }
  }
  console.log('  ✅ Column sync complete');

  // 4. Create default wedding
  console.log('\n--- Creating default wedding ---');
  let wedding = await prisma.wedding.findFirst({ where: { slug: 'josue-hornella' } });
  if (!wedding) {
    wedding = await prisma.wedding.create({
      data: {
        slug: 'josue-hornella',
        brideName: 'Hornella',
        groomName: 'Josué',
        coupleLabel: 'Josué & Hornella',
        weddingDate: new Date('2026-06-26T21:30:00+01:00'),
        timezone: 'Africa/Kinshasa',
        venueName: 'Salle Polyvalente – Grand Palais Kinshasa',
        venueAddress: '21 / 22 Avenue Bobozo',
        venueCity: 'Kinshasa',
        venueReference: 'Réf. Hôpital AKRAM, à la diagonale du Centre TELEMA',
        status: 'PUBLISHED',
        plan: 'ELITE',
        isDefault: true,
        publishedAt: new Date(),
      },
    });
    console.log(`  ✅ Created default wedding: ${wedding.id}`);
  } else {
    console.log(`  ⏭️  Default wedding exists: ${wedding.id}`);
  }

  // 5. Backfill weddingId on legacy tables
  console.log('\n--- Backfilling weddingId ---');
  const legacyTables = ['AdminUser', 'Guest', 'Settings', 'EventTimeline', 'CoupleStory', 'Table', 'Media', 'AuditLog', 'GuestSession', 'GuestAccessLog'];
  for (const t of legacyTables) {
    if (await tableExists(t)) {
      await exec(`UPDATE "${t}" SET "weddingId" = '${wedding.id}' WHERE "weddingId" IS NULL`);
      console.log(`  ✅ Backfilled ${t}`);
    }
  }

  // 6. Create platform admin if missing
  console.log('\n--- Creating platform admin ---');
  let admin = await prisma.adminUser.findFirst({ where: { email: 'admin@josue-hornella.wedding' } });
  if (!admin) {
    const hashedPassword = await bcrypt.hash('admin2026', 12);
    admin = await prisma.adminUser.create({
      data: {
        email: 'admin@josue-hornella.wedding',
        password: hashedPassword,
        name: 'Super Admin',
        role: 'PLATFORM_ADMIN',
      },
    });
    console.log(`  ✅ Created admin: ${admin.id}`);
  } else {
    // Normalize role to PLATFORM_ADMIN
    if (admin.role === 'SUPER_ADMIN') {
      admin = await prisma.adminUser.update({
        where: { id: admin.id },
        data: { role: 'PLATFORM_ADMIN' },
      });
      console.log(`  ✅ Normalized admin role to PLATFORM_ADMIN`);
    } else {
      console.log(`  ⏭️  Admin exists: ${admin.id} (${admin.role})`);
    }
  }

  // 7. Create theme if missing
  console.log('\n--- Creating default theme ---');
  let theme = await prisma.theme.findUnique({ where: { weddingId: wedding.id } });
  if (!theme) {
    theme = await prisma.theme.create({
      data: { weddingId: wedding.id },
    });
    console.log(`  ✅ Created theme: ${theme.id}`);
  } else {
    console.log(`  ⏭️  Theme exists`);
  }

  // 8. Create subscription if missing
  console.log('\n--- Creating complimentary subscription ---');
  let sub = await prisma.subscription.findUnique({ where: { weddingId: wedding.id } });
  if (!sub) {
    sub = await prisma.subscription.create({
      data: {
        weddingId: wedding.id,
        plan: 'ELITE',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        activatedAt: new Date(),
        paidAt: new Date(),
        paymentMethod: 'OTHER',
        notes: 'Complimentary ELITE subscription for default wedding',
      },
    });
    console.log(`  ✅ Created subscription: ${sub.id}`);
  } else {
    console.log(`  ⏭️  Subscription exists`);
  }

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log(`Wedding: ${wedding.slug} (${wedding.plan}, ${wedding.status})`);
  console.log(`Admin: ${admin.email} (${admin.role})`);
}

main()
  .catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
