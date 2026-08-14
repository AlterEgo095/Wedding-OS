// ══════════════════════════════════════════════════════════════════════════════
// src/lib/commercial-status.ts — P2.6 Commercial status state machine
// ══════════════════════════════════════════════════════════════════════════════
//
// Mirrors the wedding-status.ts pattern: defines the allowed transitions
// for Wedding.commercialStatus and provides helpers to validate + list them.
//
// States (from COMMERCIAL_STATUS_STATES in constants.ts):
//   LEAD → PENDING_PAYMENT → PAID → IN_PRODUCTION → READY → LIVE → COMPLETED → ARCHIVED
//   + CANCELLED (terminal, reachable from any non-terminal state)
//
// The PAID → LIVE transition is automatic when Wedding.status flips to PUBLISHED
// (see autoTransitionToLive() below). It is also reachable from IN_PRODUCTION
// and READY (e.g. a wedding that was published mid-production).
//
// Same-status transitions (e.g. PAID → PAID) are treated as idempotent no-ops
// and are allowed — transitionCommercialStatus() short-circuits them.
//
// Audit log: every successful transition is recorded via db.auditLog.create
// (action='COMMERCIAL_STATUS_TRANSITION', details='from → to (reason)').

import type { CommercialStatus } from './constants';

/**
 * Allowed transitions for Wedding.commercialStatus.
 *
 * Notes:
 *  - LEAD → PAID is NOT allowed: payment evidence must go through
 *    PENDING_PAYMENT first (the converge route sets PENDING_PAYMENT on
 *    wedding creation).
 *  - PAID → IN_PRODUCTION / READY / LIVE / COMPLETED: fast-forward is allowed
 *    because some weddings skip production (e.g. demo weddings, or
 *    post-event payment).
 *  - IN_PRODUCTION → PAID is allowed for rework (the wedding was paid, went
 *    into production, but a chargeback / refund reset the commercial state).
 *  - ARCHIVED and CANCELLED are terminal.
 */
const VALID_COMMERCIAL_TRANSITIONS: Record<CommercialStatus, CommercialStatus[]> = {
  LEAD:            ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID:            ['IN_PRODUCTION', 'READY', 'LIVE', 'COMPLETED', 'CANCELLED'],
  IN_PRODUCTION:   ['READY', 'LIVE', 'PAID', 'CANCELLED'], // PAID allowed for rework
  READY:           ['LIVE', 'IN_PRODUCTION', 'CANCELLED'],
  // 5.8.17 — allow LIVE → PAID for autoTransitionToPaid() on UNPUBLISH
  // (symmetric to PAID → LIVE on PUBLISH). Preserves payment invariant:
  // unpublishing a LIVE wedding reverts it to PAID so the next publish
  // attempt passes the PUBLISHED_REQUIRES_PAID guard without re-running
  // the Commercial OS payment verification flow.
  LIVE:            ['COMPLETED', 'ARCHIVED', 'CANCELLED', 'PAID'],
  COMPLETED:       ['ARCHIVED'],
  ARCHIVED:        [], // terminal
  CANCELLED:       [], // terminal
};

/**
 * Returns true if `from → to` is a valid commercialStatus transition.
 *
 *  - Same-status transitions are always allowed (idempotent no-ops).
 *  - First-time set (from === null): any non-terminal state except ARCHIVED
 *    is allowed. ARCHIVED is rejected because it requires the wedding to
 *    have lived through LIVE or COMPLETED first.
 *  - Unknown source states are denied by default.
 */
