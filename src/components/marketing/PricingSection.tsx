// ══════════════════════════════════════════════════════════════════════════════
// src/components/marketing/PricingSection.tsx — Phase 2C (Mission 5.9.0)
// ══════════════════════════════════════════════════════════════════════════════
// Pricing section. Pre-Phase-2C homepage had NO pricing block — the only
// pricing disclosure was buried in /onboarding and the commercial CTA footer.
//
// Server Component (no interactivity). Uses the `.premium-card` reveal class
// which already respects prefers-reduced-motion.
//
// Layout: 1 col (mobile) → 3 col (lg). The middle plan (Pro) is highlighted
// with a gold border, slight elevation, and a "Le plus populaire" badge.
//
// Pricing note: the backend source of truth for plans is
// `@/lib/config/plans.ts` (PLANS: TRIAL, ESSENTIEL, PREMIUM, ELITE) — but the
// marketing 3-card structure (Starter / Pro / Studio) is intentionally
// simplified for the homepage funnel. Each card maps loosely to a backend plan
// but uses marketing-friendly copy. The /onboarding wizard surfaces the full
// PLANS breakdown for checkout.
// ══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Check, Crown, Rocket, Sparkles } from 'lucide-react'

interface PricingPlan {
  /** Internal id (used for React key + CTA target anchor). */
  id: 'starter' | 'pro' | 'studio'
  /** Plan name displayed at the top of the card. */
  name: string
  /** Short tagline under the name. */
  tagline: string
  /** Price label (e.g. "Gratuit", "49 €", "199 €"). */
  price: string
  /** Period suffix (e.g. "/ mois" or empty). */
  period?: string
  /** Optional badge text — when set, the card is highlighted as "popular". */
  badge?: string
  /** Lucide icon for the plan. */
  icon: LucideIcon
  /** Feature list with checkmarks. */
  features: readonly string[]
  /** CTA button label. */
  ctaLabel: string
  /** CTA href. */
  ctaHref: string
  /** Whether the CTA uses the primary gold style (true) or outline (false). */
  ctaPrimary: boolean
}

/**
 * The 3 marketing plans. Spec is exact (§20.4 Phase 2C): Starter (0€),
 * Pro (49€, popular), Studio (199€).
 */
const PLANS: readonly PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Pour les mariages intimes',
    price: 'Gratuit',
    icon: Sparkles,
    features: [
      '1 mariage',
      "Jusqu'à 50 invités",
      'Thème de base',
      'Invitations digitales',
      'Support email',
    ],
    ctaLabel: 'Commencer',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Pour la plupart des couples',
    price: '49 €',
    period: '/ mois',
    badge: 'Le plus populaire',
    icon: Rocket,
    features: [
      '1 mariage',
      "Jusqu'à 300 invités",
      'Tous les thèmes premium',
      'QR codes & check-in',
      'Livre d’or numérique',
      'Galerie photos illimitée',
      'Support prioritaire',
    ],
    ctaLabel: 'Choisir Pro',
    ctaHref: '/onboarding',
    ctaPrimary: true,
  },
  {
    id: 'studio',
    name: 'Studio',
    tagline: 'Pour les wedding planners',
    price: '199 €',
    period: '/ mois',
    icon: Crown,
    features: [
      'Mariages illimités',
      'Invités illimités',
      'Thèmes exclusifs + white-label',
      'Multi-organisation',
      'API & intégrations',
      'Account manager dédié',
      'Support 24/7',
    ],
    ctaLabel: 'Contacter les ventes',
    ctaHref: '/onboarding',
    ctaPrimary: false,
  },
] as const

/**
 * Renders a single plan card. The "popular" plan (Pro) gets a gold border,
 * elevated shadow, and a "Le plus populaire" badge floating above the card.
 */
