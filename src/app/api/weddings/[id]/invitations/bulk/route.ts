export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { generateInvitationLinkToken } from '@/lib/guest-auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

// P2.2 — credit system + commercial gates
import {
  consumeCredit,
  hasSufficientCredits,
  InsufficientCreditsError,
} from '@/lib/credits';
// P2.9 — plan-level invitation quota (exported by plan-limits.ts)
import { checkInvitationLimit, getEntitlementOverride } from '@/lib/plan-limits';
// P2.8 — org-level invitation quota (added by another agent)
import { checkOrgInvitationLimit } from '@/lib/org-quotas';
// P2.3 — auto-generate an OrderItem for usage-based billing
import { meterInvitationUsage } from '@/lib/commercial';
// P2.4 — usage counter (added by another agent)
import { incrementUsage } from '@/lib/usage';

/**
 * POST /api/weddings/[id]/invitations/bulk
 *
 * Bulk-generate Invitation records for multiple guests in one call.
 *
 * Body: {
 *   guestIds: string[],      // list of guest IDs to generate invitations for
 *   channel?: 'QR'           // currently only QR is REAL; other channels are DEFER_EXTERNAL
 * }
 *
 * Response: {
 *   generated: [{ guest, invitation, invitationUrl, qrCodeUrl }],
 *   errors: [{ guestId, error }],
 *   summary: { total, success, failed }
 * }
 *
 * Tenant-scoped: all guestIds are verified against the current wedding via
 * tenantDb (auto-injected weddingId). Guests from other tenants are silently
 * skipped (counted as "not found" in errors — no cross-tenant leak).
 *
 * Auth: ORGANIZER+ only.
 *
 * Commercial gates (P2.x — enforced BEFORE generation):
 *   1. P2.6 Commercial Lock  : wedding.commercialStatus must be PAID/LIVE/COMPLETED
 *                              (or wedding must be the default demo wedding).
 *   2. P2.9 Plan quota       : checkInvitationLimit(weddingId, n) must pass.
 *   3. P2.8 Org quota        : checkOrgInvitationLimit(orgId, n) must pass
 *                              (when wedding belongs to an org).
 *   4. P2.2 Credit check     : hasSufficientCredits(weddingId, 'INVITATION', n)
 *                              must return sufficient=true.
 *
 * Post-generation hooks:
 *   5. P2.2 consumeCredit    : decrement wedding's INVITATION balance by the
 *                              number of invitations actually generated.
 *   6. P2.3 meterInvitationUsage : create an OrderItem for usage-based billing.
 *   7. P2.4 incrementUsage   : bump the wedding's INVITATIONS_SENT counter.
 *
 * Mission 4.0 Phase 6.2 — bulk generation with per-guest error isolation.
 * Mission 6.0 Phase P2    — commercial gates + credit consumption.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const { id: weddingId } = await params;
      if (weddingId !== ctx.weddingId) {
        return NextResponse.json({ error: 'Wedding mismatch' }, { status: 403 });
      }

      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Corps de requête invalide');

      const { guestIds, channel = 'QR' } = body as {
        guestIds?: string[];
        channel?: string;
      };

      if (!Array.isArray(guestIds) || guestIds.length === 0) {
        return badRequest('guestIds doit être un tableau non vide');
      }
      if (guestIds.length > 500) {
        return badRequest('Maximum 500 invités par lot (utilisez plusieurs appels)');
      }
      if (channel !== 'QR') {
        return NextResponse.json(
          { error: `Canal "${channel}" non supporté en génération automatique. QR est le seul canal REAL actuellement. WHATSAPP/EMAIL/SMS sont DEFER_EXTERNAL.` },
          { status: 400 }
        );
      }

      // ─── P2.x — Fetch wedding for commercial/quota/credit gates ──────────
      // tenantDb (wedding-scoped) returns the row that matches ctx.weddingId,
      // but we need the commercialStatus + organizationId + plan + isDefault
      // fields to run the gates below.
      const wedding = await tenantDb.wedding.findUnique({
        where: { id: ctx.weddingId },
        select: {
          id: true,
          commercialStatus: true,
          organizationId: true,
          isDefault: true,
          plan: true,
        },
      });
      if (!wedding) {
        return NextResponse.json({ error: 'Wedding not found' }, { status: 404 });
      }

      // ─── P2.6 — Commercial Lock gate ────────────────────────────────────
      // The wedding must be in a "paid" commercial state (PAID / LIVE /
      // COMPLETED) to send invitations. The default demo wedding (isDefault)
      // is exempt — it's the marketing site's public sandbox.
      const COMMERCIAL_UNLOCKED_STATES = new Set(['PAID', 'LIVE', 'COMPLETED']);
      if (
        !wedding.isDefault &&
        !COMMERCIAL_UNLOCKED_STATES.has(wedding.commercialStatus ?? '')
      ) {
        return NextResponse.json(
          {
            error:
              'Verrou commercial: le mariage doit être payé (PAID/LIVE/COMPLETED) pour envoyer des invitations',
            commercialStatus: wedding.commercialStatus,
          },
          { status: 402 }
        );
      }

      // ─── P2.9 — Plan-level invitation quota ──────────────────────────────
      // checkInvitationLimit counts SENT/DELIVERED/OPENED invitations (PENDING
      // don't count) and compares against the plan limit (or provisioned
      // Entitlement override). Returns { allowed, current, limit, plan }.
      const invitationQuota = await checkInvitationLimit(
        ctx.weddingId,
        guestIds.length
      );
      if (!invitationQuota.allowed) {
        return NextResponse.json(
          {
            error: `Quota d'invitations dépassé: ${invitationQuota.current}/${invitationQuota.limit} (plan: ${invitationQuota.plan})`,
            current: invitationQuota.current,
            limit: invitationQuota.limit,
            plan: invitationQuota.plan,
            additional: guestIds.length,
          },
          { status: 402 }
        );
      }

      // ─── P595B-P1-2 — Enforce BULK_INVITATIONS entitlement ──────────────
      // A wedding whose plan was downgraded (e.g. ESSENTIEL → TRIAL) after
      // provisioning must not be able to bulk-send invitations even if the
      // commercial lock is PAID/LIVE/COMPLETED. The BULK_INVITATIONS
      // entitlement is provisioned by provisionFromOrder() for ESSENTIEL+.
      // If the entitlement row is missing entirely (null), we fall back to
      // the legacy behavior (allow — the wedding predates entitlements).
      // If it is explicitly `false`, we reject with 402.
      const bulkEntitled = await getEntitlementOverride(ctx.weddingId, 'BULK_INVITATIONS');
      if (bulkEntitled === false) {
        return NextResponse.json(
          {
            error: 'Votre formule ne permet pas l\'envoi en masse d\'invitations. Passez à Essentiel ou supérieur.',
            entitlement: 'BULK_INVITATIONS',
          },
          { status: 402 }
        );
      }

      // ─── P2.8 — Org-level invitation quota (when wedding belongs to org) ─
      // Org-level quota is independent from per-wedding quota: an org may cap
      // total invitations across all its weddings (B2B2C contract).
      if (wedding.organizationId) {
        const orgQuota = await checkOrgInvitationLimit(
          wedding.organizationId,
          guestIds.length
        );
        if (!orgQuota.allowed) {
          return NextResponse.json(
            {
              error: `Quota d'invitations organisation dépassé: ${orgQuota.current}/${orgQuota.limit}`,
              organizationId: wedding.organizationId,
              current: orgQuota.current,
              limit: orgQuota.limit,
              additional: guestIds.length,
            },
            { status: 402 }
          );
        }
      }

      // ─── P2.2 — Credit sufficiency check (pre-consumption) ──────────────
      // We check BEFORE generation to fail fast and avoid creating invitations
      // that we'd then have to roll back. The actual consumption happens AFTER
      // the batch creation succeeds (in case some guests fail and we consume
      // fewer credits than requested).
      const creditCheck = await hasSufficientCredits(
        ctx.weddingId,
        'INVITATION',
        guestIds.length
      );
      if (!creditCheck.sufficient) {
        return NextResponse.json(
          {
            error: `Crédits insuffisants: ${creditCheck.available} invitations disponibles, ${creditCheck.required} requises. Achetez plus de crédits dans votre espace organisation.`,
            creditType: 'INVITATION',
            available: creditCheck.available,
            required: creditCheck.required,
          },
          { status: 402 }
        );
      }

      const weddingSlug = ctx.slug;
      const generated: Array<Record<string, unknown>> = [];
      const errors: Array<Record<string, unknown>> = [];

      // Fetch all guests in one query (tenant-scoped — auto-filtered by weddingId)
      const guests = await tenantDb.guest.findMany({
        where: { id: { in: guestIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          invitationCode: true,
          phone: true,
          email: true,
        },
      });
      const foundIds = new Set(guests.map((g) => g.id));

      // Guests in the request but not found (cross-tenant or non-existent)
      for (const gid of guestIds) {
        if (!foundIds.has(gid)) {
          errors.push({ guestId: gid, error: 'Guest not found in this wedding' });
        }
      }

      // Mission 6.0 P0.8 — fix N+1: fetch ALL existing QR invitations for the
      // found guests in ONE query (was 1 query/guest = 500 sequential queries).
      const existingInvitations = await tenantDb.invitation.findMany({
        where: { guestId: { in: guests.map((g) => g.id) }, channel: 'QR' },
        select: { id: true, guestId: true },
      });
      const existingByGuestId = new Map(existingInvitations.map((inv) => [inv.guestId, inv]));

      // Partition guests into "to create" and "to update" for batch operations.
      const toCreate: Array<{ weddingId: string; guestId: string; channel: string; recipient: string; status: string }> = [];
      const toUpdate: string[] = []; // invitation IDs to reset to PENDING
      for (const guest of guests) {
        const existing = existingByGuestId.get(guest.id);
        if (existing) {
          toUpdate.push(existing.id);
        } else {
          toCreate.push({
            weddingId: ctx.weddingId,
            guestId: guest.id,
            channel: 'QR',
            recipient: guest.email || guest.phone || `${weddingSlug}/${guest.invitationCode}`,
            status: 'PENDING',
          });
        }
      }

      // Batch create all missing invitations in ONE query (was 1 query/guest).
      let createdInvitations: Array<{ id: string; guestId: string }> = [];
      if (toCreate.length > 0) {
        createdInvitations = await tenantDb.invitation.createManyAndReturn({
          data: toCreate,
          select: { id: true, guestId: true },
        }) as Array<{ id: string; guestId: string }>;
      }

      // Batch update existing invitations to PENDING (single updateMany).
      if (toUpdate.length > 0) {
        await tenantDb.invitation.updateMany({
          where: { id: { in: toUpdate } },
          data: { status: 'PENDING', sentAt: null },
        });
      }

      // Build the response from the batch results.
      const allInvitationIds = new Map<string, string>(); // guestId → invitationId
      for (const inv of existingInvitations) {
        if (inv.guestId) allInvitationIds.set(inv.guestId, inv.id);
      }
      for (const inv of createdInvitations) {
        if (inv.guestId) allInvitationIds.set(inv.guestId, inv.id);
      }

      for (const guest of guests) {
        const invitationId = allInvitationIds.get(guest.id);
        if (!invitationId) {
          errors.push({ guestId: guest.id, error: 'Failed to create/update invitation' });
          continue;
        }
        const linkToken = generateInvitationLinkToken(guest.invitationCode);
        const invitationUrl = `/w/${weddingSlug}/?invite=${linkToken}`;
        const qrCodeUrl = `/api/guests/qrcode/${guest.invitationCode}?wedding=${weddingSlug}`;

        generated.push({
          guest: {
            id: guest.id,
            firstName: guest.firstName,
            lastName: guest.lastName,
            invitationCode: guest.invitationCode,
          },
          invitation: { id: invitationId, status: 'PENDING' },
          invitationUrl,
          qrCodeUrl,
        });
      }

      // ─── P2.2 — Consume credits for the actually-generated invitations ──
      // We consume AFTER the batch creation succeeds so we only charge for
      // invitations that were actually generated (not the requested count —
      // some guests may have failed the create/update step).
      //
      // Race-condition note: between the pre-check (hasSufficientCredits) and
      // this point, another concurrent request could have drained the balance.
      // If consumeCredit throws InsufficientCreditsError here, we return 402
      // BUT keep the already-created invitations (idempotency contract: the
      // client may retry without double-creating — see dedupe via existingByGuestId).
      //
      // P595B-P1 (Phase 1.6) — Track whether consumeCredit succeeded so we can
      // SKIP meterInvitationUsage below. Pre-paid Charow INVITATION_PACK credits
      // must NOT trigger a second, spurious Stripe Payment for the same
      // invitations. The legacy Stripe usage-billing path (meterInvitationUsage)
      // remains for weddings WITHOUT pre-paid credits.
      let creditsConsumed = false;
      if (generated.length > 0) {
        try {
          await consumeCredit({
            weddingId: ctx.weddingId,
            type: 'INVITATION',
            quantity: generated.length,
            note: `Bulk invitation generation (${generated.length} guests)`,
            createdBy: user.id,
          });
          // P595B-P1 — Consume succeeded → flag set so we skip meterInvitationUsage.
          creditsConsumed = true;
        } catch (e) {
          if (e instanceof InsufficientCreditsError) {
            logger.warn('Bulk invitation: credit race condition', {
              weddingId: ctx.weddingId,
              required: e.required,
              available: e.available,
              generated: generated.length,
            });
            return NextResponse.json(
              {
                error: `Crédits insuffisants après génération: ${e.available} disponibles, ${e.required} requises. Vos invitations ont été générées mais un paiement est dû.`,
                creditType: 'INVITATION',
                available: e.available,
                required: e.required,
                generated: generated.length,
              },
              { status: 402 }
            );
          }
          // Re-throw non-credit errors (DB corruption, etc.) to the outer catch.
          throw e;
        }

        // ─── P2.3 — Meter usage for billing (auto-generate OrderItem) ────
        // meterInvitationUsage creates an OrderItem on the wedding's active
        // CommercialOrder (or creates a new order if none exists). This is
        // usage-based billing: 1 invitation = $0.70 (PRICE_PER_INVITATION_USD_CENTS).
        //
        // P595B-P1 (Phase 1.6): Skip meterInvitationUsage when credits were
        // consumed (pre-paid Charow path). The legacy Stripe usage-billing
        // path remains for weddings without pre-paid credits — those weddings
        // would have thrown InsufficientCreditsError above (and we'd never
        // reach this branch) OR they don't use the credit system at all and
        // the credit balance stays at 0 with no InsufficientCreditsError.
        if (!creditsConsumed) {
          try {
            await meterInvitationUsage(ctx.weddingId, generated.length);
          } catch (e) {
            // Metering failure must NOT block the response — the invitations are
            // already created and credits consumed. Log + continue.
            logger.error('meterInvitationUsage failed (non-blocking)', {
              weddingId: ctx.weddingId,
              count: generated.length,
              errMessage: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // ─── P2.4 — Increment usage counter (dashboard stats) ───────────
        try {
          await incrementUsage(ctx.weddingId, 'INVITATIONS_SENT', generated.length);
        } catch (e) {
          logger.error('incrementUsage failed (non-blocking)', {
            weddingId: ctx.weddingId,
            metric: 'INVITATIONS_SENT',
            count: generated.length,
            errMessage: e instanceof Error ? e.message : String(e),
          });
        }
      }

      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'INVITATIONS_BULK_GENERATED',
        details: `Bulk generated ${generated.length} invitations (${errors.length} errors)`,
        request,
      });

      return NextResponse.json({
        success: true,
        generated,
        errors,
        summary: {
          total: guestIds.length,
          success: generated.length,
          failed: errors.length,
        },
      });
    });
  } catch (error) {
    logger.error('Bulk invitation generation error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
