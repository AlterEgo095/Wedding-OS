// ══════════════════════════════════════════════════════════════════════════════
// prisma/seed.ts — multi-tenant-safe seed script (CONS-2-SECURITY Fix 3 / C8)
// ══════════════════════════════════════════════════════════════════════════════
//
// This is the CANONICAL seed script (the dangerous root-level seed.ts that
// ran global deleteMany() was removed in Phase 1). It is multi-tenant-safe:
//
//   1. Platform admin credentials come from env vars — NEVER hardcoded:
//        - PLATFORM_ADMIN_EMAIL (default: admin@demo.wedding)
//        - PLATFORM_ADMIN_PASSWORD (REQUIRED in production — throws if unset)
//      In dev, a clearly-marked dev-only password is used as a fallback.
//
//   2. The default wedding + sample guests/tables/timeline/stories are demo
//      data, gated behind SEED_DEMO_DATA env var. They are skipped by
//      default in production so a fresh prod DB starts empty.
//
//   3. All writes are idempotent (findFirst-then-create-or-update) — re-running
//      the seed is safe and never destroys existing data.
//
//   4. bcrypt rounds = 12 (matches src/lib/auth.ts — was 10 before, which is
//      below the OWASP minimum recommendation).
//
// Run with: `bun run prisma/seed.ts` or `prisma db seed` (the prisma block
// in package.json points here).

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { buildCoupleLabel } from '../src/lib/types';

const prisma = new PrismaClient();

// V4.8 F-04 — DEMO_WEDDING_SLUG is a literal string used ONLY by this
// dev/test seed. It is NOT exported, NOT used at runtime, and NOT a real
// couple's slug. The runtime DEMO_WEDDING_SLUG is now null (no implicit
// real-wedding selection). This seed fixture creates an obviously-demo
// wedding with slug 'demo-wedding' for first-run development only.
const DEMO_WEDDING_SLUG = 'demo-wedding';

// ─── Platform admin bootstrap credentials (env-driven) ───────────────────────
// In production: PLATFORM_ADMIN_PASSWORD MUST be set — the seed throws
// otherwise (fail-fast beats silently creating a forgeable admin).
// In dev: a clearly-marked dev-only password is used as a fallback so the
// first-run experience still works out-of-the-box.
const PLATFORM_ADMIN_EMAIL =
  process.env.PLATFORM_ADMIN_EMAIL || 'admin@demo.wedding';

function resolvePlatformAdminPassword(): string {
  const env = process.env.PLATFORM_ADMIN_PASSWORD;
  if (env && env.length >= 12) return env;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    throw new Error(
      'FATAL: PLATFORM_ADMIN_PASSWORD is missing or too short (<12 chars) in production. ' +
        'Set it in your .env file before running `prisma db seed`. ' +
        'Generate a strong password with: openssl rand -base64 24'
    );
  }
  // Dev-only fallback — NEVER active in production. Marked clearly so it
  // can be grepped out of any environment that accidentally leaves
  // NODE_ENV unset.
  console.warn(
    'WARNING: PLATFORM_ADMIN_PASSWORD not set — using insecure dev-only fallback (admin2026). ' +
      'Set PLATFORM_ADMIN_PASSWORD in your .env file with: openssl rand -base64 24'
  );
  return 'admin2026';
}

// ─── Demo data gate ──────────────────────────────────────────────────────────
// The default wedding + sample guests/tables/timeline/stories are demo data
// for first-run development. In production, SEED_DEMO_DATA must be explicitly
// set to "1" or "true" to seed them — otherwise the prod DB starts empty
// (only the platform admin is created).
function shouldSeedDemoData(): boolean {
  // V4.7 F-06 — PRODUCTION HARD BLOCK.
  // Even if SEED_DEMO_DATA=1 is set in production, we refuse to seed demo
  // data. This closes the P0 finding (F-06.3): production DB must NEVER
  // contain demo-wedding data (fake couple, fake guests, fake timeline).
  // An operator who needs to seed a real wedding must use the onboarding
  // flow (REGISTER → CREATE WEDDING → PUBLISH), NOT the seed script.
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  const flag = process.env.SEED_DEMO_DATA;
  if (flag === undefined || flag === '') {
    // Default: seed in dev (no PII concern — these are demo fixtures).
    return true;
  }
  return flag === '1' || flag.toLowerCase() === 'true';
}

