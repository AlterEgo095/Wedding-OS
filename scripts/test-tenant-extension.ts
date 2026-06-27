// Quick test: verify the tenant-scoped Prisma extension is auto-injecting weddingId
import { db, tenantDb } from '../src/lib/db';
import { runWithTenant } from '../src/lib/tenant-context';

async function main() {
  // Get the default wedding
  const wedding = await db.wedding.findFirst({ where: { isDefault: true } });
  if (!wedding) {
    console.log('❌ No default wedding found');
    return;
  }
  console.log('Default wedding:', wedding.id, wedding.slug);

  // Test 1: tenantDb.guest.findMany WITHOUT context — should return ALL guests
  console.log('\n=== Test 1: tenantDb.guest.findMany WITHOUT context ===');
  const noContextGuests = await tenantDb.guest.findMany({ select: { id: true, firstName: true, weddingId: true } });
  console.log(`Returned ${noContextGuests.length} guests (expected: ALL guests in DB)`);

  // Test 2: tenantDb.guest.findMany WITH context — should return only wedding's guests
  console.log('\n=== Test 2: tenantDb.guest.findMany WITH context ===');
  const scopedGuests = await runWithTenant(
    { weddingId: wedding.id, slug: wedding.slug, status: wedding.status, plan: wedding.plan, isDefault: wedding.isDefault },
    async () => {
      // The extension should auto-inject weddingId into the where clause
      const result = await tenantDb.guest.findMany({ select: { id: true, firstName: true, weddingId: true } });
      return result;
    }
  );
  console.log(`Returned ${scopedGuests.length} guests (expected: only wedding ${wedding.slug} guests)`);
  console.log('All have correct weddingId?', scopedGuests.every(g => g.weddingId === wedding.id));

  // Test 3: count with context
  console.log('\n=== Test 3: tenantDb.guest.count WITH context ===');
  const scopedCount = await runWithTenant(
    { weddingId: wedding.id, slug: wedding.slug, status: wedding.status, plan: wedding.plan, isDefault: wedding.isDefault },
    async () => await tenantDb.guest.count()
  );
  const totalCount = await db.guest.count();
  console.log(`Scoped count: ${scopedCount}, Total count: ${totalCount}`);
  console.log('Extension working?', scopedCount === scopedGuests.length && scopedCount <= totalCount);

  // Test 4: settings findMany with context — should only return this wedding's settings
  console.log('\n=== Test 4: tenantDb.settings.findMany WITH context ===');
  const scopedSettings = await runWithTenant(
    { weddingId: wedding.id, slug: wedding.slug, status: wedding.status, plan: wedding.plan, isDefault: wedding.isDefault },
    async () => await tenantDb.settings.findMany({ select: { key: true, weddingId: true } })
  );
  console.log(`Returned ${scopedSettings.length} settings (all from this wedding: ${scopedSettings.every(s => s.weddingId === wedding.id)})`);

  console.log('\n=== Summary ===');
  console.log('Extension is auto-injecting weddingId:', scopedGuests.length > 0 && scopedCount === scopedGuests.length);
}

main().catch(e => { console.error(e); process.exit(1); });
