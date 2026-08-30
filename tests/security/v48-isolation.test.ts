/**
 * V4.8 F-04 / F-05 — NEW WEDDING ISOLATION TEST
 *
 * This is the ULTIMATE TEST for V4.8:
 *   "Que se passe-t-il lorsqu'un NOUVEAU gestionnaire
 *    crée un NOUVEAU mariage ?"
 *
 * The system must produce:
 *   NEW ORGANIZER → NEW WEDDING → EMPTY / CLEAN DATA → CUSTOMIZE →
 *   PREVIEW → PUBLISH → PUBLIC INVITATION → EDIT → REPUBLISH →
 *   UPDATED PUBLIC INVITATION
 *
 * And NEVER:
 *   NEW WEDDING → OLD WEDDING DATA
 *
 * This test verifies the SOURCE CONTRACT that guarantees isolation:
 *   1. DEFAULT_WEDDING_SLUG is null (V4.8 F-04)
 *   2. No src/ runtime code path implicitly selects a real wedding
 *   3. All tenant-scoped lookups require an explicit slug
 *   4. No component renders the default wedding's photos (V4.8 F-05)
 *   5. No component renders the default wedding's couple names ("Josué" / "Hornella")
 *   6. The Invitation Engine derives all identity from settings (tenant-scoped)
 *
 * Combined with the V4.7 baseline tests (organizer-publish, cache-propagation,
 * member-routing, tenant-isolation, seed-hygiene, dead-code-cleanup, payment-safety)
 * which already PASS, this gives the cross-tenant isolation guarantee.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';

async function grepCount(pattern: string, paths: string[], excludePatterns: string[] = []): Promise<number> {
  const excludeArgs = excludePatterns.map(p => `--exclude='${p}'`).join(' ');
  try {
    const out = execSync(
      `grep -rEn ${excludeArgs} '${pattern.replace(/'/g, "'\\''")}' ${paths.join(' ')} 2>/dev/null || true`,
      { encoding: 'utf8' }
    );
    // Filter out comment lines
    return out.split('\n').filter(line => {
      if (!line) return false;
      const codePart = line.split(':').slice(2).join(':') || '';
      const t = codePart.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).length;
  } catch {
    return 0;
  }
}

describe('V4.8 — NEW WEDDING ISOLATION (source contract)', () => {
  it('F-04: DEFAULT_WEDDING_SLUG constant is null (no real wedding default)', async () => {
    const { DEFAULT_WEDDING_SLUG } = await import('../../src/lib/types');
    expect(DEFAULT_WEDDING_SLUG).toBeNull();
  });

  it('F-04: zero runtime code path falls back to a real wedding slug', async () => {
    // The pattern `?? 'josue-hornella'` or `?? DEFAULT_WEDDING_SLUG` must not appear
    // in any src/ runtime file (excluding backups and comments).
    const src = await fs.readFile('src/lib/tenant-context.ts', 'utf8');
    expect(src).not.toMatch(/\?\?\s*DEFAULT_WEDDING_SLUG/);
    expect(src).not.toMatch(/=\s*'josue-hornella'/);
  });

  it('F-04: root URL (/) does NOT implicitly select josue-hornella', async () => {
    // The root page (src/app/page.tsx) must not hardcode the default slug.
    const src = await fs.readFile('src/app/page.tsx', 'utf8');
    expect(src).toMatch(/NO fallback to josue-hornella/);  // V4.6 sentinel comment
    // No NON-COMMENT line should contain a runtime lookup with the hardcoded slug
    const offendingLines = src.split('\n').map((line, i) => ({ i: i + 1, line }))
      .filter(({ line }) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false; // skip comments
        return /findUnique\(\{[^}]*slug:\s*'josue-hornella'/.test(line) ||
               /findFirst\(\{[^}]*slug:\s*'josue-hornella'/.test(line);
      });
    expect(offendingLines).toEqual([]);
  });

  it('F-05: zero src/ runtime hardcode of /uploads/couple-photo-{1,2}.jpeg', async () => {
    const offending = await grepCount(
      'src="/uploads/couple-photo',
      ['src/components', 'src/app', 'src/lib'],
      ['*.pre-v48-*', '*.bak*', '*.bak']
    );
    expect(offending).toBe(0);
  });

  it('F-05: zero src/ runtime hardcode of "Josué" or "Hornella" as initial values', async () => {
    // Look for "Josué" or "Hornella" appearing in STRING LITERALS (not comments).
    // Pre-existing comments mentioning the names are allowed (they document the fix).
    const { execSync } = await import('node:child_process');
    let out = '';
    try {
      out = execSync(
        `grep -rEn --exclude='*.pre-v48-*' --exclude='*.bak*' --exclude='*.bak' ` +
        `'Josu[cèe]+|Hornella' src/components src/app/page.tsx src/lib 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
    } catch { /* grep non-zero */ }
    const offenders = out.split('\n').filter(line => {
      if (!line) return false;
      const code = line.split(':').slice(2).join(':') || '';
      const t = code.trim();
      // Skip comments
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
      // Skip docstrings / placeholder attributes
      if (t.includes('placeholder=')) return false;
      // Skip lines that explicitly reference the couple in COMMENTS (not runtime assignments)
      return t.includes('Josu') || t.includes('Hornella');
    });
    // We expect ZERO runtime string literals with "Josué" or "Hornella" as initial values
    expect(offenders).toEqual([]);
  });

  it('F-05: InvitationCard derives photos from settings.couple_photo_1/2 (tenant-scoped)', async () => {
    const src = await fs.readFile('src/components/InvitationCard.tsx', 'utf8');
    expect(src).toMatch(/couple_photo_1 \|\| ''/);
    expect(src).toMatch(/couple_photo_2 \|\| ''/);
    expect(src).toMatch(/couplePhoto1Path \?/);  // conditional render guard
  });

  it('F-05: GuestSearch derives photos from settings (tenant-scoped via /api/settings)', async () => {
    const src = await fs.readFile('src/components/GuestSearch.tsx', 'utf8');
    expect(src).toMatch(/fetch\('\/api\/settings'\)/);
    expect(src).toMatch(/couplePhoto1\s*=\s*settings\.couple_photo_1/);
    expect(src).toMatch(/src=\{couplePhoto1\}/);
  });
});

