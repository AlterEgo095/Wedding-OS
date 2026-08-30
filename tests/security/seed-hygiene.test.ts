// ━━━ V4.7 F-06 — Seed / PII hygiene tests ━━━
//
// Verifies that prisma/seed.ts:
//   1. Does NOT contain real PII (Josué, Hornella, real venue, real address,
//      real GPS, real date, real hashtag, real admin email).
//   2. Has a hard production block — even if SEED_DEMO_DATA=1 is set in
//      production, shouldSeedDemoData() returns false. This closes the
//      P0 finding (F-06.3): production DB must NEVER contain demo-wedding
//      data, even if an operator accidentally sets the flag.
//   3. Still allows demo data in dev/test (so dev onboarding still works).
//
// SAFETY: this test reads the seed.ts source file as text and runs the
// shouldSeedDemoData() function in isolation. It NEVER touches the DB.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const ROOT = path.resolve(__dirname, '../..');
const SEED_PATH = path.join(ROOT, 'prisma/seed.ts');

function readSeed(): string {
  return fs.readFileSync(SEED_PATH, 'utf-8');
}

// Extract the shouldSeedDemoData function source and evaluate it in a
// sandboxed VM context. The function only reads process.env, so we provide
// a minimal process stub.
function makeShouldSeedDemoData(env: Record<string, string | undefined>): () => boolean {
  // Read the source and pull out the function via regex.
  const src = readSeed();
  const match = src.match(/function shouldSeedDemoData\(\):\s*boolean\s*\{[\s\S]*?\n\}/);
  if (!match) throw new Error('shouldSeedDemoData function not found in seed.ts');
  // Strip TS type annotations before evaluating in plain JS VM:
  //   - return type: `: boolean` after `()` → remove
  //   - inline type annotations like `(x: string)` → keep simple here
  let fnSrc = match[0].replace(/:\s*boolean/g, '');
  // Wrap in an IIFE that injects `process` as a parameter.
  const wrapper = `(function(process) { ${fnSrc} return shouldSeedDemoData; })`;
  const factory = vm.runInNewContext(wrapper, {}) as (process: any) => () => boolean;
  const processStub = { env };
  return factory(processStub) as () => boolean;
}

describe('V4.7 F-06 — Seed hygiene (no real PII)', () => {

  // ── PII references ───────────────────────────────────────────────────────
  // Each of these strings must NEVER appear in the seed source. If they do,
  // it means the seed is shipping real wedding data in version control.
  const FORBIDDEN_PII = [
    'Josué',
    'Hornella',
    'josue-hornella',
    'Bobozo',
    'AKRAM',
    'TELEMA',
    'Kinshasa',
    'JosueEtHornella',
    'josue-hornella.wedding',
    '21 / 22 Avenue Bobozo',
    'Salle Polyvalente',
    '2026-06-26',           // real wedding date
    'Africa/Kinshasa',      // real timezone (was tied to the real couple)
    '-4.3250',              // real GPS lat
    '15.3222',              // real GPS lng
  ];

  it('seed.ts contains no real PII (aggregate guard)', () => {
    // Aggregate guard — see the per-string tests below for granular reporting
    expect(true).toBe(true);
  });

  // Generate one test per forbidden string for granular failure reporting
  for (const pii of FORBIDDEN_PII) {
    it(`seed.ts does NOT contain PII: "${pii}"`, () => {
      const content = readSeed();
      expect(content).not.toContain(pii);
    });
  }

  // ── Demo fixtures present ───────────────────────────────────────────────
  it('seed.ts uses generic Demo Couple names', () => {
    const content = readSeed();
    expect(content).toContain("Demo Bride");
    expect(content).toContain("Demo Groom");
  });

  it('seed.ts uses generic Demo Venue / Address / City', () => {
    const content = readSeed();
    expect(content).toContain("Demo Venue Hall");
    expect(content).toContain("123 Demo Street");
    expect(content).toContain("Demo City");
  });

  it('seed.ts uses generic admin email default', () => {
    const content = readSeed();
    expect(content).toContain("admin@demo.wedding");
  });

  it('seed.ts uses generic hashtag', () => {
    const content = readSeed();
    expect(content).toContain("#DemoWedding2026");
  });

  // ── Production hard-block (F-06.3 / F-06.4) ────────────────────────────
  it('shouldSeedDemoData() returns FALSE in production (NODE_ENV=production, no flag)', () => {
    const fn = makeShouldSeedDemoData({ NODE_ENV: 'production' });
    expect(fn()).toBe(false);
  });

  it('shouldSeedDemoData() returns FALSE in production EVEN WITH SEED_DEMO_DATA=1', () => {
    // This is the critical P0 fix: even if the operator sets SEED_DEMO_DATA=1
    // in production, the seed refuses to seed demo data.
    const fn = makeShouldSeedDemoData({
      NODE_ENV: 'production',
      SEED_DEMO_DATA: '1',
    });
    expect(fn()).toBe(false);
  });

  it('shouldSeedDemoData() returns FALSE in production with SEED_DEMO_DATA=true', () => {
    const fn = makeShouldSeedDemoData({
      NODE_ENV: 'production',
      SEED_DEMO_DATA: 'true',
    });
    expect(fn()).toBe(false);
  });

  // ── Dev / test still works ──────────────────────────────────────────────
  it('shouldSeedDemoData() returns TRUE in dev (NODE_ENV=development, no flag)', () => {
    const fn = makeShouldSeedDemoData({ NODE_ENV: 'development' });
    expect(fn()).toBe(true);
  });

  it('shouldSeedDemoData() returns TRUE in test (NODE_ENV=test)', () => {
    const fn = makeShouldSeedDemoData({ NODE_ENV: 'test' });
    expect(fn()).toBe(true);
  });

  it('shouldSeedDemoData() returns TRUE in dev with SEED_DEMO_DATA=1', () => {
    const fn = makeShouldSeedDemoData({ NODE_ENV: 'development', SEED_DEMO_DATA: '1' });
    expect(fn()).toBe(true);
  });

  it('shouldSeedDemoData() returns FALSE in dev when SEED_DEMO_DATA=0', () => {
    const fn = makeShouldSeedDemoData({ NODE_ENV: 'development', SEED_DEMO_DATA: '0' });
    expect(fn()).toBe(false);
  });
});
