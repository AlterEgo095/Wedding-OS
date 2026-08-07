// ══════════════════════════════════════════════════════════════════════════════
// Concurrent deployment lock (per-weddingId) — P3.6
// ══════════════════════════════════════════════════════════════════════════════
//
// Problem:
//   Two platform admins trigger a deployment for the same wedding at the same
//   time → both call runDeploymentPipeline() in parallel → both write
//   Wedding.publishedConfigJson, both insert Deployment rows, both flip
//   Wedding.status to PUBLISHED → race condition, corrupt published config,
//   orphan Deployment rows, broken audit trail.
//
// Solution:
//   An in-memory exclusive lock keyed by weddingId. The trigger route calls
//   withDeployLock(weddingId, userId, () => runDeploymentPipeline(input))
//   BEFORE entering the pipeline. If the lock is already held by another
//   in-flight deploy, the second caller gets an immediate 409 Conflict.
//
// Scope:
//   - In-process Map only. Sufficient for the current single-container Docker
//     deployment of the Next.js server. If/when the app is scaled to multiple
//     Node.js processes/containers, this MUST be replaced with a Redis SET NX
//     EX-based distributed lock (the API surface in this file is designed to
//     make that swap transparent to callers).
//   - Module-level Map lives in the Next.js server process (NOT the Edge
//     runtime — Edge functions are stateless + multi-isolate). The trigger
//     route is already configured with `runtime='nodejs'` implicitly via
//     `export const dynamic = 'force-dynamic'` + use of getAuthUser (which
//     uses Node APIs).
//
// Stale-lock safety:
//   If a process crash or unhandled rejection leaves a lock in the map
//   without a matching `releaseDeployLock` call (the `finally` in
//   withDeployLock covers the normal path, but a SIGKILL / OOM kill can
//   interrupt it), the next acquireDeployLock call for that weddingId will
//   detect that the existing lock is older than STALE_LOCK_TIMEOUT_MS and
//   overwrite it (logging a warn). This prevents a single crashed deploy
//   from permanently blocking all future deploys for that wedding.

import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeployLockInfo {
  /** Wedding the lock is held against (primary key of the locks Map). */
  weddingId: string;
  /** User ID of the admin who triggered the in-flight deploy. Null if unknown. */
  triggeredBy: string | null;
  /** Date.now() at acquire time (ms since epoch). Used for stale detection. */
  startedAt: number;
  /**
   * Deployment row ID once the pipeline has created one. Null at acquire time
   * (the pipeline hasn't started yet). Set by the orchestrator/trigger route
   * via `setDeployLockDeploymentId` if/when the pipeline produces a deploymentId.
   * Purely informational — used by ops dashboards to correlate lock ↔ Deployment.
   */
  deploymentId: string | null;
}

// ─── Module state ────────────────────────────────────────────────────────────

/**
 * The single source of truth for in-flight deploy locks. Keyed by weddingId
 * (one lock per wedding — concurrent deploys for DIFFERENT weddings are fine).
 *
 * NEVER export this Map directly. All mutations must go through the functions
 * below so the log lines + stale-check invariants are maintained.
 */
const deployLocks = new Map<string, DeployLockInfo>();

/**
 * Stale-lock safety threshold. If an existing lock's startedAt is older than
 * this, the next acquireDeployLock call treats it as abandoned and overwrites
 * it (logging a warn).
 *
 * 5 minutes is chosen because:
 *   - The deployment pipeline typically completes in 5-30 seconds (template
 *     resolution + asset resolution + JSON config compile + DB write).
 *   - A deploy that's been "running" for >5min is almost certainly stuck or
 *     the process died mid-deploy.
 *   - We'd rather overwrite a stale lock (risk: a single zombie deploy gets
 *     a partial-write race with the new one) than permanently block all
 *     future deploys for that wedding (definite outage).
 */
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── acquireDeployLock ───────────────────────────────────────────────────────

/**
 * Attempt to acquire an exclusive per-weddingId deploy lock.
 *
 * Behaviour:
 *   - If no lock is currently held for `weddingId`, acquire it and return
 *     `{ acquired: true }`.
 *   - If a lock IS held but its startedAt is older than STALE_LOCK_TIMEOUT_MS,
 *     treat it as abandoned: log a warn, overwrite it with the new caller's
 *     info, return `{ acquired: true }`.
 *   - If a lock is held AND it's fresh (< 5min old), reject the new caller:
 *     return `{ acquired: false, heldBy: <existing info> }` so the caller can
 *     construct a 409 Conflict response.
 *
 * @param weddingId    Wedding to lock (one in-flight deploy per wedding).
 * @param triggeredBy  User ID of the admin triggering the deploy (for the 409
 *                     response body + audit trail). Pass null if unknown.
 */
