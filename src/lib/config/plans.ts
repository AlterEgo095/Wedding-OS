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
    label: 'Essai Libre',
    tagline: 'Découvrez la plateforme, sans engagement',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'usd',
    priceMonthlyFcfa: 0,
    limits: {
      maxGuests: 20,
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
    label: 'Essentiel',
    tagline: "Tout l'essentiel pour un mariage réussi",
    priceMonthly: 4900,
    priceAnnual: 49000,
    currency: 'usd',
    priceMonthlyFcfa: 30000,
    limits: {
      maxGuests: 200,
      maxMediaBytes: 1024 * 1024 * 1024,
      maxAdmins: 2,
      customDomain: false,
      whiteLabel: false,
      luxuryEngine: true,
      musicUpload: true,
      galleryVideos: false,
    },
    trialDays: 0,
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
    popular: true,
  },
  ELITE: {
    id: 'ELITE',
    label: 'Élite',
    tagline: 'Le summum, sans limites, sans watermark',
    priceMonthly: 19900,
    priceAnnual: 199000,
    currency: 'usd',
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
