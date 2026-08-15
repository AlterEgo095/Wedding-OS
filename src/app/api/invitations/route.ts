// ══════════════════════════════════════════════════════════════════════════════
// /api/invitations/route.ts — 5.8.18 P2-2 API CONTRACT UNIFICATION
// ══════════════════════════════════════════════════════════════════════════════
//
// CANONICAL API MAPPING (5.8.18):
// ─────────────────────────────────────────────────────────────
// Concern                         | Canonical route              | Status
// ────────────────────────────────|──────────────────────────────|──────────
// Public design template catalog  | /api/collections             | CANONICAL
// Admin invitation CRUD           | /api/platform/invitations    | CANONICAL
// Admin design template CRUD      | /api/platform/collections    | CANONICAL
// Admin theme CRUD                | /api/platform/themes         | CANONICAL
// Admin template CRUD             | /api/platform/templates      | CANONICAL
// Public theme apply              | /api/theme/apply-template    | CANONICAL
// Wedding-scoped invitations      | /api/weddings/[id]/invitations | CANONICAL
//
// DEPRECATED ALIASES (5.8.18):
//   /api/invitations  →  alias of /api/collections (this file)
//     Rationale: non-technical users and developers expect invitation
//     templates under "/api/invitations". The actual canonical store is
//     /api/collections (the design template catalog). This alias proxies
//     both GET (list) and POST (create) to the canonical handlers so
//     clients can use either URL. No transformation, no behavior change.
//
// LEGACY (do not use in new code):
//   /api/design/*  →  removed (was 404). Use /api/collections or
//                      /api/platform/themes instead.
// ══════════════════════════════════════════════════════════════════════════════

export { GET, POST } from '@/app/api/collections/route';
