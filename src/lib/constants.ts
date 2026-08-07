/**
 * Shared constants (P1-CQ-9 to P1-CQ-14).
 *
 * Previously these values were duplicated across multiple API routes and
 * admin UI files. Centralizing them here ensures a single source of truth
 * — change once, everywhere updates.
 *
 * Import as: import { EMAIL_REGEX, VALID_ROLES, VALID_PLANS } from '@/lib/constants'
 */

// ─── P1-CQ-10: Email validation regex ─────────────────────────────────────────
// Duplicated 3× before extraction. Same pattern in all 3 sites.
// Pragmatic RFC-5321: local-part@domain.tld, 1+ char each side, 2+ char TLD.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── P1-CQ-12: Valid admin roles ──────────────────────────────────────────────
// Duplicated 3× before extraction (twice in the same file in admin/users route).
// Note: SUPER_ADMIN is the legacy alias for PLATFORM_ADMIN (both treated
// identically by isPlatformAdmin() in lib/types.ts).
export const VALID_ROLES = [
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'ORGANIZER',
  'RECEPTION',
  'CONTROLLER',
] as const;

// ─── P1-CQ-11: Valid subscription plans ──────────────────────────────────────
// Duplicated 2× before extraction.
export const VALID_PLANS = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'] as const;

// ─── Password policy (P1-SEC-6) ───────────────────────────────────────────────
// Min 8 chars, at least one letter and one digit. Used by /api/admin/users,
// /api/platform/users, and any future user-creation route.
export const MIN_PASSWORD_LENGTH = 8;

