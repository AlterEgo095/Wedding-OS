// ══════════════════════════════════════════════════════════════════════════════
// scripts/seed-platform-themes-phase1.cjs
// MISSION 5.9.2 P1 — Unified PlatformTheme catalog migration seed.
// ══════════════════════════════════════════════════════════════════════════════
//
// Migrates the 4 fragmented theme registries (THEME_PACKAGES, THEME_PRESETS,
// THEME_TEMPLATES, IDENTITY_PRESETS) into a single DB-backed PlatformTheme
// catalog (audit 5.9.1 P1-1 fix — "four disconnected theme registries with
// drift" → single source of truth).
//
// Seed composition (21 themes total):
//   - 12 entries from THEME_PACKAGES (royal-gold, royal-black, sapphire-noir,
//     congo-prestige, kente, white-romance, elegant-beige, pure-white, nordic,
//     beach, garden, sunset) — rich metadata: sections, invitation, demo, features
//   - 4 entries from THEME_TEMPLATES (classic-gold, romantic-rose, minimal-modern,
//     royal-night) — marked LEGACY, version 0.9.0
//   - 5 entries from IDENTITY_PRESETS (royal-luxury, minimal-editorial,
//     botanical-romance, cinematic-dark, modern-champagne) — already seeded in
//     P0 QW7, re-upserted here with enhanced metadata
//
// Idempotent: re-running updates existing rows in place (no duplicates).
//
// USAGE:
//   DATABASE_URL='file:/path/to/custom.db' node scripts/seed-platform-themes-phase1.cjs
// ══════════════════════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── 12 THEME_PACKAGES (rich metadata) ───────────────────────────────────────
// Mirrors src/lib/aenws/theme-packages.ts — colors, fonts, category, tier,
// sections, invitation, demo, features. Stored as rich JSON in configJson.

