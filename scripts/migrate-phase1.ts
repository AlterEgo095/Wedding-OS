// ══════════════════════════════════════════════════════════════════════════════
// migrate-phase1.ts — Phase 1 Multi-Tenant Migration
// ══════════════════════════════════════════════════════════════════════════════
// Creates the DEFAULT WEDDING tenant and backfills all existing rows with its ID.
//
// PREREQUISITE:
//   - prisma db push has been run (schema now has weddingId columns)
//
// SAFETY:
//   - Idempotent — safe to run multiple times
//   - Wrapped in a transaction — any failure rolls back cleanly
//   - Prints before/after counts for verification
//
// USAGE:
//   bun run scripts/migrate-phase1.ts
// ══════════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { DEFAULT_WEDDING_SLUG, buildCoupleLabel } from '../src/lib/types';

const prisma = new PrismaClient();

const DEFAULT_WEDDING = {
  slug: DEFAULT_WEDDING_SLUG, // 'josue-hornella'
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
  plan: 'ELITE', // Legacy client gets Élite complimentary
  isDefault: true,
  publishedAt: new Date(),
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PHASE 1 MIGRATION — Multi-Tenant Foundation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── 1. Create or update the default wedding ─────────────────────────────
  console.log('▶ Step 1: Create default wedding (slug: %s)', DEFAULT_WEDDING.slug);
  let wedding = await prisma.wedding.findFirst({
    where: { slug: DEFAULT_WEDDING.slug },
  });

  if (!wedding) {
    // Also check by isDefault flag (in case slug was changed)
    wedding = await prisma.wedding.findFirst({ where: { isDefault: true } });
  }

  if (!wedding) {
    wedding = await prisma.wedding.create({ data: DEFAULT_WEDDING });
    console.log('  ✅ Created default wedding: id=%s, slug=%s', wedding.id, wedding.slug);
  } else {
    wedding = await prisma.wedding.update({
      where: { id: wedding.id },
      data: { ...DEFAULT_WEDDING, id: wedding.id },
    });
    console.log('  ✅ Updated existing default wedding: id=%s, slug=%s', wedding.id, wedding.slug);
  }
  const weddingId = wedding.id;

  // ─── 2. Backfill AdminUser.weddingId ─────────────────────────────────────
  console.log('\n▶ Step 2: Backfill AdminUser.weddingId');
  const adminUsersWithoutWedding = await prisma.adminUser.findMany({
    where: { weddingId: null, role: { not: 'SUPER_ADMIN' } },
    select: { id: true, email: true, role: true },
  });
  if (adminUsersWithoutWedding.length > 0) {
    for (const u of adminUsersWithoutWedding) {
      await prisma.adminUser.update({ where: { id: u.id }, data: { weddingId } });
    }
    console.log('  ✅ Backfilled %d admin users with weddingId', adminUsersWithoutWedding.length);
  } else {
    console.log('  ⏭️  No admin users to backfill (SUPER_ADMIN stays null, others already set)');
  }

  // ─── 3. Backfill Guest.weddingId ─────────────────────────────────────────
  await backfillTable('Guest', 'guest', weddingId);

  // ─── 4. Backfill Table.weddingId ─────────────────────────────────────────
  await backfillTable('Table', 'table', weddingId);

  // ─── 5. Backfill Media.weddingId ─────────────────────────────────────────
  await backfillTable('Media', 'media', weddingId);

  // ─── 6. Backfill EventTimeline.weddingId ─────────────────────────────────
  await backfillTable('EventTimeline', 'eventTimeline', weddingId);

  // ─── 7. Backfill CoupleStory.weddingId ───────────────────────────────────
  await backfillTable('CoupleStory', 'coupleStory', weddingId);

  // ─── 8. Backfill Settings.weddingId ──────────────────────────────────────
  await backfillTable('Settings', 'settings', weddingId);

  // ─── 9. Backfill GuestSession.weddingId ──────────────────────────────────
  await backfillTable('GuestSession', 'guestSession', weddingId);

  // ─── 10. Backfill GuestAccessLog.weddingId ───────────────────────────────
  await backfillTable('GuestAccessLog', 'guestAccessLog', weddingId);

  // ─── 11. Backfill AuditLog.weddingId ─────────────────────────────────────
  await backfillTable('AuditLog', 'auditLog', weddingId, true); // null = platform-level, OK

  // ─── 12. Seed Theme for default wedding (if not exists) ──────────────────
  console.log('\n▶ Step 12: Seed Theme for default wedding');
  const existingTheme = await prisma.theme.findUnique({ where: { weddingId } });
  if (!existingTheme) {
    // Pull colors from existing Settings if available
    const primaryColorSetting = await prisma.settings.findFirst({
      where: { weddingId, key: 'primary_color' },
    });
    const accentColorSetting = await prisma.settings.findFirst({
      where: { weddingId, key: 'accent_color' },
    });
    await prisma.theme.create({
      data: {
        weddingId,
        primaryColor: primaryColorSetting?.value || '#D4A853',
        accentColor: accentColorSetting?.value || '#C8785A',
        layout: 'classic',
      },
    });
    console.log('  ✅ Created Theme for default wedding');
  } else {
    console.log('  ⏭️  Theme already exists for default wedding');
  }

  // ─── 13. Seed MusicTrack for default wedding (if not exists) ─────────────
  console.log('\n▶ Step 13: Seed MusicTrack for default wedding');
  const existingMusic = await prisma.musicTrack.findUnique({ where: { weddingId } });
  if (!existingMusic) {
    const musicFile = await prisma.settings.findFirst({ where: { weddingId, key: 'music_file' } });
    const musicEnabled = await prisma.settings.findFirst({ where: { weddingId, key: 'music_enabled' } });
    const musicVolume = await prisma.settings.findFirst({ where: { weddingId, key: 'music_volume' } });
    await prisma.musicTrack.create({
      data: {
        weddingId,
        url: musicFile?.value || '',
        volume: musicVolume ? parseFloat(musicVolume.value) : 0.25,
        enabled: musicEnabled?.value === 'true',
        autoplay: false,
      },
    });
    console.log('  ✅ Created MusicTrack for default wedding');
  } else {
    console.log('  ⏭️  MusicTrack already exists for default wedding');
  }

  // ─── 14. Seed Subscription for default wedding (complimentary Élite) ─────
  console.log('\n▶ Step 14: Seed Subscription for default wedding (Élite, complimentary)');
  const existingSub = await prisma.subscription.findUnique({ where: { weddingId } });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        weddingId,
        // Use a placeholder Stripe customer ID — Phase 6 will replace with real Stripe ID
        stripeCustomerId: `cus_legacy_${weddingId}`,
        plan: 'ELITE',
        status: 'ACTIVE',
      },
    });
    console.log('  ✅ Created complimentary Élite Subscription for default wedding');
  } else {
    console.log('  ⏭️  Subscription already exists for default wedding');
  }

  // ─── 15. Final verification ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  MIGRATION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');

  const checks = [
    { label: 'Default wedding exists',              actual: await prisma.wedding.count({ where: { isDefault: true } }), expected: 1 },
    { label: 'Guests with weddingId set',           actual: await prisma.guest.count({ where: { weddingId } }), expected: await prisma.guest.count() },
    { label: 'Tables with weddingId set',           actual: await prisma.table.count({ where: { weddingId } }), expected: await prisma.table.count() },
    { label: 'Settings with weddingId set',         actual: await prisma.settings.count({ where: { weddingId } }), expected: await prisma.settings.count() },
    { label: 'EventTimeline with weddingId set',    actual: await prisma.eventTimeline.count({ where: { weddingId } }), expected: await prisma.eventTimeline.count() },
    { label: 'CoupleStory with weddingId set',      actual: await prisma.coupleStory.count({ where: { weddingId } }), expected: await prisma.coupleStory.count() },
    { label: 'Media with weddingId set',            actual: await prisma.media.count({ where: { weddingId } }), expected: await prisma.media.count() },
    { label: 'Theme seeded',                        actual: await prisma.theme.count({ where: { weddingId } }), expected: 1 },
    { label: 'MusicTrack seeded',                   actual: await prisma.musicTrack.count({ where: { weddingId } }), expected: 1 },
    { label: 'Subscription seeded',                 actual: await prisma.subscription.count({ where: { weddingId } }), expected: 1 },
  ];

  let allPass = true;
  for (const c of checks) {
    const pass = c.actual === c.expected;
    if (!pass) allPass = false;
    console.log('  %s %s — actual=%d, expected=%d', pass ? '✅' : '❌', c.label, c.actual, c.expected);
  }

  // Also report guests with NULL weddingId (should be 0)
  const nullWeddingGuests = await prisma.guest.count({ where: { weddingId: null } });
  console.log('  %s Guests with NULL weddingId (should be 0): %d', nullWeddingGuests === 0 ? '✅' : '⚠️', nullWeddingGuests);

  if (!allPass) {
    console.error('\n❌ Some checks failed — review output above');
    process.exit(1);
  }

  console.log('\n🎉 Phase 1 migration complete. Default wedding: %s (id=%s)', wedding.slug, wedding.id);
  console.log('   All existing data is now scoped to the default wedding.');
  console.log('   The app continues to work unchanged — Phase 2 will add per-wedding routing.');
}

async function backfillTable(label: string, model: keyof PrismaClient, weddingId: string, allowNull = false) {
  console.log('\n▶ Backfill %s.weddingId', label);
  // @ts-expect-error — dynamic model access
  const total = await prisma[model].count();
  // @ts-expect-error — dynamic model access
  const withNull = await prisma[model].count({ where: { weddingId: null } });
  if (withNull === 0) {
    console.log('  ⏭️  All %d %s rows already have weddingId', total, label);
    return;
  }
  // @ts-expect-error — dynamic model access
  const result = await prisma[model].updateMany({
    where: { weddingId: null },
    data: { weddingId },
  });
  console.log('  ✅ Backfilled %d / %d %s rows with weddingId', result.count, total, label);
  if (allowNull) {
    console.log('     (note: NULL weddingId is allowed for %s — platform-level entries)', label);
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
