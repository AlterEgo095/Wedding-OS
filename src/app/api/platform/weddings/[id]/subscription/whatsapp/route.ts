export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import {
  buildWhatsAppMessage,
  buildWhatsAppDeeplink,
  resolveAmountUsdCents,
  type BillingCycle,
} from '@/lib/billing';
import type { Plan } from '@/lib/types';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

/**
 * POST /api/platform/weddings/{id}/subscription/whatsapp
 *
 * Generates a prefilled WhatsApp deeplink containing the offer message for
 * the couple. Does NOT persist anything by itself — the admin is expected
 * to first save the subscription via PUT, then call this endpoint to get
 * the deeplink.
 *
 * Body (all optional — falls back to the saved subscription values):
 *   {
 *     plan?:            'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE',
 *     amountAgreed?:    number | null,   // USD cents; null = use plan default
 *     billingCycle?:    'MONTHLY' | 'ANNUAL' | 'ONE_TIME',
 *     currency?:        'usd' | 'eur' | 'fcfa',
 *     whatsappPhone?:   string | null,   // override saved phone
 *     notes?:           string | null,   // extra note appended to message
 *   }
 *
 * Returns:
 *   {
 *     url:        string,   // https://wa.me/<digits>?text=<encoded>
 *     message:    string,   // full prefilled body (for preview)
 *     recipient:  string | null,  // normalised phone, or null if user picks recipient
 *   }
 *
 * Side effect: if a subscription exists, the whatsappPhone is synced.
 * Additionally, the most recent OPEN invoice for this wedding gets its
 * `whatsappSentAt` timestamp stamped (so the admin can see "last WhatsApp
 * sent" in the UI). Both writes are best-effort — the deeplink is always
 * returned even if the persistence layer fails.
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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

    const body = await request.json().catch(() => ({}));
    const subscription = await db.subscription.findUnique({
      where: { weddingId: id },
      select: {
        plan: true,
        amountAgreed: true,
        currency: true,
        billingCycle: true,
        whatsappPhone: true,
        notes: true,
      },
    });

    // ─── Resolve effective values (body overrides subscription) ────────────
    const plan = (body.plan ?? subscription?.plan ?? wedding.plan) as Plan;
    const amountAgreed =
      body.amountAgreed !== undefined
        ? body.amountAgreed
        : subscription?.amountAgreed ?? null;
    const billingCycle = (body.billingCycle ?? subscription?.billingCycle ?? 'MONTHLY') as BillingCycle;
    const currency = body.currency ?? subscription?.currency ?? 'usd';
    const whatsappPhone =
      body.whatsappPhone !== undefined
        ? body.whatsappPhone
        : subscription?.whatsappPhone ?? null;
    const notes = body.notes !== undefined ? body.notes : subscription?.notes ?? null;

    const amountUsdCents = resolveAmountUsdCents(plan, amountAgreed, billingCycle);

    // ─── Build the prefilled WhatsApp message ──────────────────────────────
    const message = buildWhatsAppMessage({
      coupleLabel: wedding.coupleLabel || 'Mariage',
      plan,
      amountUsdCents,
      billingCycle,
      currency,
      weddingSlug: wedding.slug,
      notes,
    });

    const { url, recipient } = buildWhatsAppDeeplink(whatsappPhone, message);

    // ─── Stamp whatsappSentAt + sync whatsappPhone (best-effort) ────────
    // Phase 3 ÉTAPE 6: previously the docstring promised `whatsappSentAt`
    // would be stamped, but the code only updated `whatsappPhone`. The
    // `whatsappSentAt` column lives on Invoice (not Subscription), so we
    // stamp it on the most recent OPEN invoice for this wedding. If no OPEN
    // invoice exists yet (e.g. admin is sending the offer before creating
    // the first invoice), the timestamp simply isn't written — the deeplink
    // is still returned. Both writes are wrapped in try/catch so a DB error
    // never blocks the WhatsApp flow.
    if (subscription) {
      try {
        await db.subscription.update({
          where: { weddingId: id },
          data: { whatsappPhone: whatsappPhone ?? subscription.whatsappPhone },
        });
      } catch {
        // Non-fatal — we still return the deeplink.
      }
    }
    try {
      await db.invoice.updateMany({
        where: { weddingId: id, status: 'OPEN' },
        data: { whatsappSentAt: new Date() },
      });
    } catch {
      // Non-fatal — we still return the deeplink.
    }

    // ─── Audit log ─────────────────────────────────────────────────────────
    // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: id,
      userId: user!.id,
      action: 'BILLING_WHATSAPP_SENT',
      details: `Generated WhatsApp billing message for ${wedding.coupleLabel} (plan: ${plan}, amount: $${(amountUsdCents / 100).toFixed(2)}, recipient: ${recipient ?? 'unspecified'})`,
      request,
    });

    return NextResponse.json({
      url,
      message,
      recipient,
      plan,
      amountUsdCents,
      billingCycle,
      currency,
    });
  } catch (error) {
    console.error('WhatsApp deeplink error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
