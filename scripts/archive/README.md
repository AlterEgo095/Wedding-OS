# Archived Deploy Scripts

This folder contains **legacy deploy scripts** kept for historical reference only.
**They are no longer used.**

## What's here

- **26 `deploy-*.mjs` files** — original SFTP/SSH-based deploy scripts (Phase 1–6 era).
- **4 `vps-*.mjs` files** — VPS inspection / fix / log scripts (Phase 6 era).
- **5 `fix-vps-*.mjs` files** — one-shot VPS database / Prisma / settings fixers.
- **1 `check-rebuild.mjs`** — pre-deploy sanity check.
- **23 `deploy-*.cjs` files** — Phase 8 / VPS deploy scripts (superseded).

## Why they were archived

These scripts were the manual deploy pipeline used during early development
(Phase 1 through Phase 8). They have been **superseded by the CI/CD pipeline**
in `.github/workflows/`, which is now the **production deploy path**.

Keeping them here for:
- Historical reference (understanding what was tried).
- Emergency manual fallback if CI/CD is ever down (use with caution — they
  reference old env vars and may not work against the current schema).

## Do NOT run these in production

Running these scripts directly against the production VPS may:
- Bypass the migration baseline (`prisma/migrations/0_init/`).
- Trigger `prisma db push --accept-data-loss` (destructive).
- Re-introduce bugs that were fixed in CI/CD.

If you need to deploy manually, follow the procedure in `docs/BACKUP.md` and
`.github/workflows/` instead.
