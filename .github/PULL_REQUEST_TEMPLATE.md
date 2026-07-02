# Pull Request Template — Wedding Platform

> **Reviewer hint:** The repo carries a known pre-existing baseline of
> **61 lint errors** and **~65 TypeScript errors** inherited from the P0→P1
> migration (see worklog `P1P2-FINAL` Stage Summary). The goal of CI is to
> prevent NEW errors from landing, not to fix all historical debt. When
> reviewing, focus on whether this PR **introduces** new errors rather than
> whether the overall count drops to zero.

## Summary

<!-- 1–3 sentences: what does this PR change and why? -->

## Related issues / worklog

<!-- e.g. P1-SEC-14, P2-CQ-9. Cite the worklog task ID if applicable. -->

## Pre-merge checklist — tick ALL before requesting review

- [ ] `bun run lint` — no NEW errors introduced (baseline: 61 problems)
- [ ] `bunx tsc --noEmit` — no NEW errors introduced (baseline: ~65 errors)
- [ ] `bun run verify` — runs lint + tsc + prisma migrate diff locally (optional but recommended for infra/DB PRs)
- [ ] If `prisma/schema.prisma` was modified: a new migration was created with
      `bunx prisma migrate dev --name <descriptive>` AND `bunx prisma migrate diff`
      reports zero drift. **A schema change without a migration is a hard
      blocker** — the `migrate-check` CI job will fail.
- [ ] Tested the affected route(s) in the browser (dev server on `:3000`)
- [ ] No new `console.log` / `console.error` — use the structured `logger`
      from `@/lib/logger` (P2-SEC-1)
- [ ] No new raw `await request.json()` without `.catch(() => null)` (P2-CQ-6)
- [ ] No secrets / API keys / connection strings committed
- [ ] Backwards-compatible — no breaking change to an existing API contract
      (if breaking, mark this PR as such and document the migration path)

## Post-merge checklist (for the merge author)

- [ ] CI on `main` is green (lint-typecheck, build, migrate-check, docker-build)
- [ ] If this PR is destined for production: trigger the
      [`Deploy (production)` workflow](../../actions/workflows/deploy.yml)
      manually with the SHA of the merge commit.
- [ ] After the deploy: verify `https://heureuxmariage.aenews.net/api/health`
      returns `{"status":"ok"}` and tail `docker logs wedding-app` for 30s
      to catch any boot-time errors.

## What's NOT in this PR

<!-- Optional: call out follow-up work that's intentionally deferred, with a
     worklog task ID or GitHub issue so it isn't lost. -->
