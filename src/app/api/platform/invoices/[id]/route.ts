export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { invalidateWeddingCache } from '@/lib/tenant-context';
import { isValidPaymentMethod } from '@/lib/billing';
import type { Plan } from '@/lib/types';
// P2-CQ-5: standardised API errors.
import { badRequest } from '@/lib/api-errors';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * PUT /api/platform/invoices/{id}
 *
 * Update an invoice's status / payment metadata. The two main flows are:
 *
 *   1. Mark as PAID:
 *      { status: 'PAID', paymentMethod?: 'MOBILE_MONEY' | ..., notes?: string }
 *      → sets status=PAID, paidAt=now, confirmedBy=user.id, amountPaid=amountDue
 *      → also marks the subscription ACTIVE + paidAt + activatedAt (first time)
 *      → also writes the subscription's plan back onto Wedding.plan so the
 *        dashboard MRR reflects the new revenue
 *
 *   2. Mark as VOID:
 *      { status: 'VOID', notes?: string }
 *      → sets status=VOID (no other side effects)
 *
 *   3. Reopen (VOID/PAID → OPEN):
 *      { status: 'OPEN' }
 *      → only allowed if not already paid (idempotent guard)
 *
 *   Body may also update: paymentMethod, whatsappPhone, notes, amountPaid.
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

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const invoice = await db.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        subscriptionId: true,
        weddingId: true,
        amountDue: true,
        status: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) return badRequest('Corps de requête invalide');
    const { status, paymentMethod, whatsappPhone, notes, amountPaid } = body;

    if (status !== undefined && !['OPEN', 'PAID', 'VOID'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid invoice status. Must be OPEN, PAID, or VOID' },
        { status: 400 },
      );
    }
    if (paymentMethod !== undefined && paymentMethod !== null && !isValidPaymentMethod(paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (whatsappPhone !== undefined) updateData.whatsappPhone = whatsappPhone ? String(whatsappPhone).trim() : null;
    if (notes !== undefined) updateData.notes = notes ? String(notes) : null;
    if (amountPaid !== undefined) {
      const n = Number(amountPaid);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: 'amountPaid must be ≥ 0' },
          { status: 400 },
        );
      }
      updateData.amountPaid = Math.round(n);
    }

    // ─── Handle status transitions ─────────────────────────────────────────
    const now = new Date();

    if (status === 'PAID') {
      if (invoice.status === 'PAID') {
        // Idempotent — return current invoice unchanged.
        const current = await db.invoice.findUnique({
          where: { id },
          select: INVOICE_SELECT,
        });
        return NextResponse.json({ invoice: current });
      }
      updateData.status = 'PAID';
      updateData.paidAt = now;
      updateData.confirmedBy = user!.id;
      // Default amountPaid to the full amount due if not specified.
      if (amountPaid === undefined) {
        updateData.amountPaid = invoice.amountDue;
      }

      // ─── Side effects: subscription ACTIVE + Wedding.plan sync ─────────
      const sub = await db.subscription.findUnique({
        where: { id: invoice.subscriptionId },
        select: { id: true, plan: true, activatedAt: true, weddingId: true },
      });

      const wedding = await db.wedding.findUnique({
        where: { id: invoice.weddingId },
        select: { id: true, slug: true, plan: true, coupleLabel: true },
      });

      if (sub && wedding) {
        const subUpdate: Record<string, unknown> = {
          status: 'ACTIVE',
          paidAt: now,
        };
        if (!sub.activatedAt) subUpdate.activatedAt = now;

        await db.subscription.update({
          where: { id: sub.id },
          data: subUpdate,
        });

        // Promote Wedding.plan to match the paid subscription's plan so
        // the dashboard MRR chart reflects the new revenue.
        if (sub.plan !== wedding.plan) {
          await db.wedding.update({
            where: { id: wedding.id },
            data: { plan: sub.plan as Plan },
          });
          invalidateWeddingCache(wedding.slug);
        }
      }
    } else if (status === 'VOID') {
      updateData.status = 'VOID';
    } else if (status === 'OPEN') {
      // Reopen — allowed only from VOID (cannot reopen a PAID invoice).
      if (invoice.status === 'PAID') {
        return NextResponse.json(
          { error: 'Cannot reopen a paid invoice. Create a new one instead.' },
          { status: 400 },
        );
      }
      updateData.status = 'OPEN';
      updateData.paidAt = null;
      updateData.confirmedBy = null;
    }

    const updated = await db.invoice.update({
      where: { id },
      data: updateData,
      select: INVOICE_SELECT,
    });

    // ─── Audit log ─────────────────────────────────────────────────────────
    const action =
      status === 'PAID' ? 'INVOICE_MARKED_PAID'
      : status === 'VOID' ? 'INVOICE_VOIDED'
      : 'UPDATE_INVOICE';
    // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: invoice.weddingId,
      userId: user!.id,
      action,
      details: `Invoice ${id} ${status === 'PAID' ? 'marked paid' : status === 'VOID' ? 'voided' : 'updated'} ($${(invoice.amountDue / 100).toFixed(2)} ${updated.currency})`,
      request,
    });

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    logger.error('Update invoice error', { err: error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
