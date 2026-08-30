// ━━━ V4.7 F-01 — Organizer Publication authorization tests ━━━
//
// Verifies the authorization gate added by V4.7 F-01 to
// /api/onboarding/publish. The gate enforces (in order):
//   1. Authentication (401 if no token / invalid token)
//   2. `wedding:publish` capability (403 INSUFFICIENT_ROLE for
//      RECEPTION / CONTROLLER / ORG_MEMBER / ORG_VIEWER)
//   3. Tenant isolation via assertWeddingAccessAsync (404 for cross-tenant
//      — no enumeration leak)
//
// The publish pipeline itself (publishWeddingViaPipeline, audit log,
// cache invalidation, commercialStatus auto-transition) is mocked — we
// test the AUTHORIZATION gate, not the publish side-effects.
//
// SAFETY: this test mocks @/lib/db. It NEVER touches production data.
// tests/setup.ts also enforces that DATABASE_URL cannot be the prod path.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// db mock: minimal surface used by getAuthUser + the route handler.
//   - adminUser.findUnique : used by getAuthUser to verify the user still
//                            exists + read suspended flag + role + weddingId +
//                            organizationId.
//   - organizationMember.findFirst : used by getAuthUser for org-scoped roles
//                                    to verify active membership.
//   - wedding.findUnique : used by the route for the wedding lookup (×2: once
//                          before publish, once after publish for the response
//                          body).

const fakeUsers: Record<string, {
  id: string; role: string; weddingId: string | null;
  organizationId: string | null; suspended: boolean;
}> = {};

const fakeWeddings: Record<string, {
  id: string; slug: string; status: string; publishedAt: string | null;
  commercialStatus: string; isDefault: boolean; organizationId?: string | null;
}> = {};

vi.mock('@/lib/db', () => ({
  db: {
    adminUser: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return fakeUsers[where.id] ?? null;
      }),
    },
    organizationMember: {
      findFirst: vi.fn(async () => ({ id: 'mem-1', status: 'ACTIVE' })),
    },
    wedding: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return fakeWeddings[where.id] ?? null;
      }),
    },
  },
}));

vi.mock('@/lib/pipeline/publish-helper', () => ({
  publishWeddingViaPipeline: vi.fn().mockResolvedValue({
    success: true,
    deploymentId: 'dep-test',
    version: 1,
    mode: 'PUBLISHED',
  }),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/tenant-context', () => ({
  invalidateWeddingCache: vi.fn(),
}));

