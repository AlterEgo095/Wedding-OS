export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { buildCoupleLabel, type Plan, type WeddingStatus } from '@/lib/types';
// 5.8.17 Phase 3 Fix 1 — use the ASYNC invalidateWeddingCache (awaits
// revalidateTag) so UNPUBLISH/DELETE also bust the L2 unstable_cache
// reliably. The SYNC version in tenant-context.ts uses fire-and-forget
// import('next/cache').then(...) which does NOT reliably bust L2 before
// the HTTP response is sent (5-min staleness window observed in Phase 3).
import { invalidateWeddingCache } from '@/lib/wedding/cache';
// P5.2-2 (PRE-P5.X-AUDIT-B, HIGH-4): DNS verification for custom domains.
import { buildDnsVerificationRecord } from '@/lib/custom-domains';
import { buildVerificationToken } from '@/lib/dns-verification';
// VALID_STATUSES + VALID_TRANSITIONS + isValidTransition extracted to
// src/lib/wedding-status.ts (Phase 3 ÉTAPE 6) so other routes (publish,
// onboarding, etc.) can reuse the same lifecycle rules without drift.
import {
  VALID_STATUSES,
  VALID_TRANSITIONS,
  isValidTransition,
} from '@/lib/wedding-status';
// P2-CQ-1 + P2-SEC-3: shared VALID_PLANS from @/lib/constants.
import { VALID_PLANS } from '@/lib/constants';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// Mission 6.0 P0.5 — route status='PUBLISHED' transitions through the pipeline.
import { publishWeddingViaPipeline } from '@/lib/pipeline/publish-helper';
// P2.6 — auto-transition commercialStatus PAID → LIVE when the wedding is
// published. Idempotent: no-op if not PUBLISHED, or commercialStatus is
// already LIVE / not in [PAID, READY, IN_PRODUCTION].
import { autoTransitionToLive, autoTransitionToPaid } from '@/lib/commercial-status';

/**
 * Per-wedding operations for the platform admin.
 *
 * GET    /api/platform/weddings/{id}        — fetch single wedding with counts
 * PUT    /api/platform/weddings/{id}        — update wedding fields
 * DELETE /api/platform/weddings/{id}        — delete (blocked if isDefault)
 *
 * Platform-admin only. Uses RAW `db` (not `tenantDb`) because we are
 * operating ON weddings themselves, not on tenant-scoped child rows.
 *
 * Cascade delete: handled by Prisma relations (onDelete: Cascade on
 * Wedding → all tenant-scoped tables). No manual cleanup needed.
 *
 * Cache invalidation: after PUT, invalidateWeddingCache(slug) ensures the
 * next public/admin request re-fetches fresh data from the DB.
 *
 * P2.6 — When PUT transitions Wedding.status from non-PUBLISHED → PUBLISHED
 * (via the deployment pipeline), this route also calls autoTransitionToLive()
 * to flip Wedding.commercialStatus PAID → LIVE. This bridges the two state
 * machines so they no longer drift silently.
 */

// P2-CQ-1 + P2-SEC-3: VALID_PLANS now imported from @/lib/constants.