async function main() {
  console.log('🌱 Seeding database...');
  console.log(
    '   env=%s, demoData=%s, adminEmail=%s',
    process.env.NODE_ENV || 'development',
    shouldSeedDemoData(),
    PLATFORM_ADMIN_EMAIL
  );

  // ─── Create Platform Admin user (platform-wide, no weddingId) ──────────
  // Always created regardless of SEED_DEMO_DATA — every deployment needs at
  // least one admin to log in.
  const adminPassword = resolvePlatformAdminPassword();
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: PLATFORM_ADMIN_EMAIL },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12); // OWASP minimum
    await prisma.adminUser.create({
      data: {
        email: PLATFORM_ADMIN_EMAIL,
        password: hashedPassword,
        name: 'Platform Admin',
        role: 'PLATFORM_ADMIN', // canonical Phase 3 name (SUPER_ADMIN is a legacy alias)
        weddingId: null, // platform-wide
      },
    });
    console.log(
      '✅ Created Platform Admin user (email=%s) — password from PLATFORM_ADMIN_PASSWORD env var',
      PLATFORM_ADMIN_EMAIL
    );
  } else {
    // Normalize any legacy SUPER_ADMIN → PLATFORM_ADMIN on seed re-run.
    // We do NOT re-hash the password here — if the admin already exists,
    // the operator can rotate the password via the /platform/password-reset
    // flow. Re-hashing on every seed run would force the operator to
    // re-set the password every time the seed runs.
    if (existingAdmin.role === 'SUPER_ADMIN') {
      await prisma.adminUser.update({
        where: { id: existingAdmin.id },
        data: { role: 'PLATFORM_ADMIN', name: 'Platform Admin' },
      });
      console.log('✅ Normalized existing admin: SUPER_ADMIN → PLATFORM_ADMIN');
    } else {
      console.log('⏭️  Platform Admin user already exists (email=%s)', PLATFORM_ADMIN_EMAIL);
    }
  }

  if (!shouldSeedDemoData()) {
    console.log('⏭️  Skipping demo data (SEED_DEMO_DATA not set in production)');
    return;
  }

  // ─── Create or update the default wedding (Phase 1 multi-tenant) ────────
  const coupleLabel = buildCoupleLabel('Demo Bride', 'Demo Groom');
  let wedding = await prisma.wedding.findFirst({
    where: { slug: DEMO_WEDDING_SLUG },
  });
  if (!wedding) {
    wedding = await prisma.wedding.create({
      data: {
        // V4.7 F-06 — DEMO COUPLE (no real PII).
        // These fixtures are for first-run development only. They are
        // hard-blocked from production by shouldSeedDemoData() above.
        slug: DEMO_WEDDING_SLUG,
        brideName: 'Demo Bride',
        groomName: 'Demo Groom',
        coupleLabel,
        weddingDate: new Date('2026-12-31T18:00:00+00:00'), // stable demo date
        timezone: 'UTC',
        venueName: 'Demo Venue Hall',
        venueAddress: '123 Demo Street',
        venueCity: 'Demo City',
        venueReference: 'Demo reference point (replace with real value in production)',
        status: 'PUBLISHED',
        plan: 'ELITE',
        isDefault: true,
        publishedAt: new Date(),
      },
    });
    console.log('✅ Created default wedding (slug=%s, id=%s)', wedding.slug, wedding.id);
  } else {
    console.log('⏭️  Default wedding already exists (id=%s)', wedding.id);
  }
  const weddingId = wedding.id;

  // Create default settings (scoped to default wedding)
  const defaultSettings = [
    // V4.7 F-06 — DEMO SETTINGS (no real PII).
    { key: 'groom_name', value: 'Demo Groom' },
    { key: 'bride_name', value: 'Demo Bride' },
    { key: 'wedding_date', value: '2026-12-31' },
    { key: 'wedding_time', value: '18:00' },
    { key: 'site_title', value: 'Mariage Démo' },
    { key: 'site_subtitle', value: 'Jeudi 31 Décembre 2026' },
    { key: 'venue_name', value: 'Demo Venue Hall' },
    { key: 'venue_address', value: '123 Demo Street' },
    { key: 'venue_reference', value: 'Demo reference point (replace with real value in production)' },
    { key: 'venue_city', value: 'Demo City' },
    { key: 'venue_lat', value: '0.0000' },
    { key: 'venue_lng', value: '0.0000' },
    { key: 'venue_parking', value: 'Parking disponible sur place' },
    { key: 'venue_time', value: '18H00' },
    { key: 'invitation_message', value: 'Demo Bride & Demo Groom ont l\'honneur de vous inviter à leur célébration de mariage.' },
    { key: 'hashtag', value: '#DemoWedding2026' },
    { key: 'welcome_message', value: 'Bienvenue sur la plateforme du mariage de démo' },
    { key: 'thank_you_message', value: 'Merci d\'être présent pour célébrer notre union' },
    { key: 'primary_color', value: '#D4A853' },
    { key: 'accent_color', value: '#C8785A' },
  ];

  for (const setting of defaultSettings) {
    // Use composite unique [weddingId, key] — upsert needs the full unique key
    const existing = await prisma.settings.findFirst({
      where: { weddingId, key: setting.key },
    });
    if (existing) {
      await prisma.settings.update({
        where: { id: existing.id },
        data: { value: setting.value },
      });
    } else {
      await prisma.settings.create({
        data: { ...setting, weddingId },
      });
    }
  }
  console.log(`✅ Created/updated ${defaultSettings.length} settings`);

  // Create sample tables (scoped to default wedding)
  const existingTables = await prisma.table.count({ where: { weddingId } });
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
      await prisma.table.create({ data: { ...table, weddingId } });
    }
    console.log(`✅ Created ${tables.length} tables`);
  } else {
    console.log(`⏭️  Tables already exist (${existingTables})`);
  }

  // Create sample guests (scoped to default wedding)
  const existingGuests = await prisma.guest.count({ where: { weddingId } });
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
      const table = await prisma.table.findFirst({ where: { weddingId, number: guest.tableNumber } });
      const invitationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      await prisma.guest.create({
        data: {
          weddingId,
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

  // Create sample timeline events (scoped to default wedding)
  const existingTimeline = await prisma.eventTimeline.count({ where: { weddingId } });
  if (existingTimeline === 0) {
    const events = [
      { time: '13:30', activity: 'Accueil des invités', location: 'Hall d\'entrée', description: 'Accueil et installation des invités avec cocktail de bienvenue', order: 1 },
      { time: '14:00', activity: 'Cérémonie de mariage', location: 'Salle principale', description: 'Échange des vœux et bénédiction nuptiale', order: 2 },
      { time: '15:00', activity: 'Séance photo', location: 'Jardin', description: 'Photos de groupe et du couple', order: 3 },
      { time: '16:00', activity: 'Cocktail de réception', location: 'Terrasse', description: 'Cocktail et amuse-bouches', order: 4 },
      { time: '17:00', activity: 'Entrée du couple', location: 'Salle de réception', description: 'Entrée triomphale du couple démo', order: 5 },
      { time: '17:30', activity: 'Repas de fête', location: 'Salle de réception', description: 'Dîner somptueux en l\'honneur des mariés', order: 6 },
      { time: '19:00', activity: 'Coupe du gâteau', location: 'Salle de réception', description: 'Cérémonie de la coupe du gâteau de mariage', order: 7 },
      { time: '19:30', activity: 'Soirée dansante', location: 'Piste de danse', description: 'DJ et soirée dansante jusqu\'au bout de la nuit', order: 8 },
    ];

    for (const event of events) {
      await prisma.eventTimeline.create({ data: { ...event, weddingId } });
    }
    console.log(`✅ Created ${events.length} timeline events`);
  } else {
    console.log(`⏭️  Timeline events already exist (${existingTimeline})`);
  }

  // Create couple stories (scoped to default wedding)
  const existingStories = await prisma.coupleStory.count({ where: { weddingId } });
  if (existingStories === 0) {
    const stories = [
      {
        title: 'Notre Première Rencontre',
        description: 'C\'était un jour ordinaire qui allait changer notre vie. Un regard, un sourire, et le monde s\'est arrêté de tourner.',
        date: '2021',
        imageUrl: '/upload/couple-photo-1.jpeg',
        order: 1,
      },
      {
        title: 'Le Premier « Je t\'aime »',
        description: 'Les mots les plus doux ont été murmurés sous les étoiles de la ville de démo. Un moment gravé dans nos cœurs pour l\'éternité.',
        date: '2022',
        imageUrl: '/upload/couple-photo-2.png',
        order: 2,
      },
      {
        title: 'La Demande',
        description: 'À genoux, le cœur battant, la question a été posée. Et la réponse était oui ! Un oui qui résonne encore dans nos vies.',
        date: '2024',
        imageUrl: null,
        order: 3,
      },
    ];

    for (const story of stories) {
      await prisma.coupleStory.create({ data: { ...story, weddingId } });
    }
    console.log(`✅ Created ${stories.length} couple stories`);
  } else {
    console.log(`⏭️  Couple stories already exist (${existingStories})`);
  }

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
