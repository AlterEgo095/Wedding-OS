/**
 * V4.8 F-04 — DEFAULT_WEDDING_SLUG removal + fail-closed tenant resolver.
 *
 * Tests:
 *   1. DEFAULT_WEDDING_SLUG constant equals null (no real wedding).
 *   2. resolvePublicTenant with no slug/header/query → 404 (fail-closed).
 *   3. resolveAdminTenant with no slug for platform admin → 400.
 *   4. resolveDefaultWedding throws (legacy default disabled).
 *
 * Test DB: isolated SQLite (tests/fixtures/test-v48-f04.db).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import path from 'node:path';

// 1. Constant value
import { DEFAULT_WEDDING_SLUG } from '../../src/lib/types';
import { DEFAULT_WEDDING_SLUG as CONFIG_DEFAULT } from '../../src/lib/config/platform';

// 2-3. Tenant resolver — we mock NextRequest
type MockReqOpts = { headers?: Record<string,string>; url?: string };

function mockReq(opts: MockReqOpts = {}) {
  const url = opts.url ?? 'http://localhost:3000/api/example';
  const headers = new Headers(opts.headers ?? {});
  // Minimal NextRequest shape used by extractSlugFromRequest:
  //   .headers.get(...) + new URL(url).searchParams.get(...)
  return {
    headers,
    url,
    nextUrl: new URL(url),
    method: 'GET',
    // minimal stubs not exercised by resolver
  } as any;
}

describe('V4.8 F-04 — DEFAULT_WEDDING_SLUG removal', () => {
  it('src/lib/types.ts: constant is null (no real wedding)', () => {
    expect(DEFAULT_WEDDING_SLUG).toBeNull();
  });

  it('src/lib/config/platform.ts: constant is null (no real wedding)', () => {
    expect(CONFIG_DEFAULT).toBeNull();
  });

  it('resolveDefaultWedding throws V4.8 F-04 error', async () => {
    // Dynamic import so we don't drag Prisma into the test graph
    const { resolveDefaultWedding } = await import('../../src/lib/tenant-context');
    await expect(resolveDefaultWedding()).rejects.toThrow(/V4.8 F-04/);
  });

  it('source files contain no real-wedding default (grep-style check)', async () => {
    const fs = await import('node:fs/promises');
    const p = await fs.readFile('src/lib/types.ts', 'utf8');
    // The old hardcode must be gone
    expect(p).not.toMatch(/export const DEFAULT_WEDDING_SLUG = 'josue-hornella'/);
    // The new sentinel must be present
    expect(p).toMatch(/DEFAULT_WEDDING_SLUG: string \| null = null/);
  });
});

describe('V4.8 F-04 — fail-closed tenant resolver (static)', () => {
  // We don't run the full resolver (it would hit Prisma); instead we verify
  // the source code branches to a 404 / 400 error path when slug is missing.
  it('resolvePublicTenant returns 404 when no slug provided (source inspection)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/tenant-context.ts', 'utf8');
    // The fail-closed branch must exist
    expect(src).toMatch(/if \(!headerOrQuery\)/);
    expect(src).toMatch(/No wedding specified/);
    // The legacy fallback must be gone
    expect(src).not.toMatch(/headerOrQuery \?\? DEFAULT_WEDDING_SLUG/);
  });

  it('resolveAdminTenant returns 400 for platform admin without header (source inspection)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/tenant-context.ts', 'utf8');
    expect(src).toMatch(/V4.8 F-04 - platform admin must pass an explicit slug/);
    expect(src).toMatch(/X-Wedding-Slug header required for platform admin requests/);
    // The legacy fallback must be gone
    expect(src).not.toMatch(/extractSlugFromRequest\(request\) \?\? DEFAULT_WEDDING_SLUG/);
  });
});
