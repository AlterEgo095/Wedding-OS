// ══════════════════════════════════════════════════════════════════════════════
// src/components/marketing/PricingSection.tsx — UNIFIED PRICING (Mission 5.9.5 fix3)
// ══════════════════════════════════════════════════════════════════════════════
// Single source of truth for the homepage pricing block.
//
// 3 coherent pricing surfaces (all in USD):
//   A. Subscriptions     — 4 tiers ($0/$49/$99/$199 monthly)   — for couples
//   B. Invitation Packs   — tiered ($0.70/inv ≤250, $0.50/inv >250)  — one-shot
//   C. Reseller Packages   — flat $0.50/inv (Agence/Revendeur/Wedding Planner)
//   D. "Comment choisir"   — comparison table + decision tree + FAQ
//
// BACKEND SOURCE OF TRUTH:
//   - Subscription tiers + limits:  src/lib/config/plans.ts (PLANS, PLAN_ORDER)
//   - Per-invitation tiered price: src/lib/pricing-engine.ts (DEFAULT_CONFIG)
//   - Reseller flat price:         src/lib/pricing-engine.ts (AGENCY/RESELLER/WEDDING_PLANNER)
//   - Marketing copy here is intentionally hand-curated (≠ raw backend object dump)
//     to keep copywriter freedom and decouple marketing from backend renames.
//
// Server Component (no 'use client'). Uses the `.premium-card` reveal class
// on block headers (respects prefers-reduced-motion). All CTAs are <Link>
// pointing to /onboarding (the wizard pre-selects PREMIUM by default).
//
// Currency: USD everywhere — no € symbol anywhere in this file.
// ══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import {
  Check, Crown, Sparkles, Heart, Diamond, Building2, Store,
  CalendarHeart, Users, ArrowRight, Info,
} from 'lucide-react'

// ══════════════════════════════════════════════════════════════════════════════
// DATA — SUBSCRIPTION PLANS
// ══════════════════════════════════════════════════════════════════════════════

interface SubscriptionPlan {
  id: 'trial' | 'essentiel' | 'premium' | 'elite'
  name: string
  tagline: string
  priceLabel: string
  period: string
  badge?: string
  icon: LucideIcon
  features: readonly string[]
  ctaLabel: string
  ctaHref: string
  ctaPrimary: boolean
}

const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    id: 'trial',
    name: 'Essai Libre',
    tagline: 'Pour découvrir la plateforme',
    priceLabel: 'Gratuit',
    period: '',
    icon: Sparkles,
    features: [
      '20 invités',
      '100 Mo de médias',
      '1 compte staff',
      'Page de mariage de base',
      'Support email',
    ],
    ctaLabel: 'Commencer gratuitement',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
  {
    id: 'essentiel',
    name: 'Essentiel',
    tagline: 'Pour les mariages intimes',
    priceLabel: '$49',
    period: '/ mois',
    icon: Heart,
    features: [
      '200 invités',
      '1 Go de médias',
      '2 comptes staff',
      'Invitation digitale complète',
      'QR code & check-in',
      'Livre d’or numérique',
    ],
    ctaLabel: 'Choisir Essentiel',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: "L'expérience complète, domaine perso inclus",
    priceLabel: '$99',
    period: '/ mois',
    badge: 'Le plus populaire',
    icon: Crown,
    features: [
      '500 invités',
      '5 Go de médias',
      '5 comptes staff',
      'Domaine personnalisé inclus',
      'Invitation digitale de luxe',
      'Galerie vidéos HD',
      'Support prioritaire',
    ],
    ctaLabel: 'Choisir Premium',
    ctaHref: '/onboarding',
    ctaPrimary: true,
  },
  {
    id: 'elite',
    name: 'Élite',
    tagline: 'Sans limites, white-label, support dédié',
    priceLabel: '$199',
    period: '/ mois',
    icon: Diamond,
    features: [
      'Invités illimités',
      '20 Go de médias',
      'Comptes staff illimités',
      'White-label (votre marque)',
      'Account manager dédié',
      'Support 24/7',
    ],
    ctaLabel: 'Choisir Élite',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
] as const

