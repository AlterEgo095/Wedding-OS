// ══════════════════════════════════════════════════════════════════════════════
// /api/stripe/portal/route.ts — Mission 6.0 P2.5
// ══════════════════════════════════════════════════════════════════════════════
//
// Create a Stripe Billing Portal session for an organization to manage their
// payment methods, view invoices, and cancel subscriptions.
//
// Auth: ORG_ADMIN only (not ORG_MEMBER — billing is an admin-only action).
// Pre-req: the org must already have a Stripe customer ID (created on first
// checkout via getOrCreateOrgCustomer). If not, returns 400 with a clear
// message directing the admin to buy credits first.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

/**
 * POST /api/stripe/portal
 *
 * Body: { organizationId: string }
 * Auth: ORG_ADMIN of the organization (platform admin also allowed).
 *
 * Response 200: { url: string }
 * Response 400: { error: string } — no Stripe customer linked
 * Response 401: { error: string } — not authenticated
 * Response 403: { error: string } — not ORG_ADMIN
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { organizationId } = body as { organizationId?: string };
    if (!organizationId) return badRequest('organizationId requis');

    // ORG_ADMIN or platform admin only
    const isPlatformAdmin =
      user.role === 'PLATFORM_ADMIN' || user.role === 'SUPER_ADMIN';
    const membership = isPlatformAdmin
      ? await db.organizationMember.findFirst({
          where: { organizationId, userId: user.id, status: 'ACTIVE' },
        })
      : await db.organizationMember.findFirst({
          where: {
            organizationId,
            userId: user.id,
            status: 'ACTIVE',
            role: 'ORG_ADMIN',
          },
        });
    if (!membership) {
      return NextResponse.json(
        { error: 'Accès refusé: ORG_ADMIN requis' },
        { status: 403 },
      );
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { stripeCustomerId: true, slug: true },
    });
    if (!org?.stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "Aucun client Stripe associé à cette organisation. Effectuez d'abord un achat de crédits.",
        },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const baseUrl =
      process.env.NEXTAUTH_URL || 'https://wedding.aenews.store';
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${baseUrl}/org/${org.slug}/admin/buy-credits`,
    });

    logger.info('Stripe portal session created', {
      orgId: organizationId,
      sessionId: session.id,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error('Stripe portal error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
