// ━━━ V4 — Wedding factory (fixtures) ━━━
// Helpers to create isolated Wedding tenants + guests + invitations
// for unit/integration tests. Mirrors the prisma/seed.ts shape but lighter.
//
// Every test that needs data should import { makeWedding, makeGuest, ... }.

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

let prisma: PrismaClient | null = null;

export function testDb(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

export async function makeWedding(overrides: Partial<{
  slug: string; brideName: string; groomName: string; status: string; plan: string;
}> = {}) {
  return testDb().wedding.create({
    data: {
      slug: overrides.slug ?? `test-${uuidv4().slice(0, 8)}`,
      brideName: overrides.brideName ?? 'Alice',
      groomName: overrides.groomName ?? 'Bob',
      status: overrides.status ?? 'DRAFT',
      plan: overrides.plan ?? 'TRIAL',
    },
  });
}

export async function makeGuest(weddingId: string, overrides: Partial<{
  firstName: string; lastName: string; invitationCode: string; status: string;
}> = {}) {
  return testDb().guest.create({
    data: {
      weddingId,
      firstName: overrides.firstName ?? 'Guest',
      lastName: overrides.lastName ?? 'Test',
      invitationCode: overrides.invitationCode ?? `G-${uuidv4().slice(0, 6).toUpperCase()}`,
      status: overrides.status ?? 'PENDING',
    },
  });
}

export async function teardownTenants(weddingIds: string[]) {
  // Cascade rules delete all tenant-scoped rows when a Wedding is deleted.
  await testDb().wedding.deleteMany({ where: { id: { in: weddingIds } } });
}
