/**
 * Mission 5.9.2 — Phase 2.4: Canonical TypeScript interfaces for the
 * InvitationExperience layer.
 *
 * These types define the in-memory shape of an InvitationExperienceConfig —
 * the runtime object produced by `composeInvitationExperience()` (in
 * `src/lib/invitations/index.ts`) and consumed by the IdentityInvitation
 * dispatcher (`src/components/wedding/IdentityInvitation.tsx`) and the
 * 5 premium invitation components (LuxuryInvitation, EditorialInvitation,
 * BotanicalInvitation, CinematicInvitation, ChampagneInvitation).
 *
 * The DB representation is the InvitationTemplate + InvitationTemplateSnapshot
 * Prisma models (see `prisma/schema.prisma`). The `configJson` field on those
 * models stores a serialised `InvitationTemplateConfig`. The composer merges
 * the template config with the live wedding + guest + venue + events data
 * to produce the final `InvitationExperienceConfig` that the renderer reads.
 *
 * Naming convention: PascalCase for types, camelCase for fields.
 * Source of truth: this file. Any code that touches invitation composition
 * must import from here — no inline ad-hoc types.
 */

// ══════════════════════════════════════════════════════════════════════════════
// 1. ENUMS (string union types — kept as unions so they serialise to JSON)
// ══════════════════════════════════════════════════════════════════════════════

/** Visual category of the invitation (drives dispatcher routing). */
export type InvitationCategory =
  | 'LUXURY'        // royal-gold, royal-black, african-luxury, sapphire-night
  | 'EDITORIAL'     // champagne-editorial, modern-monogram, black-ivory
  | 'BOTANICAL'     // white-romance, botanical-love
  | 'CINEMATIC'     // sunset-romance
  | 'CHAMPAGNE';    // (alias for editorial variants — kept for forward compat)

/** Visual style identifier (one per template slug). */
export type InvitationStyle =
  | 'ROYAL_GOLD'
  | 'ROYAL_BLACK'
  | 'WHITE_ROMANCE'
  | 'CHAMPAGNE_EDITORIAL'
  | 'BLACK_IVORY'
  | 'BOTANICAL_LOVE'
  | 'MODERN_MONOGRAM'
  | 'AFRICAN_LUXURY'
  | 'SUNSET_ROMANCE'
  | 'SAPPHIRE_NIGHT'
  // Mission 5.9.4 P2-1 — 5 new premium styles
  | 'PEARL_ROMANCE'
  | 'EMERALD_PALACE'
  | 'OLD_MONEY'
  | 'ART_DECO'
  | 'BOTANICAL_GARDEN';

/** Layout grid (how the invitation composes its sections). */
export type InvitationLayout =
  | 'FULL_BLEED_IMAGE'      // hero image fills the viewport
  | 'EDITORIAL_GRID'        // 2-col magazine-style grid
  | 'SPLIT_SCREEN'          // 50/50 split (image | text)
  | 'CINEMATIC_HERO'        // large hero + cinematic overlay
  | 'TYPOGRAPHIC_HERO'      // type-driven (no hero image)
  | 'ASYMMETRIC'            // off-center editorial
  | 'CENTERED_CEREMONY'     // centered ceremony card
  | 'PHOTO_COLLAGE';        // multi-image grid

/** Identity preset slug (matches src/lib/themes/identity-presets.ts). */
export type InvitationIdentity =
  | 'royal-luxury'
  | 'minimal-editorial'
  | 'botanical-romance'
  | 'cinematic-dark'
  | 'modern-champagne';

/** Commercial tier (mirrors PlatformTheme.tier). */
export type InvitationTier = 'FREE' | 'STANDARD' | 'PREMIUM' | 'EXCLUSIVE';

/** Template lifecycle status (mirrors PlatformTheme.status). */
export type InvitationTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Approval workflow status (mirrors PlatformTheme.approvalStatus). */
export type InvitationApprovalStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'LOCKED'
  | 'ARCHIVED';

