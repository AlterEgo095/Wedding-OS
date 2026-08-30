// ━━━ V4.7 F-07 — Organization Member Routing verification ━━━
//
// The V4.6 audit reported a "emberId]" typo (missing leading "[") in:
//   - src/app/api/platform/organizations/[id]/members/[memberId]/
//   - src/app/api/org/[slug]/members/[memberId]/
//
// VERIFICATION RESULT (V4.7):
//   The "emberId]" string was a TERMINAL DISPLAY ARTIFACT — the leading
//   `[m` of `[memberId]` was being interpreted as an ANSI color-reset escape
//   and silently stripped from the visible output. The actual directory
//   name on the filesystem is `[memberId]` (10 bytes, both brackets present),
//   confirmed via `ls -1 | od -c` and via Next.js's auto-generated
//   `.next/types/routes.d.ts` which contains the literal string
//   `organizations/[id]/members/[memberId]` and the param type
//   `{ id: string; memberId: string }`.
//
// F-07 OUTCOME: NO PATCH APPLIED. The directory and route files were
// already correctly named. The V4.6 finding was a false positive caused
// by ANSI escape interpretation in the audit terminal.
//
// This test guards against FUTURE regressions: if the directory is ever
// renamed to something that breaks Next.js's dynamic-route convention,
// the routes.d.ts would lose the `[memberId]` segment and this test would
// fail (import error or type error).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

describe('V4.7 F-07 — Organization member routing is correctly registered', () => {

  // ── Filesystem directory name ─────────────────────────────────────────
  it('directory is named [memberId] (with brackets) in platform route', () => {
    const dir = path.join(ROOT, 'src/app/api/platform/organizations/[id]/members');
    const entries = fs.readdirSync(dir);
    // The dynamic-segment directory MUST be present and named with brackets.
    expect(entries).toContain('[memberId]');
    expect(entries).not.toContain('emberId]');   // the "typo" (which never existed)
    expect(entries).not.toContain('[emberId]');
  });

  it('directory is named [memberId] (with brackets) in org-scoped route', () => {
    const dir = path.join(ROOT, 'src/app/api/org/[slug]/members');
    const entries = fs.readdirSync(dir);
    expect(entries).toContain('[memberId]');
    expect(entries).not.toContain('emberId]');
  });

  // ── Route handler file exists ──────────────────────────────────────────
  it('platform route handler exists at the correct path', () => {
    const file = path.join(ROOT, 'src/app/api/platform/organizations/[id]/members/[memberId]/route.ts');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('org-scoped route handler exists at the correct path', () => {
    const file = path.join(ROOT, 'src/app/api/org/[slug]/members/[memberId]/route.ts');
    expect(fs.existsSync(file)).toBe(true);
  });

  // ── Route handler uses memberId (no "emberId" outside of "memberId") ──
  it('platform route file uses params.memberId (no orphan emberId refs)', () => {
    const file = path.join(ROOT, 'src/app/api/platform/organizations/[id]/members/[memberId]/route.ts');
    const content = fs.readFileSync(file, 'utf-8');
    // 'emberId' is a substring of 'memberId', so we count 'emberId' occurrences
    // NOT preceded by 'm'. The clean way: replace 'memberId' with '', then
    // count remaining 'emberId' (should be 0).
    const stripped = content.replace(/memberId/g, '');
    expect(stripped.indexOf('emberId')).toBe(-1);
    // Sanity: the file MUST contain 'memberId' (used for params).
    expect(content.indexOf('memberId')).toBeGreaterThan(-1);
  });

  it('org-scoped route file uses params.memberId (no orphan emberId refs)', () => {
    const file = path.join(ROOT, 'src/app/api/org/[slug]/members/[memberId]/route.ts');
    const content = fs.readFileSync(file, 'utf-8');
    const stripped = content.replace(/memberId/g, '');
    expect(stripped.indexOf('emberId')).toBe(-1);
    expect(content.indexOf('memberId')).toBeGreaterThan(-1);
  });

  // ── Cross-check: route is registered in Next.js types ─────────────────
  it('Next.js routes.d.ts registers both [memberId] routes', () => {
    const types = path.join(ROOT, '.next/types/routes.d.ts');
    if (!fs.existsSync(types)) {
      // Skip if .next not built yet — the filesystem check above is the
      // primary guard.
      return;
    }
    const content = fs.readFileSync(types, 'utf-8');
    expect(content).toContain('/api/platform/organizations/[id]/members/[memberId]');
    expect(content).toContain('/api/org/[slug]/members/[memberId]');
    // The route key's value (param type) must include memberId: string.
    // Format: "/api/...members/[memberId]": { ... "memberId": string; ... }
    const platformMatch = content.match(/"\/api\/platform\/organizations\/\[id\]\/members\/\[memberId\]":\s*\{[^}]*"memberId":\s*string/);
    expect(platformMatch).not.toBeNull();
    const orgMatch = content.match(/"\/api\/org\/\[slug\]\/members\/\[memberId\]":\s*\{[^}]*"memberId":\s*string/);
    expect(orgMatch).not.toBeNull();
  });
});
