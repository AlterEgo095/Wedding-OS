// ══════════════════════════════════════════════════════════════════════════════
// scripts/seed-invitation-templates.cjs
// MISSION 5.9.2 P3 — Seed 10 canonical InvitationTemplate rows.
// ══════════════════════════════════════════════════════════════════════════════
//
// Seeds the 10 premium invitation templates declared in
// `src/lib/invitations/types.ts → CANONICAL_INVITATION_TEMPLATES` into the
// `InvitationTemplate` Prisma model (cross-tenant — these are platform-level
// artifacts managed by the Super Admin).
//
// Each template gets a full InvitationTemplateConfig (sections, mediaSlots,
// tokens, dataBindings, guestBindings, responsiveRules, animationRules,
// qualityRules, supportedFormats, supportedLanguages, copy). The config
// is stored as JSON in `InvitationTemplate.configJson`.
//
// The script also resolves `themeId` by looking up the PlatformTheme by slug
// (the canonical list references PlatformTheme slugs like 'royal-gold',
// 'botanical-romance', 'sunset', etc. — these were seeded by Phase 1).
//
// IDEMPOTENT: re-running updates existing rows in place (upsert by slug).
// Safe to run multiple times.
//
// USAGE (inside the wedding-app container):
//   node /app/scripts/seed-invitation-templates.cjs
//
// Or from the host:
//   docker exec wedding-app node /app/scripts/seed-invitation-templates.cjs
// ══════════════════════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Canonical 10 templates (mirrors types.ts CANONICAL_INVITATION_TEMPLATES) ─

