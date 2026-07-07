'use client'

import { motion } from 'framer-motion'
import { Rocket, Palette, SlidersHorizontal, Users, CalendarCheck, ShieldCheck } from 'lucide-react'

/**
 * HowItWorks — SECTION 7
 *
 * 6 steps, each backed by a real feature.
 */

const STEPS = [
  {
    n: '01',
    icon: Rocket,
    title: 'Créez votre événement',
    desc: 'Nom du couple, date, lieu, formule. La plateforme provisionne automatiquement l\'espace, le thème et les paramètres.',
  },
  {
    n: '02',
    icon: Palette,
    title: 'Choisissez une Collection',
    desc: '12 Collections Premium — Royal Gold, Nordic, Sunset, Kente... Chacune contrôle la structure visuelle, pas seulement les couleurs.',
  },
  {
    n: '03',
    icon: SlidersHorizontal,
    title: 'Personnalisez l\'expérience',
    desc: 'Activez, désactivez ou réordonnez les sections. Ajustez les couleurs et typographies. Prévisualisez avant de publier.',
  },
  {
    n: '04',
    icon: Users,
    title: 'Importez vos invités',
    desc: 'Ajout manuel ou import en masse (CSV, DOCX). Catégories, accompagnants, codes d\'invitation uniques par invité.',
  },
  {
    n: '05',
    icon: CalendarCheck,
    title: 'Organisez et publiez',
    desc: 'Plan de tables drag-and-drop, programme animé, galerie médias, lieu interactif. Publiez quand tout est prêt.',
  },
  {
    n: '06',
    icon: ShieldCheck,
    title: 'Gérez le jour J',
    desc: 'Check-in QR sécurisé (multi-tenant), suivi des accès, RSVP en temps réel, ops dashboard pour superviseurs.',
  },
]

export default function HowItWorks() {
  return (
    <section id="comment" className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Comment ça marche
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            <span className="text-foreground">Six étapes,</span>{' '}
            <span className="gold-gradient">de zéro à l'événement</span>
          </h2>
        </motion.div>

        <div className="space-y-4 md:space-y-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            const isEven = i % 2 === 0
            return (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, x: isEven ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`flex flex-col md:flex-row items-start gap-4 md:gap-6 p-6 md:p-8 rounded-2xl glass-card border border-gold/10 hover:border-gold/25 transition-all duration-300 ${
                  isEven ? '' : 'md:flex-row-reverse'
                }`}
              >
                <div className="flex-shrink-0 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
                    <Icon className="size-6 text-gold-dark dark:text-gold-light" />
                  </div>
                  <span className="font-serif text-3xl md:text-4xl font-bold text-gold/30">
                    {step.n}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl md:text-2xl font-bold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="font-display text-sm md:text-base text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
