// ━━━ V4.7 F-03 — Cache / Propagation tests ━━━
//
// Verifies that the 4 endpoints identified in F-03.1 (settings, tables,
// timeline, couple-story) NOW call invalidateWeddingCache(ctx.slug) after
// their revalidatePath block. This ensures the unstable_cache({ tags:
// ['wedding-{slug}'] }) data layer is busted alongside the route cache,
// so organizer edits propagate to the public invitation page without delay.
//
// We mock the DB + invalidateWeddingCache + revalidatePath so the test
// verifies only the CALL, not the side-effect. This is a static-behavior
// test — we don't actually mutate DB rows or invoke the real Next.js cache.
//
// SAFETY: tests are isolated. No production DB, no real cache invalidation.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted by Vitest above all imports — any variable
// they reference must be declared with vi.hoisted() so it survives hoisting.

const { invalidateWeddingCacheMock, revalidatePathMock, tableFindFirstMock } = vi.hoisted(() => ({
  invalidateWeddingCacheMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  // table.findFirst returns different values per test (null for create,
  // existing for PUT/DELETE). We use a single mock and override per-test.
  tableFindFirstMock: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/tenant-context', () => ({
  withPublicTenant: (handler: any) => async (req: any, ...rest: any[]) => {
    const ctx = { slug: 'demo-slug', weddingId: 'wed-test', isDefault: false, status: 'PUBLISHED', plan: 'TRIAL' };
    return handler(req, ctx, ...rest);
  },
  withAdminTenantHandler: async (req: any, _user: any, handler: any) => {
    const ctx = { slug: 'demo-slug', weddingId: 'wed-test', isDefault: false, status: 'PUBLISHED', plan: 'TRIAL' };
    return await handler(req, ctx);
  },
  invalidateWeddingCache: invalidateWeddingCacheMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    eventTimeline: {
      findFirst: vi.fn().mockResolvedValue({ id: 'e1', weddingId: 'wed-test' }),
      create: vi.fn().mockResolvedValue({ id: 'e1', time: '14:00', activity: 'Ceremony' }),
      update: vi.fn().mockResolvedValue({ id: 'e1', time: '14:00', activity: 'Ceremony' }),
      delete: vi.fn().mockResolvedValue({}),
    },
    table: {
      findFirst: tableFindFirstMock,
      create: vi.fn().mockResolvedValue({ id: 't1', number: 1, name: 'T1' }),
      update: vi.fn().mockResolvedValue({ id: 't1', number: 1, name: 'T1' }),
      delete: vi.fn().mockResolvedValue({}),
    },
    coupleStory: {
      findFirst: vi.fn().mockResolvedValue({ id: 'c1', weddingId: 'wed-test' }),
      create: vi.fn().mockResolvedValue({ id: 'c1', title: 'X', description: 'Y' }),
      update: vi.fn().mockResolvedValue({ id: 'c1', title: 'X', description: 'Y' }),
      delete: vi.fn().mockResolvedValue({}),
    },
    settings: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
  tenantDb: {
    settings: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    table: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: tableFindFirstMock,   // shared with db.table.findFirst
      create: vi.fn().mockResolvedValue({ id: 't1', number: 1, name: 'T1' }),
      update: vi.fn().mockResolvedValue({ id: 't1', number: 1, name: 'T1' }),
      delete: vi.fn().mockResolvedValue({}),
    },
    eventTimeline: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'e1', weddingId: 'wed-test' }),
      create: vi.fn().mockResolvedValue({ id: 'e1', time: '14:00', activity: 'Ceremony' }),
      update: vi.fn().mockResolvedValue({ id: 'e1', time: '14:00', activity: 'Ceremony' }),
      delete: vi.fn().mockResolvedValue({}),
    },
    coupleStory: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'c1', weddingId: 'wed-test' }),
      create: vi.fn().mockResolvedValue({ id: 'c1', title: 'X', description: 'Y' }),
      update: vi.fn().mockResolvedValue({ id: 'c1', title: 'X', description: 'Y' }),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn().mockResolvedValue({
    id: 'u1', email: 'org@test', name: 'Org', role: 'ORGANIZER', weddingId: 'wed-test', organizationId: null,
  }),
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-errors', () => ({
  internalError: vi.fn(() => new Response('Internal', { status: 500 })),
  badRequest: vi.fn((m: string) => new Response(m, { status: 400 })),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { PUT as settingsPut } from '@/app/api/settings/route';
