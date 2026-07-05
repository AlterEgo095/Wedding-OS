# AENEWS Wedding OS — Known Limitations

**RC-2.0** | 2026-07-05

---

## DEFER_EXTERNAL (require third-party provider, not in RC scope)

1. **Invitation delivery channels** — SMS, Email, WhatsApp sending is not
   automated. The `Invitation` model tracks `channel` + `status`, but no
   provider (Twilio, SendGrid, WhatsApp Business API) is connected. QR + LINK
   channels are REAL (generated locally). Bulk generation creates the
   Invitation rows + URLs; delivery is manual (export + send via external tool).

2. **Payment automation (Stripe)** — `Subscription.stripeCustomerId` and
   `Invoice.stripeInvoiceId` columns exist but are unused. Billing is manual
   (WhatsApp-negotiated price → admin marks invoice PAID). Stripe migration is
   a future opt-in.

3. **Penpot design import** — The runtime does NOT depend on Penpot (correct
   per vision §7). `PenpotStudio` iframe embed works for design preview, but
   there is no automated "Penpot frame → Collection manifest" pipeline. New
   Collections are created via the Collection Factory CRUD API.

## PARTIAL

4. **Event OS terminology** — `src/lib/event-types.ts` defines
   `EventType` (WEDDING/BIRTHDAY/CONFERENCE/CORPORATE/PRIVATE_EVENT) with
   per-type labels. The renderer does not yet consume these labels everywhere
   (some components still hardcode "bride"/"groom"). Full event-type rendering
   is a future iteration. The data model is ready (Settings key=`event_type`).

5. **Designer section reordering** — The `DesignerTab` UI allows
   enable/disable of sections + theme overrides. Drag-to-reorder is wired in
   the API (`PUT /api/weddings/[id]/design` accepts `sections` array with
   `order` field) but the drag UI is basic. Reordering works but is not
   polished.

## FUTURE

6. **AI automation engines** — `src/engines/{ai,analytics,automation,marketplace}`
   contain only TypeScript interfaces (types). No concrete implementations.
   Reserved for the post-RC AI-assisted configuration vision.

7. **Custom domain DNS automation** — The middleware resolves custom domains
   (`/api/resolve-domain`), but DNS record setup is manual. A self-service
   domain connection flow (like Vercel's) is future work.

## NON-BLOCKING

8. **Legacy deploy scripts** — 20+ `deploy-*.mjs` scripts exist at the repo
   root (pre-Mission-4.0 artifacts). They are archived in
   `archive/legacy-deploy-scripts/` and do not affect the build (excluded by
   `.dockerignore`). The canonical deploy script is
   `scripts/deploy-production.sh`.

9. **Three test events** — `world-a-royal`, `world-b-minimal`,
   `world-c-immersive` exist in production as live demonstrations of the
   Three Worlds proof. They are PUBLISHED but contain no real guest data.
   Classification: KEEP_AS_DEMO. A future "Demo Gallery" feature could
   surface them publicly.