const THEME_PACKAGES_SEED = [
  {
    slug: 'royal-gold', name: 'Royal Gold', category: 'LUXURY', tier: 'FREE',
    description: 'Or royal, noir nuit, Cormorant Garamond. Ambiance cinematic avec poussière dorée.',
    colors: { primary: '#D4AF37', primaryLight: '#E8C977', primaryDark: '#A8842A', accent: '#1a1a2e', accentLight: '#2a2a4e', surface: '#0a0a0a', surfaceDeep: '#050505', text: '#FAF8F5', textMuted: '#8a8a8a' },
    fonts: { display: 'Cormorant Garamond', body: 'Inter', displayWeight: '700', bodyWeight: '400' },
    pattern: 'dots-gold', ambiance: 'radial-gradient(ellipse at top, rgba(212,175,55,0.08), transparent 60%), linear-gradient(180deg, #0a0a0a, #050505)',
    motionTier: 'cinematic', layout: 'royal',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
  },
  {
    slug: 'royal-black', name: 'Royal Black', category: 'LUXURY', tier: 'PREMIUM',
    description: 'Noir profond et or vieilli, Playfair Display. Ambiance théâtrale dramatique.',
    colors: { primary: '#C9A961', primaryLight: '#D4B876', primaryDark: '#9A8048', accent: '#0a0a0a', accentLight: '#1a1a1a', surface: '#000000', surfaceDeep: '#000000', text: '#E8E0D0', textMuted: '#7a7570' },
    fonts: { display: 'Playfair Display', body: 'Montserrat', displayWeight: '700', bodyWeight: '300' },
    pattern: 'rays-gold', ambiance: 'radial-gradient(ellipse at center, rgba(201,169,97,0.06), transparent 70%), linear-gradient(180deg, #000000, #0a0a0a)',
    motionTier: 'cinematic', layout: 'royal',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
  },
  {
    slug: 'sapphire-noir', name: 'Sapphire Noir', category: 'LUXURY', tier: 'PREMIUM',
    description: 'Saphir profond, or champagne et noir velouté. Élégance intemporelle.',
    colors: { primary: '#C9A961', primaryLight: '#DBC285', primaryDark: '#9A8048', accent: '#0D1B2A', accentLight: '#1B2D45', surface: '#050A14', surfaceDeep: '#020509', text: '#E8E4DC', textMuted: '#6B7894' },
    fonts: { display: 'Playfair Display', body: 'Inter', displayWeight: '600', bodyWeight: '400' },
    pattern: 'dots-champagne', ambiance: 'radial-gradient(ellipse at top right, rgba(13,27,42,0.6), transparent 50%), radial-gradient(ellipse at bottom left, rgba(201,169,97,0.08), transparent 60%), linear-gradient(180deg, #050A14, #020509)',
    motionTier: 'cinematic', layout: 'royal',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
  },
  {
    slug: 'congo-prestige', name: 'Congo Prestige', category: 'AFRICAN', tier: 'EXCLUSIVE',
    description: 'Rouge et or ciel, inspiration drapeau RDC. Ambiance dorée intense et faste congolais.',
    colors: { primary: '#FFD700', primaryLight: '#FFE45C', primaryDark: '#C9A800', accent: '#C41E3A', accentLight: '#E63946', surface: '#1a0505', surfaceDeep: '#0a0202', text: '#FFE8D6', textMuted: '#A08070' },
    fonts: { display: 'Cormorant Garamond', body: 'Inter', displayWeight: '700', bodyWeight: '400' },
    pattern: 'kente-rdc', ambiance: 'radial-gradient(ellipse at center, rgba(255,215,0,0.1), transparent 60%), linear-gradient(180deg, #1a0505, #0a0202)',
    motionTier: 'cinematic', layout: 'royal',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
  },
  {
    slug: 'kente', name: 'Kente', category: 'AFRICAN', tier: 'PREMIUM',
    description: 'Orange et vert profond, inspiration tissu traditionnel ghanéen. Héritage et chaleur.',
    colors: { primary: '#E8A53D', primaryLight: '#F0BC65', primaryDark: '#B07D2A', accent: '#1B5E20', accentLight: '#2E7D32', surface: '#1a1505', surfaceDeep: '#0d0a02', text: '#FFF3E0', textMuted: '#9A8B70' },
    fonts: { display: 'Playfair Display', body: 'Montserrat', displayWeight: '700', bodyWeight: '400' },
    pattern: 'kente-ghana', ambiance: 'radial-gradient(ellipse at top, rgba(232,165,61,0.12), transparent 60%), linear-gradient(180deg, #1a1505, #0d0a02)',
    motionTier: 'cinematic', layout: 'royal',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
  },
  {
    slug: 'white-romance', name: 'White Romance', category: 'CLASSIC', tier: 'FREE',
    description: 'Crème et bronze, Cormorant Garamond. Romance intemporelle et douce.',
    colors: { primary: '#8B6F47', primaryLight: '#A8895C', primaryDark: '#6B5535', accent: '#F5E6D3', accentLight: '#FAF0E0', surface: '#FAF6F0', surfaceDeep: '#F0E8DC', text: '#3D2B1F', textMuted: '#7A6B5A' },
    fonts: { display: 'Cormorant Garamond', body: 'Lato', displayWeight: '700', bodyWeight: '400' },
    pattern: 'dots-bronze', ambiance: 'radial-gradient(ellipse at top, rgba(139,111,71,0.06), transparent 60%), linear-gradient(180deg, #FAF6F0, #F0E8DC)',
    motionTier: 'subtle', layout: 'classic',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
  },
  {
    slug: 'elegant-beige', name: 'Elegant Beige', category: 'CLASSIC', tier: 'FREE',
    description: 'Tons neutres et naturels, typographie raffinée. Élégance feutrée et chaleureuse.',
    colors: { primary: '#5C4033', primaryLight: '#7A5644', primaryDark: '#3D2820', accent: '#D4C5B0', accentLight: '#E0D2BC', surface: '#EDE5D8', surfaceDeep: '#E0D5C2', text: '#2D1F15', textMuted: '#6B5A4A' },
    fonts: { display: 'Cormorant Garamond', body: 'Open Sans', displayWeight: '700', bodyWeight: '400' },
    pattern: 'lines-brown', ambiance: 'radial-gradient(ellipse at top, rgba(92,64,51,0.05), transparent 60%), linear-gradient(180deg, #EDE5D8, #E0D5C2)',
    motionTier: 'subtle', layout: 'classic',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
  },
  {
    slug: 'pure-white', name: 'Pure White', category: 'MINIMAL', tier: 'FREE',
    description: 'Blanc et gris anthracite, Montserrat. Pureté minimale, ambiance champagne.',
    colors: { primary: '#2C2C2C', primaryLight: '#4A4A4A', primaryDark: '#1A1A1A', accent: '#FFFFFF', accentLight: '#F5F5F5', surface: '#FFFFFF', surfaceDeep: '#F0F0F0', text: '#1A1A1A', textMuted: '#7A7A7A' },
    fonts: { display: 'Montserrat', body: 'Inter', displayWeight: '300', bodyWeight: '400' },
    pattern: 'dots-grey', ambiance: 'linear-gradient(180deg, #FFFFFF, #F0F0F0)',
    motionTier: 'subtle', layout: 'minimalist',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
  },
  {
    slug: 'nordic', name: 'Nordic', category: 'MINIMAL', tier: 'FREE',
    description: 'Bleu pâle et blanc, inspiration scandinave. Sérénité et midnight sun.',
    colors: { primary: '#5A7A9A', primaryLight: '#7A9AB0', primaryDark: '#3A5A7A', accent: '#FFFFFF', accentLight: '#F0F4F8', surface: '#E8EEF4', surfaceDeep: '#D8E0E8', text: '#1A2A3A', textMuted: '#6A7A8A' },
    fonts: { display: 'Montserrat', body: 'Inter', displayWeight: '300', bodyWeight: '400' },
    pattern: 'lines-blue', ambiance: 'radial-gradient(ellipse at top, rgba(90,122,154,0.08), transparent 60%), linear-gradient(180deg, #E8EEF4, #D8E0E8)',
    motionTier: 'subtle', layout: 'minimalist',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
  },
  {
    slug: 'beach', name: 'Beach', category: 'DESTINATION', tier: 'FREE',
    description: 'Turquoise et sable, Pacifico décontractée. Évasion plage et resort.',
    colors: { primary: '#4FC3F7', primaryLight: '#80D4F8', primaryDark: '#29B6F6', accent: '#F5E6D3', accentLight: '#FAF0E0', surface: '#E0F4FA', surfaceDeep: '#C8EAF5', text: '#0D4A5C', textMuted: '#5A8090' },
    fonts: { display: 'Pacifico', body: 'Lato', displayWeight: '400', bodyWeight: '400' },
    pattern: 'waves-turquoise', ambiance: 'radial-gradient(ellipse at top, rgba(79,195,247,0.12), transparent 60%), linear-gradient(180deg, #E0F4FA, #C8EAF5)',
    motionTier: 'subtle', layout: 'destination',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
  },
  {
    slug: 'garden', name: 'Garden', category: 'DESTINATION', tier: 'FREE',
    description: 'Vert jardin et crème florale, inspiration botanique. Ambiance champêtre.',
    colors: { primary: '#558B2F', primaryLight: '#7AB040', primaryDark: '#3D6B1F', accent: '#FFF8E1', accentLight: '#FFFCF0', surface: '#F1F8E9', surfaceDeep: '#E0F0D0', text: '#1B3A0A', textMuted: '#5A7A4A' },
    fonts: { display: 'Cormorant Garamond', body: 'Lato', displayWeight: '700', bodyWeight: '400' },
    pattern: 'leaves-green', ambiance: 'radial-gradient(ellipse at top, rgba(85,139,47,0.08), transparent 60%), linear-gradient(180deg, #F1F8E9, #E0F0D0)',
    motionTier: 'subtle', layout: 'destination',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
  },
  {
    slug: 'sunset', name: 'Sunset', category: 'DESTINATION', tier: 'PREMIUM',
    description: 'Orange et jaune doré, ambiance golden hour. Luxe rose vibrant et chaleur.',
    colors: { primary: '#FF6B6B', primaryLight: '#FF8E8E', primaryDark: '#E04848', accent: '#FFD93D', accentLight: '#FFE066', surface: '#FFF4E6', surfaceDeep: '#FFE8CC', text: '#4A1A0A', textMuted: '#8A5A4A' },
    fonts: { display: 'Playfair Display', body: 'Montserrat', displayWeight: '700', bodyWeight: '400' },
    pattern: 'rays-coral', ambiance: 'radial-gradient(ellipse at top, rgba(255,107,107,0.12), transparent 60%), radial-gradient(ellipse at bottom, rgba(255,217,61,0.08), transparent 60%), linear-gradient(180deg, #FFF4E6, #FFE8CC)',
    motionTier: 'elegant', layout: 'destination',
    features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
  },
];

