// ══════════════════════════════════════════════════════════════════════════════
// UI labels & badge classes — P2-CQ-13 + P2-CQ-14 + P2-CQ-4
// ══════════════════════════════════════════════════════════════════════════════
//
// Centralises the wedding-status / plan / role display metadata that was
// previously duplicated across:
//   - src/app/platform/admin/page.tsx:102-268  (ROLE_LABELS, STATUS_LABELS,
//     STATUS_BADGE_CLASS, PLAN_BADGE_CLASS, ROLE_BADGE_CLASS, PLANS,
//     WEDDING_STATUSES — all 7 const declarations inline)
//   - src/lib/auth.ts:284-290  (ROLE_LABELS, getRoleLabel)
//   - src/app/platform/admin/BillingTab.tsx + OnboardingTab.tsx  (PLANS array)
//
// This module is the SINGLE source of truth. Components import from here;
// `@/lib/auth` re-exports ROLE_LABELS + getRoleLabel for backwards-compat
// with existing imports (P2-CQ-21).
//
// NOTE on types: the task spec said to use `WeddingStatus | Plan | Role` types
// from `@prisma/client`. The Prisma schema stores these as plain String
// columns (no enums), so the generated client does NOT export them as types.
// The canonical types live in `@/lib/types` — we import from there.
//
// Pure module — no Prisma, no next/server, safe for both server + client.

import type { Plan, Role, WeddingStatus } from './types';

// ─── Wedding status ──────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<WeddingStatus, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  COMPLETED: 'Terminé',
  ARCHIVED: 'Archivé',
  SUSPENDED: 'Suspendu',
};

// Tailwind badge classes — dark-luxury palette matching the existing
// platform/admin UI (page.tsx:247-253). Stable class names so the JIT
// compiler picks them up.
export const STATUS_BADGE_CLASS: Record<WeddingStatus, string> = {
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  DRAFT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  COMPLETED: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  SUSPENDED: 'bg-red-500/15 text-red-400 border-red-500/30',
};

/** Ordered list of all wedding statuses — use for UI iteration (filters, dropdowns). */
export const WEDDING_STATUS_LIST: WeddingStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'COMPLETED',
  'ARCHIVED',
  'SUSPENDED',
];

// ─── Plan ────────────────────────────────────────────────────────────────────

// NOTE: Plan type is 'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE' (from @/lib/types).
// There is no 'BASIC' plan in this codebase. The labels below match the
// existing PLAN_METADATA.label values for consistency.
export const PLAN_LABELS: Record<Plan, string> = {
  TRIAL: 'Essai Libre',
  ESSENTIEL: 'Essentiel',
  PREMIUM: 'Premium',
  ELITE: 'Élite',
};

// Tailwind badge classes — matches page.tsx:255-260.
export const PLAN_BADGE_CLASS: Record<Plan, string> = {
  ELITE: 'bg-gold/15 text-gold border-gold/40',
  PREMIUM: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ESSENTIEL: 'bg-gold-dark/15 text-gold-dark border-gold-dark/30',
  TRIAL: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

/** Ordered list of plans (low → high tier). Use for UI iteration. */
export const PLAN_LIST: Plan[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'];

// ─── Role ────────────────────────────────────────────────────────────────────

// Labels match the existing ROLE_LABELS in src/lib/auth.ts (lines 284-290).
// Kept identical for backwards-compat — UI consumers (UserManager,
// platform/admin/page.tsx) rely on these exact strings.
export const ROLE_LABELS: Record<Role, string> = {
  PLATFORM_ADMIN: 'Administrateur Plateforme',
  SUPER_ADMIN: 'Super Admin',
  ORGANIZER: 'Organisateur',
  RECEPTION: 'Réception',
  CONTROLLER: 'Contrôleur',
};

// Tailwind badge classes — matches page.tsx:262-268. SUPER_ADMIN shares the
// gold style with PLATFORM_ADMIN (both are platform-level roles).
export const ROLE_BADGE_CLASS: Record<Role, string> = {
  PLATFORM_ADMIN: 'bg-gold/15 text-gold border-gold/40',
  SUPER_ADMIN: 'bg-gold/15 text-gold border-gold/40',
  ORGANIZER: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  RECEPTION: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  CONTROLLER: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

/**
 * Get the French display label for a role. Falls back to the raw role string
 * if unknown (e.g. a new role not yet in ROLE_LABELS) — never returns
 * `undefined`, so it's safe to spread into JSX.
 *
 * Backwards-compat shim: previously lived in `@/lib/auth`. Re-exported from
 * there; new code should import from `@/lib/ui-labels` directly.
 */
export function getRoleLabel(role: string): string {
  // Cast through `as Role` after the lookup so we don't change the runtime
  // behaviour (Record<Role, string> indexing with a non-Role string returns
  // undefined at runtime in TS-strict mode, but we want the fallback).
  if (Object.prototype.hasOwnProperty.call(ROLE_LABELS, role)) {
    return ROLE_LABELS[role as Role];
  }
  return role;
}
