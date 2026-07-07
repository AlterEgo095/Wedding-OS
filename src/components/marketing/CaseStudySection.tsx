'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, MapPin, Calendar, Users, Table2, Clock, Image as ImageIcon, CheckCircle2 } from 'lucide-react'

/**
 * CaseStudySection — SECTION 6
 *
 * Josué & Hornella are presented as the FIRST REALIZATION of the platform,
 * NOT as the platform itself. Shows only what is TRUE:
 *   - real couple identity (restored from historical backup)
 *   - real venue, date
 *   - real counts (guests, tables, stories, timeline, media)
 *
 * The CTA links to /w/josue-hornella (the live experience).
 */

interface CaseStudyData {
  slug: string
  coupleLabel: string
  brideName: string
  groomName: string
  weddingDate: Date | null
  venueName: string | null
  venueCity: string | null
  plan: string
  _count: {
    guests: number
    tables: number
    stories: number
    timeline: number
    media: number
    settings: number
  }
  settings: Record<string, string>
}

interface Props {
  caseStudy: CaseStudyData | null
}

function formatDate(date: Date | null): string {
  if (!date) return 'Date à confirmer'
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function CaseStudySection({ caseStudy }: Props) {
  if (!caseStudy) return null

  const stats = [
    { icon: Users, label: 'Invités', value: caseStudy._count.guests },
    { icon: Table2, label: 'Tables', value: caseStudy._count.tables },
    { icon: Clock, label: 'Étapes programme', value: caseStudy._count.timeline },
    { icon: ImageIcon, label: 'Médias', value: caseStudy._count.media },
  ]

  return (
    <section id="case-study" className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Cinematic backdrop */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.16_0.03_290)] via-background to-[oklch(0.14_0.04_30)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-12"
        >
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Étude de cas · Première réalisation
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            <span className="gold-gradient">{caseStudy.coupleLabel}</span>
          </h2>
          <p className="font-display text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            La première expérience événementielle complète déployée sur la plateforme.
            Une preuve vivante de ce que le moteur sait créer.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="grid lg:grid-cols-2 gap-8 items-center"
        >
          {/* Left: narrative */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="size-4 text-gold/70" />
                <span className="font-display text-xs tracking-wider uppercase text-muted-foreground">
                  Date
                </span>
              </div>
              <p className="font-serif text-lg text-foreground capitalize">
                {formatDate(caseStudy.weddingDate)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="size-4 text-gold/70" />
                <span className="font-display text-xs tracking-wider uppercase text-muted-foreground">
                  Lieu
                </span>
              </div>
              <p className="font-serif text-lg text-foreground">
                {caseStudy.venueName || 'Lieu à confirmer'}
                {caseStudy.venueCity ? `, ${caseStudy.venueCity}` : ''}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-gold/70" />
                <span className="font-display text-xs tracking-wider uppercase text-muted-foreground">
                  Formule
                </span>
              </div>
              <p className="font-serif text-lg text-foreground">
                Plan {caseStudy.plan}
              </p>
            </div>
            <div className="pt-4">
              <Link
                href={`/w/${caseStudy.slug}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white font-display tracking-wide text-sm font-semibold shadow-xl shadow-gold/30 hover:shadow-gold/50 transition-all duration-300 btn-premium"
              >
                Voir l'expérience
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          {/* Right: stats grid */}
          <div className="grid grid-cols-2 gap-4 p-6 rounded-2xl glass-card gold-border">
            {stats.map((stat, i) => {
              const Icon = stat.icon
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                  className="text-center p-4 rounded-xl bg-gold/5 border border-gold/10"
                >
                  <Icon className="size-6 mx-auto mb-2 text-gold-dark dark:text-gold-light" />
                  <div className="font-serif text-2xl sm:text-3xl font-bold gold-gradient mb-1">
                    {stat.value}
                  </div>
                  <div className="font-display text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                    {stat.label}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
