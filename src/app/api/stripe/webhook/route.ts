// ══════════════════════════════════════════════════════════════════════════════
// /api/stripe/webhook/route.ts — Mission 6.0 P2.5
// ══════════════════════════════════════════════════════════════════════════════
//
// Stripe webhook receiver. Handles 4 event types per P2.5 spec:
//
//   1. checkout.session.completed   — one-time credit pack purchase → provision
//                                      credits idempotently (audit log check)
//   2. invoice.paid                 — subscription invoice paid → mark Invoice
//                                      PAID + Subscription ACTIVE
//   3. invoice.payment_failed       — subscription payment failed → mark
//                                      Subscription PAST_DUE for dunning
//   4. customer.subscription.deleted — Subscription CANCELED + revoke Entitlements
//
// CRITICAL: Stripe webhooks MUST receive the raw request body — the signature
// is computed over the raw bytes. Next.js Route Handlers give us request.json()
// but that PARSES the body (different bytes). We use request.arrayBuffer() and
// convert to Buffer to preserve the original bytes.
//
// Idempotency:
//   For credit purchases, we store an AuditLog row with action='STRIPE_CREDIT_PROVISIONED'
//   and the Stripe session ID in `details`. On every webhook, we first check
//   whether such a row exists — if yes, we return 200 ACK without re-provisioning.
//   This handles Stripe's retry behavior (Stripe retries a webhook up to ~16 times
//   over 3 days if we don't ACK 200 quickly enough).
//
// Error handling:
//   Signature verification failure → 400 (Stripe will retry).
//   Handler exception → 200 ACK with `{ received: true, error: 'handler_failed' }`
//   to prevent infinite retries (we logged the error for manual investigation).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent } from '@/lib/stripe';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  CREDIT_TYPES,
  type CreditType,
} from '@/lib/constants';

