// Fix admin weddingId to null (PLATFORM_ADMIN should have null weddingId)
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const admin = await p.adminUser.update({
    where: { email: 'admin@josue-hornella.wedding' },
    data: { weddingId: null },
  });
  console.log('Admin updated:', admin.email, admin.role, 'weddingId:', admin.weddingId);
  
  // Also verify all multi-tenant tables are queryable
  const weddingCount = await p.wedding.count();
  const themeCount = await p.theme.count();
  const subCount = await p.subscription.count();
  const adminCount = await p.adminUser.count();
  console.log(`Counts: weddings=${weddingCount}, themes=${themeCount}, subs=${subCount}, admins=${adminCount}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
