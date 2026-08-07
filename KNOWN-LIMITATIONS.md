# AENEWS Wedding OS — Known Limitations

**RC-3.0 (post-consolidation)** | 2026-07

> Honest inventory of what is DEFER / PARTIAL / FUTURE / NON-BLOCKING
> after CONS-1 through CONS-7. Items that have been **resolved** by the
> consolidation are listed in §5 (no longer limitations).

---

## 1. DEFER_EXTERNAL (require third-party provider, not in RC scope)

1. **Invitation delivery channels** — SMS, Email, WhatsApp sending is not
   automated. The `Invitation` model tracks `channel` + `status`, but no
   provider (Twilio, SendGrid, WhatsApp Business API) is connected. QR +
   LINK channels are REAL (generated locally). Bulk generation creates
   the Invitation rows + URLs; delivery is manual (export + send via
   external tool).

2. **Payment automation (Stripe)** — `Subscription.stripeCustomerId` and
   `Invoice.stripeInvoiceId` columns exist but are unused. Billing is
   manual (WhatsApp-negotiated price → admin marks invoice PAID). Stripe
   migration is a future opt-in.

3. **Email provider (password reset)** — The password-reset flow no
   longer leaks the reset URL in the HTTP response body (CONS-2 fix C5),
   but the actual email delivery is still a structured-logger stub. To
   make password reset work in production, a real provider (Resend /
   Postmark / SES) must be wired via `SMTP_*` env vars. Until then,
   reset tokens are logged server-side and must be hand-delivered.

---

## 2. PARTIAL (data model ready, renderer/UI incomplete)

4. **Event OS terminology** — `src/lib/event-types.ts` defines
   `EventType` (WEDDING/BIRTHDAY/CONFERENCE/CORPORATE/PRIVATE_EVENT) with
   per-type labels. The renderer does not yet consume these labels
   everywhere (some components still hardcode "bride"/"groom"). Full
   event-type rendering is a future iteration. The data model is ready
   (Settings key=`event_type`).

5. **GuestManager family/group selectors** — The `Guest.familyId` and
   `Guest.groupId` FKs (added in CONS-5) are nullable columns in the
   schema. The `FamiliesManager` and `GroupsManager` tab components
   display member counts via `_count.guests`, but the existing
   `GuestManager.tsx` (1104 lines) was NOT modified to expose family /
   group `<select>` inputs in its create/edit dialog. Future work: add
   2 selectors in the guest dialog so an organizer can attach a guest
   to a family + a group at create/update time. The counters will then
   reflect actual assignments.

6. **EventTimeline vs ProgramItem overlap** — Two tenant-scoped models
   coexist with similar shapes:
   - `EventTimeline` (time, activity, location, description, icon, order) —
     used by the "Chronologie" tab (renamed in CONS-5 to disambiguate);
     represents the couple's story / chronological narrative.
   - `ProgramItem` (title, scheduledAt, location, description, iconName,
     sortOrder) — used by the "Programme du jour" tab (new in CONS-5);
     represents the day-of-event schedule (ceremony → cocktail → dîner →
     soirée).

   The UI distinguishes them via labels, but a future migration could
   either merge the two models or formalize the distinction (e.g.
   `EventTimeline.kind = STORY | PROGRAM`). For now they coexist —
   no data is duplicated, but the schema has redundant concepts.

7. **Designer section reordering** — The `DesignerTab` UI allows
   enable/disable of sections + theme overrides. Drag-to-reorder is
   wired in the API (`PUT /api/weddings/[id]/design` accepts `sections`
   array with `order` field) but the drag UI is basic. Reordering works
   but is not polished.

---

## 3. FUTURE (post-RC vision, no implementation yet)

8. **AI automation engines** — `src/engines/{ai,analytics,automation,marketplace}`
   contain only TypeScript interfaces (types). No concrete
   implementations. Reserved for the post-RC AI-assisted configuration
   vision.

