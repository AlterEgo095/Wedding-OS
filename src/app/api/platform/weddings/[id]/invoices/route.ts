export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import {
  isValidBillingCycle,
  isValidPaymentMethod,
  resolveAmountUsdCents,
  type BillingCycle,
  type PaymentMethod,
} from '@/lib/billing';
import type { Plan } from '@/lib/types';
// P2-CQ-2 + P2-SEC-3: shared MAX_PAYMENT_USD_CENTS from @/lib/constants.
import { MAX_PAYMENT_USD_CENTS } from '@/lib/constants';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

/**
 * Per-wedding invoice management (manual billing flow).
 *
 * GET  /api/platform/weddings/{id}/invoices
 *   List all invoices for the wedding, newest first.
 *
 * POST /api/platform/weddings/{id}/invoices
 *   Create a new invoice (status OPEN by default). Auto-creates the
 *   subscription record if none exists yet, so the admin can go straight
 *   from "draft wedding" to "issue invoice" in one step.
 *
 *   Body:
 *     {
 *       plan:            'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE',
 *       billingCycle?:   'MONTHLY' | 'ANNUAL' | 'ONE_TIME',   // default MONTHLY
 *       amountDue?:      number,  // USD cents; default = plan × cycle
 *       currency?:       'usd' | 'eur' | 'fcfa',
 *       paymentMethod?:  'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'OTHER',
 *       whatsappPhone?:  string,
 *       notes?:          string,
 *     }
 *
 *   Returns: { invoice, subscription }
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

const INVOICE_SELECT = {
  id: true,
  subscriptionId: true,
  weddingId: true,
  amountDue: true,
  amountPaid: true,
  currency: true,
  billingCycle: true,
  status: true,
  paymentMethod: true,
  whatsappSentAt: true,
  whatsappPhone: true,
  confirmedBy: true,
  notes: true,
  paidAt: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
      select: { id: true, slug: true, coupleLabel: true },
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 },
      );
    }

    const invoices = await db.invoice.findMany({
      where: { weddingId: id },
      orderBy: { createdAt: 'desc' },
      select: INVOICE_SELECT,
    });

    return NextResponse.json({ wedding, invoices });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List invoices error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
      select: { id: true, slug: true, coupleLabel: true, plan: true },
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Corps de requête invalide' },
        { status: 400 },
      );
    }
    const {
      plan,
      billingCycle,
      amountDue,
      currency,
      paymentMethod,
      whatsappPhone,
      notes,
    } = body;

    if (!plan || !['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'].includes(plan)) {
      return NextResponse.json(
        { error: 'plan is required (TRIAL, ESSENTIEL, PREMIUM, ELITE)' },
        { status: 400 },
      );
    }
    const cycle: BillingCycle = billingCycle && isValidBillingCycle(billingCycle)
      ? billingCycle
      : 'MONTHLY';
    if (paymentMethod && !isValidPaymentMethod(paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 },
      );
    }
    if (amountDue !== undefined) {
      const n = Number(amountDue);
      // P2-CQ-2: shared MAX_PAYMENT_USD_CENTS constant.
      if (!Number.isFinite(n) || n < 0 || n > MAX_PAYMENT_USD_CENTS) {
        return NextResponse.json(
          { error: 'amountDue must be a positive integer (USD cents) ≤ 1 000 000' },
          { status: 400 },
        );
      }
    }

    const resolvedAmount =
      amountDue !== undefined
        ? Math.round(Number(amountDue))
        : resolveAmountUsdCents(plan as Plan, null, cycle);

    // ─── Upsert subscription + create invoice atomically ───────────────────
    const result = await db.$transaction(async (tx) => {
      let subscription = await tx.subscription.findUnique({
        where: { weddingId: id },
        // P3: include `currency` so the update branch can read the prior value.
        select: { id: true, plan: true, status: true, currency: true },
      });

      if (!subscription) {
        subscription = await tx.subscription.create({
          data: {
            weddingId: id,
            plan,
            status: 'PENDING_PAYMENT',
            billingCycle: cycle,
            currency: currency ?? 'usd',
            amountAgreed: resolvedAmount > 0 ? resolvedAmount : null,
            paymentMethod: paymentMethod ?? null,
            whatsappPhone: whatsappPhone ? String(whatsappPhone).trim() : null,
            notes: notes ? String(notes) : null,
          },
          select: { id: true, plan: true, status: true, currency: true },
        });
      } else {
        // Sync the subscription with the new invoice being issued.
        subscription = await tx.subscription.update({
          where: { weddingId: id },
          data: {
            plan,
            billingCycle: cycle,
            currency: currency ?? subscription?.currency ?? 'usd',
            amountAgreed: resolvedAmount > 0 ? resolvedAmount : null,
            status: 'PENDING_PAYMENT',
            paymentMethod: paymentMethod ?? null,
            whatsappPhone: whatsappPhone ? String(whatsappPhone).trim() : null,
            notes: notes ? String(notes) : null,
          },
          select: { id: true, plan: true, status: true, currency: true },
        });
      }

      const invoice = await tx.invoice.create({
        data: {
          subscriptionId: subscription.id,
          weddingId: id,
          amountDue: resolvedAmount,
          amountPaid: 0,
          currency: currency ?? 'usd',
          billingCycle: cycle,
          status: 'OPEN',
          paymentMethod: paymentMethod ?? null,
          whatsappPhone: whatsappPhone ? String(whatsappPhone).trim() : null,
          notes: notes ? String(notes) : null,
        },
        select: INVOICE_SELECT,
      });

      return { subscription, invoice };
    });

    // ─── Audit log (outside transaction — best-effort) (P2-SEC-14) ───────
    await writeAuditLog({
      weddingId: id,
      userId: user!.id,
      action: 'CREATE_INVOICE',
      details: `Created invoice $${(resolvedAmount / 100).toFixed(2)} for ${wedding.coupleLabel} (plan: ${plan}, cycle: ${cycle})`,
      request,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Create invoice error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
