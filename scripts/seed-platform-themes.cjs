// ══════════════════════════════════════════════════════════════════════════════
// scripts/seed-platform-themes.cjs
// MISSION 5.9.2 P0 (QW7) — Seed 5 PlatformTheme rows from identity presets.
// Plain JS version (runs with node, no TypeScript compiler needed).
// ══════════════════════════════════════════════════════════════════════════════
//
// USAGE:
//   DATABASE_URL='file:/path/to/custom.db' node scripts/seed-platform-themes.cjs
// ══════════════════════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Inline identity preset data (mirrors src/lib/themes/identity-presets.ts) ───
// Only the fields needed for PlatformTheme seeding are included here.

const IDENTITY_PRESETS = [
  {
    id: 'royal-luxury',
    label: 'Royal Luxury',
    description: 'Somptuosité navy et or, typographie Cormorant, motif ornemental.',
    basePresetSlug: 'royal-gold',
    colors: { surface: '#0a0a1e', surfaceDeep: '#050518', text: '#F5E6C8' },
    fonts: { display: 'Cormorant Garamond', body: 'Inter' },
    pattern: 'ornamental',
    ambiance: 'radial-gradient(ellipse at top, rgba(212,175,55,0.12), transparent 60%)',
    motionTier: 'elegant',
    sectionOverrides: [
      { sectionType: 'hero', component: 'CinematicHero' },
      { sectionType: 'gallery', component: 'LuxuryGallery' },
      { sectionType: 'countdown', component: 'LuxuryCountdown' },
    ],
    preview: { bg: '#0a0a1e', text: '#F5E6C8', swatch: ['#0a0a1e', '#D4AF37', '#1a1a2e', '#F5E6C8'] },
    // From royal-gold base preset
    primaryColor: '#D4AF37',
    accentColor: '#1a1a2e',
    primaryLight: '#E8C97A',
    primaryDark: '#B8941F',
    accentLight: '#2D2D5C',
    textMuted: '#A0A0B0',
    layout: 'royal',
  },
  {
    id: 'minimal-editorial',
    label: 'Minimal Editorial',
    description: 'Crème et charbon, Playfair Display épuré, sans motif.',
    basePresetSlug: 'pure-white',
    colors: { primary: '#1F1F1F', accent: '#E8E1D4', surface: '#FAF7F2', surfaceDeep: '#F0EBE0', text: '#1F1F1F' },
    fonts: { display: 'Playfair Display', body: 'Inter' },
    pattern: 'none',
    ambiance: 'linear-gradient(180deg, #FAF7F2, #F0EBE0)',
    motionTier: 'subtle',
    sectionOverrides: [{ sectionType: 'hero', component: 'EditorialHero' }],
    preview: { bg: '#FAF7F2', text: '#1F1F1F', swatch: ['#FAF7F2', '#1F1F1F', '#E8E1D4', '#A8A8A8'] },
    primaryColor: '#1F1F1F',
    accentColor: '#E8E1D4',
    primaryLight: '#4A4A4A',
    primaryDark: '#0A0A0A',
    accentLight: '#F5F0E8',
    textMuted: '#7A7A7A',
    layout: 'minimalist',
  },
  {
    id: 'botanical-romance',
    label: 'Botanical Romance',
    description: 'Vert sauge et rose blush, Cormorant Garamond, motif de feuilles.',
    basePresetSlug: 'garden',
    colors: { primary: '#8FA68E', accent: '#F4D9D0', surface: '#F8F5EF', surfaceDeep: '#EFEAE0', text: '#3A4A3A' },
    fonts: { display: 'Cormorant Garamond', body: 'Lato' },
    pattern: 'leaves',
    ambiance: 'radial-gradient(ellipse at top, rgba(143,166,142,0.10), transparent 60%)',
    motionTier: 'subtle',
    sectionOverrides: [{ sectionType: 'gallery', component: 'LuxuryGallery' }],
    preview: { bg: '#F8F5EF', text: '#3A4A3A', swatch: ['#8FA68E', '#F4D9D0', '#F8F5EF', '#3A4A3A'] },
    primaryColor: '#8FA68E',
    accentColor: '#F4D9D0',
    primaryLight: '#B5C9B4',
    primaryDark: '#5E7B5D',
    accentLight: '#FAE8E0',
    textMuted: '#7A8A7A',
    layout: 'classic',
  },
  {
    id: 'cinematic-dark',
    label: 'Cinematic Dark',
    description: 'Noir profond et or éclatant, Playfair Display, grain de film.',
    basePresetSlug: 'royal-black',
    colors: { surface: '#000000', surfaceDeep: '#050505', text: '#F0E6D0' },
    fonts: { display: 'Playfair Display', body: 'Montserrat' },
    pattern: 'film-grain',
    ambiance: 'radial-gradient(ellipse at center, rgba(201,169,97,0.08), transparent 70%)',
    motionTier: 'cinematic',
    sectionOverrides: [
      { sectionType: 'hero', component: 'CinematicHero' },
      { sectionType: 'gallery', component: 'ImmersiveGallery' },
      { sectionType: 'countdown', component: 'LuxuryCountdown' },
    ],
    preview: { bg: '#000000', text: '#F0E6D0', swatch: ['#000000', '#C9A961', '#1a1a1a', '#F0E6D0'] },
    primaryColor: '#C9A961',
    accentColor: '#0a0a0a',
    primaryLight: '#E0C889',
    primaryDark: '#A08844',
    accentLight: '#2A2A2A',
    textMuted: '#909090',
    layout: 'royal',
  },
  {
    id: 'modern-champagne',
    label: 'Modern Champagne',
    description: 'Champagne et bronze, Geist Sans moderne, sans motif.',
    basePresetSlug: 'elegant-beige',
    colors: { primary: '#A8743D', accent: '#D9C3A1', surface: '#F5EDE0', surfaceDeep: '#E8DDC8', text: '#3A2E22' },
    fonts: { display: 'Playfair Display', body: 'Geist Sans' },
    pattern: 'none',
    ambiance: 'radial-gradient(ellipse at top, rgba(168,116,61,0.06), transparent 60%)',
    motionTier: 'subtle',
    sectionOverrides: [{ sectionType: 'hero', component: 'EditorialHero' }],
    preview: { bg: '#F5EDE0', text: '#3A2E22', swatch: ['#A8743D', '#D9C3A1', '#F5EDE0', '#3A2E22'] },
    primaryColor: '#A8743D',
    accentColor: '#D9C3A1',
    primaryLight: '#C99A5E',
    primaryDark: '#7E5629',
    accentLight: '#E8D8BC',
    textMuted: '#7A6E5A',
    layout: 'modern',
  },
];