const WEDDING_DETAIL_SELECT = {
  id: true,
  slug: true,
  brideName: true,
  groomName: true,
  coupleLabel: true,
  weddingDate: true,
  timezone: true,
  venueName: true,
  venueAddress: true,
  venueCity: true,
  venueLat: true,
  venueLng: true,
  venueReference: true,
  status: true,
  plan: true,
  commercialStatus: true,
  customDomain: true,
  // P5.2-2: surface verification status to the admin UI.
  customDomainVerified: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  _count: {
    select: {
      guests: true,
      tables: true,
      media: true,
      admins: true,
    },
  },
} as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
      select: WEDDING_DETAIL_SELECT,
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ wedding });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Get platform wedding error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const existing = await db.wedding.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        brideName: true,
        groomName: true,
        isDefault: true,
        status: true,
        commercialStatus: true,
        customDomain: true,
        // P5.2-2: needed to detect change → reset verification.
        customDomainVerified: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Corps de requête invalide' },
        { status: 400 }
      );
    }
    const {
      brideName,
      groomName,
      weddingDate,
      timezone,
      venueName,
      venueAddress,
      venueCity,
      venueLat,
      venueLng,
      venueReference,
      status,
      plan,
      customDomain,
    } = body;

    // ─── Validation ────────────────────────────────────────────────────────
    if (status !== undefined && !VALID_STATUSES.includes(status as WeddingStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    if (plan !== undefined && !VALID_PLANS.includes(plan as Plan)) {
      return NextResponse.json(
        { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
        { status: 400 }
      );
    }

    // ─── Status transition validation (Phase 3 ÉTAPE 5) ─────────────────────
    // Enforces the documented lifecycle. Idempotent same-status updates are
    // always allowed; cross-status transitions must be in VALID_TRANSITIONS.
    // This is additive — every previously-allowed transition remains allowed.
    if (status !== undefined && status !== existing.status) {
      if (!isValidTransition(existing.status, status)) {
        return NextResponse.json(
          {
            error: `Transition de statut invalide : ${existing.status} → ${status}. ` +
                   `Transitions autorisées depuis ${existing.status} : ` +
                   `${(VALID_TRANSITIONS[existing.status] || []).join(', ') || 'aucune'}`,
            from: existing.status,
            to: status,
            allowed: VALID_TRANSITIONS[existing.status] || [],
          },
          { status: 400 }
        );
      }
    }

    // ─── Mission 5.5 invariant: no PUBLISHED without verified payment ─────
    // Enforces the business rule: a wedding cannot be published unless its
    // commercialStatus is 'PAID' (set by provisionFromOrder after verify_payment).
    // Demo weddings (isDefault=true) are exempt. NOTE: only josue-hornella
    // has isDefault=true in the current DB; the Three Worlds demos
    // (world-a-royal/b-minimal/c-immersive) have isDefault=false and are
    // already PUBLISHED, so this guard never fires on them (it only blocks
    // the DRAFT->PUBLISHED transition, not existing PUBLISHED state).
    if (status === 'PUBLISHED' && existing.status !== 'PUBLISHED' && !existing.isDefault) {
      if (existing.commercialStatus !== 'PAID') {
        return NextResponse.json(
          {
            error: 'Publication refusée : le paiement doit être vérifié avant activation. ' +
                   'Utilisez Commercial OS → Payments → ✓ pour vérifier le paiement, ' +
                   'ce qui déclenche le provisioning et met commercialStatus=PAID.',
            code: 'PUBLISHED_REQUIRES_PAID',
            currentCommercialStatus: existing.commercialStatus,
          },
          { status: 403 }
        )
      }
    }

    // customDomain uniqueness check (if changing)
    if (customDomain !== undefined && customDomain !== existing.customDomain) {
      const trimmedDomain = customDomain ? String(customDomain).toLowerCase().trim() : null;
      if (trimmedDomain) {
        const conflict = await db.wedding.findUnique({
          where: { customDomain: trimmedDomain },
          select: { id: true },
        });
        if (conflict && conflict.id !== id) {
          return NextResponse.json(
            { error: `Custom domain "${trimmedDomain}" is already in use` },
            { status: 409 }
          );
        }
      }
    }

    // ─── Build update payload ──────────────────────────────────────────────
    const updateData: Record<string, unknown> = {};

    if (brideName !== undefined) updateData.brideName = String(brideName);
    if (groomName !== undefined) updateData.groomName = String(groomName);

    // Recompute coupleLabel when bride or groom changes
    if (brideName !== undefined || groomName !== undefined) {
      const newBride = brideName !== undefined ? String(brideName) : existing.brideName;
      const newGroom = groomName !== undefined ? String(groomName) : existing.groomName;
      updateData.coupleLabel = buildCoupleLabel(newBride, newGroom);
    }

    if (weddingDate !== undefined) {
      updateData.weddingDate = weddingDate ? new Date(weddingDate) : null;
    }
    if (timezone !== undefined) updateData.timezone = timezone;
    if (venueName !== undefined) updateData.venueName = venueName || null;
    if (venueAddress !== undefined) updateData.venueAddress = venueAddress || null;
    if (venueCity !== undefined) updateData.venueCity = venueCity || null;
    if (venueLat !== undefined) updateData.venueLat = venueLat || null;
    if (venueLng !== undefined) updateData.venueLng = venueLng || null;
    if (venueReference !== undefined) updateData.venueReference = venueReference || null;

    if (status !== undefined) {
      // Mission 6.0 P0.5 — when transitioning TO PUBLISHED, route through the
      // deployment pipeline (creates Deployment row + config snapshot). We do
      // NOT set status directly here; the pipeline handles it.
      if (status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
        const publishResult = await publishWeddingViaPipeline(id, user!.id);
        if (!publishResult.success) {
          return NextResponse.json(
            { error: 'Échec de la publication via le pipeline.', code: 'PUBLISH_FAILED', detail: publishResult.error },
            { status: 500 },
          );
        }
        // Skip the status update below — the pipeline already set it.
        // Re-fetch the wedding so the response reflects the pipeline's changes.
        const refreshed = await db.wedding.findUnique({
          where: { id },
          select: WEDDING_DETAIL_SELECT,
        });
        // 5.8.17 Phase 3 Fix 1 — AWAIT the async invalidateWeddingCache so the
        // L2 unstable_cache tag is reliably busted before the response is sent.
        await invalidateWeddingCache(existing.slug);
        // 5.8.17 Phase 3 Fix 3 — distinguish REPUBLISH (UNPUBLISHED → PUBLISHED)
        // from initial PUBLISH (DRAFT → PUBLISHED) in the audit trail.
        const isRepublish = existing.status === 'UNPUBLISHED';
        await writeAuditLog({
          weddingId: null,
          userId: user!.id,
          action: isRepublish ? 'REPUBLISH_WEDDING' : 'PUBLISH_WEDDING',
          details: `${isRepublish ? 'Republished' : 'Published'} wedding ${existing.slug} via PUT (deployment ${publishResult.deploymentId}, mode ${publishResult.mode})`,
          request,
        });

        // P2.6 — Bridge the two state machines: now that Wedding.status is
        // PUBLISHED, auto-flip commercialStatus PAID → LIVE. Idempotent —
        // no-op if commercialStatus is already LIVE or not in [PAID, READY,
        // IN_PRODUCTION]. Errors here MUST NOT fail the publish — the
        // wedding is already public. We log and continue.
        try {
          await autoTransitionToLive(id, user!.id);
        } catch (e) {
          logger.error('PUT /api/platform/weddings/[id]: autoTransitionToLive failed (non-blocking)', {
            weddingId: id,
            errMessage: e instanceof Error ? e.message : String(e),
          });
        }

        return NextResponse.json({ wedding: refreshed, deployment: { id: publishResult.deploymentId, version: publishResult.version, mode: publishResult.mode } });
      }
      updateData.status = status;
      // Set publishedAt when transitioning to PUBLISHED for the first time
      if (status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
        updateData.publishedAt = new Date();
      }
    }
    if (plan !== undefined) updateData.plan = plan;

    // P5.2-2 (PRE-P5.X-AUDIT-B, HIGH-4): when customDomain changes, reset
    // verification — the couple must re-prove ownership of the new domain.
    // Clearing the domain (null) also clears the flag (no domain → no need
    // to verify). The TXT record instructions are returned in the response.
    let dnsVerificationInstruction: ReturnType<typeof buildDnsVerificationRecord> | null = null;
    if (customDomain !== undefined) {
      const trimmed = customDomain ? String(customDomain).toLowerCase().trim() : null;
      updateData.customDomain = trimmed;
      updateData.customDomainVerified = false;
      if (trimmed) {
        const token = buildVerificationToken(id, trimmed);
        dnsVerificationInstruction = buildDnsVerificationRecord(trimmed, token);
      }
    }

    // ─── Persist + invalidate cache ────────────────────────────────────────
    const wedding = await db.wedding.update({
      where: { id },
      data: updateData,
      select: WEDDING_DETAIL_SELECT,
    });

    // 5.8.17 Phase 3 Fix 1 — AWAIT the async invalidateWeddingCache so the L2
    // unstable_cache tag is reliably busted before the response is sent. This
    // is critical for UNPUBLISH: the public /w/[slug] page must reflect the
    // UNPUBLISHED status (holding page) on the NEXT request, not 5 minutes
    // later when the fallback revalidate kicks in.
    await invalidateWeddingCache(existing.slug);

    // 5.8.17 Phase 3 Fix 3 — distinct audit action for UNPUBLISH transitions.
    // A generic UPDATE_WEDDING (fields: status) entry is ambiguous in the
    // audit trail; UNPUBLISH_WEDDING makes the lifecycle event explicit.
    const isUnpublishTransition =
      status === 'UNPUBLISHED' && existing.status === 'PUBLISHED';

    if (isUnpublishTransition) {
      await writeAuditLog({
        weddingId: null, // platform-level event
        userId: user!.id,
        action: 'UNPUBLISH_WEDDING',
        details: `Unpublished wedding ${existing.slug} (status: ${existing.status} → UNPUBLISHED)`,
        request,
      });

      // 5.8.17 Phase 3 Fix 2 — symmetric auto-transition LIVE → PAID on
      // UNPUBLISH. Without this, commercialStatus stays LIVE after unpublish,
      // and the next PUBLISH attempt (republish) is rejected by the
      // PUBLISHED_REQUIRES_PAID guard (which requires commercialStatus='PAID').
      // This mirrors autoTransitionToLive() (PAID → LIVE on PUBLISH) and
      // makes the state machine reversible: PAID → LIVE → PAID → LIVE → ...
      // Errors here MUST NOT fail the unpublish — the wedding is already
      // unpublished in the DB. We log and continue.
      try {
        await autoTransitionToPaid(id, user!.id);
      } catch (e) {
        logger.error('PUT /api/platform/weddings/[id]: autoTransitionToPaid failed (non-blocking)', {
          weddingId: id,
          errMessage: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: null, // platform-level event
        userId: user!.id,
        action: 'UPDATE_WEDDING',
        details: `Updated wedding ${existing.slug} (fields: ${Object.keys(updateData).join(', ')})`,
        request,
      });
    }

    // P5.2-2: when customDomain was set/changed, return the TXT record the
    // couple must add to verify ownership. The frontend uses this to display
    // step-by-step instructions and a "Vérifier le domaine" button.
    if (dnsVerificationInstruction) {
      return NextResponse.json({
        wedding,
        dnsVerification: dnsVerificationInstruction,
        customDomainVerified: false,
      });
    }
    return NextResponse.json({ wedding });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Update platform wedding error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    // 5.8.17 FIX-P0-P1 (FIX 4): server-side confirmation for destructive
    // DELETE. Previously the endpoint accepted any authenticated
    // requirePlatformAdmin request — a malicious actor with a stolen session
    // cookie could DELETE via direct API call, bypassing the client-side
    // confirm() dialog in WeddingsTab.tsx. Now the request body MUST contain
    // {confirm: true}. The UI (WeddingsTab.tsx handleDelete) was updated to
    // send this field; direct API callers must include it explicitly.
    const body = await request.json().catch(() => ({}));
    if (!body || body.confirm !== true) {
      return NextResponse.json(
        {
          error: 'Confirmation requise pour supprimer ce mariage',
          code: 'CONFIRMATION_REQUIRED',
          hint: "Passez {confirm: true} dans le corps de la requête pour confirmer.",
        },
        { status: 400 }
      );
    }

    const existing = await db.wedding.findUnique({
      where: { id },
      select: { id: true, slug: true, isDefault: true, coupleLabel: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    // ─── Protect the default wedding ───────────────────────────────────────
    // The legacy client at "/" depends on the default wedding existing.
    // Deleting it would break the root route + the public marketing page.
    if (existing.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default wedding' },
        { status: 400 }
      );
    }

    // ─── Cascade delete (Prisma handles tenant-scoped rows automatically) ──
    await db.wedding.delete({ where: { id } });

    // 5.8.17 Phase 3 Fix 1 — await async invalidateWeddingCache for consistency.
    await invalidateWeddingCache(existing.slug);

    // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: null, // platform-level event
      userId: user!.id,
      action: 'DELETE_WEDDING',
      details: `Deleted wedding ${existing.slug} (${existing.coupleLabel})`,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Delete platform wedding error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