// ─── 4 THEME_TEMPLATES (LEGACY, simple palettes) ─────────────────────────────
// Mirrors src/lib/themes/templates.ts — these are simple color/font palettes
// without rich sections/invitation/demo. Marked LEGACY in version 0.9.0.

const THEME_TEMPLATES_SEED = [
  {
    slug: 'classic-gold', name: 'Or Classique', category: 'CLASSIC', tier: 'FREE',
    description: "L'élégance intemporelle de l'or et du champagne — la signature Heureux Mariage.",
    colors: { primary: '#D4A853', accent: '#C8785A' },
    fonts: { display: 'Cormorant Garamond', body: 'Inter' },
    layout: 'classic',
    isLegacy: true,
  },
  {
    slug: 'romantic-rose', name: 'Rose Romantique', category: 'CLASSIC', tier: 'PREMIUM',
    description: 'Tendresse et poésie pour une célébration tout en douceur et romantisme.',
    colors: { primary: '#E8B4B8', accent: '#C08497' },
    fonts: { display: 'Playfair Display', body: 'Lato' },
    layout: 'modern',
    isLegacy: true,
  },
  {
    slug: 'minimal-modern', name: 'Minimal Moderne', category: 'MINIMAL', tier: 'PREMIUM',
    description: 'Lignes pures, gris contemporains — pour les couples au goût épuré et moderne.',
    colors: { primary: '#525252', accent: '#A3A3A3' },
    fonts: { display: 'Marcellus', body: 'Montserrat' },
    layout: 'minimalist',
    isLegacy: true,
  },
  {
    slug: 'royal-night', name: 'Nuit Royale', category: 'LUXURY', tier: 'EXCLUSIVE',
    description: "Sombre et somptueux, l'or étincelant sur fond nuit pour une allure majestueuse.",
    colors: { primary: '#C9A14A', accent: '#1B1B3A' },
    fonts: { display: 'Italiana', body: 'Lora' },
    layout: 'royal',
    isLegacy: true,
  },
];