function categoryForIdentity(identityId) {
  const map = {
    'royal-luxury': 'ROYAL',
    'minimal-editorial': 'EDITORIAL',
    'botanical-romance': 'BOTANICAL',
    'cinematic-dark': 'CINEMATIC',
    'modern-champagne': 'CHAMPAGNE',
  };
  return map[identityId] || 'LUXURY';
}

function tierForIdentity(identityId) {
  const map = {
    'royal-luxury': 'PREMIUM',
    'minimal-editorial': 'STANDARD',
    'botanical-romance': 'PREMIUM',
    'cinematic-dark': 'PREMIUM',
    'modern-champagne': 'STANDARD',
  };
  return map[identityId] || 'STANDARD';
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MISSION 5.9.2 P0 (QW7) — Seed PlatformTheme rows');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let created = 0;
  let updated = 0;

  for (const identity of IDENTITY_PRESETS) {
    const category = categoryForIdentity(identity.id);
    const tier = tierForIdentity(identity.id);

    const palette = {
      primary: identity.primaryColor,
      accent: identity.accentColor,
      primaryLight: identity.primaryLight || null,
      primaryDark: identity.primaryDark || null,
      accentLight: identity.accentLight || null,
      surface: identity.colors.surface || null,
      surfaceDeep: identity.colors.surfaceDeep || null,
      text: identity.colors.text || null,
      textMuted: identity.textMuted || null,
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
      sectionOverrides: identity.sectionOverrides,
      preview: identity.preview,
      layout: identity.layout,
    });

    const isPremium = tier === 'PREMIUM' || tier === 'EXCLUSIVE';
    const isRecommended = identity.id === 'royal-luxury' || identity.id === 'modern-champagne';
    const isDefault = identity.id === 'modern-champagne';

    const existing = await prisma.platformTheme.findUnique({
      where: { slug: identity.id },
      select: { id: true },
    });

    const result = await prisma.platformTheme.upsert({
      where: { slug: identity.id },
      update: {
        name: identity.label,
        paletteJson: JSON.stringify(palette),
        fontDisplay: identity.fonts.display,
        fontBody: identity.fonts.body,
        isBuiltIn: true,
        status: 'PUBLISHED',
        isPremium,
        isRecommended,
        isDefault,
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
        fontDisplay: identity.fonts.display,
        fontBody: identity.fonts.body,
        isBuiltIn: true,
        status: 'PUBLISHED',
        isPremium,
        isRecommended,
        isDefault,
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
    console.log(`             category=${category}  tier=${tier}  isPremium=${isPremium}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Done. ${created} created, ${updated} updated.`);
  console.log('═══════════════════════════════════════════════════════════════\n');

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
