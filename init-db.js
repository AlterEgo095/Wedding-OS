// ═══════════════════════════════════════════════════════════════
// init-db.js — Database initialization script for production
// Creates tables using raw SQL + seeds data on container startup
// ═══════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function tableExists(tableName) {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    return result.length > 0;
  } catch {
    return false;
  }
}

async function createTables() {
  console.log('📋 Creating database tables if needed...');

  const tables = [
    {
      name: 'AdminUser',
      sql: `CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "email" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'CONTROLLER',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AdminUser_email_key" UNIQUE ("email")
      )`
    },
    {
      name: 'Guest',
      sql: `CREATE TABLE IF NOT EXISTS "Guest" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        "phone" TEXT,
        "email" TEXT,
        "tableId" TEXT,
        "seats" INTEGER NOT NULL DEFAULT 1,
        "category" TEXT NOT NULL DEFAULT 'AMIS',
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "invitationCode" TEXT NOT NULL,
        "personalMessage" TEXT,
        "checkedIn" BOOLEAN NOT NULL DEFAULT false,
        "checkedInAt" DATETIME,
        "invitationViewed" BOOLEAN NOT NULL DEFAULT false,
        "invitationViewedAt" DATETIME,
        "invitationViewCount" INTEGER NOT NULL DEFAULT 0,
        "lastAccessAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Guest_invitationCode_key" UNIQUE ("invitationCode"),
        CONSTRAINT "Guest_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL
      )`
    },
    {
      name: 'Table',
      sql: `CREATE TABLE IF NOT EXISTS "Table" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "name" TEXT NOT NULL,
        "number" INTEGER NOT NULL,
        "capacity" INTEGER NOT NULL DEFAULT 8,
        "location" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Table_number_key" UNIQUE ("number")
      )`
    },
    {
      name: 'Media',
      sql: `CREATE TABLE IF NOT EXISTS "Media" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "type" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "title" TEXT,
        "description" TEXT,
        "category" TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'EventTimeline',
      sql: `CREATE TABLE IF NOT EXISTS "EventTimeline" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "time" TEXT NOT NULL,
        "activity" TEXT NOT NULL,
        "location" TEXT,
        "description" TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'CoupleStory',
      sql: `CREATE TABLE IF NOT EXISTS "CoupleStory" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "date" TEXT,
        "imageUrl" TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'AuditLog',
      sql: `CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "userId" TEXT,
        "action" TEXT NOT NULL,
        "details" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE SET NULL
      )`
    },
    {
      name: 'Settings',
      sql: `CREATE TABLE IF NOT EXISTS "Settings" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Settings_key_key" UNIQUE ("key")
      )`
    },
    {
      name: 'GuestSession',
      sql: `CREATE TABLE IF NOT EXISTS "GuestSession" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "guestId" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "userAgent" TEXT,
        "ipAddress" TEXT,
        "fingerprint" TEXT,
        "deviceInfo" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" DATETIME NOT NULL,
        "lastAccessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GuestSession_token_key" UNIQUE ("token"),
        CONSTRAINT "GuestSession_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE
      )`
    },
    {
      name: 'GuestAccessLog',
      sql: `CREATE TABLE IF NOT EXISTS "GuestAccessLog" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(9)))),
        "guestId" TEXT,
        "action" TEXT NOT NULL,
        "details" TEXT,
        "userAgent" TEXT,
        "ipAddress" TEXT,
        "referrer" TEXT,
        "fingerprint" TEXT,
        "deviceInfo" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GuestAccessLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL
      )`
    },
  ];

  // Create tables in order (respecting foreign keys: Table before Guest)
  for (const table of tables) {
    const exists = await tableExists(table.name);
    if (!exists) {
      await prisma.$executeRawUnsafe(table.sql);
      console.log(`  ✅ Created table: ${table.name}`);
    } else {
      console.log(`  ⏭️  Table already exists: ${table.name}`);
    }
  }

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS "Guest_tableId_idx" ON "Guest"("tableId")',
    'CREATE INDEX IF NOT EXISTS "GuestSession_guestId_idx" ON "GuestSession"("guestId")',
    'CREATE INDEX IF NOT EXISTS "GuestAccessLog_guestId_idx" ON "GuestAccessLog"("guestId")',
    'CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId")',
  ];

  for (const idxSql of indexes) {
    try {
      await prisma.$executeRawUnsafe(idxSql);
    } catch (e) {
      // Index may already exist
    }
  }
  // Add new columns to existing tables (SQLite ALTER TABLE is limited, so use try/catch)
  const alterStatements = [
    'ALTER TABLE "GuestSession" ADD COLUMN "fingerprint" TEXT',
    'ALTER TABLE "GuestSession" ADD COLUMN "deviceInfo" TEXT',
    'ALTER TABLE "GuestAccessLog" ADD COLUMN "fingerprint" TEXT',
    'ALTER TABLE "GuestAccessLog" ADD COLUMN "deviceInfo" TEXT',
  ];

  for (const alterSql of alterStatements) {
    try {
      await prisma.$executeRawUnsafe(alterSql);
    } catch {
      // Column may already exist — that's fine
    }
  }
  console.log('✅ Database tables ready!');
}

async function seedData() {
  console.log('🌱 Seeding database...');

  // Create Super Admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@heureuxmariage.aenews.net';
  const adminPassword = process.env.ADMIN_PASSWORD || 'HeureuxMariage2026!';

  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
      },
    });
    console.log(`✅ Created Super Admin (${adminEmail})`);
  } else {
    console.log('⏭️  Super Admin already exists');
  }

  // Create default settings
  const defaultSettings = [
    { key: 'groom_name', value: 'Josué' },
    { key: 'bride_name', value: 'Hornella' },
    { key: 'wedding_date', value: '2026-06-26' },
    { key: 'wedding_time', value: '14:00' },
    { key: 'site_title', value: 'Mariage Josué & Hornella' },
    { key: 'site_subtitle', value: 'Vendredi 26 Juin 2026' },
    { key: 'venue_name', value: 'Salle Polyvalente – Grand Palais Kinshasa' },
    { key: 'venue_address', value: '21 / 22 Avenue Bobozo' },
    { key: 'venue_reference', value: 'Réf. Hôpital AKRAM, à la diagonale du Centre TELEMA' },
    { key: 'venue_city', value: 'Kinshasa' },
    { key: 'venue_lat', value: '-4.3250' },
    { key: 'venue_lng', value: '15.3222' },
    { key: 'venue_parking', value: 'Parking disponible sur place' },
    { key: 'venue_time', value: '14h00 — Cérémonie' },
    { key: 'invitation_message', value: "Josué & Hornella ont l'honneur de vous inviter à leur célébration de mariage." },
    { key: 'hashtag', value: '#JosueEtHornella2026' },
    { key: 'welcome_message', value: 'Bienvenue sur la plateforme du mariage de Josué & Hornella' },
    { key: 'thank_you_message', value: "Merci d'être présent pour célébrer notre union" },
    { key: 'primary_color', value: '#D4A853' },
    { key: 'accent_color', value: '#C8785A' },
  ];

  for (const setting of defaultSettings) {
    await prisma.settings.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log(`✅ Created/updated ${defaultSettings.length} settings`);

  // Create default tables
  const existingTables = await prisma.table.count();
  if (existingTables === 0) {
    const tables = [
      { name: 'Table Honneur', number: 1, capacity: 10 },
      { name: 'Table Famille 1', number: 2, capacity: 8 },
      { name: 'Table Famille 2', number: 3, capacity: 8 },
      { name: 'Table VIP 1', number: 4, capacity: 8 },
      { name: 'Table VIP 2', number: 5, capacity: 8 },
      { name: 'Table Amis 1', number: 6, capacity: 10 },
      { name: 'Table Amis 2', number: 7, capacity: 10 },
      { name: 'Table Amis 3', number: 8, capacity: 10 },
      { name: 'Table Collègues', number: 9, capacity: 8 },
      { name: 'Table Sponsors', number: 10, capacity: 8 },
    ];
    for (const table of tables) {
      await prisma.table.create({ data: table });
    }
    console.log(`✅ Created ${tables.length} tables`);
  } else {
    console.log(`⏭️  Tables already exist (${existingTables})`);
  }

  // Create sample timeline events
  const existingTimeline = await prisma.eventTimeline.count();
  if (existingTimeline === 0) {
    const events = [
      { time: '13:30', activity: 'Accueil des invités', location: "Hall d'entrée", description: 'Accueil et installation des invités avec cocktail de bienvenue', order: 1 },
      { time: '14:00', activity: 'Cérémonie de mariage', location: 'Salle principale', description: 'Échange des vœux et bénédiction nuptiale', order: 2 },
      { time: '15:00', activity: 'Séance photo', location: 'Jardin', description: 'Photos de groupe et du couple', order: 3 },
      { time: '16:00', activity: 'Cocktail de réception', location: 'Terrasse', description: 'Cocktail et amuse-bouches', order: 4 },
      { time: '17:00', activity: 'Entrée du couple', location: 'Salle de réception', description: 'Entrée triomphale de Josué & Hornella', order: 5 },
      { time: '17:30', activity: 'Repas de fête', location: 'Salle de réception', description: "Dîner somptueux en l'honneur des mariés", order: 6 },
      { time: '19:00', activity: 'Coupe du gâteau', location: 'Salle de réception', description: 'Cérémonie de la coupe du gâteau de mariage', order: 7 },
      { time: '19:30', activity: 'Soirée dansante', location: 'Piste de danse', description: "DJ et soirée dansante jusqu'au bout de la nuit", order: 8 },
    ];
    for (const event of events) {
      await prisma.eventTimeline.create({ data: event });
    }
    console.log(`✅ Created ${events.length} timeline events`);
  } else {
    console.log(`⏭️  Timeline events already exist (${existingTimeline})`);
  }

  // Create sample couple stories
  const existingStories = await prisma.coupleStory.count();
  if (existingStories === 0) {
    const stories = [
      {
        title: 'Notre Première Rencontre',
        description: "C'était un jour ordinaire qui allait changer notre vie. Un regard, un sourire, et le monde s'est arrêté de tourner.",
        date: '2021',
        imageUrl: '/couple-hero.png',
        order: 1,
      },
      {
        title: "Le Premier « Je t'aime »",
        description: "Les mots les plus doux ont été murmurés sous les étoiles de Kinshasa. Un moment gravé dans nos cœurs pour l'éternité.",
        date: '2022',
        imageUrl: '/couple-moment.jpeg',
        order: 2,
      },
      {
        title: 'La Demande',
        description: "À genoux, le cœur battant, la question a été posée. Et la réponse était oui ! Un oui qui résonne encore dans nos vies.",
        date: '2024',
        imageUrl: null,
        order: 3,
      },
    ];
    for (const story of stories) {
      await prisma.coupleStory.create({ data: story });
    }
    console.log(`✅ Created ${stories.length} couple stories`);
  } else {
    console.log(`⏭️  Couple stories already exist (${existingStories})`);
  }

  // Create sample guests
  const existingGuests = await prisma.guest.count();
  if (existingGuests === 0) {
    const guests = [
      { firstName: 'Jean', lastName: 'Mukendi', category: 'FAMILLE', seats: 2, tableNumber: 1, personalMessage: 'Bienvenue cher oncle, votre présence nous touche profondément.' },
      { firstName: 'Marie', lastName: 'Ngombe', category: 'FAMILLE', seats: 1, tableNumber: 2, personalMessage: 'Chère tante Marie, merci d\'être là pour nous.' },
      { firstName: 'Pierre', lastName: 'Kabongo', category: 'VIP', seats: 2, tableNumber: 4, personalMessage: 'Votre soutien compte énormément pour nous.' },
      { firstName: 'Sophie', lastName: 'Lubala', category: 'AMIS', seats: 1, tableNumber: 6, personalMessage: 'Sophie, amie de toujours, ce jour ne serait pas pareil sans toi.' },
      { firstName: 'David', lastName: 'Tshisekedi', category: 'AMIS', seats: 2, tableNumber: 6, personalMessage: 'David, merci pour ton amitié précieuse.' },
      { firstName: 'Grace', lastName: 'Mbuyi', category: 'FAMILLE', seats: 1, tableNumber: 3, personalMessage: 'Grace, notre chère cousine, on t\'attend avec impatience !' },
      { firstName: 'Patrick', lastName: 'Ilunga', category: 'COLLEGUES', seats: 1, tableNumber: 9, personalMessage: 'Patrick, collègue et ami, bienvenue !' },
      { firstName: 'Céline', lastName: 'Kasongo', category: 'AMIS', seats: 2, tableNumber: 7, personalMessage: 'Céline, ta joie de vivre illuminera cette journée.' },
      { firstName: 'Emmanuel', lastName: 'Mwamba', category: 'VIP', seats: 1, tableNumber: 5, personalMessage: 'Monsieur Mwamba, c\'est un honneur de vous compter parmi nos invités.' },
      { firstName: 'Béatrice', lastName: 'Nkulu', category: 'FAMILLE', seats: 3, tableNumber: 2, personalMessage: 'Béatrice, ta famille est la nôtre. Bienvenue !' },
      { firstName: 'François', lastName: 'Lunda', category: 'SPONSORS', seats: 2, tableNumber: 10, personalMessage: 'François, merci pour votre générosité et votre soutien.' },
      { firstName: 'Aimée', lastName: 'Banza', category: 'AMIS', seats: 1, tableNumber: 8, personalMessage: 'Aimée, notre amitié est un trésor.' },
    ];

    for (const guest of guests) {
      const table = await prisma.table.findFirst({ where: { number: guest.tableNumber } });
      const invitationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      await prisma.guest.create({
        data: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          category: guest.category,
          seats: guest.seats,
          personalMessage: guest.personalMessage,
          invitationCode,
          tableId: table?.id || null,
          status: guest.category === 'VIP' || guest.category === 'FAMILLE' ? 'CONFIRMED' : 'PENDING',
        },
      });
    }
    console.log(`✅ Created ${guests.length} sample guests`);
  } else {
    console.log(`⏭️  Guests already exist (${existingGuests})`);
  }

  console.log('🎉 Seeding complete!');
}

async function main() {
  console.log('🔧 Initializing database...');

  try {
    await createTables();
  } catch (error) {
    console.error('⚠️  Table creation error:', error.message);
  }

  try {
    await seedData();
  } catch (error) {
    console.error('⚠️  Seeding error:', error.message);
  }

  console.log('✅ Database ready!');
}

main()
  .catch((e) => {
    console.error('❌ Database initialization error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
