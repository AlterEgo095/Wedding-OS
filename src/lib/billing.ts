// ══════════════════════════════════════════════════════════════════════════════
// Phase 6 — Manual WhatsApp-driven billing helpers
// ══════════════════════════════════════════════════════════════════════════════
//
// The platform admin negotiates a price with the couple based on the services
// included in the chosen plan, sends a prefilled WhatsApp message containing
// the offer + payment instructions, and manually marks the invoice PAID once
// payment is received outside the platform (mobile money, bank transfer, cash).
//
// No payment gateway is wired up — Stripe columns are reserved for a future
// opt-in migration.

import { PLAN_METADATA, PLAN_LIMITS, type Plan } from './types';

// ─── Conversion constants ─────────────────────────────────────────────────────

/** Conversion rate: 1 USD = 600 FCFA (configurable per deployment). */
export const FCFA_TO_USD_RATE = 600;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'TRIALING'
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELED'
  | 'EXPIRED';

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';

export type BillingCycle = 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';

export type PaymentMethod = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'OTHER';

// ─── Display metadata ─────────────────────────────────────────────────────────

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: 'Essai en cours',
  PENDING_PAYMENT: 'Paiement en attente',
  ACTIVE: 'Actif',
  PAST_DUE: 'En retard',
  SUSPENDED: 'Suspendu',
  CANCELED: 'Annulé',
  EXPIRED: 'Expiré',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  OPEN: 'À payer',
  PAID: 'Payée',
  VOID: 'Annulée',
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: 'Mensuel',
  ANNUAL: 'Annuel (2 mois offerts)',
  ONE_TIME: 'Paiement unique',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement bancaire',
  CASH: 'Espèces',
  OTHER: 'Autre',
};

export const SUBSCRIPTION_STATUS_VALUES = Object.keys(
  SUBSCRIPTION_STATUS_LABELS,
) as SubscriptionStatus[];

export const BILLING_CYCLE_VALUES = Object.keys(
  BILLING_CYCLE_LABELS,
) as BillingCycle[];

