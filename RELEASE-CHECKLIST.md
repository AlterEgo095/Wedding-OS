# AENEWS Wedding OS — Release Candidate 2.0

**Date**: 2026-07-05
**Canonical base**: `642169f` → (post Mission 4.0) final SHA
**Status**: Release Candidate

---

## 1. CANONICAL SOURCE

The single source of truth is **GitHub `main`**:
```
https://github.com/AlterEgo095/Wedding-OS.git
```

The VPS (`/opt/wedding-platform`) is a deployment of GitHub main. No critical
work exists only on the VPS.

## 2. PROVENANCE CHAIN

```
GitHub main SHA
  = VPS HEAD (git)
  = Docker image DEPLOY_SHA (build arg)
  = Container runtime deploySha (/api/health)
```

Verify at any time:
```bash
curl https://wedding.aenews.store/api/health | jq .deploySha
git rev-parse HEAD  # on VPS
```

## 3. REPRODUCIBILITY

From a clean environment:
```bash
git clone https://github.com/AlterEgo095/Wedding-OS.git
cd Wedding-OS
cp .env.example .env  # fill in secrets
docker compose -f docker-compose.prod.yml up -d --build
# → container runs, DB created, migrations applied, seed runs
```

No manual `ALTER TABLE` required. The `draftManifest` column is part of
migration `1_add_draft_manifest`.

## 4. FUNCTIONAL STATUS

| Function | Status | Notes |
|---|---|---|
| Multi-tenant isolation | REAL | fail-closed Prisma extension |
| Wedding CRUD | REAL | platform admin + onboarding wizard |
| Guests + import | REAL | CSV/DOCX import, categories, RSVP |
| Tables | REAL | drag-and-drop, capacity |
| QR codes | REAL | AES-256-GCM tokens |
| RSVP | REAL | plus-one support |
| Guest space | REAL | auth by code, access logs |
| Collections | REAL | 12 seeded, 5 layouts |
| Collection Factory | REAL | CRUD via API |
| Manifest engine | REAL | Collection → Binding → Renderer |
| Designer | REAL | save/preview/publish draft manifest |
| Platform Ops | REAL | /platform/ops dashboard |
| Billing (manual) | REAL | WhatsApp flow, invoices |
| Custom domains | REAL | middleware resolution |
| Invitation single | REAL | POST /api/guests/[id]/invitation |
| Invitation bulk | REAL | POST /api/weddings/[id]/invitations/bulk |
| Check-in QR | REAL | POST /api/check-in (cross-tenant safe) |
| Event OS abstraction | PARTIAL | EventType config + terminology (additive) |
| Invitation delivery (SMS/Email/WA) | DEFER_EXTERNAL | no provider connected |
| Penpot import | DEFER_EXTERNAL | runtime does not depend on Penpot |
| Billing automation (Stripe) | DEFER_EXTERNAL | columns reserved, inactive |
| AI automation engines | FUTURE | only types defined |

## 5. KNOWN LIMITATIONS

See `KNOWN-LIMITATIONS.md`.

## 6. RECOVERY

See `RECOVERY.md`.
