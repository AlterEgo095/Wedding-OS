// ══════════════════════════════════════════════════════════════════════════════
// scripts/seed-platform-themes.ts
// MISSION 5.9.2 P0 (QW7) — Seed 5 PlatformTheme rows from identity presets.
// ══════════════════════════════════════════════════════════════════════════════
//
// Closes the P0-1 gap identified in audit 5.9.1: the PlatformTheme DB table
// was empty (0 rows). The Super Admin had no themes to offer in the catalog.
//
// This script seeds 5 PlatformTheme rows, one per identity preset:
//   1. royal-luxury        (ROYAL,      PREMIUM)
//   2. minimal-editorial   (EDITORIAL,  STANDARD)
//   3. botanical-romance   (BOTANICAL,  PREMIUM)
//   4. cinematic-dark      (CINEMATIC,  PREMIUM)
//   5. modern-champagne    (CHAMPAGNE,  STANDARD)
//
// Each row includes:
//   - name, slug (from identity id)
//   - paletteJson (all colors: primary, accent, surface, surfaceDeep, text, etc.)
//   - fontDisplay, fontBody (from identity fonts)
//   - isBuiltIn=true, status=PUBLISHED
//   - isPremium, tier, category (commercial markers from QW8)
//   - identity (the WeddingIdentity slug — used by the apply endpoint QW6)
//   - configJson (the full resolved theme config)
//
// Idempotent: uses upsert by slug. Safe to run multiple times.
//
// USAGE:
//   bun run scripts/seed-platform-themes.ts
// ══════════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import {
  IDENTITY_PRESETS,
  identityPresetToThemePreset,
} from '../src/lib/themes/identity-presets';

const prisma = new PrismaClient();

/** Map identity id → commercial category. */
function categoryForIdentity(identityId: string): string {
  switch (identityId) {
    case 'royal-luxury':
      return 'ROYAL';
    case 'minimal-editorial':
      return 'EDITORIAL';
    case 'botanical-romance':
      return 'BOTANICAL';
    case 'cinematic-dark':
      return 'CINEMATIC';
    case 'modern-champagne':
      return 'CHAMPAGNE';
    default:
      return 'LUXURY';
  }
}

/** Map identity id → commercial tier. */
function tierForIdentity(identityId: string): string {
  switch (identityId) {
    case 'royal-luxury':
    case 'botanical-romance':
    case 'cinematic-dark':
      return 'PREMIUM';
    case 'minimal-editorial':
    case 'modern-champagne':
      return 'STANDARD';
    default:
      return 'STANDARD';
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MISSION 5.9.2 P0 (QW7) — Seed PlatformTheme rows');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let created = 0;
  let updated = 0;

  for (const identity of IDENTITY_PRESETS) {
    const fullPreset = identityPresetToThemePreset(identity);
    const category = categoryForIdentity(identity.id);
    const tier = tierForIdentity(identity.id);

    const palette = {
      primary: fullPreset.primaryColor,
      accent: fullPreset.accentColor,
      primaryLight: fullPreset.primaryLight ?? null,
      primaryDark: fullPreset.primaryDark ?? null,
      accentLight: fullPreset.accentLight ?? null,
      surface: fullPreset.surface ?? null,
      surfaceDeep: fullPreset.surfaceDeep ?? null,
      text: fullPreset.text ?? null,
      textMuted: fullPreset.textMuted ?? null,
    };

    const configJson = JSON.stringify({
      identity: identity.id,
      label: identity.label,
      description: identity.description,
      colors: identity.colors,
      fonts: identity.fonts,
      pattern: identity.pattern,
      ambiance: identity.ambiance,
      motionTier: identity.motionTier,
      copyTone: identity.copyTone,
      sectionOverrides: identity.sectionOverrides,
      preview: identity.preview,
      layout: fullPreset.layout,
    });

    const existing = await prisma.platformTheme.findUnique({
      where: { slug: identity.id },
      select: { id: true, updatedAt: true },
    });

    const result = await prisma.platformTheme.upsert({
      where: { slug: identity.id },
      update: {
        name: identity.label,
        paletteJson: JSON.stringify(palette),
        fontDisplay: fullPreset.fontDisplay,
        fontBody: fullPreset.fontBody,
        isBuiltIn: true,
        status: 'PUBLISHED',
        isPremium: tier === 'PREMIUM' || tier === 'EXCLUSIVE',
        isRecommended: identity.id === 'royal-luxury' || identity.id === 'modern-champagne',
        isDefault: identity.id === 'modern-champagne',
        tier,
        category,
        version: '1.0.0',
        identity: identity.id,
        configJson,
      },
      create: {
        name: identity.label,
        slug: identity.id,
        paletteJson: JSON.stringify(palette),
        fontDisplay: fullPreset.fontDisplay,
        fontBody: fullPreset.fontBody,
        isBuiltIn: true,
        status: 'PUBLISHED',
        isPremium: tier === 'PREMIUM' || tier === 'EXCLUSIVE',
        isRecommended: identity.id === 'royal-luxury' || identity.id === 'modern-champagne',
        isDefault: identity.id === 'modern-champagne',
        tier,
        category,
        version: '1.0.0',
        identity: identity.id,
        configJson,
      },
    });

    if (existing) {
      updated++;
      console.log(`  ↻ UPDATED  ${identity.id.padEnd(22)} → ${result.id}`);
    } else {
      created++;
      console.log(`  ✚ CREATED  ${identity.id.padEnd(22)} → ${result.id}`);
    }
    console.log(`             category=${category}  tier=${tier}  isPremium=${tier === 'PREMIUM'}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Done. ${created} created, ${updated} updated.`);
  console.log('═══════════════════════════════════════════════════════════════\n`);

  // Verify
  const total = await prisma.platformTheme.count();
  console.log(`  Total PlatformTheme rows in DB: ${total}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