// ══════════════════════════════════════════════════════════════════════════════
// DATA — INVITATION PACKS (tiered per-invitation pricing)
// ══════════════════════════════════════════════════════════════════════════════

interface InvitationPack {
  id: 'standard' | 'volume'
  name: string
  tagline: string
  pricePerInviteLabel: string
  rangeLabel: string
  badge?: string
  examples: readonly { count: number; total: string }[]
  features: readonly string[]
  ctaLabel: string
  ctaHref: string
  ctaPrimary: boolean
}

const INVITATION_PACKS: readonly InvitationPack[] = [
  {
    id: 'standard',
    name: 'Pack Standard',
    tagline: 'Pour les mariages de taille classique',
    pricePerInviteLabel: '$0,70 / invité',
    rangeLabel: '1 à 250 invitations',
    examples: [
      { count: 100, total: '$70' },
      { count: 200, total: '$140' },
      { count: 250, total: '$175' },
    ],
    features: [
      'Paiement unique, pas d’abonnement mensuel',
      'Toutes les fonctionnalités de la page de mariage',
      'QR code & RSVP inclus',
      'Support email + WhatsApp',
      'Annulation gratuite avant envoi',
    ],
    ctaLabel: 'Demander ce pack',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
  {
    id: 'volume',
    name: 'Pack Volume',
    tagline: 'Pour les grands mariages et célébrations',
    pricePerInviteLabel: '$0,50 / invité',
    rangeLabel: '251 invitations et +',
    badge: 'Meilleur tarif dès 251 invités',
    examples: [
      { count: 251, total: '$125,50' },
      { count: 500, total: '$250' },
      { count: 1000, total: '$500' },
    ],
    features: [
      'Tarif dégressif automatique',
      '≈ 30 % de réduction vs Pack Standard',
      'Tableau de bord invités complet',
      'Support WhatsApp dédié',
      'Export invités PDF/CSV inclus',
    ],
    ctaLabel: 'Demander ce pack',
    ctaHref: '/onboarding',
    ctaPrimary: true,
  },
] as const

// ══════════════════════════════════════════════════════════════════════════════
// DATA — RESELLER PACKAGES (flat $0.50/invitation)
// ══════════════════════════════════════════════════════════════════════════════

interface ResellerPackage {
  id: 'agence' | 'revendeur' | 'planner'
  name: string
  audienceLabel: string
  pricePerInviteLabel: string
  badge?: string
  icon: LucideIcon
  features: readonly string[]
  ctaLabel: string
  ctaHref: string
  ctaPrimary: boolean
}

const RESELLER_PACKAGES: readonly ResellerPackage[] = [
  {
    id: 'agence',
    name: 'Agence',
    audienceLabel: 'Pour les agences & maisons d’événementiel',
    pricePerInviteLabel: '$0,50 / invité — tarif plat',
    badge: 'Recommandé',
    icon: Building2,
    features: [
      'Multi-organisations',
      'White-label (votre marque, votre domaine)',
      'Account manager dédié',
      'Statistiques consolidées',
      'Facturation centralisée',
      'Support prioritaire 7j/7',
    ],
    ctaLabel: 'Devenir agence partenaire',
    ctaHref: '/onboarding',
    ctaPrimary: true,
  },
  {
    id: 'revendeur',
    name: 'Revendeur',
    audienceLabel: 'Pour les revendeurs & apporteurs d’affaires',
    pricePerInviteLabel: '$0,50 / invité — tarif plat',
    icon: Store,
    features: [
      'Revente à vos clients finaux',
      'Commission sur chaque mariage',
      'Tableau de bord revendeur',
      'Parrainage de couples',
      'Revenus récurrents',
      'Support revendeur dédié',
    ],
    ctaLabel: 'Devenir revendeur',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
  {
    id: 'planner',
    name: 'Wedding Planner',
    audienceLabel: 'Pour les wedding planners indépendants',
    pricePerInviteLabel: '$0,50 / invité — tarif plat',
    icon: CalendarHeart,
    features: [
      'Gestion de mariages multiples',
      'Espace client par couple',
      'Workflow de production',
      'Calendrier consolidé',
      'Templates de pages réutilisables',
      'Onboarding accéléré',
    ],
    ctaLabel: 'Devenir wedding planner partenaire',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
] as const

// ══════════════════════════════════════════════════════════════════════════════
// DATA — COMPARISON TABLE (Abonnement vs Pack vs Reseller)
// ══════════════════════════════════════════════════════════════════════════════

interface ComparisonRow {
  criterion: string
  sub: string
  pack: string
  reseller: string
  bestFit?: boolean
}

const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    criterion: 'Type de paiement',
    sub: 'Mensuel récurrent',
    pack: 'Paiement unique (one-shot)',
    reseller: 'À l’invité envoyé (plat)',
  },
  {
    criterion: 'Public visé',
    sub: 'Couple (1 mariage)',
    pack: 'Couple (1 mariage, gros volume)',
    reseller: 'Agence / revendeur / planner',
  },
  {
    criterion: 'Nombre de mariages',
    sub: '1 mariage par compte',
    pack: '1 mariage par pack',
    reseller: 'Illimité / multi-organisation',
  },
  {
    criterion: 'Prix indicatif',
    sub: '$0 – $199 / mois',
    pack: '$0,70 ou $0,50 / invité',
    reseller: '$0,50 / invité plat',
  },
  {
    criterion: 'Domaine perso',
    sub: 'Inclus (Premium & Élite)',
    pack: 'Non (option payante)',
    reseller: 'Inclus (white-label complet)',
  },
  {
    criterion: 'White-label',
    sub: 'Sur Élite uniquement',
    pack: 'Non',
    reseller: 'Sur Agence & Revendeur',
  },
  {
    criterion: 'Support',
    sub: 'Email → prioritaire → 24/7',
    pack: 'Email + WhatsApp',
    reseller: 'Account manager dédié',
  },
  {
    criterion: 'Engagement',
    sub: 'Sans engagement, annulable',
    pack: 'Achat unique, sans suite',
    reseller: 'Contrat partenaire',
  },
  {
    criterion: 'Idéal pour',
    sub: 'Mariage standard 20–500 invités',
    pack: 'Gros mariage 250+ invités',
    reseller: 'Plusieurs mariages à gérer',
    bestFit: true,
  },
] as const

// ══════════════════════════════════════════════════════════════════════════════
// DATA — DECISION SCENARIOS (3-card decision tree)
// ══════════════════════════════════════════════════════════════════════════════

interface DecisionScenario {
  id: string
  icon: LucideIcon
  question: string
  answer: string
}

const DECISION_SCENARIOS: readonly DecisionScenario[] = [
  {
    id: 'couple-small',
    icon: Heart,
    question:
      'Vous vous mariez, un seul mariage, moins de 250 invités ?',
    answer:
      '→ Abonnement Essentiel ($49) ou Premium ($99 si domaine perso voulu). Pack Standard si vous refusez l’abonnement.',
  },
  {
    id: 'couple-large',
    icon: Users,
    question:
      'Vous attendez plus de 250 invités et vous voulez payer à l’envoi ?',
    answer:
      '→ Pack Volume à $0,50/invité. 500 invités = $250. Meilleur tarif unique, sans engagement mensuel.',
  },
  {
    id: 'pro',
    icon: Building2,
    question:
      'Vous gérez plusieurs mariages, avez des clients ou revendez la plateforme ?',
    answer:
      '→ Offre Agence (recommandée), Revendeur ou Wedding Planner. Tarif plat $0,50/invité, multi-organisation, white-label.',
  },
] as const

// ══════════════════════════════════════════════════════════════════════════════
// DATA — FAQ
// ══════════════════════════════════════════════════════════════════════════════

interface FaqItem {
  question: string
  answer: string
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'Abonnement mensuel ou pack d’invitations — que choisir ?',
    answer:
      "L’abonnement Premium ($99/mois) est rentable si votre mariage court sur plusieurs mois (save the date, invitations, relances, post-mariage). Le pack d’invitations est idéal si vous voulez payer une seule fois, à l’envoi. Au-delà de 250 invités, le Pack Volume à $0,50/invité devient presque toujours plus économique qu’un abonnement.",
  },
  {
    question: 'Pourquoi le Pack Volume est-il moins cher à 251 qu’à 250 invités ?',
    answer:
      "Parce que le tarif est dégressif par paliers. À 250 invités × $0,70 = $175. À 251 invités × $0,50 = $125,50. Notre conseiller vous oriente automatiquement vers le tarif le plus avantageux lors de l’onboarding.",
  },
  {
    question: 'Puis-je passer d’un abonnement à un pack d’invitations plus tard ?',
    answer:
      "Oui. Vous pouvez commencer par un Essai Libre ou Essentiel, puis acheter un Pack Standard ou Volume au moment d’envoyer vos invitations. La transition est sans frais et sans perte de données.",
  },
  {
    question: 'L’offre revendeur est-elle ouverte aux particuliers ?',
    answer:
      "Non. Les offres Agence, Revendeur et Wedding Planner sont réservées aux professionnels (auto-entrepreneur, SARL, association ou tout acteur de l’événementiel). Une vérification de statut est effectuée à l’onboarding.",
  },
  {
    question: 'Quels moyens de paiement acceptez-vous en RDC ?',
    answer:
      "Mobile Money (M-Pesa, Airtel Money, Orange Money), virement bancaire et espèces (en agence). Pour les offres revendeur, facturation mensuelle ou par lot selon le volume.",
  },
] as const

