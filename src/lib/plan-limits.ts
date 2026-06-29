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
export async function checkGuestLimit(
  weddingId: string
): Promise<{ allowed: boolean; current: number; limit: number; plan: Plan }> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { plan: true },
  });
  if (!wedding) throw new Error('Wedding not found');
  const plan = wedding.plan as Plan;
  const limit = PLAN_LIMITS[plan].guests;
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