vi.mock('@/lib/commercial-status', () => ({
  autoTransitionToLive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { POST } from '@/app/api/onboarding/publish/route';
import { generateToken, type AuthUser } from '@/lib/auth';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function registerUser(
  id: string,
  role: string,
  weddingId: string | null = null,
  organizationId: string | null = null,
) {
  fakeUsers[id] = { id, role, weddingId, organizationId, suspended: false };
}

function registerWedding(
  id: string,
  overrides: Partial<{
    slug: string; status: string; publishedAt: string | null;
    commercialStatus: string; isDefault: boolean; organizationId: string | null;
  }> = {},
) {
  fakeWeddings[id] = {
    id,
    slug: overrides.slug ?? id,
    status: overrides.status ?? 'DRAFT',
    publishedAt: overrides.publishedAt ?? null,
    commercialStatus: overrides.commercialStatus ?? 'PAID',
    isDefault: overrides.isDefault ?? false,
    organizationId: overrides.organizationId ?? null,
  };
}

function makeAuthCookie(user: AuthUser): string {
  return `auth_token=${generateToken(user)}`;
}

function makeRequest(cookie: string | null, body: unknown) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return {
    cookies: {
      get: (name: string) =>
        name === 'auth_token' && cookie
          ? { value: cookie.split('=').slice(1).join('=') }
          : undefined,
    },
    headers,
    json: async () => body,
    method: 'POST',
  } as any; // minimal NextRequest shape used by the route
}

function user(
  id: string, role: string, weddingId: string | null = null,
  organizationId: string | null = null,
): AuthUser {
  return {
    id, email: `${role.toLowerCase()}-${id}@test.local`, name: `Test ${role}`,
    role, weddingId, organizationId,
  };
}

// ─── Test setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset fakes
  for (const k of Object.keys(fakeUsers)) delete fakeUsers[k];
  for (const k of Object.keys(fakeWeddings)) delete fakeWeddings[k];

  // Register canonical test fixtures
  registerUser('u-admin',  'PLATFORM_ADMIN', null, null);
  registerUser('u-orgA',   'ORGANIZER',      'wed-A', null);
  registerUser('u-orgB',   'ORGANIZER',      'wed-B', null);
  registerUser('u-oadmin', 'ORG_ADMIN',      null,    'org-X');
  registerUser('u-om',     'ORG_MEMBER',     null,    'org-X');
  registerUser('u-rec',    'RECEPTION',      'wed-A', null);
  registerUser('u-ctrl',   'CONTROLLER',     'wed-A', null);

  registerWedding('wed-A', { slug: 'a', organizationId: null });
  registerWedding('wed-B', { slug: 'b', organizationId: null });
  registerWedding('wed-orgX', { slug: 'x', organizationId: 'org-X' });
  registerWedding('wed-orgY', { slug: 'y', organizationId: 'org-Y' });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('V4.7 F-01 — /api/onboarding/publish authorization', () => {

  // ── 1. Unauthenticated ──────────────────────────────────────────────────
  it('UNAUTHENTICATED (no cookie) → 401 AUTHENTICATION_REQUIRED', async () => {
    const req = makeRequest(null, { weddingId: 'wed-A' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('UNAUTHENTICATED (invalid token) → 401', async () => {
    const req = makeRequest('auth_token=invalid-jwt', { weddingId: 'wed-A' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── 2. Roles WITHOUT wedding:publish capability ─────────────────────────
  it('RECEPTION (no capability) → 403 INSUFFICIENT_ROLE', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-rec', 'RECEPTION', 'wed-A')),
      { weddingId: 'wed-A' },
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('INSUFFICIENT_ROLE');
    expect(body.error.requiredCapability).toBe('wedding:publish');
  });

  it('CONTROLLER (no capability) → 403', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-ctrl', 'CONTROLLER', 'wed-A')),
      { weddingId: 'wed-A' },
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('ORG_MEMBER (no capability) → 403', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-om', 'ORG_MEMBER', null, 'org-X')),
      { weddingId: 'wed-orgX' },
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  // ── 3. ORGANIZER — own wedding ──────────────────────────────────────────
  it('ORGANIZER publishes OWN wedding → 200 (passes auth + capability + tenant gate)', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-orgA', 'ORGANIZER', 'wed-A')),
      { weddingId: 'wed-A' },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wedding.id).toBe('wed-A');
  });

  // ── 4. ORGANIZER — other wedding (CROSS-TENANT) ─────────────────────────
  it('ORGANIZER A tries to publish wedding B → 404 (no enumeration leak)', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-orgA', 'ORGANIZER', 'wed-A')),
      { weddingId: 'wed-B' },
    );
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Mariage introuvable.');
  });

  it('ORGANIZER B tries to publish wedding A → 404', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-orgB', 'ORGANIZER', 'wed-B')),
      { weddingId: 'wed-A' },
    );
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // ── 5. PLATFORM_ADMIN (existing behavior preserved) ─────────────────────
  it('PLATFORM_ADMIN publishes any wedding → 200', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-admin', 'PLATFORM_ADMIN')),
      { weddingId: 'wed-B' },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // ── 6. ORG_ADMIN — same org wedding ────────────────────────────────────
  it('ORG_ADMIN publishes wedding in OWN org → 200', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-oadmin', 'ORG_ADMIN', null, 'org-X')),
      { weddingId: 'wed-orgX' },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('ORG_ADMIN publishes wedding in DIFFERENT org → 404', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-oadmin', 'ORG_ADMIN', null, 'org-X')),
      { weddingId: 'wed-orgY' },
    );
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // ── 7. Invalid wedding id ───────────────────────────────────────────────
  it('INVALID wedding id → 404', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-admin', 'PLATFORM_ADMIN')),
      { weddingId: 'nonexistent-wed' },
    );
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // ── 8. Already published ────────────────────────────────────────────────
  it('already PUBLISHED wedding → 400', async () => {
    registerWedding('wed-pub', { status: 'PUBLISHED' });
    const req = makeRequest(
      makeAuthCookie(user('u-admin', 'PLATFORM_ADMIN')),
      { weddingId: 'wed-pub' },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── 9. Invalid transition ────────────────────────────────────────────────
  // VALID_TRANSITIONS only allows COMPLETED → ARCHIVED, so COMPLETED → PUBLISHED
  // is genuinely illegal. (Note: ARCHIVED → PUBLISHED IS valid — un-archive.)
  it('COMPLETED wedding → 400 invalid transition (cannot republish)', async () => {
    registerWedding('wed-comp', { status: 'COMPLETED' });
    const req = makeRequest(
      makeAuthCookie(user('u-admin', 'PLATFORM_ADMIN')),
      { weddingId: 'wed-comp' },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.from).toBe('COMPLETED');
    expect(body.to).toBe('PUBLISHED');
  });

  // ── 10. PUBLISHED_REQUIRES_PAID invariant preserved ────────────────────
  it('non-PAID commercialStatus (non-default wedding) → 403 PUBLISHED_REQUIRES_PAID', async () => {
    registerWedding('wed-unpaid', { commercialStatus: 'IN_PRODUCTION' });
    const req = makeRequest(
      makeAuthCookie(user('u-admin', 'PLATFORM_ADMIN')),
      { weddingId: 'wed-unpaid' },
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PUBLISHED_REQUIRES_PAID');
  });

  // ── 11. Body validation ──────────────────────────────────────────────────
  it('missing weddingId → 400', async () => {
    const req = makeRequest(
      makeAuthCookie(user('u-admin', 'PLATFORM_ADMIN')),
      {},
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
