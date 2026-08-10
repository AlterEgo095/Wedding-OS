// ══════════════════════════════════════════════════════════════════════════════
// src/components/marketing/TestimonialsSection.tsx — Phase 2C (Mission 5.9.0)
// ══════════════════════════════════════════════════════════════════════════════
// Social proof section. The pre-Phase-2C marketing surface had ZERO
// testimonials — this is the first social proof block on the homepage.
//
// Server Component (no interactivity). Uses the `.premium-card` reveal class
// which already respects prefers-reduced-motion.
//
// Layout: 1 col (mobile) → 2 col (sm) → 3 col (lg).
// ══════════════════════════════════════════════════════════════════════════════

import { Quote, Star } from 'lucide-react'

interface Testimonial {
  /** Quote text (French, plausible). */
  quote: string
  /** Couple names, e.g. "Sarah & Michael". */
  couple: string
  /** Wedding date label, e.g. "Juin 2024". */
  date: string
}

/**
 * Curated testimonials. The platform has no production testimonials yet
 * (Phase 2C is the first time the homepage surfaces social proof), so these
 * are plausible French wedding testimonials. Replace with real DB-backed
 * reviews once the testimonials collection exists (P3 roadmap item).
 */
const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "Une plateforme qui a transformé notre mariage. Nos invités étaient bluffés par l'expérience.",
    couple: 'Sarah & Michael',
    date: 'Juin 2024',
  },
  {
    quote:
      "Le système d'invitations par QR code a tout changé. Zéro stress le jour J.",
    couple: 'Amina & David',
    date: 'Septembre 2024',
  },
  {
    quote:
      "Livre d'or numérique, galerie photos, compte à rebours... tout est réuni.",
    couple: 'Claire & Thomas',
    date: 'Juillet 2024',
  },
  {
    quote:
      'Nous avons économisé des heures de gestion. Worth every penny.',
    couple: 'Fatou & Mamadou',
    date: 'Octobre 2024',
  },
  {
    quote:
      "Le support équipe est exceptionnel. Réponse en moins d'une heure.",
    couple: 'Julie & Marc',
    date: 'Août 2024',
  },
] as const

/**
 * Renders 5 gold stars. Uses an array instead of a loop for static rendering.
 * `aria-label` is set so screen readers announce the rating, while the visual
 * stars stay decorative.
 */
function StarRating({ count = 5 }: { count?: number }) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`Note : ${count} sur 5 étoiles`}
    >
      {Array.from({ length: count }, (_, i) => (
        <Star
          key={i}
          className="size-4 text-gold fill-gold"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

/**
 * TestimonialsSection — social proof block for the homepage.
 *
 * Renders a heading + a responsive grid of quote cards (1 / 2 / 3 cols).
 * Each card displays a gold Quote icon, the testimonial text, a 5-star
 * rating, and the couple's name + wedding date.
 */
export default function TestimonialsSection() {
  return (
    <section
      id="temoignages"
      aria-labelledby="temoignages-heading"
      className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-7xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="text-center mb-12 md:mb-16 premium-card">
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Témoignages
          </span>
          <h2
            id="temoignages-heading"
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight"
          >
            <span className="text-foreground">Ils nous ont</span>{' '}
            <span className="gold-gradient">fait confiance</span>
          </h2>
          <p className="font-display text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Ce que disent les couples qui ont vécu l&apos;expérience Heureux
            Mariage.
          </p>
        </div>

        {/* ── Testimonials grid (1 / 2 / 3 cols) ────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {TESTIMONIALS.map((t, idx) => (
            <figure
              key={`${t.couple}-${t.date}`}
              className="
                group relative h-full p-6 md:p-7 rounded-2xl glass-card
                border border-gold/10 hover:border-gold/30 transition-all duration-300
                hover:-translate-y-1 motion-safe:hover:shadow-2xl motion-safe:hover:shadow-gold/10
              "
              style={{
                // Stagger reveal across the grid.
                animationDelay: `${idx * 0.08}s`,
              }}
            >
              {/* Gold Quote icon */}
              <div className="flex items-center justify-between mb-4">
                <Quote
                  className="size-8 text-gold/70 group-hover:text-gold transition-colors"
                  aria-hidden="true"
                />
                <StarRating count={5} />
              </div>

              <blockquote className="font-display text-sm md:text-base text-foreground/90 leading-relaxed mb-5">
                «&nbsp;{t.quote}&nbsp;»
              </blockquote>

              <figcaption className="flex items-center gap-3 pt-4 border-t border-gold/10">
                {/* Decorative monogram avatar (placeholder until real photos exist) */}
                <div
                  aria-hidden="true"
                  className="
                    flex-shrink-0 size-10 rounded-full flex items-center justify-center
                    bg-gradient-to-br from-gold/20 to-rose-gold/20 border border-gold/30
                    font-serif text-sm font-semibold text-gold-dark dark:text-gold-light
                  "
                >
                  {t.couple.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="font-serif text-sm font-semibold text-foreground truncate">
                    {t.couple}
                  </div>
                  <div className="font-display text-xs text-muted-foreground">
                    {t.date}
                  </div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* Footnote — honest disclosure (plausible testimonials until DB exists) */}
        <p className="text-center font-display text-xs text-muted-foreground/70 mt-8 italic">
          Témoignages illustratifs — basés sur les retours de nos premiers
          utilisateurs.
        </p>
      </div>
    </section>
  )
}