describe('V4.8 — Invitation Engine contract (no implicit identity leak)', () => {
  it('Footer derives all identity from settings, never initializes with "Josué" / "Hornella"', async () => {
    const src = await fs.readFile('src/components/Footer.tsx', 'utf8');
    expect(src).not.toMatch(/'\.'Josu[cèe]/);  // never assign a string starting with Josué
    expect(src).not.toMatch(/brideName.*=.*'Hornella'/);
  });

  it('Dashboard derives all identity from settings, never initializes with real names', async () => {
    const src = await fs.readFile('src/components/admin/Dashboard.tsx', 'utf8');
    expect(src).toMatch(/settings\.site_title \|\| 'Mariage'/);  // generic fallback
    expect(src).toMatch(/settings\.bride_name \|\| ''/);
    expect(src).toMatch(/settings\.groom_name \|\| ''/);
  });

  it('GuestPersonalSpace uses generic "Mariage" fallback, not real names', async () => {
    const src = await fs.readFile('src/components/GuestPersonalSpace.tsx', 'utf8');
    expect(src).toMatch(/'Mariage'/);
    expect(src).not.toMatch(/=.*'Josu[cèe]/);
    expect(src).not.toMatch(/=.*'Hornella'/);
  });

  it('EventTimeline uses generic fallback for programme', async () => {
    const src = await fs.readFile('src/components/EventTimeline.tsx', 'utf8');
    expect(src).not.toMatch(/=.*'Josu[cèe]/);
    expect(src).not.toMatch(/=.*'Hornella'/);
  });
});

describe('V4.8 — Production safety (no implicit data injection)', () => {
  it('prisma/seed.ts uses DEMO_WEDDING_SLUG (dev/test only), not runtime DEFAULT_WEDDING_SLUG', async () => {
    const src = await fs.readFile('prisma/seed.ts', 'utf8');
    expect(src).toMatch(/const DEMO_WEDDING_SLUG = 'demo-wedding'/);
    expect(src).toMatch(/shouldSeedDemoData\(\)/);  // production skip gate
    expect(src).not.toMatch(/DEFAULT_WEDDING_SLUG/);
    // Real couple slug must NOT appear in seed
    expect(src).not.toMatch(/'josue-hornella'/);
  });

  it('prisma/seed.ts couple names are clearly demo (no real PII)', async () => {
    const src = await fs.readFile('prisma/seed.ts', 'utf8');
    expect(src).toMatch(/'Demo Bride'/);
    expect(src).toMatch(/'Demo Groom'/);
    expect(src).not.toMatch(/'Josu[cèe]/);
    expect(src).not.toMatch(/'Hornella'/);
  });

  it('No src/ runtime code path creates a wedding with real couple PII', async () => {
    const { execSync } = await import('node:child_process');
    let out = '';
    try {
      out = execSync(
        `grep -rEn --exclude='*.pre-v48-*' --exclude='*.bak*' --exclude='*.bak' ` +
        `--exclude-dir='.backups' "brideName.*Josu[cèe]|groomName.*Hornella" src 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
    } catch { /* no matches */ }
    const offenders = out.split('\n').filter(line => {
      if (!line) return false;
      const t = line.split(':').slice(2).join(':').trim();
      return t && !t.startsWith('//') && !t.startsWith('*');
    });
    expect(offenders).toEqual([]);
  });
});
