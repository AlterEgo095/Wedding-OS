/**
 * Shared wedding lifecycle helpers (Phase 3 ÉTAPE 6 — extracted from
 * /api/platform/weddings/[id]/route.ts to be reused by /api/onboarding/publish
 * and any other route that needs to validate wedding status transitions).
 *
 * P5.1 — Added UNPUBLISHED state (reversible unpublish without data loss).
 *
 * Lifecycle:
 *   DRAFT       → PUBLISHED, ARCHIVED
 *   PUBLISHED   → COMPLETED, SUSPENDED, UNPUBLISHED, ARCHIVED
 *   UNPUBLISHED → PUBLISHED, DRAFT, ARCHIVED   (P5.1 — reversible)
 *   COMPLETED   → ARCHIVED
 *   SUSPENDED   → PUBLISHED, ARCHIVED
 *   ARCHIVED    → DRAFT, PUBLISHED   (un-archive)
 *
 * Same-status transitions (e.g. PUBLISHED → PUBLISHED) are always allowed —
 * they are idempotent no-ops, not real transitions.
 *
 * UNPUBLISHED vs SUSPENDED vs ARCHIVED:
 *   UNPUBLISHED — Super Admin intentionally takes the wedding offline (reversible).
 *                 Frontend shows 410 Gone. Data preserved. Admin access preserved.
 *   SUSPENDED   — System/billing suspension (non-payment, ToS violation). Reversible.
 *                 Frontend shows holding page. Data preserved. Admin access preserved.
 *   ARCHIVED    — Wedding day has passed, event is closed. Data preserved for memorial.
 *                 Frontend shows "Souvenirs archivés". Admin access preserved.
 */

import type { WeddingStatus } from '@/lib/types';

/** Canonical list of valid wedding statuses (6 — includes UNPUBLISHED from P5.1). */
export const VALID_STATUSES: WeddingStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'UNPUBLISHED',
  'COMPLETED',
  'ARCHIVED',
  'SUSPENDED',
];

/**
 * Allowed status transitions. Same-status transitions are always allowed
 * (handled in `isValidTransition`).
 *
 * P5.1: Added UNPUBLISHED state with reversible transitions:
 *   PUBLISHED → UNPUBLISHED  (unpublish without deleting data)
 *   UNPUBLISHED → PUBLISHED   (re-publish)
 *   UNPUBLISHED → DRAFT       (reset to draft for reconfiguration)
 *   UNPUBLISHED → ARCHIVED    (archive after unpublish)
 */
export const VALID_TRANSITIONS: Record<string, WeddingStatus[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['COMPLETED', 'SUSPENDED', 'UNPUBLISHED', 'ARCHIVED'],
  UNPUBLISHED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  SUSPENDED: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT', 'PUBLISHED'],
};

/**
 * Returns true if `from → to` is a valid status transition.
 * Same-status transitions are always allowed (idempotent no-ops).
 * Unknown source states are denied by default.
 */
export function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to as WeddingStatus);
}

/**
 * Returns the list of allowed target statuses for a given source status.
 * Empty array for unknown source states.
 */
export function getAllowedTransitions(from: string): WeddingStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}

/**
 * Type guard: returns true if the value is a valid WeddingStatus.
 */
export function isValidStatus(value: string): value is WeddingStatus {
  return VALID_STATUSES.includes(value as WeddingStatus);
}