export function acquireDeployLock(
  weddingId: string,
  triggeredBy: string | null = null,
): { acquired: boolean; heldBy?: DeployLockInfo } {
  const now = Date.now();
  const existing = deployLocks.get(weddingId);

  if (existing) {
    const ageMs = now - existing.startedAt;
    if (ageMs < STALE_LOCK_TIMEOUT_MS) {
      // Active lock — reject the new caller.
      logger.info('deploy-lock.acquire-rejected', {
        weddingId,
        existingStartedAt: existing.startedAt,
        existingTriggeredBy: existing.triggeredBy,
        ageMs,
        newTriggeredBy: triggeredBy,
      });
      return { acquired: false, heldBy: existing };
    }
    // Stale lock — overwrite below.
    logger.warn('deploy-lock.stale-overwrite', {
      weddingId,
      previousStartedAt: existing.startedAt,
      previousTriggeredBy: existing.triggeredBy,
      ageMs,
      staleThresholdMs: STALE_LOCK_TIMEOUT_MS,
      newTriggeredBy: triggeredBy,
    });
  }

  const info: DeployLockInfo = {
    weddingId,
    triggeredBy,
    startedAt: now,
    deploymentId: null,
  };
  deployLocks.set(weddingId, info);

  logger.info('deploy-lock.acquired', {
    weddingId,
    triggeredBy,
    startedAt: now,
  });

  return { acquired: true };
}

// ─── releaseDeployLock ───────────────────────────────────────────────────────

/**
 * Release the deploy lock for `weddingId`. Safe to call even if no lock is
 * currently held (silently no-ops + logs at debug level). Idempotent.
 *
 * MUST be called in a `finally` block after acquireDeployLock succeeds, even
 * if the protected function throws. The withDeployLock wrapper handles this
 * automatically — direct callers should too.
 */
export function releaseDeployLock(weddingId: string): void {
  const existing = deployLocks.get(weddingId);
  if (!existing) {
    // No lock held — common case after a stale-overwrite by another caller, or
    // a double-release. Log at debug so we can spot logic bugs without spamming.
    logger.debug('deploy-lock.release-noop', { weddingId });
    return;
  }

  deployLocks.delete(weddingId);

  logger.info('deploy-lock.released', {
    weddingId,
    triggeredBy: existing.triggeredBy,
    heldForMs: Date.now() - existing.startedAt,
    deploymentId: existing.deploymentId,
  });
}

// ─── getDeployLockInfo ───────────────────────────────────────────────────────

/**
 * Read the current lock state for `weddingId`. Returns null if no lock is
 * currently held. Used by:
 *   - The 409 response body construction in withDeployLock.
 *   - Ops dashboards / health checks that want to display in-flight deploys.
 *
 * This is a pure read — does NOT acquire or release anything.
 */
export function getDeployLockInfo(weddingId: string): DeployLockInfo | null {
  return deployLocks.get(weddingId) ?? null;
}

// ─── setDeployLockDeploymentId ───────────────────────────────────────────────
//
// Optional helper — lets the trigger route stamp the deploymentId onto the
// lock info once the pipeline creates the Deployment row. This is purely for
// observability (the 409 response and ops dashboards benefit from being able
// to say "blocked by deployment X started at Y by user Z"). The lock itself
// works fine without this; the wrapper just leaves deploymentId = null.

/**
 * Update the deploymentId on an existing lock. No-op if no lock is held for
 * `weddingId` (the deploy may have already finished + released). Safe to
 * call from inside the protected function passed to withDeployLock.
 */
export function setDeployLockDeploymentId(
  weddingId: string,
  deploymentId: string,
): void {
  const existing = deployLocks.get(weddingId);
  if (!existing) {
    return;
  }
  existing.deploymentId = deploymentId;
}

// ─── withDeployLock (convenience wrapper) ────────────────────────────────────

/**
 * Acquire → run fn → release (in finally). The cleanest way to use the lock.
 *
 * Returns:
 *   - `{ result: T }` if the lock was acquired and fn completed successfully.
 *   - `{ error: { status: 409, body } }` if the lock was already held. The
 *     body shape is `{ error, message, lockedBy, lockedAt, weddingId }` —
 *     callers should pass it straight through as the HTTP response body.
 *
 * The lock is ALWAYS released (even if fn throws), because the release is in
 * a `finally` block. The thrown error propagates to the caller of
 * withDeployLock — they're responsible for catching it and converting to an
 * HTTP 500 (or whatever's appropriate).
 *
 * @example
 *   const out = await withDeployLock(
 *     input.weddingId,
 *     user!.id,
 *     () => runDeploymentPipeline(input),
 *   );
 *   if ('error' in out) {
 *     return NextResponse.json(out.error.body, { status: out.error.status });
 *   }
 *   return apiSuccess({ deploymentId: out.result.deploymentId, ... }, 201);
 */
export async function withDeployLock<T>(
  weddingId: string,
  triggeredBy: string | null,
  fn: () => Promise<T>,
): Promise<{ result?: T; error?: { status: number; body: unknown } }> {
  const acquired = acquireDeployLock(weddingId, triggeredBy);
  if (!acquired.acquired) {
    const heldBy = acquired.heldBy!;
    return {
      error: {
        status: 409,
        body: {
          error: 'DEPLOYMENT_IN_PROGRESS',
          message:
            'Un déploiement est déjà en cours pour ce mariage. Veuillez réessayer dans quelques minutes.',
          lockedBy: heldBy.triggeredBy,
          lockedAt: heldBy.startedAt,
          weddingId: heldBy.weddingId,
        },
      },
    };
  }

  try {
    const result = await fn();
    return { result };
  } finally {
    releaseDeployLock(weddingId);
  }
}