export const PAYMENT_METHOD_VALUES = Object.keys(
  PAYMENT_METHOD_LABELS,
) as PaymentMethod[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the effective price for a subscription in USD cents.
 *
 * - If `amountAgreed` is set on the subscription, use it as-is (admin-negotiated
 *   custom price, already in USD cents).
 * - Otherwise, fall back to the canonical plan price from PLAN_METADATA
 *   (which is stored in USD dollars) and convert to cents by ×100.
 *
 * Annual billing = 10× monthly (2 months off). One-time = same as monthly
 * (treated as a single-payment plan; admin can override via amountAgreed).
 */
export function resolveAmountUsdCents(
  plan: Plan,
  amountAgreed: number | null | undefined,
  billingCycle: BillingCycle = 'MONTHLY',
): number {
  if (amountAgreed != null && amountAgreed > 0) {
    return amountAgreed;
  }
  const monthlyUsd = PLAN_METADATA[plan]?.priceUsd ?? 0;
  if (monthlyUsd === 0) return 0;
  const monthlyCents = monthlyUsd * 100;
  return billingCycle === 'ANNUAL' ? monthlyCents * 10 : monthlyCents;
}

/**
 * Convert USD cents to FCFA (approximate fixed rate: 1 USD ≈ FCFA_TO_USD_RATE FCFA).
 * Used only for display in the WhatsApp message.
 */
export function usdCentsToFcfa(usdCents: number): number {
  const usd = usdCents / 100;
  return Math.round(usd * FCFA_TO_USD_RATE);
}

/**
 * Format a human-readable price string, e.g. "$99.00 / mois" or "30 000 FCFA (unique)".
 */
export function formatPrice(
  usdCents: number,
  billingCycle: BillingCycle = 'MONTHLY',
  currency: 'usd' | 'eur' | 'fcfa' = 'usd',
): string {
  if (usdCents === 0) return 'Gratuit';
  const usd = (usdCents / 100).toFixed(2);
  const fcfa = usdCentsToFcfa(usdCents).toLocaleString('fr-FR');
  const cycleSuffix =
    billingCycle === 'MONTHLY'
      ? '/ mois'
      : billingCycle === 'ANNUAL'
        ? '/ an'
        : ' (paiement unique)';
  if (currency === 'fcfa') return `${fcfa} FCFA${cycleSuffix}`;
  return `$${usd}${cycleSuffix} (${fcfa} FCFA)`;
}

/**
 * Build the list of services included for a plan, as a bullet list (FR).
 * Used both in the UI and in the WhatsApp message body.
 */
export function getPlanServices(plan: Plan): string[] {
  const limits = PLAN_LIMITS[plan];
  const meta = PLAN_METADATA[plan];
  const services: string[] = [];

  services.push(
    limits.guests === -1
      ? 'Invités : illimités'
      : `Invités : jusqu'à ${limits.guests}`,
  );

  const formatBytes = (b: number) => {
    if (b === -1) return 'illimité';
    if (b >= 1024 * 1024 * 1024) return `${b / (1024 * 1024 * 1024)} Go`;
    if (b >= 1024 * 1024) return `${b / (1024 * 1024)} Mo`;
    return `${b} octets`;
  };
  services.push(`Médias : ${formatBytes(limits.mediaBytes)}`);

  services.push(
    limits.admins === -1
      ? 'Comptes staff : illimités'
      : `Comptes staff : jusqu'à ${limits.admins}`,
  );

  services.push(`Domaine personnalisé : ${limits.customDomain ? 'oui' : 'non'}`);

  services.push(
    `Prix indicatif : ${meta.priceUsd === 0 ? 'gratuit' : `$${meta.priceUsd}/mois`}`,
  );

  return services;
}

// ─── WhatsApp deeplink generation ─────────────────────────────────────────────

/**
 * Default payment instructions appended to every WhatsApp message.
 * Editable via env vars (BILLING_MOBILE_MONEY_PHONE, BILLING_BANK_IBAN,
 * BILLING_CASH_ADDRESS) so the admin can customise per deployment.
 */
const PAYMENT_INSTRUCTIONS: string[] = [
  '💳 Modes de paiement acceptés :',
  `• Mobile Money (M-Pesa, Airtel Money, Orange Money) : ${process.env.BILLING_MOBILE_MONEY_PHONE ?? '+243 970 000 000'}`,
  `• Virement bancaire : ${process.env.BILLING_BANK_IBAN ?? 'nous contacter pour les coordonnées'}`,
  `• Espèces : ${process.env.BILLING_CASH_ADDRESS ?? 'Kinshasa — rendez-vous à convenir'}`,
];

export interface WhatsAppMessageInput {
  coupleLabel: string;
  plan: Plan;
  amountUsdCents: number;
  billingCycle: BillingCycle;
  currency?: 'usd' | 'eur' | 'fcfa';
  weddingSlug: string;
  publicBaseUrl?: string; // e.g. https://wedding.hpph.net
  notes?: string | null;
}

/**
 * Build the prefilled WhatsApp message body (FR).
 *
 * Structure:
 *   1. Greeting + couple label
 *   2. Plan + price summary + billing cycle
 *   3. Services included (bullet list)
 *   4. Payment instructions
 *   5. Wedding public link
 *   6. Closing + optional admin notes
 */
export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const {
    coupleLabel,
    plan,
    amountUsdCents,
    billingCycle,
    currency = 'usd',
    weddingSlug,
    publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wedding.aenews.store',
    notes,
  } = input;

  const planLabel = PLAN_METADATA[plan]?.label ?? plan;
  const priceStr = formatPrice(amountUsdCents, billingCycle, currency);
  const cycleLabel = BILLING_CYCLE_LABELS[billingCycle];
  const services = getPlanServices(plan);
  const weddingUrl = `${publicBaseUrl.replace(/\/$/, '')}/w/${weddingSlug}`;

  const lines: string[] = [];
  lines.push(`Bonjour ${coupleLabel} ! 💍`);
  lines.push('');
  lines.push('Voici votre offre Heureux Mariage :');
  lines.push('');
  lines.push(`📋 Plan : ${planLabel}`);
  lines.push(`💰 Prix : ${priceStr}`);
  lines.push(`🔄 Facturation : ${cycleLabel}`);
  lines.push('');
  lines.push('✨ Services inclus :');
  for (const s of services) lines.push(`• ${s}`);
  lines.push('');
  lines.push(...PAYMENT_INSTRUCTIONS);
  lines.push('');
  lines.push(`🔗 Lien de votre mariage : ${weddingUrl}`);
  lines.push('');
  lines.push(
    'Pour confirmer votre souscription, contactez-nous dès que possible. Merci de votre confiance ! 🙏',
  );

  if (notes && notes.trim()) {
    lines.push('');
    lines.push(`📝 Note : ${notes.trim()}`);
  }

  return lines.join('\n');
}

/**
 * Build a wa.me deeplink URL with a prefilled message.
 *
 * Accepts the recipient phone in either:
 *   - E.164 format (e.g. "+243970000000")  → wa.me/243970000000
 *   - Local format    (e.g. "0970000000")  → wa.me/243970000000 (DRC fallback)
 *   - Empty / null    → wa.me/?text=... (user picks recipient in WhatsApp)
 */
export function buildWhatsAppDeeplink(
  phone: string | null | undefined,
  message: string,
): { url: string; recipient: string | null } {
  const encoded = encodeURIComponent(message);

  if (!phone || !phone.trim()) {
    return {
      url: `https://wa.me/?text=${encoded}`,
      recipient: null,
    };
  }

  // Strip everything except digits.
  let digits = phone.replace(/[^\d]/g, '');

  // If it doesn't start with a country code, assume DRC (+243).
  // Local DRC numbers are 9 digits starting with 8 or 9.
  if (digits.length === 9 && (digits.startsWith('8') || digits.startsWith('9'))) {
    digits = `243${digits}`;
  }
  // If it starts with 00, strip the leading 00.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  return {
    url: `https://wa.me/${digits}?text=${encoded}`,
    recipient: `+${digits}`,
  };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function isValidPlan(value: string): value is Plan {
  return value === 'TRIAL' || value === 'ESSENTIEL' || value === 'PREMIUM' || value === 'ELITE';
}

export function isValidBillingCycle(value: string): value is BillingCycle {
  return value === 'MONTHLY' || value === 'ANNUAL' || value === 'ONE_TIME';
}

export function isValidPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_VALUES.includes(value as PaymentMethod);
}

export function isValidSubscriptionStatus(value: string): value is SubscriptionStatus {
  return SUBSCRIPTION_STATUS_VALUES.includes(value as SubscriptionStatus);
}
