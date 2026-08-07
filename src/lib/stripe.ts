// ══════════════════════════════════════════════════════════════════════════════
// src/lib/stripe.ts — Mission 6.0 P2.5 Stripe SDK singleton
// ══════════════════════════════════════════════════════════════════════════════
//
// Provides a lazy-initialised Stripe client + helpers for org-level billing.
//
// Design decisions:
//   • The Stripe client is created lazily on first use (getStripe()). This
//     avoids crashing the Next.js boot sequence if STRIPE_SECRET_KEY is unset
//     (dev environments without Stripe access).
//   • STRIPE_CONFIG lives in src/lib/constants.ts (P2.1 already extracted it).
//     We import from there to keep a single source of truth.
//   • Org-level customer IDs are persisted on Organization.stripeCustomerId
//     (added in migration 8). getOrCreateOrgCustomer() is idempotent — it
//     only calls Stripe customers.create() the first time.
//   • The webhook signature verifier is exposed as constructWebhookEvent()
//     so the webhook route can use raw bytes from request.arrayBuffer().
//     (Stripe signature verification FAILS on JSON-parsed bodies — the raw
//     bytes are required.)
//
// All Stripe routes MUST set `export const runtime = 'nodejs'` because the
// Stripe SDK uses Node crypto streams that are unavailable in the Edge runtime.

import Stripe from 'stripe';
import { STRIPE_CONFIG } from './constants';
import { logger } from './logger';

let _stripe: Stripe | null = null;

/**
 * Lazily create and cache the Stripe client.
 *
 * Throws a clear, actionable Error if STRIPE_SECRET_KEY is not configured —
 * do NOT catch this in route handlers; let it propagate to the 500 handler.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!STRIPE_CONFIG.secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Configure it in .env to enable Stripe billing.',
    );
  }
  _stripe = new Stripe(STRIPE_CONFIG.secretKey, {
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    typescript: true,
  });
  return _stripe;
}

/**
 * Quick boolean check — used by the buy-credits UI to decide whether to show
 * the "Stripe non configuré" banner instead of the buy buttons.
 */
export function isStripeConfigured(): boolean {
  return Boolean(
    STRIPE_CONFIG.secretKey &&
      STRIPE_CONFIG.secretKey.startsWith('sk_') &&
      STRIPE_CONFIG.webhookSecret,
  );
}

/**
 * Get an existing Stripe Customer ID for the org, or create a new one.
 *
 * Idempotent: if Organization.stripeCustomerId is already set, returns it
 * immediately without any Stripe API call. Otherwise, creates a Customer
 * via the Stripe API (with org metadata), persists the new ID on the
 * Organization row, and returns it.
 *
 * The Stripe customer is keyed by the org's primary email — Stripe
 * deduplicates by email only when explicitly queried, so we always create
 * a fresh customer per org to avoid cross-org leakage.
 */
export async function getOrCreateOrgCustomer(
  orgId: string,
  orgEmail: string,
  orgName: string,
): Promise<string> {
  const { db } = await import('./db');
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { stripeCustomerId: true },
  });
  if (org?.stripeCustomerId) return org.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: orgEmail,
    name: orgName,
    metadata: {
      organizationId: orgId,
      platform: 'wedding-os',
    },
  });

  await db.organization.update({
    where: { id: orgId },
    data: { stripeCustomerId: customer.id },
  });

  logger.info('Stripe customer created for org', {
    orgId,
    customerId: customer.id,
  });
  return customer.id;
}

/**
 * Construct + verify a Stripe webhook Event from the raw request body.
 *
 * MUST be called with the raw bytes (Buffer) — NOT a parsed JSON object.
 * Stripe computes the signature over the raw bytes; JSON.stringify(parsed)
 * produces a different byte sequence (whitespace, key order) and the
 * signature check will fail.
 *
 * Throws Stripe.errors.StripeSignatureVerificationError on invalid signature
 * (the webhook route catches this and returns 400 to Stripe).
 */
export async function constructWebhookEvent(
  payload: Buffer,
  signature: string,
): Promise<Stripe.Event> {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    STRIPE_CONFIG.webhookSecret,
  );
}