/** Supported output formats (drives preview + export options). */
export type InvitationFormat =
  | 'DESKTOP'    // 1440px+ viewport
  | 'TABLET'     // 768-1024px
  | 'MOBILE'     // 375-414px
  | 'PRINT_A5'   // 148×210mm invitation card
  | 'PRINT_A6'   // 105×148mm pocket invitation
  | 'EMAIL'      // HTML email wrapper
  | 'WHATSAPP';  // share card (1200×630 OG image)

/** Supported languages (BCP 47 codes). */
export type InvitationLanguage = 'fr' | 'en';

/** Semantic role of a Media slot (drives auto-binding from Wedding.mediaSlotsJson). */
export type MediaSlotSemanticRole =
  | 'COUPLE_HERO'        // primary hero photo (16:9 or 4:5)
  | 'COUPLE_PORTRAIT'    // secondary portrait (1:1 or 4:5)
  | 'COUPLE_STORY'       // story gallery primary (4:5)
  | 'GALLERY_01'         // gallery image 1 (1:1)
  | 'GALLERY_02'         // gallery image 2 (1:1)
  | 'GALLERY_03'         // gallery image 3 (1:1)
  | 'VENUE_IMAGE'        // venue hero (16:9)
  | 'BACKGROUND_IMAGE'   // full-bleed background (1920×1080)
  | 'MONOGRAM';          // monogram/logo (square, transparent PNG/SVG)

/** Accepted MIME types for a media slot (default = image/*). */
export type MediaSlotAcceptedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/svg+xml'
  | 'video/mp4'
  | 'video/webm';

/** How the image fits its container (mirrors CSS object-fit). */
export type MediaSlotCropMode =
  | 'cover'       // fill + crop overflow (default)
  | 'contain'     // letterbox (no crop)
  | 'fill'        // stretch
  | 'scale-down'; // smaller of contain/none

/** Responsive behaviour of a media slot. */
export type MediaSlotResponsiveBehavior =
  | 'always'      // visible on all breakpoints
  | 'desktop-only'
  | 'tablet-up'
  | 'mobile-only'
  | 'mobile-only-as-bg';  // mobile renders as CSS background (perf)

// ══════════════════════════════════════════════════════════════════════════════
// 2. MEDIA SLOT (declarative — part of InvitationTemplate.configJson.mediaSlots)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A media slot declares WHERE a couple photo can go in the invitation design.
 * The composer (lib/invitations/index.ts) resolves each slot to a concrete
 * Media URL by looking up `Wedding.mediaSlotsJson[semanticRole]`.
 *
 * If a slot is required and the wedding has no media assigned, the quality
 * gate (lib/quality/invitation-scorecard.ts) blocks publication.
 */
