# Deploy Scripts — Archived

**Status (P1-CQ-3c, 2025):** All `deploy-*.mjs` (root) and `deploy-*.cjs` (scripts/)
have been moved to `scripts/archive/`.

## Why archive?

These 49 scripts were one-shot VPS / Phase 8 deployment helpers used during the
initial launch of the AENEWS Wedding Platform. They were never wired into CI,
they all use Node `require()` (which the ESLint config flags as an error), and
they hardcode hostnames / SSH paths that no longer match the current
infrastructure.

Keeping them in the active tree caused:
- 26 `@typescript-eslint/no-require-imports` lint errors (about 40% of the
  project's pre-existing baseline).
- Confusion for new contributors ("which deploy script do I run?").
- Stale documentation pointing to scripts that don't work.

## What's still active

Only the runtime + maintenance scripts remain in `scripts/`:

| Script | Purpose |
| --- | --- |
| `dev-watchdog.sh` | Restarts the dev server on file changes. |
| `migrate-guests.mjs` | One-shot guest data migration. |
| `migrate-phase1.ts` | Phase 1 schema migration. |
| `migrate-phase3-roles.ts` | Phase 3 role reassignment. |
| `migrate-phase8-db.cjs` | Phase 8 DB backfill. |
| `phase6-verify.sh` | Phase 6 sanity check. |
| `test-isolation.ts` | Tenant isolation test. |
| `test-phase8-prod.cjs` | Phase 8 production smoke test. |
| `test-tenant-extension.ts` | Tenant extension test. |
| `vps-state-check.cjs` | VPS state inspection. |
| `fix-admin-weddingid.cjs` | One-shot admin weddingId fix. |

## Need an old deploy script?

The archive is preserved at `scripts/archive/`. You can copy a script back into
the active tree if you need to re-run it, but please update it to use ESM
imports + the current SSH hostnames first.