// ══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function SectionDivider() {
  return (
    <div className="section-divider max-w-md mx-auto my-16 md:my-20">
      <span className="flourish text-sm">✦</span>
    </div>
  )
}

function SubBlockHeader({
  eyebrow,
  heading,
  subheading,
  headingClassName = 'font-serif text-xl sm:text-2xl md:text-3xl font-bold',
}: {
  eyebrow: string
  heading: React.ReactNode
  subheading: string
  headingClassName?: string
}) {
  return (
    <div className="text-center mb-10 md:mb-12 premium-card">
      <span className="font-display text-[11px] tracking-[0.3em] uppercase text-gold/70 font-semibold mb-2 block">
        {eyebrow}
      </span>
      <h3 className={`${headingClassName} mb-3 leading-tight`}>{heading}</h3>
      <p className="font-display text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        {subheading}
      </p>
    </div>
  )
}

function FloatingBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
      <span className="
        inline-flex items-center gap-1.5 px-3 py-1 rounded-full
        bg-gradient-to-r from-gold to-gold-dark text-white text-[10px]
        font-semibold tracking-wider uppercase whitespace-nowrap shadow-lg
      ">
        {children}
      </span>
    </div>
  )
}

function CardIcon({
  icon: Icon,
  isHighlighted,
}: {
  icon: LucideIcon
  isHighlighted: boolean
}) {
  return (
    <div
      className={`
        flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border
        ${isHighlighted ? 'bg-gold/20 border-gold/40' : 'bg-gold/10 border-gold/20'}
      `}
    >
      <Icon
        className={isHighlighted ? 'size-6 text-gold' : 'size-6 text-gold-dark dark:text-gold-light'}
        aria-hidden="true"
      />
    </div>
  )
}

