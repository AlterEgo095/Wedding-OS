/**
 * MISSION 5.8.12 — Provision premium invitation credits for the demo wedding.
 *
 * This mimics src/lib/credits.ts::addCredits() — creates the Credit row,
 * CreditTransaction ledger entry, and CreditBalance snapshot in a single
 * transaction. Also upserts a MAX_INVITATIONS Entitlement (1000) so the
 * plan-quota gate (P2.9) passes for ELITE.
 *
 * Run inside the container:
 *   docker exec wedding-app node /app/scripts/provision-premium-credits.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const WEDDING_ID = 'cmqvi4exn0000shoqvdvwaf0w';
const ADMIN_ID = 'cmptkr8a70000sq08eiiecnjy'; // admin@mariage.fr
const CREDIT_TYPE = 'INVITATION';
const QUANTITY = 1000; // headroom for 243 + future regen
const REASON = 'PURCHASE';
const NOTE = 'Premium invitation chain activation (Mission 5.8.12)';

(async () => {
  console.log('Provisioning', QUANTITY, CREDIT_TYPE, 'credits for wedding', WEDDING_ID);

  const result = await p.$transaction(async (tx) => {
    // 1. Upsert Credit row (balance += QUANTITY)
    const credit = await tx.credit.upsert({
      where: { weddingId_type: { weddingId: WEDDING_ID, type: CREDIT_TYPE } },
      update: { balance: { increment: QUANTITY } },
      create: {
        weddingId: WEDDING_ID,
        type: CREDIT_TYPE,
        balance: QUANTITY,
        reserved: 0,
      },
    });
    console.log('  Credit row:', credit.id, 'balance=', credit.balance);

    // 2. Create CreditTransaction (delta=+QUANTITY, reason=PURCHASE)
    const txRow = await tx.creditTransaction.create({
      data: {
        weddingId: WEDDING_ID,
        creditType: CREDIT_TYPE,
        creditId: credit.id,
        delta: QUANTITY,
        reason: REASON,
        note: NOTE,
        createdBy: ADMIN_ID,
      },
    });
    console.log('  CreditTransaction row:', txRow.id, 'delta=+', txRow.delta);

    // 3. Upsert CreditBalance (lifetimePurchased += QUANTITY, currentBalance += QUANTITY)
    const balance = await tx.creditBalance.upsert({
      where: { weddingId_type: { weddingId: WEDDING_ID, type: CREDIT_TYPE } },
      update: {
        lifetimePurchased: { increment: QUANTITY },
        currentBalance: { increment: QUANTITY },
      },
      create: {
        weddingId: WEDDING_ID,
        type: CREDIT_TYPE,
        lifetimePurchased: QUANTITY,
        currentBalance: QUANTITY,
      },
    });
    console.log('  CreditBalance row:', balance.id, 'current=', balance.currentBalance);

    // 4. Upsert MAX_INVITATIONS Entitlement (value=1000) so P2.9 plan-quota gate passes
    const ent = await tx.entitlement.upsert({
      where: { weddingId_type: { weddingId: WEDDING_ID, type: 'MAX_INVITATIONS' } },
      update: { value: '1000', origin: 'MANUAL_OVERRIDE' },
      create: {
        weddingId: WEDDING_ID,
        type: 'MAX_INVITATIONS',
        origin: 'MANUAL_OVERRIDE',
        value: '1000',
      },
    });
    console.log('  Entitlement row:', ent.id, 'value=', ent.value);

    // 5. Also upsert BULK_INVITATIONS Entitlement (value=true) so bulk-endpoint gate passes
    const bulkEnt = await tx.entitlement.upsert({
      where: { weddingId_type: { weddingId: WEDDING_ID, type: 'BULK_INVITATIONS' } },
      update: { value: 'true', origin: 'MANUAL_OVERRIDE' },
      create: {
        weddingId: WEDDING_ID,
        type: 'BULK_INVITATIONS',
        origin: 'MANUAL_OVERRIDE',
        value: 'true',
      },
    });
    console.log('  Bulk entitlement:', bulkEnt.id, 'value=', bulkEnt.value);

    return { credit, balance, ent };
  });

  console.log('\n[OK] Provisioned successfully.');
  console.log('  Final balance:', result.balance.currentBalance, CREDIT_TYPE, 'credits');
  console.log('  MAX_INVITATIONS entitlement:', result.ent.value);

  // Verify
  const finalCredits = await p.credit.findMany({ where: { weddingId: WEDDING_ID } });
  console.log('\nFinal credit rows:');
  for (const c of finalCredits) {
    console.log('  -', c.type, 'balance=', c.balance, 'reserved=', c.reserved);
  }
})().then(() => p.$disconnect()).catch((e) => {
  console.error('ERR:', e.message);
  console.error(e.stack);
  process.exit(1);
});
