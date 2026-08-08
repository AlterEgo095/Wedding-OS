export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/lib/billing';
import { logger } from '@/lib/logger';

/**
 * GET /api/platform/invoices
 *
 * Platform-wide invoice list with filters, for the Billing overview tab.
 *
 * Query params:
 *   status:    'OPEN' | 'PAID' | 'VOID' | 'ALL'  (default: ALL)
 *   weddingId: filter by wedding (default: all)
 *   search:    search across coupleLabel + invoice id (default: '')
 *   limit:     page size (default 50, max 200)
 *   offset:    page offset (default 0)
 *
 * Returns:
 *   {
 *     invoices: Array<{
 *       id, amountDue, amountPaid, currency, billingCycle, status,
 *       paymentMethod, whatsappSentAt, whatsappPhone, paidAt, createdAt,
 *       notes,
 *       wedding: { id, slug, coupleLabel, plan, status },
 *       subscription: { id, plan, status, billingCycle },
 *     }>,
 *     total, summary: { open, paid, void, totalUsd, paidUsd }
 *   }
 */

const VALID_STATUSES = Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[];

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'ALL';
    const weddingIdFilter = url.searchParams.get('weddingId') || null;
    const search = url.searchParams.get('search')?.trim() || '';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    const where: Record<string, unknown> = {};
    if (statusFilter !== 'ALL' && VALID_STATUSES.includes(statusFilter as InvoiceStatus)) {
      where.status = statusFilter;
    }
    if (weddingIdFilter) {
      where.weddingId = weddingIdFilter;
    }
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { wedding: { coupleLabel: { contains: search } } },
        { wedding: { slug: { contains: search } } },
      ];
    }

    const [invoices, total, allForSummary] = await Promise.all([
      db.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          amountDue: true,
          amountPaid: true,
          currency: true,
          billingCycle: true,
          status: true,
          paymentMethod: true,
          whatsappSentAt: true,
          whatsappPhone: true,
          paidAt: true,
          createdAt: true,
          notes: true,
          wedding: {
            select: { id: true, slug: true, coupleLabel: true, plan: true, status: true },
          },
          subscription: {
            select: { id: true, plan: true, status: true, billingCycle: true },
          },
        },
      }),
      db.invoice.count({ where }),
      db.invoice.findMany({
        select: { status: true, amountDue: true, currency: true },
      }),
    ]);

    // ─── Summary by status ─────────────────────────────────────────────────
    const summary = {
      open: allForSummary.filter((i) => i.status === 'OPEN').length,
      paid: allForSummary.filter((i) => i.status === 'PAID').length,
      void: allForSummary.filter((i) => i.status === 'VOID').length,
      totalUsd: allForSummary.reduce((sum, i) => sum + i.amountDue, 0),
      paidUsd: allForSummary
        .filter((i) => i.status === 'PAID')
        .reduce((sum, i) => sum + i.amountDue, 0),
    };

    return NextResponse.json({ invoices, total, summary });
  } catch (error) {
    logger.error('List platform invoices error', { err: error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
