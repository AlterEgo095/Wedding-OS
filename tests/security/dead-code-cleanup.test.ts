// ━━━ V4.7 F-02 — Orphaned CouplePhotosSection.tsx removal ━━━
//
// Verifies that the orphaned hardcoded component
//   src/components/CouplePhotosSection.tsx
// is GONE (deleted as dead code per F-02.2) and that no references to it
// remain anywhere in the source tree.
//
// F-02.1 verification (done before deletion):
//   - No imports of CouplePhotosSection anywhere (.ts/.tsx)
//   - No dynamic imports
//   - No barrel exports (no index.ts re-exports it)
//   - No test references
//   - No SectionRenderer.tsx / InvitationSections.tsx registry entry
//   - The 7 hardcoded photo paths ARE referenced as STATIC ASSETS in
//     IdentityHero / CinematicHero / showcase page — those refs are
//     untouched (we only removed the COMPONENT, not the /photos/ assets)

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');

describe('V4.7 F-02 — Orphaned CouplePhotosSection removed', () => {

  it('the component file has been deleted from src/components/', () => {
    const file = path.join(ROOT, 'src/components/CouplePhotosSection.tsx');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('a backup copy exists for rollback', () => {
    const backup = path.join(ROOT, 'src/components/CouplePhotosSection.tsx.pre-v47-f02');
    expect(fs.existsSync(backup)).toBe(true);
  });

  it('no source file imports CouplePhotosSection (component is gone, no orphans)', () => {
    // Walk ONLY src/ — test files legitimately reference the component name
    // in their assertions (e.g. this very test file).
    const hits: string[] = [];
    walk(path.join(ROOT, 'src'), (full) => {
      // Skip .pre-v47-f02 backups and .bak files
      if (full.endsWith('.pre-v47-f02') || full.endsWith('.bak')) return;
      if (!full.endsWith('.ts') && !full.endsWith('.tsx')) return;
      const content = fs.readFileSync(full, 'utf-8');
      // Match `import ... CouplePhotosSection` or `from '...CouplePhotosSection'`
      if (/import\s+.*CouplePhotosSection/.test(content) || /from\s+['"][^'"]*CouplePhotosSection/.test(content)) {
        hits.push(full);
      }
    });
    expect(hits).toEqual([]);
  });

  it('no string reference to "CouplePhotosSection" remains in src/ (excluding backups)', () => {
    const hits: string[] = [];
    walk(path.join(ROOT, 'src'), (full) => {
      if (full.endsWith('.pre-v47-f02') || full.endsWith('.bak')) return;
      if (!full.endsWith('.ts') && !full.endsWith('.tsx')) return;
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes('CouplePhotosSection')) {
        hits.push(full);
      }
    });
    expect(hits).toEqual([]);
  });

  it('no test imports the removed component as a runtime dependency', () => {
    // Tests may mention the name in assertions (like this one), but must NOT
    // actually import the deleted module. We exclude THIS test file itself
    // because its regex pattern contains the literal `CouplePhotosSection`
    // string (self-match would create a false positive).
    const thisFile = path.resolve(__filename);
    const hits: string[] = [];
    walk(path.join(ROOT, 'tests'), (full) => {
      if (full === thisFile) return;
      if (full.endsWith('.pre-v47-f02') || full.endsWith('.bak')) return;
      if (!full.endsWith('.ts') && !full.endsWith('.tsx')) return;
      const content = fs.readFileSync(full, 'utf-8');
      // Only flag ACTUAL import statements (not string mentions in assertions)
      if (/^\s*import\s+.*CouplePhotosSection/m.test(content) ||
          /from\s+['"][^'"]*CouplePhotosSection/.test(content)) {
        hits.push(full);
      }
    });
    expect(hits).toEqual([]);
  });

  // ── Cross-check: the 7 hardcoded photo assets are still referenced ──
  // (we did NOT remove the /photos/couple-*.jpeg static assets — only the
  //  CouplePhotosSection COMPONENT that hard-coded them)
  it('the /photos/couple-portrait.jpeg asset is still referenced by other components', () => {
    // This proves we didn't accidentally break unrelated code paths that
    // share the same static photo asset paths.
    const result = cp.spawnSync(
      'grep',
      ['-r', '-l', 'couple-portrait', path.join(ROOT, 'src')],
      { encoding: 'utf-8' }
    );
    const files = result.stdout.trim().split('\n').filter(Boolean);
    // IdentityHero, CinematicHero, showcase page may reference these.
    expect(files.length).toBeGreaterThan(0);
  });
});

function walk(dir: string, fn: (full: string) => void) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fn);
    else fn(full);
  }
}
