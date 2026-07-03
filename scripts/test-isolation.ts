// ══════════════════════════════════════════════════════════════════════════════
// Phase 2 — Tenant Isolation Test
// ══════════════════════════════════════════════════════════════════════════════
// Creates a SECOND wedding with sample data, then verifies that:
//   1. tenantDb.guest.findMany() in Wedding A context → 0 of Wedding B's guests
//   2. tenantDb.guest.findMany() in Wedding B context → 0 of Wedding A's guests
//   3. tenantDb.guest.findFirst({ where: { id: A_guest_id } }) in B context → null
//   4. tenantDb.guest.count() in A context → only counts A's guests
//   5. tenantDb.settings.findMany() in A context → 0 of B's settings
//   6. tenantDb.eventTimeline.findMany() in A context → 0 of B's events
//   7. db (raw, unscoped) → returns BOTH weddings (proves raw client is for platform ops)
//
// Cleanup: deletes Wedding B at the end (cascades to its guests/settings/events).

import { db, tenantDb } from '../src/lib/db';
import { runWithTenant, invalidateWeddingCache } from '../src/lib/tenant-context';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string) {
  results.push({ name, passed: condition, detail });
  console.log(`${condition ? '✅ PASS' : '❌ FAIL'} — ${name}`);
  console.log(`   ${detail}\n`);
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  Phase 2 — Tenant Isolation Test');
  console.log('════════════════════════════════════════════════════════════════\n');

  // ─── Setup: get default wedding A ────────────────────────────────────────
  const weddingA = await db.wedding.findFirst({ where: { isDefault: true } });
  if (!weddingA) throw new Error('Default wedding A not found — run migrate-phase1.ts first');

  const weddingAGuestsBefore = await db.guest.count({ where: { weddingId: weddingA.id } });
  console.log(`Wedding A: ${weddingA.slug} (${weddingA.id}) — ${weddingAGuestsBefore} existing guests\n`);

  // ─── Setup: create Wedding B with sample data ────────────────────────────
  console.log('Creating Wedding B (test-isolation-phase2) with sample data...');
  const weddingB = await db.wedding.create({
    data: {
      slug: 'test-isolation-phase2',
      brideName: 'Isolation',
      groomName: 'Test',
      coupleLabel: 'Isolation & Test',
      status: 'PUBLISHED',
      plan: 'TRIAL',
      isDefault: false,
    },
  });
  console.log(`Wedding B: ${weddingB.slug} (${weddingB.id})\n`);

  // Create 3 guests in Wedding B
  const weddingBGuests = await db.$transaction([
    db.guest.create({ data: { weddingId: weddingB.id, firstName: 'B-Guest', lastName: 'One', invitationCode: 'BISO-001', category: 'AMIS' } }),
    db.guest.create({ data: { weddingId: weddingB.id, firstName: 'B-Guest', lastName: 'Two', invitationCode: 'BISO-002', category: 'AMIS' } }),
    db.guest.create({ data: { weddingId: weddingB.id, firstName: 'B-Guest', lastName: 'Three', invitationCode: 'BISO-003', category: 'AMIS' } }),
  ]);

  // Create settings in Wedding B
  await db.settings.createMany({
    data: [
      { weddingId: weddingB.id, key: 'site_title', value: 'Isolation Test Wedding' },
      { weddingId: weddingB.id, key: 'bride_name', value: 'Isolation' },
      { weddingId: weddingB.id, key: 'groom_name', value: 'Test' },
    ],
  });

  // Create timeline event in Wedding B
  await db.eventTimeline.create({
    data: { weddingId: weddingB.id, time: '12:00', activity: 'B-Wedding Event', order: 0 },
  });

  // Create table in Wedding B with number 1 (would conflict with A's table #1 if globally unique)
  const weddingBTable = await db.table.create({
    data: { weddingId: weddingB.id, name: 'B-Table-1', number: 1, capacity: 8 },
  });

  console.log(`Created ${weddingBGuests.length} guests, 3 settings, 1 event, 1 table (#1 — same number as Wedding A would have)\n`);

  const ctxA = { weddingId: weddingA.id, slug: weddingA.slug, status: weddingA.status, plan: weddingA.plan, isDefault: weddingA.isDefault };
  const ctxB = { weddingId: weddingB.id, slug: weddingB.slug, status: weddingB.status, plan: weddingB.plan, isDefault: weddingB.isDefault };

  // ─── Test 1: findMany in A context → 0 of B's guests ─────────────────────
  console.log('─── Test 1: findMany guests in Wedding A context ───');
  const guestsInA = await runWithTenant(ctxA, async () =>
    await tenantDb.guest.findMany({ select: { id: true, firstName: true, lastName: true, weddingId: true } })
  );
  const aHasBGuests = guestsInA.some(g => g.weddingId === weddingB.id);
  assert(
    'findMany in A context excludes B guests',
    !aHasBGuests && guestsInA.length === weddingAGuestsBefore,
    `A context returned ${guestsInA.length} guests (expected ${weddingAGuestsBefore}, all from A). B guests leaked: ${aHasBGuests}`
  );

  // ─── Test 2: findMany in B context → only B's 3 guests ───────────────────
  console.log('─── Test 2: findMany guests in Wedding B context ───');
  const guestsInB = await runWithTenant(ctxB, async () =>
    await tenantDb.guest.findMany({ select: { id: true, firstName: true, lastName: true, weddingId: true } })
  );
  const bHasAGuests = guestsInB.some(g => g.weddingId === weddingA.id);
  assert(
    'findMany in B context excludes A guests',
    !bHasAGuests && guestsInB.length === 3,
    `B context returned ${guestsInB.length} guests (expected 3). A guests leaked: ${bHasAGuests}`
  );

  // ─── Test 3: findFirst by ID — A's guest in B context → null ─────────────
  console.log('─── Test 3: findFirst by ID — A guest in B context ───');
  const aGuest = await db.guest.findFirst({ where: { weddingId: weddingA.id } });
  if (aGuest) {
    const crossLeak = await runWithTenant(ctxB, async () =>
      await tenantDb.guest.findFirst({ where: { id: aGuest.id } })
    );
    assert(
      'findFirst by ID — A guest not visible in B context',
      crossLeak === null,
      `B context looked up A guest by ID → ${crossLeak === null ? 'null (correct)' : 'LEAKED ' + JSON.stringify(crossLeak)}`
    );
  }

  // ─── Test 4: count in A context → only counts A's guests ─────────────────
  console.log('─── Test 4: count guests in Wedding A context ───');
  const countA = await runWithTenant(ctxA, async () => await tenantDb.guest.count());
  assert(
    'count in A context = A guest count',
    countA === weddingAGuestsBefore,
    `A context count: ${countA} (expected ${weddingAGuestsBefore})`
  );

  const countB = await runWithTenant(ctxB, async () => await tenantDb.guest.count());
  assert(
    'count in B context = 3',
    countB === 3,
    `B context count: ${countB} (expected 3)`
  );

  // ─── Test 5: settings findMany in A context → 0 of B's settings ──────────
  console.log('─── Test 5: findMany settings in Wedding A context ───');
  const settingsInA = await runWithTenant(ctxA, async () =>
    await tenantDb.settings.findMany({ select: { key: true, weddingId: true } })
  );
  const aHasBSettings = settingsInA.some(s => s.weddingId === weddingB.id);
  assert(
    'settings findMany in A excludes B settings',
    !aHasBSettings,
    `A context returned ${settingsInA.length} settings. B settings leaked: ${aHasBSettings}`
  );

  // ─── Test 6: eventTimeline findMany in A context → 0 of B's events ───────
  console.log('─── Test 6: findMany timeline in Wedding A context ───');
  const eventsInA = await runWithTenant(ctxA, async () =>
    await tenantDb.eventTimeline.findMany()
  );
  const aHasBEvents = eventsInA.some(e => e.activity === 'B-Wedding Event');
  assert(
    'timeline findMany in A excludes B events',
    !aHasBEvents,
    `A context returned ${eventsInA.length} events. B events leaked: ${aHasBEvents}`
  );

  // ─── Test 7: raw db (no extension) → returns BOTH weddings' data ─────────
  console.log('─── Test 7: raw db returns BOTH weddings (platform ops) ───');
  const allGuests = await db.guest.findMany({ select: { id: true, weddingId: true } });
  const hasA = allGuests.some(g => g.weddingId === weddingA.id);
  const hasB = allGuests.some(g => g.weddingId === weddingB.id);
  assert(
    'raw db returns both weddings (platform ops)',
    hasA && hasB,
    `Total guests across all weddings: ${allGuests.length}. Has A: ${hasA}, Has B: ${hasB}`
  );

  // ─── Test 8: composite unique [weddingId, number] — both weddings can have table #1 ─
  console.log('─── Test 8: composite unique [weddingId, number] allows same number in different weddings ───');
  const aTableWithNumber1 = await runWithTenant(ctxA, async () =>
    await tenantDb.table.findFirst({ where: { number: 1 } })
  );
  const bTableWithNumber1 = await runWithTenant(ctxB, async () =>
    await tenantDb.table.findFirst({ where: { number: 1 } })
  );
  assert(
    'Table #1 exists in BOTH weddings (scoped unique constraint works)',
    aTableWithNumber1 !== null && bTableWithNumber1 !== null && aTableWithNumber1.id !== bTableWithNumber1.id,
    `A table #1: ${aTableWithNumber1?.id ?? 'null'}, B table #1: ${bTableWithNumber1?.id ?? 'null'} — different IDs: ${aTableWithNumber1?.id !== bTableWithNumber1?.id}`
  );

  // ─── Test 9: invitationCode composite unique — same code in different weddings ─
  console.log('─── Test 9: composite unique [weddingId, invitationCode] ───');
  // Wedding A and B both can have invitationCode 'BISO-001' (B has it; A can have it too)
  const aGuestWithBISO001 = await runWithTenant(ctxA, async () =>
    await tenantDb.guest.findFirst({ where: { invitationCode: 'BISO-001' } })
  );
  assert(
    'invitationCode BISO-001 not visible in A context',
    aGuestWithBISO001 === null,
    `A context looked up invitationCode BISO-001 → ${aGuestWithBISO001 === null ? 'null (correct)' : 'LEAKED'}`
  );

  // ─── Cleanup ─────────────────────────────────────────────────────────────
  console.log('─── Cleanup: deleting Wedding B ───');
  await db.wedding.delete({ where: { id: weddingB.id } });
  invalidateWeddingCache(weddingB.slug);

  // Verify cleanup
  const bGuestsAfter = await db.guest.count({ where: { weddingId: weddingB.id } });
  const bSettingsAfter = await db.settings.count({ where: { weddingId: weddingB.id } });
  const bEventsAfter = await db.eventTimeline.count({ where: { weddingId: weddingB.id } });
  const bTablesAfter = await db.table.count({ where: { weddingId: weddingB.id } });
  assert(
    'Wedding B deleted with cascade cleanup',
    bGuestsAfter === 0 && bSettingsAfter === 0 && bEventsAfter === 0 && bTablesAfter === 0,
    `After delete: ${bGuestsAfter} guests, ${bSettingsAfter} settings, ${bEventsAfter} events, ${bTablesAfter} tables (all should be 0)`
  );

  // ─── Final summary ───────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  ISOLATION TEST SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total:    ${results.length}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.detail}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 All isolation tests passed — Phase 2 anti-leak guard is working!');
  }
}

main().catch(e => {
  console.error('Test script crashed:', e);
  process.exit(1);
});
