import { db } from './db';
import { logger } from './logger';

/**
 * P2.8 — Organization-level quota enforcement.
 *
 * Three quotas are enforced:
 *   1. maxWeddings           — total weddings the org can manage
 *   2. maxMembers            — total members (OrganizationMember rows with status='ACTIVE')
 *   3. maxInvitationsPerMonth — total INVITATIONS_SENT metric across all org weddings in the current month
 *
 * Each check returns { allowed, current, limit, organizationId, metric }.
 * Callers MUST check `allowed` before performing the gated operation and return
 * 402 Payment Required (or 409 Conflict) if false.
 *
 * Platform admins (PLATFORM_ADMIN / SUPER_ADMIN) are NOT exempt — the quota is
 * enforced at the org level, not per-actor.
 *
 * Limits use the convention: -1 = unlimited. 0 = blocked.
 */

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  organizationId: string;
  metric: string;
}

/**
 * Check if an organization can add more weddings.
 * Counts non-archived weddings (status !== 'ARCHIVED').
 *
 * A limit of -1 means unlimited (always allowed).
 */
export async function checkOrgWeddingLimit(organizationId: string): Promise<QuotaCheckResult> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { maxWeddings: true },
  });
  if (!org) throw new Error('Organization not found');

  const current = await db.wedding.count({
    where: { organizationId, status: { not: 'ARCHIVED' } },
  });

  const allowed = org.maxWeddings < 0 || current < org.maxWeddings;
  return {
    allowed,
    current,
    limit: org.maxWeddings,
    organizationId,
    metric: 'weddings',
  };
}

/**
 * Check if an organization can add more members.
 * Counts OrganizationMember rows with status='ACTIVE' or 'PENDING' (pending
 * invites count against the quota to prevent invite-spam).
 *
 * A limit of -1 means unlimited (always allowed).
 */
export async function checkOrgMemberLimit(organizationId: string): Promise<QuotaCheckResult> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { maxMembers: true },
  });
  if (!org) throw new Error('Organization not found');

  const current = await db.organizationMember.count({
    where: { organizationId, status: { in: ['ACTIVE', 'PENDING'] } },
  });

  const allowed = org.maxMembers < 0 || current < org.maxMembers;
  return {
    allowed,
    current,
    limit: org.maxMembers,
    organizationId,
    metric: 'members',
  };
}

/**
 * Check if an organization can send more invitations this month.
 * Uses the INVITATIONS_SENT UsageCounter metric summed across all org weddings
 * for the current period (YYYY-MM).
 *
 * @param additional How many MORE invitations the org wants to send (default 1)
 *
 * A limit of -1 means unlimited (always allowed).
 */
export async function checkOrgInvitationLimit(
  organizationId: string,
  additional: number = 1,
): Promise<QuotaCheckResult & { period: string }> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { maxInvitationsPerMonth: true },
  });
  if (!org) throw new Error('Organization not found');

  // Use the usage helper (P2.4) — dynamic import to avoid circular deps
  // (usage.ts may transitively import from org-quotas in the future).
  const { getOrgUsageForPeriod, getCurrentPeriod } = await import('./usage');
  const period = getCurrentPeriod();
  const current = await getOrgUsageForPeriod(organizationId, 'INVITATIONS_SENT', period);

  const allowed =
    org.maxInvitationsPerMonth < 0 ||
    current + additional <= org.maxInvitationsPerMonth;
  return {
    allowed,
    current,
    limit: org.maxInvitationsPerMonth,
    organizationId,
    metric: 'invitations_per_month',
    period,
  };
}

/**
 * Get all 3 quota statuses for an org in one call (for dashboard display).
 */
export async function getOrgQuotaStatus(
  organizationId: string,
): Promise<{
  weddings: QuotaCheckResult;
  members: QuotaCheckResult;
  invitations: QuotaCheckResult & { period: string };
}> {
  const [weddings, members, invitations] = await Promise.all([
    checkOrgWeddingLimit(organizationId),
    checkOrgMemberLimit(organizationId),
    checkOrgInvitationLimit(organizationId, 0),
  ]);
  return { weddings, members, invitations };
}

/**
 * Update an organization's quota limits.
 * Only PLATFORM_ADMIN can call this (enforced by the caller route).
 *
 * @throws Error if any limit is < -1 (use 0 for "blocked", -1 for unlimited)
 */
export async function updateOrgQuotas(
  organizationId: string,
  quotas: {
    maxWeddings?: number;
    maxMembers?: number;
    maxInvitationsPerMonth?: number;
  },
): Promise<void> {
  const data: Record<string, number> = {};
  if (quotas.maxWeddings !== undefined) {
    if (quotas.maxWeddings < -1) throw new Error('maxWeddings must be >= -1 (-1 = unlimited)');
    data.maxWeddings = quotas.maxWeddings;
  }
  if (quotas.maxMembers !== undefined) {
    if (quotas.maxMembers < -1) throw new Error('maxMembers must be >= -1');
    data.maxMembers = quotas.maxMembers;
  }
  if (quotas.maxInvitationsPerMonth !== undefined) {
    if (quotas.maxInvitationsPerMonth < -1)
      throw new Error('maxInvitationsPerMonth must be >= -1');
    data.maxInvitationsPerMonth = quotas.maxInvitationsPerMonth;
  }

  if (Object.keys(data).length === 0) return;

  await db.organization.update({
    where: { id: organizationId },
    data,
  });

  logger.info('Org quotas updated', { organizationId, quotas: data });
}
