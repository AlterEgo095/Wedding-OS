// ══════════════════════════════════════════════════════════════════════════════
// Plan Limits Enforcement (Phase 3 ÉTAPE 5 — commercial optimization)
// ══════════════════════════════════════════════════════════════════════════════
//
// These helpers enforce PLAN_LIMITS (defined in @/lib/types) at WRITE time —
// i.e. they block NEW writes that would push a wedding over its plan quota.
//
// IMPORTANT (zero-regression contract):
//   - These checks NEVER block reads. Existing data above the limit stays
//     accessible (a couple that downgrades from PREMIUM to TRIAL keeps
//     their 500 guests visible + editable, they just can't ADD more).
//   - A limit of -1 in PLAN_LIMITS means "unlimited" — the check always
//     returns `allowed: true` in that case.
//   - PLATFORM_ADMIN / SUPER_ADMIN users are NOT exempt — the limit is
//     enforced per-wedding (the couple's plan), not per-actor.
//

import { db } from './db';
import { PLAN_LIMITS, isPlatformAdmin, type Plan } from './types';

/**
 * Check if a wedding can add more guests.
 *
 * @returns { allowed, current, limit, plan }
 *   - `limit === -1` means unlimited (ELITE plan)
 *   - `allowed` is `true` when `current < limit` (or when limit is -1)
 */
/**
 * Mission 5.5: Read a provisioned Entitlement override for a wedding.
 *
 * provisionFromOrder() (commercial/index.ts) writes Entitlement rows with
 * origin='PLAN' when a payment is verified. These rows represent the ACTUAL
 * commercial entitlement the couple purchased — which may differ from the
 * static PLAN_LIMITS if the admin changed the wedding's plan after provisioning.
 *
 * This helper returns the Entitlement value (as a number) if it exists, or
 * null if no provisioned entitlement is present (fall back to PLAN_LIMITS).
 *
 * Entitlement.value is a String column (e.g. "500", "-1", "true"). We parse
 * it as int for numeric limits (guests, admins); for boolean limits
 * (customDomain, premiumCollections) we check for 'true'/'1'.
 */
async function getEntitlementOverride(
  weddingId: string,
  type: 'MAX_GUESTS' | 'BULK_INVITATIONS' | 'CHECK_IN' | 'CUSTOM_DOMAIN' | 'PREMIUM_COLLECTIONS'
): Promise<number | boolean | null> {
  try {
    const ent = await db.entitlement.findUnique({
      where: { weddingId_type: { weddingId, type } },
      select: { value: true },
    });
    if (!ent || !ent.value) return null;
    if (type === 'MAX_GUESTS' || type === 'BULK_INVITATIONS' || type === 'CHECK_IN') {
      const n = parseInt(ent.value, 10);
      return Number.isFinite(n) ? n : null;
    }
    return ent.value === 'true' || ent.value === '1';
  } catch {
    // If the Entitlement table or unique constraint is missing (migration drift),
    // silently fall back to PLAN_LIMITS. Never crash a limit check.
    return null;
  }
}

export async function checkGuestLimit(
  weddingId: string
): Promise<{ allowed: boolean; current: number; limit: number; plan: Plan }> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { plan: true },
  });
  if (!wedding) throw new Error('Wedding not found');
  const plan = wedding.plan as Plan;
  // Mission 5.5: prefer provisioned Entitlement over static PLAN_LIMITS
  const override = await getEntitlementOverride(weddingId, 'MAX_GUESTS');
  const limit = override !== null ? (override as number) : PLAN_LIMITS[plan].guests;
  const current = await db.guest.count({ where: { weddingId } });
  if (limit === -1) {
    return { allowed: true, current, limit: -1, plan };
  }
  return { allowed: current < limit, current, limit, plan };
}

/**
 * Check if a wedding can add more admin users.
 *
 * Platform-admin roles (PLATFORM_ADMIN / SUPER_ADMIN) are NEVER counted
 * against the limit — they are platform-level users with weddingId=null,
 * not wedding-scoped staff. Only ORGANIZER / RECEPTION / CONTROLLER
 * users assigned to this wedding count.
 */
export async function checkAdminLimit(
  weddingId: string
): Promise<{ allowed: boolean; current: number; limit: number; plan: Plan }> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { plan: true },
  });
  if (!wedding) throw new Error('Wedding not found');
  const plan = wedding.plan as Plan;
  const limit = PLAN_LIMITS[plan].admins;

  // Only count wedding-scoped admins (exclude platform-wide admins).
  const current = await db.adminUser.count({
    where: {
      weddingId,
      role: { notIn: ['PLATFORM_ADMIN', 'SUPER_ADMIN'] },
    },
  });

  if (limit === -1) {
    return { allowed: true, current, limit: -1, plan };
  }
  return { allowed: current < limit, current, limit, plan };
}

/**
 * Check if a wedding can upload more media bytes.
 *
 * @param weddingId      Target wedding
 * @param additionalBytes Bytes about to be uploaded (use 0 to just query usage)
 * @returns { allowed, currentBytes, limitBytes, plan }
 *   - `limitBytes === -1` means unlimited (ELITE plan)
 *   - `allowed` is `true` when `currentBytes + additionalBytes <= limitBytes`
 *     (or when limitBytes is -1)
 */
export async function checkMediaLimit(
  weddingId: string,
  additionalBytes: number
): Promise<{
  allowed: boolean;
  currentBytes: number;
  limitBytes: number;
  plan: Plan;
}> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { plan: true },
  });
  if (!wedding) throw new Error('Wedding not found');
  const plan = wedding.plan as Plan;
  const limitBytes = PLAN_LIMITS[plan].mediaBytes;

  // Aggregate current usage from Media.sizeBytes
  const aggregate = await db.media.aggregate({
    where: { weddingId },
    _sum: { sizeBytes: true },
  });
  const currentBytes = aggregate._sum.sizeBytes ?? 0;

  if (limitBytes === -1) {
    return { allowed: true, currentBytes, limitBytes: -1, plan };
  }
  return {
    allowed: currentBytes + additionalBytes <= limitBytes,
    currentBytes,
    limitBytes,
    plan,
  };
}

/**
 * Check if a plan allows custom domains.
 *
 * Pure function — no DB lookup needed. Returns true for PREMIUM and ELITE.
 */
export function canUseCustomDomain(plan: Plan): boolean {
  return PLAN_LIMITS[plan].customDomain;
}

/**
 * Helper: is the given role a wedding-scoped admin role (counted against
 * the per-wedding admin limit)? Platform admins are NOT counted.
 */
export function isWeddingScopedRole(role: string): boolean {
  return !isPlatformAdmin(role);
}