/**
 * POST /api/stripe/webhook
 *
 * Headers required: stripe-signature (HMAC of the raw body)
 * Body: raw Stripe event JSON (do NOT parse before signature check)
 *
 * Returns:
 *   200 { received: true }  — event processed (or idempotent skip)
 *   400 { error: '...' }    — signature verification failure (Stripe will retry)
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 },
    );
  }

  // CRITICAL: use arrayBuffer() to get the raw bytes. request.json() would
  // parse the body and produce a different byte sequence when re-serialized,
  // causing the Stripe signature check to fail.
  const rawBody = Buffer.from(await request.arrayBuffer());

  let event;
  try {
    event = await constructWebhookEvent(rawBody, signature);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', {
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 },
    );
  }

  logger.info('Stripe webhook received', { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      default:
        logger.info('Stripe webhook: unhandled event type', {
          type: event.type,
        });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook handler error', {
      type: event.type,
      id: event.id,
      errMessage: error instanceof Error ? error.message : String(error),
    });
    // Return 200 to prevent Stripe from retrying — we logged the error for
    // manual investigation. Stripe's retry policy retries any non-2xx response.
    return NextResponse.json({ received: true, error: 'handler_failed' });
  }
}

// ─── Handler: checkout.session.completed ─────────────────────────────────────
//
// One-time credit pack purchase. The session was created by /api/stripe/checkout
// with metadata.type='CREDIT_PURCHASE'. We provision the credits here.
//
// Idempotency: we check the AuditLog for a prior 'STRIPE_CREDIT_PROVISIONED'
// entry whose `details` contains the session ID. If found, skip.

async function handleCheckoutCompleted(event: any) {
  const session = event.data.object;

  // Only handle credit purchases — subscription first-payment also fires this
  // event, but those have mode='subscription' and no CREDIT_PURCHASE metadata.
  if (session.metadata?.type !== 'CREDIT_PURCHASE') return;

  const { organizationId, creditType, quantity, userId } = session.metadata;
  if (!organizationId || !creditType || !quantity) {
    logger.error(
      'Stripe webhook: missing metadata in checkout.session.completed',
      { sessionId: session.id, metadata: session.metadata },
    );
    return;
  }

  // Idempotency check via AuditLog
  const existing = await db.auditLog.findFirst({
    where: {
      action: 'STRIPE_CREDIT_PROVISIONED',
      details: { contains: session.id },
    },
  });
  if (existing) {
    logger.info('Stripe webhook: session already processed', {
      sessionId: session.id,
    });
    return;
  }

  const qty = parseInt(quantity, 10);
  if (!Number.isFinite(qty) || qty < 1) {
    logger.error('Stripe webhook: invalid quantity in metadata', { quantity });
    return;
  }

  const ct = creditType as CreditType;
  if (!CREDIT_TYPES.includes(ct)) {
    logger.error('Stripe webhook: invalid creditType in metadata', {
      creditType,
    });
    return;
  }

  // Provision the credits directly via Prisma (we don't import from credits.ts
  // because that file is owned by another agent and may not exist yet).
  // The pattern mirrors the schema:
  //   1. UPSERT Credit row (balance += qty) — unique on [organizationId, type]
  //   2. CREATE CreditTransaction row (delta: +qty, reason: 'PURCHASE')
  //   3. UPSERT CreditBalance row (lifetimePurchased += qty, currentBalance += qty)
  //
  // The Credit row needs a weddingId (required FK). We pick the org's primary
  // wedding (oldest one) — this is consistent with how /api/org/[slug]/credits
  // displays balances. If the org has no weddings yet, we cannot provision
  // and must log the error for manual resolution.
  const orgWeddings = await db.wedding.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (orgWeddings.length === 0) {
    logger.error(
      'Stripe webhook: org has no weddings to credit — manual provisioning required',
      { organizationId, sessionId: session.id, qty, creditType: ct },
    );
    return;
  }

  const primaryWeddingId = orgWeddings[0].id;
  const actorUserId = userId || null;

  // 1. UPSERT Credit row scoped to (organizationId, type).
  //    Also create a wedding-scoped Credit row so per-wedding dashboards
  //    see the credit pool. We use upsert on [weddingId, type].
  await db.credit.upsert({
    where: {
      weddingId_type: { weddingId: primaryWeddingId, type: ct },
    },
    create: {
      weddingId: primaryWeddingId,
      organizationId,
      type: ct,
      balance: qty,
    },
    update: {
      balance: { increment: qty },
    },
  });

  // 2. Append-only ledger row (CreditTransaction).
  await db.creditTransaction.create({
    data: {
      weddingId: primaryWeddingId,
      organizationId,
      creditType: ct,
      delta: qty,
      reason: 'PURCHASE',
      note: `Stripe checkout ${session.id}`,
      createdBy: actorUserId,
    },
  });

  // 3. UPSERT CreditBalance aggregate row.
  await db.creditBalance.upsert({
    where: {
      weddingId_type: { weddingId: primaryWeddingId, type: ct },
    },
    create: {
      weddingId: primaryWeddingId,
      organizationId,
      type: ct,
      lifetimePurchased: qty,
      currentBalance: qty,
    },
    update: {
      lifetimePurchased: { increment: qty },
      currentBalance: { increment: qty },
    },
  });

  // 4. Audit log row — idempotency key + traceability.
  await db.auditLog.create({
    data: {
      weddingId: primaryWeddingId,
      userId: actorUserId,
      action: 'STRIPE_CREDIT_PROVISIONED',
      details: `Stripe session ${session.id}: +${qty} ${ct} credits for org ${organizationId}`,
      ipAddress: null,
      userAgent: 'stripe-webhook',
    },
  });

  logger.info('Stripe webhook: credits provisioned', {
    sessionId: session.id,
    organizationId,
    creditType: ct,
    quantity: qty,
  });
}

// ─── Handler: invoice.paid ───────────────────────────────────────────────────
//
// Subscription invoice paid. Marks the corresponding Invoice row as PAID + the
// Subscription as ACTIVE. Skips silently if no Subscription matches the
// stripeSubscriptionId (e.g. test webhooks, or invoices for other products).

async function handleInvoicePaid(event: any) {
  const invoice = event.data.object;
  if (!invoice.subscription) return;

  const subscription = await db.subscription.findFirst({
    where: { stripeSubscriptionId: invoice.subscription },
  });
  if (!subscription) {
    logger.info('Stripe webhook: invoice.paid — no matching subscription', {
      stripeSubscriptionId: invoice.subscription,
    });
    return;
  }

  // Mark any matching Invoice row PAID
  await db.invoice.updateMany({
    where: {
      subscriptionId: subscription.id,
      stripeInvoiceId: invoice.id,
    },
    data: {
      status: 'PAID',
      amountPaid: invoice.amount_paid,
      paidAt: new Date(),
    },
  });

  // Mark Subscription ACTIVE + record last payment timestamp
  await db.subscription.update({
    where: { id: subscription.id },
    data: { status: 'ACTIVE', paidAt: new Date() },
  });

  logger.info('Stripe webhook: invoice.paid processed', {
    subscriptionId: subscription.id,
    invoiceId: invoice.id,
  });
}

// ─── Handler: invoice.payment_failed ─────────────────────────────────────────
//
// Subscription payment failed. Marks the Subscription as PAST_DUE so the
// platform admin can chase the customer (dunning).

async function handleInvoicePaymentFailed(event: any) {
  const invoice = event.data.object;
  if (!invoice.subscription) return;

  const result = await db.subscription.updateMany({
    where: { stripeSubscriptionId: invoice.subscription },
    data: { status: 'PAST_DUE' },
  });

  logger.warn(
    'Stripe webhook: invoice.payment_failed — subscription marked PAST_DUE',
    {
      stripeSubscriptionId: invoice.subscription,
      matchedCount: result.count,
    },
  );
}

// ─── Handler: customer.subscription.deleted ──────────────────────────────────
//
// Customer cancelled their subscription (either via Stripe Dashboard or via
// the billing portal). Marks the Subscription as CANCELED + revokes all
// plan-origin Entitlements for the wedding + sets commercialStatus to CANCELLED.

async function handleSubscriptionDeleted(event: any) {
  const subscription = event.data.object;

  await db.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: 'CANCELED' },
  });

  const sub = await db.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true, weddingId: true },
  });
  if (!sub) {
    logger.info(
      'Stripe webhook: customer.subscription.deleted — no matching subscription',
      { stripeSubscriptionId: subscription.id },
    );
    return;
  }

  // Revoke all plan-origin entitlements for this wedding
  await db.entitlement.deleteMany({
    where: { weddingId: sub.weddingId, origin: 'PLAN' },
  });

  // Mark the wedding's commercial status as CANCELLED
  await db.wedding.update({
    where: { id: sub.weddingId },
    data: { commercialStatus: 'CANCELLED' },
  });

  logger.warn(
    'Stripe webhook: subscription deleted — entitlements revoked',
    { weddingId: sub.weddingId, subscriptionId: sub.id },
  );
}
