/**
 * V4.8 F-05 — GuestSearch / Dashboard hardcoded photo fallback removal.
 *
 * After V4.8 patches, all 7 hardcoded '/uploads/couple-photo-{1,2}.jpeg'
 * references in GuestSearch.tsx and the 2 fallback strings in Dashboard.tsx
 * are replaced with tenant-aware values from /api/settings.
 *
 * Tests assert:
 *   1. Dashboard.tsx no longer hardcodes the fallback.
 *   2. GuestSearch.tsx no longer hardcodes any src="/uploads/couple-photo".
 *   3. InvitationCard derives photos from settings only.
 *   4. GuestPersonalSpace is clean (V4.7 baseline preserved).
 *   5. PremiumGallery is clean (V4.6 P0-QW3 baseline preserved).
 *   6. No runtime code path in src/components/ hardcodes the default photos.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';

// Helper: scan only non-comment, non-backup lines for hardcoded photo refs.
async function findRuntimeHardcodes(dir: string): Promise<string[]> {
  const { execSync } = await import('node:child_process');
  // -r recursive, -n line numbers, -E extended regex
  // --exclude=".pre-v48-*" --exclude="*.bak*" skip backups
  // We then post-filter to drop lines that are comments (start with //, *, /* after trim).
  let out = '';
  try {
    out = execSync(
      `grep -rEn --exclude='.pre-v48-*' --exclude='*.bak*' --exclude='*.bak' ` +
      `'src=\\\"/uploads/couple-photo' ${dir} 2>/dev/null || true`,
      { encoding: 'utf8' }
    );
  } catch {
    // grep non-zero == no matches
  }
  const lines = out.split('\n').filter(Boolean);
  // Drop comment lines (start with //, *, /*, etc.)
  return lines.filter(line => {
    const codePart = line.split(':')[2] || '';
    const trimmed = codePart.trim();
    return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
  });
}

describe('V4.8 F-05 — Dashboard hardcoded photo fallback removed', () => {
  it('Dashboard.tsx no longer hardcodes /uploads/couple-photo-1.jpeg as fallback', async () => {
    const src = await fs.readFile('src/components/admin/Dashboard.tsx', 'utf8');
    // Match the runtime pattern: settings.couple_photo_1 || '/uploads/...'
    expect(src).not.toMatch(/couple_photo_1\s*\|\|\s*'\/uploads\/couple-photo-1\.jpeg'/);
    // The V4.8 F-05 sentinel must be present
    expect(src).toMatch(/couple_photo_1\s*\|\|\s*''/);
  });

  it('Dashboard.tsx no longer hardcodes /uploads/couple-photo-2.jpeg as fallback', async () => {
    const src = await fs.readFile('src/components/admin/Dashboard.tsx', 'utf8');
    expect(src).not.toMatch(/couple_photo_2\s*\|\|\s*'\/uploads\/couple-photo-2\.jpeg'/);
    expect(src).toMatch(/couple_photo_2\s*\|\|\s*''/);
  });

  it('InvitationCard derives photos from settings only (no hardcoded default)', async () => {
    const src = await fs.readFile('src/components/InvitationCard.tsx', 'utf8');
    expect(src).toMatch(/couple_photo_1 \|\| ''/);
    expect(src).toMatch(/couple_photo_2 \|\| ''/);
    // No runtime src= hardcode
    expect(src).not.toMatch(/src=\\?["']\/uploads\/couple-photo-\d/);
  });

  it('GuestPersonalSpace is still clean (V4.7 baseline preserved)', async () => {
    const src = await fs.readFile('src/components/GuestPersonalSpace.tsx', 'utf8');
    expect(src).toMatch(/couple_photo_1 \|\| ''/);
    // No runtime src= hardcode
    expect(src).not.toMatch(/src=\\?["']\/uploads\/couple-photo-\d/);
  });

  it('PremiumGallery is still clean (V4.6 P0-QW3 baseline preserved)', async () => {
    const src = await fs.readFile('src/components/PremiumGallery.tsx', 'utf8');
    expect(src).toMatch(/P0-QW3/);
    expect(src).not.toMatch(/defaultPhotos\s*=\s*\[/);
  });
});

describe('V4.8 F-05 — GuestSearch tenant-aware photo binding', () => {
  it('GuestSearch.tsx has no runtime src="/uploads/couple-photo-*" hardcode', async () => {
    const src = await fs.readFile('src/components/GuestSearch.tsx', 'utf8');
    // No runtime src= hardcode (comment lines are OK)
    const runtimeLines = src.split('\n').map((line, i) => ({ i: i + 1, line }))
      .filter(({ line }) => {
        const t = line.trim();
        return t.includes('src=') && t.includes('/uploads/couple-photo') && !t.startsWith('//') && !t.startsWith('*');
      });
    expect(runtimeLines).toEqual([]);
  });

  it('GuestSearch.tsx derives couplePhoto1/2 from settings state', async () => {
    const src = await fs.readFile('src/components/GuestSearch.tsx', 'utf8');
    expect(src).toMatch(/const \[settings, setSettings\]/);
    expect(src).toMatch(/couplePhoto1\s*=\s*settings\.couple_photo_1\s*\|\|\s*''/);
    expect(src).toMatch(/couplePhoto2\s*=\s*settings\.couple_photo_2\s*\|\|\s*''/);
    expect(src).toMatch(/src=\{couplePhoto1\}/);
    expect(src).toMatch(/src=\{couplePhoto2\}/);
  });

  it('GuestSearch.tsx fetches /api/settings on mount (tenant-scoped)', async () => {
    const src = await fs.readFile('src/components/GuestSearch.tsx', 'utf8');
    expect(src).toMatch(/fetch\('\/api\/settings'\)/);
  });
});

describe('V4.8 F-05 — cross-tenant media isolation (component-wide)', () => {
  it('No runtime hardcoded src="/uploads/couple-photo-*" in src/components/', async () => {
    const offending = await findRuntimeHardcodes('src/components');
    expect(offending).toEqual([]);
  });

  it('No runtime hardcoded src="/uploads/couple-photo-*" in src/app/', async () => {
    const offending = await findRuntimeHardcodes('src/app');
    expect(offending).toEqual([]);
  });
});
