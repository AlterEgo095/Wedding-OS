'use client'

import { motion } from 'framer-motion'
import { Calendar, Palette, SlidersHorizontal, Users, LayoutGrid, Rocket, Activity } from 'lucide-react'

/**
 * ProductPromise — SECTION 2
 *
 * The real platform cycle. Each step maps to a real capability:
 *   CRÉER      → POST /api/platform/weddings (event creation)
 *   DESIGNER   → POST /api/collections/apply (Collection selection)
 *   PERSONNALISER → PUT /api/weddings/[id]/design (Designer draft)
 *   INVITER    → POST /api/guests + /api/weddings/[id]/invitations/bulk
 *   ORGANISER  → /api/tables + /api/timeline + /api/media
 *   PUBLIER    → POST /api/weddings/[id]/design (publish)
 *   EXPLOITER  → /api/check-in + /platform/ops
 */
const STEPS = [
  { icon: Calendar, title: 'Créer', desc: 'Lancez un événement en quelques secondes', color: 'from-amber-500/20 to-amber-600/10' },
  { icon: Palette, title: 'Designer', desc: 'Choisissez une Collection Premium', color: 'from-rose-500/20 to-rose-600/10' },
  { icon: SlidersHorizontal, title: 'Personnaliser', desc: 'Activez, réordonnez, adaptez les sections', color: 'from-violet-500/20 to-violet-600/10' },
  { icon: Users, title: 'Inviter', desc: 'Importez vos invités, générez QR et RSVP', color: 'from-sky-500/20 to-sky-600/10' },
  { icon: LayoutGrid, title: 'Organiser', desc: 'Tables, programme, médias, lieu', color: 'from-emerald-500/20 to-emerald-600/10' },
  { icon: Rocket, title: 'Publier', desc: 'Déployez une expérience unique', color: 'from-gold/30 to-amber-700/10' },
  { icon: Activity, title: 'Exploiter', desc: 'Check-in, suivi, analytics, ops', color: 'from-indigo-500/20 to-indigo-600/10' },
]

export default function ProductPromise() {
  return (
    <section id="plateforme" className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/50 to-background" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16 md:mb-24"
        >
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Le cycle complet
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            <span className="text-foreground">De l'idée à l'</span>
            <span className="gold-gradient">expérience vécue</span>
          </h2>
          <p className="font-display text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Sept étapes, un seul produit. Chaque phase est soutenue par une fonction réelle de la plateforme.
          </p>
        </motion.div>

        {/* Steps — horizontal scroll on mobile, grid on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 md:gap-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="relative group"
              >
                <div className={`relative h-full p-5 md:p-6 rounded-2xl glass-card border border-gold/10 hover:border-gold/30 transition-all duration-300 overflow-hidden`}>
                  {/* gradient backdrop */}
                  <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${step.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Icon className="size-5 text-gold-dark dark:text-gold-light" />
                    </div>
                    <div>
                      <div className="font-display text-[10px] tracking-[0.2em] uppercase text-gold/60 font-bold mb-1">
                        Étape {i + 1}
                      </div>
                      <h3 className="font-serif text-lg font-bold text-foreground mb-1">
                        {step.title}
                      </h3>
                      <p className="font-display text-xs text-muted-foreground leading-relaxed">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
