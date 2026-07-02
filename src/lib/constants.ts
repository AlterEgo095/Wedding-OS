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