export interface MediaSlot {
  /** Stable slot identifier (e.g. "couple-hero"). */
  slotId: string;
  /** Semantic role — matches Media.semanticRole for binding. */
  semanticRole: MediaSlotSemanticRole;
  /** Whether the slot MUST be filled (quality gate blocks publish if missing). */
  required: boolean;
  /** Accepted MIME types (defaults to ['image/jpeg', 'image/png', 'image/webp']). */
  acceptedTypes: MediaSlotAcceptedType[];
  /** Expected aspect ratio ("16:9" | "4:5" | "1:1" | "3:2" | "16:10"). */
  aspectRatio: string;
  /** How the image fits the container (CSS object-fit). */
  cropMode: MediaSlotCropMode;
  /** Default focal point (0-1 normalized — used for responsive crop). */
  focalPoint?: { x: number; y: number };
  /** Fallback image URL when the wedding has no media for this slot. */
  fallback?: string;
  /** Responsive behaviour (default = 'always'). */
  responsiveBehavior?: MediaSlotResponsiveBehavior;
  /** Human-readable label (shown in the admin UI for slot assignment). */
  label: string;
  /** Description (helps the Super Admin understand what to upload). */
  description?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. DATA BINDINGS (template expressions → live wedding/guest data)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A data binding maps a template placeholder (e.g. {{coupleNames}}) to a
 * concrete value resolved from the wedding/guest context.
 *
 * The `expression` is a dotted path that the composer resolves against the
 * InvitationExperienceContext. Resolved values are injected into the
 * template's copy text + section props before rendering.
 */
export interface DataBinding {
  /** Placeholder name (used in template copy as {{placeholderName}}). */
  placeholder: string;
  /** Dotted path expression (e.g. "wedding.coupleLabel", "guest.name"). */
  expression: string;
  /** Fallback value when the expression resolves to null/undefined. */
  fallback?: string;
  /** Optional format transformation (date, time, currency, etc.). */
  format?: 'date' | 'date-long' | 'time' | 'datetime' | 'currency' | 'uppercase' | 'lowercase';
  /** Optional format arguments (e.g. locale for dates). */
  formatArgs?: Record<string, string>;
}

/** Pre-built wedding-level bindings (template author can extend). */
export interface WeddingDataBindings {
  coupleNames: DataBinding;
  coupleLabel: DataBinding;
  date: DataBinding;
  time: DataBinding;
  venue: DataBinding;
  address: DataBinding;
  city: DataBinding;
  rsvpUrl: DataBinding;
  gallery: DataBinding;
  story: DataBinding;
  mapUrl: DataBinding;
  [key: string]: DataBinding;
}

/** Pre-built guest-level bindings (resolved per guest at render time). */
export interface GuestDataBindings {
  name: DataBinding;
  firstName: DataBinding;
  table: DataBinding;
  accessCode: DataBinding;
  qrCode: DataBinding;
  rsvpUrl: DataBinding;
  [key: string]: DataBinding;
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. SECTIONS (composition — which sections the invitation includes)
// ══════════════════════════════════════════════════════════════════════════════

/** Available invitation section types (per mission brief §5). */
export type InvitationSectionType =
  | 'cover'               // Full-bleed cover photo + couple names
  | 'couple-introduction' // Couple intro card with story teaser
  | 'hero-photo'          // Hero photo + date overlay
  | 'wedding-date'        // Date display (typographic)
  | 'countdown'           // Countdown timer
  | 'ceremony'            // Ceremony details
  | 'reception'           // Reception details
  | 'story'               // Couple story (timeline)
  | 'gallery'             // Photo gallery (3-6 images)
  | 'venue'               // Venue info + map
  | 'map'                 // Map embed
  | 'dress-code'          // Dress code
  | 'rsvp'                // RSVP form
  | 'guest-personalization' // Per-guest greeting + table + QR
  | 'qr-access'           // QR code display
  | 'guestbook'           // Guestbook teaser
  | 'contact'             // Contact info
  | 'footer';             // Footer (credits, social)

/** A section in the invitation composition. */
export interface InvitationSection {
  /** Stable section id (e.g. "cover", "ceremony"). */
  id: string;
  /** Section type (drives renderer dispatch). */
  type: InvitationSectionType;
  /** Whether the section is enabled (false = hidden). */
  enabled: boolean;
  /** Display order (1 = first, 2 = second, etc.). */
  order: number;
  /** Per-section props (component-specific overrides). */
  props?: Record<string, unknown>;
  /** Section title (visible header). */
  title?: string;
  /** Section subtitle (visible subhead). */
  subtitle?: string;
  /** Slot bindings for this section (e.g. gallery → [GALLERY_01, GALLERY_02, GALLERY_03]). */
  mediaSlots?: string[]; // slotId references
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. TOKENS (CSS custom properties injected by the renderer)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * CSS custom properties the template declares. These are layered ON TOP of the
 * PlatformTheme tokens (`--theme-primary`, etc.) so the invitation can override
 * specific aspects (e.g. a darker overlay for cinematic templates).
 *
 * The ThemeInjector reads these from `template.configJson.tokens` and injects
 * them as inline CSS variables on the invitation wrapper element.
 */
export interface InvitationTokens {
  /** Primary invitation color (overrides --theme-primary). */
  '--inv-primary'?: string;
  /** Accent color (overrides --theme-accent). */
  '--inv-accent'?: string;
  /** Background color (overrides --theme-background). */
  '--inv-bg'?: string;
  /** Surface color (overrides --theme-surface). */
  '--inv-surface'?: string;
  /** Surface deep color (overrides --theme-surface-deep). */
  '--inv-surface-deep'?: string;
  /** Text color (overrides --theme-text). */
  '--inv-text'?: string;
  /** Overlay color (rgba — for hero overlays). */
  '--inv-overlay'?: string;
  /** Hero image opacity (0-1). */
  '--inv-hero-opacity'?: string;
  /** Section vertical padding. */
  '--inv-section-padding'?: string;
  /** Font display family (overrides --theme-font-display). */
  '--inv-font-display'?: string;
  /** Font body family (overrides --theme-font-body). */
  '--inv-font-body'?: string;
  /** Border radius for cards (px). */
  '--inv-radius'?: string;
  /** Box shadow for premium cards. */
  '--inv-shadow'?: string;
  /** Animation duration (ms). */
  '--inv-anim-duration'?: string;
  /** Animation easing. */
  '--inv-anim-easing'?: string;
  [key: string]: string | undefined;
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. RULES (responsive + animation + quality)
// ══════════════════════════════════════════════════════════════════════════════

/** Responsive rules per breakpoint. */
export interface ResponsiveRule {
  /** Hide specific sections on this breakpoint. */
  hideSections?: string[];
  /** Adjust section padding (px). */
  sectionPadding?: number;
  /** Adjust hero height (vh). */
  heroHeight?: number;
  /** Adjust font scale factor (1 = default). */
  fontScale?: number;
  /** Adjust image quality (1 = full, 0.8 = 80%, etc. — perf optimisation). */
  imageQuality?: number;
}

export interface ResponsiveRules {
  mobile: ResponsiveRule;   // 375-414px
  tablet: ResponsiveRule;   // 768-1024px
  desktop: ResponsiveRule;  // 1440px+
}

/** Animation rules. */
export interface AnimationRules {
  /** Reveal strategy. */
  reveal: 'scroll' | 'fade-in' | 'slide-up' | 'none';
  /** Animation duration (ms). */
  duration: number;
  /** Easing function. */
  easing: string;
  /** Stagger between sections (ms). */
  stagger?: number;
  /** Hero animation. */
  heroAnimation?: 'zoom' | 'fade' | 'parallax' | 'none';
  /** Hero animation duration (ms). */
  heroDuration?: number;
}

/** Quality rules (declared by template, enforced by the quality gate). */
export interface QualityRules {
  /** Minimum number of images per slot (default = 1). */
  minImagesPerSlot: number;
  /** Required text completeness (list of placeholders that must resolve). */
  requiredBindings: string[];
  /** Required QR readability score (0-100). */
  minQrReadability: number;
  /** Required accessibility score (0-100). */
  minAccessibility: number;
  /** Required contrast ratio (WCAG AA = 4.5:1, AAA = 7:1). */
  minContrastRatio: number;
  /** Whether to block publication on critical quality errors. */
  blockOnCritical: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. TEMPLATE CONFIG (the full InvitationTemplate.configJson shape)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The full configuration of an InvitationTemplate. Serialised as
 * `InvitationTemplate.configJson` (JSON string).
 *
 * The composer (lib/invitations/index.ts) reads this, merges it with live
 * wedding + guest data, and produces an `InvitationExperienceConfig` that
 * the renderer (IdentityInvitation dispatcher) consumes.
 */
export interface InvitationTemplateConfig {
  /** Sections to render (in order). */
  sections: InvitationSection[];
  /** Components mapping (slot → componentId — for the dispatcher). */
  components?: Record<string, string>;
  /** CSS custom properties (override PlatformTheme tokens). */
  tokens?: InvitationTokens;
  /** Media slot declarations (semantic role → Media binding). */
  mediaSlots: MediaSlot[];
  /** Wedding-level data bindings. */
  weddingBindings: WeddingDataBindings;
  /** Guest-level data bindings (resolved per guest at render time). */
  guestBindings: GuestDataBindings;
  /** Responsive rules per breakpoint. */
  responsiveRules: ResponsiveRules;
  /** Animation rules. */
  animationRules: AnimationRules;
  /** Quality rules (enforced by lib/quality/invitation-scorecard.ts). */
  qualityRules: QualityRules;
  /** Supported output formats. */
  supportedFormats: InvitationFormat[];
  /** Supported languages. */
  supportedLanguages: InvitationLanguage[];
  /** Default copy (translatable strings). */
  copy?: Record<InvitationLanguage, Record<string, string>>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. RUNTIME CONTEXT (what the composer needs to produce a render config)
// ══════════════════════════════════════════════════════════════════════════════

/** The runtime context passed to composeInvitationExperience(). */
export interface InvitationExperienceContext {
  /** Wedding ID. */
  weddingId: string;
  /** Wedding slug (for URLs). */
  weddingSlug: string;
  /** Couple display label (e.g. "Josué & Hornella"). */
  coupleLabel: string;
  /** Bride name. */
  brideName: string;
  /** Groom name. */
  groomName: string;
  /** Wedding date (ISO 8601). */
  weddingDate: string | null;
  /** Timezone (IANA — e.g. "Africa/Kinshasa"). */
  timezone: string;
  /** Venue name. */
  venueName: string | null;
  /** Venue address. */
  venueAddress: string | null;
  /** Venue city. */
  venueCity: string | null;
  /** Venue latitude (for maps). */
  venueLat: string | null;
  /** Venue longitude (for maps). */
  venueLng: string | null;
  /** RSVP URL (computed — points to /w/[slug]/invite/[code] or /w/[slug]#rsvp). */
  rsvpUrl: string;
  /** Gallery URL (computed — points to /w/[slug]#gallery). */
  galleryUrl: string;
  /** Story URL (computed — points to /w/[slug]#story). */
  storyUrl: string;
  /** Map URL (computed — Google Maps embed URL). */
  mapUrl: string | null;
  /** Resolved media slots (semantic role → Media URL). */
  mediaSlots: Record<string, InvitationMediaAsset>;
  /** Optional guest context (null = anonymous public invitation). */
  guest?: InvitationGuestContext | null;
  /** Wedding events (ceremony, reception, etc.). */
  events?: InvitationEventContext[];
  /** Couple story entries. */
  stories?: InvitationStoryEntry[];
  /** Per-wedding template overrides (from Wedding.invitationConfigJson). */
  overrides?: InvitationTemplateOverrides;
}

/** A resolved media asset (post-binding). */
export interface InvitationMediaAsset {
  /** Media ID. */
  mediaId: string;
  /** Resolved URL (absolute — for <img src>). */
  url: string;
  /** Alt text. */
  alt: string | null;
  /** Aspect ratio (e.g. "16:9"). */
  aspectRatio: string | null;
  /** Custom focal point (overrides slot default). */
  focalPoint?: { x: number; y: number };
}

/** Per-guest context (when an invitation is personalized). */
export interface InvitationGuestContext {
  /** Guest ID. */
  guestId: string;
  /** Full name (e.g. "Michael Johnson"). */
  name: string;
  /** First name (e.g. "Michael"). */
  firstName: string;
  /** Table number/label. */
  tableLabel: string | null;
  /** Invitation access code (used in /invite/[code] URLs). */
  accessCode: string;
  /** QR code URL (computed — points to /api/guests/qrcode/[code]). */
  qrCodeUrl: string;
  /** Personal RSVP URL. */
  rsvpUrl: string;
}

/** An event (ceremony, reception, etc.). */
export interface InvitationEventContext {
  /** Event ID. */
  eventId: string;
  /** Event type. */
  type: 'ceremony' | 'reception' | 'cocktail' | 'dinner' | 'party' | 'other';
  /** Event title (e.g. "Cérémonie religieuse"). */
  title: string;
  /** Start time (ISO 8601). */
  startTime: string | null;
  /** End time (ISO 8601). */
  endTime: string | null;
  /** Location (may differ from main venue). */
  location: string | null;
  /** Address. */
  address: string | null;
}

/** A couple story entry. */
export interface InvitationStoryEntry {
  /** Story ID. */
  storyId: string;
  /** Story title. */
  title: string;
  /** Story body (text). */
  body: string;
  /** Story date (ISO 8601 — for timeline). */
  date: string | null;
  /** Story image URL (from COUPLE_STORY media slot). */
  imageUrl: string | null;
}

/** Per-wedding template overrides (from Wedding.invitationConfigJson). */
export interface InvitationTemplateOverrides {
  /** Section enable/disable overrides. */
  sectionEnabled?: Record<string, boolean>;
  /** Section order overrides (re-arrange). */
  sectionOrder?: Record<string, number>;
  /** Per-section prop overrides. */
  sectionProps?: Record<string, Record<string, unknown>>;
  /** Token overrides (e.g. couple picked a custom primary color). */
  tokens?: Partial<InvitationTokens>;
  /** Copy overrides (per language). */
  copy?: Partial<Record<InvitationLanguage, Record<string, string>>>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. RENDER CONFIG (the final object the renderer consumes)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The final render config produced by `composeInvitationExperience()`.
 *
 * This is what the IdentityInvitation dispatcher reads to decide which premium
 * component to render and what props to pass. It is also what gets snapshotted
 * to `Wedding.publishedConfigJson.invitation` at publish time (version pinning).
 */
export interface InvitationExperienceConfig {
  /** Template slug (e.g. "royal-gold"). */
  templateSlug: string;
  /** Template version (for snapshot pinning). */
  templateVersion: number;
  /** Category (drives dispatcher routing). */
  category: InvitationCategory;
  /** Style identifier. */
  style: InvitationStyle;
  /** Layout. */
  layout: InvitationLayout;
  /** Identity preset slug (drives the IdentityInvitation dispatcher). */
  identity: InvitationIdentity | null;
  /** Resolved sections (with overrides applied — enabled + ordered). */
  sections: InvitationSection[];
  /** Resolved media slots (semantic role → URL). */
  mediaSlots: Record<string, InvitationMediaAsset>;
  /** Resolved tokens (template defaults + overrides + theme merge). */
  tokens: InvitationTokens;
  /** Resolved data bindings (placeholder → resolved value). */
  resolvedBindings: Record<string, string>;
  /** Responsive rules. */
  responsiveRules: ResponsiveRules;
  /** Animation rules. */
  animationRules: AnimationRules;
  /** Quality rules. */
  qualityRules: QualityRules;
  /** Supported formats. */
  supportedFormats: InvitationFormat[];
  /** Supported languages. */
  supportedLanguages: InvitationLanguage[];
  /** Active language (resolved from request Accept-Language or wedding default). */
  activeLanguage: InvitationLanguage;
  /** Resolved copy (active language). */
  copy: Record<string, string>;
  /** Wedding context (read-only — passed to renderers). */
  wedding: InvitationExperienceContext;
  /** Guest context (null for anonymous public invitation). */
  guest: InvitationGuestContext | null;
  /** Generated at (ISO 8601 — for cache busting + audit). */
  generatedAt: string;
  /** Composer version (for backward-compat rendering). */
  composerVersion: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. TEMPLATE REGISTRY (catalog of all InvitationTemplates)
// ══════════════════════════════════════════════════════════════════════════════

/** A registry entry (DB-backed InvitationTemplate + denormalised fields for fast listing). */
export interface InvitationTemplateRegistryEntry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: InvitationCategory;
  style: InvitationStyle;
  layout: InvitationLayout;
  identity: InvitationIdentity | null;
  tier: InvitationTier;
  status: InvitationTemplateStatus;
  isLocked: boolean;
  approvalStatus: InvitationApprovalStatus;
  isBuiltIn: boolean;
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  version: number;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  themeId: string | null;
  createdAt: string;
  updatedAt: string;
  // Denormalised counts (for the admin UI cards):
  sectionsCount: number;     // number of sections enabled by default
  mediaSlotsCount: number;   // number of media slots declared
  dataBindingsCount: number; // number of data bindings
  guestBindingsCount: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. CONSTANTS (canonical 10 templates — for the seed script)
// ══════════════════════════════════════════════════════════════════════════════

/** Canonical list of 10 premium invitation templates (per mission brief §6). */
export const CANONICAL_INVITATION_TEMPLATES: ReadonlyArray<{
  slug: string;
  name: string;
  description: string;
  category: InvitationCategory;
  style: InvitationStyle;
  layout: InvitationLayout;
  identity: InvitationIdentity;
  tier: InvitationTier;
  themeId?: string; // links to existing PlatformTheme.slug (resolved at seed time)
  isDefault?: boolean;
  isRecommended?: boolean;
}> = [
  {
    slug: 'royal-gold',
    name: 'Royal Gold Invitation',
    description: 'Luxury / ceremonial / gold / editorial — invitation officielle dorée',
    category: 'LUXURY',
    style: 'ROYAL_GOLD',
    layout: 'FULL_BLEED_IMAGE',
    identity: 'royal-luxury',
    tier: 'FREE',
    themeId: 'royal-gold',
    isDefault: true,
    isRecommended: true,
  },
  {
    slug: 'royal-black',
    name: 'Royal Black Invitation',
    description: 'Black tie / cinematic / premium — invitation sobre et élégante',
    category: 'LUXURY',
    style: 'ROYAL_BLACK',
    layout: 'CINEMATIC_HERO',
    identity: 'royal-luxury',
    tier: 'PREMIUM',
    themeId: 'royal-black',
    isRecommended: true,
  },
  {
    slug: 'white-romance',
    name: 'White Romance Invitation',
    description: 'White / ivory / romantic / elegant — invitation romantique épurée',
    category: 'BOTANICAL',
    style: 'WHITE_ROMANCE',
    layout: 'CENTERED_CEREMONY',
    identity: 'botanical-romance',
    tier: 'PREMIUM',
    themeId: 'botanical-romance',
  },
  {
    slug: 'champagne-editorial',
    name: 'Champagne Editorial Invitation',
    description: 'Champagne / editorial / sophisticated — invitation magazine chic',
    category: 'EDITORIAL',
    style: 'CHAMPAGNE_EDITORIAL',
    layout: 'EDITORIAL_GRID',
    identity: 'minimal-editorial',
    tier: 'STANDARD',
    themeId: 'modern-champagne',
  },
  {
    slug: 'black-ivory',
    name: 'Black & Ivory Invitation',
    description: 'Minimal luxury / fashion — invitation minimaliste contrastée',
    category: 'EDITORIAL',
    style: 'BLACK_IVORY',
    layout: 'TYPOGRAPHIC_HERO',
    identity: 'minimal-editorial',
    tier: 'PREMIUM',
    themeId: 'minimal-modern',
  },
  {
    slug: 'botanical-love',
    name: 'Botanical Love Invitation',
    description: 'Garden / organic / floral — invitation botanique et chaleureuse',
    category: 'BOTANICAL',
    style: 'BOTANICAL_LOVE',
    layout: 'SPLIT_SCREEN',
    identity: 'botanical-romance',
    tier: 'PREMIUM',
    themeId: 'botanical-romance',
  },
  {
    slug: 'modern-monogram',
    name: 'Modern Monogram Invitation',
    description: 'Contemporary / architectural — invitation typographique moderne',
    category: 'EDITORIAL',
    style: 'MODERN_MONOGRAM',
    layout: 'ASYMMETRIC',
    identity: 'minimal-editorial',
    tier: 'STANDARD',
    themeId: 'modern-champagne',
  },
  {
    slug: 'african-luxury',
    name: 'African Luxury Invitation',
    description: 'Premium African-inspired visual language — invitation wax premium',
    category: 'LUXURY',
    style: 'AFRICAN_LUXURY',
    layout: 'PHOTO_COLLAGE',
    identity: 'royal-luxury',
    tier: 'PREMIUM',
    themeId: 'kente',
  },
  {
    slug: 'sunset-romance',
    name: 'Sunset Romance Invitation',
    description: 'Warm / cinematic / destination — invitation destination ensoleillée',
    category: 'CINEMATIC',
    style: 'SUNSET_ROMANCE',
    layout: 'CINEMATIC_HERO',
    identity: 'cinematic-dark',
    tier: 'PREMIUM',
    themeId: 'sunset',
  },
  {
    slug: 'sapphire-night',
    name: 'Sapphire Night Invitation',
    description: 'Dark blue / luxury evening — invitation élégante soirée',
    category: 'LUXURY',
    style: 'SAPPHIRE_NIGHT',
    layout: 'FULL_BLEED_IMAGE',
    identity: 'royal-luxury',
    tier: 'EXCLUSIVE',
    themeId: 'sapphire-noir',
  },
  // Mission 5.9.4 P2-1 — 5 new premium templates
  {
    slug: 'pearl-romance',
    name: 'Pearl Romance Invitation',
    description: 'Pearl / iridescent / romantic — invitation nacrée et lumineuse',
    category: 'BOTANICAL',
    style: 'PEARL_ROMANCE',
    layout: 'CENTERED_CEREMONY',
    identity: 'botanical-romance',
    tier: 'PREMIUM',
    themeId: 'botanical-romance',
  },
  {
    slug: 'emerald-palace',
    name: 'Emerald Palace Invitation',
    description: 'Emerald / palace / architectural — invitation émeraude et or',
    category: 'LUXURY',
    style: 'EMERALD_PALACE',
    layout: 'FULL_BLEED_IMAGE',
    identity: 'royal-luxury',
    tier: 'EXCLUSIVE',
    themeId: 'royal-luxury',
  },
  {
    slug: 'old-money',
    name: 'Old Money Invitation',
    description: 'Navy / cream / understated — invitation patrimoniale et discrète',
    category: 'EDITORIAL',
    style: 'OLD_MONEY',
    layout: 'TYPOGRAPHIC_HERO',
    identity: 'minimal-editorial',
    tier: 'PREMIUM',
    themeId: 'minimal-editorial',
  },
  {
    slug: 'art-deco',
    name: 'Art Deco Invitation',
    description: 'Black / gold / geometric — invitation Art Déco années 1920',
    category: 'EDITORIAL',
    style: 'ART_DECO',
    layout: 'EDITORIAL_GRID',
    identity: 'minimal-editorial',
    tier: 'PREMIUM',
    themeId: 'minimal-editorial',
  },
  {
    slug: 'botanical-garden',
    name: 'Botanical Garden Invitation',
    description: 'Sage / terracotta / garden — invitation jardin botanique',
    category: 'BOTANICAL',
    style: 'BOTANICAL_GARDEN',
    layout: 'SPLIT_SCREEN',
    identity: 'botanical-romance',
    tier: 'PREMIUM',
    themeId: 'botanical-romance',
  },
] as const;

/** Composer version (bumped when the InvitationExperienceConfig shape changes). */
export const INVITATION_COMPOSER_VERSION = '1.0.0';

