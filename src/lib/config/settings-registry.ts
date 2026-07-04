// ══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CONFIGURATION — Settings Registry
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 5 — Typed registry of all per-wedding setting keys.
// The `Settings` model stores key/value pairs scoped by weddingId.
// This module enumerates every known key so typos are caught at compile time
// and new settings are documented in one place.
//
// Pattern: every component that reads a setting should import the key from
// here, not hardcode the string.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * All known per-wedding setting keys.
 * Grouped by domain for readability.
 */
export const SETTING_KEYS = {
  // ── Couple identity ──
  brideName: 'bride_name',
  groomName: 'groom_name',
  coupleLabel: 'couple_label',
  hashtag: 'hashtag',
  siteTitle: 'site_title',
  siteDescription: 'site_description',

  // ── Wedding event ──
  weddingDate: 'wedding_date',
  weddingTime: 'wedding_time',
  timezone: 'timezone',
  venueName: 'venue_name',
  venueAddress: 'venue_address',
  venueCity: 'venue_city',
  venueLat: 'venue_lat',
  venueLng: 'venue_lng',
  venueReference: 'venue_reference',
  venueMapUrl: 'venue_map_url',

  // ── Hero section ──
  heroPhotos: 'hero_photos', // JSON array of URLs
  heroSlogan: 'hero_slogan',
  heroBackground: 'hero_background',
  heroOverlay: 'hero_overlay',

  // ── Footer ──
  footerText: 'footer_text',
  footerCopyright: 'footer_copyright',
  footerShowAenews: 'footer_show_aenews',

  // ── Banner ──
  bannerText: 'banner_text',
  bannerEnabled: 'banner_enabled',

  // ── Music ──
  musicFile: 'music_file',
  musicTitle: 'music_title',
  musicEnabled: 'music_enabled',
  musicVolume: 'music_volume',
  musicAutoplay: 'music_autoplay',

  // ── Visual effects (persisted per-wedding, Phase 0 goal) ──
  effectsEnabled: 'effects_enabled',
  effectsIntensity: 'effects_intensity', // ultra | high | medium | low | minimal
  effectsStarSky: 'effects_star_sky',
  effectsGoldenDust: 'effects_golden_dust',
  effectsSparkles: 'effects_sparkles',
  effectsHalos: 'effects_halos',
  effectsBreathing: 'effects_breathing',

  // ── Invitation ──
  invitationTemplate: 'invitation_template', // future: Invitation Engine
  invitationMessage: 'invitation_message',
  invitationStyle: 'invitation_style',

  // ── Gallery ──
  galleryEnabled: 'gallery_enabled',
  galleryLayout: 'gallery_layout',

  // ── Programme ──
  programEnabled: 'program_enabled',

  // ── Stats display ──
  statsEnabled: 'stats_enabled',
  statsShowCountdown: 'stats_show_countdown',
  statsShowRsvp: 'stats_show_rsvp',

  // ── Marketing ──
  marketingEnabled: 'marketing_enabled',

  // ── PWA ──
  pwaEnabled: 'pwa_enabled',
  pwaIcon: 'pwa_icon',

  // ── SEO ──
  seoTitle: 'seo_title',
  seoDescription: 'seo_description',
  seoOgImage: 'seo_og_image',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Default values for settings when not yet persisted in DB.
 * Used by getSettingWithDefault() and the onboarding wizard seed step.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.footerShowAenews]: 'true',
  [SETTING_KEYS.bannerEnabled]: 'true',
  [SETTING_KEYS.musicEnabled]: 'false',
  [SETTING_KEYS.musicVolume]: '0.25',
  [SETTING_KEYS.musicAutoplay]: 'false',
  [SETTING_KEYS.effectsEnabled]: 'true',
  [SETTING_KEYS.effectsIntensity]: 'high',
  [SETTING_KEYS.effectsStarSky]: 'true',
  [SETTING_KEYS.effectsGoldenDust]: 'true',
  [SETTING_KEYS.effectsSparkles]: 'true',
  [SETTING_KEYS.effectsHalos]: 'true',
  [SETTING_KEYS.effectsBreathing]: 'true',
  [SETTING_KEYS.galleryEnabled]: 'true',
  [SETTING_KEYS.programEnabled]: 'true',
  [SETTING_KEYS.statsEnabled]: 'true',
  [SETTING_KEYS.statsShowCountdown]: 'true',
  [SETTING_KEYS.statsShowRsvp]: 'true',
  [SETTING_KEYS.marketingEnabled]: 'true',
  [SETTING_KEYS.pwaEnabled]: 'true',
  [SETTING_KEYS.timezone]: 'Africa/Kinshasa',
};

/**
 * Settings that should be seeded for a new wedding.
 * Used by the onboarding create-wedding transaction.
 */
export const ESSENTIAL_SETTINGS: string[] = [
  SETTING_KEYS.brideName,
  SETTING_KEYS.groomName,
  SETTING_KEYS.coupleLabel,
  SETTING_KEYS.hashtag,
  SETTING_KEYS.siteTitle,
  SETTING_KEYS.weddingDate,
  SETTING_KEYS.timezone,
  SETTING_KEYS.venueName,
  SETTING_KEYS.venueCity,
  SETTING_KEYS.footerShowAenews,
  SETTING_KEYS.bannerEnabled,
];
