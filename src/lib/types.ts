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
 */
export type WeddingStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';

/**
 * User roles (kept backward-compatible with existing role names in DB).
 * Phase 3 will introduce PLATFORM_ADMIN as alias for SUPER_ADMIN.
 *
 * Hierarchy (higher = more permissions):
 *   SUPER_ADMIN (4) — platform owner, weddingId=null, sees all weddings
 *   ORGANIZER   (3) — per-wedding owner
 *   RECEPTION   (2) — per-wedding reception staff
 *   CONTROLLER  (1) — per-wedding check-in controller
 */
export type Role = 'SUPER_ADMIN' | 'ORGANIZER' | 'RECEPTION' | 'CONTROLLER';

export const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 4,
  ORGANIZER: 3,
  RECEPTION: 2,
  CONTROLLER: 1,
};

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