const CANONICAL_TEMPLATES = [
  {
    slug: 'royal-gold',
    name: 'Royal Gold Invitation',
    description: "Luxury / ceremonial / gold / editorial — invitation officielle dorée. L'expérience par défaut, gratuite, raffinée et chaleureuse.",
    category: 'LUXURY', style: 'ROYAL_GOLD', layout: 'FULL_BLEED_IMAGE',
    identity: 'royal-luxury', tier: 'FREE',
    themeSlug: 'royal-gold', isDefault: true, isRecommended: true,
    tokens: {
      '--inv-primary': '#D4AF37', '--inv-accent': '#E8C977',
      '--inv-bg': '#0a0a0a', '--inv-surface': '#1a1a2e', '--inv-surface-deep': '#050505',
      '--inv-text': '#FAF8F5', '--inv-overlay': 'rgba(10,10,10,0.55)',
      '--inv-hero-opacity': '0.7', '--inv-section-padding': '5rem 1.5rem',
      '--inv-font-display': '"Cormorant Garamond", serif',
      '--inv-font-body': '"Inter", sans-serif',
      '--inv-radius': '0', '--inv-shadow': '0 25px 50px -12px rgba(0,0,0,0.8)',
      '--inv-anim-duration': '900ms', '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'royal-black',
    name: 'Royal Black Invitation',
    description: "Black tie / cinematic / premium — invitation sobre et élégante. Théâtrale, dramatique, parfaite pour les mariages en soirée.",
    category: 'LUXURY', style: 'ROYAL_BLACK', layout: 'CINEMATIC_HERO',
    identity: 'royal-luxury', tier: 'PREMIUM',
    themeSlug: 'royal-black', isRecommended: true,
    tokens: {
      '--inv-primary': '#C9A961', '--inv-accent': '#D4B876',
      '--inv-bg': '#000000', '--inv-surface': '#0a0a0a', '--inv-surface-deep': '#000000',
      '--inv-text': '#E8E0D0', '--inv-overlay': 'rgba(0,0,0,0.7)',
      '--inv-hero-opacity': '0.45', '--inv-section-padding': '6rem 1.5rem',
      '--inv-font-display': '"Playfair Display", serif',
      '--inv-font-body': '"Montserrat", sans-serif',
      '--inv-radius': '0', '--inv-shadow': '0 25px 50px -12px rgba(0,0,0,0.95)',
      '--inv-anim-duration': '1200ms', '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'white-romance',
    name: 'White Romance Invitation',
    description: "White / ivory / romantic / elegant — invitation romantique épurée. Crème et bronze, pour les cérémonies intimistes et lumineuses.",
    category: 'BOTANICAL', style: 'WHITE_ROMANCE', layout: 'CENTERED_CEREMONY',
    identity: 'botanical-romance', tier: 'PREMIUM',
    themeSlug: 'white-romance',
    tokens: {
      '--inv-primary': '#8B6F47', '--inv-accent': '#A8895C',
      '--inv-bg': '#FAF6F0', '--inv-surface': '#FFFFFF', '--inv-surface-deep': '#F0E8DC',
      '--inv-text': '#3D2B1F', '--inv-overlay': 'rgba(250,246,240,0.45)',
      '--inv-hero-opacity': '0.85', '--inv-section-padding': '5rem 2rem',
      '--inv-font-display': '"Cormorant Garamond", serif',
      '--inv-font-body': '"Lato", sans-serif',
      '--inv-radius': '2px', '--inv-shadow': '0 10px 40px -12px rgba(61,43,31,0.15)',
      '--inv-anim-duration': '800ms', '--inv-anim-easing': 'cubic-bezier(0.4,0,0.2,1)',
    },
  },
  {
    slug: 'champagne-editorial',
    name: 'Champagne Editorial Invitation',
    description: "Champagne / editorial / sophisticated — invitation magazine chic. Mise en page éditoriale, parfaite pour les mariages modernes et urbains.",
    category: 'EDITORIAL', style: 'CHAMPAGNE_EDITORIAL', layout: 'EDITORIAL_GRID',
    identity: 'minimal-editorial', tier: 'STANDARD',
    themeSlug: 'modern-champagne',
    tokens: {
      '--inv-primary': '#B89968', '--inv-accent': '#D4C4A8',
      '--inv-bg': '#F5F1EA', '--inv-surface': '#FFFFFF', '--inv-surface-deep': '#EBE5DA',
      '--inv-text': '#2D2418', '--inv-overlay': 'rgba(245,241,234,0.35)',
      '--inv-hero-opacity': '0.85', '--inv-section-padding': '4rem 2rem',
      '--inv-font-display': '"Playfair Display", serif',
      '--inv-font-body': '"Inter", sans-serif',
      '--inv-radius': '0', '--inv-shadow': '0 8px 30px -10px rgba(45,36,24,0.12)',
      '--inv-anim-duration': '600ms', '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'black-ivory',
    name: 'Black & Ivory Invitation',
    description: "Minimal luxury / fashion — invitation minimaliste contrastée. Noir profond et ivoire, pour les mariages au ton fashion et architectural.",
    category: 'EDITORIAL', style: 'BLACK_IVORY', layout: 'TYPOGRAPHIC_HERO',
    identity: 'minimal-editorial', tier: 'PREMIUM',
    themeSlug: 'minimal-modern',
    tokens: {
      '--inv-primary': '#1A1A1A', '--inv-accent': '#F5F0E8',
      '--inv-bg': '#0A0A0A', '--inv-surface': '#141414', '--inv-surface-deep': '#050505',
      '--inv-text': '#F5F0E8', '--inv-overlay': 'rgba(0,0,0,0.5)',
      '--inv-hero-opacity': '0.55', '--inv-section-padding': '6rem 2rem',
      '--inv-font-display': '"Playfair Display", serif',
      '--inv-font-body': '"Inter", sans-serif',
      '--inv-radius': '0', '--inv-shadow': '0 20px 60px -12px rgba(0,0,0,0.95)',
      '--inv-anim-duration': '700ms', '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'botanical-love',
    name: 'Botanical Love Invitation',
    description: "Garden / organic / floral — invitation botanique et chaleureuse. Vert jardin et crème florale, pour les mariages champêtres et romantiques.",
    category: 'BOTANICAL', style: 'BOTANICAL_LOVE', layout: 'SPLIT_SCREEN',
    identity: 'botanical-romance', tier: 'PREMIUM',
    themeSlug: 'botanical-romance',
    tokens: {
      '--inv-primary': '#558B2F', '--inv-accent': '#7AB040',
      '--inv-bg': '#F1F8E9', '--inv-surface': '#FFFFFF', '--inv-surface-deep': '#E0F0D0',
      '--inv-text': '#1B3A0A', '--inv-overlay': 'rgba(241,248,233,0.4)',
      '--inv-hero-opacity': '0.85', '--inv-section-padding': '4.5rem 1.5rem',
      '--inv-font-display': '"Cormorant Garamond", serif',
      '--inv-font-body': '"Lato", sans-serif',
      '--inv-radius': '4px', '--inv-shadow': '0 12px 40px -12px rgba(27,58,10,0.18)',
      '--inv-anim-duration': '700ms', '--inv-anim-easing': 'cubic-bezier(0.4,0,0.2,1)',
    },
  },
  {
    slug: 'modern-monogram',
    name: 'Modern Monogram Invitation',
    description: "Contemporary / architectural — invitation typographique moderne. Mise en page asymétrique, parfaite pour les mariages contemporains.",
    category: 'EDITORIAL', style: 'MODERN_MONOGRAM', layout: 'ASYMMETRIC',
    identity: 'minimal-editorial', tier: 'STANDARD',
    themeSlug: 'modern-champagne',
    tokens: {
      '--inv-primary': '#2C2C2C', '--inv-accent': '#C9A961',
      '--inv-bg': '#FFFFFF', '--inv-surface': '#F8F6F2', '--inv-surface-deep': '#EDEAE3',
      '--inv-text': '#1A1A1A', '--inv-overlay': 'rgba(255,255,255,0.3)',
      '--inv-hero-opacity': '0.95', '--inv-section-padding': '5rem 2rem',
      '--inv-font-display': '"Montserrat", sans-serif',
      '--inv-font-body': '"Inter", sans-serif',
      '--inv-radius': '0', '--inv-shadow': '0 8px 24px -8px rgba(0,0,0,0.1)',
      '--inv-anim-duration': '500ms', '--inv-anim-easing': 'cubic-bezier(0.4,0,0.2,1)',
    },
  },
  {
    slug: 'african-luxury',
    name: 'African Luxury Invitation',
    description: "Premium African-inspired visual language — invitation wax premium. Orange et vert profond, héritage et chaleur africaine.",
    category: 'LUXURY', style: 'AFRICAN_LUXURY', layout: 'PHOTO_COLLAGE',
    identity: 'royal-luxury', tier: 'PREMIUM',
    themeSlug: 'kente',
    tokens: {
      '--inv-primary': '#E8A53D', '--inv-accent': '#1B5E20',
      '--inv-bg': '#1a1505', '--inv-surface': '#252010', '--inv-surface-deep': '#0d0a02',
      '--inv-text': '#FFF3E0', '--inv-overlay': 'rgba(26,21,5,0.5)',
      '--inv-hero-opacity': '0.65', '--inv-section-padding': '5rem 1.5rem',
      '--inv-font-display': '"Playfair Display", serif',
      '--inv-font-body': '"Montserrat", sans-serif',
      '--inv-radius': '4px', '--inv-shadow': '0 20px 50px -12px rgba(26,21,5,0.85)',
      '--inv-anim-duration': '900ms', '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'sunset-romance',
    name: 'Sunset Romance Invitation',
    description: "Warm / cinematic / destination — invitation destination ensoleillée. Orange et jaune doré, ambiance golden hour, parfaite pour les mariages plage.",
    category: 'CINEMATIC', style: 'SUNSET_ROMANCE', layout: 'CINEMATIC_HERO',
    identity: 'cinematic-dark', tier: 'PREMIUM',
    themeSlug: 'sunset',
    tokens: {
      '--inv-primary': '#FF6B6B', '--inv-accent': '#FFD93D',
      '--inv-bg': '#FFF4E6', '--inv-surface': '#FFFFFF', '--inv-surface-deep': '#FFE8CC',
      '--inv-text': '#4A1A0A', '--inv-overlay': 'rgba(255,107,107,0.25)',
      '--inv-hero-opacity': '0.6', '--inv-section-padding': '5rem 1.5rem',
      '--inv-font-display': '"Playfair Display", serif',
      '--inv-font-body': '"Montserrat", sans-serif',
      '--inv-radius': '8px', '--inv-shadow': '0 15px 45px -12px rgba(255,107,107,0.3)',
      '--inv-anim-duration': '1000ms', '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
  {
    slug: 'sapphire-night',
    name: 'Sapphire Night Invitation',
    description: "Dark blue / luxury evening — invitation élégante soirée. Saphir profond, or champagne et noir velouté, pour les mariages prestigieux en soirée.",
    category: 'LUXURY', style: 'SAPPHIRE_NIGHT', layout: 'FULL_BLEED_IMAGE',
    identity: 'royal-luxury', tier: 'EXCLUSIVE',
    themeSlug: 'sapphire-noir',
    tokens: {
      '--inv-primary': '#C9A961', '--inv-accent': '#DBC285',
      '--inv-bg': '#050A14', '--inv-surface': '#0D1B2A', '--inv-surface-deep': '#020509',
      '--inv-text': '#E8E4DC', '--inv-overlay': 'rgba(5,10,20,0.6)',
      '--inv-hero-opacity': '0.5', '--inv-section-padding': '6rem 1.5rem',
      '--inv-font-display': '"Playfair Display", serif',
      '--inv-font-body': '"Inter", sans-serif',
      '--inv-radius': '0', '--inv-shadow': '0 25px 60px -12px rgba(5,10,20,0.95)',
      '--inv-anim-duration': '1100ms', '--inv-anim-easing': 'cubic-bezier(0.16,1,0.3,1)',
    },
  },
];

// ─── Section library (12 sections × default enabled state) ───────────────────

const SECTIONS_DEFAULT = [
  { id: 'cover', type: 'cover', enabled: true, order: 1, title: 'Couverture', subtitle: null, mediaSlots: ['couple-hero'] },
  { id: 'wedding-date', type: 'wedding-date', enabled: true, order: 2, title: 'Date du mariage', subtitle: null, mediaSlots: [] },
  { id: 'countdown', type: 'countdown', enabled: true, order: 3, title: 'Compte à rebours', subtitle: null, mediaSlots: [] },
  { id: 'couple-introduction', type: 'couple-introduction', enabled: true, order: 4, title: 'Les futurs mariés', subtitle: null, mediaSlots: ['couple-portrait'] },
  { id: 'story', type: 'story', enabled: true, order: 5, title: 'Notre histoire', subtitle: null, mediaSlots: ['couple-story'] },
  { id: 'gallery', type: 'gallery', enabled: true, order: 6, title: 'Galerie', subtitle: null, mediaSlots: ['gallery-01', 'gallery-02', 'gallery-03'] },
  { id: 'ceremony', type: 'ceremony', enabled: true, order: 7, title: 'Cérémonie', subtitle: null, mediaSlots: [] },
  { id: 'reception', type: 'reception', enabled: true, order: 8, title: 'Réception', subtitle: null, mediaSlots: [] },
  { id: 'venue', type: 'venue', enabled: true, order: 9, title: 'Lieu', subtitle: null, mediaSlots: ['venue-image'] },
  { id: 'rsvp', type: 'rsvp', enabled: true, order: 10, title: 'RSVP', subtitle: 'Confirmez votre présence', mediaSlots: [] },
  { id: 'qr-access', type: 'qr-access', enabled: true, order: 11, title: 'Votre accès', subtitle: null, mediaSlots: [] },
  { id: 'footer', type: 'footer', enabled: true, order: 12, title: null, subtitle: null, mediaSlots: ['monogram'] },
];

// ─── Media slots (8 semantic roles — canonical for all templates) ─────────────

const MEDIA_SLOTS_DEFAULT = [
  { slotId: 'couple-hero', semanticRole: 'COUPLE_HERO', required: true, acceptedTypes: ['image/jpeg','image/png','image/webp'], aspectRatio: '16:9', cropMode: 'cover', focalPoint: { x: 0.5, y: 0.4 }, fallback: null, responsiveBehavior: 'always', label: 'Photo de couple (hero)', description: "Photo principale du couple en grand format (16:9 ou 4:5)." },
  { slotId: 'couple-portrait', semanticRole: 'COUPLE_PORTRAIT', required: true, acceptedTypes: ['image/jpeg','image/png','image/webp'], aspectRatio: '4:5', cropMode: 'cover', focalPoint: { x: 0.5, y: 0.4 }, fallback: null, responsiveBehavior: 'always', label: 'Portrait du couple', description: "Portrait du couple pour la section 'Les futurs mariés'." },
  { slotId: 'couple-story', semanticRole: 'COUPLE_STORY', required: false, acceptedTypes: ['image/jpeg','image/png','image/webp'], aspectRatio: '4:5', cropMode: 'cover', focalPoint: { x: 0.5, y: 0.5 }, fallback: null, responsiveBehavior: 'always', label: "Photo d'histoire", description: "Photo illustrant votre histoire (timeline)." },
  { slotId: 'gallery-01', semanticRole: 'GALLERY_01', required: false, acceptedTypes: ['image/jpeg','image/png','image/webp'], aspectRatio: '1:1', cropMode: 'cover', focalPoint: { x: 0.5, y: 0.5 }, fallback: null, responsiveBehavior: 'always', label: 'Galerie photo 1', description: 'Première photo de la galerie (carré).' },
  { slotId: 'gallery-02', semanticRole: 'GALLERY_02', required: false, acceptedTypes: ['image/jpeg','image/png','image/webp'], aspectRatio: '1:1', cropMode: 'cover', focalPoint: { x: 0.5, y: 0.5 }, fallback: null, responsiveBehavior: 'always', label: 'Galerie photo 2', description: 'Deuxième photo de la galerie (carré).' },
  { slotId: 'gallery-03', semanticRole: 'GALLERY_03', required: false, acceptedTypes: ['image/jpeg','image/png','image/webp'], aspectRatio: '1:1', cropMode: 'cover', focalPoint: { x: 0.5, y: 0.5 }, fallback: null, responsiveBehavior: 'always', label: 'Galerie photo 3', description: 'Troisième photo de la galerie (carré).' },
  { slotId: 'venue-image', semanticRole: 'VENUE_IMAGE', required: false, acceptedTypes: ['image/jpeg','image/png','image/webp'], aspectRatio: '16:9', cropMode: 'cover', focalPoint: { x: 0.5, y: 0.5 }, fallback: null, responsiveBehavior: 'always', label: 'Photo du lieu', description: 'Photo du lieu de réception (16:9).' },
  { slotId: 'monogram', semanticRole: 'MONOGRAM', required: false, acceptedTypes: ['image/png','image/svg+xml'], aspectRatio: '1:1', cropMode: 'contain', fallback: null, responsiveBehavior: 'always', label: 'Monogramme / Logo', description: 'Monogramme du couple ou logo (PNG transparent ou SVG, carré).' },
];

// ─── Wedding-level data bindings (placeholders → expressions) ─────────────────

const WEDDING_BINDINGS_DEFAULT = {
  coupleNames: { placeholder: 'coupleNames', expression: 'wedding.coupleLabel', fallback: 'Nos futurs mariés' },
  brideName: { placeholder: 'brideName', expression: 'wedding.brideName', fallback: '' },
  groomName: { placeholder: 'groomName', expression: 'wedding.groomName', fallback: '' },
  date: { placeholder: 'date', expression: 'wedding.weddingDate', fallback: 'Date à confirmer', format: 'date-long' },
  dateShort: { placeholder: 'dateShort', expression: 'wedding.weddingDate', fallback: '', format: 'date' },
  venue: { placeholder: 'venue', expression: 'wedding.venueName', fallback: 'Lieu à confirmer' },
  address: { placeholder: 'address', expression: 'wedding.venueAddress', fallback: '' },
  city: { placeholder: 'city', expression: 'wedding.venueCity', fallback: '' },
  rsvpUrl: { placeholder: 'rsvpUrl', expression: 'wedding.rsvpUrl', fallback: '#rsvp' },
  galleryUrl: { placeholder: 'galleryUrl', expression: 'wedding.galleryUrl', fallback: '#gallery' },
  storyUrl: { placeholder: 'storyUrl', expression: 'wedding.storyUrl', fallback: '#story' },
  mapUrl: { placeholder: 'mapUrl', expression: 'wedding.mapUrl', fallback: '' },
};

// ─── Guest-level data bindings (placeholders → expressions) ───────────────────

const GUEST_BINDINGS_DEFAULT = {
  guestName: { placeholder: 'guestName', expression: 'guest.name', fallback: 'Cher invité' },
  guestFirstName: { placeholder: 'guestFirstName', expression: 'guest.firstName', fallback: 'Invité' },
  guestTable: { placeholder: 'guestTable', expression: 'guest.tableLabel', fallback: '' },
  guestAccessCode: { placeholder: 'guestAccessCode', expression: 'guest.accessCode', fallback: '' },
  guestQrCodeUrl: { placeholder: 'guestQrCodeUrl', expression: 'guest.qrCodeUrl', fallback: '' },
  guestRsvpUrl: { placeholder: 'guestRsvpUrl', expression: 'guest.rsvpUrl', fallback: '#rsvp' },
};

// ─── Responsive rules (mobile / tablet / desktop) ────────────────────────────

const RESPONSIVE_RULES_DEFAULT = {
  mobile: { hideSections: ['gallery'], sectionPadding: 56, heroHeight: 70, fontScale: 0.9, imageQuality: 0.8 },
  tablet: { hideSections: [], sectionPadding: 72, heroHeight: 80, fontScale: 1.0, imageQuality: 0.9 },
  desktop: { hideSections: [], sectionPadding: 96, heroHeight: 100, fontScale: 1.05, imageQuality: 1.0 },
};

// ─── Animation rules (default — overridden per template) ──────────────────────

const ANIMATION_RULES_DEFAULT = {
  reveal: 'scroll', duration: 800, easing: 'cubic-bezier(0.16,1,0.3,1)', stagger: 100,
  heroAnimation: 'fade', heroDuration: 1200,
};

// ─── Quality rules (enforced by lib/quality/invitation-scorecard.ts — Phase 7) ─

const QUALITY_RULES_DEFAULT = {
  minImagesPerSlot: 1,
  requiredBindings: ['coupleNames', 'date', 'venue'],
  minQrReadability: 75,
  minAccessibility: 70,
  minContrastRatio: 4.5,
  blockOnCritical: true,
};

// ─── Supported formats + languages ────────────────────────────────────────────

const SUPPORTED_FORMATS_DEFAULT = ['DESKTOP', 'TABLET', 'MOBILE', 'PRINT_A5', 'PRINT_A6', 'EMAIL', 'WHATSAPP'];
const SUPPORTED_LANGUAGES_DEFAULT = ['fr', 'en'];

// ─── Copy (translatable strings — French + English) ───────────────────────────

const COPY_DEFAULT = {
  fr: {
    'cover.heading': 'Vous êtes invités',
    'cover.subheading': 'au mariage de',
    'cover.cta': 'Découvrir l\'invitation',
    'date.heading': 'Le grand jour',
    'countdown.heading': 'Plus que',
    'countdown.days': 'jours',
    'countdown.hours': 'heures',
    'countdown.minutes': 'minutes',
    'countdown.seconds': 'secondes',
    'couple.heading': 'Les futurs mariés',
    'story.heading': 'Notre histoire',
    'gallery.heading': 'Galerie',
    'ceremony.heading': 'Cérémonie',
    'reception.heading': 'Réception',
    'venue.heading': 'Lieu',
    'rsvp.heading': 'Répondez avant le',
    'rsvp.cta': 'Confirmer ma présence',
    'qr.heading': 'Votre QR d\'accès',
    'qr.help': 'Scannez ce code à l\'arrivée',
    'footer.signature': 'Avec amour',
    'guest.greeting': 'Cher',
    'guest.table': 'Table',
    'guest.accessCode': 'Code d\'accès',
  },
  en: {
    'cover.heading': 'You are cordially invited',
    'cover.subheading': 'to the wedding of',
    'cover.cta': 'Open invitation',
    'date.heading': 'The big day',
    'countdown.heading': 'Only',
    'countdown.days': 'days',
    'countdown.hours': 'hours',
    'countdown.minutes': 'minutes',
    'countdown.seconds': 'seconds',
    'couple.heading': 'The happy couple',
    'story.heading': 'Our story',
    'gallery.heading': 'Gallery',
    'ceremony.heading': 'Ceremony',
    'reception.heading': 'Reception',
    'venue.heading': 'Venue',
    'rsvp.heading': 'RSVP by',
    'rsvp.cta': 'Confirm attendance',
    'qr.heading': 'Your access QR',
    'qr.help': 'Scan this code on arrival',
    'footer.signature': 'With love',
    'guest.greeting': 'Dear',
    'guest.table': 'Table',
    'guest.accessCode': 'Access code',
  },
};

// ─── Per-template animation overrides (some templates want different motion) ──

const ANIMATION_OVERRIDES = {
  'royal-gold': { ...ANIMATION_RULES_DEFAULT, reveal: 'fade-in', heroAnimation: 'zoom', heroDuration: 1500 },
  'royal-black': { ...ANIMATION_RULES_DEFAULT, reveal: 'fade-in', heroAnimation: 'parallax', heroDuration: 1800, duration: 1100, stagger: 150 },
  'white-romance': { ...ANIMATION_RULES_DEFAULT, reveal: 'slide-up', heroAnimation: 'fade', heroDuration: 1000 },
  'champagne-editorial': { ...ANIMATION_RULES_DEFAULT, reveal: 'scroll', heroAnimation: 'fade', heroDuration: 800, duration: 600 },
  'black-ivory': { ...ANIMATION_RULES_DEFAULT, reveal: 'fade-in', heroAnimation: 'fade', heroDuration: 900 },
  'botanical-love': { ...ANIMATION_RULES_DEFAULT, reveal: 'slide-up', heroAnimation: 'fade', heroDuration: 900 },
  'modern-monogram': { ...ANIMATION_RULES_DEFAULT, reveal: 'scroll', heroAnimation: 'none', heroDuration: 0, duration: 500 },
  'african-luxury': { ...ANIMATION_RULES_DEFAULT, reveal: 'fade-in', heroAnimation: 'zoom', heroDuration: 1400 },
  'sunset-romance': { ...ANIMATION_RULES_DEFAULT, reveal: 'fade-in', heroAnimation: 'parallax', heroDuration: 1600, duration: 1000 },
  'sapphire-night': { ...ANIMATION_RULES_DEFAULT, reveal: 'fade-in', heroAnimation: 'zoom', heroDuration: 1700, duration: 1100 },
};

// ─── Per-template responsive overrides (some hide different sections on mobile) ──

const RESPONSIVE_OVERRIDES = {
  'royal-gold': RESPONSIVE_RULES_DEFAULT,
  'royal-black': { ...RESPONSIVE_RULES_DEFAULT, mobile: { ...RESPONSIVE_RULES_DEFAULT.mobile, heroHeight: 90, hideSections: ['gallery'] } },
  'white-romance': RESPONSIVE_RULES_DEFAULT,
  'champagne-editorial': { ...RESPONSIVE_RULES_DEFAULT, mobile: { ...RESPONSIVE_RULES_DEFAULT.mobile, fontScale: 0.92 } },
  'black-ivory': { ...RESPONSIVE_RULES_DEFAULT, desktop: { ...RESPONSIVE_RULES_DEFAULT.desktop, heroHeight: 95 } },
  'botanical-love': RESPONSIVE_RULES_DEFAULT,
  'modern-monogram': { ...RESPONSIVE_RULES_DEFAULT, mobile: { ...RESPONSIVE_RULES_DEFAULT.mobile, sectionPadding: 64 } },
  'african-luxury': { ...RESPONSIVE_RULES_DEFAULT, mobile: { ...RESPONSIVE_RULES_DEFAULT.mobile, imageQuality: 0.75 } },
  'sunset-romance': { ...RESPONSIVE_RULES_DEFAULT, mobile: { ...RESPONSIVE_RULES_DEFAULT.mobile, heroHeight: 85 } },
  'sapphire-night': { ...RESPONSIVE_RULES_DEFAULT, desktop: { ...RESPONSIVE_RULES_DEFAULT.desktop, heroHeight: 95 }, mobile: { ...RESPONSIVE_RULES_DEFAULT.mobile, heroHeight: 80 } },
};

// ─── Build the full InvitationTemplateConfig for a given canonical template ──

function buildConfig(template) {
  return {
    sections: SECTIONS_DEFAULT,
    components: {
      cover: 'LuxuryInvitation',
      'wedding-date': 'LuxuryInvitation',
      countdown: 'LuxuryInvitation',
      'couple-introduction': 'LuxuryInvitation',
      story: 'LuxuryInvitation',
      gallery: 'LuxuryInvitation',
      ceremony: 'LuxuryInvitation',
      reception: 'LuxuryInvitation',
      venue: 'LuxuryInvitation',
      rsvp: 'LuxuryInvitation',
      'qr-access': 'LuxuryInvitation',
      footer: 'LuxuryInvitation',
    },
    tokens: template.tokens,
    mediaSlots: MEDIA_SLOTS_DEFAULT,
    weddingBindings: WEDDING_BINDINGS_DEFAULT,
    guestBindings: GUEST_BINDINGS_DEFAULT,
    responsiveRules: RESPONSIVE_OVERRIDES[template.slug] ?? RESPONSIVE_RULES_DEFAULT,
    animationRules: ANIMATION_OVERRIDES[template.slug] ?? ANIMATION_RULES_DEFAULT,
    qualityRules: QUALITY_RULES_DEFAULT,
    supportedFormats: SUPPORTED_FORMATS_DEFAULT,
    supportedLanguages: SUPPORTED_LANGUAGES_DEFAULT,
    copy: COPY_DEFAULT,
  };
}

// ─── Main seed routine ────────────────────────────────────────────────────────

async function seedInvitationTemplates() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' Mission 5.9.2 Phase 3 — Seed 10 InvitationTemplate rows');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log();

  // Step 1: Resolve themeId for each template (look up PlatformTheme by slug)
  console.log('[1/3] Resolving themeId references...');
  const themeMap = new Map();
  const themes = await prisma.platformTheme.findMany({
    where: { slug: { in: CANONICAL_TEMPLATES.map((t) => t.themeSlug) } },
    select: { id: true, slug: true },
  });
  for (const t of themes) themeMap.set(t.slug, t.id);
  console.log(`      Found ${themes.length} / ${CANONICAL_TEMPLATES.length} referenced PlatformThemes`);

  // Step 2: For each canonical template, build the full config + upsert the row
  console.log('[2/3] Upserting 10 InvitationTemplate rows...');
  let created = 0;
  let updated = 0;
  for (const t of CANONICAL_TEMPLATES) {
    const themeId = themeMap.get(t.themeSlug) ?? null;
    if (!themeId) {
      console.warn(`      ⚠️  Theme "${t.themeSlug}" not found for template "${t.slug}" — setting themeId=null`);
    }
    const config = buildConfig(t);
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
      isRecommended: !!t.isRecommended,
      isDefault: !!t.isDefault,
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
      console.log(`      ↻ Updated: ${t.slug} (v${data.version}) → themeId=${themeId ?? 'null'}`);
    } else {
      await prisma.invitationTemplate.create({ data: { slug: t.slug, ...data } });
      created++;
      console.log(`      ✓ Created: ${t.slug} (v1) → themeId=${themeId ?? 'null'}`);
    }
  }

  // Step 3: Verify (count + list)
  console.log('[3/3] Verifying...');
  const total = await prisma.invitationTemplate.count();
  const byTier = await prisma.invitationTemplate.groupBy({ by: ['tier'], _count: true });
  const byCategory = await prisma.invitationTemplate.groupBy({ by: ['category'], _count: true });
  const defaultCount = await prisma.invitationTemplate.count({ where: { isDefault: true } });
  const recommendedCount = await prisma.invitationTemplate.count({ where: { isRecommended: true } });
  const premiumCount = await prisma.invitationTemplate.count({ where: { isPremium: true } });

  console.log();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' SEED COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Created:     ${created}`);
  console.log(`  Updated:     ${updated}`);
  console.log(`  Total rows:  ${total}`);
  console.log(`  By tier:     ${JSON.stringify(byTier.map((g) => `${g.tier}=${g._count}`).join(', '))}`);
  console.log(`  By category: ${JSON.stringify(byCategory.map((g) => `${g.category}=${g._count}`).join(', '))}`);
  console.log(`  Default:     ${defaultCount}`);
  console.log(`  Recommended: ${recommendedCount}`);
  console.log(`  Premium:     ${premiumCount}`);
  console.log('═══════════════════════════════════════════════════════════════════');

  if (total !== 10) {
    throw new Error(`Expected 10 InvitationTemplate rows, got ${total}`);
  }
  if (defaultCount !== 1) {
    throw new Error(`Expected 1 default InvitationTemplate, got ${defaultCount}`);
  }
}

seedInvitationTemplates()
  .catch((err) => {
    console.error('SEED FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
