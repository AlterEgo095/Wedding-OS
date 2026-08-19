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
// P2.9 UPDATE: checkAdminLimit and checkMediaLimit now read Entitlement DB
// overrides (MAX_ADMINS, MAX_MEDIA_BYTES) before falling back to PLAN_LIMITS.
// New checkInvitationLimit function added for the bulk invitation route.
// This closes the "silent quota drift" gap where admin DB edits to Plan
// limits were ignored by the runtime.
//

import { db } from './db';
import { PLAN_LIMITS, isPlatformAdmin, type Plan } from './types';

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
 * it as int for numeric limits (guests, invitations, admins, media bytes,
 * bulk invitations, check-in); for boolean limits (customDomain,
 * premiumCollections) we check for 'true'/'1'.
 *
 * P2.9: type union extended to include MAX_INVITATIONS, MAX_ADMINS, and
 * MAX_MEDIA_BYTES so that checkAdminLimit, checkMediaLimit, and the new
 * checkInvitationLimit all share the same override-lookup path.
 */
// P595B-P1 (Phase 9) — Exported so route handlers (check-in, custom-domain,
// bulk invitations) can re-use the same override-lookup path instead of
// duplicating the Entitlement query. Previously private; this is the only
// change required to wire the stored-but-unenforced entitlements.
export async function getEntitlementOverride(
  weddingId: string,
  type:
    | 'MAX_GUESTS'
    | 'MAX_INVITATIONS'
    | 'BULK_INVITATIONS'
    | 'CHECK_IN'
    | 'CUSTOM_DOMAIN'
    | 'PREMIUM_COLLECTIONS'
    | 'MAX_ADMINS'
    | 'MAX_MEDIA_BYTES'
): Promise<number | boolean | null> {
  try {
    const ent = await db.entitlement.findUnique({
      where: { weddingId_type: { weddingId, type } },
      select: { value: true },
    });
    if (!ent || !ent.value) return null;
    // For numeric types: MAX_GUESTS, MAX_INVITATIONS, BULK_INVITATIONS (count),
    // CHECK_IN (count), MAX_ADMINS, MAX_MEDIA_BYTES
    if (
      type === 'MAX_GUESTS' ||
      type === 'MAX_INVITATIONS' ||
      type === 'BULK_INVITATIONS' ||
      type === 'CHECK_IN' ||
      type === 'MAX_ADMINS' ||
      type === 'MAX_MEDIA_BYTES'
    ) {
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
 *
 * P2.9: prefer a provisioned MAX_ADMINS Entitlement override over the static
 * PLAN_LIMITS[plan].admins value. Closes the "silent quota drift" gap.
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

  // P2.9: prefer provisioned Entitlement (MAX_ADMINS) over static PLAN_LIMITS
  const override = await getEntitlementOverride(weddingId, 'MAX_ADMINS');
  const limit = override !== null ? (override as number) : PLAN_LIMITS[plan].admins;

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
 *
 * P2.9: prefer a provisioned MAX_MEDIA_BYTES Entitlement override over the
 * static PLAN_LIMITS[plan].mediaBytes value. Closes the "silent quota drift"
 * gap.
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

  // P2.9: prefer provisioned Entitlement (MAX_MEDIA_BYTES) over static PLAN_LIMITS
  const override = await getEntitlementOverride(weddingId, 'MAX_MEDIA_BYTES');
  const limitBytes = override !== null ? (override as number) : PLAN_LIMITS[plan].mediaBytes;

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
 * P2.9 — Check if a wedding can send more invitations.
 *
 * Reads the MAX_INVITATIONS Entitlement override if provisioned, else falls back
 * to the plan default (TRIAL=20, ESSENTIEL=200, PREMIUM=500, ELITE=-1 unlimited).
 *
 * @param weddingId    Target wedding
 * @param additional   How many MORE invitations to send (default 1)
 * @returns { allowed, current, limit, plan }
 *   - `limit === -1` means unlimited (ELITE plan or override)
 *   - `allowed` is `true` when `current + additional <= limit` (or limit is -1)
 *
 * Used by /api/weddings/[id]/invitations/bulk to enforce plan quotas BEFORE
 * generating invitations. Counts only SENT / DELIVERED / OPENED invitations
 * (PENDING ones don't count against quota — they haven't been sent yet).
 */
export async function checkInvitationLimit(
  weddingId: string,
  additional: number = 1
): Promise<{ allowed: boolean; current: number; limit: number; plan: Plan }> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { plan: true },
  });
  if (!wedding) throw new Error('Wedding not found');
  const plan = wedding.plan as Plan;

  // P2.9: prefer provisioned Entitlement (MAX_INVITATIONS) over static plan defaults
  const override = await getEntitlementOverride(weddingId, 'MAX_INVITATIONS');

  // Default invitation limits per plan (NOT in PLAN_LIMITS — invitation quota
  // is separate from guests: a wedding may have 500 guests but only 200 sent
  // invitations if the couple sent only to half the list).
  const PLAN_INVITATION_LIMITS: Record<Plan, number> = {
    TRIAL: 20,
    ESSENTIEL: 200,
    PREMIUM: 500,
    ELITE: -1, // unlimited
  };

  const limit = override !== null ? (override as number) : PLAN_INVITATION_LIMITS[plan];

  // Count invitations already sent (status SENT / DELIVERED / OPENED) for this
  // wedding. PENDING invitations are not yet sent and don't count against quota.
  const current = await db.invitation.count({
    where: {
      weddingId,
      status: { in: ['SENT', 'DELIVERED', 'OPENED'] },
    },
  });

  if (limit === -1) {
    return { allowed: true, current, limit: -1, plan };
  }
  return {
    allowed: current + additional <= limit,
    current,
    limit,
    plan,
  };
}

/**
 * P2.9 — Get all current quota statuses for a wedding in one call.
 *
 * Used by dashboards to display quota usage bars without 4 separate queries.
 * Returns guests / admins / media / invitations statuses.
 *
 * NOTE: this helper deliberately passes additional=0 / additionalBytes=0 to the
 * underlying checks so it can be used as a read-only status query (it never
 * changes the `allowed` verdict from the caller's perspective — it's a
 * snapshot of current usage against current limits).
 */
export async function getWeddingQuotaStatus(weddingId: string): Promise<{
  guests: { current: number; limit: number; plan: Plan };
  admins: { current: number; limit: number; plan: Plan };
  media: { currentBytes: number; limitBytes: number; plan: Plan };
  invitations: { current: number; limit: number; plan: Plan };
}> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { plan: true },
  });
  if (!wedding) throw new Error('Wedding not found');
  const plan = wedding.plan as Plan;

  const [guests, admins, media, invitations] = await Promise.all([
    checkGuestLimit(weddingId),
    checkAdminLimit(weddingId),
    checkMediaLimit(weddingId, 0),
    checkInvitationLimit(weddingId, 0),
  ]);

  return {
    guests: { current: guests.current, limit: guests.limit, plan },
    admins: { current: admins.current, limit: admins.limit, plan },
    media: { currentBytes: media.currentBytes, limitBytes: media.limitBytes, plan },
    invitations: { current: invitations.current, limit: invitations.limit, plan },
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
