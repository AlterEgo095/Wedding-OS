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
export type WeddingStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'COMPLETED' | 'ARCHIVED' | 'SUSPENDED';

/**
 * User roles.
 *
 * Phase 3 introduces PLATFORM_ADMIN as the canonical name for the platform
 * owner. SUPER_ADMIN is preserved as a legacy alias — both map to the same
 * hierarchy level (5) and grant the same permissions. New code should prefer
 * PLATFORM_ADMIN; the DB column may contain either value.
 *
 * Mission 6.0 P1.3 introduces ORG_ADMIN/ORG_MEMBER/ORG_VIEWER — org-scoped
 * roles for the B2B2C agency model. These users have organizationId set
 * (not weddingId) and access ALL weddings under their org.
 *
 * Hierarchy (higher = more permissions):
 *   PLATFORM_ADMIN / SUPER_ADMIN (5) — platform owner, sees all orgs + weddings
 *   ORG_ADMIN   (4) — org-level admin (CRUD org + invite members + CRUD weddings)
 *   ORG_MEMBER  (3) — org staff (read/write weddings under their org)
 *   ORGANIZER   (3) — per-wedding owner (full CRUD on their wedding, backward compat)
 *   ORG_VIEWER  (2) — org read-only (view weddings + guests, no write)
 *   RECEPTION   (2) — per-wedding reception staff (check-in, guest lookup)
 *   CONTROLLER  (1) — per-wedding check-in controller (read-only + check-in)
 *   DESIGNER    (2) — platform-scoped collections author
 *   ART_DIRECTOR (3) — platform-scoped collections validator
 */
export type Role = 'PLATFORM_ADMIN' | 'SUPER_ADMIN' | 'ORG_ADMIN' | 'ORG_MEMBER' | 'ORG_VIEWER' | 'ORGANIZER' | 'RECEPTION' | 'CONTROLLER' | 'DESIGNER' | 'ART_DIRECTOR';

export const ROLE_HIERARCHY: Record<Role, number> = {
  PLATFORM_ADMIN: 5,
  SUPER_ADMIN: 5, // legacy alias — same level as PLATFORM_ADMIN
  ORG_ADMIN: 4,   // org-level admin (P1.3)
  ORG_MEMBER: 3,  // org staff (P1.3)
  ORGANIZER: 3,   // per-wedding owner (backward compat, same as ORG_MEMBER)
  ORG_VIEWER: 2,  // org read-only (P1.3)
  RECEPTION: 2,
  CONTROLLER: 1,
  // Phase 5 — Designer Portal roles (collections authoring + validation).
  DESIGNER: 2,
  ART_DIRECTOR: 3,
};

/**
 * Canonical role normalization — accepts both new and legacy role names.
 * Returns PLATFORM_ADMIN for SUPER_ADMIN (and vice versa when needed for DB compat).
 */
export function normalizeRole(role: string): Role {
  const r = role as Role;
  if (r === 'PLATFORM_ADMIN' || r === 'SUPER_ADMIN') return 'PLATFORM_ADMIN';
  if (r === 'ORG_ADMIN' || r === 'ORG_MEMBER' || r === 'ORG_VIEWER') return r;
  if (r === 'ORGANIZER' || r === 'RECEPTION' || r === 'CONTROLLER') return r;
  if (r === 'DESIGNER' || r === 'ART_DIRECTOR') return r;
  return 'CONTROLLER'; // fail-safe: least privilege
}

/**
 * Check whether a role grants platform-wide access (no weddingId/orgId lock).
 */
export function isPlatformAdmin(role: string): boolean {
  return role === 'PLATFORM_ADMIN' || role === 'SUPER_ADMIN';
}

/**
 * Check whether a role is org-scoped (B2B2C agency model).
 * Org-scoped users access weddings through their org membership, not via
 * a direct weddingId FK.
 */
export function isOrgRole(role: string): boolean {
  return role === 'ORG_ADMIN' || role === 'ORG_MEMBER' || role === 'ORG_VIEWER';
}

// ─── Mission 6.0 P1.3 — Capability Matrix ────────────────────────────────────
//
// A capability-based authorization system complementing the role hierarchy.
// While ROLE_HIERARCHY is used for coarse "minimum level" checks (hasRole),
// the capability matrix enables fine-grained "can this role do X action" checks.
//
// This is the foundation for P1.4 (assertWeddingAccess refactor) and P1.5
// (Prisma tenant-scoped dual-scope), where we need to distinguish:
//   - org:read    (view org dashboard + member list)
//   - org:write   (edit org settings)
//   - org:manage_members (invite/revoke members)
//   - wedding:read/write/publish/delete
//   - guest:read/write/checkin
//   - collection:read/write/publish

export type Capability =
  | 'platform:read' | 'platform:write'
  | 'org:read' | 'org:write' | 'org:manage_members'
  | 'wedding:read' | 'wedding:write' | 'wedding:publish' | 'wedding:delete'
  | 'guest:read' | 'guest:write' | 'guest:checkin'
  | 'collection:read' | 'collection:write' | 'collection:publish';

/** Wildcard — grants all capabilities. */
const ALL_CAPABILITIES: Capability[] = [
  'platform:read', 'platform:write',
  'org:read', 'org:write', 'org:manage_members',
  'wedding:read', 'wedding:write', 'wedding:publish', 'wedding:delete',
  'guest:read', 'guest:write', 'guest:checkin',
  'collection:read', 'collection:write', 'collection:publish',
];

export const CAPABILITY_MATRIX: Record<Role, Capability[] | '*'> = {
  PLATFORM_ADMIN: '*',
  SUPER_ADMIN: '*',
  ORG_ADMIN: [
    'org:read', 'org:write', 'org:manage_members',
    'wedding:read', 'wedding:write', 'wedding:publish', 'wedding:delete',
    'guest:read', 'guest:write', 'guest:checkin',
    'collection:read', 'collection:write',
  ],
  ORG_MEMBER: [
    'org:read',
    'wedding:read', 'wedding:write',
    'guest:read', 'guest:write', 'guest:checkin',
    'collection:read',
  ],
  ORG_VIEWER: [
    'org:read',
    'wedding:read',
    'guest:read',
    'collection:read',
  ],
  ORGANIZER: [
    'wedding:read', 'wedding:write', 'wedding:publish',
    'guest:read', 'guest:write', 'guest:checkin',
    'collection:read',
  ],
  RECEPTION: [
    'wedding:read',
    'guest:read', 'guest:checkin',
  ],
  CONTROLLER: [
    'wedding:read',
    'guest:read', 'guest:checkin',
  ],
  DESIGNER: [
    'collection:read', 'collection:write',
  ],
  ART_DIRECTOR: [
    'collection:read', 'collection:write', 'collection:publish',
  ],
};

/**
 * Check if a role has a specific capability.
 * Platform admins (PLATFORM_ADMIN/SUPER_ADMIN) have all capabilities.
 */
export function hasCapability(role: string, capability: Capability): boolean {
  const caps = CAPABILITY_MATRIX[role as Role];
  if (!caps) return false;
  if (caps === '*') return true;
  return caps.includes(capability);
}

/**
 * Check if a role has ALL of the specified capabilities.
 */
export function hasAllCapabilities(role: string, capabilities: Capability[]): boolean {
  return capabilities.every(c => hasCapability(role, c));
}

/**
 * Check if a role has ANY of the specified capabilities.
 */
export function hasAnyCapability(role: string, capabilities: Capability[]): boolean {
  return capabilities.some(c => hasCapability(role, c));
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