function PlanCard({ plan }: { plan: PricingPlan }) {
  const Icon = plan.icon
  const isPopular = Boolean(plan.badge)

  return (
    <div
      className={`
        relative h-full flex flex-col p-6 md:p-8 rounded-2xl transition-all duration-300
        ${
          isPopular
            ? 'glass-card gold-border border-gold/50 lg:-translate-y-4 lg:scale-[1.03] motion-safe:shadow-2xl motion-safe:shadow-gold/20'
            : 'glass-card border border-gold/10 hover:border-gold/30 hover:-translate-y-1 motion-safe:hover:shadow-xl motion-safe:hover:shadow-gold/10'
        }
      `}
    >
      {/* "Le plus populaire" badge (only on highlighted plan) */}
      {plan.badge ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="
            inline-flex items-center gap-1.5 px-3 py-1 rounded-full
            bg-gradient-to-r from-gold to-gold-dark text-white text-[10px]
            font-semibold tracking-wider uppercase whitespace-nowrap shadow-lg
          ">
            <Sparkles className="size-3" aria-hidden="true" />
            {plan.badge}
          </span>
        </div>
      ) : null}

      {/* ── Plan header (icon + name + tagline) ─────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`
          flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border
          ${isPopular
            ? 'bg-gold/20 border-gold/40'
            : 'bg-gold/10 border-gold/20'}
        `}>
          <Icon
            className={isPopular ? 'size-6 text-gold' : 'size-6 text-gold-dark dark:text-gold-light'}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-bold text-foreground">{plan.name}</h3>
          <p className="font-display text-xs text-muted-foreground">{plan.tagline}</p>
        </div>
      </div>

      {/* ── Price ───────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif text-4xl md:text-5xl font-bold gold-gradient">
            {plan.price}
          </span>
          {plan.period ? (
            <span className="font-display text-sm text-muted-foreground">{plan.period}</span>
          ) : null}
        </div>
      </div>

      {/* ── Features list ───────────────────────────────────────────── */}
      <ul className="flex-1 space-y-3 mb-7" role="list">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check
              className={`
                flex-shrink-0 size-4 mt-0.5
                ${isPopular ? 'text-gold' : 'text-gold/70'}
              `}
              aria-hidden="true"
            />
            <span className="font-display text-sm text-foreground/85 leading-relaxed">
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <Link
        href={plan.ctaHref}
        className={`
          inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full
          font-display text-sm font-semibold tracking-wide transition-all duration-300
          w-full
          ${plan.ctaPrimary
            ? 'bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white shadow-lg shadow-gold/30 hover:shadow-xl hover:shadow-gold/40 btn-premium'
            : 'glass-card gold-border text-foreground/90 hover:bg-gold/10'
          }
        `}
      >
        {plan.ctaLabel}
      </Link>
    </div>
  )
}

/**
 * PricingSection — homepage pricing block.
 *
 * Renders a heading + a responsive 3-card grid (1 col mobile / 3 col desktop).
 * The middle plan (Pro) is highlighted as the most popular. Server Component.
 */
export default function PricingSection() {
  return (
    <section
      id="tarifs"
      aria-labelledby="tarifs-heading"
      className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-champagne/10 to-transparent"
    >
      <div className="max-w-7xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="text-center mb-12 md:mb-16 premium-card">
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Tarifs
          </span>
          <h2
            id="tarifs-heading"
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight"
          >
            <span className="text-foreground">Des offres adaptées</span>{' '}
            <span className="gold-gradient">à chaque mariage</span>
          </h2>
          <p className="font-display text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Choisissez le plan qui correspond à votre vision.
          </p>
        </div>

        {/* ── Plans grid (1 / 3 cols) ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-stretch">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* Footnote — honest commercial model disclosure */}
        <p className="text-center font-display text-xs text-muted-foreground/70 mt-8 italic max-w-xl mx-auto">
          Tous les plans incluent une page de mariage personnalisable,
          l&apos;envoi d&apos;invitations et le suivi RSVP. Tarification
          négociée selon votre projet — paiement mobile money, virement ou
          espèces.
        </p>
      </div>
    </section>
  )
}