9. **Custom domain DNS automation** — The middleware resolves custom
   domains (`/api/resolve-domain`), but DNS record setup is manual. A
   self-service domain connection flow (like Vercel's) is future work.

10. **PostgreSQL migration** — The DB is SQLite (file-based, single-writer).
    For a true multi-tenant SaaS at scale (>100 concurrent organizers),
    PostgreSQL is required (row-level locking, JSONB, full-text search).
    The Prisma schema is provider-agnostic — only `DATABASE_URL` needs
    to change + a migration run. P3 (long-term).

11. **Stripe billing** — `Subscription.stripeCustomerId` and
    `Invoice.stripeInvoiceId` columns are reserved but unused (see §1.2).
    Wiring Stripe is a P3 opt-in.

12. **Prisma enums** — All statuses/roles/plans are `String` with values
    in comments (audit finding H18). Migration to Prisma enums would
    eliminate silent typos and centralize valid values. P2 (medium-term).

---

## 4. NON-BLOCKING (operational caveats, no functional impact)

13. **Docker rebuild required for new routes** — The `wedding-app`
    container is built from a Docker image baked at a specific git SHA.
    New API routes + tab components added by CONS-5 (client backend) and
    CONS-6 (deployment pipeline) are in the source tree on the VPS at
    `/opt/wedding-platform/` but **not yet active in the running
    container** until a rebuild:
    ```bash
    docker compose -f docker-compose.prod.yml build wedding-app
    docker compose -f docker-compose.prod.yml up -d wedding-app
    ```
    Until the rebuild, `curl /api/weddings/<id>/families` returns 404 on
    the container (but `npx tsc --noEmit` passes on the source).

14. **Three test events** — `world-a-royal`, `world-b-minimal`,
    `world-c-immersive` exist in production as live demonstrations of
    the Three Worlds proof. They are PUBLISHED but contain no real
    guest data. Classification: KEEP_AS_DEMO. A future "Demo Gallery"
    feature could surface them publicly.

15. **Redis optional** — `ioredis` is installed but `docker-compose.yml`
    has no redis service. When `REDIS_URL` is unset, the rate limiter
    falls back to in-memory (single-instance only). For multi-replica
    deployments, add a redis service + set `REDIS_URL`. P1 (short-term).

16. **`socket.io` + `socket.io-client` dead deps** — Installed in
    `package.json` but 0 usage in `src/` (audit finding H19). The
    `mini-services/` directory is empty. Either implement real-time
    features (e.g. live check-in dashboard) or remove the deps. P1.

---

## 5. RESOLVED by CONS-1 → CONS-7 (no longer limitations)

The following items were listed as limitations in RC-2.0 and have been
**resolved** by the consolidation work. They are documented here for
historical context only.

| Item | RC-2.0 status | RC-3.0 resolution |
|---|---|---|
| Penpot iframe integration | PARTIAL (no auto-import pipeline) | **REMOVED** — Penpot files purged in CONS-1 (34 files + 4 dirs). The platform no longer pretends to integrate Penpot. |
| `deploy-*.mjs` / `vps-*.mjs` legacy scripts | NON-BLOCKING (archived in `archive/`) | **REMOVED** — All 31+ credential-bearing deploy scripts deleted in CONS-1. Canonical deploy is GitHub Actions + `docker compose build`. |
| `seed.ts` racine (dangerous `deleteMany()`) | NON-BLOCKING | **REMOVED** — Root `seed.ts` deleted (Phase 1, commit 56590dd). Only `prisma/seed.ts` remains, idempotent + tenant-aware (CONS-2 fix C8). |
| `init-db.js` legacy SQL drift | NON-BLOCKING | **REMOVED** — `init-db.js` deleted. `docker-entrypoint.sh` now uses `prisma migrate deploy` + `prisma db push` fallback only. |
| `ENCRYPTION_KEY` fallback to `JWT_SECRET` | (security, not listed in RC-2.0) | **FIXED** (CONS-2 fix C3) — `src/lib/guest-auth.ts` no longer falls back. Fail-hard in prod if missing or equal to `JWT_SECRET`. |
| `GuestSession.token` plaintext at rest | (security, not listed in RC-2.0) | **FIXED** (CONS-2 fix H16) — Now SHA-256 hashed (same pattern as `PasswordResetToken`). |
| Password-reset URL leak in dev/demo | (security, not listed in RC-2.0) | **FIXED** (CONS-2 fix C5) — Reset URL is never returned in the HTTP body. Email delivery is still a stub (see §1.3 above). |
| Rate-limiting coverage | (security, not listed in RC-2.0) | **EXTENDED** (CONS-2) — login/2FA/reset/mutations/deployments now rate-limited. ~80 routes still unprotected — P1. |
| `platform/admin/page.tsx` god component (2655 lines) | (architecture, not listed in RC-2.0) | **REFACTORED** (CONS-3) — 584-line shell + 10 dynamic tab imports (4 platform + 6 Production Studio). |
| Deployment pipeline (none) | (not listed in RC-2.0) | **ADDED** (CONS-6) — 9-stage pipeline, `publishedConfigJson` snapshot, 4 API routes, `DeploymentsPanel` UI, render path wired. |
| Client backend missing families/groups/gifts/program/stats/qrcodes | (not listed in RC-2.0) | **ADDED** (CONS-5) — 6 new tabs + 9 new API routes + 4 new Prisma models (Family, GuestGroup, Gift, ProgramItem). |

---

## 6. REMAINING TODOs (post-CONS-7)

Ordered by priority:

### P1 — court terme (1-2 sprints)

- Wire a real email provider (Resend / Postmark / SES) for password-reset
  delivery (§1.3).
- Add Redis service to `docker-compose.prod.yml` for distributed
  rate-limiting (§4.15).
- Remove `socket.io` + `socket.io-client` dead deps or implement
  real-time features (§4.16).
- Add `familyId` / `groupId` selectors to `GuestManager.tsx` create/edit
  dialog (§2.5).
- Extend rate-limiting to the ~80 currently unprotected routes (audit H15).
- Extend 2FA TOTP to `ORGANIZER` / `CONTROLLER` / `RECEPTION` roles
  (audit H1).

### P2 — moyen terme (3-6 sprints)

- Introduce Vitest + tests on tenant isolation, auth, CSRF, collections,
  billing, deployment pipeline.
- Migrate `String` statuses/roles/plans to Prisma enums (audit H18).
- Extract business logic from route handlers into a `services/` layer
  (audit §3.2).
- CSP with nonces (remove `unsafe-inline` script-src, audit H9).
- Magic-byte check on uploads (audit H7) + size limit on import-docx
  (audit H6).
- Merge or formalize `EventTimeline` vs `ProgramItem` (§2.6).

### P3 — long terme (vision)

- Migrate SQLite → PostgreSQL (§3.10).
- Wire Stripe billing (§3.11).
- Migrate `Wedding` → `Event` model (§9 of `ARCHITECTURE-CANONICAL.md`).
- Implement AI automation engines (§3.8).
- Custom domain DNS automation (§3.9).
