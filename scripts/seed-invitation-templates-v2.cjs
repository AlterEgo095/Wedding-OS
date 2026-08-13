// ══════════════════════════════════════════════════════════════════════════════
// scripts/seed-invitation-templates-v2.cjs
// MISSION 5.9.4 P2-1 — Seed 5 NEW premium InvitationTemplate rows.
// ══════════════════════════════════════════════════════════════════════════════
//
// Adds 5 genuinely distinct premium templates to reach the 15-template catalog
// target (Section 7). Each has a REAL art direction — not just color variants.
//
// Templates added:
//   1. pearl-romance       — BOTANICAL, pearl/shimmer palette, Playfair + Lato
//   2. emerald-palace      — LUXURY, deep emerald + antique gold, Cormorant
//   3. old-money           — EDITORIAL, navy + cream + subtle gold, Garamond
//   4. art-deco            — EDITORIAL, black + gold + geometric, Poiret One
//   5. botanical-garden    — BOTANICAL, sage + terracotta + cream, Cormorant
//
// IDEMPOTENT: upserts by slug. Safe to run multiple times.
// ══════════════════════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── 5 NEW canonical templates (distinct art direction) ──────────────────────

const NEW_TEMPLATES = [
  {
    slug: 'pearl-romance',
    name: 'Pearl Romance Invitation',
    description: "Pearl / iridescent / romantic — invitation nacrée et lumineuse. Iridescence subtile, ornaments floraux délicats, parfaite pour les cérémonies intimistes et lumineuses.",
    category: 'BOTANICAL', style: 'PEARL_ROMANCE', layout: 'CENTERED_CEREMONY',
    identity: 'botanical-romance', tier: 'PREMIUM',
    themeSlug: 'botanical-romance',
    tokens: {
      '--inv-primary': '#B8A9C9',
      '--inv-accent': '#E8D5E0',
      '--inv-bg': '#FAF8F5',
      '--inv-surface': '#F5F0EE',
      '--inv-surface-deep': '#EDE7E2',
      '--inv-text': '#4A4458',
      '--inv-overlay': 'rgba(250,248,245,0.65)',
      '--inv-hero-opacity': '0.85',
      '--inv-section-padding': '5rem 1.5rem',
      '--inv-font-display': '"Playfair Display", serif',
      '--inv-font-body': '"Lato", sans-serif',
      '--inv-radius': '0.25rem',
      '--inv-shadow': '0 15px 35px -10px rgba(184,169,201,0.35)',
      '--inv-anim-duration': '1000ms',
      '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'emerald-palace',
    name: 'Emerald Palace Invitation',
    description: "Emerald / palace / architectural — invitation émeraude et or. Esthétique de palais avec motifs architecturaux, parfaite pour les mariages somptueux et royaux.",
    category: 'LUXURY', style: 'EMERALD_PALACE', layout: 'FULL_BLEED_IMAGE',
    identity: 'royal-luxury', tier: 'EXCLUSIVE',
    themeSlug: 'royal-luxury',
    tokens: {
      '--inv-primary': '#C9A961',
      '--inv-accent': '#E8C977',
      '--inv-bg': '#0B3D2E',
      '--inv-surface': '#134A38',
      '--inv-surface-deep': '#082820',
      '--inv-text': '#F5F0E0',
      '--inv-overlay': 'rgba(11,61,46,0.55)',
      '--inv-hero-opacity': '0.65',
      '--inv-section-padding': '6rem 1.5rem',
      '--inv-font-display': '"Cormorant Garamond", serif',
      '--inv-font-body': '"Inter", sans-serif',
      '--inv-radius': '0',
      '--inv-shadow': '0 25px 50px -12px rgba(8,40,32,0.8)',
      '--inv-anim-duration': '1500ms',
      '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'old-money',
    name: 'Old Money Invitation',
    description: "Navy / cream / understated — invitation patrimoniale et discrète. Luxe discret, typographie classique, espace généreux, parfaite pour les mariages traditionnels et élégants.",
    category: 'EDITORIAL', style: 'OLD_MONEY', layout: 'TYPOGRAPHIC_HERO',
    identity: 'minimal-editorial', tier: 'PREMIUM',
    themeSlug: 'minimal-editorial',
    tokens: {
      '--inv-primary': '#B8860B',
      '--inv-accent': '#D4A853',
      '--inv-bg': '#1B2838',
      '--inv-surface': '#2A3848',
      '--inv-surface-deep': '#121C28',
      '--inv-text': '#F5F0E8',
      '--inv-overlay': 'rgba(27,40,56,0.45)',
      '--inv-hero-opacity': '0.55',
      '--inv-section-padding': '6rem 2rem',
      '--inv-font-display': '"Garamond Premier Pro", serif',
      '--inv-font-body': '"Times New Roman", serif',
      '--inv-radius': '0',
      '--inv-shadow': '0 10px 30px -8px rgba(27,40,56,0.6)',
      '--inv-anim-duration': '600ms',
      '--inv-anim-easing': 'cubic-bezier(0.25,0.46,0.45,0.94)',
    },
  },
  {
    slug: 'art-deco',
    name: 'Art Deco Invitation',
    description: "Black / gold / geometric — invitation Art Déco des années 1920. Motifs géométriques symétriques, éventails solaires, typographie Poiret, parfaite pour les mariages Gatsby et glamour.",
    category: 'EDITORIAL', style: 'ART_DECO', layout: 'EDITORIAL_GRID',
    identity: 'minimal-editorial', tier: 'PREMIUM',
    themeSlug: 'minimal-editorial',
    tokens: {
      '--inv-primary': '#D4AF37',
      '--inv-accent': '#FFD700',
      '--inv-bg': '#0A0A0A',
      '--inv-surface': '#1A1A1A',
      '--inv-surface-deep': '#050505',
      '--inv-text': '#FAF8F0',
      '--inv-overlay': 'rgba(10,10,10,0.6)',
      '--inv-hero-opacity': '0.5',
      '--inv-section-padding': '5rem 1.5rem',
      '--inv-font-display': '"Poiret One", sans-serif',
      '--inv-font-body': '"Josefin Sans", sans-serif',
      '--inv-radius': '0',
      '--inv-shadow': '0 20px 45px -10px rgba(212,175,55,0.25)',
      '--inv-anim-duration': '900ms',
      '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'botanical-garden',
    name: 'Botanical Garden Invitation',
    description: "Sage / terracotta / garden — invitation jardin botanique. Vert sauge et terracotta, illustrations de feuillage, parfaite pour les mariages en plein air et bohèmes-chic.",
    category: 'BOTANICAL', style: 'BOTANICAL_GARDEN', layout: 'SPLIT_SCREEN',
    identity: 'botanical-romance', tier: 'PREMIUM',
    themeSlug: 'botanical-romance',
    tokens: {
      '--inv-primary': '#7A8B6F',
      '--inv-accent': '#C67B5C',
      '--inv-bg': '#F5F2E8',
      '--inv-surface': '#EAE4D5',
      '--inv-surface-deep': '#DDD5C2',
      '--inv-text': '#3A3A2E',
      '--inv-overlay': 'rgba(245,242,232,0.7)',
      '--inv-hero-opacity': '0.8',
      '--inv-section-padding': '5rem 1.5rem',
      '--inv-font-display': '"Cormorant Garamond", serif',
      '--inv-font-body': '"Lato", sans-serif',
      '--inv-radius': '0.125rem',
      '--inv-shadow': '0 12px 28px -8px rgba(122,139,111,0.3)',
      '--inv-anim-duration': '900ms',
      '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
];

// ─── Animation overrides for the 5 new templates ──────────────────────────────

const NEW_ANIMATION_OVERRIDES = {
  'pearl-romance': { reveal: 'slide-up', duration: 1000, easing: 'cubic-bezier(0.16,1,0.3,1)', stagger: 100, heroAnimation: 'fade', heroDuration: 1000 },
  'emerald-palace': { reveal: 'fade-in', duration: 1500, easing: 'cubic-bezier(0.16,1,0.3,1)', stagger: 120, heroAnimation: 'zoom', heroDuration: 1500 },
  'old-money': { reveal: 'scroll', duration: 600, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)', stagger: 80, heroAnimation: 'none', heroDuration: 0 },
  'art-deco': { reveal: 'fade-in', duration: 900, easing: 'cubic-bezier(0.16,1,0.3,1)', stagger: 100, heroAnimation: 'fade', heroDuration: 900 },
  'botanical-garden': { reveal: 'slide-up', duration: 900, easing: 'cubic-bezier(0.16,1,0.3,1)', stagger: 100, heroAnimation: 'fade', heroDuration: 900 },
};

// ─── Responsive overrides for the 5 new templates ─────────────────────────────

const NEW_RESPONSIVE_OVERRIDES = {
  'pearl-romance': {
    mobile: { hideSections: ['gallery'], sectionPadding: 56, heroHeight: 75, fontScale: 0.9, imageQuality: 0.8 },
    tablet: { hideSections: [], sectionPadding: 72, heroHeight: 85, fontScale: 1.0, imageQuality: 0.9 },
    desktop: { hideSections: [], sectionPadding: 96, heroHeight: 100, fontScale: 1.05, imageQuality: 1.0 },
  },
  'emerald-palace': {
    mobile: { hideSections: ['gallery'], sectionPadding: 56, heroHeight: 85, fontScale: 0.88, imageQuality: 0.78 },
    tablet: { hideSections: [], sectionPadding: 72, heroHeight: 90, fontScale: 1.0, imageQuality: 0.9 },
    desktop: { hideSections: [], sectionPadding: 96, heroHeight: 100, fontScale: 1.05, imageQuality: 1.0 },
  },
  'old-money': {
    mobile: { hideSections: [], sectionPadding: 64, heroHeight: 70, fontScale: 0.95, imageQuality: 0.85 },
    tablet: { hideSections: [], sectionPadding: 80, heroHeight: 80, fontScale: 1.0, imageQuality: 0.9 },
    desktop: { hideSections: [], sectionPadding: 96, heroHeight: 90, fontScale: 1.1, imageQuality: 1.0 },
  },
  'art-deco': {
    mobile: { hideSections: ['gallery'], sectionPadding: 56, heroHeight: 80, fontScale: 0.9, imageQuality: 0.82 },
    tablet: { hideSections: [], sectionPadding: 72, heroHeight: 85, fontScale: 1.0, imageQuality: 0.9 },
    desktop: { hideSections: [], sectionPadding: 88, heroHeight: 95, fontScale: 1.05, imageQuality: 1.0 },
  },
  'botanical-garden': {
    mobile: { hideSections: ['gallery'], sectionPadding: 56, heroHeight: 75, fontScale: 0.9, imageQuality: 0.82 },
    tablet: { hideSections: [], sectionPadding: 72, heroHeight: 85, fontScale: 1.0, imageQuality: 0.9 },
    desktop: { hideSections: [], sectionPadding: 96, heroHeight: 100, fontScale: 1.05, imageQuality: 1.0 },
  },
};

// ─── Main seed routine ────────────────────────────────────────────────────────

async function seedNewTemplates() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' Mission 5.9.4 P2-1 — Seed 5 NEW premium InvitationTemplate rows');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log();

  // Step 1: Fetch an existing template (royal-gold) to clone its default config structure
  console.log('[1/3] Fetching reference template (royal-gold) for config structure...');
  const refTemplate = await prisma.invitationTemplate.findUnique({
    where: { slug: 'royal-gold' },
    select: { configJson: true },
  });
  if (!refTemplate) {
    console.error('❌ royal-gold template not found — run seed-invitation-templates.cjs first');
    process.exit(1);
  }
  const refConfig = JSON.parse(refTemplate.configJson);
  console.log(`      ✓ Reference config: ${refConfig.sections.length} sections, ${refConfig.mediaSlots.length} slots, ${Object.keys(refConfig.weddingBindings).length} wedding bindings`);

  // Step 2: Resolve themeId for each new template
  console.log('[2/3] Resolving themeId references...');
  const themeMap = new Map();
  const themes = await prisma.platformTheme.findMany({
    where: { slug: { in: NEW_TEMPLATES.map((t) => t.themeSlug) } },
    select: { id: true, slug: true },
  });
  for (const t of themes) themeMap.set(t.slug, t.id);
  console.log(`      Found ${themes.length} / ${NEW_TEMPLATES.length} referenced PlatformThemes`);

  // Step 3: Upsert each new template
  console.log('[3/3] Upserting 5 NEW InvitationTemplate rows...');
  let created = 0;
  let updated = 0;

  for (const t of NEW_TEMPLATES) {
    const themeId = themeMap.get(t.themeSlug) ?? null;
    if (!themeId) {
      console.warn(`      ⚠️  Theme "${t.themeSlug}" not found for template "${t.slug}" — setting themeId=null`);
    }

    // Build config: clone reference structure + override tokens + animation + responsive
    const config = {
      ...refConfig,
      sections: refConfig.sections,           // same 12 sections
      mediaSlots: refConfig.mediaSlots,         // same 8 slots
      weddingBindings: refConfig.weddingBindings, // same 12 bindings
      guestBindings: refConfig.guestBindings,    // same 6 guest bindings
      components: refConfig.components,          // same component map
      tokens: t.tokens,                          // DISTINCT tokens per template
      responsiveRules: NEW_RESPONSIVE_OVERRIDES[t.slug] ?? refConfig.responsiveRules,
      animationRules: NEW_ANIMATION_OVERRIDES[t.slug] ?? refConfig.animationRules,
      qualityRules: refConfig.qualityRules,      // same quality rules
      supportedFormats: refConfig.supportedFormats,
      supportedLanguages: refConfig.supportedLanguages,
      copy: refConfig.copy,                      // same copy (FR/EN)
    };
    const configJson = JSON.stringify(config);
    const assetsJson = JSON.stringify({
      background: { url: null, alt: null },
      pattern: { url: null, repeat: 'no-repeat' },
    });
    const previewJson = JSON.stringify({
      thumbnailWidth: 400,
      thumbnailHeight: 560,
      previewWidth: 1440,
      previewHeight: 900,
      alt: t.name,
    });

    const existing = await prisma.invitationTemplate.findUnique({ where: { slug: t.slug } });
    const data = {
      name: t.name,
      description: t.description,
      category: t.category,
      style: t.style,
      layout: t.layout,
      identity: t.identity,
      tier: t.tier,
      status: 'PUBLISHED',
      isLocked: false,
      approvalStatus: 'PUBLISHED',
      isBuiltIn: true,
      isPremium: t.tier !== 'FREE' && t.tier !== 'STANDARD',
      isRecommended: false,
      isDefault: false,
      version: existing ? existing.version + 1 : 1,
      configJson,
      assetsJson,
      previewJson,
      thumbnailUrl: null,
      previewUrl: null,
      themeId,
    };

    if (existing) {
      await prisma.invitationTemplate.update({ where: { slug: t.slug }, data });
      updated++;
      console.log(`   ✓ Updated: ${t.slug} (v${data.version}) — ${t.category}/${t.style} — ${t.tier}`);
    } else {
      await prisma.invitationTemplate.create({ data: { ...data, slug: t.slug } });
      created++;
      console.log(`   ✓ Created: ${t.slug} (v1) — ${t.category}/${t.style} — ${t.tier}`);
    }
  }

  console.log();
  console.log(`═══════════════════════════════════════════════════════════════════`);
  console.log(` ✓ Seed complete: ${created} created, ${updated} updated`);
  console.log(`═══════════════════════════════════════════════════════════════════`);

  // Verify total count
  const total = await prisma.invitationTemplate.count();
  console.log(`Total InvitationTemplate rows in DB: ${total}`);

  await prisma.$disconnect();
}

seedNewTemplates().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
