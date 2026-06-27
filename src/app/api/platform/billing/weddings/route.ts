export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import {
  resolveAmountUsdCents,
  type SubscriptionStatus,
} from '@/lib/billing';
import { PLAN_METADATA } from '@/lib/types';

/**
 * GET /api/platform/billing/weddings
 *
 * Billing overview: every wedding with its current subscription, plan
 * metadata, and an "effectivePrice" (USD cents) — used by the Billing tab
 * to show a sortable/filterable list of all subscriptions.
 *
 * Query params:
 *   status:    filter by subscription status (TRIALING, PENDING_PAYMENT, ACTIVE, …)
 *   plan:      filter by plan (TRIAL, ESSENTIEL, PREMIUM, ELITE)
 *   search:    search across coupleLabel + slug
 *
 * Returns:
 *   {
 *     weddings: Array<{
 *       id, slug, coupleLabel, status, plan, weddingDate,
 *       subscription: { id, plan, status, amountAgreed, currency, billingCycle,
 *                       paymentMethod, whatsappPhone, notes, paidAt, activatedAt,
 *                       createdAt, currentPeriodEnd } | null,
 *       effectivePriceUsdCents: number,
 *       planLabel: string,
 *       invoicesCount: number,
 *       openInvoicesCount: number,
 *     }>,
 *     summary: {
 *       total, active, pending, trial, mrrUsd, pendingUsd
 *     }
 *   }
 */

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'TRIALING', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED',
];

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'ALL';
    const planFilter = url.searchParams.get('plan') || 'ALL';
    const search = url.searchParams.get('search')?.trim() || '';

    // ─── Fetch all weddings with their subscription + invoice counts ───────
    const weddings = await db.wedding.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        coupleLabel: true,
        status: true,
        plan: true,
        weddingDate: true,
        createdAt: true,
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            amountAgreed: true,
            currency: true,
            billingCycle: true,
            paymentMethod: true,
            whatsappPhone: true,
            notes: true,
            paidAt: true,
            activatedAt: true,
            createdAt: true,
            currentPeriodEnd: true,
          },
        },
        _count: { select: { invoices: true } },
        invoices: {
          where: { status: 'OPEN' },
          select: { id: true },
        },
      },
    });

    // ─── Build the response list ───────────────────────────────────────────
    let list = weddings.map((w) => {
      const plan = (w.subscription?.plan ?? w.plan) as keyof typeof PLAN_METADATA;
      const cycle = (w.subscription?.billingCycle ?? 'MONTHLY') as 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';
      const effectivePriceUsdCents = w.subscription
        ? resolveAmountUsdCents(plan, w.subscription.amountAgreed, cycle)
        : PLAN_METADATA[plan]?.priceUsd
          ? PLAN_METADATA[plan].priceUsd * 100
          : 0;

      return {
        id: w.id,
        slug: w.slug,
        coupleLabel: w.coupleLabel,
        status: w.status,
        plan,
        weddingDate: w.weddingDate,
        createdAt: w.createdAt,
        subscription: w.subscription,
        effectivePriceUsdCents,
        planLabel: PLAN_METADATA[plan]?.label ?? plan,
        invoicesCount: w._count.invoices,
        openInvoicesCount: w.invoices.length,
      };
    });

    // ─── Apply filters ─────────────────────────────────────────────────────
    if (statusFilter !== 'ALL' && SUBSCRIPTION_STATUSES.includes(statusFilter as SubscriptionStatus)) {
      list = list.filter((w) => w.subscription?.status === statusFilter);
    }
    if (planFilter !== 'ALL' && ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'].includes(planFilter)) {
      list = list.filter((w) => w.plan === planFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (w) =>
          w.coupleLabel.toLowerCase().includes(q) ||
          w.slug.toLowerCase().includes(q),
      );
    }

    // ─── Summary stats ─────────────────────────────────────────────────────
    const summary = {
      total: list.length,
      active: list.filter((w) => w.subscription?.status === 'ACTIVE').length,
      pending: list.filter((w) => w.subscription?.status === 'PENDING_PAYMENT').length,
      trial: list.filter((w) => !w.subscription || w.subscription.status === 'TRIALING').length,
      // MRR = sum of MONTHLY-equivalent effective price for ACTIVE subscriptions
      mrrUsd: list
        .filter((w) => w.subscription?.status === 'ACTIVE')
        .reduce((sum, w) => {
          const cycle = w.subscription!.billingCycle as 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';
          const monthly = cycle === 'ANNUAL' ? w.effectivePriceUsdCents / 10 : w.effectivePriceUsdCents;
          return sum + monthly / 100;
        }, 0),
      // Pending = sum of OPEN invoices' amountDue (USD)
      pendingUsd: 0, // computed below from a separate fetch
    };

    // Pending revenue = sum of OPEN invoices across all weddings.
    const openInvoices = await db.invoice.findMany({
      where: { status: 'OPEN' },
      select: { amountDue: true, currency: true },
    });
    summary.pendingUsd = openInvoices.reduce((s, i) => s + i.amountDue / 100, 0);

    return NextResponse.json({ weddings: list, summary });
  } catch (error) {
    console.error('Billing overview error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
