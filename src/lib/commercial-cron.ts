// ══════════════════════════════════════════════════════════════════════════════
// src/lib/commercial-cron.ts — P2.6 Commercial lifecycle cron jobs
// ══════════════════════════════════════════════════════════════════════════════
//
// Runs subscription lifecycle automation on an hourly interval:
//
//   1. TRIALING → PENDING_PAYMENT       (when trialEndsAt < now)
//   2. PENDING_PAYMENT → SUSPENDED      (after 7 days stale)
//   3. PAST_DUE → SUSPENDED             (after 3 days — retry exhaustion)
//   4. SUSPENDED for 30 days →
//        - revoke all PLAN-origin Entitlements
//        - set Wedding.commercialStatus = 'CANCELLED'
//        - set Subscription.status = 'CANCELED' (terminal)
//
// Designed to run via setInterval in instrumentation.ts (every hour).
// Safe to call concurrently — all transitions are idempotent. The cron
// catches all errors internally and never throws; the scheduler's
// setInterval callback is also wrapped in .catch(() => {}) so a failure
// never crashes the server.
//
// Why `updatedAt` is used as the staleness clock:
//   - Prisma @updatedAt bumps on every .update(). When we transition
//     TRIALING → PENDING_PAYMENT, updatedAt resets, so the 7-day
//     PENDING_PAYMENT clock starts from the transition moment, not from
//     the original subscription creation. This is the intended behavior
//     (the customer has 7 days from the trial-expiry notice to pay).
//
// After step 2/3, we also re-gate Wedding.commercialStatus to
// PENDING_PAYMENT (only if it was in a post-payment state like PAID/LIVE).
// This prevents a suspended customer from continuing to use paid features
// without an active subscription. The re-gate does NOT use the state
// machine (db.updateMany with a where-clause filter), because:
//   (a) it's a system-enforced re-gate, not a customer-initiated transition
//   (b) it must be applied in bulk to all suspended weddings
//   (c) PAID → PENDING_PAYMENT is not in VALID_COMMERCIAL_TRANSITIONS
//       (that would allow a customer to "un-pay" by triggering suspension)
// So we bypass the state machine here, but we DO write an audit log.

import { db } from './db';
import { logger } from './logger';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Run one pass of the commercial lifecycle cron.
 *
 * Returns counts of each transition type for observability. The function
 * NEVER throws — all errors are caught and logged. Safe to call from
 * tests, manual triggers, or the hourly scheduler.
 */
