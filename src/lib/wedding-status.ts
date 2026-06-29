/**
 * Shared wedding lifecycle helpers (Phase 3 ÉTAPE 6 — extracted from
 * /api/platform/weddings/[id]/route.ts to be reused by /api/onboarding/publish
 * and any other route that needs to validate wedding status transitions).
 *
 * ADDITIVE ONLY — extracted 1:1 from the existing implementation in
 * /api/platform/weddings/[id]/route.ts (lines 25-61). Zero behavior change.
 *
 * Lifecycle (Phase 3 ÉTAPE 5 — commercial lifecycle):
 *   DRAFT      → PUBLISHED, ARCHIVED
 *   PUBLISHED  → COMPLETED, SUSPENDED, ARCHIVED
 *   COMPLETED  → ARCHIVED
 *   SUSPENDED  → PUBLISHED, ARCHIVED
 *   ARCHIVED   → DRAFT, PUBLISHED   (un-archive)
 *
 * Same-status transitions (e.g. PUBLISHED → PUBLISHED) are always allowed —
 * they are idempotent no-ops, not real transitions.
 *
 * TERMINATED is NOT used — COMPLETED is the business term for "wedding day has
 * passed and the event is closed". ARCHIVED is for administrative hiding
 * (e.g. cancelled contracts, test weddings). SUSPENDED is for non-payment or
 * ToS violation (reversible).
 */

import type { WeddingStatus } from '@/lib/types';

/** Canonical list of valid wedding statuses (5 — includes COMPLETED from ÉTAPE 5). */
export const VALID_STATUSES: WeddingStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'COMPLETED',
  'ARCHIVED',
  'SUSPENDED',
];

/**
 * Allowed status transitions. Same-status transitions are always allowed
 * (handled in `isValidTransition`).
 *
 * This matrix is a SUPERSET of every transition the previous (pre-ÉTAPE 5)
 * code allowed — no regression.
 */
export const VALID_TRANSITIONS: Record<string, WeddingStatus[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['COMPLETED', 'SUSPENDED', 'ARCHIVED'],
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
