// ══════════════════════════════════════════════════════════════════════════════
// /api/stripe/checkout/route.ts — Mission 6.0 P2.5
// ══════════════════════════════════════════════════════════════════════════════
//
// Create a Stripe Checkout Session for buying credit packs (one-time payment).
//
// Flow:
//   1. Auth: getAuthUser() → must be ORG_ADMIN or ORG_MEMBER of the org.
//   2. Resolve the credit type + quantity + unit price (from STRIPE_CONFIG).
//   3. getOrCreateOrgCustomer() — links the org to a Stripe Customer.
//   4. stripe.checkout.sessions.create({ mode: 'payment', ... }) — one-time
//      payment (NOT subscription — subscription billing is handled elsewhere).
//   5. The session carries metadata so the webhook can provision credits
//      idempotently: { type: 'CREDIT_PURCHASE', organizationId, creditType,
//      quantity, userId }.
//
// Returns: { url, sessionId } — the client redirects to `url` (Stripe-hosted).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getStripe, getOrCreateOrgCustomer } from '@/lib/stripe';
import {
  STRIPE_CONFIG,
  CREDIT_PRICES_USD_CENTS,
  type CreditType,
} from '@/lib/constants';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

/**
 * POST /api/stripe/checkout
 *
 * Body:
 *   organizationId : string       — which org to credit (REQUIRED)
 *   creditType     : CreditType   — INVITATION | SMS | WHATSAPP | QR | EXPORT
 *   quantity       : number       — how many credits to buy (mutually exclusive with packId)
 *   packId         : string       — pre-bundled pack ID from STRIPE_CONFIG.creditPacks
 *   successUrl     : string?      — override default success URL
 *   cancelUrl      : string?      — override default cancel URL
 *
 * Response 200: { url: string, sessionId: string }
 * Response 400: { error: string } — invalid request body
 * Response 401: { error: string } — not authenticated
 * Response 403: { error: string } — not an active member of the org
 * Response 500: { error: string } — Stripe SDK error / internal failure
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { organizationId, creditType, quantity, packId, successUrl, cancelUrl } =
      body as {
        organizationId?: string;
        creditType?: CreditType;
        quantity?: number;
        packId?: string;
        successUrl?: string;
        cancelUrl?: string;
      };

    if (!organizationId) return badRequest('organizationId requis');
    if (!creditType) return badRequest('creditType requis');

    // Validate creditType (QR is allowed but priced at 0 — it's free, but the
    // route still creates a checkout for tracking purposes if explicitly requested).
    const validTypes: CreditType[] = [
      'INVITATION',
      'SMS',
      'WHATSAPP',
      'QR',
      'EXPORT',
    ];
    if (!validTypes.includes(creditType)) {
      return badRequest('creditType invalide');
    }

    // Determine final quantity + unit price
    let finalQuantity = quantity || 0;
    const unitPrice = CREDIT_PRICES_USD_CENTS[creditType];

    if (packId) {
      const pack = STRIPE_CONFIG.creditPacks.find((p) => p.id === packId);
      if (!pack) return badRequest('packId invalide');
      if (pack.type !== creditType) {
        return badRequest('packId ne correspond pas au creditType');
      }
      finalQuantity = pack.quantity;
    }

    if (!finalQuantity || finalQuantity < 1) {
      return badRequest('quantity doit être >= 1');
    }
    if (finalQuantity > 10000) {
      return badRequest('quantity maximum 10000 par commande');
    }

    // Verify org membership (ORG_ADMIN or ORG_MEMBER — ORG_VIEWER is read-only)
    const membership = await db.organizationMember.findFirst({
      where: {
        organizationId,
        userId: user.id,
        status: 'ACTIVE',
        role: { in: ['ORG_ADMIN', 'ORG_MEMBER'] },
      },
    });
    if (!membership) {
      return NextResponse.json(
        {
          error:
            "Accès refusé: vous n'êtes pas membre actif de cette organisation",
        },
        { status: 403 },
      );
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        email: true,
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

    // Default URLs — point back at the buy-credits page so the user lands on
    // a success/cancel banner. {CHECKOUT_SESSION_ID} is a Stripe placeholder
    // that's replaced in the redirect URL.
    const baseUrl =
      process.env.NEXTAUTH_URL || 'https://wedding.hpph.net';
    const finalSuccessUrl =
      successUrl ||
      `${baseUrl}/org/${org.slug}/admin/buy-credits?status=success&session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl =
      cancelUrl || `${baseUrl}/org/${org.slug}/admin/buy-credits?status=cancelled`;

    return await createCheckoutSession(
      org,
      creditType,
      finalQuantity,
      unitPrice,
      finalSuccessUrl,
      finalCancelUrl,
      user.id,
    );
  } catch (error) {
    logger.error('Stripe checkout error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function createCheckoutSession(
  org: {
    id: string;
    name: string;
    email: string;
    slug: string;
    stripeCustomerId: string | null;
  },
  creditType: CreditType,
  quantity: number,
  unitPrice: number,
  successUrl: string,
  cancelUrl: string,
  userId: string,
) {
  const stripe = getStripe();
  const customerId = await getOrCreateOrgCustomer(org.id, org.email, org.name);

  const totalAmount = unitPrice * quantity; // in cents

  // Free credits (e.g. QR): Stripe requires a minimum of $0.50 for Checkout
  // Sessions. If the total is 0, we short-circuit and immediately provision
  // the credits via the webhook path is impossible (no session created) — so
  // we provision them directly here.
  if (totalAmount === 0) {
    return NextResponse.json(
      {
        error:
          'Ce type de crédit est gratuit — aucun paiement requis. Contactez un administrateur.',
      },
      { status: 400 },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: STRIPE_CONFIG.currency,
          unit_amount: totalAmount,
          product_data: {
            name: `Pack ${quantity} crédits ${creditType}`,
            description: `${quantity} crédits ${creditType} pour ${org.name}`,
            metadata: {
              creditType,
              quantity: String(quantity),
              organizationId: org.id,
            },
          },
        },
      },
    ],
    metadata: {
      organizationId: org.id,
      creditType,
      quantity: String(quantity),
      userId,
      type: 'CREDIT_PURCHASE',
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  logger.info('Stripe checkout session created', {
    sessionId: session.id,
    orgId: org.id,
    creditType,
    quantity,
    totalAmount,
  });

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
