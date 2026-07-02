// ══════════════════════════════════════════════════════════════════════════════
// Shared formatters — P2-CQ-3
// ══════════════════════════════════════════════════════════════════════════════
//
// Extracts the 5 duplicated formatters used across the platform admin UI
// (page.tsx, BillingTab.tsx, OnboardingTab.tsx). Before extraction:
//   - formatDate was defined 3× (with subtle format divergences — BillingTab
//     included hour+minute, page.tsx + OnboardingTab didn't).
//   - formatDateTime was defined 1× (only in page.tsx).
//   - toDateInput was defined 2× (page.tsx used `.toISOString().slice(0,10)`
//     which throws on Invalid Date; OnboardingTab had a NaN check).
//   - formatUsd was defined 2× (identical).
//   - formatFcfa was defined 2× (divergent — BillingTab computed inline,
//     OnboardingTab used usdCentsToFcfa helper).
//
// This module is the single source of truth. All formatters:
//   - Accept Date | string | null (and treat null/empty as 'no value')
//   - NEVER throw — invalid input returns the empty-marker ('—' for display,
//     '' for input-value formatters that need to populate <input value="…">)
//
// These helpers are pure (no Prisma, no next/server) so they're safe to import
// from both server and client components.

import { FCFA_TO_USD_RATE } from './billing';

// ─── Date / time ─────────────────────────────────────────────────────────────

/**
 * Format an ISO date string (or Date) as a short French date, e.g. "15 janv. 2025".
 * Returns '—' for null/undefined/empty/invalid input.
 */
export function formatDate(d: Date | string | null): string {
  if (d === null || d === undefined) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Format an ISO date string (or Date) as a French date+time, e.g.
 * "15/01/2025 14:30". Returns '—' for null/undefined/empty/invalid input.
 */
export function formatDateTime(d: Date | string | null): string {
  if (d === null || d === undefined) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Convert an ISO date string (or Date) to a value suitable for an
 * `<input type="date">`, e.g. "2025-01-15". Returns '' for
 * null/undefined/empty/invalid input (so the input renders empty, not the
 * literal string "Invalid Date").
 */
export function toDateInput(d: Date | string | null): string {
  if (d === null || d === undefined) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  try {
    return date.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

// ─── Money ───────────────────────────────────────────────────────────────────

/**
 * Format a USD amount (given in integer cents) as a USD string, e.g. 1999 → "$19.99".
 * Negative values render with a leading minus, e.g. -1999 → "-$19.99".
 */
export function formatUsd(cents: number): string {
  if (!Number.isFinite(cents)) return '$0.00';
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Format a USD amount (given in integer cents) as an FCFA string, e.g.
 * 1999 → "12 000 FCFA". Uses the fixed FCFA_TO_USD_RATE (1 USD ≈ 600 FCFA).
 */
export function formatFcfa(cents: number): string {
  if (!Number.isFinite(cents)) return '0 FCFA';
  const usd = cents / 100;
  const fcfa = Math.round(usd * FCFA_TO_USD_RATE);
  return `${fcfa.toLocaleString('fr-FR')} FCFA`;
}
