export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';
// CONS-7 task 5: Zod request-body validation.
import { z } from 'zod';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit'; // P0.7
// P2.4: usage metering (QR_SCANS counter increment after successful check-in).
import { incrementUsage } from '@/lib/usage';
// P595B-P1 (Phase 9): entitlement lookup for the CHECK_IN feature flag.
import { getEntitlementOverride } from '@/lib/plan-limits';

/**
 * POST /api/check-in
 *
 * QR-code day-of-event check-in. The reception staff scans a guest's QR code
 * (which encodes the invitationCode), and this endpoint:
 *   1. Resolves the tenant from the request (X-Wedding-Slug header or auth)
 *   2. Looks up the guest by invitationCode WITHIN the current tenant
 *   3. REJECTS cross-tenant codes (the code exists in another wedding but
 *      the tenant-scoped query returns null → 404, no leak)
 *   4. If already checked in → returns WARN with the previous check-in time
 *   5. If not → sets checkedIn=true, checkedInAt=now, returns guest + table
 *
 * Security model (Mission 4.0 Phase 6.4):
 *   - Wedding A invitation → Wedding A check-in = PASS
 *   - Wedding A invitation → Wedding B check-in = REJECT (404, no leak)
 *   - Unknown code = REJECT (404)
 *   - Already checked-in = WARN (200, returns current state, does NOT re-check-in)
 *
 * The tenant scoping is enforced by tenantDb.guest.findFirst which auto-injects
 * weddingId via the AsyncLocalStorage tenant context. A code that exists in
 * wedding B but is scanned at wedding A's check-in desk will simply not be
 * found — the query is `WHERE invitationCode = ? AND weddingId = <A>`, which
 * returns null. This is the fail-closed multi-tenant guarantee.
 *
 * Auth: CONTROLLER+ (reception staff can check in guests).
 *
 * P595B-P1-3 (Phase 9) — CHECK_IN entitlement enforcement:
 *   In addition to role + tenant scope, the wedding must hold a CHECK_IN
 *   entitlement (provisioned by provisionFromOrder for ESSENTIEL+). A wedding
 *   that was downgraded after provisioning (e.g. PREMIUM → TRIAL with the
 *   entitlement row explicitly set to value='false') is rejected with 402
 *   before the QR scan is processed. This closes the "STORED_ONLY" gap
 *   identified in Mission 5.9.5-B ENTITLEMENT-MATRIX.
 */

// CONS-7 task 5 — Zod schema for check-in.
const checkInSchema = z.object({
  invitationCode: z.string().min(1).max(50),
});

export async function POST(request: NextRequest) {
  try {
    // Mission 6.0 P0.7 — rate limit (30 req/min — reception staff scanning)
    const rlKey = getRateLimitKey(request);
    const { allowed: rlAllowed, retryAfterSeconds: rlRetry } = await checkRateLimitAsync(rlKey, 30, 60_000);
    if (!rlAllowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(rlRetry ?? Math.ceil(60_000 / 1000)) } }
      );
    }
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['CONTROLLER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json(
        { error: tenantError?.message },
        { status: tenantError?.status ?? 500 }
      );
    }

    // ─── P595B-P1-3 — Enforce CHECK_IN entitlement ───────────────────────
    // A wedding whose plan was downgraded (e.g. ESSENTIEL → TRIAL) must not
    // be able to scan QR codes on event day if the CHECK_IN entitlement is
    // gone. provisionFromOrder writes value='true' for ESSENTIEL/PREMIUM/ELITE
    // plans; if a downgrade flips the row to value='false' (or the row is
    // missing entirely), we reject with 402.
    //
    // Semantics: `getEntitlementOverride` returns
    //   - true    → explicitly granted (value='true')
    //   - false   → explicitly denied  (value='false')
    //   - number  → numeric limit (not applicable to CHECK_IN)
    //   - null    → no row → wedding predates entitlements (legacy compat:
    //               allow the scan; the wedding's commercial status is the
    //               only gate that applies)
    const checkInEntitled = await getEntitlementOverride(context.weddingId, 'CHECK_IN');
    if (checkInEntitled === false) {
      return NextResponse.json(
        {
          error: 'Votre formule ne permet pas le check-in des invités. Passez à Essentiel ou supérieur.',
          entitlement: 'CHECK_IN',
        },
        { status: 402 }
      );
    }

    return runWithTenant(context, async () => {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Corps de requête invalide');
      // CONS-7 task 5: Zod validation replaces ad-hoc field checks.
      const parsed = checkInSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: 'Données invalides',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
          { status: 400 },
        );
      }
      const { invitationCode } = parsed.data;

      const normalizedCode = invitationCode.trim().toUpperCase();

      // Tenant-scoped lookup: weddingId is auto-injected by tenantDb.
      // A code from another wedding will NOT be found here → 404.
      const guest = await tenantDb.guest.findFirst({
        where: { invitationCode: normalizedCode },
        include: {
          table: { select: { id: true, name: true, number: true } },
        },
      });

      if (!guest) {
        // REJECT — unknown code OR cross-tenant attempt.
        // We log the attempt for security audit but do NOT reveal which.
        await writeAuditLog({
          weddingId: context.weddingId,
          userId: user.id,
          action: 'CHECK_IN_REJECTED',
          details: `Unknown or cross-tenant invitation code: ${normalizedCode.slice(0, 4)}…`,
          request,
        });
        return NextResponse.json(
          {
            status: 'REJECTED',
            reason: "Code d'invitation invalide ou introuvable pour ce mariage.",
            message: "Code d'invitation invalide ou introuvable pour ce mariage.",
            code: normalizedCode,
          },
          { status: 404 }
        );
      }

      // Already checked in? Return WARN (idempotent — do NOT overwrite timestamp)
      if (guest.checkedIn) {
        return NextResponse.json({
          status: 'ALREADY_CHECKED_IN',
          guest: {
            id: guest.id,
            firstName: guest.firstName,
            lastName: guest.lastName,
            category: guest.category,
            seats: guest.seats,
          },
          table: guest.table
            ? { name: guest.table.name, number: guest.table.number }
            : null,
          checkedInAt: guest.checkedInAt,
          message: `⚠️ ${guest.firstName} ${guest.lastName} est déjà enregistré.`,
        });
      }

      // Check in the guest
      const now = new Date();
      await tenantDb.guest.update({
        where: { id: guest.id },
        data: {
          checkedIn: true,
          checkedInAt: now,
        },
      });

      await writeAuditLog({
        weddingId: context.weddingId,
        userId: user.id,
        action: 'CHECK_IN_SUCCESS',
        details: `Checked in ${guest.firstName} ${guest.lastName} (code ${normalizedCode.slice(0, 4)}…)`,
        request,
      });

      // P2.4: meter QR_SCANS — one per successful check-in. Already-checked-in
      // responses (ALREADY_CHECKED_IN above) are NOT counted (the code returns
      // before reaching this point). Best-effort; helper swallows internally.
      await incrementUsage(context.weddingId, 'QR_SCANS', 1).catch(() => {});

      return NextResponse.json({
        status: 'CHECKED_IN',
        guest: {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          category: guest.category,
          seats: guest.seats,
          invitationType: guest.invitationType,
        },
        table: guest.table
          ? { name: guest.table.name, number: guest.table.number }
          : null,
        checkedInAt: now,
        message: `✅ ${guest.firstName} ${guest.lastName} enregistré avec succès.`,
      });
    });
  } catch (error) {
    logger.error('Check-in error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