export async function runCommercialCron(): Promise<{
  trialingToPending: number;
  pendingToSuspended: number;
  pastDueToSuspended: number;
  revoked: number;
}> {
  const now = new Date();
  const stats = {
    trialingToPending: 0,
    pendingToSuspended: 0,
    pastDueToSuspended: 0,
    revoked: 0,
  };

  try {
    // ─── 1. TRIALING → PENDING_PAYMENT (trial expired) ────────────────────
    const expiredTrials = await db.subscription.findMany({
      where: {
        status: 'TRIALING',
        trialEndsAt: { lt: now },
      },
      select: { id: true, weddingId: true },
    });
    for (const sub of expiredTrials) {
      try {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: 'PENDING_PAYMENT' },
        });
        stats.trialingToPending++;
      } catch (e) {
        logger.error('Cron: failed to transition TRIALING → PENDING_PAYMENT', {
          subscriptionId: sub.id,
          errMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ─── 2. PENDING_PAYMENT → SUSPENDED (after 7 days) ────────────────────
    const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
    const stalePending = await db.subscription.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        updatedAt: { lt: sevenDaysAgo },
      },
      select: { id: true, weddingId: true },
    });
    for (const sub of stalePending) {
      try {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: 'SUSPENDED' },
        });
        // Re-gate the wedding's commercialStatus so paid features are
        // blocked while the subscription is suspended. We only re-gate if
        // the wedding was in a post-payment state — LEAD/PENDING_PAYMENT
        // weddings are left alone (they were never activated).
        await db.wedding.updateMany({
          where: {
            id: sub.weddingId,
            commercialStatus: { in: ['PAID', 'LIVE', 'IN_PRODUCTION', 'READY'] },
          },
          data: { commercialStatus: 'PENDING_PAYMENT' }, // re-gate until payment
        });
        try {
          await db.auditLog.create({
            data: {
              weddingId: sub.weddingId,
              userId: 'system',
              action: 'COMMERCIAL_STATUS_TRANSITION',
              details: 'PAID/LIVE/IN_PRODUCTION/READY → PENDING_PAYMENT (cron: subscription suspended after 7d)',
              ipAddress: null,
              userAgent: 'commercial-cron-ts',
            },
          });
        } catch {
          // best-effort
        }
        stats.pendingToSuspended++;
      } catch (e) {
        logger.error('Cron: failed to transition PENDING_PAYMENT → SUSPENDED', {
          subscriptionId: sub.id,
          errMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ─── 3. PAST_DUE → SUSPENDED (after 3 days) ───────────────────────────
    const threeDaysAgo = new Date(now.getTime() - THREE_DAYS_MS);
    const stalePastDue = await db.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        updatedAt: { lt: threeDaysAgo },
      },
      select: { id: true, weddingId: true },
    });
    for (const sub of stalePastDue) {
      try {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: 'SUSPENDED' },
        });
        await db.wedding.updateMany({
          where: {
            id: sub.weddingId,
            commercialStatus: { in: ['PAID', 'LIVE', 'IN_PRODUCTION', 'READY'] },
          },
          data: { commercialStatus: 'PENDING_PAYMENT' },
        });
        try {
          await db.auditLog.create({
            data: {
              weddingId: sub.weddingId,
              userId: 'system',
              action: 'COMMERCIAL_STATUS_TRANSITION',
              details: 'PAID/LIVE/IN_PRODUCTION/READY → PENDING_PAYMENT (cron: subscription suspended after 3d PAST_DUE)',
              ipAddress: null,
              userAgent: 'commercial-cron-ts',
            },
          });
        } catch {
          // best-effort
        }
        stats.pastDueToSuspended++;
      } catch (e) {
        logger.error('Cron: failed to transition PAST_DUE → SUSPENDED', {
          subscriptionId: sub.id,
          errMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ─── 4. SUSPENDED for 30 days → revoke Entitlements + CANCELLED ───────
    // This is the "give up" path: 30 days suspended with no payment means
    // we cancel the subscription, revoke all PLAN-origin entitlements, and
    // mark the wedding as CANCELLED (terminal commercial state). The
    // wedding row itself is NOT deleted — its data remains for forensics
    // and potential re-activation (which would require a new subscription).
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
    const longSuspended = await db.subscription.findMany({
      where: {
        status: 'SUSPENDED',
        updatedAt: { lt: thirtyDaysAgo },
      },
      select: { id: true, weddingId: true },
    });
    for (const sub of longSuspended) {
      try {
        // Revoke all PLAN-origin entitlements (ADD_ON / MANUAL_OVERRIDE /
        // PROMOTION / LEGACY are left in place — they were not granted by
        // the suspended subscription).
        await db.entitlement.deleteMany({
          where: { weddingId: sub.weddingId, origin: 'PLAN' },
        });
        // Mark wedding as CANCELLED (terminal commercial state)
        await db.wedding.update({
          where: { id: sub.weddingId },
          data: { commercialStatus: 'CANCELLED' },
        });
        // Mark subscription as CANCELED (terminal subscription state)
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: 'CANCELED' },
        });
        try {
          await db.auditLog.create({
            data: {
              weddingId: sub.weddingId,
              userId: 'system',
              action: 'COMMERCIAL_STATUS_TRANSITION',
              details: '→ CANCELLED (cron: 30 days suspended — entitlements revoked)',
              ipAddress: null,
              userAgent: 'commercial-cron-ts',
            },
          });
        } catch {
          // best-effort
        }
        stats.revoked++;
        logger.warn('Cron: entitlements revoked after 30 days suspended', {
          weddingId: sub.weddingId,
          subscriptionId: sub.id,
        });
      } catch (e) {
        logger.error('Cron: failed to revoke entitlements', {
          subscriptionId: sub.id,
          errMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (
      stats.trialingToPending +
      stats.pendingToSuspended +
      stats.pastDueToSuspended +
      stats.revoked >
      0
    ) {
      logger.info('Commercial cron completed', stats);
    }
  } catch (error) {
    // Top-level catch — never let the cron throw to its caller
    logger.error('Commercial cron failed', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return stats;
}

/**
 * Start the commercial cron scheduler.
 *
 * Call this once from instrumentation.ts (server boot). The scheduler:
 *   - Runs one pass 5s after boot (catches up on missed work in dev)
 *   - Then runs every 1 hour indefinitely
 *
 * Idempotent: if called multiple times, only the first call starts the
 * scheduler. Subsequent calls are no-ops (the module-level `cronStarted`
 * flag prevents duplicate setInterval handles under Next.js HMR).
 */
let cronStarted = false;
export function startCommercialCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  const HOUR_MS = 60 * 60 * 1000;
  // Run shortly after boot (5s) so dev environments catch up quickly.
  setTimeout(() => {
    runCommercialCron().catch(() => {});
  }, 5000);
  // Hourly cadence — production-grade for subscription lifecycle.
  const handle = setInterval(() => {
    runCommercialCron().catch(() => {});
  }, HOUR_MS);
  // Unref so the timer doesn't keep the process alive on shutdown
  // (instrumentation-node.ts clears SIGTERM handlers separately).
  if (typeof handle.unref === 'function') handle.unref();
  logger.info('Commercial cron scheduler started (interval: 1 hour)');
}