import * as tablesRoute from '@/app/api/tables/route';
import * as timelineRoute from '@/app/api/timeline/route';
import * as coupleStoryRoute from '@/app/api/couple-story/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(method: string, body: unknown, query: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/test-route');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('x-wedding-slug', 'demo-slug');
  return {
    method,
    url: url.toString(),
    headers,
    cookies: { get: () => undefined },
    json: async () => body,
    nextUrl: { searchParams: url.searchParams },
  } as any;
}

beforeEach(() => {
  invalidateWeddingCacheMock.mockClear();
  revalidatePathMock.mockClear();
  // Reset table.findFirst to default (null = no duplicate, allows create).
  tableFindFirstMock.mockReset();
  tableFindFirstMock.mockResolvedValue(null);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('V4.7 F-03 — Cache propagation: mutation handlers call invalidateWeddingCache', () => {

  // ── settings PUT ─────────────────────────────────────────────────────────
  it('settings PUT calls invalidateWeddingCache(slug)', async () => {
    await settingsPut(makeRequest('PUT', { settings: { foo: 'bar' } }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  // ── tables POST/PUT/DELETE ────────────────────────────────────────────────
  it('tables POST (create) calls invalidateWeddingCache(slug)', async () => {
    // POST calls findFirst to check for duplicate → mock returns null (no dup).
    await tablesRoute.POST(makeRequest('POST', { name: 'T1', number: 1 }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  it('tables PUT (update) calls invalidateWeddingCache(slug)', async () => {
    // PUT calls findFirst twice: 1st = existing (line 145), 2nd = duplicate check (line 150, must return null).
    tableFindFirstMock.mockReset();
    tableFindFirstMock
      .mockResolvedValueOnce({ id: 't1', weddingId: 'wed-test', name: 'T1', number: 1 })
      .mockResolvedValueOnce(null);  // no duplicate
    await tablesRoute.PUT(makeRequest('PUT', { id: 't1', name: 'T1', number: 1 }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  it('tables DELETE calls invalidateWeddingCache(slug)', async () => {
    // DELETE calls findFirst({ where: { id, weddingId } }) → must return existing with _count.guests=0
    tableFindFirstMock.mockReset();
    tableFindFirstMock.mockResolvedValue({
      id: 't1', weddingId: 'wed-test', name: 'T1', number: 1, _count: { guests: 0 },
    });
    await tablesRoute.DELETE(makeRequest('DELETE', {}, { id: 't1' }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  // ── timeline POST/PUT/DELETE ──────────────────────────────────────────────
  it('timeline POST (create event) calls invalidateWeddingCache(slug)', async () => {
    // POST uses db.eventTimeline.create (no findFirst call for duplicate check)
    await timelineRoute.POST(makeRequest('POST', { time: '14:00', activity: 'Ceremony' }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  it('timeline PUT (update event) calls invalidateWeddingCache(slug)', async () => {
    // PUT calls db.eventTimeline.findFirst → returns existing.
    await timelineRoute.PUT(makeRequest('PUT', { id: 'e1', time: '14:30', activity: 'Ceremony' }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  it('timeline DELETE calls invalidateWeddingCache(slug)', async () => {
    await timelineRoute.DELETE(makeRequest('DELETE', {}, { id: 'e1' }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  // ── couple-story POST/PUT/DELETE ─────────────────────────────────────────
  it('couple-story POST (create) calls invalidateWeddingCache(slug)', async () => {
    // couple-story POST uses tenantDb.coupleStory.create (no findFirst check)
    await coupleStoryRoute.POST(makeRequest('POST', { title: 'How we met', description: 'Once...' }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  it('couple-story PUT (update) calls invalidateWeddingCache(slug)', async () => {
    await coupleStoryRoute.PUT(makeRequest('PUT', { id: 'c1', title: 'How we met', description: 'Once...' }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  it('couple-story DELETE calls invalidateWeddingCache(slug)', async () => {
    await coupleStoryRoute.DELETE(makeRequest('DELETE', {}, { id: 'c1' }));
    expect(invalidateWeddingCacheMock).toHaveBeenCalledWith('demo-slug');
  });

  // ── Cross-check: revalidatePath is ALSO still called (we didn't remove it) ─
  it('settings PUT still calls revalidatePath (route cache bust preserved)', async () => {
    await settingsPut(makeRequest('PUT', { settings: { foo: 'bar' } }));
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});
