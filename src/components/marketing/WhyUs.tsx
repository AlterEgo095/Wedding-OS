// ══════════════════════════════════════════════════════════════════════════════
// src/components/marketing/WhyUs.tsx — Phase 2C (Mission 5.9.0)
// ══════════════════════════════════════════════════════════════════════════════
// 4 emotional pillars — moved from onboarding/page.tsx:497 to the marketing
// homepage so the "Pourquoi Heureux Mariage ?" pitch is visible to first-time
// visitors (not only those who already reached the onboarding wizard).
//
// Server Component (no client interactivity). Reveal animation uses the
// `.premium-card` CSS class which already respects prefers-reduced-motion.
//
// Layout: 1 col (mobile) → 2 col (sm) → 4 col (lg). Each card: icon + title +
// description, gold accent on hover.
// ══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from 'lucide-react'
import { Sparkles, Palette, UserCheck, HeartHandshake } from 'lucide-react'

interface Pillar {
  /** Lucide icon component. */
  icon: LucideIcon
  /** Short pillar title (e.g. "Simplicité radicale"). */
  title: string
  /** One-sentence emotional pitch. */
  description: string
}

/**
 * The 4 emotional pillars. Text mirrors the audit specification (§20.4 Phase 2C)
 * — distinct from the older onboarding WHY_US array which is product-feature
 * focused. These pillars answer WHY the platform exists, not WHAT it does.
 */
const PILLARS: readonly Pillar[] = [
  {
    icon: Sparkles,
    title: 'Simplicité radicale',
    description:
      "De l'invitation à la gestion des invités, tout est centralisé sur une seule plateforme.",
  },
  {
    icon: Palette,
    title: 'Élégance par défaut',
    description:
      'Des thèmes premium pensés par des designers, sans effort de configuration.',
  },
  {
    icon: UserCheck,
    title: 'Expérience invité',
    description:
      "Chaque invité vit une expérience personnalisée, du QR code à son espace privé.",
  },
  {
    icon: HeartHandshake,
    title: 'Sérénité totale',
    description:
      'Jour J, vous êtes présent à 100%. La technologie s’occupe du reste.',
  },
] as const

/**
 * WhyUs — homepage section "Pourquoi Heureux Mariage ?".
 *
 * Renders 4 emotional pillar cards in a responsive grid. Server Component
 * (no hooks, no event handlers) so it ships zero JS to the client.
 */
export default function WhyUs() {
  return (
    <section
      id="pourquoi"
      aria-labelledby="pourquoi-heading"
      className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-champagne/10 to-transparent"
    >
      <div className="max-w-7xl mx-auto">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="text-center mb-12 md:mb-16 premium-card">
          <div className="section-divider max-w-md mx-auto mb-6" aria-hidden="true">
            <span className="flourish text-sm">✦</span>
          </div>
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Notre promesse
          </span>
          <h2
            id="pourquoi-heading"
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient mb-4"
          >
            Pourquoi Heureux Mariage&nbsp;?
          </h2>
          <p className="font-display text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Une plateforme pensée pour les mariages en RDC et en Afrique
            francophone — élégante, simple et accessible.
          </p>
        </div>

        {/* ── Pillars grid (1 / 2 / 4 cols) ───────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {PILLARS.map((pillar, idx) => {
            const Icon = pillar.icon
            return (
              <div
                key={pillar.title}
                className="
                  group relative h-full p-6 rounded-2xl glass-card border border-gold/10
                  hover:border-gold/40 transition-all duration-300
                  hover:-translate-y-1 motion-safe:hover:shadow-2xl motion-safe:hover:shadow-gold/10
                "
                style={{
                  // Stagger the CSS reveal — 0ms / 80ms / 160ms / 240ms.
                  animationDelay: `${idx * 0.08}s`,
                }}
              >
                {/* Icon disc with gold accent */}
                <div className="flex justify-center mb-4">
                  <div className="
                    w-14 h-14 rounded-full bg-gradient-to-br from-gold/20 to-rose-gold/20
                    border border-gold/30 flex items-center justify-center
                    group-hover:scale-110 group-hover:bg-gold/25 transition-all duration-300
                  ">
                    <Icon className="size-6 text-gold" aria-hidden="true" />
                  </div>
                </div>

                <h3 className="font-serif text-lg font-semibold text-foreground text-center mb-2">
                  {pillar.title}
                </h3>
                <p className="font-display text-sm text-muted-foreground leading-relaxed text-center">
                  {pillar.description}
                </p>

                {/* Gold underline accent on hover */}
                <div
                  aria-hidden="true"
                  className="
                    mx-auto mt-4 h-px w-0 bg-gradient-to-r from-gold/0 via-gold to-gold/0
                    group-hover:w-12 transition-all duration-300
                  "
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
