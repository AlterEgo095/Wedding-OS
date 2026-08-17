// ══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CONFIGURATION — Subscription Plans
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 5 — Single source of truth for plan definitions, pricing,
// and usage limits. Mirrors docs/PLAN_MULTI_TENANT.md (ADR-6).
// ══════════════════════════════════════════════════════════════════════════════

export type PlanId = 'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE';

export interface PlanDefinition {
  id: PlanId;
  label: string;
  tagline: string;
  priceMonthly: number | null;
  priceAnnual: number | null;
  currency: 'usd' | 'eur' | 'fcfa';
  priceMonthlyFcfa: number | null;
  limits: {
    maxGuests: number;
    maxMediaBytes: number;
    maxAdmins: number;
    customDomain: boolean;
    whiteLabel: boolean;
    luxuryEngine: boolean;
    musicUpload: boolean;
    galleryVideos: boolean;
  };
  trialDays: number;
  popular?: boolean;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  TRIAL: {
    id: 'TRIAL',
    label: 'Starter',
    tagline: 'Pour les mariages intimes',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'eur',
    priceMonthlyFcfa: 0,
    limits: {
      maxGuests: 50,
      maxMediaBytes: 100 * 1024 * 1024,
      maxAdmins: 1,
      customDomain: false,
      whiteLabel: false,
      luxuryEngine: false,
      musicUpload: false,
      galleryVideos: false,
    },
    trialDays: 14,
  },
  ESSENTIEL: {
    id: 'ESSENTIEL',
    label: 'Pro',
    tagline: 'Pour la plupart des couples',
    priceMonthly: 4900,
    priceAnnual: 49000,
    currency: 'eur',
    priceMonthlyFcfa: 30000,
    limits: {
      maxGuests: 300,
      maxMediaBytes: 1024 * 1024 * 1024,
      maxAdmins: 2,
      customDomain: false,
      whiteLabel: false,
      luxuryEngine: true,
      musicUpload: true,
      galleryVideos: false,
    },
    trialDays: 0,
    popular: true,
  },
  PREMIUM: {
    id: 'PREMIUM',
    label: 'Premium',
    tagline: "L'expérience complète avec domaine personnalisé",
    priceMonthly: 9900,
    priceAnnual: 99000,
    currency: 'usd',
    priceMonthlyFcfa: 60000,
    limits: {
      maxGuests: 500,
      maxMediaBytes: 5 * 1024 * 1024 * 1024,
      maxAdmins: 5,
      customDomain: true,
      whiteLabel: false,
      luxuryEngine: true,
      musicUpload: true,
      galleryVideos: true,
    },
    trialDays: 0,
    // PREMIUM is NOT publicly surfaced — kept for backward compatibility.
  },
  ELITE: {
    id: 'ELITE',
    label: 'Studio',
    tagline: 'Pour les wedding planners',
    priceMonthly: 19900,
    priceAnnual: 199000,
    currency: 'eur',
    priceMonthlyFcfa: 120000,
    limits: {
      maxGuests: -1,
      maxMediaBytes: 20 * 1024 * 1024 * 1024,
      maxAdmins: -1,
      customDomain: true,
      whiteLabel: true,
      luxuryEngine: true,
      musicUpload: true,
      galleryVideos: true,
    },
    trialDays: 0,
  },
};

export const PLAN_ORDER: PlanId[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'];

export function getPlan(planId: string): PlanDefinition {
  return PLANS[planId as PlanId] ?? PLANS.TRIAL;
}

export function planSupportsCustomDomain(planId: string): boolean {
  return getPlan(planId).limits.customDomain;
}

export function planSupportsWhiteLabel(planId: string): boolean {
  return getPlan(planId).limits.whiteLabel;
}

export function formatPrice(cents: number | null, currency: string): string {
  if (cents === null || cents === 0) return 'Gratuit';
  const value = cents / 100;
  switch (currency) {
    case 'eur':
      return `${value.toLocaleString('fr-FR')} €`;
    case 'fcfa':
      return `${value.toLocaleString('fr-FR')} FCFA`;
    case 'usd':
    default:
      return `$${value.toLocaleString('en-US')}`;
  }
}
