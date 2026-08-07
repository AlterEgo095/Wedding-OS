// ══════════════════════════════════════════════════════════════════════════════
// /api/org/[slug]/credits/route.ts — Mission 6.0 P2.7
// ══════════════════════════════════════════════════════════════════════════════
//
// Returns the org's credit balances (aggregated across all org weddings) +
// the available credit packs with computed prices. Used by the buy-credits
// UI page to render the balance display + pack grid.
//
// Auth: any active member of the org (ORG_ADMIN, ORG_MEMBER, ORG_VIEWER).
//
// Note: credits.ts (addCredits/getAllCredits) is owned by another agent and
// may not exist yet. We query Credit + CreditBalance directly via Prisma to
// avoid a build-time dependency on that file.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  STRIPE_CONFIG,
  CREDIT_PRICES_USD_CENTS,
  CREDIT_TYPES,
  type CreditType,
} from '@/lib/constants';
import { isStripeConfigured } from '@/lib/stripe';
import { internalError } from '@/lib/api-errors';

/**
 * GET /api/org/[slug]/credits
 *
 * Response 200:
 *   {
 *     orgName: string,
 *     stripeConfigured: boolean,
 *     balances: Array<{
 *       type: string,
 *       balance: number,
 *       reserved: number,
 *       available: number,
 *       lifetimePurchased: number,
 *       lifetimeConsumed: number
 *     }>,
 *     packs: Array<{
 *       id: string, type: CreditType, quantity: number, label: string,
 *       priceUsdCents: number, organizationId: string
 *     }>,
 *     primaryWeddingId: string | null
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { slug } = await params;
    const org = await db.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        stripeCustomerId: true,
      },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'Organisation introuvable' },
        { status: 404 },
      );
    }

    // Verify membership (any role, including ORG_VIEWER)
    const membership = await db.organizationMember.findFirst({
      where: { organizationId: org.id, userId: user.id, status: 'ACTIVE' },
    });
    if (!membership) {
      return NextResponse.json(
        { error: 'Accès refusé' },
        { status: 403 },
      );
    }

    // Resolve the org's primary wedding (oldest one) — used to scope the
    // Credit + CreditBalance rows. (Org-level Credit rows have organizationId
    // set, but the schema still requires a weddingId FK.)
    const primaryWedding = await db.wedding.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    // Build balances per credit type. We query the Credit row scoped to
    // (primaryWeddingId, type) — this mirrors how the webhook provisions
    // credits. If no Credit row exists yet, the balance is 0.
    const creditRows = primaryWedding
      ? await db.credit.findMany({
          where: { weddingId: primaryWedding.id },
          select: {
            type: true,
            balance: true,
            reserved: true,
          },
        })
      : [];

    const creditByType = new Map<string, { balance: number; reserved: number }>(
      creditRows.map((c) => [
        c.type,
        { balance: c.balance, reserved: c.reserved },
      ]),
    );

    // CreditBalance aggregates (lifetime totals). One row per (weddingId, type).
    const balanceRows = primaryWedding
      ? await db.creditBalance.findMany({
          where: { weddingId: primaryWedding.id },
          select: {
            type: true,
            lifetimePurchased: true,
            lifetimeConsumed: true,
            lifetimeRefunded: true,
          },
        })
      : [];
    const balanceByType = new Map<
      string,
      {
        lifetimePurchased: number;
        lifetimeConsumed: number;
        lifetimeRefunded: number;
      }
    >(
      balanceRows.map((b) => [
        b.type,
        {
          lifetimePurchased: b.lifetimePurchased,
          lifetimeConsumed: b.lifetimeConsumed,
          lifetimeRefunded: b.lifetimeRefunded,
        },
      ]),
    );

    const balances = CREDIT_TYPES.map((type) => {
      const credit = creditByType.get(type) ?? { balance: 0, reserved: 0 };
      const agg = balanceByType.get(type) ?? {
        lifetimePurchased: 0,
        lifetimeConsumed: 0,
        lifetimeRefunded: 0,
      };
      return {
        type,
        balance: credit.balance,
        reserved: credit.reserved,
        available: credit.balance - credit.reserved,
        lifetimePurchased: agg.lifetimePurchased,
        lifetimeConsumed: agg.lifetimeConsumed,
      };
    });

    // Compute pack prices (unit price × quantity). Free credit types (QR) are
    // excluded from the buy grid — they're free, so no need to surface them.
    const packs = STRIPE_CONFIG.creditPacks.map((pack) => ({
      id: pack.id,
      type: pack.type,
      quantity: pack.quantity,
      label: pack.label,
      priceUsdCents: CREDIT_PRICES_USD_CENTS[pack.type as CreditType] * pack.quantity,
      organizationId: org.id,
    })).filter((p) => p.priceUsdCents > 0);

    // isStripeConfigured() requires the stripe module to be loaded — it's a
    // cheap function (just env-var checks). We import it at the top of the file.
    let stripeConfigured = false;
    try {
      stripeConfigured = isStripeConfigured();
    } catch {
      // getStripe() throws if STRIPE_SECRET_KEY is unset — isStripeConfigured
      // catches that internally, but defensive try/catch just in case.
      stripeConfigured = false;
    }

    return NextResponse.json({
      orgName: org.name,
      stripeConfigured,
      balances,
      packs,
      primaryWeddingId: primaryWedding?.id ?? null,
      stripeCustomerId: org.stripeCustomerId,
    });
  } catch (error) {
    console.error('[/api/org/[slug]/credits] error:', error);
    return internalError();
  }
}