// ─── 5 IDENTITY_PRESETS (re-upsert with enhanced metadata) ───────────────────
// Mirrors src/lib/themes/identity-presets.ts — the 5 curated end-to-end design
// systems. Already seeded by P0 QW7; this re-upsert enriches configJson with
// the full identity metadata (basePresetSlug, sectionOverrides, motionTier,
// copyTone, preview swatch).

const IDENTITY_PRESETS_SEED = [
  {
    slug: 'royal-luxury', name: 'Royal Luxury', category: 'ROYAL', tier: 'PREMIUM',
    description: "Somptuosité navy et or, typographie Cormorant, motif ornemental. Héros cinématographique et galerie luxueuse à cadres dorés.",
    basePresetSlug: 'royal-gold',
    colors: { primary: '#D4AF37', accent: '#1a1a2e', surface: '#0a0a1e', surfaceDeep: '#050518', text: '#F5E6C8' },
    fonts: { display: 'Cormorant Garamond', body: 'Inter' },
    pattern: 'ornamental', ambiance: 'radial-gradient(ellipse at top, rgba(212,175,55,0.12), transparent 60%), linear-gradient(180deg, #0a0a1e, #050518)',
    motionTier: 'elegant', copyTone: 'majestueux', layout: 'royal',
    sectionOverrides: [
      { sectionType: 'hero', component: 'CinematicHero' },
      { sectionType: 'gallery', component: 'LuxuryGallery' },
      { sectionType: 'countdown', component: 'LuxuryCountdown' },
    ],
    preview: { bg: '#0a0a1e', text: '#F5E6C8', swatch: ['#0a0a1e', '#D4AF37', '#1a1a2e', '#F5E6C8'] },
    isIdentity: true,
  },
  {
    slug: 'minimal-editorial', name: 'Minimal Editorial', category: 'EDITORIAL', tier: 'STANDARD',
    description: "Crème et charbon, Playfair Display épuré, sans motif. Héros éditorial en split-layout pour une mise en page magazine.",
    basePresetSlug: 'pure-white',
    colors: { primary: '#1F1F1F', accent: '#E8E1D4', surface: '#FAF7F2', surfaceDeep: '#F0EBE0', text: '#1F1F1F' },
    fonts: { display: 'Playfair Display', body: 'Inter' },
    pattern: 'none', ambiance: 'linear-gradient(180deg, #FAF7F2, #F0EBE0)',
    motionTier: 'subtle', copyTone: 'épuré', layout: 'minimalist',
    sectionOverrides: [{ sectionType: 'hero', component: 'EditorialHero' }],
    preview: { bg: '#FAF7F2', text: '#1F1F1F', swatch: ['#FAF7F2', '#1F1F1F', '#E8E1D4', '#A8A8A8'] },
    isIdentity: true,
  },
  {
    slug: 'botanical-romance', name: 'Botanical Romance', category: 'BOTANICAL', tier: 'PREMIUM',
    description: "Vert sauge et rose blush, Cormorant Garamond, motif de feuilles. Animations douces, héros à photographie soft-focus.",
    basePresetSlug: 'garden',
    colors: { primary: '#8FA68E', accent: '#F4D9D0', surface: '#F8F5EF', surfaceDeep: '#EFEAE0', text: '#3A4A3A' },
    fonts: { display: 'Cormorant Garamond', body: 'Lato' },
    pattern: 'leaves', ambiance: 'radial-gradient(ellipse at top, rgba(143,166,142,0.10), transparent 60%), linear-gradient(180deg, #F8F5EF, #EFEAE0)',
    motionTier: 'subtle', copyTone: 'tendrement', layout: 'classic',
    sectionOverrides: [{ sectionType: 'gallery', component: 'LuxuryGallery' }],
    preview: { bg: '#F8F5EF', text: '#3A4A3A', swatch: ['#8FA68E', '#F4D9D0', '#F8F5EF', '#3A4A3A'] },
    isIdentity: true,
  },
  {
    slug: 'cinematic-dark', name: 'Cinematic Dark', category: 'CINEMATIC', tier: 'PREMIUM',
    description: "Noir profond et or éclatant, Playfair Display, grain de film. Héros cinématographique plein écran et galerie immersive en plein écran.",
    basePresetSlug: 'royal-black',
    colors: { primary: '#C9A961', accent: '#0a0a0a', surface: '#000000', surfaceDeep: '#050505', text: '#F0E6D0' },
    fonts: { display: 'Playfair Display', body: 'Montserrat' },
    pattern: 'film-grain', ambiance: 'radial-gradient(ellipse at center, rgba(201,169,97,0.08), transparent 70%), linear-gradient(180deg, #000000, #050505)',
    motionTier: 'cinematic', copyTone: 'cinématique', layout: 'royal',
    sectionOverrides: [
      { sectionType: 'hero', component: 'CinematicHero' },
      { sectionType: 'gallery', component: 'ImmersiveGallery' },
      { sectionType: 'countdown', component: 'LuxuryCountdown' },
    ],
    preview: { bg: '#000000', text: '#F0E6D0', swatch: ['#000000', '#C9A961', '#1a1a1a', '#F0E6D0'] },
    isIdentity: true,
  },
  {
    slug: 'modern-champagne', name: 'Modern Champagne', category: 'CHAMPAGNE', tier: 'STANDARD',
    description: "Champagne et bronze, Geist Sans moderne, sans motif. Héros éditorial épuré pour une esthétique contemporaine et chaleureuse.",
    basePresetSlug: 'elegant-beige',
    colors: { primary: '#A8743D', accent: '#D9C3A1', surface: '#F5EDE0', surfaceDeep: '#E8DDC8', text: '#3A2E22' },
    fonts: { display: 'Playfair Display', body: 'Geist Sans' },
    pattern: 'none', ambiance: 'radial-gradient(ellipse at top, rgba(168,116,61,0.06), transparent 60%), linear-gradient(180deg, #F5EDE0, #E8DDC8)',
    motionTier: 'subtle', copyTone: 'chaleureux', layout: 'modern',
    sectionOverrides: [{ sectionType: 'hero', component: 'EditorialHero' }],
    preview: { bg: '#F5EDE0', text: '#3A2E22', swatch: ['#A8743D', '#D9C3A1', '#F5EDE0', '#3A2E22'] },
    isIdentity: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPalette(theme) {
  const c = theme.colors || {};
  return {
    primary: c.primary || '#D4AF37',
    accent: c.accent || '#1a1a2e',
    primaryLight: c.primaryLight || null,
    primaryDark: c.primaryDark || null,
    accentLight: c.accentLight || null,
    surface: c.surface || null,
    surfaceDeep: c.surfaceDeep || null,
    text: c.text || null,
    textMuted: c.textMuted || null,
  };
}

function buildConfigJson(theme, source) {
  return JSON.stringify({
    source, // 'THEME_PACKAGES' | 'THEME_TEMPLATES' | 'IDENTITY_PRESETS'
    slug: theme.slug,
    name: theme.name,
    description: theme.description,
    category: theme.category,
    tier: theme.tier,
    layout: theme.layout || 'classic',
    colors: theme.colors,
    fonts: theme.fonts,
    pattern: theme.pattern || 'none',
    ambiance: theme.ambiance || null,
    motionTier: theme.motionTier || 'subtle',
    copyTone: theme.copyTone || null,
    features: theme.features || null,
    // Identity-specific fields (only present for IDENTITY_PRESETS)
    ...(theme.isIdentity ? {
      identity: theme.slug,
      basePresetSlug: theme.basePresetSlug,
      sectionOverrides: theme.sectionOverrides,
      preview: theme.preview,
    } : {}),
    // Legacy marker (only for THEME_TEMPLATES)
    ...(theme.isLegacy ? { isLegacy: true } : {}),
  });
}

function isPremiumTier(tier) {
  return tier === 'PREMIUM' || tier === 'EXCLUSIVE';
}

async function upsertTheme(theme, source, version, isDefault, isRecommended) {
  const palette = buildPalette(theme);
  const configJson = buildConfigJson(theme, source);
  const isPremium = isPremiumTier(theme.tier);
  const identity = theme.isIdentity ? theme.slug : null;

  const existing = await prisma.platformTheme.findUnique({
    where: { slug: theme.slug },
    select: { id: true },
  });

  const data = {
    name: theme.name,
    paletteJson: JSON.stringify(palette),
    fontDisplay: theme.fonts.display,
    fontBody: theme.fonts.body,
    isBuiltIn: true,
    status: 'PUBLISHED',
    isPremium,
    isRecommended: !!isRecommended,
    isDefault: !!isDefault,
    tier: theme.tier,
    category: theme.category,
    version,
    identity,
    configJson,
  };

  const result = await prisma.platformTheme.upsert({
    where: { slug: theme.slug },
    update: data,
    create: { slug: theme.slug, ...data },
  });

  return { result, existed: !!existing };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MISSION 5.9.2 P1 — Unified PlatformTheme catalog migration');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let created = 0, updated = 0;

  // ─── 12 THEME_PACKAGES ───────────────────────────────────────────────────
  console.log('  ▸ Seeding 12 THEME_PACKAGES entries (rich metadata, v1.0.0)...');
  for (const theme of THEME_PACKAGES_SEED) {
    // Recommended: royal-gold (signature). Default for new weddings: royal-gold.
    const isRecommended = theme.slug === 'royal-gold';
    const isDefault = theme.slug === 'royal-gold';
    const { result, existed } = await upsertTheme(theme, 'THEME_PACKAGES', '1.0.0', isDefault, isRecommended);
    if (existed) { updated++; console.log(`    ↻ UPDATED  ${theme.slug.padEnd(20)} → ${result.id}`); }
    else { created++; console.log(`    ✚ CREATED  ${theme.slug.padEnd(20)} → ${result.id}`); }
  }

  // ─── 4 THEME_TEMPLATES (LEGACY) ──────────────────────────────────────────
  console.log('\n  ▸ Seeding 4 THEME_TEMPLATES entries (LEGACY, v0.9.0)...');
  for (const theme of THEME_TEMPLATES_SEED) {
    const { result, existed } = await upsertTheme(theme, 'THEME_TEMPLATES', '0.9.0', false, false);
    if (existed) { updated++; console.log(`    ↻ UPDATED  ${theme.slug.padEnd(20)} → ${result.id} [LEGACY]`); }
    else { created++; console.log(`    ✚ CREATED  ${theme.slug.padEnd(20)} → ${result.id} [LEGACY]`); }
  }

  // ─── 5 IDENTITY_PRESETS (re-upsert with enhanced metadata) ───────────────
  console.log('\n  ▸ Re-seeding 5 IDENTITY_PRESETS entries (enhanced metadata, v1.0.0)...');
  for (const theme of IDENTITY_PRESETS_SEED) {
    // Recommended: royal-luxury + modern-champagne. Default: modern-champagne.
    const isRecommended = theme.slug === 'royal-luxury' || theme.slug === 'modern-champagne';
    const isDefault = theme.slug === 'modern-champagne';
    const { result, existed } = await upsertTheme(theme, 'IDENTITY_PRESETS', '1.0.0', isDefault, isRecommended);
    if (existed) { updated++; console.log(`    ↻ UPDATED  ${theme.slug.padEnd(20)} → ${result.id} [IDENTITY]`); }
    else { created++; console.log(`    ✚ CREATED  ${theme.slug.padEnd(20)} → ${result.id} [IDENTITY]`); }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Done. ${created} created, ${updated} updated.`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const total = await prisma.platformTheme.count();
  const byTier = await prisma.platformTheme.groupBy({
    by: ['tier'],
    _count: true,
    orderBy: { tier: 'asc' },
  });
  const byCategory = await prisma.platformTheme.groupBy({
    by: ['category'],
    _count: true,
    orderBy: { category: 'asc' },
  });
  const premiumCount = await prisma.platformTheme.count({ where: { isPremium: true } });
  const identityCount = await prisma.platformTheme.count({ where: { NOT: { identity: null } } });

  console.log(`  Total PlatformTheme rows in DB: ${total}`);
  console.log(`  Premium themes:                  ${premiumCount}`);
  console.log(`  Identity presets:                ${identityCount}`);
  console.log(`  By tier:    ${byTier.map(t => `${t.tier}=${t._count}`).join(', ')}`);
  console.log(`  By category:${byCategory.map(c => ` ${c.category || 'null'}=${c._count}`).join(', ')}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