export function isValidCommercialTransition(
  from: CommercialStatus | null | undefined,
  to: CommercialStatus,
): boolean {
  if (from === to) return true; // idempotent no-op
  if (!from) {
    // First-time set: allow any non-terminal state except ARCHIVED
    return to !== 'ARCHIVED';
  }
  const allowed = VALID_COMMERCIAL_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Returns the list of allowed target commercialStatuses for a given source
 * status. Empty array for terminal states (ARCHIVED, CANCELLED) and for
 * unknown source states.
 *
 * For a first-time set (from === null), returns all non-ARCHIVED states.
 */
export function getAllowedCommercialTransitions(
  from: CommercialStatus | null | undefined,
): CommercialStatus[] {
  if (!from) {
    return [
      'LEAD', 'PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION',
      'READY', 'LIVE', 'COMPLETED', 'CANCELLED',
    ];
  }
  return VALID_COMMERCIAL_TRANSITIONS[from] || [];
}

/**
 * Transition a wedding's commercialStatus with state-machine validation.
 *
 * Behavior:
 *  - Idempotent: if `from === to`, no DB write happens, audit log still
 *    records the attempt with reason="(no-op, already at target)".
 *  - Validates via isValidCommercialTransition() unless skipValidation=true
 *    (platform admin override).
 *  - Writes a single AuditLog row (action='COMMERCIAL_STATUS_TRANSITION').
 *  - Audit-log failure does NOT block the transition (best-effort).
 *
 * @throws Error if the wedding is not found, or if the transition is invalid
 *         and skipValidation is false. Callers should catch and return HTTP 400.
 * @returns { previousStatus, newStatus } for caller introspection.
 */
export async function transitionCommercialStatus(params: {
  weddingId: string;
  to: CommercialStatus;
  userId?: string;
  reason?: string;
  skipValidation?: boolean; // for admin override (platform admin can bypass)
}): Promise<{ previousStatus: CommercialStatus | null; newStatus: CommercialStatus }> {
  const { db } = await import('./db');
  const { logger } = await import('./logger');

  const wedding = await db.wedding.findUnique({
    where: { id: params.weddingId },
    select: { id: true, commercialStatus: true, slug: true },
  });
  if (!wedding) throw new Error('Wedding not found');

  const from = (wedding.commercialStatus as CommercialStatus | null) || null;

  // Idempotent: no-op if already at target. Still write an audit log entry
  // for traceability (some callers want a paper trail of "tried to
  // re-transition to X, was already X").
  if (from === params.to) {
    logger.info('Commercial status transition (no-op, already at target)', {
      weddingId: params.weddingId,
      status: params.to,
      reason: params.reason,
    });
    try {
      await db.auditLog.create({
        data: {
          weddingId: params.weddingId,
          userId: params.userId || 'system',
          action: 'COMMERCIAL_STATUS_TRANSITION',
          details: `${params.to} → ${params.to} (no-op${params.reason ? `: ${params.reason}` : ''})`,
          ipAddress: null,
          userAgent: 'commercial-status-ts',
        },
      });
    } catch {
      // Best-effort audit log — ignore failures
    }
    return { previousStatus: from, newStatus: params.to };
  }

  if (!params.skipValidation && !isValidCommercialTransition(from, params.to)) {
    throw new Error(`Transition non autorisée: ${from || 'null'} → ${params.to}`);
  }

  await db.wedding.update({
    where: { id: params.weddingId },
    data: { commercialStatus: params.to },
  });

  logger.info('Commercial status transition', {
    weddingId: params.weddingId,
    slug: wedding.slug,
    from: from || 'null',
    to: params.to,
    reason: params.reason,
  });

  // Audit log (server-side call — synthetic ipAddress/userAgent markers)
  try {
    await db.auditLog.create({
      data: {
        weddingId: params.weddingId,
        userId: params.userId || 'system',
        action: 'COMMERCIAL_STATUS_TRANSITION',
        details: `${from || 'null'} → ${params.to}${params.reason ? ` (${params.reason})` : ''}`,
        ipAddress: null,
        userAgent: 'commercial-status-ts',
      },
    });
  } catch {
    // Audit log failure should not block the transition
  }

  return { previousStatus: from, newStatus: params.to };
}

/**
 * Auto-transition PAID → LIVE when Wedding.status flips to PUBLISHED.
 *
 * Called from the wedding publish routes (onboarding/publish, platform
 * weddings/[id] PUT) AND from provisionFromOrder() (after setting PAID).
 *
 * Idempotent: if already LIVE, no-op. If wedding.status is not PUBLISHED,
 * no-op. Only transitions from PAID / READY / IN_PRODUCTION → LIVE (the
 * three production-side states that imply the wedding is ready to go live).
 *
 * LEAD / PENDING_PAYMENT are NOT auto-promotable to LIVE — the wedding
 * must have a verified payment first.
 */
export async function autoTransitionToLive(weddingId: string, userId?: string): Promise<void> {
  const { db } = await import('./db');
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { commercialStatus: true, status: true },
  });
  if (!wedding) return;
  if (wedding.status !== 'PUBLISHED') return;
  if (wedding.commercialStatus === 'LIVE') return;
  if (
    wedding.commercialStatus !== 'PAID' &&
    wedding.commercialStatus !== 'READY' &&
    wedding.commercialStatus !== 'IN_PRODUCTION'
  ) {
    // Can only auto-transition from PAID/READY/IN_PRODUCTION → LIVE
    return;
  }
  await transitionCommercialStatus({
    weddingId,
    to: 'LIVE',
    userId,
    reason: 'Auto-transition: Wedding.status flipped to PUBLISHED',
  });
}

/**
 * Auto-transition LIVE → PAID when Wedding.status flips to UNPUBLISHED.
 *
 * Mission 5.8.17 Phase 3 — symmetric counterpart to autoTransitionToLive().
 * Called from the PUT /api/platform/weddings/[id] route when the Super Admin
 * unpublishes a wedding (status: PUBLISHED → UNPUBLISHED). Reverts the
 * commercialStatus from LIVE back to PAID so the next PUBLISH attempt
 * (republish) passes the PUBLISHED_REQUIRES_PAID guard without re-running
 * the Commercial OS payment verification flow.
 *
 * Idempotent: if already PAID, no-op. If wedding.status is not UNPUBLISHED,
 * no-op. Only transitions from LIVE → PAID (the reverse of autoTransitionToLive).
 *
 * COMPLETED / ARCHIVED / CANCELLED are NOT auto-reverted to PAID — those
 * represent post-event or terminal states where the commercial relationship
 * has changed (event closed, archived, or cancelled).
 */
export async function autoTransitionToPaid(weddingId: string, userId?: string): Promise<void> {
  const { db } = await import('./db');
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { commercialStatus: true, status: true },
  });
  if (!wedding) return;
  if (wedding.status !== 'UNPUBLISHED') return;
  if (wedding.commercialStatus === 'PAID') return;
  if (wedding.commercialStatus !== 'LIVE') {
    // Can only auto-transition from LIVE → PAID (the reverse of publish).
    // Other states (COMPLETED, ARCHIVED, CANCELLED, LEAD, PENDING_PAYMENT,
    // IN_PRODUCTION, READY) are left untouched — unpublish does not change
    // their commercial semantics.
    return;
  }
  await transitionCommercialStatus({
    weddingId,
    to: 'PAID',
    userId,
    reason: 'Auto-transition: Wedding.status flipped to UNPUBLISHED (5.8.17)',
  });
}
