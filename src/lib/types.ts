// ══════════════════════════════════════════════════════════════════════════════
// Shared Multi-Tenant Types — Phase 1 Foundation
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Subscription plans for the SaaS platform.
 * Order matters: TRIAL < ESSENTIEL < PREMIUM < ELITE (for upgrade logic).
 */
export type Plan = 'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE';

/**
 * Plan limits — enforced by billing-limits middleware (Phase 6).
 * -1 means unlimited.
 */
export const PLAN_LIMITS: Record<Plan, { guests: number; mediaBytes: number; admins: number; customDomain: boolean }> = {
  TRIAL:     { guests: 20,   mediaBytes: 100 * 1024 * 1024,   admins: 1,  customDomain: false },
  ESSENTIEL: { guests: 200,  mediaBytes: 1 * 1024 * 1024 * 1024, admins: 2, customDomain: false },
  PREMIUM:   { guests: 500,  mediaBytes: 5 * 1024 * 1024 * 1024, admins: 5, customDomain: true },
  ELITE:     { guests: -1,   mediaBytes: -1,                    admins: 10, customDomain: true },
};

/**
 * Plan display metadata for UI.
 */
export const PLAN_METADATA: Record<Plan, { label: string; priceFcfa: number; priceUsd: number }> = {
  TRIAL:     { label: 'Essai Libre',  priceFcfa: 0,      priceUsd: 0 },
  ESSENTIEL: { label: 'Essentiel',    priceFcfa: 30000,  priceUsd: 49 },
  PREMIUM:   { label: 'Premium',      priceFcfa: 60000,  priceUsd: 99 },
  ELITE:     { label: 'Élite',        priceFcfa: 120000, priceUsd: 199 },
};

/**
 * Wedding status lifecycle.
 *
 * Flow:
 *   DRAFT → PUBLISHED (wedding goes live, invitation links work)
 *   PUBLISHED → COMPLETED (wedding day has passed, couple marked it as done)
 *   COMPLETED → ARCHIVED (administrative archiving, read-only, hidden from dashboard)
 *   PUBLISHED → SUSPENDED (temporary, e.g. non-payment)
 *   SUSPENDED → PUBLISHED (reactivated after payment)
 *   Any → ARCHIVED (administrative)
 *
 * TERMINATED is NOT used — "COMPLETED" is the business term for a finished wedding.
 */
export type WeddingStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'ARCHIVED' | 'SUSPENDED';

/**
 * User roles.
 *
 * Phase 3 introduces PLATFORM_ADMIN as the canonical name for the platform
 * owner. SUPER_ADMIN is preserved as a legacy alias — both map to the same
 * hierarchy level (4) and grant the same permissions. New code should prefer
 * PLATFORM_ADMIN; the DB column may contain either value.
 *
 * Hierarchy (higher = more permissions):
 *   PLATFORM_ADMIN / SUPER_ADMIN (4) — platform owner, weddingId=null, sees all weddings
 *   ORGANIZER   (3) — per-wedding owner (full CRUD on their wedding)
 *   RECEPTION   (2) — per-wedding reception staff (check-in, guest lookup)
 *   CONTROLLER  (1) — per-wedding check-in controller (read-only + check-in)
 */
export type Role =
  | 'PLATFORM_ADMIN'
  | 'SUPER_ADMIN'
  | 'ORGANIZER'
  | 'RECEPTION'
  | 'CONTROLLER'
  | 'DESIGNER'
  | 'ART_DIRECTOR';

export const ROLE_HIERARCHY: Record<Role, number> = {
  PLATFORM_ADMIN: 4,
  SUPER_ADMIN: 4, // legacy alias — same level as PLATFORM_ADMIN
  ORGANIZER: 3,
  RECEPTION: 2,
  CONTROLLER: 1,
  DESIGNER: 2, // Phase 4 — can access Designer Portal + own Collections
  ART_DIRECTOR: 3, // Phase 4 — can validate submissions
};

/**
 * Canonical role normalization — accepts both new and legacy role names.
 * Returns PLATFORM_ADMIN for SUPER_ADMIN (and vice versa when needed for DB compat).
 */
export function normalizeRole(role: string): Role {
  const r = role as Role;
  if (r === 'PLATFORM_ADMIN' || r === 'SUPER_ADMIN') return 'PLATFORM_ADMIN';
  if (r === 'ORGANIZER' || r === 'RECEPTION' || r === 'CONTROLLER') return r;
  if (r === 'DESIGNER' || r === 'ART_DIRECTOR') return r;
  return 'CONTROLLER'; // fail-safe: least privilege
}

/**
 * Check whether a role grants platform-wide access (no weddingId lock).
 */
export function isPlatformAdmin(role: string): boolean {
  return role === 'PLATFORM_ADMIN' || role === 'SUPER_ADMIN';
}

/**
 * Check if a role has permission for an action requiring one of the required roles.
 */
export function hasRole(userRole: string, requiredRoles: Role[]): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as Role] || 0;
  return requiredRoles.some(r => (ROLE_HIERARCHY[r] || 0) <= userLevel);
}

/**
 * Slug validation regex — used for wedding URL slugs.
 * Rules: lowercase, alphanumeric + hyphens, 3-32 chars.
 */
export const SLUG_REGEX = /^[a-z0-9-]{3,32}$/;

/**
 * Reserved slugs that cannot be used for weddings (would conflict with platform routes).
 */
export const RESERVED_SLUGS = [
  'admin', 'api', 'w', 'landing', 'www', 'app', 'auth', 'login', 'signup',
  'onboarding', 'platform', 'billing', 'health', 'settings', 'account',
];

/**
 * Validate a wedding slug.
 */
export function isValidSlug(slug: string): boolean {
  if (!SLUG_REGEX.test(slug)) return false;
  if (RESERVED_SLUGS.includes(slug.toLowerCase())) return false;
  if (slug.startsWith('-') || slug.endsWith('-')) return false;
  if (slug.includes('--')) return false;
  return true;
}

/**
 * Default wedding slug — the legacy client served at root "/".
 */
export const DEFAULT_WEDDING_SLUG = 'josue-hornella';

/**
 * Generate a unique slug from a couple's names.
 * e.g. ("Josué", "Hornella") → "josue-hornella"
 */
export function generateSlug(nameA: string, nameB?: string): string {
  const normalize = (s: string) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const parts = [normalize(nameA)];
  if (nameB && normalize(nameB)) parts.push(normalize(nameB));
  return parts.filter(Boolean).join('-').slice(0, 32);
}

/**
 * Build the couple display label from bride + groom names.
 * e.g. ("Josué", "Hornella") → "Josué & Hornella"
 */
export function buildCoupleLabel(brideName: string, groomName: string): string {
  const a = (brideName || '').trim();
  const b = (groomName || '').trim();
  if (a && b) return `${a} & ${b}`;
  return a || b || 'Mariage';
}