function CtaLink({
  href,
  label,
  primary,
}: {
  href: string
  label: string
  primary: boolean
}) {
  return (
    <Link
      href={href}
      className={`
        inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full
        font-display text-sm font-semibold tracking-wide transition-all duration-300
        w-full
        ${primary
          ? 'bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white shadow-lg shadow-gold/30 hover:shadow-xl hover:shadow-gold/40 btn-premium'
          : 'glass-card gold-border text-foreground/90 hover:bg-gold/10'
        }
      `}
    >
      {label}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  )
}

function FeatureList({
  features,
  isHighlighted,
}: {
  features: readonly string[]
  isHighlighted: boolean
}) {
  return (
    <ul className="flex-1 space-y-3 mb-7" role="list">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2.5">
          <Check
            className={`flex-shrink-0 size-4 mt-0.5 ${isHighlighted ? 'text-gold' : 'text-gold/70'}`}
            aria-hidden="true"
          />
          <span className="font-display text-sm text-foreground/85 leading-relaxed">
            {feature}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  const Icon = plan.icon
  const isPopular = Boolean(plan.badge)
  return (
    <div
      className={`
        relative h-full flex flex-col p-6 md:p-8 rounded-2xl transition-all duration-300
        ${isPopular
          ? 'glass-card gold-border border-gold/50 lg:-translate-y-2 lg:scale-[1.02] lg:z-10 motion-safe:shadow-2xl motion-safe:shadow-gold/25'
          : 'glass-card border border-gold/10 hover:border-gold/30 hover:-translate-y-1 motion-safe:hover:shadow-xl motion-safe:hover:shadow-gold/10'
        }
      `}
    >
      {plan.badge ? (
        <FloatingBadge>
          <Sparkles className="size-3" aria-hidden="true" />
          {plan.badge}
        </FloatingBadge>
      ) : null}

      <div className="flex items-center gap-3 mb-5">
        <CardIcon icon={Icon} isHighlighted={isPopular} />
        <div className="min-w-0">
          <h4 className="font-serif text-xl font-bold text-foreground">{plan.name}</h4>
          <p className="font-display text-xs text-muted-foreground">{plan.tagline}</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif text-4xl md:text-5xl font-bold gold-gradient">
            {plan.priceLabel}
          </span>
          {plan.period ? (
            <span className="font-display text-sm text-muted-foreground">{plan.period}</span>
          ) : null}
        </div>
      </div>

      <FeatureList features={plan.features} isHighlighted={isPopular} />

      <CtaLink href={plan.ctaHref} label={plan.ctaLabel} primary={plan.ctaPrimary} />
    </div>
  )
}

function PackCard({ pack }: { pack: InvitationPack }) {
  const isHighlighted = Boolean(pack.badge)
  return (
    <div
      className={`
        relative h-full flex flex-col p-6 md:p-8 rounded-2xl transition-all duration-300
        ${isHighlighted
          ? 'glass-card gold-border border-gold/50 motion-safe:shadow-xl motion-safe:shadow-gold/15'
          : 'glass-card border border-gold/10 hover:border-gold/30 hover:-translate-y-1 motion-safe:hover:shadow-xl motion-safe:hover:shadow-gold/10'
        }
      `}
    >
      {pack.badge ? (
        <FloatingBadge>
          <Sparkles className="size-3" aria-hidden="true" />
          {pack.badge}
        </FloatingBadge>
      ) : null}

      <div className="text-center mb-6">
        <h4 className="font-serif text-2xl font-bold text-foreground">{pack.name}</h4>
        <p className="font-display text-xs text-muted-foreground mt-1">{pack.tagline}</p>
        <p className="font-display text-[11px] text-muted-foreground/80 mt-1">{pack.rangeLabel}</p>
      </div>

      <div className="text-center mb-6">
        <div className="font-serif text-4xl md:text-5xl font-bold gold-gradient">
          {pack.pricePerInviteLabel}
        </div>
      </div>

      {/* Examples row */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {pack.examples.map((ex) => (
          <div
            key={ex.count}
            className="text-center p-2 rounded-lg bg-gold/5 border border-gold/15"
          >
            <div className="font-display text-[10px] text-muted-foreground">
              {ex.count.toLocaleString('fr-FR')} inv.
            </div>
            <div className="font-serif text-sm font-bold gold-gradient mt-0.5">{ex.total}</div>
          </div>
        ))}
      </div>

      <FeatureList features={pack.features} isHighlighted={isHighlighted} />

      <CtaLink href={pack.ctaHref} label={pack.ctaLabel} primary={pack.ctaPrimary} />
    </div>
  )
}

function ResellerCard({ pkg }: { pkg: ResellerPackage }) {
  const Icon = pkg.icon
  const isHighlighted = Boolean(pkg.badge)
  return (
    <div
      className={`
        relative h-full flex flex-col p-6 md:p-8 rounded-2xl transition-all duration-300
        ${isHighlighted
          ? 'glass-card gold-border border-gold/50 lg:scale-[1.02] lg:z-10 motion-safe:shadow-xl motion-safe:shadow-gold/15'
          : 'glass-card border border-gold/10 hover:border-gold/30 hover:-translate-y-1 motion-safe:hover:shadow-xl motion-safe:hover:shadow-gold/10'
        }
      `}
    >
      {pkg.badge ? (
        <FloatingBadge>
          <Sparkles className="size-3" aria-hidden="true" />
          {pkg.badge}
        </FloatingBadge>
      ) : null}

      <div className="flex items-center gap-3 mb-5">
        <CardIcon icon={Icon} isHighlighted={isHighlighted} />
        <div className="min-w-0">
          <h4 className="font-serif text-xl font-bold text-foreground">{pkg.name}</h4>
          <p className="font-display text-xs text-muted-foreground">{pkg.audienceLabel}</p>
        </div>
      </div>

      <div className="text-center mb-6 p-3 rounded-xl bg-gold/5 border border-gold/20">
        <div className="font-serif text-2xl font-bold gold-gradient">
          {pkg.pricePerInviteLabel}
        </div>
      </div>

      <FeatureList features={pkg.features} isHighlighted={isHighlighted} />

      <CtaLink href={pkg.ctaHref} label={pkg.ctaLabel} primary={pkg.ctaPrimary} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DECISION HELPER COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function ComparisonTable({ rows }: { rows: readonly ComparisonRow[] }) {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="font-display text-[11px] tracking-wider text-muted-foreground/60 text-center mb-2 md:hidden">
        ← Faites défiler horizontalement →
      </p>
      <div className="overflow-x-auto rounded-2xl border border-gold/15 bg-card/40 backdrop-blur-sm">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b-2 border-gold/30 bg-gold/5">
              <th scope="col" className="p-3 text-left font-serif text-sm font-bold text-foreground">
                Critère
              </th>
              <th scope="col" className="p-3 text-left font-serif text-sm font-bold text-foreground">
                Abonnement
              </th>
              <th scope="col" className="p-3 text-left font-serif text-sm font-bold text-foreground">
                Pack d’invitations
              </th>
              <th scope="col" className="p-3 text-left font-serif text-sm font-bold text-foreground">
                Offre revendeur
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.criterion}
                className={
                  row.bestFit
                    ? 'bg-gold/5 border-t-2 border-gold/30'
                    : 'border-b border-gold/10'
                }
              >
                <th
                  scope="row"
                  className="p-3 text-left font-display text-xs font-semibold text-foreground/80 align-top"
                >
                  {row.criterion}
                </th>
                <td
                  className={`p-3 font-display text-sm align-top ${
                    row.bestFit ? 'gold-gradient font-semibold' : 'text-foreground/80'
                  }`}
                >
                  {row.sub}
                </td>
                <td
                  className={`p-3 font-display text-sm align-top ${
                    row.bestFit ? 'gold-gradient font-semibold' : 'text-foreground/80'
                  }`}
                >
                  {row.pack}
                </td>
                <td
                  className={`p-3 font-display text-sm align-top ${
                    row.bestFit ? 'gold-gradient font-semibold' : 'text-foreground/80'
                  }`}
                >
                  {row.reseller}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DecisionScenarioCard({ scenario }: { scenario: DecisionScenario }) {
  const Icon = scenario.icon
  return (
    <div className="glass-card border border-gold/10 p-6 rounded-2xl flex flex-col h-full">
      <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-4">
        <Icon className="size-6 text-gold" aria-hidden="true" />
      </div>
      <p className="font-display text-sm italic text-muted-foreground leading-relaxed">
        {scenario.question}
      </p>
      <p className="font-display text-sm text-foreground/90 leading-relaxed mt-3">
        <span className="gold-gradient font-semibold">→ </span>
        {scenario.answer.replace(/^→\s*/, '')}
      </p>
    </div>
  )
}

function FaqRow({ item }: { item: FaqItem }) {
  return (
    <div className="py-5">
      <dt className="font-serif text-base font-semibold text-foreground mb-2 flex gap-3">
        <span className="text-gold mt-1 shrink-0 font-display">Q.</span>
        <span>{item.question}</span>
      </dt>
      <dd className="font-display text-sm text-muted-foreground/90 leading-relaxed pl-7">
        {item.answer}
      </dd>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — PricingSection
// ══════════════════════════════════════════════════════════════════════════════

export default function PricingSection() {
  return (
    <section
      id="tarifs"
      aria-labelledby="tarifs-heading"
      className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-champagne/10 to-transparent"
    >
      <div className="max-w-7xl mx-auto">
        {/* ── Section intro header ────────────────────────────────────── */}
        <div className="text-center mb-16 md:mb-20 premium-card">
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Tarifs
          </span>
          <h2
            id="tarifs-heading"
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight"
          >
            <span className="text-foreground">Trois façons de</span>{' '}
            <span className="gold-gradient">financer votre mariage</span>
          </h2>
          <p className="font-display text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Abonnement mensuel, pack d’invitations à l’envoi ou offre revendeur —
            choisissez le modèle qui colle à votre projet. Tous les tarifs sont en USD.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            BLOCK A — SUBSCRIPTIONS (HERO)
            4 tiers: Essai Libre / Essentiel / Premium (popular) / Élite
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="tarifs-abonnements" aria-labelledby="tarifs-abonnements-heading" className="scroll-mt-20">
          <SubBlockHeader
            eyebrow="Abonnements mensuels"
            heading={
              <>
                <span className="text-foreground">Quatre formules pour</span>{' '}
                <span className="gold-gradient">votre mariage</span>
              </>
            }
            subheading="Abonnement mensuel, sans engagement. Annulable à tout moment. La formule Premium est plébiscitée par 8 couples sur 10 à Kinshasa."
            headingClassName="font-serif text-2xl sm:text-3xl md:text-4xl font-bold"
          />
          <h3 id="tarifs-abonnements-heading" className="sr-only">
            Abonnements mensuels
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 items-stretch">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>

        <SectionDivider />

        {/* ═══════════════════════════════════════════════════════════════════════
            BLOCK B — INVITATION PACKS
            2 tiers: Standard ($0.70/inv ≤250) / Volume ($0.50/inv >250)
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="tarifs-packs" aria-labelledby="tarifs-packs-heading" className="scroll-mt-20">
          <SubBlockHeader
            eyebrow="Packs d’invitations"
            heading={
              <>
                <span className="text-foreground">Payez à l’envoi,</span>{' '}
                <span className="gold-gradient">sans abonnement</span>
              </>
            }
            subheading="Une solution unique pour les mariages ponctuels. Achat one-shot, sans engagement mensuel."
          />
          <h3 id="tarifs-packs-heading" className="sr-only">
            Packs d’invitations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-stretch max-w-4xl mx-auto">
            {INVITATION_PACKS.map((pack) => (
              <PackCard key={pack.id} pack={pack} />
            ))}
          </div>

          {/* Inflection-point callout (250 → 251 edge case) */}
          <div className="mt-8 mx-auto max-w-2xl text-center font-display text-xs text-muted-foreground/80 bg-gold/5 border border-gold/15 rounded-xl px-4 py-3 italic flex items-start gap-2">
            <Info className="size-4 text-gold shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong className="not-italic text-foreground/90">
                À partir de 251 invités, le tarif baisse automatiquement.
              </strong>{' '}
              251 invités à $0,50 coûtent moins cher que 250 invités à $0,70.
              Notre conseiller /onboarding calcule le tarif le plus avantageux pour vous.
            </span>
          </div>
        </section>

        <SectionDivider />

        {/* ═══════════════════════════════════════════════════════════════════════
            BLOCK C — RESELLER PACKAGES
            3 packages: Agence (recommended) / Revendeur / Wedding Planner
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="tarifs-revendeurs" aria-labelledby="tarifs-revendeurs-heading" className="scroll-mt-20">
          <SubBlockHeader
            eyebrow="Offres revendeurs & professionnels"
            heading={
              <>
                <span className="text-foreground">Pour les agences, wedding planners</span>{' '}
                <span className="gold-gradient">et revendeurs</span>
              </>
            }
            subheading="Tarif plat à $0,50/invité, sans palier. Gérez plusieurs mariages sous un seul compte."
          />
          <h3 id="tarifs-revendeurs-heading" className="sr-only">
            Offres revendeurs
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {RESELLER_PACKAGES.map((pkg) => (
              <ResellerCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        </section>

        <SectionDivider />

        {/* ═══════════════════════════════════════════════════════════════════════
            BLOCK D — DECISION HELPER (comparison table + decision tree + FAQ)
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="tarifs-choisir" aria-labelledby="tarifs-choisir-heading" className="scroll-mt-20">
          <SubBlockHeader
            eyebrow="Comment choisir"
            heading={
              <>
                <span className="text-foreground">Abonnement, pack ou revendeur ?</span>{' '}
                <span className="gold-gradient">On vous guide.</span>
              </>
            }
            subheading="Un comparatif clair, trois scénarios typiques et les réponses aux questions les plus fréquentes."
          />
          <h3 id="tarifs-choisir-heading" className="sr-only">
            Comment choisir
          </h3>

          {/* D.1 — Comparison table */}
          <div className="mb-16">
            <h4 className="font-serif text-lg font-bold text-foreground text-center mb-6">
              Comparatif des trois modèles
            </h4>
            <ComparisonTable rows={COMPARISON_ROWS} />
          </div>

          {/* D.2 — Decision scenarios (3-card tree) */}
          <div className="mb-16">
            <h4 className="font-serif text-lg font-bold text-foreground text-center mb-6">
              Quelle offre choisir selon votre profil ?
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
              {DECISION_SCENARIOS.map((scenario) => (
                <DecisionScenarioCard key={scenario.id} scenario={scenario} />
              ))}
            </div>
          </div>

          {/* D.3 — FAQ */}
          <div>
            <h4 className="font-serif text-lg font-bold text-foreground text-center mb-6">
              Vous hésitez encore ?
            </h4>
            <dl className="mx-auto max-w-3xl divide-y divide-gold/10">
              {FAQ_ITEMS.map((item) => (
                <FaqRow key={item.question} item={item} />
              ))}
            </dl>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            FOOTNOTE — honest commercial model disclosure (USD-coherent)
        ═══════════════════════════════════════════════════════════════════════ */}
        <p className="text-center font-display text-xs text-muted-foreground/70 mt-12 italic max-w-xl mx-auto">
          Tous les abonnements incluent une page de mariage personnalisable,
          l’envoi d’invitations et le suivi RSVP. Packs d’invitations et offres
          revendeur facturés à l’invité envoyé. Paiement Mobile Money (M-Pesa,
          Airtel Money, Orange Money), virement bancaire ou espèces. Le tarif
          final est négocié avec votre conseiller selon votre projet.
        </p>
      </div>
    </section>
  )
}
