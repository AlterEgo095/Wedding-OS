// ══════════════════════════════════════════════════════════════════════════════
// Phase 3 Migration — Normalize SUPER_ADMIN → PLATFORM_ADMIN
// ══════════════════════════════════════════════════════════════════════════════
//
// Phase 3 introduces PLATFORM_ADMIN as the canonical role name for the platform
// owner. SUPER_ADMIN is preserved as a legacy alias (isPlatformAdmin() accepts
// both), but the DB should be normalized so that:
//   - All new code uses PLATFORM_ADMIN consistently
//   - The role column doesn't contain a mix of both names
//   - Future queries filtering by role are simpler
//
// This script is IDEMPOTENT — safe to run multiple times.
//
// Usage:
//   bun run scripts/migrate-phase3-roles.ts
//
// What it does:
//   1. Updates all AdminUser rows with role='SUPER_ADMIN' → 'PLATFORM_ADMIN'
//   2. Verifies at least one PLATFORM_ADMIN exists (creates one if none)
//   3. Prints a summary of all users + their roles
//   4. Does NOT touch ORGANIZER/RECEPTION/CONTROLLER roles

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Phase 3 Migration — Normalize SUPER_ADMIN → PLATFORM_ADMIN');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── Step 1: Normalize SUPER_ADMIN → PLATFORM_ADMIN ──────────────────
  const superAdmins = await prisma.adminUser.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true, name: true, role: true, weddingId: true },
  });

  console.log(`Found ${superAdmins.length} user(s) with role='SUPER_ADMIN'`);

  if (superAdmins.length > 0) {
    const result = await prisma.adminUser.updateMany({
      where: { role: 'SUPER_ADMIN' },
      data: { role: 'PLATFORM_ADMIN' },
    });
    console.log(`✅ Updated ${result.count} user(s): SUPER_ADMIN → PLATFORM_ADMIN`);
    for (const u of superAdmins) {
      console.log(`   - ${u.email} (${u.name}) [weddingId=${u.weddingId ?? 'null'}]`);
    }
  } else {
    console.log('⏭️  No SUPER_ADMIN users found — already normalized.');
  }
  console.log('');

  // ─── Step 2: Ensure at least one PLATFORM_ADMIN exists ───────────────
  const platformAdminCount = await prisma.adminUser.count({
    where: { role: 'PLATFORM_ADMIN' },
  });

  if (platformAdminCount === 0) {
    console.log('⚠️  No PLATFORM_ADMIN user found — creating a default one...');
    const hashedPassword = await bcrypt.hash('admin2026', 12);
    await prisma.adminUser.create({
      data: {
        email: 'admin@josue-hornella.wedding',
        password: hashedPassword,
        name: 'Platform Admin',
        role: 'PLATFORM_ADMIN',
        weddingId: null, // platform-wide
      },
    });
    console.log('✅ Created default PLATFORM_ADMIN: admin@josue-hornella.wedding / admin2026');
    console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY in production!');
  } else {
    console.log(`✅ ${platformAdminCount} PLATFORM_ADMIN user(s) already exist(s) — no bootstrap needed.`);
  }
  console.log('');

  // ─── Step 3: Print full user summary ─────────────────────────────────
  const allUsers = await prisma.adminUser.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      weddingId: true,
      lastLoginAt: true,
    },
    orderBy: { role: 'asc' },
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  User Summary (all AdminUser records)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total users: ${allUsers.length}`);
  console.log('');

  const roleGroups = new Map<string, typeof allUsers>();
  for (const u of allUsers) {
    if (!roleGroups.has(u.role)) roleGroups.set(u.role, []);
    roleGroups.get(u.role)!.push(u);
  }

  for (const [role, users] of roleGroups) {
    console.log(`  ${role} (${users.length}):`);
    for (const u of users) {
      const wedding = u.weddingId ? `wedding=${u.weddingId.slice(-8)}` : 'platform-wide';
      const lastLogin = u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 19) : 'never';
      console.log(`    - ${u.email.padEnd(40)} ${u.name.padEnd(20)} ${wedding.padEnd(20)} last login: ${lastLogin}`);
    }
  }
  console.log('');

  // ─── Step 4: Verify no SUPER_ADMIN remains ───────────────────────────
  const remaining = await prisma.adminUser.count({ where: { role: 'SUPER_ADMIN' } });
  if (remaining > 0) {
    console.error(`❌ ERROR: ${remaining} SUPER_ADMIN user(s) still remain — migration failed!`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ✅ Phase 3 role migration COMPLETE — 0 SUPER_ADMIN remaining');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Migration error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