export function isValidPassword(password: string): boolean {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return false;
  if (!/[a-zA-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

export const PASSWORD_POLICY_MSG =
  `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères, dont une lettre et un chiffre.`;

// ─── P1-CQ-19: Magic numbers centralised ─────────────────────────────────────
// These were scattered as raw literals across the codebase.
export const LOGIN_RATE_LIMIT = {
  MAX_ATTEMPTS: 10,
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
} as const;

export const GUEST_LOOKUP_RATE_LIMIT = {
  MAX_REQUESTS: 5,
  WINDOW_MS: 60 * 1000, // 1 minute
} as const;

export const AUTO_AUTH_RATE_LIMIT = {
  MAX_REQUESTS: 5,
  WINDOW_MS: 60 * 1000, // 1 minute
} as const;

export const MAX_PAYMENT_USD_CENTS = 100_000_00; // $10,000 — sanity ceiling

// Guest session cookie max-age (seconds). Uses SESSION_EXPIRY_DAYS env var
// with a 30-day default. Previously hardcoded as `30 * 24 * 60 * 60` in
// auto-auth route + guest-auth.ts.
export const GUEST_SESSION_MAX_AGE_SECONDS =
  parseInt(process.env.GUEST_SESSION_DAYS || '30', 10) * 24 * 60 * 60;

// ─── P1-CQ-14: Wedding slug helper ────────────────────────────────────────────
// Duplicated 4× before extraction (2 lib + 2 components).
/**
 * Extract the wedding slug from a Next.js request. Resolution order:
 *   1. X-Wedding-Slug header (set by /w/[slug]/* client fetches)
 *   2. `slug` query param (used by /api/platform/* for platform admin)
 *   3. null (caller falls back to DEFAULT_WEDDING_SLUG)
 */
export function extractWeddingSlug(
  headers: Headers,
  searchParams: URLSearchParams
): string | null {
  const headerSlug = headers.get('x-wedding-slug');
  if (headerSlug && headerSlug.trim()) return headerSlug.trim();
  const querySlug = searchParams.get('slug');
  if (querySlug && querySlug.trim()) return querySlug.trim();
  return null;
}

// ─── P2-CQ-9: Settings keys ──────────────────────────────────────────────────
// Duplicated as bare string literals in 4+ files (onboarding/create-wedding,
// Footer, GuestSearch, HeroSection, page.tsx). A typo like `brideName` instead
// of `bride_name` would silently fall back to default with no compile-time
// error. This `as const` object gives autocomplete + a single rename target.
//
// Values are the EXACT strings stored in Settings.key (DB column). The DB
// schema uses String? (not an enum) so these are advisory — but a future
// migration could enforce a CHECK constraint using this list.
export const SETTING_KEYS = {
  // Couple identity
  BRIDE_NAME: 'bride_name',
  GROOM_NAME: 'groom_name',
  COUPLE_PHOTO_1: 'couple_photo_1',
  COUPLE_PHOTO_2: 'couple_photo_2',
  HASHTAG: 'hashtag',
  // Site presentation
  SITE_TITLE: 'site_title',
  SITE_SUBTITLE: 'site_subtitle',
  WELCOME_MESSAGE: 'welcome_message',
  INVITATION_MESSAGE: 'invitation_message',
  // Wedding date / time
  WEDDING_DATE: 'wedding_date',
  WEDDING_TIME: 'wedding_time',
  // Venue
  VENUE_NAME: 'venue_name',
  VENUE_CITY: 'venue_city',
  VENUE_ADDRESS: 'venue_address',
  VENUE_LAT: 'venue_lat',
  VENUE_LNG: 'venue_lng',
  VENUE_REFERENCE: 'venue_reference',
  VENUE_TIME: 'venue_time',
  // RSVP
  RSVP_DEADLINE: 'rsvp_deadline',
  // Theme (legacy single-color; full theme lives in the Theme model)
  PRIMARY_COLOR: 'primary_color',
  // Music
  MUSIC_ENABLED: 'music_enabled',
  MUSIC_VOLUME: 'music_volume',
} as const;

/** TypeScript type: union of all known Settings key strings. */
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// ─── P2-CQ-4: PLAN_LIST — typed Plan array for UI iteration ──────────────────
// Defined in src/lib/ui-labels.ts (single source of truth) and re-exported
// here so callers that already import other constants from this module can
// also reach PLAN_LIST without a second import. The array is the SAME
// instance (re-export, not a copy) so identity comparisons hold.
export { PLAN_LIST } from './ui-labels';

// ─── P1-SEC-9 (future): Password-reset token expiry ──────────────────────────
// 1 hour — short enough to limit a leaked-reset-link window, long enough for
// a user to find the email + click through. Reserved for the password-reset
// flow (P1-SEC-9, currently not implemented). Centralising the constant now
// means the eventual implementation doesn't pick a different magic number.
export const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;

// ─── P2.3: Per-invitation pricing (flagship B2B2C revenue) ───────────────────
// The platform's flagship offer: 1 invitation sent = 0.70 USD.
// Used by:
//   - /api/weddings/[id]/invitations/bulk (auto-OrderItem generator)
//   - /api/plans public route (display "0.70 USD/invitation" above plan pricing)
//   - /api/org/[slug]/buy-credits (compute credit pack prices)
//   - src/lib/credits.ts (default price when no custom org price is set)
//
// Value is in USD cents (minor units) to avoid float rounding. 70 cents = $0.70.
export const PRICE_PER_INVITATION_USD_CENTS = 70;

// ─── P2.1: Credit types ──────────────────────────────────────────────────────
// The 5 billable credit types defined in the cahier des charges.
// Mirrors the Credit.type column values. Order matches the spec priority.
export const CREDIT_TYPES = ['INVITATION', 'SMS', 'WHATSAPP', 'QR', 'EXPORT'] as const;
export type CreditType = typeof CREDIT_TYPES[number];

// Default prices per credit type (USD cents). Used by Stripe checkout when
// buying credit packs. SMS/WhatsApp prices are placeholders — providers will
// be wired in P3+. QR is 0 (locally generated, but tracked for usage stats).
export const CREDIT_PRICES_USD_CENTS: Record<CreditType, number> = {
  INVITATION: 70,   // $0.70 per invitation (flagship)
  SMS: 7,           // $0.07 per SMS (placeholder — Twilio pricing tier)
  WHATSAPP: 5,      // $0.05 per WhatsApp message (placeholder — WhatsApp Business API)
  QR: 0,            // $0 (locally generated; tracked for usage stats only)
  EXPORT: 50,       // $0.50 per guest-list export (PDF/CSV)
};

// ─── P2.6: Commercial status state machine ───────────────────────────────────
// Allowed transitions for Wedding.commercialStatus. Mirrors the wedding-status.ts
// pattern. Used by src/lib/commercial-status.ts (P2.6).
export const COMMERCIAL_STATUS_STATES = [
  'LEAD', 'PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'READY',
  'LIVE', 'COMPLETED', 'ARCHIVED', 'CANCELLED'
] as const;
export type CommercialStatus = typeof COMMERCIAL_STATUS_STATES[number];

// ─── P2.5: Stripe configuration ──────────────────────────────────────────────
// Loaded from env. Webhook secret MUST be set for production. Keys can be
// empty in dev (the Stripe SDK init will throw a clear error if a route is hit).
export const STRIPE_CONFIG = {
  publicKey: process.env.STRIPE_PUBLIC_KEY || '',
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // Default currency for Stripe Checkout sessions (ISO 4217 lowercase).
  currency: 'usd',
  // Credit pack definitions surfaced in the buy-credits UI. Each pack is a
  // pre-bundled quantity of one credit type at a fixed price. Custom quantities
  // are also allowed via the API.
  creditPacks: [
    { id: 'invitations_50',  type: 'INVITATION' as CreditType, quantity: 50,  label: 'Pack 50 invitations'  },
    { id: 'invitations_200', type: 'INVITATION' as CreditType, quantity: 200, label: 'Pack 200 invitations' },
    { id: 'invitations_500', type: 'INVITATION' as CreditType, quantity: 500, label: 'Pack 500 invitations' },
    { id: 'sms_100',         type: 'SMS' as CreditType,         quantity: 100, label: 'Pack 100 SMS'         },
    { id: 'whatsapp_100',    type: 'WHATSAPP' as CreditType,    quantity: 100, label: 'Pack 100 WhatsApp'    },
    { id: 'export_10',       type: 'EXPORT' as CreditType,      quantity: 10,  label: 'Pack 10 exports'      },
  ],
};
