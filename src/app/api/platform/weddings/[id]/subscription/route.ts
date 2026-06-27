export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { invalidateWeddingCache } from '@/lib/tenant-context';
import {
  isValidPlan,
  isValidBillingCycle,
  isValidPaymentMethod,
  isValidSubscriptionStatus,
  resolveAmountUsdCents,
  type BillingCycle,
  type PaymentMethod,
  type SubscriptionStatus,
} from '@/lib/billing';
import type { Plan } from '@/lib/types';

/**
 * Per-wedding subscription management (manual billing flow).
 *
 * GET  /api/platform/weddings/{id}/subscription
 *   Returns the wedding's current subscription record (or null if none).
 *
 * PUT  /api/platform/weddings/{id}/subscription
 *   Upsert the subscription (plan, custom price, billing cycle, payment
 *   method, WhatsApp phone, notes, status). When status transitions to
 *   ACTIVE, also writes the plan back onto Wedding.plan (so the dashboard
 *   MRR reflects the change automatically).
 *
 * Platform-admin only. Uses RAW `db` (not `tenantDb`) because subscriptions
 * are platform-level billing entities, not tenant-scoped child rows.
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SUBSCRIPTION_SELECT = {
  id: true,
  weddingId: true,
  plan: true,
  status: true,
  amountAgreed: true,
  currency: true,
  billingCycle: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAt: true,
  trialEndsAt: true,
  activatedAt: true,
  paidAt: true,
  paymentMethod: true,
  whatsappPhone: true,
  notes: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        coupleLabel: true,
        plan: true,
        status: true,
      },
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 },
      );
    }

    const subscription = await db.subscription.findUnique({
      where: { weddingId: id },
      select: SUBSCRIPTION_SELECT,
    });

    return NextResponse.json({ wedding, subscription });
  } catch (error) {
    console.error('Get subscription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        coupleLabel: true,
        plan: true,
        status: true,
      },
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 },
      );
    }

    const body = await request.json();
    const {
      plan,
      status,
      amountAgreed,
      currency,
      billingCycle,
      paymentMethod,
      whatsappPhone,
      notes,
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
    } = body;

    // ─── Validation ────────────────────────────────────────────────────────
    if (plan !== undefined && !isValidPlan(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be one of: TRIAL, ESSENTIEL, PREMIUM, ELITE' },
        { status: 400 },
      );
    }
    if (status !== undefined && !isValidSubscriptionStatus(status)) {
      return NextResponse.json(
        { error: 'Invalid subscription status' },
        { status: 400 },
      );
    }
    if (billingCycle !== undefined && !isValidBillingCycle(billingCycle)) {
      return NextResponse.json(
        { error: 'Invalid billing cycle' },
        { status: 400 },
      );
    }
    if (paymentMethod !== undefined && paymentMethod !== null && !isValidPaymentMethod(paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 },
      );
    }
    if (amountAgreed !== undefined && amountAgreed !== null) {
      const n = Number(amountAgreed);
      if (!Number.isFinite(n) || n < 0 || n > 100_000_00) {
        return NextResponse.json(
          { error: 'amountAgreed must be a positive integer (USD cents) ≤ 1 000 000' },
          { status: 400 },
        );
      }
    }

    // ─── Build update payload ──────────────────────────────────────────────
    const updateData: Record<string, unknown> = {};
    if (plan !== undefined) updateData.plan = plan;
    if (status !== undefined) updateData.status = status;
    if (billingCycle !== undefined) updateData.billingCycle = billingCycle;
    if (currency !== undefined) updateData.currency = String(currency).toLowerCase();
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (whatsappPhone !== undefined) updateData.whatsappPhone = whatsappPhone ? String(whatsappPhone).trim() : null;
    if (notes !== undefined) updateData.notes = notes ? String(notes) : null;
    if (amountAgreed !== undefined) {
      updateData.amountAgreed = amountAgreed === null ? null : Math.round(Number(amountAgreed));
    }
    if (trialEndsAt !== undefined) {
      updateData.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
    }
    if (currentPeriodStart !== undefined) {
      updateData.currentPeriodStart = currentPeriodStart ? new Date(currentPeriodStart) : null;
    }
    if (currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
    }

    // When transitioning to ACTIVE, set paidAt + activatedAt (if first time)
    const now = new Date();
    if (status === 'ACTIVE') {
      updateData.paidAt = now;
    }

    // ─── Upsert subscription ───────────────────────────────────────────────
    const existing = await db.subscription.findUnique({
      where: { weddingId: id },
      select: { id: true, activatedAt: true, status: true, plan: true },
    });

    let subscription;
    if (existing) {
      // Set activatedAt only on first transition to ACTIVE.
      if (status === 'ACTIVE' && !existing.activatedAt) {
        updateData.activatedAt = now;
      }
      subscription = await db.subscription.update({
        where: { weddingId: id },
        data: updateData,
        select: SUBSCRIPTION_SELECT,
      });
    } else {
      // Create with sensible defaults for required fields.
      subscription = await db.subscription.create({
        data: {
          weddingId: id,
          plan: plan ?? 'TRIAL',
          status: status ?? 'TRIALING',
          amountAgreed: amountAgreed ?? null,
          currency: currency ?? 'usd',
          billingCycle: billingCycle ?? 'MONTHLY',
          paymentMethod: paymentMethod ?? null,
          whatsappPhone: whatsappPhone ? String(whatsappPhone).trim() : null,
          notes: notes ? String(notes) : null,
          trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
          currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : null,
          currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
          paidAt: status === 'ACTIVE' ? now : null,
          activatedAt: status === 'ACTIVE' ? now : null,
        },
        select: SUBSCRIPTION_SELECT,
      });
    }

    // ─── Sync Wedding.plan when subscription becomes ACTIVE ────────────────
    // The platform dashboard computes MRR from Wedding.plan for PUBLISHED
    // weddings. When the admin marks a subscription ACTIVE (i.e. paid), we
    // promote the wedding's plan to match the subscription's plan so the
    // MRR chart reflects the new revenue.
    if (status === 'ACTIVE' && subscription.plan !== wedding.plan) {
      await db.wedding.update({
        where: { id },
        data: { plan: subscription.plan as Plan },
      });
      invalidateWeddingCache(wedding.slug);
    }

    // ─── Audit log ─────────────────────────────────────────────────────────
    const changedFields = Object.keys(updateData);
    await db.auditLog.create({
      data: {
        weddingId: null,
        userId: user!.id,
        action: existing ? 'UPDATE_SUBSCRIPTION' : 'CREATE_SUBSCRIPTION',
        details: `${existing ? 'Updated' : 'Created'} subscription for ${wedding.coupleLabel} (fields: ${changedFields.join(', ') || 'none'})`,
      },
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('Upsert subscription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
